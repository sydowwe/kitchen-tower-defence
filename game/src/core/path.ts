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

/**
 * The sampled point displaced sideways off its own lane -- the one enemy in v1 that leaves the
 * polyline (the Moth), expressed as an offset rather than as free movement.
 *
 * **The normal is `(-sin(angle), cos(angle))`: a positive `lateralTiles` displaces along the heading
 * turned a quarter turn, so on a lane running `+x` it moves the point toward `+y`.** Nothing else in
 * the codebase fixes that sign, and step 18's pushback will want it. The angle convention is
 * `atan2(dy, dx)` (`core/systems/hitbox.ts`), which is what the two terms below are turning.
 *
 * One function and two callers -- `enemyPosition` and `render/layers/entities.ts`, which already
 * holds the sample for its mirroring. A second copy of the trig is how the drawn moth and the shot
 * moth end up in different places, with nothing failing.
 */
export function applyLateralOffset(at: { x: number; y: number; angle: number }, lateralTiles: number): Vec2 {
	return {
		x: at.x - Math.sin(at.angle) * lateralTiles,
		y: at.y + Math.cos(at.angle) * lateralTiles,
	}
}

/**
 * The inverse of `samplePath`: the arc distance of the point on the polyline closest to `point`, and
 * how far off the track `point` sits. Step 7B hatches a Fruit Fly at the returned distance; step 11's
 * moth deviation and step 18's pushback want the same projection rather than a second copy of it.
 *
 * **Projected onto each segment with `t` clamped to `[0, 1]`, never onto the infinite line.** A point
 * outside the elbow of a corner projects onto the *extension* of both segments if you forget, and the
 * result is an arc distance the track does not reach there -- several tiles from the point asked
 * about. Ties go to the earlier segment, so the answer does not depend on iteration luck.
 *
 * A path with no segments comes back at distance 0 with an infinite offset, which is what keeps
 * `nearestPath` from ever choosing it.
 */
export function nearestOnPath(path: Path, point: Vec2): { distance: number; offsetTiles: number } {
	const { cumulative } = tableFor(path)
	let bestDistance = 0
	let bestOffsetSquared = Infinity

	for (let index = 0; index + 1 < path.waypoints.length; index++) {
		const from = path.waypoints[index]
		const to = path.waypoints[index + 1]
		const start = cumulative[index]
		if (from === undefined || to === undefined || start === undefined) {
			continue
		}

		const dx = to.x - from.x
		const dy = to.y - from.y
		const lengthSquared = dx * dx + dy * dy

		// Same guard as `samplePath`: coincident waypoints are rejected by the map schema, but a
		// production build has no zod left and a NaN here would surface as an enemy at NaN distance.
		const projected = lengthSquared > 0 ? ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared : 0
		const t = Math.min(Math.max(projected, 0), 1)

		const offsetX = point.x - (from.x + dx * t)
		const offsetY = point.y - (from.y + dy * t)
		const offsetSquared = offsetX * offsetX + offsetY * offsetY

		if (offsetSquared < bestOffsetSquared) {
			bestOffsetSquared = offsetSquared
			bestDistance = start + Math.sqrt(lengthSquared) * t
		}
	}

	return { distance: bestDistance, offsetTiles: Math.sqrt(bestOffsetSquared) }
}

/**
 * The lane `point` is nearest to, by off-track offset, and where along it. Ties go to the earlier
 * entry of `paths`, so a crumb exactly between two lanes joins the same one on a replay.
 *
 * Null for an empty `paths` array -- a half-edited map out of step 4's editor, which every other
 * caller in `core/` also tolerates rather than throwing on.
 */
export function nearestPath(paths: readonly Path[], point: Vec2): { pathId: string; distance: number } | null {
	let best: { pathId: string; distance: number } | null = null
	let bestOffset = Infinity

	for (const path of paths) {
		const found = nearestOnPath(path, point)
		if (found.offsetTiles < bestOffset) {
			bestOffset = found.offsetTiles
			best = { pathId: path.id, distance: found.distance }
		}
	}

	return best
}
