/**
 * The kitchen surface: tile fills, the floor's material, and the authored scenery glyphs.
 *
 * Drawn **into the offscreen bake**, never the live context -- terrain does not change during a
 * night (analytic-docs/ARCHITECTURE.md section 6), so every per-tile loop and every gradient in
 * this file runs once per map load and never again.
 *
 * There are no lamps in here. The dark is the room's default and it is laid over the bake each frame
 * (`render/layers/light.ts`), with the lights cut out of it by what is on the board.
 *
 * A pure draw: arguments in, pixels out, no module state. That is what lets step 4's editor call it
 * against a half-finished map without going through the renderer.
 */

import { TileFlags } from '@/core/map.ts'
import type { MapDef } from '@/core/types.ts'
import { blitGlyph } from '@/render/glyphCache.ts'
import {
	SURFACE_GRAIN,
	SURFACE_SEAM,
	SURFACE_SEAM_LIGHT,
	SURFACE_SPECK_DARK,
	SURFACE_SPECK_LIGHT,
	TILE_BLOCKED,
	TILE_BLOCKED_EDGE,
	TILE_BUILDABLE,
	TILE_DECOR,
	TILE_MOTTLE,
	TILE_MOTTLE_ALPHA,
	TILE_MOTTLE_CLEAR,
} from '@/render/palette.ts'
import { surfaceOf } from '@/render/surfaces.ts'
import type { Surface } from '@/render/surfaces.ts'

/** Decor sits a little under the tile so it reads as an object on the surface, not as the surface. */
const DECOR_SCALE = 0.72

/** How far inside the blocked mass its lit rim runs, in logical pixels. */
const BLOCKED_INSET_PX = 1.5

/** Soft blobs in the mottle wash, and their radius in tiles. Baked once, so the count is free. */
const MOTTLE_BLOBS = 52
const MOTTLE_MIN_RADIUS_TILES = 1.2
const MOTTLE_MAX_RADIUS_TILES = 3.4

/**
 * The three surfaces. Every one of them is at a scale the tile grid does not share (`TILE_MOTTLE`
 * records what happens otherwise, and 3B found it twice): grout is the one whose lines *should* fall
 * on a grid, so its pitch is three quarters of a tile and its origin is an eighth off the grid's, which
 * puts no joint closer than six pixels to a tile edge and reads as a floor and not as the debug grid.
 */
const SPECKS_PER_TILE = 5
const SPECK_MAX_LENGTH_PX = 3
const COUNTER_STREAKS = 36
const COUNTER_STREAK_MIN_TILES = 3
const COUNTER_STREAK_MAX_TILES = 9

const GROUT_PITCH_TILES = 0.75
const GROUT_ORIGIN_TILES = 0.375

/** Narrower than a tile and not a divisor of one, so the seams walk across the grid instead of repeating it. */
const PLANK_HEIGHT_TILES = 0.62
const PLANK_JOINT_MIN_TILES = 3.3
const PLANK_JOINT_MAX_TILES = 6.4
const PLANK_GRAINS = 2
const PLANK_GRAIN_MIN_TILES = 2
const PLANK_GRAIN_MAX_TILES = 6

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

/**
 * One pass over the fills: the open floor, or the blocked mass. Two passes rather than one so the
 * surface texture can go between them -- it is the material of the floor, and an appliance is flat.
 */
function drawTiles(ctx: CanvasRenderingContext2D, map: MapDef, tilePx: number, blocked: boolean): void {
	for (let y = 0; y < map.heightTiles; y++) {
		for (let x = 0; x < map.widthTiles; x++) {
			const flags = map.flags[y * map.widthTiles + x] ?? 0
			if (((flags & TileFlags.BLOCKED) !== 0) !== blocked) {
				continue
			}
			ctx.fillStyle = fillFor(flags)
			ctx.fillRect(x * tilePx, y * tilePx, tilePx, tilePx)
		}
	}
}

/** Laminate: a fine speckle, light and dark, and a few long faint streaks of grain. */
function drawCounter(ctx: CanvasRenderingContext2D, widthPx: number, heightPx: number, tilePx: number): void {
	const noise = createNoise(0xc0ffee)
	const count = Math.round((widthPx / tilePx) * (heightPx / tilePx) * SPECKS_PER_TILE)

	for (const colour of [SURFACE_SPECK_LIGHT, SURFACE_SPECK_DARK]) {
		ctx.fillStyle = colour
		ctx.beginPath()
		for (let i = 0; i < count; i++) {
			const length = 1 + Math.floor(noise() * SPECK_MAX_LENGTH_PX)
			ctx.rect(Math.floor(noise() * widthPx), Math.floor(noise() * heightPx), length, 1)
		}
		ctx.fill()
	}

	ctx.strokeStyle = SURFACE_GRAIN
	ctx.lineWidth = 1
	ctx.beginPath()
	for (let i = 0; i < COUNTER_STREAKS; i++) {
		const length =
			(COUNTER_STREAK_MIN_TILES + noise() * (COUNTER_STREAK_MAX_TILES - COUNTER_STREAK_MIN_TILES)) * tilePx
		const x = noise() * widthPx
		// The half pixel keeps a 1px line on one row of device pixels and not smeared across two.
		const y = Math.floor(noise() * heightPx) + 0.5
		ctx.moveTo(x, y)
		ctx.lineTo(x + length, y)
	}
	ctx.stroke()
}

/** Grout on a pitch that is not the tile's. See the constants above. */
function drawGrout(ctx: CanvasRenderingContext2D, widthPx: number, heightPx: number, tilePx: number): void {
	const pitch = GROUT_PITCH_TILES * tilePx
	const origin = GROUT_ORIGIN_TILES * tilePx

	// The dark joint, then the light lip one pixel beside it: a groove, not a line drawn on a surface.
	for (const [colour, shift] of [
		[SURFACE_SEAM, 0],
		[SURFACE_SEAM_LIGHT, 1],
	] as const) {
		ctx.strokeStyle = colour
		ctx.lineWidth = 1
		ctx.beginPath()
		for (let x = origin; x < widthPx; x += pitch) {
			const at = Math.round(x) + shift + 0.5
			ctx.moveTo(at, 0)
			ctx.lineTo(at, heightPx)
		}
		for (let y = origin; y < heightPx; y += pitch) {
			const at = Math.round(y) + shift + 0.5
			ctx.moveTo(0, at)
			ctx.lineTo(widthPx, at)
		}
		ctx.stroke()
	}
}

/** Planks along the board, seamed on a height that is not a tile's, with staggered butt joints and grain. */
function drawWood(ctx: CanvasRenderingContext2D, widthPx: number, heightPx: number, tilePx: number): void {
	const noise = createNoise(0x9badb5)
	const plank = PLANK_HEIGHT_TILES * tilePx
	ctx.lineWidth = 1

	ctx.strokeStyle = SURFACE_GRAIN
	ctx.beginPath()
	for (let top = 0; top < heightPx; top += plank) {
		for (let grain = 0; grain < PLANK_GRAINS; grain++) {
			const length = (PLANK_GRAIN_MIN_TILES + noise() * (PLANK_GRAIN_MAX_TILES - PLANK_GRAIN_MIN_TILES)) * tilePx
			const x = noise() * widthPx
			const y = Math.floor(top + (0.2 + noise() * 0.6) * plank) + 0.5
			ctx.moveTo(x, y)
			ctx.lineTo(x + length, y)
		}
	}
	ctx.stroke()

	// Seams over the grain: the long joint under every plank and the butt joints staggered along it.
	ctx.strokeStyle = SURFACE_SEAM
	ctx.beginPath()
	for (let top = 0; top < heightPx; top += plank) {
		const seam = Math.round(top) + 0.5
		ctx.moveTo(0, seam)
		ctx.lineTo(widthPx, seam)
		let x = noise() * PLANK_JOINT_MAX_TILES * tilePx
		while (x < widthPx) {
			const joint = Math.round(x) + 0.5
			ctx.moveTo(joint, top)
			ctx.lineTo(joint, top + plank)
			x += (PLANK_JOINT_MIN_TILES + noise() * (PLANK_JOINT_MAX_TILES - PLANK_JOINT_MIN_TILES)) * tilePx
		}
	}
	ctx.stroke()
}

function drawSurface(
	ctx: CanvasRenderingContext2D,
	surface: Surface,
	widthPx: number,
	heightPx: number,
	tilePx: number,
): void {
	if (surface === 'tile') {
		drawGrout(ctx, widthPx, heightPx, tilePx)
	} else if (surface === 'wood') {
		drawWood(ctx, widthPx, heightPx, tilePx)
	} else {
		drawCounter(ctx, widthPx, heightPx, tilePx)
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
		gradient.addColorStop(1, TILE_MOTTLE_CLEAR)

		ctx.globalAlpha = TILE_MOTTLE_ALPHA * noise()
		ctx.fillStyle = gradient
		ctx.fillRect(centreX - radius, centreY - radius, radius * 2, radius * 2)
	}

	ctx.globalAlpha = 1
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

	drawTiles(ctx, map, tilePx, false)
	drawSurface(ctx, surfaceOf(map.id), widthPx, heightPx, tilePx)
	drawTiles(ctx, map, tilePx, true)
	drawMottle(ctx, widthPx, heightPx, tilePx)
	drawBlockedRims(ctx, map, tilePx)
	drawDecor(ctx, map, tilePx, dpr)
}
