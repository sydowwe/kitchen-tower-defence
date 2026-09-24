/**
 * What the floor is carrying: scorch marks, mold, slime trails, heat and residue.
 *
 * **The second layer in `render/` with module state, and it is there for the same reason as the
 * first.** The heat pulse and the residue breath are aged in a frame counter, exactly like
 * `render/layers/effects.ts` -- read that file's header, because this one is the reason the rule
 * needs saying twice. Not `world.tick`: a speed multiplier runs more ticks per frame and never
 * scales `dt`, so a phase driven off the tick beats three times as fast at 3x as it does at 1x
 * (step 13B, decision 2). No reset export goes with it, unlike `resetEffects` -- a free-running
 * phase carries nothing from one night into the next. The other piece of state is `moldStages`, a
 * scratch grid rebuilt from `world.tiles` every frame and carrying nothing between them.
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

import type { TileEffect, TileEffectKind, World } from '@/core/types.ts'
import {
	TILE_HEAT_CORE,
	TILE_HEAT_PULSE,
	TILE_MOLD_BLOTCH,
	TILE_MOLD_MASS,
	TILE_MOLD_PATCH,
	TILE_MOLD_RIM,
	TILE_MOLD_SPECK,
	TILE_RESIDUE_MIST,
	TILE_SCORCH_STAIN,
	TILE_SLIME_GLINT,
	TILE_SLIME_GLOSS,
	TILE_SLIME_SHEEN,
} from '@/render/palette.ts'

/**
 * Fixed, and not `state.effects` order: a stack has to read the same way every time. The marks in
 * the floor first, then the wet and the hot over them, then the mist on top.
 *
 * Mold is not in it. It is drawn as one board-wide pass between the scorch loop and this one,
 * because a patch is a shape across cells rather than a treatment on each of them -- see
 * `drawMoldPatches`.
 */
const DRAW_ORDER: readonly TileEffectKind[] = ['slime', 'heat', 'residue']

/** Overlapping blobs, so the stain has an edge the grid does not. */
const SCORCH_BLOBS = 3
const SCORCH_MIN_RADIUS_TILES = 0.17
const SCORCH_MAX_RADIUS_TILES = 0.33

/**
 * Mold by stage, 1 to 3, where each stage is a pass the cell *joins* rather than a stronger alpha:
 *
 * 1. specks and a faint rim -- the floor still shows between them.
 * 2. a translucent patch, with blotches in it -- the floor is tinted and textured.
 * 3. an opaque mass, darker blotches, and fuzz on the edge -- the floor is gone.
 *
 * "A bit more alpha" is a difference you lean in for, and step 15's whole lesson is "you could have
 * dealt with this two stages ago". The per-stage tables below are indexed by `stage - 1`.
 */
const MOLD_STAGES = 3
const MOLD_SPECKS = [5, 7, 10] as const
const MOLD_SPECK_RADIUS_TILES = 0.04

/**
 * Blotches: blobs up to nearly two tiles across, on roughly one cell in three, clipped to the cells
 * that have reached the stage. At a scale the grid does not share, which is the lesson `TILE_MOTTLE`
 * records -- anything that varies per *tile* draws the tile boundaries in, and a patch reads as a green
 * spreadsheet.
 */
const MOLD_BLOTCH_CHANCE = 0.35
const MOLD_BLOTCH_MIN_RADIUS_TILES = 0.45
const MOLD_BLOTCH_MAX_RADIUS_TILES = 0.9

/**
 * The rim: only the edges whose neighbour has no mold, so a 4 x 4 patch has one outline and reads as
 * one growth (step 3B's "rim the mass, not the cell"). Drawn at the strength of the cell that owns the
 * edge, which puts the faint line exactly where the thin new cells are.
 */
const MOLD_RIM_ALPHA = [0.35, 0.7, 1] as const
const MOLD_RIM_WIDTH_PX = 1.5
/** Fuzz straddling each exposed edge. More of it on an older edge. */
const MOLD_TUFTS = [1, 2, 3] as const
const MOLD_TUFT_RADIUS_TILES = 0.075

const SLIME_RADIUS_X_TILES = 0.46
const SLIME_RADIUS_Y_TILES = 0.38
const SLIME_GLOSS_RADIUS_X_TILES = 0.15
const SLIME_GLOSS_RADIUS_Y_TILES = 0.075
const SLIME_GLOSS_OFFSET_TILES = 0.13
const SLIME_GLINT_RADIUS_TILES = 0.035
const SLIME_GLINT_OFFSET_TILES = 0.19
/**
 * A cell's last second, in ticks of its own `remainingTicks` (step 15C, decision 6). A fixed final
 * stretch and not a fraction of the life: nothing records what a cell counted down from, and an
 * eight-second dimming is one nobody parses -- a trail that visibly thins at its tail is "this is
 * about to stop helping you". Per cell, so the tail fades first: the slug refreshed the front last.
 */
const SLIME_FADE_TICKS = 60

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
 * Mold's stage per cell, row-major, 0 for none. Rebuilt every frame and reallocated only when the
 * board changes size, so the rim can ask about a neighbour without a lookup through `world.tiles`.
 */
let moldStages = new Uint8Array(0)

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

/** `Array.find` with no closure: this runs several times per cell per frame at the budgeted 300 cells. */
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
 * Fills `moldStages` from the board and says how many cells carry mold. `magnitude` is the stage
 * (step 15C, decision 5): `tilesSystem` advances it, and nothing here derives one from time.
 */
function collectMold(world: World): number {
	const size = world.map.widthTiles * world.map.heightTiles
	if (moldStages.length !== size) {
		moldStages = new Uint8Array(size)
	} else {
		moldStages.fill(0)
	}

	let count = 0
	for (const state of world.tiles) {
		const effect = effectOf(state.effects, 'mold')
		if (effect === null) {
			continue
		}
		const stage = Math.min(Math.max(Math.round(effect.magnitude), 1), MOLD_STAGES)
		moldStages[state.tile.y * world.map.widthTiles + state.tile.x] = stage
		count++
	}
	return count
}

/** 0 off the board, so a patch against the edge is rimmed along it. */
function moldStageAt(x: number, y: number, width: number, height: number): number {
	if (x < 0 || y < 0 || x >= width || y >= height) {
		return 0
	}
	return moldStages[y * width + x] ?? 0
}

/**
 * The union of every cell at `minStage` or above, as one path of squares. Filled once, so abutting
 * cells are one shape with no seam; clipped to, so a blotch never leaks onto floor that is not there
 * yet.
 */
function moldCellsPath(ctx: CanvasRenderingContext2D, width: number, tilePx: number, minStage: number): void {
	ctx.beginPath()
	for (let index = 0; index < moldStages.length; index++) {
		if ((moldStages[index] ?? 0) >= minStage) {
			ctx.rect((index % width) * tilePx, Math.floor(index / width) * tilePx, tilePx, tilePx)
		}
	}
}

/** One fill of blotches for the cells at `minStage` or above, into whatever clip is current. */
function drawMoldBlotches(
	ctx: CanvasRenderingContext2D,
	width: number,
	tilePx: number,
	minStage: number,
	salt: number,
): void {
	const spread = MOLD_BLOTCH_MAX_RADIUS_TILES - MOLD_BLOTCH_MIN_RADIUS_TILES

	ctx.fillStyle = TILE_MOLD_BLOTCH
	ctx.beginPath()
	for (let index = 0; index < moldStages.length; index++) {
		const tileX = index % width
		const tileY = Math.floor(index / width)
		if ((moldStages[index] ?? 0) < minStage || hash01(tileX, tileY, salt) >= MOLD_BLOTCH_CHANCE) {
			continue
		}
		const centreX = (tileX + hash01(tileX, tileY, salt + 1)) * tilePx
		const centreY = (tileY + hash01(tileX, tileY, salt + 2)) * tilePx
		const radius = (MOLD_BLOTCH_MIN_RADIUS_TILES + hash01(tileX, tileY, salt + 3) * spread) * tilePx
		ctx.moveTo(centreX + radius, centreY)
		ctx.arc(centreX, centreY, radius, 0, Math.PI * 2)
	}
	ctx.fill()
}

/** Pale specks inside every molded cell, more of them the older it is. One fill for the board. */
function drawMoldSpecks(ctx: CanvasRenderingContext2D, width: number, tilePx: number): void {
	const radius = MOLD_SPECK_RADIUS_TILES * tilePx

	ctx.fillStyle = TILE_MOLD_SPECK
	ctx.beginPath()
	for (let index = 0; index < moldStages.length; index++) {
		const stage = moldStages[index] ?? 0
		if (stage === 0) {
			continue
		}
		const tileX = index % width
		const tileY = Math.floor(index / width)
		const specks = MOLD_SPECKS[stage - 1] ?? MOLD_SPECKS[0]
		for (let speck = 0; speck < specks; speck++) {
			const x = (tileX + 0.1 + hash01(tileX, tileY, speck * 2 + 60) * 0.8) * tilePx
			const y = (tileY + 0.1 + hash01(tileX, tileY, speck * 2 + 61) * 0.8) * tilePx
			ctx.moveTo(x + radius, y)
			ctx.arc(x, y, radius, 0, Math.PI * 2)
		}
	}
	ctx.fill()
}

/**
 * The four sides of a cell: the neighbour across it, and the edge itself as two corners in tile units
 * from the cell's top-left. A constant so the rim walk allocates nothing.
 */
const CELL_SIDES = [
	{ dx: 0, dy: -1, x0: 0, y0: 0, x1: 1, y1: 0 },
	{ dx: 1, dy: 0, x0: 1, y0: 0, x1: 1, y1: 1 },
	{ dx: 0, dy: 1, x0: 0, y0: 1, x1: 1, y1: 1 },
	{ dx: -1, dy: 0, x0: 0, y0: 0, x1: 0, y1: 1 },
] as const

const RIM_PASSES = ['stroke', 'fill'] as const

/**
 * The frontier of every patch, one stage at a time so each is a single stroke and a single fill: a
 * line along every exposed edge, and tufts of fuzz straddling it, hashed on the cell and the side so
 * they hold still.
 *
 * Two walks per stage rather than one, because a path is the context's and cannot hold a stroke and a
 * fill at once.
 */
function drawMoldRim(ctx: CanvasRenderingContext2D, width: number, height: number, tilePx: number): void {
	const radius = MOLD_TUFT_RADIUS_TILES * tilePx

	ctx.strokeStyle = TILE_MOLD_RIM
	ctx.fillStyle = TILE_MOLD_RIM
	ctx.lineWidth = MOLD_RIM_WIDTH_PX

	for (let stage = 1; stage <= MOLD_STAGES; stage++) {
		ctx.globalAlpha = MOLD_RIM_ALPHA[stage - 1] ?? 1
		const tufts = MOLD_TUFTS[stage - 1] ?? 1

		for (const pass of RIM_PASSES) {
			ctx.beginPath()
			for (let index = 0; index < moldStages.length; index++) {
				if (moldStages[index] !== stage) {
					continue
				}
				const x = index % width
				const y = Math.floor(index / width)

				for (let side = 0; side < CELL_SIDES.length; side++) {
					const edge = CELL_SIDES[side]
					if (edge === undefined || moldStageAt(x + edge.dx, y + edge.dy, width, height) !== 0) {
						continue
					}
					const x0 = (x + edge.x0) * tilePx
					const y0 = (y + edge.y0) * tilePx
					const x1 = (x + edge.x1) * tilePx
					const y1 = (y + edge.y1) * tilePx

					if (pass === 'stroke') {
						ctx.moveTo(x0, y0)
						ctx.lineTo(x1, y1)
						continue
					}
					for (let tuft = 0; tuft < tufts; tuft++) {
						const along = (tuft + 0.25 + hash01(x, y, side * 8 + tuft + 80) * 0.5) / tufts
						const tuftX = x0 + (x1 - x0) * along
						const tuftY = y0 + (y1 - y0) * along
						const size = radius * (0.7 + hash01(x, y, side * 8 + tuft + 90) * 0.6)
						ctx.moveTo(tuftX + size, tuftY)
						ctx.arc(tuftX, tuftY, size, 0, Math.PI * 2)
					}
				}
			}
			if (pass === 'stroke') {
				ctx.stroke()
			} else {
				ctx.fill()
			}
		}
	}

	ctx.globalAlpha = 1
}

/**
 * Every patch on the board, as shapes across cells rather than a treatment per cell.
 *
 * Drawn live every frame, per the header. The cost is bounded by the pass count rather than the cell
 * count -- nine or so fills and strokes whatever the size of the patch -- so a bad night 11's hundred
 * molded cells is a hundred more `rect`s in the same paths, not a hundred more draws.
 */
function drawMoldPatches(ctx: CanvasRenderingContext2D, world: World, tilePx: number): void {
	if (collectMold(world) === 0) {
		return
	}
	const width = world.map.widthTiles
	const height = world.map.heightTiles

	// Stage 2 and up: the translucent patch, and blotches clipped to it.
	moldCellsPath(ctx, width, tilePx, 2)
	ctx.fillStyle = TILE_MOLD_PATCH
	ctx.fill()
	ctx.save()
	ctx.clip()
	drawMoldBlotches(ctx, width, tilePx, 2, 100)
	ctx.restore()

	// Stage 3: the opaque mass over it, and a second, different set of blotches on the mass.
	moldCellsPath(ctx, width, tilePx, 3)
	ctx.fillStyle = TILE_MOLD_MASS
	ctx.fill()
	ctx.save()
	ctx.clip()
	drawMoldBlotches(ctx, width, tilePx, 3, 200)
	ctx.restore()

	drawMoldSpecks(ctx, width, tilePx)
	drawMoldRim(ctx, width, height, tilePx)
}

/**
 * How visible a slime is: full until its last `SLIME_FADE_TICKS`, then thinning to nothing. A
 * permanent one simply sits at full.
 */
function slimeFade(effect: TileEffect): number {
	if (effect.remainingTicks < 0) {
		return 1
	}
	return Math.min(effect.remainingTicks / SLIME_FADE_TICKS, 1)
}

/**
 * A wet puddle with a highlight on it, lit from the top-left like everything else on the board.
 *
 * The gloss and the glint are what make it wet rather than merely coloured, and they are also what
 * keep it from being mold: slime is a road handed to the enemy, and it should look slick and almost
 * inviting where mold is matte and dead.
 */
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

	ctx.fillStyle = TILE_SLIME_GLINT
	ctx.beginPath()
	ctx.arc(
		centreX - SLIME_GLINT_OFFSET_TILES * tilePx,
		centreY - SLIME_GLINT_OFFSET_TILES * tilePx,
		SLIME_GLINT_RADIUS_TILES * tilePx,
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

	// The marks in the floor, then the mold growing over them, then everything that sits on top.
	for (const state of world.tiles) {
		if (effectOf(state.effects, 'scorch') !== null) {
			drawScorch(ctx, state.tile.x, state.tile.y, tilePx)
		}
	}

	drawMoldPatches(ctx, world, tilePx)

	for (const state of world.tiles) {
		const tileX = state.tile.x
		const tileY = state.tile.y

		for (const kind of DRAW_ORDER) {
			const effect = effectOf(state.effects, kind)
			if (effect === null) {
				continue
			}

			switch (kind) {
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
