/**
 * Towers on their tiles, and the shots they throw.
 *
 * Projectiles live here rather than in a `projectiles.ts` of their own: a shot is the tower's, and a
 * fourth file for six lines is worse than the shared one (step 6C, decision 5).
 *
 * **Nothing in this file knows what is selected.** It exports the primitives -- a range ring, a
 * placement square -- and *who* is highlighted is the caller's business, because the callers are
 * `render/layers/overlay.ts` and the step 4 editor. `render/` reads core state and owns no UI
 * state (CLAUDE.md, the layering rule); `effects.ts` is the one exception and it holds animation,
 * not selection.
 */

import { TOWERS } from '@/core/content/towers.ts'
import { effectiveDefOf } from '@/core/content/index.ts'
import { isAura, isBait, isReveal } from '@/core/content/behaviours.ts'
import { chargeBehaviourOf, chargePhase, chargeStateOf } from '@/core/systems/charges.ts'
import { isBarricade } from '@/core/systems/barricades.ts'
import { hasEffect } from '@/core/tiles.ts'
import type { AuraBehaviour } from '@/core/content/behaviours.ts'
import type { TowerDef } from '@/core/content/index.ts'
import type { Tower, Vec2, World } from '@/core/types.ts'
import { blitGlyph, preload } from '@/render/glyphCache.ts'
import { stateGlyph } from '@/render/sprites.ts'
import { drawHpBar } from '@/render/hpBar.ts'
import {
	AURA_DAMAGE_CLEAR,
	AURA_DAMAGE_EDGE,
	AURA_DAMAGE_RIM,
	AURA_STATUS_CLEAR,
	AURA_STATUS_EDGE,
	AURA_STATUS_RIM,
	HONEY_EMPTY,
	HONEY_PUDDLE,
	HONEY_WARNING,
	PROJECTILE_SHOT,
	RANGE_INVALID,
	RANGE_INVALID_FILL,
	RANGE_NEUTRAL,
	RANGE_NEUTRAL_FILL,
	RANGE_VALID,
	RANGE_VALID_FILL,
	TILE_HEAT_CORE,
	TILE_HEAT_PULSE,
	TOWER_CRACK,
	TOWER_LIGHT_CORE,
	TOWER_LIGHT_EDGE,
	TOWER_PAD,
	TOWER_PAD_EDGE,
	TOWER_REARM_SWEEP,
	TOWER_REARM_TRACK,
	TOWER_TIER_BADGE,
	TOWER_TIER_GLOW,
	TOWER_TIER_RING,
} from '@/render/palette.ts'

/**
 * A tower is drawn larger than an enemy's 0.7 on purpose: at the same size a board of towers and
 * ants reads as one crowd. Furniture is big and still, traffic is small and moving.
 */
const TOWER_SCALE = 0.85

/** The plate under the glyph, as a fraction of the tile, and its corner radius in the same units. */
const PAD_SCALE = 0.84
const PAD_RADIUS_SCALE = 0.16

/** Radius of a grain, in tiles. Small enough that four of them read as a pinch and not as a bullet. */
const GRAIN_RADIUS_TILES = 0.055
/** How far the two trailing grains sit behind the leading one, in tiles. */
const GRAIN_TRAIL_TILES = 0.16

/**
 * A rearming tower, as a treatment over the one glyph rather than a second glyph on the def: there is
 * no flattened-mousetrap emoji, and a `glyphRearming` would be a field seven other towers leave empty
 * (step 10C, decision 1).
 *
 * The alpha is the dim half and the sweep is the loud half. Alpha alone is not enough at 3x speed
 * from across the room -- a dim glyph reads as a glyph -- so the sweep runs the whole way round the
 * pad edge in the brightest colour on it, and the moment it completes the tower snaps back to full.
 */
const REARM_GLYPH_ALPHA = 0.3
const REARM_RING_SCALE = 0.46
const REARM_LINE_WIDTH_PX = 3.5
/** Twelve o'clock, so a half-full sweep is unambiguously half and not "somewhere round the side". */
const REARM_START_RAD = -Math.PI / 2

/**
 * The three tier treatments, per step 12C's decision 6: a wash inside the pad at tier 1, a ring at
 * the pad edge at tier 2, a badge in the corner at tier 3 -- each one keeping the one before it, so
 * the answer is cumulative and a glance at a maxed tower finds three things and not one.
 *
 * None of them is a second glyph and none changes `preloadTowerGlyphs`, for step 10C's decision 1's
 * reason: the cache hands out an opaque bitmap at one size, and there is no upgraded-mousetrap emoji.
 */
const TIER_GLOW_INSET_SCALE = 0.72
const TIER_RING_SCALE = 0.48
const TIER_RING_LINE_WIDTH_PX = 2
/** In tiles, from the pad's top-right corner, and the badge's own radius in the same units. */
const TIER_BADGE_OFFSET = 0.33
const TIER_BADGE_RADIUS = 0.1

/**
 * The box's three damage states, off `hp / maxHp`. Drawn over the glyph for decision 1's reason, and
 * `[0.66, 0.33]` rather than thirds so the last state opens at a third and not at 33.3%.
 */
const BOX_DENTED_AT = 0.66
const BOX_COLLAPSING_AT = 0.33
/** Squashed about its own centre. Wider and shorter, the way a box goes when the sides give. */
const BOX_COLLAPSE_SCALE_X = 1.14
const BOX_COLLAPSE_SCALE_Y = 0.68
const CRACK_LINE_WIDTH_PX = 1.6

/**
 * Cracks in units of the tile, from the glyph's centre. A module constant and not a literal per
 * frame: `drawTowers` runs at 60Hz and this is four arrays that never change.
 *
 * The first two are the dented state; all four are the collapsing one.
 */
const BOX_CRACKS: readonly (readonly Vec2[])[] = [
	[
		{ x: -0.17, y: -0.21 },
		{ x: -0.05, y: -0.03 },
		{ x: -0.14, y: 0.09 },
		{ x: -0.02, y: 0.23 },
	],
	[
		{ x: 0.2, y: -0.17 },
		{ x: 0.08, y: -0.02 },
		{ x: 0.18, y: 0.13 },
	],
	[
		{ x: -0.24, y: 0.05 },
		{ x: -0.09, y: 0.12 },
		{ x: 0.07, y: 0.05 },
	],
	[
		{ x: 0.03, y: -0.26 },
		{ x: 0.07, y: -0.09 },
	],
]

/**
 * The Honey Pot's HP, drawn on the jar the way the box's is drawn on the box: the empty part of the jar
 * darkens from the top down, a puddle spreads under it once it is cracked, and below the last threshold
 * the pad pulses. The thresholds are the box's, so two towers whose HP is their state break at the
 * same points.
 *
 * The drained shade is clipped to a circle inside the glyph, so it darkens the jar and not the pad.
 */
const POT_JAR_RADIUS_TILES = 0.34
const POT_PUDDLE_RADIUS_TILES = 0.42
const POT_PUDDLE_SQUASH = 0.38
/** How far below the centre the puddle sits: at the jar's foot, not behind it. */
const POT_PUDDLE_DROP_TILES = 0.3
const POT_WARNING_RADIUS_TILES = 0.5
const POT_WARNING_MIN_WIDTH_PX = 1.5
const POT_WARNING_MAX_WIDTH_PX = 4
/** Radians per frame. ~1.7 pulses a second: urgent, not a strobe. */
const POT_WARNING_PER_FRAME = 0.18

/**
 * A tower standing on a heated cell: flame drawn **over** its pad and glyph, because the cell's own
 * heat ring is under both and the pad covers it (steps/17-auras-and-zones/D-on-screen-and-the-nights.md,
 * decision 3). An ember ring at the pad's edge and tongues licking up off its lower rim, both aged in
 * frames so 3x speed is not a strobe.
 */
const HEAT_RING_RADIUS_TILES = 0.44
const HEAT_RING_MIN_WIDTH_PX = 2
const HEAT_RING_MAX_WIDTH_PX = 4.5
const HEAT_TONGUES = 4
/** Across the lower rim, as a fraction of the pad from its centre, and how far down it sits. */
const HEAT_TONGUE_SPREAD_TILES = 0.3
const HEAT_TONGUE_BASE_TILES = 0.34
const HEAT_TONGUE_RADIUS_TILES = 0.075
const HEAT_TONGUE_HEIGHT = 2.1
/** Radians per frame of the flicker. The burn status's rate, so fire on an enemy and fire on a cell agree. */
const HEAT_FLICKER_PER_FRAME = 0.42

/** Ages with the display, never with the simulation, like `entities.ts` and `tileEffects.ts`. */
let ageFrames = 0

/** The tower bar is the enemy bar at the pad's width, so a box and an ant wear the same object. */
const TOWER_BAR_WIDTH_SCALE = 0.7

const RANGE_LINE_WIDTH_PX = 1.5
/** The placement square, inset so it reads as sitting inside the tile rather than on the grid line. */
const TILE_MARKER_INSET_PX = 2
const TILE_MARKER_LINE_WIDTH_PX = 2

/**
 * Which answer a ring or a square is carrying.
 *
 * Three states rather than the boolean step 6C's decision 4 first wrote down: a placed tower showing
 * its own reach is neither valid nor invalid, and a boolean can only say one of those two.
 */
export type PlacementTone = 'valid' | 'invalid' | 'neutral'

function strokeFor(tone: PlacementTone): string {
	if (tone === 'valid') {
		return RANGE_VALID
	}
	return tone === 'invalid' ? RANGE_INVALID : RANGE_NEUTRAL
}

function fillFor(tone: PlacementTone): string {
	if (tone === 'valid') {
		return RANGE_VALID_FILL
	}
	return tone === 'invalid' ? RANGE_INVALID_FILL : RANGE_NEUTRAL_FILL
}

/** The centre of a tile, in logical pixels. Integers name tiles; the `+ 0.5` is what centres them. */
function tileCenter(tile: Vec2, tilePx: number): Vec2 {
	return { x: (tile.x + 0.5) * tilePx, y: (tile.y + 0.5) * tilePx }
}

function drawPad(ctx: CanvasRenderingContext2D, center: Vec2, tilePx: number): void {
	const size = tilePx * PAD_SCALE
	const left = center.x - size / 2
	const top = center.y - size / 2

	ctx.beginPath()
	ctx.roundRect(left, top, size, size, tilePx * PAD_RADIUS_SCALE)
	ctx.fillStyle = TOWER_PAD
	ctx.fill()
	ctx.lineWidth = 1
	ctx.strokeStyle = TOWER_PAD_EDGE
	ctx.stroke()
}

/**
 * The rearm, as a ring round the pad that fills.
 *
 * The progress is read straight off the live counter -- `rearmTicksRemaining` against the def's
 * `rearmTicks` -- and not off a frame counter here, because it is the *simulation's* clock the player
 * is waiting on. That is the one thing in this file that legitimately moves with ticks: it is a
 * gauge, not an animation, so at 3x speed it is meant to fill three times as fast.
 */
function drawRearm(ctx: CanvasRenderingContext2D, tower: Tower, def: TowerDef, center: Vec2, tilePx: number): void {
	const state = chargeStateOf(tower)
	const behaviour = chargeBehaviourOf(def)
	if (state === null || behaviour === null || behaviour.rearmTicks <= 0) {
		return
	}

	const progress = Math.min(Math.max(1 - state.rearmTicksRemaining / behaviour.rearmTicks, 0), 1)
	const radius = tilePx * REARM_RING_SCALE

	ctx.lineWidth = REARM_LINE_WIDTH_PX
	ctx.strokeStyle = TOWER_REARM_TRACK
	ctx.beginPath()
	ctx.arc(center.x, center.y, radius, 0, Math.PI * 2)
	ctx.stroke()

	ctx.strokeStyle = TOWER_REARM_SWEEP
	ctx.beginPath()
	ctx.arc(center.x, center.y, radius, REARM_START_RAD, REARM_START_RAD + progress * Math.PI * 2)
	ctx.stroke()
}

/**
 * Tiers 1 and 2, drawn between the pad and the glyph so the tower still sits on top of its own
 * furniture.
 *
 * **No `globalAlpha` anywhere in here**, for step 10C's decision 2's reason: the rearm branch below
 * sets one and puts it back in the same breath, and an alpha left set by this function would fade
 * every tower later in `world.towers` -- the symptom being half the board dim, and which half
 * depending on the order they were built in.
 */
function drawTierMarks(ctx: CanvasRenderingContext2D, tier: number, center: Vec2, tilePx: number): void {
	if (tier >= 1) {
		const size = tilePx * TIER_GLOW_INSET_SCALE
		ctx.beginPath()
		ctx.roundRect(center.x - size / 2, center.y - size / 2, size, size, tilePx * PAD_RADIUS_SCALE)
		ctx.fillStyle = TOWER_TIER_GLOW
		ctx.fill()
	}

	if (tier >= 2) {
		ctx.beginPath()
		ctx.arc(center.x, center.y, tilePx * TIER_RING_SCALE, 0, Math.PI * 2)
		ctx.lineWidth = TIER_RING_LINE_WIDTH_PX
		ctx.strokeStyle = TOWER_TIER_RING
		ctx.stroke()
	}
}

/**
 * Tier 3's badge, drawn **after** the glyph and outside every transform.
 *
 * Two reasons it is not in `drawTierMarks` with the other two. Under the glyph a corner badge is
 * mostly hidden by it, and the acceptance this exists for is reading a maxed tower from across the
 * room. And a tier-3 Cardboard Box goes through `drawBox`, which wraps a `ctx.scale` around its own
 * blit -- a badge drawn inside that transform is squashed flat with the box it is labelling.
 */
function drawTierBadge(ctx: CanvasRenderingContext2D, tier: number, center: Vec2, tilePx: number): void {
	if (tier < 3) {
		return
	}

	ctx.beginPath()
	ctx.arc(
		center.x + TIER_BADGE_OFFSET * tilePx,
		center.y - TIER_BADGE_OFFSET * tilePx,
		TIER_BADGE_RADIUS * tilePx,
		0,
		Math.PI * 2,
	)
	ctx.fillStyle = TOWER_TIER_BADGE
	ctx.fill()
}

/** The cracks of one damage state, in the transform whoever called this has already set up. */
function drawCracks(ctx: CanvasRenderingContext2D, center: Vec2, tilePx: number, count: number): void {
	ctx.strokeStyle = TOWER_CRACK
	ctx.lineWidth = CRACK_LINE_WIDTH_PX
	ctx.beginPath()

	for (let i = 0; i < count; i++) {
		const crack = BOX_CRACKS[i]
		if (crack === undefined) {
			continue
		}
		for (let point = 0; point < crack.length; point++) {
			const at = crack[point]
			if (at === undefined) {
				continue
			}
			const x = center.x + at.x * tilePx
			const y = center.y + at.y * tilePx
			if (point === 0) {
				ctx.moveTo(x, y)
			} else {
				ctx.lineTo(x, y)
			}
		}
	}

	ctx.stroke()
}

/**
 * A barricade, in whichever of its three states its HP puts it in.
 *
 * The squash is a `ctx.scale` about the box's own centre, wrapped in `save`/`restore` -- without the
 * restore every tower drawn after it is squashed too, and the symptom is the whole counter going flat
 * the moment one box gets low.
 *
 * **A `damaged` sprite replaces the drawn cracks** from the first threshold on. The cracks are
 * placed for the emoji's outline and land on nothing in particular over drawn art, which carries its
 * own bite marks; the squash still marks the last state.
 */
function drawBox(
	ctx: CanvasRenderingContext2D,
	dpr: number,
	glyph: string,
	center: Vec2,
	tilePx: number,
	fraction: number,
): void {
	const size = tilePx * TOWER_SCALE

	if (fraction > BOX_DENTED_AT) {
		blitGlyph(ctx, dpr, glyph, size, center.x, center.y)
		return
	}

	const damaged = stateGlyph(glyph, 'damaged')
	const cracks = damaged === glyph

	if (fraction > BOX_COLLAPSING_AT) {
		blitGlyph(ctx, dpr, damaged, size, center.x, center.y)
		if (cracks) {
			drawCracks(ctx, center, tilePx, 2)
		}
		return
	}

	ctx.save()
	ctx.translate(center.x, center.y)
	ctx.scale(BOX_COLLAPSE_SCALE_X, BOX_COLLAPSE_SCALE_Y)
	ctx.translate(-center.x, -center.y)
	blitGlyph(ctx, dpr, damaged, size, center.x, center.y)
	if (cracks) {
		drawCracks(ctx, center, tilePx, BOX_CRACKS.length)
	}
	ctx.restore()
}

/** A bait tower: its HP is the honey, which is the whole of its risk. */
function isPot(def: TowerDef): boolean {
	return def.behaviours.some(isBait)
}

/**
 * A Honey Pot, in whichever state its HP puts it in -- `drawBox`'s shape, so the bar above it is the
 * second tell and not the only one. The shade is the honey going down; the puddle and cracks arrive at
 * the box's first threshold, and the pulse at its second, where a player who has not looked yet has
 * seconds left to.
 *
 * The clip is inside `save`/`restore` for `drawBox`'s reason: a clip left set hides every tower drawn
 * after this one.
 */
function drawPot(
	ctx: CanvasRenderingContext2D,
	dpr: number,
	glyph: string,
	center: Vec2,
	tilePx: number,
	fraction: number,
): void {
	const cracked = fraction <= BOX_DENTED_AT

	if (cracked) {
		// 40% of its size at the first crack and all of it at 0, so it visibly grows as the pot empties.
		const rx = POT_PUDDLE_RADIUS_TILES * tilePx * (1 - (fraction / BOX_DENTED_AT) * 0.6)
		ctx.beginPath()
		ctx.ellipse(center.x, center.y + POT_PUDDLE_DROP_TILES * tilePx, rx, rx * POT_PUDDLE_SQUASH, 0, 0, Math.PI * 2)
		ctx.fillStyle = HONEY_PUDDLE
		ctx.fill()
	}

	blitGlyph(ctx, dpr, glyph, tilePx * TOWER_SCALE, center.x, center.y)

	if (fraction < 1) {
		const jar = POT_JAR_RADIUS_TILES * tilePx
		ctx.save()
		ctx.beginPath()
		ctx.arc(center.x, center.y, jar, 0, Math.PI * 2)
		ctx.clip()
		ctx.fillStyle = HONEY_EMPTY
		ctx.fillRect(center.x - jar, center.y - jar, jar * 2, jar * 2 * (1 - Math.max(fraction, 0)))
		ctx.restore()
	}

	if (cracked) {
		drawCracks(ctx, center, tilePx, fraction > BOX_COLLAPSING_AT ? 2 : BOX_CRACKS.length)
	}

	if (fraction <= BOX_COLLAPSING_AT) {
		const pulse = 0.5 + 0.5 * Math.sin(ageFrames * POT_WARNING_PER_FRAME)
		ctx.beginPath()
		ctx.arc(center.x, center.y, POT_WARNING_RADIUS_TILES * tilePx, 0, Math.PI * 2)
		ctx.lineWidth = POT_WARNING_MIN_WIDTH_PX + (POT_WARNING_MAX_WIDTH_PX - POT_WARNING_MIN_WIDTH_PX) * pulse
		ctx.strokeStyle = HONEY_WARNING
		ctx.stroke()
	}
}

/**
 * The centres of every tower standing on a heated cell this frame, as flat `x, y` pairs. Kept and
 * truncated rather than rebuilt, so the 60Hz path allocates only when the board grows a Burner.
 */
const heated: number[] = []

/**
 * Flame over every tower on a heated cell: one ember ring stroke, then the tongues and their cores,
 * each batched across the board. In practice that is the Burners, plus whatever a tier-3 Burner's
 * radius reaches -- which is true, because that cell is burning too.
 *
 * The ring's width is one pulse shared by every Burner, the way `drawTileEffects` shares one heat
 * phase: a board of burners pulsing in step reads as one gas supply, and it keeps the stroke to one.
 */
function drawHeatFlames(ctx: CanvasRenderingContext2D, world: World, tilePx: number): void {
	heated.length = 0
	for (const tower of world.towers) {
		if (hasEffect(world, tower.tile, 'heat')) {
			const center = tileCenter(tower.tile, tilePx)
			heated.push(center.x, center.y)
		}
	}
	if (heated.length === 0) {
		return
	}

	const phase = ageFrames * HEAT_FLICKER_PER_FRAME
	const ring = HEAT_RING_RADIUS_TILES * tilePx
	ctx.lineWidth =
		HEAT_RING_MIN_WIDTH_PX +
		(HEAT_RING_MAX_WIDTH_PX - HEAT_RING_MIN_WIDTH_PX) * (0.5 + 0.5 * Math.sin(phase * 0.35))
	ctx.strokeStyle = TILE_HEAT_PULSE
	ctx.beginPath()
	for (let i = 0; i < heated.length; i += 2) {
		const x = heated[i] ?? 0
		const y = heated[i + 1] ?? 0
		ctx.moveTo(x + ring, y)
		ctx.arc(x, y, ring, 0, Math.PI * 2)
	}
	ctx.stroke()

	drawTongues(ctx, tilePx, phase, TILE_HEAT_PULSE, 1)
	drawTongues(ctx, tilePx, phase, TILE_HEAT_CORE, 0.55)
}

/** One batched fill of every tongue on every heated tower, at `scale` of the full size. */
function drawTongues(
	ctx: CanvasRenderingContext2D,
	tilePx: number,
	phase: number,
	colour: string,
	scale: number,
): void {
	const base = HEAT_TONGUE_BASE_TILES * tilePx
	const spread = HEAT_TONGUE_SPREAD_TILES * tilePx

	ctx.fillStyle = colour
	ctx.beginPath()
	for (let i = 0; i < heated.length; i += 2) {
		const x = heated[i] ?? 0
		const y = heated[i + 1] ?? 0
		for (let tongue = 0; tongue < HEAT_TONGUES; tongue++) {
			// Offset by tongue and by position, so neither the tongues nor two Burners flicker in lockstep.
			const flicker = 0.65 + 0.35 * Math.sin(phase + tongue * 1.9 + x * 0.07 + y * 0.05)
			const rx = HEAT_TONGUE_RADIUS_TILES * tilePx * scale * (0.8 + 0.2 * flicker)
			const ry = rx * HEAT_TONGUE_HEIGHT * flicker
			const tx = x - spread + ((spread * 2) / (HEAT_TONGUES - 1)) * tongue
			// Standing on the rim and rising off it: the ellipse's foot is on the rim, not its centre.
			const ty = y + base - ry
			ctx.moveTo(tx + rx, ty)
			ctx.ellipse(tx, ty, rx, ry, 0, 0, Math.PI * 2)
		}
	}
	ctx.fill()
}

/**
 * The pools of light, built once and kept.
 *
 * A `createRadialGradient` per lamp per frame is step 3B's acceptance broken at 60Hz, so each pool is
 * built at the **origin** and the context is translated onto the lamp before the fill -- a gradient
 * carries its own centre, so one anchored at a tower's pixels could not be reused by a second lamp
 * anyway.
 *
 * Keyed by `tilePx` **and** the behaviour's radius, not by `tilePx` alone: the radius is the other
 * half of the geometry, and step 17's Candle (aura radius 2) sharing a Nightlight's 4-tile pool is
 * one cache lookup away. Two entries on a board with both, and one on every board today.
 */
const lightPools = new Map<string, CanvasGradient>()

function lightPool(ctx: CanvasRenderingContext2D, tilePx: number, radiusTiles: number): CanvasGradient {
	const key = `${tilePx}|${radiusTiles}`
	const cached = lightPools.get(key)
	if (cached !== undefined) {
		return cached
	}

	const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radiusTiles * tilePx)
	gradient.addColorStop(0, TOWER_LIGHT_CORE)
	gradient.addColorStop(1, TOWER_LIGHT_EDGE)
	lightPools.set(key, gradient)
	return gradient
}

/**
 * Every lamp's pool, drawn before the first pad.
 *
 * A pass of its own rather than a line inside the tower loop: at the top of the pass the light falls
 * on the floor and the crumbs and under every tower, and inside the loop it would fall over whichever
 * towers happened to be earlier in `world.towers` and under the rest.
 */
function drawLightPools(ctx: CanvasRenderingContext2D, world: World, tilePx: number): void {
	for (const tower of world.towers) {
		for (const behaviour of effectiveDefOf(tower).behaviours) {
			if (!isReveal(behaviour)) {
				continue
			}
			const center = tileCenter(tower.tile, tilePx)
			const radius = behaviour.radiusTiles * tilePx
			ctx.save()
			ctx.translate(center.x, center.y)
			ctx.fillStyle = lightPool(ctx, tilePx, behaviour.radiusTiles)
			ctx.fillRect(-radius, -radius, radius * 2, radius * 2)
			ctx.restore()
		}
	}
}

/**
 * The two roles an aura is coloured by. What it does, not whose it is: a fifth aura tower is a config
 * object, and it should arrive already coloured.
 */
type AuraRole = 'damage' | 'status'

function auraRoleOf(behaviour: AuraBehaviour): AuraRole {
	return behaviour.damagePerTick > 0 ? 'damage' : 'status'
}

/**
 * The aura rims, built once and kept, by `lightPool`'s rule: at the origin, keyed by `tilePx`, radius
 * **and** role. A radius in the key and not the role would hand the Bay Leaf the Candle's ember.
 *
 * Clear to 55% of the radius, then rising to the rim colour at the edge. The clear stop is the role's
 * own colour at 0 alpha and not `transparent`: interpolating from transparent *black* greys the band.
 */
const auraRims = new Map<string, CanvasGradient>()

function auraRim(ctx: CanvasRenderingContext2D, tilePx: number, radiusTiles: number, role: AuraRole): CanvasGradient {
	const key = `${tilePx}|${radiusTiles}|${role}`
	const cached = auraRims.get(key)
	if (cached !== undefined) {
		return cached
	}

	const clear = role === 'damage' ? AURA_DAMAGE_CLEAR : AURA_STATUS_CLEAR
	const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radiusTiles * tilePx)
	gradient.addColorStop(0, clear)
	gradient.addColorStop(0.55, clear)
	gradient.addColorStop(1, role === 'damage' ? AURA_DAMAGE_RIM : AURA_STATUS_RIM)
	auraRims.set(key, gradient)
	return gradient
}

/**
 * Every aura's reach, after the lamp pools and before the first pad -- the pools' reason: it falls on
 * the floor and under every tower, not over whichever were earlier in `world.towers`.
 *
 * A rim, not a disc: see `AURA_DAMAGE_RIM`. Filled with an `arc` and never a `fillRect` -- a radial
 * gradient paints its last stop past its outer radius, so a rect would be a square of rim colour.
 */
function drawAuraRims(ctx: CanvasRenderingContext2D, world: World, tilePx: number): void {
	for (const tower of world.towers) {
		for (const behaviour of effectiveDefOf(tower).behaviours) {
			if (!isAura(behaviour)) {
				continue
			}
			const role = auraRoleOf(behaviour)
			const center = tileCenter(tower.tile, tilePx)
			const radius = behaviour.radiusTiles * tilePx
			ctx.save()
			ctx.translate(center.x, center.y)
			ctx.beginPath()
			ctx.arc(0, 0, radius, 0, Math.PI * 2)
			ctx.fillStyle = auraRim(ctx, tilePx, behaviour.radiusTiles, role)
			ctx.fill()
			ctx.lineWidth = 1
			ctx.strokeStyle = role === 'damage' ? AURA_DAMAGE_EDGE : AURA_STATUS_EDGE
			ctx.stroke()
			ctx.restore()
		}
	}
}

export function drawTowers(ctx: CanvasRenderingContext2D, world: World | null, tilePx: number, dpr: number): void {
	if (world === null) {
		return
	}

	ageFrames++
	drawLightPools(ctx, world, tilePx)
	drawAuraRims(ctx, world, tilePx)

	for (const tower of world.towers) {
		const def = effectiveDefOf(tower)
		const center = tileCenter(tower.tile, tilePx)
		drawPad(ctx, center, tilePx)
		drawTierMarks(ctx, tower.tier, center, tilePx)

		// `'spent'` never lasts a frame -- `retireSpentTowers` takes that tower off the board -- and
		// `'none'` is every tower without a magazine, so both take the plain path.
		if (chargePhase(tower) === 'rearming') {
			drawRearm(ctx, tower, def, center, tilePx)
			// Set around the blit and put back immediately: `blitGlyph` hands out an opaque bitmap and
			// cannot be tinted, and an alpha left set fades the projectiles, the theft animation and
			// the whole overlay drawn after this layer (step 10C, decision 2).
			ctx.globalAlpha = REARM_GLYPH_ALPHA
			blitGlyph(ctx, dpr, stateGlyph(def.glyph, 'sprung'), tilePx * TOWER_SCALE, center.x, center.y)
			ctx.globalAlpha = 1
		} else if (isBarricade(def)) {
			drawBox(ctx, dpr, def.glyph, center, tilePx, tower.hp / tower.maxHp)
		} else if (isPot(def)) {
			drawPot(ctx, dpr, def.glyph, center, tilePx, tower.hp / tower.maxHp)
		} else {
			blitGlyph(ctx, dpr, def.glyph, tilePx * TOWER_SCALE, center.x, center.y)
		}

		drawTierBadge(ctx, tower.tier, center, tilePx)

		// Above the pad, not above the glyph: the pad is the tower's footprint and the bar wants to
		// sit on a fixed edge, not on whatever the collapsing box is doing to its own height.
		drawHpBar(
			ctx,
			center.x,
			center.y - (tilePx * PAD_SCALE) / 2,
			tilePx * TOWER_BAR_WIDTH_SCALE,
			tower.hp,
			tower.maxHp,
		)
	}

	// After every tower, so a Burner's flame is never under a neighbour's pad.
	drawHeatFlames(ctx, world, tilePx)
}

/**
 * A shot as a pinch of grains rather than a dot with a trail: a trail is what a tracer round looks
 * like, and this is salt being thrown (step 6C acceptance).
 *
 * The two trailing grains are offset off the direction of travel, so they fall behind the leading
 * one wherever it is heading. `position` is already tile space, updated per tick by
 * `core/systems/projectiles.ts`.
 */
export function drawProjectiles(ctx: CanvasRenderingContext2D, world: World | null, tilePx: number): void {
	if (world === null || world.projectiles.length === 0) {
		return
	}

	const radius = GRAIN_RADIUS_TILES * tilePx
	ctx.fillStyle = PROJECTILE_SHOT

	for (const projectile of world.projectiles) {
		const x = (projectile.position.x + 0.5) * tilePx
		const y = (projectile.position.y + 0.5) * tilePx

		const dx = projectile.target.x - projectile.position.x
		const dy = projectile.target.y - projectile.position.y
		const length = Math.hypot(dx, dy)
		// A projectile sitting exactly on its target for one frame has no direction; the grains
		// stack, which is fine for the frame before it despawns.
		const backX = length === 0 ? 0 : (-dx / length) * GRAIN_TRAIL_TILES * tilePx
		const backY = length === 0 ? 0 : (-dy / length) * GRAIN_TRAIL_TILES * tilePx

		ctx.beginPath()
		ctx.arc(x, y, radius, 0, Math.PI * 2)
		ctx.arc(x + backX - backY * 0.4, y + backY + backX * 0.4, radius * 0.7, 0, Math.PI * 2)
		ctx.arc(x + backX * 1.6 + backY * 0.5, y + backY * 1.6 - backX * 0.5, radius * 0.55, 0, Math.PI * 2)
		ctx.fill()
	}
}

/**
 * The reach of a tower, centred on a tile. `radiusTiles` is the attack behaviour's `rangeTiles` and
 * the geometry matches `queryEnemiesInRange` exactly -- Euclidean, in tile space, from the tower's
 * own tile -- so the ring is the query and not an illustration of it.
 */
export function drawRangeCircle(
	ctx: CanvasRenderingContext2D,
	tilePx: number,
	centerTile: Vec2,
	radiusTiles: number,
	tone: PlacementTone,
): void {
	const center = tileCenter(centerTile, tilePx)

	ctx.beginPath()
	ctx.arc(center.x, center.y, radiusTiles * tilePx, 0, Math.PI * 2)
	ctx.fillStyle = fillFor(tone)
	ctx.fill()
	ctx.lineWidth = RANGE_LINE_WIDTH_PX
	ctx.strokeStyle = strokeFor(tone)
	ctx.stroke()
}

/**
 * The same reach, for a tower that sprays a wedge instead of covering a circle. Same fill, same
 * stroke and the same `PlacementTone`, so a cone and a circle read as one system.
 *
 * `facingRad` is `atan2(dy, dx)` -- the convention `samplePath` and `core/systems/hitbox.ts` both
 * follow -- and `halfAngleDeg` is the behaviour's own `coneHalfAngleDeg`, so the wedge spans twice
 * it. Who the tower is aiming at is the caller's business, exactly as the tone is.
 */
export function drawRangeCone(
	ctx: CanvasRenderingContext2D,
	tilePx: number,
	centerTile: Vec2,
	radiusTiles: number,
	halfAngleDeg: number,
	facingRad: number,
	tone: PlacementTone,
): void {
	const center = tileCenter(centerTile, tilePx)
	const halfAngleRad = (halfAngleDeg * Math.PI) / 180

	ctx.beginPath()
	ctx.moveTo(center.x, center.y)
	ctx.arc(center.x, center.y, radiusTiles * tilePx, facingRad - halfAngleRad, facingRad + halfAngleRad)
	ctx.closePath()
	ctx.fillStyle = fillFor(tone)
	ctx.fill()
	ctx.lineWidth = RANGE_LINE_WIDTH_PX
	ctx.strokeStyle = strokeFor(tone)
	ctx.stroke()
}

/**
 * The square under the cursor while a build is being aimed.
 *
 * It exists because two of the three towers in the roster have no attack behaviour and therefore no
 * ring -- without this, aiming a Toaster Crumb Tray would show no answer at all until the click.
 */
export function drawPlacementTile(
	ctx: CanvasRenderingContext2D,
	tilePx: number,
	tile: Vec2,
	tone: PlacementTone,
): void {
	const left = tile.x * tilePx + TILE_MARKER_INSET_PX
	const top = tile.y * tilePx + TILE_MARKER_INSET_PX
	const size = tilePx - TILE_MARKER_INSET_PX * 2

	ctx.beginPath()
	ctx.rect(left, top, size, size)
	ctx.fillStyle = fillFor(tone)
	ctx.fill()
	ctx.lineWidth = TILE_MARKER_LINE_WIDTH_PX
	ctx.strokeStyle = strokeFor(tone)
	ctx.stroke()
}

/**
 * Rasterises the roster at the one size this layer blits it at.
 *
 * The cache key includes `sizePx`, and `tilePx` is 0 until `Renderer.setMap` has run -- call this
 * after it, never before, or the cache fills with entries nothing ever reads and still pays for the
 * real ones on the first frame.
 */
export function preloadTowerGlyphs(tilePx: number): void {
	preload(TOWERS.map(def => ({ emoji: def.glyph, sizePx: tilePx * TOWER_SCALE })))
}

/** The size `drawTowers` blits at, for a caller drawing a ghost of a tower that is not placed yet. */
export function towerGlyphSize(tilePx: number): number {
	return tilePx * TOWER_SCALE
}
