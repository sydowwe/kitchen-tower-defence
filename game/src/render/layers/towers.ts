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
import { getTowerDef } from '@/core/content/index.ts'
import type { Vec2, World } from '@/core/types.ts'
import { blitGlyph, preload } from '@/render/glyphCache.ts'
import {
	PROJECTILE_SHOT,
	RANGE_INVALID,
	RANGE_INVALID_FILL,
	RANGE_NEUTRAL,
	RANGE_NEUTRAL_FILL,
	RANGE_VALID,
	RANGE_VALID_FILL,
	TOWER_PAD,
	TOWER_PAD_EDGE,
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

export function drawTowers(ctx: CanvasRenderingContext2D, world: World | null, tilePx: number, dpr: number): void {
	if (world === null) {
		return
	}

	for (const tower of world.towers) {
		const center = tileCenter(tower.tile, tilePx)
		drawPad(ctx, center, tilePx)
		blitGlyph(ctx, dpr, getTowerDef(tower.defId).glyph, tilePx * TOWER_SCALE, center.x, center.y)
	}
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
