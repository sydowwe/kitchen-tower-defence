/**
 * The maths that turns one float into a position on the track.
 *
 * An enemy is `{ pathId, distance }` (analytic-docs/DECISIONS.md section 3), so this file runs for
 * every enemy every tick from step 5 on. Hence the arc-length table and the binary search rather
 * than walking the polyline from the start.
 *
 * **The table never goes on the world.** It is derived from waypoints that never change, so it is a
 * cache, not state -- keeping it in `World` would put a second, redundant truth into every replay
 * and every save. It is keyed by the `Path` **object** and not its id, so each world's cloned map
 * gets its own entry and step 4's half-edited map cannot pick up a stale one.
 */

import type { Path, Vec2 } from '@/core/types.ts'

/** Cumulative arc length at each waypoint. `cumulative[0]` is 0; the last entry is the total. */
interface PathTable {
	cumulative: number[]
	total: number
}

const TABLES = new WeakMap<Path, PathTable>()

function buildTable(path: Path): PathTable {
	const cumulative: number[] = [0]
	let total = 0

	for (let i = 1; i < path.waypoints.length; i++) {
		const from = path.waypoints[i - 1]
		const to = path.waypoints[i]
		if (from !== undefined && to !== undefined) {
			total += Math.hypot(to.x - from.x, to.y - from.y)
		}
		cumulative.push(total)
	}

	return { cumulative, total }
}

function tableFor(path: Path): PathTable {
	const cached = TABLES.get(path)
	if (cached !== undefined) {
		return cached
	}
	const built = buildTable(path)
	TABLES.set(path, built)
	return built
}

/**
 * The measured length of the polyline, which `loadMap` has already checked against the authored
 * `lengthTiles`. Read this rather than the field, so nothing depends on which of the two is right.
 */
export function totalLength(path: Path): number {
	return tableFor(path).total
}

/**
 * Track distance still to walk. **Along the path, not euclidean to the fridge** -- `FIRST` and
 * `LAST` on a multi-path map compare this, and a straight-line distance would make the tower prefer
 * whichever lane happens to be longer (analytic-docs/CONTENT.md section 5).
 */
export function remainingToFridge(path: Path, distance: number): number {
	const { total } = tableFor(path)
	return total - Math.min(Math.max(distance, 0), total)
}

/**
 * The index of the segment that contains `distance`: the largest `i` with `cumulative[i] <= d`,
 * capped at the last segment.
 *
 * At a distance landing exactly on a waypoint, two segments are equally valid. This returns the one
 * being **entered**, which is what stops the angle flipping back and forth every time an enemy
 * crosses a corner -- the renderer would show that as a one-frame stutter looking like a physics bug.
 */
function segmentAt(cumulative: readonly number[], distance: number): number {
	let low = 0
	let high = cumulative.length - 2

	while (low < high) {
		const mid = Math.ceil((low + high) / 2)
		if ((cumulative[mid] ?? 0) <= distance) {
			low = mid
		} else {
			high = mid - 1
		}
	}

	return low
}

/**
 * Position and heading at `distance` tiles along the track. Clamped at both ends: past the fridge
 * is the last waypoint, and a negative distance is the first -- step 18's pushback hands out
 * negative ones routinely.
 */
export function samplePath(path: Path, distance: number): { x: number; y: number; angle: number } {
	const { cumulative, total } = tableFor(path)
	const clamped = Math.min(Math.max(distance, 0), total)
	const index = segmentAt(cumulative, clamped)

	const from = path.waypoints[index] ?? ({ x: 0, y: 0 } satisfies Vec2)
	const to = path.waypoints[index + 1] ?? from
	const start = cumulative[index] ?? 0
	const segmentLength = (cumulative[index + 1] ?? start) - start

	// Zero-length segments are rejected by the map schema, but a production build has no zod left,
	// so a coincident pair must not come out as a NaN angle three systems away.
	const t = segmentLength > 0 ? (clamped - start) / segmentLength : 0

	return {
		x: from.x + (to.x - from.x) * t,
		y: from.y + (to.y - from.y) * t,
		angle: Math.atan2(to.y - from.y, to.x - from.x),
	}
}
