/**
 * The kitchen surface: tile fills, pools of lamp light, and the authored scenery glyphs.
 *
 * Drawn **into the offscreen bake**, never the live context -- terrain does not change during a
 * night (analytic-docs/ARCHITECTURE.md section 6), so every per-tile loop and every gradient in
 * this file runs once per map load and never again.
 *
 * A pure draw: arguments in, pixels out, no module state. That is what lets step 4's editor call it
 * against a half-finished map without going through the renderer.
 */

import { TileFlags } from '@/core/map.ts'
import type { MapDef } from '@/core/types.ts'
import { blitGlyph } from '@/render/glyphCache.ts'
import {
	LAMP_CORE,
	LAMP_EDGE,
	TILE_BLOCKED,
	TILE_BLOCKED_EDGE,
	TILE_BUILDABLE,
	TILE_DECOR,
	TILE_MOTTLE,
	TILE_MOTTLE_ALPHA,
} from '@/render/palette.ts'

/** Decor sits a little under the tile so it reads as an object on the surface, not as the surface. */
const DECOR_SCALE = 0.72

/** How far inside the blocked mass its lit rim runs, in logical pixels. */
const BLOCKED_INSET_PX = 1.5

/** Soft blobs in the mottle wash, and their radius in tiles. Baked once, so the count is free. */
const MOTTLE_BLOBS = 52
const MOTTLE_MIN_RADIUS_TILES = 1.2
const MOTTLE_MAX_RADIUS_TILES = 3.4

/**
 * The pools of lamp light, as fractions of the board so they survive a map of another size.
 * Large, low-contrast and off-centre: three tidy circles in a row read as decoration, and the whole
 * point of them is to stop the grid reading as a spreadsheet.
 */
const LAMPS = [
	{ x: 0.18, y: 0.24, radius: 0.46 },
	{ x: 0.74, y: 0.62, radius: 0.52 },
	{ x: 0.52, y: 0.1, radius: 0.34 },
] as const

/** Fill for one tile's flags. Blocked wins over everything: nothing goes there, ever. */
function fillFor(flags: number): string {
	if ((flags & TileFlags.BLOCKED) !== 0) {
		return TILE_BLOCKED
	}
	if ((flags & TileFlags.DECOR) !== 0) {
		return TILE_DECOR
	}
	return TILE_BUILDABLE
}

/**
 * A tiny deterministic sequence for the mottle. Not `world.rng` -- this is `render/`, and the wash
 * is not simulation state -- but not `Math.random` either: the blobs have to land in the same place
 * on every re-bake, or dragging the window to a second monitor would reshuffle the whole floor.
 */
function createNoise(seed: number): () => number {
	let state = seed >>> 0
	return function next(): number {
		state = (state * 1664525 + 1013904223) >>> 0
		return state / 0x100000000
	}
}

/** Off-board counts as blocked, so the mass at the board edge is not rimmed on its outer face. */
function isBlocked(map: MapDef, x: number, y: number): boolean {
	if (x < 0 || x >= map.widthTiles || y < 0 || y >= map.heightTiles) {
		return true
	}
	return ((map.flags[y * map.widthTiles + x] ?? 0) & TileFlags.BLOCKED) !== 0
}

function drawTiles(ctx: CanvasRenderingContext2D, map: MapDef, tilePx: number): void {
	for (let y = 0; y < map.heightTiles; y++) {
		for (let x = 0; x < map.widthTiles; x++) {
			ctx.fillStyle = fillFor(map.flags[y * map.widthTiles + x] ?? 0)
			ctx.fillRect(x * tilePx, y * tilePx, tilePx, tilePx)
		}
	}
}

/**
 * The rim around a run of blocked tiles, drawn only on the sides that face open floor.
 *
 * Rimming every blocked tile individually -- the obvious version, and the first one here -- draws
 * the grid back in: a 5 x 5 appliance comes out as twenty-five outlined squares instead of one
 * object. The neighbour check is what makes it read as mass.
 */
function drawBlockedRims(ctx: CanvasRenderingContext2D, map: MapDef, tilePx: number): void {
	ctx.beginPath()

	for (let y = 0; y < map.heightTiles; y++) {
		for (let x = 0; x < map.widthTiles; x++) {
			if (!isBlocked(map, x, y)) {
				continue
			}
			const left = x * tilePx
			const top = y * tilePx
			const right = left + tilePx
			const bottom = top + tilePx

			if (!isBlocked(map, x, y - 1)) {
				ctx.moveTo(left, top + BLOCKED_INSET_PX)
				ctx.lineTo(right, top + BLOCKED_INSET_PX)
			}
			if (!isBlocked(map, x, y + 1)) {
				ctx.moveTo(left, bottom - BLOCKED_INSET_PX)
				ctx.lineTo(right, bottom - BLOCKED_INSET_PX)
			}
			if (!isBlocked(map, x - 1, y)) {
				ctx.moveTo(left + BLOCKED_INSET_PX, top)
				ctx.lineTo(left + BLOCKED_INSET_PX, bottom)
			}
			if (!isBlocked(map, x + 1, y)) {
				ctx.moveTo(right - BLOCKED_INSET_PX, top)
				ctx.lineTo(right - BLOCKED_INSET_PX, bottom)
			}
		}
	}

	ctx.strokeStyle = TILE_BLOCKED_EDGE
	ctx.lineWidth = 1
	ctx.stroke()
}

/** Soft blobs at a scale the tile grid does not share. See `TILE_MOTTLE` for why that matters. */
function drawMottle(ctx: CanvasRenderingContext2D, widthPx: number, heightPx: number, tilePx: number): void {
	const noise = createNoise(0x5ea51de)

	for (let i = 0; i < MOTTLE_BLOBS; i++) {
		const centreX = noise() * widthPx
		const centreY = noise() * heightPx
		const radius =
			(MOTTLE_MIN_RADIUS_TILES + noise() * (MOTTLE_MAX_RADIUS_TILES - MOTTLE_MIN_RADIUS_TILES)) * tilePx

		const gradient = ctx.createRadialGradient(centreX, centreY, 0, centreX, centreY, radius)
		gradient.addColorStop(0, TILE_MOTTLE)
		gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

		ctx.globalAlpha = TILE_MOTTLE_ALPHA * noise()
		ctx.fillStyle = gradient
		ctx.fillRect(centreX - radius, centreY - radius, radius * 2, radius * 2)
	}

	ctx.globalAlpha = 1
}

function drawLamps(ctx: CanvasRenderingContext2D, widthPx: number, heightPx: number): void {
	const longest = Math.max(widthPx, heightPx)
	for (const lamp of LAMPS) {
		const centreX = lamp.x * widthPx
		const centreY = lamp.y * heightPx
		const radius = lamp.radius * longest
		const gradient = ctx.createRadialGradient(centreX, centreY, 0, centreX, centreY, radius)
		gradient.addColorStop(0, LAMP_CORE)
		gradient.addColorStop(1, LAMP_EDGE)
		ctx.fillStyle = gradient
		ctx.fillRect(0, 0, widthPx, heightPx)
	}
}

function drawDecor(ctx: CanvasRenderingContext2D, map: MapDef, tilePx: number, dpr: number): void {
	for (const entry of map.decor) {
		blitGlyph(
			ctx,
			dpr,
			entry.glyph,
			tilePx * DECOR_SCALE,
			(entry.tile.x + 0.5) * tilePx,
			(entry.tile.y + 0.5) * tilePx,
		)
	}
}

/**
 * `dpr` is the **bake's** device pixel ratio, not the live renderer's -- they are the same number
 * today, but the bake owns its own transform and the glyph blit has to divide by the one it was
 * drawn under.
 */
export function drawTerrain(ctx: CanvasRenderingContext2D, map: MapDef, tilePx: number, dpr: number): void {
	const widthPx = map.widthTiles * tilePx
	const heightPx = map.heightTiles * tilePx

	drawTiles(ctx, map, tilePx)
	drawMottle(ctx, widthPx, heightPx, tilePx)
	drawBlockedRims(ctx, map, tilePx)
	drawLamps(ctx, widthPx, heightPx)
	drawDecor(ctx, map, tilePx, dpr)
}
