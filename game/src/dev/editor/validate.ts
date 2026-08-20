/**
 * The rules a map is judged against while it is being authored.
 *
 * Deliberately the *second* validator, and the soft one. zod in `core/content/schema.ts` is the
 * hard gate at import and export; this list is advisory and re-runs on every edit, so a map that is
 * half-drawn -- one waypoint, a lane that stops in the middle of the counter -- is allowed to fail
 * it. Nothing here ever throws (step 4A, decision 5).
 *
 * `errors` are the subset zod or `loadMap` would refuse outright, surfaced here so they are found
 * mid-drag rather than at export. `warns` load and play badly.
 */

import { canPlace, flagsAt, TileFlags } from '@/core/map.ts'
import { totalLength } from '@/core/path.ts'
import type { MapSource } from '@/core/content/schema.ts'
import type { MapDef, Path, Vec2 } from '@/core/types.ts'

export type Severity = 'error' | 'warn'

/**
 * One line in the editor's problem panel. The optional fields are what 4B highlights on the board;
 * a problem about the map as a whole carries none of them.
 */
export interface Problem {
	severity: Severity
	message: string
	pathId?: string
	waypointIndex?: number
	tile?: Vec2
}

// These four mirror module-private constants in `core/content/schema.ts`. They are restated rather
// than exported from `core/`, because step 4A must not change `core/` -- and because the schema's
// copies are the hard gate, while these only decide what the panel says a second earlier.

/** Below this, two waypoints are a double-click rather than a segment. */
const MIN_WAYPOINT_GAP_TILES = 0.1

/** How far a path's last waypoint may sit from the fridge tile. */
const MAX_FRIDGE_GAP_TILES = 1

/** A shorter track gives towers nothing to shoot at; a longer one runs out of night. */
const MIN_TRACK_TILES = 20
const MAX_TRACK_TILES = 60

/** Beyond this a segment reads as a straight corridor rather than a route. */
const MAX_SEGMENT_TILES = 6

/** Under this share of the board there is nowhere to build (step 4A, decision 7). */
const MIN_BUILDABLE_PERCENT = 25

/** How finely a polyline is walked when listing the tiles it crosses. Matches `core/map.ts`. */
const TRACE_STEP_TILES = 0.25

function distance(a: Vec2, b: Vec2): number {
	return Math.hypot(b.x - a.x, b.y - a.y)
}

/**
 * The share of the board a tower may actually stand on, as a percentage.
 *
 * Asks `canPlace(..., 'off_path')` rather than counting `.` characters, so track tiles and decor
 * drop out exactly as they do for the player (step 4A, decision 7). Exported because the snapshot
 * reports it and the warning below fires on it -- two counts of the same thing would eventually
 * disagree.
 */
export function buildablePercent(map: MapDef): number {
	const total = map.widthTiles * map.heightTiles
	if (total === 0) {
		return 0
	}

	let buildable = 0
	for (let y = 0; y < map.heightTiles; y++) {
		for (let x = 0; x < map.widthTiles; x++) {
			if (canPlace(map, { x, y }, 'off_path')) {
				buildable++
			}
		}
	}

	return (buildable / total) * 100
}

/**
 * The centre-line tiles a path crosses, in order, without repeats back to back. Not the rasterised
 * `TRACK` band: convergence is a question about where the lanes *run*, and a one-tile track marks
 * both neighbours wherever a sample lands on a tile boundary.
 */
function tileSequence(path: Path): Vec2[] {
	const tiles: Vec2[] = []

	function push(tile: Vec2): void {
		const last = tiles[tiles.length - 1]
		if (last !== undefined && last.x === tile.x && last.y === tile.y) {
			return
		}
		tiles.push(tile)
	}

	for (let i = 1; i < path.waypoints.length; i++) {
		const from = path.waypoints[i - 1]
		const to = path.waypoints[i]
		if (from === undefined || to === undefined) {
			continue
		}

		const steps = Math.max(1, Math.ceil(distance(from, to) / TRACE_STEP_TILES))
		for (let step = 0; step <= steps; step++) {
			const t = step / steps
			push({ x: Math.round(from.x + (to.x - from.x) * t), y: Math.round(from.y + (to.y - from.y) * t) })
		}
	}

	return tiles
}

/** One pair of lanes, and how much track they have in common on the way in to the fridge. */
export interface Convergence {
	pathIds: [string, string]
	/**
	 * The first tile of the shared final stretch. When the lanes share nothing, this is the last
	 * tile of the first path -- the two arrive separately, and that is where to look.
	 */
	mergeTile: Vec2
	sharedTiles: number
}

/**
 * Where the lanes of a multi-path map meet, per pair.
 *
 * Returns the count rather than a boolean because `DECISIONS.md` section 3 wants merged lanes so
 * one late tower still covers everything, and step 21 asserts the shared stretch is at least six
 * tiles. A single-path map returns an empty array.
 */
export function convergenceOf(map: MapDef): Convergence[] {
	const sequences = map.paths.map(path => ({ id: path.id, tiles: tileSequence(path) }))
	const report: Convergence[] = []

	for (let a = 0; a < sequences.length; a++) {
		for (let b = a + 1; b < sequences.length; b++) {
			const left = sequences[a]
			const right = sequences[b]
			if (left === undefined || right === undefined) {
				continue
			}

			let shared = 0
			while (shared < left.tiles.length && shared < right.tiles.length) {
				const l = left.tiles[left.tiles.length - 1 - shared]
				const r = right.tiles[right.tiles.length - 1 - shared]
				if (l === undefined || r === undefined || l.x !== r.x || l.y !== r.y) {
					break
				}
				shared++
			}

			const mergeIndex = left.tiles.length - Math.max(shared, 1)
			const mergeTile = left.tiles[mergeIndex] ?? { x: 0, y: 0 }

			report.push({
				pathIds: [left.id, right.id],
				mergeTile: { x: mergeTile.x, y: mergeTile.y },
				sharedTiles: shared,
			})
		}
	}

	return report
}

/**
 * Every problem with the map as it currently stands. Reads the authored `source` for the things a
 * human typed (waypoint coordinates, decor placement) and the derived `map` for the things
 * `loadMap` worked out (the rasterised track, what is buildable), because those are the two
 * different questions and mixing them is how the editor ends up permitting a map the game refuses.
 */
export function validateEditorMap(source: MapSource, map: MapDef): Problem[] {
	const problems: Problem[] = []

	function error(message: string, extra: Omit<Problem, 'severity' | 'message'> = {}): void {
		problems.push({ severity: 'error', message, ...extra })
	}

	function warn(message: string, extra: Omit<Problem, 'severity' | 'message'> = {}): void {
		problems.push({ severity: 'warn', message, ...extra })
	}

	function inside(point: Vec2): boolean {
		return point.x >= 0 && point.x <= source.widthTiles - 1 && point.y >= 0 && point.y <= source.heightTiles - 1
	}

	// --- errors: the map cannot ship ------------------------------------------------------------

	if (source.paths.length === 0) {
		error('the map has no paths')
	}

	if (!inside(source.fridge.tile)) {
		error('the fridge is outside the board', { tile: source.fridge.tile })
	}

	source.decor?.forEach(entry => {
		if (!inside(entry.tile)) {
			error(`decor '${entry.glyph}' is outside the board`, { tile: entry.tile })
		}
	})

	for (const path of source.paths) {
		if (path.waypoints.length < 2) {
			error(`path '${path.id}' has fewer than two waypoints`, { pathId: path.id })
		}

		path.waypoints.forEach((waypoint, index) => {
			if (!inside(waypoint)) {
				error(`path '${path.id}' waypoint ${index} is outside the board`, {
					pathId: path.id,
					waypointIndex: index,
					tile: waypoint,
				})
			}

			const previous = path.waypoints[index - 1]
			if (previous !== undefined && distance(previous, waypoint) < MIN_WAYPOINT_GAP_TILES) {
				error(
					`path '${path.id}' waypoints ${index - 1} and ${index} are less than ${MIN_WAYPOINT_GAP_TILES} tiles apart`,
					{ pathId: path.id, waypointIndex: index, tile: waypoint },
				)
			}
		})

		const last = path.waypoints[path.waypoints.length - 1]
		if (last !== undefined && distance(last, source.fridge.tile) > MAX_FRIDGE_GAP_TILES) {
			error(`path '${path.id}' does not end at the fridge`, {
				pathId: path.id,
				waypointIndex: path.waypoints.length - 1,
				tile: last,
			})
		}
	}

	// A `#` under the track is not a zod rule, but `canPlace` refuses `path_only` on a blocked tile:
	// the barricade slot silently disappears while enemies keep walking through it.
	for (let y = 0; y < map.heightTiles; y++) {
		for (let x = 0; x < map.widthTiles; x++) {
			const flags = flagsAt(map, { x, y })
			if ((flags & TileFlags.TRACK) !== 0 && (flags & TileFlags.BLOCKED) !== 0) {
				error(`tile ${x},${y} is blocked but the track crosses it`, { tile: { x, y } })
			}
		}
	}

	// --- warnings: it loads, but it will not play well -------------------------------------------

	for (const path of map.paths) {
		const length = totalLength(path)
		if (length < MIN_TRACK_TILES) {
			warn(`path '${path.id}' is ${length.toFixed(1)} tiles, shorter than ${MIN_TRACK_TILES}`, {
				pathId: path.id,
			})
		}
		if (length > MAX_TRACK_TILES) {
			warn(`path '${path.id}' is ${length.toFixed(1)} tiles, longer than ${MAX_TRACK_TILES}`, {
				pathId: path.id,
			})
		}

		for (let i = 1; i < path.waypoints.length; i++) {
			const from = path.waypoints[i - 1]
			const to = path.waypoints[i]
			if (from === undefined || to === undefined) {
				continue
			}
			const segment = distance(from, to)
			if (segment > MAX_SEGMENT_TILES) {
				warn(`path '${path.id}' segment ${i - 1}-${i} is ${segment.toFixed(2)} tiles, a straight corridor`, {
					pathId: path.id,
					waypointIndex: i,
					tile: to,
				})
			}
		}
	}

	const buildable = buildablePercent(map)
	if (buildable < MIN_BUILDABLE_PERCENT) {
		warn(`only ${buildable.toFixed(0)}% of the board is buildable, under ${MIN_BUILDABLE_PERCENT}%`)
	}

	return problems
}
