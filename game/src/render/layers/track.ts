/**
 * The walked line across the counter, plus the two fixed points on it: the crack the bugs come in
 * through and the fridge they are coming for.
 *
 * Drawn **into the offscreen bake**, on top of the terrain. Like `terrain.ts` this is a pure draw
 * with no module state.
 *
 * The stroke width is `map.trackWidthTiles * tilePx`, which is the same number `loadMap` rasterised
 * the `TRACK` flags from. That is the whole reason the width lives on `MapDef`: the drawn track and
 * the simulation's idea of which tiles are track agree by construction rather than by two authors
 * remembering the same value.
 */

import type { MapDef, Path } from '@/core/types.ts'
import { blitGlyph } from '@/render/glyphCache.ts'
import { TRACK_FILL, TRACK_OUTLINE } from '@/render/palette.ts'

/** How far the darker pass sticks out past the fill on each side, in logical pixels. */
const OUTLINE_PX = 3

const FRIDGE_SCALE = 0.9

/** The gap in the skirting board a path starts from. */
const CRACK_GLYPH = '🕳️'
const CRACK_SCALE = 0.66

/**
 * Waypoints are tile coordinates, and `loadMap` marks the tile a waypoint names -- so the drawn
 * line runs through tile *centres*, half a tile off the grid corner.
 */
function traceWaypoints(ctx: CanvasRenderingContext2D, path: Path, tilePx: number): void {
	ctx.beginPath()
	path.waypoints.forEach((waypoint, index) => {
		const x = (waypoint.x + 0.5) * tilePx
		const y = (waypoint.y + 0.5) * tilePx
		if (index === 0) {
			ctx.moveTo(x, y)
		} else {
			ctx.lineTo(x, y)
		}
	})
}

export function drawTrack(ctx: CanvasRenderingContext2D, map: MapDef, tilePx: number, dpr: number): void {
	const width = map.trackWidthTiles * tilePx

	ctx.lineJoin = 'round'
	ctx.lineCap = 'round'

	for (const path of map.paths) {
		traceWaypoints(ctx, path, tilePx)
		ctx.strokeStyle = TRACK_OUTLINE
		ctx.lineWidth = width + OUTLINE_PX * 2
		ctx.stroke()

		traceWaypoints(ctx, path, tilePx)
		ctx.strokeStyle = TRACK_FILL
		ctx.lineWidth = width
		ctx.stroke()
	}

	for (const path of map.paths) {
		const entry = path.waypoints[0]
		if (entry === undefined) {
			continue
		}
		blitGlyph(ctx, dpr, CRACK_GLYPH, tilePx * CRACK_SCALE, (entry.x + 0.5) * tilePx, (entry.y + 0.5) * tilePx)
	}

	blitGlyph(
		ctx,
		dpr,
		map.fridge.glyph,
		tilePx * FRIDGE_SCALE,
		(map.fridge.tile.x + 0.5) * tilePx,
		(map.fridge.tile.y + 0.5) * tilePx,
	)
}
