/**
 * What the floor is carrying: scorch marks, mold, slime trails, heat and residue.
 *
 * **The second layer in `render/` with module state, and it is there for the same reason as the
 * first.** The heat pulse and the residue breath are aged in a frame counter, exactly like
 * `render/layers/effects.ts` -- read that file's header, because this one is the reason the rule
 * needs saying twice. Not `world.tick`: a speed multiplier runs more ticks per frame and never
 * scales `dt`, so a phase driven off the tick beats three times as fast at 3x as it does at 1x
 * (step 13B, decision 2). No reset export goes with it, unlike `resetEffects` -- a free-running
 * phase carries nothing from one night into the next.
 *
 * **Nothing here is baked.** Mold and scorch are permanent, which makes them look like terrain, but
 * both of them appear *during* a night and the bake is keyed by `(map, dpr)` and redraws the whole
 * board at device resolution. Caching them means invalidating it every time mold spreads, which
 * fires step 3B's "bakes exactly once per map load" several times a night to save a few dozen fills.
 *
 * Every treatment is flat fills and strokes. No `createRadialGradient` per cell per frame -- see
 * `CRUMB_ROT_HALO` in `render/palette.ts` for why the rot halo is two flat stops: ~300 cells is the
 * budgeted worst case (ARCHITECTURE.md section 6) and that allocation would be on the 60Hz path.
 *
 * A cell draws at `x * tilePx`, with **no `+ 0.5`**. The half-tile offset belongs to things
 * positioned at tile *centres* -- entities, waypoints, the flash rings in `effects.ts`. A cell is
 * the square itself, and half a tile out looks almost right until mold sits next to the tower
 * standing on it.
 */

import { TILE_EFFECT_DEFS } from '@/core/content/tileEffects.ts'
import type { TileEffect, TileEffectKind, World } from '@/core/types.ts'
import {
	TILE_HEAT_CORE,
	TILE_HEAT_PULSE,
	TILE_MOLD_PATCH,
	TILE_MOLD_SPECK,
	TILE_RESIDUE_MIST,
	TILE_SCORCH_STAIN,
	TILE_SLIME_GLOSS,
	TILE_SLIME_SHEEN,
} from '@/render/palette.ts'

/**
 * Fixed, and not `state.effects` order: a stack has to read the same way every time. The marks in
 * the floor first, then the wet and the hot over them, then the mist on top.
 */
const DRAW_ORDER: readonly TileEffectKind[] = ['scorch', 'mold', 'slime', 'heat', 'residue']

/** Overlapping blobs, so the stain has an edge the grid does not. */
const SCORCH_BLOBS = 3
const SCORCH_MIN_RADIUS_TILES = 0.17
const SCORCH_MAX_RADIUS_TILES = 0.33

/**
 * Mold by stage, 1 to 3, indexed by `magnitude - 1`.
 *
 * The three have to be tellable apart from across the board, so all three of radius, opacity and
 * speckle count move together -- one of them alone is a difference you have to lean in for, and step
 * 15's entire lesson is "you could have dealt with this two stages ago".
 *
 * Stage 3 is wider than half a tile on purpose: patches on neighbouring cells then overlap, and a
 * corner of the kitchen that has gone over reads as one mass rather than as a grid of discs.
 */
const MOLD_RADIUS_TILES = [0.3, 0.42, 0.54] as const
const MOLD_ALPHA = [0.55, 0.8, 1] as const
const MOLD_SPECKS = [4, 8, 13] as const
const MOLD_SPECK_RADIUS_TILES = 0.035
/** Tiles the patch centre wanders, so a run of them is not a row of concentric circles. */
const MOLD_JITTER_TILES = 0.07

const SLIME_RADIUS_X_TILES = 0.46
const SLIME_RADIUS_Y_TILES = 0.38
const SLIME_GLOSS_RADIUS_X_TILES = 0.15
const SLIME_GLOSS_RADIUS_Y_TILES = 0.075
const SLIME_GLOSS_OFFSET_TILES = 0.13
/**
 * The last third of the def's duration is the fade. A trail that simply blinks out reads as a bug;
 * one that thins for a second and a half says "this is about to stop helping you".
 */
const SLIME_FADE_FRACTION = 0.33

/** ~0.8s a ring takes to travel out. Frames, not ticks -- see the header. */
const HEAT_PULSE_FRAMES = 48
const HEAT_RING_MIN_RADIUS_TILES = 0.16
const HEAT_RING_MAX_RADIUS_TILES = 0.48
const HEAT_RING_WIDTH_PX = 2.5
/** Always drawn at full strength, so a heated cell is never invisible at the faint end of the pulse. */
const HEAT_CORE_RADIUS_TILES = 0.13

/** ~2.4s a breath. Slow: mist that flickers reads as a fault rather than as air. */
const RESIDUE_BREATH_FRAMES = 144
const RESIDUE_MIN_ALPHA = 0.6

/** Ages the pulse and the breath. See the header for why this is frames and not `world.tick`. */
let frameCounter = 0

/**
 * A stable number in `[0, 1)` for a cell and a purpose.
 *
 * Positional rather than sequential, so a cell's blotches stay where they are whatever else is on
 * the board that frame -- a scorch mark that reshuffles itself as its neighbours come and go reads
 * as static. Not `world.rng`: this is `render/`, and none of it is simulation state.
 */
function hash01(x: number, y: number, salt: number): number {
	let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(salt, 2246822519)
	h = Math.imul(h ^ (h >>> 13), 1274126177)
	return ((h ^ (h >>> 16)) >>> 0) / 0x100000000
}

/** `Array.find` with no closure: this runs five times per cell per frame at the budgeted 300 cells. */
function effectOf(effects: readonly TileEffect[], kind: TileEffectKind): TileEffect | null {
	for (let index = 0; index < effects.length; index++) {
		const effect = effects[index]
		if (effect !== undefined && effect.kind === kind) {
			return effect
		}
	}
	return null
}

/**
 * An irregular dark stain, drawn as one path so the overlapping blobs are one shape rather than
 * three visibly stacked alphas.
 */
function drawScorch(ctx: CanvasRenderingContext2D, tileX: number, tileY: number, tilePx: number): void {
	const left = tileX * tilePx
	const top = tileY * tilePx

	ctx.beginPath()
	for (let blob = 0; blob < SCORCH_BLOBS; blob++) {
		const centreX = left + (0.25 + hash01(tileX, tileY, blob * 3 + 1) * 0.5) * tilePx
		const centreY = top + (0.25 + hash01(tileX, tileY, blob * 3 + 2) * 0.5) * tilePx
		const spread = SCORCH_MAX_RADIUS_TILES - SCORCH_MIN_RADIUS_TILES
		const radius = (SCORCH_MIN_RADIUS_TILES + hash01(tileX, tileY, blob * 3 + 3) * spread) * tilePx

		// Without the `moveTo`, consecutive arcs in one path are joined by a straight line.
		ctx.moveTo(centreX + radius, centreY)
		ctx.arc(centreX, centreY, radius, 0, Math.PI * 2)
	}
	ctx.fillStyle = TILE_SCORCH_STAIN
	ctx.fill()
}

/**
 * A fuzzy patch that grows with the stage.
 *
 * The fuzz is speckles at a scale the tile grid does not share, which is the lesson `TILE_MOTTLE`
 * records: anything that varies per *tile* draws the tile boundaries in, and a board of outlined
 * squares is what you get.
 */
function drawMold(
	ctx: CanvasRenderingContext2D,
	tileX: number,
	tileY: number,
	tilePx: number,
	magnitude: number,
): void {
	const stage = Math.min(Math.max(Math.round(magnitude), 1), MOLD_RADIUS_TILES.length)
	const radius = (MOLD_RADIUS_TILES[stage - 1] ?? MOLD_RADIUS_TILES[0]) * tilePx
	const specks = MOLD_SPECKS[stage - 1] ?? MOLD_SPECKS[0]

	const jitterX = (hash01(tileX, tileY, 41) - 0.5) * 2 * MOLD_JITTER_TILES
	const jitterY = (hash01(tileX, tileY, 42) - 0.5) * 2 * MOLD_JITTER_TILES
	const centreX = (tileX + 0.5 + jitterX) * tilePx
	const centreY = (tileY + 0.5 + jitterY) * tilePx

	ctx.globalAlpha = MOLD_ALPHA[stage - 1] ?? MOLD_ALPHA[0]

	ctx.fillStyle = TILE_MOLD_PATCH
	ctx.beginPath()
	ctx.arc(centreX, centreY, radius, 0, Math.PI * 2)
	ctx.fill()

	ctx.fillStyle = TILE_MOLD_SPECK
	ctx.beginPath()
	for (let speck = 0; speck < specks; speck++) {
		const angle = hash01(tileX, tileY, speck * 2 + 60) * Math.PI * 2
		// Square-rooted, or every speck bunches into the middle of the patch.
		const distance = Math.sqrt(hash01(tileX, tileY, speck * 2 + 61)) * radius * 0.92
		const speckX = centreX + Math.cos(angle) * distance
		const speckY = centreY + Math.sin(angle) * distance
		const speckRadius = MOLD_SPECK_RADIUS_TILES * tilePx

		ctx.moveTo(speckX + speckRadius, speckY)
		ctx.arc(speckX, speckY, speckRadius, 0, Math.PI * 2)
	}
	ctx.fill()

	ctx.globalAlpha = 1
}

/**
 * How visible a slime is, thinning to nothing over the last `SLIME_FADE_FRACTION` of the def's
 * duration. A permanent one, or a write that overrode the duration past it, simply sits at full.
 */
function slimeFade(effect: TileEffect): number {
	const duration = TILE_EFFECT_DEFS.slime.durationTicks
	if (effect.remainingTicks < 0 || duration <= 0) {
		return 1
	}
	return Math.min(effect.remainingTicks / duration / SLIME_FADE_FRACTION, 1)
}

/** A wet puddle with a highlight on it. The gloss is what makes it wet rather than merely coloured. */
function drawSlime(
	ctx: CanvasRenderingContext2D,
	tileX: number,
	tileY: number,
	tilePx: number,
	effect: TileEffect,
): void {
	const fade = slimeFade(effect)
	if (fade <= 0) {
		return
	}

	const centreX = (tileX + 0.5) * tilePx
	const centreY = (tileY + 0.5) * tilePx
	const rotation = hash01(tileX, tileY, 7) * Math.PI

	ctx.globalAlpha = fade

	ctx.fillStyle = TILE_SLIME_SHEEN
	ctx.beginPath()
	ctx.ellipse(
		centreX,
		centreY,
		SLIME_RADIUS_X_TILES * tilePx,
		SLIME_RADIUS_Y_TILES * tilePx,
		rotation,
		0,
		Math.PI * 2,
	)
	ctx.fill()

	ctx.fillStyle = TILE_SLIME_GLOSS
	ctx.beginPath()
	ctx.ellipse(
		centreX - SLIME_GLOSS_OFFSET_TILES * tilePx,
		centreY - SLIME_GLOSS_OFFSET_TILES * tilePx,
		SLIME_GLOSS_RADIUS_X_TILES * tilePx,
		SLIME_GLOSS_RADIUS_Y_TILES * tilePx,
		rotation,
		0,
		Math.PI * 2,
	)
	ctx.fill()

	ctx.globalAlpha = 1
}

/**
 * A ring travelling outward off a hot core.
 *
 * A stroke and not a fill, which is the whole reason a slimed *and* heated cell reads as both: the
 * ring sits over the puddle instead of replacing it. The phase is shared by every heated cell rather
 * than hashed per tile -- a Burner's radius pulsing in unison reads as one hot area, and a hundred
 * cells each on their own clock reads as static.
 */
function drawHeat(ctx: CanvasRenderingContext2D, tileX: number, tileY: number, tilePx: number, phase: number): void {
	const centreX = (tileX + 0.5) * tilePx
	const centreY = (tileY + 0.5) * tilePx

	ctx.fillStyle = TILE_HEAT_CORE
	ctx.beginPath()
	ctx.arc(centreX, centreY, HEAT_CORE_RADIUS_TILES * tilePx, 0, Math.PI * 2)
	ctx.fill()

	const spread = HEAT_RING_MAX_RADIUS_TILES - HEAT_RING_MIN_RADIUS_TILES
	const radius = (HEAT_RING_MIN_RADIUS_TILES + spread * phase) * tilePx

	ctx.globalAlpha = 1 - phase
	ctx.strokeStyle = TILE_HEAT_PULSE
	ctx.lineWidth = HEAT_RING_WIDTH_PX
	ctx.beginPath()
	ctx.arc(centreX, centreY, radius, 0, Math.PI * 2)
	ctx.stroke()
	ctx.globalAlpha = 1
}

/**
 * A faint mist over the whole cell, edge to edge and at one alpha for every residued cell on the
 * board. Both of those are deliberate: a run of it is then one continuous fog rather than a row of
 * inset squares with the grid showing between them.
 */
function drawResidue(
	ctx: CanvasRenderingContext2D,
	tileX: number,
	tileY: number,
	tilePx: number,
	breath: number,
): void {
	ctx.globalAlpha = breath
	ctx.fillStyle = TILE_RESIDUE_MIST
	ctx.fillRect(tileX * tilePx, tileY * tilePx, tilePx, tilePx)
	ctx.globalAlpha = 1
}

/**
 * Drawn between the terrain bake and the crumbs: this is the floor, and everything else in the
 * kitchen is standing on it.
 *
 * Takes `World | null` like every other layer, and costs one comparison on the board with nothing on
 * it -- which is most of a night, until step 15's Mold and step 17's Burner exist.
 */
export function drawTileEffects(ctx: CanvasRenderingContext2D, world: World | null, tilePx: number): void {
	if (world === null || world.tiles.length === 0) {
		return
	}

	frameCounter++
	const heatPhase = (frameCounter % HEAT_PULSE_FRAMES) / HEAT_PULSE_FRAMES
	const breathWave = (Math.sin((frameCounter / RESIDUE_BREATH_FRAMES) * Math.PI * 2) + 1) / 2
	const residueBreath = RESIDUE_MIN_ALPHA + (1 - RESIDUE_MIN_ALPHA) * breathWave

	for (const state of world.tiles) {
		const tileX = state.tile.x
		const tileY = state.tile.y

		for (const kind of DRAW_ORDER) {
			const effect = effectOf(state.effects, kind)
			if (effect === null) {
				continue
			}

			switch (kind) {
				case 'scorch':
					drawScorch(ctx, tileX, tileY, tilePx)
					break
				case 'mold':
					drawMold(ctx, tileX, tileY, tilePx, effect.magnitude)
					break
				case 'slime':
					drawSlime(ctx, tileX, tileY, tilePx, effect)
					break
				case 'heat':
					drawHeat(ctx, tileX, tileY, tilePx, heatPhase)
					break
				case 'residue':
					drawResidue(ctx, tileX, tileY, tilePx, residueBreath)
					break
			}
		}
	}
}
