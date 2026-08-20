/**
 * The debug overlay's draw pass: tile flags, waypoints, path lengths, the hover readout and the
 * marker. Drawn straight onto the **live** context, never baked -- unlike `render/layers/terrain.ts`
 * and `track.ts`, every element here changes from frame to frame.
 *
 * A pure draw, like its `render/layers/` counterparts: state and the map in, pixels out, no module
 * state of its own. `dev/debug/state.ts` owns everything mutable.
 */

import { TileFlags } from '@/core/map.ts'
import { samplePath, totalLength } from '@/core/path.ts'
import type { DebugState } from '@/dev/debug/state.ts'
import { EMOJI_FONT } from '@/render/glyphCache.ts'
import type { MapDef, Path } from '@/core/types.ts'

const FLAG_TINTS: ReadonlyArray<{ flag: number; label: string; color: string }> = [
	{ flag: TileFlags.BUILDABLE, label: 'buildable', color: 'rgba(100, 200, 255, 0.22)' },
	{ flag: TileFlags.BLOCKED, label: 'blocked', color: 'rgba(255, 80, 80, 0.28)' },
	{ flag: TileFlags.DECOR, label: 'decor', color: 'rgba(255, 200, 80, 0.28)' },
	{ flag: TileFlags.TRACK, label: 'track', color: 'rgba(120, 255, 120, 0.22)' },
]

const INACTIVE_PATH_COLOR = 'rgba(255, 255, 255, 0.35)'
const ACTIVE_PATH_COLOR = 'rgba(255, 255, 0, 0.9)'
const MARKER_COLOR = '#fff44f'
const TEXT_COLOR = 'rgba(255, 255, 255, 0.9)'
const TEXT_BACKDROP = 'rgba(10, 12, 20, 0.75)'

const WAYPOINT_RADIUS_PX = 3
const MARKER_GLYPH = '➤'

function tileCenter(tile: { x: number; y: number }, tilePx: number): { x: number; y: number } {
	return { x: (tile.x + 0.5) * tilePx, y: (tile.y + 0.5) * tilePx }
}

/** A small filled label, so overlay text stays legible over whatever tint or glyph sits under it. */
function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
	ctx.font = '11px ui-monospace, monospace'
	ctx.textBaseline = 'top'
	const width = ctx.measureText(text).width
	ctx.fillStyle = TEXT_BACKDROP
	ctx.fillRect(x - 2, y - 1, width + 4, 14)
	ctx.fillStyle = TEXT_COLOR
	ctx.fillText(text, x, y)
}

function drawFlagTints(ctx: CanvasRenderingContext2D, map: MapDef, tilePx: number): void {
	for (let y = 0; y < map.heightTiles; y++) {
		for (let x = 0; x < map.widthTiles; x++) {
			const flags = map.flags[y * map.widthTiles + x] ?? 0
			for (const tint of FLAG_TINTS) {
				if ((flags & tint.flag) !== 0) {
					ctx.fillStyle = tint.color
					ctx.fillRect(x * tilePx, y * tilePx, tilePx, tilePx)
				}
			}
		}
	}
}

function drawLegend(ctx: CanvasRenderingContext2D): void {
	const x = 10
	let y = 10
	for (const tint of FLAG_TINTS) {
		ctx.fillStyle = tint.color
		ctx.fillRect(x, y, 12, 12)
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
		ctx.strokeRect(x, y, 12, 12)
		ctx.fillStyle = TEXT_COLOR
		ctx.font = '11px ui-monospace, monospace'
		ctx.textBaseline = 'top'
		ctx.fillText(tint.label, x + 16, y + 1)
		y += 16
	}
}

function drawWaypointsAndArrows(ctx: CanvasRenderingContext2D, path: Path, tilePx: number, isActive: boolean): void {
	ctx.strokeStyle = isActive ? ACTIVE_PATH_COLOR : INACTIVE_PATH_COLOR
	ctx.lineWidth = isActive ? 2 : 1
	ctx.beginPath()
	path.waypoints.forEach((waypoint, index) => {
		const { x, y } = tileCenter(waypoint, tilePx)
		if (index === 0) {
			ctx.moveTo(x, y)
		} else {
			ctx.lineTo(x, y)
		}
	})
	ctx.stroke()

	path.waypoints.forEach((waypoint, index) => {
		const { x, y } = tileCenter(waypoint, tilePx)
		ctx.fillStyle = isActive ? ACTIVE_PATH_COLOR : INACTIVE_PATH_COLOR
		ctx.beginPath()
		ctx.arc(x, y, WAYPOINT_RADIUS_PX, 0, Math.PI * 2)
		ctx.fill()
		drawLabel(ctx, String(index), x + 5, y + 5)
	})

	for (let i = 1; i < path.waypoints.length; i++) {
		const from = path.waypoints[i - 1]
		const to = path.waypoints[i]
		if (from === undefined || to === undefined) {
			continue
		}
		const mid = tileCenter({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, tilePx)
		const angle = Math.atan2(to.y - from.y, to.x - from.x)
		drawArrowhead(ctx, mid.x, mid.y, angle, isActive ? ACTIVE_PATH_COLOR : INACTIVE_PATH_COLOR)
	}
}

function drawArrowhead(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, color: string): void {
	const size = 6
	ctx.save()
	ctx.translate(x, y)
	ctx.rotate(angle)
	ctx.fillStyle = color
	ctx.beginPath()
	ctx.moveTo(size, 0)
	ctx.lineTo(-size * 0.6, size * 0.6)
	ctx.lineTo(-size * 0.6, -size * 0.6)
	ctx.closePath()
	ctx.fill()
	ctx.restore()
}

function drawPathLengths(ctx: CanvasRenderingContext2D, map: MapDef, activeIndex: number): void {
	let y = 10
	const x = 120
	map.paths.forEach((path, index) => {
		const label = `${path.id}: ${totalLength(path).toFixed(1)}t${index === activeIndex ? ' (active)' : ''}`
		drawLabel(ctx, label, x, y)
		y += 16
	})
}

function drawHover(ctx: CanvasRenderingContext2D, map: MapDef, state: DebugState, tilePx: number): void {
	if (state.hoverTile === null) {
		return
	}
	const flags = map.flags[state.hoverTile.y * map.widthTiles + state.hoverTile.x] ?? 0
	const names = FLAG_TINTS.filter(tint => (flags & tint.flag) !== 0)
		.map(tint => tint.label)
		.join(',')
	const { x, y } = tileCenter(state.hoverTile, tilePx)
	drawLabel(ctx, `${state.hoverTile.x},${state.hoverTile.y} [${names || 'none'}]`, x + 8, y - 18)
}

/** `samplePath` returns tile-space coordinates, like every waypoint in `Path`; the draw needs pixels. */
function drawMarker(ctx: CanvasRenderingContext2D, path: Path, distance: number, tilePx: number): void {
	const sample = samplePath(path, distance)
	const { x, y } = tileCenter(sample, tilePx)

	ctx.save()
	ctx.translate(x, y)
	ctx.rotate(sample.angle)
	ctx.font = `20px ${EMOJI_FONT}`
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'
	ctx.fillStyle = MARKER_COLOR
	ctx.fillText(MARKER_GLYPH, 0, 0)
	ctx.restore()

	drawLabel(ctx, `${distance.toFixed(2)}t`, x + 10, y + 10)
}

/**
 * Everything the overlay draws, in world-space logical pixels. Called from `GameView.vue` after
 * `Renderer.drawFrame`, and only when `state.enabled` -- behind the same `import.meta.env.DEV`
 * branch that keeps this file out of the production bundle entirely.
 */
export function drawDebugOverlay(ctx: CanvasRenderingContext2D, map: MapDef, state: DebugState, tilePx: number): void {
	drawFlagTints(ctx, map, tilePx)

	map.paths.forEach((path, index) => {
		drawWaypointsAndArrows(ctx, path, tilePx, index === state.activePathIndex)
	})

	const activePath = map.paths[state.activePathIndex]
	if (activePath !== undefined) {
		drawMarker(ctx, activePath, state.markerDistance, tilePx)
	}

	drawLegend(ctx)
	drawPathLengths(ctx, map, state.activePathIndex)
	drawHover(ctx, map, state, tilePx)
}
