/**
 * Transient visuals: today, the item that just left the fridge, arcing off the top of the board.
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
 * Turns this frame's `enemyLeaked` events into flying glyphs.
 *
 * The item is looked up **now**, not held onto: 5B marks an item `lost` and never splices it, so it
 * is still in `night.food` at the moment the event arrives, and a renderer that kept a reference to
 * world state across frames would be pinning a dead entity.
 */
export function pushEvents(events: readonly GameEvent[], world: World): void {
	for (const event of events) {
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
}

/** Called on restart. Without it, items keep flying out of the night before. */
export function resetEffects(): void {
	flights.length = 0
	nextDrift = 1
}
