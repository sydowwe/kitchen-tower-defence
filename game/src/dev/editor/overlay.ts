/**
 * Everything the editor draws on top of the real board: grid, axis labels, waypoint handles, the
 * in-flight drag ghost, the hovered tile and a marker on every tile a `Problem` names.
 *
 * A pure draw on the **live** context after `Renderer.drawFrame`, exactly like
 * `dev/debug/overlay.ts` (step 4B, decision 3). None of it may reach the terrain bake: baked grid
 * lines and coordinate labels do not come back off, and the symptom is stale labels ghosting under
 * the new ones after a resize.
 *
 * The paths drawn here come from `EditorOverlayState`, not from the map -- the view applies the
 * pending drag to them first, which is how a waypoint follows the pointer without committing an
 * edit per pointermove (decision 1).
 */

import { waypointToGrid } from '@/dev/tileCoords.ts'
import { LOGICAL_WIDTH } from '@/render/renderer.ts'
import type { BrushChar } from '@/dev/editor/edits.ts'
import type { Problem } from '@/dev/editor/validate.ts'
import type { Vec2 } from '@/core/types.ts'

/** One per lane, cycled. Warm and saturated so they read over the track's brown. */
export const PATH_COLORS = ['#ffe066', '#7fd1ff', '#ff9ecb', '#9dff8a'] as const

const GRID_COLOR = 'rgba(255, 255, 255, 0.07)'
const AXIS_TEXT = 'rgba(255, 255, 255, 0.45)'
const HOVER_STROKE = 'rgba(255, 255, 255, 0.7)'
const ERROR_COLOR = 'rgba(255, 80, 80, 0.85)'
const WARN_COLOR = 'rgba(255, 190, 70, 0.8)'
const FOCUS_COLOR = 'rgba(255, 255, 255, 0.95)'
const INSERT_COLOR = 'rgba(255, 255, 255, 0.8)'
const FRIDGE_RING = 'rgba(120, 255, 200, 0.9)'

/** What the brush paints, as a tint over the tiles the stroke has touched so far. */
const BRUSH_TINTS: Record<BrushChar, string> = {
	'.': 'rgba(100, 200, 255, 0.35)',
	'#': 'rgba(255, 80, 80, 0.35)',
	'~': 'rgba(255, 200, 80, 0.35)',
}

const HANDLE_RADIUS_PX = 5
const AXIS_LABEL_EVERY = 2

/** A lane as the overlay draws it: waypoint space, drag ghost already applied. */
export interface OverlayPath {
	id: string
	waypoints: readonly Vec2[]
}

export interface EditorOverlayState {
	paths: readonly OverlayPath[]
	activePathIndex: number
	/** Fractional grid position of the pointer, or null while it is off the board. */
	hoverGrid: Vec2 | null
	/** Tiles the in-flight stroke has touched. Empty unless a brush drag is live. */
	brushTiles: readonly Vec2[]
	brushChar: BrushChar
	/** Ghost applied, so dragging the fridge moves the ring without re-baking the board. */
	fridgeTile: Vec2
	problems: readonly Problem[]
	/** The tile a clicked problem row named, highlighted until the next click. */
	focusTile: Vec2 | null
	/** Where a click would insert a waypoint, while the pointer hovers a segment. */
	insertPoint: Vec2 | null
	/** The handle being dragged, drawn larger. */
	draggingWaypoint: { pathIndex: number; waypointIndex: number } | null
	showGrid: boolean
}

export function pathColor(index: number): string {
	return PATH_COLORS[index % PATH_COLORS.length] ?? '#ffffff'
}

function drawGrid(ctx: CanvasRenderingContext2D, widthTiles: number, heightTiles: number, tilePx: number): void {
	ctx.strokeStyle = GRID_COLOR
	ctx.lineWidth = 1
	ctx.beginPath()
	for (let x = 0; x <= widthTiles; x++) {
		// Half-pixel offset: a 1px line on an integer coordinate straddles two device rows and
		// renders as a 2px smear at dpr 1.
		ctx.moveTo(Math.round(x * tilePx) + 0.5, 0)
		ctx.lineTo(Math.round(x * tilePx) + 0.5, heightTiles * tilePx)
	}
	for (let y = 0; y <= heightTiles; y++) {
		ctx.moveTo(0, Math.round(y * tilePx) + 0.5)
		ctx.lineTo(widthTiles * tilePx, Math.round(y * tilePx) + 0.5)
	}
	ctx.stroke()
}

function drawAxes(ctx: CanvasRenderingContext2D, widthTiles: number, heightTiles: number, tilePx: number): void {
	ctx.fillStyle = AXIS_TEXT
	ctx.font = '10px ui-monospace, monospace'
	ctx.textBaseline = 'top'
	ctx.textAlign = 'center'
	for (let x = 0; x < widthTiles; x += AXIS_LABEL_EVERY) {
		ctx.fillText(String(x), (x + 0.5) * tilePx, 2)
	}
	ctx.textAlign = 'left'
	for (let y = 0; y < heightTiles; y += AXIS_LABEL_EVERY) {
		ctx.fillText(String(y), 2, y * tilePx + 2)
	}
	ctx.textAlign = 'start'
}

function drawBrushGhost(ctx: CanvasRenderingContext2D, state: EditorOverlayState, tilePx: number): void {
	if (state.brushTiles.length === 0) {
		return
	}
	ctx.fillStyle = BRUSH_TINTS[state.brushChar]
	for (const tile of state.brushTiles) {
		ctx.fillRect(tile.x * tilePx, tile.y * tilePx, tilePx, tilePx)
	}
}

function drawLane(
	ctx: CanvasRenderingContext2D,
	path: OverlayPath,
	color: string,
	isActive: boolean,
	tilePx: number,
	dragging: { pathIndex: number; waypointIndex: number } | null,
	pathIndex: number,
): void {
	ctx.strokeStyle = color
	ctx.lineWidth = isActive ? 2.5 : 1.25
	ctx.globalAlpha = isActive ? 1 : 0.5
	ctx.beginPath()
	path.waypoints.forEach((waypoint, index) => {
		const grid = waypointToGrid(waypoint)
		const x = grid.x * tilePx
		const y = grid.y * tilePx
		if (index === 0) {
			ctx.moveTo(x, y)
		} else {
			ctx.lineTo(x, y)
		}
	})
	ctx.stroke()

	ctx.font = '10px ui-monospace, monospace'
	ctx.textBaseline = 'middle'
	ctx.textAlign = 'center'

	path.waypoints.forEach((waypoint, index) => {
		const grid = waypointToGrid(waypoint)
		const x = grid.x * tilePx
		const y = grid.y * tilePx
		const isDragged = dragging !== null && dragging.pathIndex === pathIndex && dragging.waypointIndex === index
		const radius = isDragged ? HANDLE_RADIUS_PX * 1.6 : HANDLE_RADIUS_PX

		ctx.fillStyle = color
		ctx.beginPath()
		ctx.arc(x, y, radius, 0, Math.PI * 2)
		ctx.fill()

		ctx.fillStyle = '#10131f'
		ctx.fillText(String(index), x, y + 0.5)
	})

	ctx.globalAlpha = 1
	ctx.textAlign = 'start'
	ctx.textBaseline = 'alphabetic'
}

function drawProblemMarkers(ctx: CanvasRenderingContext2D, state: EditorOverlayState, tilePx: number): void {
	for (const problem of state.problems) {
		const tile = problem.tile
		if (tile === undefined) {
			continue
		}
		ctx.strokeStyle = problem.severity === 'error' ? ERROR_COLOR : WARN_COLOR
		ctx.lineWidth = 2
		ctx.strokeRect(tile.x * tilePx + 1, tile.y * tilePx + 1, tilePx - 2, tilePx - 2)
	}
}

function drawFocus(ctx: CanvasRenderingContext2D, tile: Vec2, tilePx: number): void {
	ctx.strokeStyle = FOCUS_COLOR
	ctx.lineWidth = 2
	ctx.setLineDash([5, 4])
	ctx.strokeRect(tile.x * tilePx - 3, tile.y * tilePx - 3, tilePx + 6, tilePx + 6)
	ctx.setLineDash([])
}

function drawHover(ctx: CanvasRenderingContext2D, grid: Vec2, tilePx: number): void {
	const tile = { x: Math.floor(grid.x), y: Math.floor(grid.y) }
	ctx.strokeStyle = HOVER_STROKE
	ctx.lineWidth = 1.5
	ctx.strokeRect(tile.x * tilePx + 0.5, tile.y * tilePx + 0.5, tilePx - 1, tilePx - 1)

	const label = `${tile.x},${tile.y}`
	ctx.font = '11px ui-monospace, monospace'
	ctx.textBaseline = 'bottom'
	const width = ctx.measureText(label).width
	const boxX = Math.min(tile.x * tilePx, LOGICAL_WIDTH - width - 8)
	const boxY = Math.max(tile.y * tilePx, 16)
	ctx.fillStyle = 'rgba(10, 13, 22, 0.8)'
	ctx.fillRect(boxX, boxY - 14, width + 6, 14)
	ctx.fillStyle = '#e8e6f0'
	ctx.fillText(label, boxX + 3, boxY - 2)
	ctx.textBaseline = 'alphabetic'
}

/** The fridge as the editor sees it: a ring, so a mid-drag ghost is visible over the baked glyph. */
function drawFridgeRing(ctx: CanvasRenderingContext2D, tile: Vec2, tilePx: number): void {
	ctx.strokeStyle = FRIDGE_RING
	ctx.lineWidth = 2
	ctx.strokeRect(tile.x * tilePx + 2, tile.y * tilePx + 2, tilePx - 4, tilePx - 4)
}

function drawInsertPoint(ctx: CanvasRenderingContext2D, point: Vec2, tilePx: number): void {
	const grid = waypointToGrid(point)
	ctx.strokeStyle = INSERT_COLOR
	ctx.lineWidth = 1.5
	ctx.beginPath()
	ctx.arc(grid.x * tilePx, grid.y * tilePx, HANDLE_RADIUS_PX + 2, 0, Math.PI * 2)
	ctx.stroke()

	ctx.font = '12px ui-monospace, monospace'
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'
	ctx.fillStyle = INSERT_COLOR
	ctx.fillText('+', grid.x * tilePx, grid.y * tilePx)
	ctx.textAlign = 'start'
	ctx.textBaseline = 'alphabetic'
}

/**
 * One overlay pass, in logical pixels. `widthTiles`/`heightTiles` come from the document rather than
 * from `LOGICAL_WIDTH / tilePx`, because a half-finished imported map need not be 24 x 14.
 */
export function drawEditorOverlay(
	ctx: CanvasRenderingContext2D,
	state: EditorOverlayState,
	widthTiles: number,
	heightTiles: number,
	tilePx: number,
): void {
	if (tilePx <= 0) {
		return
	}

	if (state.showGrid) {
		drawGrid(ctx, widthTiles, heightTiles, tilePx)
		drawAxes(ctx, widthTiles, heightTiles, tilePx)
	}

	drawBrushGhost(ctx, state, tilePx)
	drawProblemMarkers(ctx, state, tilePx)
	drawFridgeRing(ctx, state.fridgeTile, tilePx)

	state.paths.forEach((path, index) => {
		drawLane(ctx, path, pathColor(index), index === state.activePathIndex, tilePx, state.draggingWaypoint, index)
	})

	if (state.insertPoint !== null) {
		drawInsertPoint(ctx, state.insertPoint, tilePx)
	}
	if (state.focusTile !== null) {
		drawFocus(ctx, state.focusTile, tilePx)
	}
	if (state.hoverGrid !== null) {
		drawHover(ctx, state.hoverGrid, tilePx)
	}
}
