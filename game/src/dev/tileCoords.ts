/**
 * Pointer position to board position, in one place.
 *
 * The canvas is a fixed logical 1152 x 672 CSS-scaled to the window, so `offsetX / tilePx` is
 * wrong by whatever the scale factor is -- invisible at the centre of the board and a full tile at
 * the corners. Everything here goes through `getBoundingClientRect()` instead.
 *
 * Extracted from `dev/debug/state.ts`, which wrote it inline in step 3C. Both the debug overlay and
 * the map editor call it now (step 4B, decision 4). Flooring is deliberately **not** done here: the
 * editor needs the fractional position for waypoints and only the brush wants a tile index.
 */

import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '@/render/renderer.ts'
import type { Vec2 } from '@/core/types.ts'

/** Anything with client coordinates: a `PointerEvent`, a `MouseEvent`, a synthesised pair. */
export interface ClientPoint {
	clientX: number
	clientY: number
}

/**
 * Fractional grid position. Integers land on tile **corners**, so the tile under the pointer is the
 * component-wise `Math.floor` -- see `toTile`.
 *
 * Returns a point outside the board when the canvas has no layout box yet (display:none, or the
 * first event of a mount), rather than dividing by zero and handing back NaN.
 */
export function toGridPoint(canvas: HTMLCanvasElement, event: ClientPoint, widthTiles: number): Vec2 {
	const rect = canvas.getBoundingClientRect()
	if (rect.width === 0 || rect.height === 0 || widthTiles === 0) {
		return { x: -1, y: -1 }
	}

	const tilePx = LOGICAL_WIDTH / widthTiles
	const logicalX = (event.clientX - rect.left) * (LOGICAL_WIDTH / rect.width)
	const logicalY = (event.clientY - rect.top) * (LOGICAL_HEIGHT / rect.height)

	return { x: logicalX / tilePx, y: logicalY / tilePx }
}

/** The tile a grid position falls in. */
export function toTile(grid: Vec2): Vec2 {
	return { x: Math.floor(grid.x), y: Math.floor(grid.y) }
}

/**
 * Grid space to waypoint space.
 *
 * A waypoint at `(3, 4)` names the tile `3,4` and is drawn at its **centre**, so waypoint space sits
 * half a tile off grid space in both axes. `render/layers/track.ts` does the same `+ 0.5` on the way
 * out; this is the way in.
 */
export function gridToWaypoint(grid: Vec2): Vec2 {
	return { x: grid.x - 0.5, y: grid.y - 0.5 }
}

/** Waypoint space back to grid space. */
export function waypointToGrid(waypoint: Vec2): Vec2 {
	return { x: waypoint.x + 0.5, y: waypoint.y + 0.5 }
}

/** True while a tile index is on the board. */
export function isOnBoard(tile: Vec2, widthTiles: number, heightTiles: number): boolean {
	return tile.x >= 0 && tile.x < widthTiles && tile.y >= 0 && tile.y < heightTiles
}
