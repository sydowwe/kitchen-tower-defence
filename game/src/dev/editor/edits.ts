/**
 * Every way the editor changes a map, as plain mutators on a draft `MapSource`.
 *
 * Each one is the body of exactly one `doc.edit()` call, which is one undo entry and one terrain
 * bake (step 4B, decision 1) -- so a whole brush stroke arrives here as a tile list, not as forty
 * calls. Nothing here reads the canvas, the pointer or Vue: the view decides *what* the gesture was
 * and this file decides what that does to the map.
 *
 * Nothing here validates either. `validate.ts` re-runs on every commit and says what went wrong;
 * a mutator that refused a bad edit would just make the panel lie about the state of the map.
 */

import type { MapSource } from '@/core/content/schema.ts'
import type { Vec2 } from '@/core/types.ts'

/** `.` buildable, `#` blocked, `~` decor. `T` is not paintable -- track comes from the polyline. */
export const BRUSH_CHARS = ['.', '#', '~'] as const

export type BrushChar = (typeof BRUSH_CHARS)[number]

/** What a right-drag paints back. */
export const ERASE_CHAR: BrushChar = '.'

export const MIN_BRUSH_TILES = 1
export const MAX_BRUSH_TILES = 5

/**
 * How close a new waypoint may come to the one it follows before the gesture is rejected outright.
 *
 * Comfortably above `validate.ts`'s `MIN_WAYPOINT_GAP_TILES` of 0.1: that constant is the report,
 * this one is the prevention. A double-click on empty board is two appends of the same point, and
 * catching it at the source beats explaining it in the problem panel afterwards (step 4B, section 4).
 */
export const MIN_GESTURE_GAP_TILES = 0.35

function distance(a: Vec2, b: Vec2): number {
	return Math.hypot(b.x - a.x, b.y - a.y)
}

/** The square of tiles a brush of `size` covers when its pointer is over `tile`. */
export function brushFootprint(tile: Vec2, size: number, widthTiles: number, heightTiles: number): Vec2[] {
	const span = Math.min(Math.max(Math.round(size), MIN_BRUSH_TILES), MAX_BRUSH_TILES)
	const back = Math.floor((span - 1) / 2)
	const tiles: Vec2[] = []

	for (let dy = 0; dy < span; dy++) {
		for (let dx = 0; dx < span; dx++) {
			const x = tile.x - back + dx
			const y = tile.y - back + dy
			if (x >= 0 && x < widthTiles && y >= 0 && y < heightTiles) {
				tiles.push({ x, y })
			}
		}
	}

	return tiles
}

/**
 * The tiles between two pointer samples, inclusive of both.
 *
 * A pointermove at 60Hz over a board dragged quickly skips whole tiles, and the symptom is a dotted
 * stroke. Walked at half-tile steps rather than a proper Bresenham because the caller de-duplicates
 * through a `Set` anyway.
 */
export function tilesBetween(from: Vec2, to: Vec2): Vec2[] {
	const steps = Math.max(1, Math.ceil(distance(from, to) * 2))
	const tiles: Vec2[] = []

	for (let step = 0; step <= steps; step++) {
		const t = step / steps
		tiles.push({
			x: Math.round(from.x + (to.x - from.x) * t),
			y: Math.round(from.y + (to.y - from.y) * t),
		})
	}

	return tiles
}

/** Applies one char to a set of tiles. Rows are strings, so each touched row is rebuilt once. */
export function paintTiles(draft: MapSource, tiles: readonly Vec2[], char: BrushChar): void {
	const byRow = new Map<number, Set<number>>()
	for (const tile of tiles) {
		if (tile.y < 0 || tile.y >= draft.heightTiles || tile.x < 0 || tile.x >= draft.widthTiles) {
			continue
		}
		let row = byRow.get(tile.y)
		if (row === undefined) {
			row = new Set<number>()
			byRow.set(tile.y, row)
		}
		row.add(tile.x)
	}

	for (const [y, columns] of byRow) {
		const row = draft.tiles[y]
		if (row === undefined) {
			continue
		}
		const chars = Array.from(row)
		for (const x of columns) {
			chars[x] = char
		}
		draft.tiles[y] = chars.join('')
	}
}

/** True when a waypoint at `point` would sit on top of the one it follows. */
export function isTooCloseToAppend(draft: MapSource, pathIndex: number, point: Vec2): boolean {
	const path = draft.paths[pathIndex]
	const last = path?.waypoints[path.waypoints.length - 1]
	return last !== undefined && distance(last, point) < MIN_GESTURE_GAP_TILES
}

export function appendWaypoint(draft: MapSource, pathIndex: number, point: Vec2): void {
	draft.paths[pathIndex]?.waypoints.push({ x: point.x, y: point.y })
}

export function insertWaypoint(draft: MapSource, pathIndex: number, index: number, point: Vec2): void {
	draft.paths[pathIndex]?.waypoints.splice(index, 0, { x: point.x, y: point.y })
}

export function moveWaypoint(draft: MapSource, pathIndex: number, index: number, point: Vec2): void {
	const waypoints = draft.paths[pathIndex]?.waypoints
	if (waypoints === undefined || waypoints[index] === undefined) {
		return
	}
	waypoints[index] = { x: point.x, y: point.y }
}

export function deleteWaypoint(draft: MapSource, pathIndex: number, index: number): void {
	draft.paths[pathIndex]?.waypoints.splice(index, 1)
}

/** The next free `laneN` id. Path ids are def ids, so camelCase with digits allowed. */
export function nextPathId(source: MapSource): string {
	const taken = new Set(source.paths.map(path => path.id))
	if (!taken.has('lane')) {
		return 'lane'
	}
	for (let n = 2; ; n++) {
		const id = `lane${n}`
		if (!taken.has(id)) {
			return id
		}
	}
}

/**
 * A new lane, seeded with two waypoints so it loads: one on the left edge (the crack) and one at the
 * fridge. Nudging both into place is the same gesture as editing any other waypoint.
 */
export function addPath(draft: MapSource, id: string): void {
	const entry: Vec2 = { x: 0, y: Math.floor(draft.heightTiles / 2) }
	const fridge = draft.fridge.tile
	draft.paths.push({
		id,
		waypoints: [entry, { x: fridge.x, y: fridge.y }],
		// Overwritten by `recomputeLengths` before the edit commits; positive so the schema would
		// accept this object on its own.
		lengthTiles: 1,
	})
}

export function deletePath(draft: MapSource, pathIndex: number): void {
	draft.paths.splice(pathIndex, 1)
}

export function moveFridge(draft: MapSource, tile: Vec2): void {
	draft.fridge.tile = { x: tile.x, y: tile.y }
}

/** The index of the decor glyph on `tile`, or -1. Decor glyphs are one per tile by construction. */
export function decorIndexAt(source: MapSource, tile: Vec2): number {
	return source.decor?.findIndex(entry => entry.tile.x === tile.x && entry.tile.y === tile.y) ?? -1
}

/**
 * Places a scenery glyph. This is **not** the `~` brush: the glyph is drawn on top and changes
 * nothing about placement, while `~` is what makes the tile unbuildable (step 4B, section 5).
 */
export function placeDecor(draft: MapSource, glyph: string, tile: Vec2): void {
	const existing = decorIndexAt(draft, tile)
	if (existing >= 0) {
		draft.decor?.splice(existing, 1)
	}
	draft.decor ??= []
	draft.decor.push({ glyph, tile: { x: tile.x, y: tile.y } })
}

/** Removes the glyph on `tile`, and the whole `decor` key with the last one -- `toJson` omits it. */
export function removeDecor(draft: MapSource, tile: Vec2): void {
	const index = decorIndexAt(draft, tile)
	if (index < 0 || draft.decor === undefined) {
		return
	}
	draft.decor.splice(index, 1)
	if (draft.decor.length === 0) {
		delete draft.decor
	}
}
