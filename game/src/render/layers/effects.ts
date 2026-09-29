/**
 * Transient visuals: the item that just left the fridge, the flash and number on every hit, and the
 * puff a tower leaves when it is chewed through.
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
import { effectivenessOf } from '@/core/content/matrix.ts'
import { samplePath } from '@/core/path.ts'
import { towerById } from '@/core/systems/placement.ts'
import { enemyById, enemyPosition } from '@/core/systems/spatial.ts'
import type { Effectiveness } from '@/core/content/matrix.ts'
import type { EntityId, GameEvent, Vec2, World } from '@/core/types.ts'
import { blitGlyph } from '@/render/glyphCache.ts'
import { forgetCrumbPositions, lastCrumbPosition } from '@/render/layers/crumbs.ts'
import { foodGlyphSize, shelfSlot } from '@/render/layers/fridge.ts'
import {
	BURROW_DIRT,
	BURROW_SURFACE_RING,
	CRUMB_POP,
	CRUMB_VALUE,
	DAMAGE_NUMBER,
	DAMAGE_NUMBER_STRONG,
	DAMAGE_NUMBER_WEAK,
	GUST_STREAK,
	HIT_FLASH,
	THIEF_ESCAPE_POOF,
	TOWER_DEBRIS,
	WAKE_DESATURATE,
	WAKE_WASH,
} from '@/render/palette.ts'

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
	/**
	 * Banded at push time, off the event's multiplier. The colour is part of the glyph-cache key, so
	 * three bands is three times the number keys and nothing more.
	 */
	band: Effectiveness
	x: number
	y: number
	ageFrames: number
}

const NUMBER_COLOURS: Record<Effectiveness, string> = {
	weak: DAMAGE_NUMBER_WEAK,
	neutral: DAMAGE_NUMBER,
	strong: DAMAGE_NUMBER_STRONG,
}

const flashes: HitFlash[] = []
const numbers: DamageNumber[] = []

/**
 * Taking a pile, twice over: a ring that snaps outward where it was, and the value rising off it.
 *
 * **This is the reward for the most-repeated interaction in the game** (DECISIONS.md section 4 --
 * clicking is a tempo reward and never mandatory, so it has to be worth doing on its own). A click
 * and a tower's delivery are told apart by `crumbCollected.byTowerId`: the click is the player's own
 * action and gets the louder ring plus a burst of specks; a delivery is ambient and gets the ring.
 */
const POP_LIFE_FRAMES = 15
const POP_START_RADIUS_TILES = 0.1
const POP_END_RADIUS_TILES = 0.46
/** A click reaches further and draws thicker, which is the whole of the difference. */
const POP_STRONG_END_RADIUS_TILES = 0.78
const POP_LINE_WIDTH_PX = 2
const POP_STRONG_LINE_WIDTH_PX = 3.5

/** Specks flung out of a clicked pile: enough to read as a burst, few enough to stay one gesture. */
const POP_SPECKS = 6
const POP_SPECK_RADIUS_PX = 1.8
const POP_SPECK_REACH_TILES = 0.62

/** Longer than a damage number: this one is money, and it is the feedback the click is bought with. */
const CRUMB_VALUE_LIFE_FRAMES = 45
const CRUMB_VALUE_RISE_TILES = 1
const CRUMB_VALUE_SIZE_SCALE = 0.46
const CRUMB_VALUE_HOLD_FRAMES = 16

/**
 * At 3x speed a Cookie Jar can deliver several piles between two frames, and a rotting board hands
 * over a dozen at once. Same discipline as the damage numbers: a fixed cap, oldest dropped first.
 */
const MAX_POPS = 24
const MAX_CRUMB_VALUES = 20

interface CrumbPop {
	/** Tile space, the pile's last drawn position. */
	x: number
	y: number
	/** True for a click. See the block comment above. */
	strong: boolean
	ageFrames: number
}

interface CrumbValue {
	/** `+N`, from an integer -- see `pushEvents` and the key-space note on `getGlyph`. */
	text: string
	x: number
	y: number
	ageFrames: number
}

const pops: CrumbPop[] = []
const crumbValues: CrumbValue[] = []

/**
 * A tower coming apart: a ring off its tile and the pieces going outward.
 *
 * `towerDestroyed` is the only event `render/` has for it, and it has to be acknowledged -- a box that
 * vanishes between two frames with nothing where it stood reads as a rendering bug rather than as the
 * thing the last twenty seconds were about (step 10C, build item 3).
 *
 * Eight is a generous cap: v1 can destroy exactly one kind of tower, and a night that loses eight
 * boxes in half a second has lost anyway.
 */
const PUFF_LIFE_FRAMES = 26
const PUFF_START_RADIUS_TILES = 0.15
const PUFF_END_RADIUS_TILES = 0.85
const PUFF_LINE_WIDTH_PX = 3
const PUFF_PIECES = 7
const PUFF_PIECE_RADIUS_PX = 2.4
const PUFF_PIECE_REACH_TILES = 0.75
const MAX_PUFFS = 8

interface Puff {
	/** Tile space, from `towerDestroyed.tile`. */
	x: number
	y: number
	ageFrames: number
}

const puffs: Puff[] = []

/**
 * A Weevil going under or coming up: dirt thrown out of the hole either way, and on a surfacing a
 * bright ring as well (16C, decision 3). The ring is visual only -- there is no stun and no status,
 * because a pause at a Bay Leaf's edge would turn it into crowd control.
 *
 * Sixteen is the cap because a Cookie Jar lost in a Weevil-only wave buys twenty-odd of them, and at
 * 3x speed a frame can hand over several dives at once. Oldest dropped first, like everything here.
 */
const DIG_LIFE_FRAMES = 22
const DIG_PIECES = 6
const DIG_PIECE_RADIUS_PX = 2.2
const DIG_PIECE_REACH_TILES = 0.5
/** Dirt goes up before it comes down: the arc's peak height, in tiles. */
const DIG_PIECE_LOFT_TILES = 0.35
const SURFACE_LIFE_FRAMES = 20
const SURFACE_START_RADIUS_TILES = 0.2
const SURFACE_END_RADIUS_TILES = 0.95
const SURFACE_LINE_WIDTH_PX = 3.5
const MAX_DIGS = 16

interface Dig {
	/** Tile space, from the event's `at`. */
	x: number
	y: number
	/** True for `enemySurfaced`, which gets the ring. */
	surfaced: boolean
	ageFrames: number
}

const digs: Dig[] = []

/**
 * The light coming on: a warm wash over the whole board and the colour draining out from under it.
 *
 * **Animation, not simulation.** A wash driven off `world.noise` would be in every save and every
 * replay, and at 3x speed it would run three times as fast -- so it ages in frames here like
 * everything else in this file (step 13B, decision 2).
 *
 * One at a time: a second wake while the first is still fading restarts it rather than adding a
 * second pass, because two washes at once is just a brighter wash.
 */
const WAKE_LIFE_FRAMES = 96
/** Frames the wash takes to arrive. Someone hit a switch; it does not fade up. */
const WAKE_ATTACK_FRAMES = 7
/** Peak alpha of the warm fill. Unmistakable, and still short of hiding the board under it. */
const WAKE_WASH_PEAK = 0.3
/** Peak alpha of the desaturating pass. The board is visibly grey at the top of the wash. */
const WAKE_DESATURATE_PEAK = 0.8

let wakeAgeFrames: number | null = null

/**
 * A Fan's gust: streaks of air running outward along the facing and fading, never a filled wedge --
 * the filled wedge is the placement preview, and a gust that looked like it would read as a tower
 * permanently showing its range (step 18B, decision 1).
 *
 * The life is **under the 3x firing period**. A Fan fires every 40 ticks, which at 3x is ~13 frames; a
 * gust living longer than that never goes out and the wedge reads as solid. Twelve is for a row of
 * Fans, not for one -- the same lesson as 13B's ripples.
 */
const GUST_LIFE_FRAMES = 11
/** Fractions of the half-angle the streaks run along, so the gust spreads the width of the cone. */
const GUST_LANES = [-0.75, -0.35, 0.05, 0.45, 0.85] as const
/** How far out a streak starts, and its length, in tiles. The front reaches the range at the end. */
const GUST_START_TILES = 0.35
const GUST_STREAK_FRACTION = 0.35
const GUST_LINE_WIDTH_PX = 2
const MAX_GUSTS = 12

interface Gust {
	/** Tile space, the Fan's tile off the event: it may be sold by the time this is drawn. */
	x: number
	y: number
	facingRad: number
	rangeTiles: number
	halfAngleRad: number
	ageFrames: number
}

const gusts: Gust[] = []

/**
 * A shoved enemy, keyed by id: how far it was moved, and how long ago. `entities.ts` reads it through
 * `shoveOf` while it fills its pool, because that is the only place with the enemy's sampled position.
 *
 * **Aged here, whether or not the enemy still exists** (decision 2). An enemy killed mid-slide never
 * asks again, and a record that waited to be asked would sit in the map for the rest of the night.
 */
export const SHOVE_LIFE_FRAMES = 16

export interface Shove {
	tiles: number
	ageFrames: number
}

const shoves = new Map<EntityId, Shove>()

/**
 * A thief's take: each item off its own shelf slot and onto the Mouse, one after another (step 19C,
 * decision 2). The Mouse is standing still at the fridge while it grabs, so where it stood when the
 * event was pushed is where the flight lands, and `drawEffects` needs no world. From that frame on the
 * carry is `entities.ts`'s, drawn off `stolenItems`, so this only has to get the item there.
 *
 * Staggered so five items read as five items leaving. The cap is two Mice' worth.
 */
const TAKE_LIFE_FRAMES = 22
const TAKE_STAGGER_FRAMES = 5
/** Tiles the item arcs up on its way over, so it reads as lifted out and not slid across. */
const TAKE_LOFT_TILES = 0.7
const MAX_TAKES = 12

/**
 * The same journey backwards: off the floor where it lay and into its own shelf slot, where
 * `drawFridge` holds off drawing it until this lands (decision 7). From `foodReturned.from`, never
 * `droppedAt` -- that is null by the time the event is read.
 */
const RETURN_LIFE_FRAMES = 30
const RETURN_LOFT_TILES = 1.4
const MAX_RETURNS = 16

interface FoodFlight {
	foodId: EntityId
	glyph: string
	fromX: number
	fromY: number
	toX: number
	toY: number
	/** Counts up from `-delay`; the item sits still (and unseen) until it reaches 0. */
	ageFrames: number
}

const takes: FoodFlight[] = []
const returns: FoodFlight[] = []

/**
 * A thief out of the crack with what it carried: a cold puff where it left, and nothing flying home.
 * The items go with it (decision 7).
 *
 * The escape event names no lane and the thief is gone by the time it is read, so its lane is
 * remembered when it grabs -- the only thief worth a puff is one carrying something, and that one has
 * grabbed. Forgotten on its death or its escape, and on reset.
 */
const ESCAPE_LIFE_FRAMES = 30
const ESCAPE_START_RADIUS_TILES = 0.2
const ESCAPE_END_RADIUS_TILES = 1.1
const ESCAPE_LINE_WIDTH_PX = 3
const ESCAPE_WISPS = 8
const ESCAPE_WISP_RADIUS_PX = 3
const ESCAPE_WISP_REACH_TILES = 0.9
const MAX_ESCAPES = 4

interface Escape {
	x: number
	y: number
	ageFrames: number
}

const escapes: Escape[] = []
const thiefLanes = new Map<EntityId, string>()

/** True while a returned item is still in the air. `drawFridge` skips it until it lands. */
export function isFlyingHome(foodId: EntityId): boolean {
	for (const flight of returns) {
		if (flight.foodId === foodId) {
			return true
		}
	}
	return false
}

/** Oldest dropped first, like every list in this file. */
function capped<T>(list: T[], max: number): void {
	while (list.length > max) {
		list.shift()
	}
}

/** The shove still on screen for this enemy, or null. Read-only to the caller: this file ages it. */
export function shoveOf(enemyId: EntityId): Readonly<Shove> | null {
	return shoves.get(enemyId) ?? null
}

/**
 * One push onto the enemy's one record. Two Fans in step, or three ticks at 3x, hand over several in
 * one frame: they sum into one slide rather than starting two from two places. A push onto a slide
 * already fading keeps what is left of it, so the trail always starts where the glyph was last seen.
 */
function addShove(enemyId: EntityId, tiles: number): void {
	const existing = shoves.get(enemyId)
	if (existing === undefined) {
		shoves.set(enemyId, { tiles, ageFrames: 0 })
		return
	}
	existing.tiles = existing.tiles * (1 - existing.ageFrames / SHOVE_LIFE_FRAMES) + tiles
	existing.ageFrames = 0
}

/** Fast in, slow out: 0 to 1 over the attack, then eased back down across the rest of the life. */
function wakeEnvelope(ageFrames: number): number {
	if (ageFrames <= WAKE_ATTACK_FRAMES) {
		return ageFrames / WAKE_ATTACK_FRAMES
	}
	const t = (ageFrames - WAKE_ATTACK_FRAMES) / (WAKE_LIFE_FRAMES - WAKE_ATTACK_FRAMES)
	return (1 - t) * (1 - t)
}

/**
 * Where a collected pile was standing.
 *
 * `collectCrumb` splices the pile out before it pushes the event, so the world cannot answer this --
 * `crumbs.ts` remembers the last drawn position for exactly this call. A pile dropped and delivered
 * without ever being drawn (3x speed, a tower with a short trip) has no memory of it, and the tower
 * it went to is the honest fallback; a click always has one, because the player had to see the pile
 * to aim at it.
 */
function collectedAt(world: World, crumbId: EntityId, byTowerId: EntityId | null): Vec2 | null {
	const remembered = lastCrumbPosition(crumbId)
	if (remembered !== null) {
		return remembered
	}
	if (byTowerId === null) {
		return null
	}
	const tower = towerById(world, byTowerId)
	return tower === null ? null : { x: tower.tile.x, y: tower.tile.y }
}

/** An item's slot on the shelf and its glyph, looked up now: see `pushEvents` on why nothing is kept. */
function shelfItem(world: World, foodId: EntityId): { glyph: string; slot: Vec2 } | null {
	const index = world.night.food.findIndex(item => item.id === foodId)
	const item = world.night.food[index]
	if (item === undefined) {
		return null
	}
	return { glyph: getFoodDef(item.defId).glyph, slot: shelfSlot(world.map, index) }
}

function pushTakes(world: World, enemyId: EntityId, items: readonly EntityId[]): void {
	const thief = enemyById(world, enemyId)
	const at = thief === null ? null : enemyPosition(world, thief)
	if (thief !== null) {
		thiefLanes.set(enemyId, thief.pathId)
	}
	// A thief killed in the same batch as its grab has already dropped everything; the floor has it.
	const to = at ?? world.map.fridge.tile

	items.forEach((id, order) => {
		const found = shelfItem(world, id)
		if (found === null) {
			return
		}
		takes.push({
			foodId: id,
			glyph: found.glyph,
			fromX: found.slot.x,
			fromY: found.slot.y,
			toX: to.x,
			toY: to.y,
			ageFrames: -order * TAKE_STAGGER_FRAMES,
		})
	})
	capped(takes, MAX_TAKES)
}

function pushReturns(world: World, items: readonly EntityId[], from: Vec2): void {
	for (const id of items) {
		const found = shelfItem(world, id)
		if (found === null) {
			continue
		}
		returns.push({
			foodId: id,
			glyph: found.glyph,
			fromX: from.x,
			fromY: from.y,
			toX: found.slot.x,
			toY: found.slot.y,
			ageFrames: 0,
		})
	}
	capped(returns, MAX_RETURNS)
}

function pushEscape(world: World, enemyId: EntityId): void {
	const pathId = thiefLanes.get(enemyId)
	thiefLanes.delete(enemyId)
	const path = pathId === undefined ? undefined : world.map.paths.find(candidate => candidate.id === pathId)
	if (path === undefined) {
		return
	}
	const crack = samplePath(path, 0)
	escapes.push({ x: crack.x, y: crack.y, ageFrames: 0 })
	capped(escapes, MAX_ESCAPES)
}

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
				band: effectivenessOf(event.multiplier),
				x: event.at.x,
				y: event.at.y,
				ageFrames: 0,
			})
			if (numbers.length > MAX_NUMBERS) {
				numbers.shift()
			}
			continue
		}

		if (event.kind === 'crumbCollected') {
			const at = collectedAt(world, event.crumbId, event.byTowerId)
			if (at === null) {
				continue
			}

			pops.push({ x: at.x, y: at.y, strong: event.byTowerId === null, ageFrames: 0 })
			if (pops.length > MAX_POPS) {
				pops.shift()
			}

			// `+` plus an integer, and nothing else. `value` is already whole out of `core/` -- the
			// difficulty multiplier is applied and rounded at the drop -- so the key space is the
			// distinct pile values a night produces, which is what keeps `glyphCacheSize()` flat.
			crumbValues.push({
				text: `+${Math.round(event.value)}`,
				x: at.x,
				y: at.y,
				ageFrames: 0,
			})
			if (crumbValues.length > MAX_CRUMB_VALUES) {
				crumbValues.shift()
			}
			continue
		}

		if (event.kind === 'humanWoke') {
			wakeAgeFrames = 0
			continue
		}

		if (event.kind === 'towerDestroyed') {
			puffs.push({ x: event.tile.x, y: event.tile.y, ageFrames: 0 })
			if (puffs.length > MAX_PUFFS) {
				puffs.shift()
			}
			continue
		}

		// Only a tower carrying a `pushback` emits this, so no other cone ever gets a gust.
		if (event.kind === 'pushbackFired') {
			gusts.push({
				x: event.tile.x,
				y: event.tile.y,
				facingRad: event.facingRad,
				rangeTiles: event.rangeTiles,
				halfAngleRad: (event.halfAngleDeg * Math.PI) / 180,
				ageFrames: 0,
			})
			if (gusts.length > MAX_GUSTS) {
				gusts.shift()
			}
			continue
		}

		// `tiles` is what actually moved, after resistance and the clamp -- drawn as said, never re-derived.
		if (event.kind === 'enemyPushed') {
			addShove(event.enemyId, event.tiles)
			continue
		}

		if (event.kind === 'thiefGrabbed') {
			pushTakes(world, event.enemyId, event.items)
			continue
		}

		if (event.kind === 'foodReturned') {
			pushReturns(world, event.items, event.from)
			// The click gets the pop a clicked pile gets; a tower's fetch gets the quiet one.
			pops.push({ x: event.from.x, y: event.from.y, strong: event.byTowerId === null, ageFrames: 0 })
			capped(pops, MAX_POPS)
			continue
		}

		if (event.kind === 'thiefEscaped') {
			pushEscape(world, event.enemyId)
			continue
		}

		if (event.kind === 'enemyKilled') {
			thiefLanes.delete(event.enemyId)
			continue
		}

		if (event.kind === 'enemyBurrowed' || event.kind === 'enemySurfaced') {
			digs.push({ x: event.at.x, y: event.at.y, surfaced: event.kind === 'enemySurfaced', ageFrames: 0 })
			if (digs.length > MAX_DIGS) {
				digs.shift()
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
		blitGlyph(
			ctx,
			dpr,
			number.text,
			size,
			(number.x + 0.5) * tilePx,
			(y + 0.5) * tilePx,
			false,
			NUMBER_COLOURS[number.band],
		)

		numbers[liveNumbers] = number
		liveNumbers++
	}

	ctx.globalAlpha = 1
	numbers.length = liveNumbers
}

/**
 * The specks a clicked pile throws. Fixed angles off a per-pop offset, so a burst looks scattered
 * without a call into `Math.random` -- `render/` has no seeded rng and the world's belongs to the
 * simulation.
 */
function drawSpecks(ctx: CanvasRenderingContext2D, pop: CrumbPop, tilePx: number, t: number): void {
	const reach = POP_SPECK_REACH_TILES * tilePx * Math.sqrt(t)
	const x = (pop.x + 0.5) * tilePx
	const y = (pop.y + 0.5) * tilePx
	// Offset by the pile's own position so two pops in the same second do not fling identically.
	const phase = pop.x + pop.y

	ctx.beginPath()
	for (let i = 0; i < POP_SPECKS; i++) {
		const angle = phase + (i / POP_SPECKS) * Math.PI * 2
		const speckX = x + Math.cos(angle) * reach
		// Specks fall as they fly, so the burst reads as thrown crumbs and not as a starburst.
		const speckY = y + Math.sin(angle) * reach + POP_SPECK_REACH_TILES * tilePx * t * t * 0.5
		ctx.moveTo(speckX + POP_SPECK_RADIUS_PX, speckY)
		ctx.arc(speckX, speckY, POP_SPECK_RADIUS_PX, 0, Math.PI * 2)
	}
	ctx.fill()
}

/** The ring and the burst, then the value over them: the number is what is being read. */
function drawCrumbPops(ctx: CanvasRenderingContext2D, tilePx: number, dpr: number): void {
	let livePops = 0
	ctx.strokeStyle = CRUMB_POP
	ctx.fillStyle = CRUMB_POP

	for (const pop of pops) {
		pop.ageFrames++
		if (pop.ageFrames >= POP_LIFE_FRAMES) {
			continue
		}

		const t = pop.ageFrames / POP_LIFE_FRAMES
		const end = pop.strong ? POP_STRONG_END_RADIUS_TILES : POP_END_RADIUS_TILES
		// Eased out: the ring snaps away from the pile and then decelerates, which is what makes a
		// click read as a pop rather than as a growing circle.
		const eased = 1 - (1 - t) * (1 - t)
		const radius = POP_START_RADIUS_TILES + (end - POP_START_RADIUS_TILES) * eased

		ctx.globalAlpha = 1 - t
		ctx.lineWidth = pop.strong ? POP_STRONG_LINE_WIDTH_PX : POP_LINE_WIDTH_PX
		ctx.beginPath()
		ctx.arc((pop.x + 0.5) * tilePx, (pop.y + 0.5) * tilePx, radius * tilePx, 0, Math.PI * 2)
		ctx.stroke()

		if (pop.strong) {
			ctx.globalAlpha = (1 - t) * 0.8
			drawSpecks(ctx, pop, tilePx, eased)
		}

		pops[livePops] = pop
		livePops++
	}
	pops.length = livePops

	const size = tilePx * CRUMB_VALUE_SIZE_SCALE
	let liveValues = 0

	for (const value of crumbValues) {
		value.ageFrames++
		if (value.ageFrames >= CRUMB_VALUE_LIFE_FRAMES) {
			continue
		}

		const t = value.ageFrames / CRUMB_VALUE_LIFE_FRAMES
		const fadeFrames = CRUMB_VALUE_LIFE_FRAMES - CRUMB_VALUE_HOLD_FRAMES
		ctx.globalAlpha =
			value.ageFrames <= CRUMB_VALUE_HOLD_FRAMES
				? 1
				: 1 - (value.ageFrames - CRUMB_VALUE_HOLD_FRAMES) / fadeFrames
		const y = value.y - CRUMB_VALUE_RISE_TILES * (1 - (1 - t) * (1 - t))
		blitGlyph(ctx, dpr, value.text, size, (value.x + 0.5) * tilePx, (y + 0.5) * tilePx, false, CRUMB_VALUE)

		crumbValues[liveValues] = value
		liveValues++
	}

	ctx.globalAlpha = 1
	crumbValues.length = liveValues
}

/** The ring and the pieces of a destroyed tower. Same shape as `drawCrumbPops`, minus the number. */
function drawPuffs(ctx: CanvasRenderingContext2D, tilePx: number): void {
	let live = 0
	ctx.strokeStyle = TOWER_DEBRIS
	ctx.fillStyle = TOWER_DEBRIS
	ctx.lineWidth = PUFF_LINE_WIDTH_PX

	for (const puff of puffs) {
		puff.ageFrames++
		if (puff.ageFrames >= PUFF_LIFE_FRAMES) {
			continue
		}

		const t = puff.ageFrames / PUFF_LIFE_FRAMES
		const eased = 1 - (1 - t) * (1 - t)
		const x = (puff.x + 0.5) * tilePx
		const y = (puff.y + 0.5) * tilePx

		ctx.globalAlpha = 1 - t
		ctx.beginPath()
		const radius = PUFF_START_RADIUS_TILES + (PUFF_END_RADIUS_TILES - PUFF_START_RADIUS_TILES) * eased
		ctx.arc(x, y, radius * tilePx, 0, Math.PI * 2)
		ctx.stroke()

		// Fixed angles off the tile's own position, the way `drawSpecks` does it: `render/` has no
		// seeded rng and the world's belongs to the simulation.
		const phase = puff.x + puff.y
		const reach = PUFF_PIECE_REACH_TILES * tilePx * eased
		ctx.beginPath()
		for (let piece = 0; piece < PUFF_PIECES; piece++) {
			const angle = phase + (piece / PUFF_PIECES) * Math.PI * 2
			const pieceX = x + Math.cos(angle) * reach
			const pieceY = y + Math.sin(angle) * reach + PUFF_PIECE_REACH_TILES * tilePx * t * t * 0.6
			const size = PUFF_PIECE_RADIUS_PX * (1 - t * 0.4)
			ctx.moveTo(pieceX + size, pieceY)
			ctx.arc(pieceX, pieceY, size, 0, Math.PI * 2)
		}
		ctx.fill()

		puffs[live] = puff
		live++
	}

	ctx.globalAlpha = 1
	puffs.length = live
}

/**
 * The dirt and, for a surfacing, the ring. The ring first so the clods fly over it; each dig is its own
 * pair of paths, like a puff, because its alpha is its age.
 */
function drawDigs(ctx: CanvasRenderingContext2D, tilePx: number): void {
	let live = 0

	for (const dig of digs) {
		dig.ageFrames++
		if (dig.ageFrames >= DIG_LIFE_FRAMES) {
			continue
		}

		const x = (dig.x + 0.5) * tilePx
		const y = (dig.y + 0.5) * tilePx

		if (dig.surfaced && dig.ageFrames < SURFACE_LIFE_FRAMES) {
			const s = dig.ageFrames / SURFACE_LIFE_FRAMES
			const eased = 1 - (1 - s) * (1 - s)
			const radius = SURFACE_START_RADIUS_TILES + (SURFACE_END_RADIUS_TILES - SURFACE_START_RADIUS_TILES) * eased
			ctx.globalAlpha = 1 - s
			ctx.strokeStyle = BURROW_SURFACE_RING
			ctx.lineWidth = SURFACE_LINE_WIDTH_PX
			ctx.beginPath()
			ctx.arc(x, y, radius * tilePx, 0, Math.PI * 2)
			ctx.stroke()
		}

		// Thrown up and out of the hole, and falling back: a parabola over the life, with fixed angles
		// off the position the way `drawPuffs` scatters, since `render/` has no rng.
		const t = dig.ageFrames / DIG_LIFE_FRAMES
		const reach = DIG_PIECE_REACH_TILES * tilePx * Math.sqrt(t)
		const loft = DIG_PIECE_LOFT_TILES * tilePx * 4 * t * (1 - t)
		const phase = dig.x * 1.7 + dig.y
		ctx.globalAlpha = 1 - t * t
		ctx.fillStyle = BURROW_DIRT
		ctx.beginPath()
		for (let piece = 0; piece < DIG_PIECES; piece++) {
			const angle = phase + (piece / DIG_PIECES) * Math.PI * 2
			const pieceX = x + Math.cos(angle) * reach
			// Squashed vertically, so the spread reads as across the floor, and lifted by the loft.
			const pieceY = y + Math.sin(angle) * reach * 0.5 - loft
			const size = DIG_PIECE_RADIUS_PX * (1 - t * 0.3)
			ctx.moveTo(pieceX + size, pieceY)
			ctx.arc(pieceX, pieceY, size, 0, Math.PI * 2)
		}
		ctx.fill()

		digs[live] = dig
		live++
	}

	ctx.globalAlpha = 1
	digs.length = live
}

/**
 * Streaks running out from the Fan along its facing, eased so the air leaves fast and slows as it
 * thins. One path per gust, because its alpha is its age.
 */
function drawGusts(ctx: CanvasRenderingContext2D, tilePx: number): void {
	let live = 0
	ctx.strokeStyle = GUST_STREAK
	ctx.lineWidth = GUST_LINE_WIDTH_PX
	ctx.lineCap = 'round'

	for (const gust of gusts) {
		gust.ageFrames++
		if (gust.ageFrames >= GUST_LIFE_FRAMES) {
			continue
		}

		const t = gust.ageFrames / GUST_LIFE_FRAMES
		const eased = 1 - (1 - t) * (1 - t)
		const x = (gust.x + 0.5) * tilePx
		const y = (gust.y + 0.5) * tilePx
		const length = gust.rangeTiles * GUST_STREAK_FRACTION

		ctx.globalAlpha = 1 - t
		ctx.beginPath()
		for (let lane = 0; lane < GUST_LANES.length; lane++) {
			const angle = gust.facingRad + (GUST_LANES[lane] ?? 0) * gust.halfAngleRad
			// Alternate lanes lag a little, so the front is ragged air and not a row of spokes.
			const lag = lane % 2 === 0 ? 0 : 0.12
			const front = GUST_START_TILES + (gust.rangeTiles - GUST_START_TILES) * Math.max(0, eased - lag)
			const back = Math.max(GUST_START_TILES, front - length)
			const cos = Math.cos(angle) * tilePx
			const sin = Math.sin(angle) * tilePx
			ctx.moveTo(x + cos * back, y + sin * back)
			ctx.lineTo(x + cos * front, y + sin * front)
		}
		ctx.stroke()

		gusts[live] = gust
		live++
	}

	ctx.globalAlpha = 1
	ctx.lineCap = 'butt'
	gusts.length = live
}

/**
 * One list of food flights, aged and drawn: a straight line from one point to the other with a lift
 * over the middle, eased so it leaves quickly and settles. Full opacity the whole way -- this is the
 * item itself, not a trace of it, and it has to be the thing the eye follows.
 */
function drawFoodFlights(
	ctx: CanvasRenderingContext2D,
	list: FoodFlight[],
	lifeFrames: number,
	loftTiles: number,
	tilePx: number,
	dpr: number,
): void {
	const size = foodGlyphSize(tilePx)
	let live = 0

	for (const flight of list) {
		flight.ageFrames++
		if (flight.ageFrames >= lifeFrames) {
			continue
		}
		list[live] = flight
		live++
		if (flight.ageFrames < 0) {
			continue
		}

		const t = flight.ageFrames / lifeFrames
		const eased = 1 - (1 - t) * (1 - t)
		const x = flight.fromX + (flight.toX - flight.fromX) * eased
		const y = flight.fromY + (flight.toY - flight.fromY) * eased - loftTiles * 4 * eased * (1 - eased)
		blitGlyph(ctx, dpr, flight.glyph, size, (x + 0.5) * tilePx, (y + 0.5) * tilePx)
	}

	list.length = live
}

/** The puff at the crack: a ring and wisps going outward, the shape of `drawPuffs` in a colder colour. */
function drawEscapes(ctx: CanvasRenderingContext2D, tilePx: number): void {
	let live = 0
	ctx.strokeStyle = THIEF_ESCAPE_POOF
	ctx.fillStyle = THIEF_ESCAPE_POOF
	ctx.lineWidth = ESCAPE_LINE_WIDTH_PX

	for (const escape of escapes) {
		escape.ageFrames++
		if (escape.ageFrames >= ESCAPE_LIFE_FRAMES) {
			continue
		}

		const t = escape.ageFrames / ESCAPE_LIFE_FRAMES
		const eased = 1 - (1 - t) * (1 - t)
		const x = (escape.x + 0.5) * tilePx
		const y = (escape.y + 0.5) * tilePx

		ctx.globalAlpha = 1 - t
		ctx.beginPath()
		const radius = ESCAPE_START_RADIUS_TILES + (ESCAPE_END_RADIUS_TILES - ESCAPE_START_RADIUS_TILES) * eased
		ctx.arc(x, y, radius * tilePx, 0, Math.PI * 2)
		ctx.stroke()

		// Rising rather than falling, which is the one difference from a tower's debris: dust, not pieces.
		const reach = ESCAPE_WISP_REACH_TILES * tilePx * eased
		ctx.beginPath()
		for (let wisp = 0; wisp < ESCAPE_WISPS; wisp++) {
			const angle = escape.x + escape.y + (wisp / ESCAPE_WISPS) * Math.PI * 2
			const wispX = x + Math.cos(angle) * reach
			const wispY = y + Math.sin(angle) * reach * 0.6 - ESCAPE_WISP_REACH_TILES * tilePx * t * 0.5
			const size = ESCAPE_WISP_RADIUS_PX * (1 - t * 0.5)
			ctx.moveTo(wispX + size, wispY)
			ctx.arc(wispX, wispY, size, 0, Math.PI * 2)
		}
		ctx.fill()

		escapes[live] = escape
		live++
	}

	ctx.globalAlpha = 1
	escapes.length = live
}

/** Ages every shove, and drops the spent ones whether or not their enemy is still on the board. */
function ageShoves(): void {
	for (const [id, shove] of shoves) {
		shove.ageFrames++
		if (shove.ageFrames >= SHOVE_LIFE_FRAMES) {
			shoves.delete(id)
		}
	}
}

/** Called from `drawFrame` at the particles slot of the draw order. Ages one frame per call. */
export function drawEffects(ctx: CanvasRenderingContext2D, tilePx: number, dpr: number): void {
	ageShoves()
	drawGusts(ctx, tilePx)

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

	drawFoodFlights(ctx, takes, TAKE_LIFE_FRAMES, TAKE_LOFT_TILES, tilePx, dpr)
	drawFoodFlights(ctx, returns, RETURN_LIFE_FRAMES, RETURN_LOFT_TILES, tilePx, dpr)
	drawEscapes(ctx, tilePx)
	drawPuffs(ctx, tilePx)
	drawDigs(ctx, tilePx)
	drawHits(ctx, tilePx, dpr)
	drawCrumbPops(ctx, tilePx, dpr)
}

/**
 * The wake wash, drawn **after `drawOverlay`** and from its own call in `drawFrame` rather than from
 * inside `drawEffects`.
 *
 * `drawEffects` runs at the particles slot and the overlay is drawn over it; a wash the placement
 * ghost sits on top of is a wash that does not read as the room (step 13B, decision 3). Ages one
 * frame per call, like every other pass in this file.
 *
 * `width` and `height` are the logical canvas rather than `tilePx`, because both passes fill the
 * whole board. They are parameters and not an import of `renderer.ts`: that module imports this one
 * through `layers/index.ts`, and naming it here would close the cycle.
 *
 * **`'saturation'` is sticky and composites against the entire canvas.** Left set, the next frame's
 * first draw composites into the last one, and the board turns progressively and irreversibly grey
 * over about ten seconds -- which reads exactly like a memory leak. Both passes are therefore bracketed
 * by a save and a restore of the composite op and the alpha, the way `drawHits` already restores
 * `globalAlpha`.
 */
export function drawWake(ctx: CanvasRenderingContext2D, width: number, height: number): void {
	if (wakeAgeFrames === null) {
		return
	}

	wakeAgeFrames++
	if (wakeAgeFrames >= WAKE_LIFE_FRAMES) {
		wakeAgeFrames = null
		return
	}

	const strength = wakeEnvelope(wakeAgeFrames)
	const previousOperation = ctx.globalCompositeOperation
	const previousAlpha = ctx.globalAlpha

	// The colour goes first, so the warm pass lands on a board that has already lost it.
	ctx.globalCompositeOperation = 'saturation'
	ctx.globalAlpha = strength * WAKE_DESATURATE_PEAK
	ctx.fillStyle = WAKE_DESATURATE
	ctx.fillRect(0, 0, width, height)

	ctx.globalCompositeOperation = 'source-over'
	ctx.globalAlpha = strength * WAKE_WASH_PEAK
	ctx.fillStyle = WAKE_WASH
	ctx.fillRect(0, 0, width, height)

	ctx.globalAlpha = previousAlpha
	ctx.globalCompositeOperation = previousOperation
}

/** Called on restart. Without it, items keep flying out of the night before and the first pop of the new one lands on last night's floor. */
export function resetEffects(): void {
	flights.length = 0
	nextDrift = 1
	flashes.length = 0
	numbers.length = 0
	pops.length = 0
	crumbValues.length = 0
	puffs.length = 0
	// Without this a retry opens with last night's dirt still settling.
	digs.length = 0
	gusts.length = 0
	// Enemy ids restart with the world, so a stale shove would land on a new night's enemy.
	shoves.clear()
	// Without these a retry opens with last night's pizza flying home, and last night's Mouse's lane
	// waiting for a new night's enemy with the same id.
	takes.length = 0
	returns.length = 0
	escapes.length = 0
	thiefLanes.clear()
	// Without this a retry opens with last night's light still on.
	wakeAgeFrames = null
	forgetCrumbPositions()
}
