/**
 * Transient visuals: the item that just left the fridge, and the flash and number on every hit.
 *
 * **This is the one layer with state, and it is deliberately not simulation state.** A flying glyph
 * is not part of the world -- putting it there would write animation frames into every replay and
 * every save -- so it lives here as module-local data, fed only from drained events and aged in
 * *frames*, not ticks. `render/` reads core state and never writes it, and this file is the reason
 * that sentence needs saying twice.
 *
 * `pushEvents` is the seam `GameView.vue` touches; `drawEffects` is called from inside
 * `Renderer.drawFrame`, which is the only place that has `tilePx` and `dpr`. Events must be pushed
 * **before** the frame is drawn, or every theft shows up one frame late.
 */

import { getFoodDef } from '@/core/content/index.ts'
import type { GameEvent, World } from '@/core/types.ts'
import { blitGlyph } from '@/render/glyphCache.ts'
import { foodGlyphSize, shelfSlot } from '@/render/layers/fridge.ts'
import { DAMAGE_NUMBER, HIT_FLASH } from '@/render/palette.ts'

/** ~0.6s at 60fps. Frames, because this ages with the display and not with the simulation. */
const LIFE_FRAMES = 36
/** Tiles the item drifts sideways over its life, so two thefts from one slot are not one glyph. */
const DRIFT_TILES = 0.9
/** Tiles above the top edge the item is gone by, so it leaves rather than fading in place. */
const EXIT_MARGIN_TILES = 1.5
/**
 * A 40-item leak in one tick is possible and must not stall a frame. Oldest first: the newest theft
 * is the one the player is looking for.
 */
const MAX_FLIGHTS = 24

interface Flight {
	glyph: string
	/** Tile-space, the slot the item was sitting in when it was taken. */
	fromX: number
	fromY: number
	/** -1 or 1. Alternates, so a burst fans out instead of stacking. */
	drift: number
	ageFrames: number
}

const flights: Flight[] = []
let nextDrift = 1

/**
 * A hit, twice over: a ring that expands and thins, and the resolved damage as a number that rises
 * off it.
 *
 * The ring is at the **hit position** and not a tint on the enemy. `blitGlyph` blits a
 * pre-rasterised bitmap and cannot tint one, and -- the real reason -- the hit that killed the enemy
 * has no glyph left to tint: `entities.ts` will not draw it next frame (step 6C, decision 7).
 */
const FLASH_LIFE_FRAMES = 11
const FLASH_START_RADIUS_TILES = 0.1
const FLASH_END_RADIUS_TILES = 0.42
const FLASH_LINE_WIDTH_PX = 2.5

/** ~0.65s. Long enough to read on a busy board, short enough that four towers do not paper it over. */
const NUMBER_LIFE_FRAMES = 39
/** Tiles the number rises over its life. */
const NUMBER_RISE_TILES = 0.85
/** Tiles above the hit it starts, so it clears the enemy's health bar rather than sitting on it. */
const NUMBER_OFFSET_TILES = 0.3
const NUMBER_SIZE_SCALE = 0.42
/** Frames of the life spent at full opacity before the fade starts. */
const NUMBER_HOLD_FRAMES = 12

/**
 * At 3x speed three ticks run between two frames, so `pushEvents` is handed three ticks' worth of
 * `enemyDamaged` at once -- forty towers firing into a wave is a realistic burst. Oldest dropped
 * first, the same as `flights`: the newest hit is the one being looked at.
 */
const MAX_FLASHES = 48
const MAX_NUMBERS = 32

interface HitFlash {
	/** Tile space, from `enemyDamaged.at`. */
	x: number
	y: number
	ageFrames: number
}

interface DamageNumber {
	/** Already rounded, and rounded before it became a glyph key -- see `pushEvents`. */
	text: string
	x: number
	y: number
	ageFrames: number
}

const flashes: HitFlash[] = []
const numbers: DamageNumber[] = []

/**
 * Turns this frame's `enemyLeaked` and `enemyDamaged` events into flying glyphs, rings and numbers.
 *
 * A stolen item is looked up **now**, not held onto: 5B marks an item `lost` and never splices it,
 * so it is still in `night.food` at the moment the event arrives, and a renderer that kept a
 * reference to world state across frames would be pinning a dead entity.
 */
export function pushEvents(events: readonly GameEvent[], world: World): void {
	for (const event of events) {
		if (event.kind === 'enemyDamaged') {
			flashes.push({ x: event.at.x, y: event.at.y, ageFrames: 0 })
			if (flashes.length > MAX_FLASHES) {
				flashes.shift()
			}

			// Rounded here, not at draw time. It is both what the player should read and what keeps
			// the glyph cache's key space finite: an unrounded 5.000000001 is a fresh entry per hit,
			// and the symptom is memory climbing all night with nothing else wrong (decision 8).
			numbers.push({
				text: String(Math.round(event.amount)),
				x: event.at.x,
				y: event.at.y,
				ageFrames: 0,
			})
			if (numbers.length > MAX_NUMBERS) {
				numbers.shift()
			}
			continue
		}

		if (event.kind !== 'enemyLeaked') {
			continue
		}

		for (const id of event.stolenItems) {
			const index = world.night.food.findIndex(item => item.id === id)
			const item = world.night.food[index]
			if (item === undefined) {
				continue
			}

			const at = shelfSlot(world.map, index)
			flights.push({
				glyph: getFoodDef(item.defId).glyph,
				fromX: at.x,
				fromY: at.y,
				drift: nextDrift,
				ageFrames: 0,
			})
			nextDrift = -nextDrift

			if (flights.length > MAX_FLIGHTS) {
				flights.shift()
			}
		}
	}
}

/** Rings first, numbers over them: the number is the thing being read, so nothing draws on top of it. */
function drawHits(ctx: CanvasRenderingContext2D, tilePx: number, dpr: number): void {
	let liveFlashes = 0
	ctx.lineWidth = FLASH_LINE_WIDTH_PX
	ctx.strokeStyle = HIT_FLASH

	for (const flash of flashes) {
		flash.ageFrames++
		if (flash.ageFrames >= FLASH_LIFE_FRAMES) {
			continue
		}

		const t = flash.ageFrames / FLASH_LIFE_FRAMES
		const radius = FLASH_START_RADIUS_TILES + (FLASH_END_RADIUS_TILES - FLASH_START_RADIUS_TILES) * t
		ctx.globalAlpha = 1 - t
		ctx.beginPath()
		ctx.arc((flash.x + 0.5) * tilePx, (flash.y + 0.5) * tilePx, radius * tilePx, 0, Math.PI * 2)
		ctx.stroke()

		flashes[liveFlashes] = flash
		liveFlashes++
	}
	flashes.length = liveFlashes

	const size = tilePx * NUMBER_SIZE_SCALE
	let liveNumbers = 0

	for (const number of numbers) {
		number.ageFrames++
		if (number.ageFrames >= NUMBER_LIFE_FRAMES) {
			continue
		}

		const t = number.ageFrames / NUMBER_LIFE_FRAMES
		const fadeFrames = NUMBER_LIFE_FRAMES - NUMBER_HOLD_FRAMES
		ctx.globalAlpha =
			number.ageFrames <= NUMBER_HOLD_FRAMES ? 1 : 1 - (number.ageFrames - NUMBER_HOLD_FRAMES) / fadeFrames
		// Eased, so it leaves the hit quickly and then hangs where it can be read.
		const y = number.y - NUMBER_OFFSET_TILES - NUMBER_RISE_TILES * (1 - (1 - t) * (1 - t))
		blitGlyph(ctx, dpr, number.text, size, (number.x + 0.5) * tilePx, (y + 0.5) * tilePx, false, DAMAGE_NUMBER)

		numbers[liveNumbers] = number
		liveNumbers++
	}

	ctx.globalAlpha = 1
	numbers.length = liveNumbers
}

/** Called from `drawFrame` at the particles slot of the draw order. Ages one frame per call. */
export function drawEffects(ctx: CanvasRenderingContext2D, tilePx: number, dpr: number): void {
	const size = foodGlyphSize(tilePx)
	let live = 0

	for (const flight of flights) {
		flight.ageFrames++
		if (flight.ageFrames >= LIFE_FRAMES) {
			continue
		}

		const t = flight.ageFrames / LIFE_FRAMES
		const rise = flight.fromY + EXIT_MARGIN_TILES
		const x = flight.fromX + flight.drift * DRIFT_TILES * t
		// Eased so it leaves fast and slows as it fades, which reads as thrown rather than dragged.
		const y = flight.fromY - rise * (1 - (1 - t) * (1 - t))

		ctx.globalAlpha = 1 - t * t
		blitGlyph(ctx, dpr, flight.glyph, size, (x + 0.5) * tilePx, (y + 0.5) * tilePx)

		flights[live] = flight
		live++
	}

	ctx.globalAlpha = 1
	flights.length = live

	drawHits(ctx, tilePx, dpr)
}

/** Called on restart. Without it, items keep flying out of the night before. */
export function resetEffects(): void {
	flights.length = 0
	nextDrift = 1
	flashes.length = 0
	numbers.length = 0
}
