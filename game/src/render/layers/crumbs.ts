/**
 * Litter on the floor: piles sized by what they are worth, a green cast on the ones going over, and
 * the two queries a click needs.
 *
 * **The size bands are `render/crumbBands.ts`'s** and `glyphFor` and `radiusTilesFor` are pure
 * functions of `value` over them, written once, in this file.
 *
 * **The hit test lives here too, for the same reason.** The forgiving click radius is *the drawn
 * radius plus a margin*, and the drawn radius is the band table; a `pickCrumb` in `dev/`
 * would be a second copy of that table, drifting the first time a band moves. `render/` reads core
 * state and never writes it, so a pure query is legal here -- `drawRangeCircle` is the precedent for
 * a primitive `dev/` composes (step 7C, decision 3).
 *
 * `crumbPosition` is the one place a claimed pile's drawn position is computed. `core/` never moves
 * a claimed crumb -- it counts `travelTicksRemaining` down and leaves `position` where it fell -- so
 * the flight is interpolation, and **both the draw and the hit test go through this function**. Two
 * copies is how the click target ends up where the pile used to be while the pixels are elsewhere.
 */

import { isCollect } from '@/core/content/behaviours.ts'
import { effectiveDefOf } from '@/core/content/index.ts'
import { collectTravelTicksFor, isRotting } from '@/core/systems/crumbs.ts'
import { towerById } from '@/core/systems/placement.ts'
import type { Crumb, EntityId, Vec2, World } from '@/core/types.ts'
import { CRUMB_BANDS, SPECK } from '@/render/crumbBands.ts'
import type { CrumbBand } from '@/render/crumbBands.ts'
import { blitGlyph, preload } from '@/render/glyphCache.ts'
import { CRUMB_ROT_CORE, CRUMB_ROT_HALO } from '@/render/palette.ts'

function bandFor(value: number): CrumbBand {
	return CRUMB_BANDS.find(band => value >= band.minValue) ?? SPECK
}

/** The glyph a pile of this value is drawn with. */
export function glyphFor(value: number): string {
	return bandFor(value).glyph
}

/** Half the drawn glyph, in tiles. The hit test's forgiving radius is this plus a margin. */
export function radiusTilesFor(value: number): number {
	return bandFor(value).scale / 2
}

/** The green mould, as a fraction of the drawn radius. Wider than the glyph, so it reads as spread. */
const ROT_HALO_SCALE = 1.8
const ROT_CORE_SCALE = 1.05

/**
 * Where a pile is drawn this frame: on the floor, or somewhere along its flight to the tower that
 * claimed it.
 *
 * Falls back to `position` for anything it cannot resolve -- a tower sold mid-flight, a def with no
 * `collect`, a `travelTicks` of 0. `core/` releases a claim whose tower has gone on the next tick,
 * so that state lasts at most one frame and the pile simply does not jump during it.
 */
export function crumbPosition(world: World, crumb: Crumb): Vec2 {
	const towerId = crumb.claimedByTowerId
	if (towerId === null) {
		return crumb.position
	}

	const tower = towerById(world, towerId)
	if (tower === null) {
		return crumb.position
	}

	const behaviour = effectiveDefOf(tower).behaviours.find(isCollect)
	// The flight `core/` actually set, the dustpan's cap included -- the def's would start a capped
	// flight partway along and jump on the first frame.
	const travelTicks = behaviour === undefined ? 0 : collectTravelTicksFor(world, behaviour)
	if (travelTicks <= 0) {
		return crumb.position
	}

	const travelled = 1 - crumb.travelTicksRemaining / travelTicks
	const t = Math.min(Math.max(travelled, 0), 1)

	return {
		x: crumb.position.x + (tower.tile.x - crumb.position.x) * t,
		y: crumb.position.y + (tower.tile.y - crumb.position.y) * t,
	}
}

interface LastPosition {
	x: number
	y: number
	/** The `drawCrumbs` call that last wrote this entry. See `rememberPosition`. */
	frame: number
}

/**
 * Where each pile was last drawn, so the pop can go off where the player saw it.
 *
 * `collectCrumb` splices the pile out of the world *before* it pushes `crumbCollected`, so by the
 * time `effects.ts` reads that event there is nothing left to ask. This is the memory that answers
 * it, and it holds the last two frames because the event arrives at the top of frame N carrying a
 * pile that was drawn in frame N-1.
 *
 * Entries are mutated in place and stamped with a frame counter rather than rebuilt into a fresh
 * Map: this runs at 60Hz over up to ~60 piles, and the entities layer's no-allocation rule
 * (ARCHITECTURE.md section 6) applies to everything on that path.
 */
const lastPositions = new Map<EntityId, LastPosition>()
let frameCounter = 0

function rememberPosition(id: EntityId, x: number, y: number): void {
	const existing = lastPositions.get(id)
	if (existing === undefined) {
		lastPositions.set(id, { x, y, frame: frameCounter })
		return
	}
	existing.x = x
	existing.y = y
	existing.frame = frameCounter
}

function pruneRemembered(): void {
	for (const [id, entry] of lastPositions) {
		if (entry.frame < frameCounter - 1) {
			lastPositions.delete(id)
		}
	}
}

/** Where this pile was last drawn, or null for one that was collected before it was ever on screen. */
export function lastCrumbPosition(crumbId: EntityId): Vec2 | null {
	const entry = lastPositions.get(crumbId)
	return entry === undefined ? null : { x: entry.x, y: entry.y }
}

/** Called on restart, from `resetEffects`. Without it the first pop of a night lands on last night's floor. */
export function forgetCrumbPositions(): void {
	lastPositions.clear()
	frameCounter = 0
}

/**
 * The rot tell: one soft green cast under the glyph, and deliberately only one.
 *
 * A tint *and* a pulse *and* an orbiting fly is three tells on a board that already has sixty ants
 * on it, and the result is noise rather than warning. This one is static, so it costs nothing to
 * read at 3x speed -- which is the speed at which the player stops looking at the floor at all.
 */
function drawRot(ctx: CanvasRenderingContext2D, x: number, y: number, radiusPx: number): void {
	ctx.fillStyle = CRUMB_ROT_HALO
	ctx.beginPath()
	ctx.arc(x, y, radiusPx * ROT_HALO_SCALE, 0, Math.PI * 2)
	ctx.fill()

	ctx.fillStyle = CRUMB_ROT_CORE
	ctx.beginPath()
	ctx.arc(x, y, radiusPx * ROT_CORE_SCALE, 0, Math.PI * 2)
	ctx.fill()
}

/**
 * Drawn **under** the enemies, at the slot the draw order reserves. A pile on the track gets walked
 * over, and that is correct: the litter is on the floor and the ants are on top of it.
 *
 * A claimed pile is drawn at `crumbPosition` and is not marked in any other way. The movement is the
 * tell -- a pile sliding toward a Crumb Tray is unmistakably spoken for.
 */
export function drawCrumbs(ctx: CanvasRenderingContext2D, world: World | null, tilePx: number, dpr: number): void {
	if (world === null) {
		return
	}

	frameCounter++

	for (const crumb of world.crumbPiles) {
		const band = bandFor(crumb.value)
		const at = crumbPosition(world, crumb)
		const x = (at.x + 0.5) * tilePx
		const y = (at.y + 0.5) * tilePx

		if (isRotting(crumb)) {
			drawRot(ctx, x, y, (band.scale / 2) * tilePx)
		}

		blitGlyph(ctx, dpr, band.glyph, tilePx * band.scale, x, y)
		rememberPosition(crumb.id, at.x, at.y)
	}

	pruneRemembered()
}

/**
 * The pile the pointer is on, or null.
 *
 * `atTiles` is **waypoint space**, the space `Crumb.position` is in -- `gridToWaypoint` is the
 * conversion, and skipping its `- 0.5` makes every pile feel like it has to be clicked half a tile
 * up and to the left, which reads as unresponsive rather than as an offset (step 7C, decision 6).
 *
 * The largest overlapping pile wins, ties going to `world.crumbPiles` order. The player aimed at the
 * pile they can see, and that is the big one.
 */
export function pickCrumb(world: World, atTiles: Vec2, tilePx: number, forgivenessPx: number): Crumb | null {
	let best: Crumb | null = null

	for (const crumb of world.crumbPiles) {
		const at = crumbPosition(world, crumb)
		const dx = (at.x - atTiles.x) * tilePx
		const dy = (at.y - atTiles.y) * tilePx
		const reach = radiusTilesFor(crumb.value) * tilePx + forgivenessPx

		if (dx * dx + dy * dy > reach * reach) {
			continue
		}
		if (best === null || crumb.value > best.value) {
			best = crumb
		}
	}

	return best
}

/**
 * Rasterises the band glyphs at the sizes this layer blits them at.
 *
 * The cache key includes `sizePx`, and `tilePx` is 0 until `Renderer.setMap` has run -- call this
 * after it, never before, or the cache fills with entries nothing ever reads and still pays for the
 * real ones on the first frame.
 */
export function preloadCrumbGlyphs(tilePx: number): void {
	preload(CRUMB_BANDS.map(band => ({ emoji: band.glyph, sizePx: tilePx * band.scale })))
}
