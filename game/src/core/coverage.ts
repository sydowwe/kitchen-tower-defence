/**
 * How much track a tower standing on a tile would reach: the question the balance harness's
 * placement asks, and the one a "recommended tile" hint would ask of an empty board. Hence the map
 * and no world.
 *
 * **The targeting measure, and no other**: from the tile's centre, euclidean, inclusive -- what
 * `queryEnemiesInRange` in `core/systems/spatial.ts` asks of an enemy's sampled position. A tile
 * ranked by any other reach is ranked by a reach the tower does not have.
 */

import type { MapDef, Vec2 } from '@/core/types.ts'

/**
 * The length of the segment `from`-`to` inside the circle: the chord the circle cuts from the
 * segment's line, clipped to the segment. 0 for a circle that does not reach it, and for a circle that
 * only touches it.
 */
function chordOnSegment(from: Vec2, to: Vec2, centre: Vec2, rangeTiles: number): number {
	const dx = to.x - from.x
	const dy = to.y - from.y
	const length = Math.hypot(dx, dy)
	if (length === 0) {
		return 0
	}

	// Along the segment from `from`, and squared off it.
	const along = ((centre.x - from.x) * dx + (centre.y - from.y) * dy) / length
	const offX = centre.x - from.x
	const offY = centre.y - from.y
	const offSquared = Math.max(0, offX * offX + offY * offY - along * along)
	const reachSquared = rangeTiles * rangeTiles - offSquared
	if (reachSquared <= 0) {
		return 0
	}

	const half = Math.sqrt(reachSquared)
	return Math.max(0, Math.min(length, along + half) - Math.max(0, along - half))
}

/**
 * Tiles of track within `rangeTiles` of `tile`'s centre, summed over every segment of every path.
 * Analytic, not sampled, so the same tile always gets the same exact number.
 *
 * **A stretch two lanes share is counted twice, and that is right**: a multi-lane map's lanes merge
 * into one final stretch, and both lanes' enemies walk it, so a tower there sees both. Counting the
 * tiles once would rank the merge as worth one lane.
 */
export function trackCoverage(map: MapDef, tile: Vec2, rangeTiles: number): number {
	if (rangeTiles <= 0) {
		return 0
	}

	let covered = 0
	for (const path of map.paths) {
		for (let index = 0; index + 1 < path.waypoints.length; index++) {
			const from = path.waypoints[index]
			const to = path.waypoints[index + 1]
			if (from !== undefined && to !== undefined) {
				covered += chordOnSegment(from, to, tile, rangeTiles)
			}
		}
	}
	return covered
}
