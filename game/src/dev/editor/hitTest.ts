/**
 * What is under the pointer: a waypoint, a segment, or nothing.
 *
 * Every threshold here is **in tiles**, never in pixels. The board is CSS-scaled to the window, so a
 * 6px grab radius is a third of a tile on a laptop and a twentieth on a 4K monitor, and the tool
 * feels different on every machine (step 4B, section 4).
 *
 * All coordinates are waypoint space -- `dev/tileCoords.ts` converts, and the authored `MapSource`
 * is already in it.
 */

import type { MapSource } from '@/core/content/schema.ts'
import type { Vec2 } from '@/core/types.ts'

/** How close the pointer must come to a waypoint to grab it rather than append a new one. */
export const WAYPOINT_GRAB_TILES = 0.45

/** How close to a segment counts as "insert here". Smaller than the grab radius on purpose. */
export const SEGMENT_GRAB_TILES = 0.3

export interface WaypointHit {
	pathIndex: number
	waypointIndex: number
}

export interface SegmentHit {
	pathIndex: number
	/** Index the new waypoint takes, i.e. it goes between `insertAt - 1` and `insertAt`. */
	insertAt: number
	/** The point on the segment nearest the pointer. */
	point: Vec2
}

function distance(a: Vec2, b: Vec2): number {
	return Math.hypot(b.x - a.x, b.y - a.y)
}

/**
 * Path indices in the order they should be tested: the active lane first.
 *
 * Where two lanes overlap -- which is the whole point of a converging map -- clicking has to grab
 * the one being worked on, not whichever happens to be earlier in the array.
 */
function searchOrder(count: number, activePathIndex: number): number[] {
	const order: number[] = []
	if (activePathIndex >= 0 && activePathIndex < count) {
		order.push(activePathIndex)
	}
	for (let i = 0; i < count; i++) {
		if (i !== activePathIndex) {
			order.push(i)
		}
	}
	return order
}

/** The nearest waypoint within `WAYPOINT_GRAB_TILES`, active path first. */
export function hitWaypoint(source: MapSource, at: Vec2, activePathIndex: number): WaypointHit | null {
	for (const pathIndex of searchOrder(source.paths.length, activePathIndex)) {
		const path = source.paths[pathIndex]
		if (path === undefined) {
			continue
		}

		let best: WaypointHit | null = null
		let bestDistance = WAYPOINT_GRAB_TILES

		for (let waypointIndex = 0; waypointIndex < path.waypoints.length; waypointIndex++) {
			const waypoint = path.waypoints[waypointIndex]
			if (waypoint === undefined) {
				continue
			}
			const d = distance(waypoint, at)
			if (d <= bestDistance) {
				bestDistance = d
				best = { pathIndex, waypointIndex }
			}
		}

		if (best !== null) {
			return best
		}
	}

	return null
}

/** Where on a segment the nearest point to `at` is, as the parameter `t` in `[0, 1]`. */
function projectOnto(from: Vec2, to: Vec2, at: Vec2): number {
	const dx = to.x - from.x
	const dy = to.y - from.y
	const lengthSquared = dx * dx + dy * dy
	if (lengthSquared === 0) {
		return 0
	}
	const t = ((at.x - from.x) * dx + (at.y - from.y) * dy) / lengthSquared
	return Math.min(Math.max(t, 0), 1)
}

/**
 * The nearest segment within `SEGMENT_GRAB_TILES`, active path first.
 *
 * The ends of the segment are excluded by `WAYPOINT_GRAB_TILES`: the caller tests `hitWaypoint`
 * first, so a click near a corner drags the corner instead of inserting a third waypoint on top
 * of it.
 */
export function hitSegment(source: MapSource, at: Vec2, activePathIndex: number): SegmentHit | null {
	for (const pathIndex of searchOrder(source.paths.length, activePathIndex)) {
		const path = source.paths[pathIndex]
		if (path === undefined) {
			continue
		}

		let best: SegmentHit | null = null
		let bestDistance = SEGMENT_GRAB_TILES

		for (let i = 1; i < path.waypoints.length; i++) {
			const from = path.waypoints[i - 1]
			const to = path.waypoints[i]
			if (from === undefined || to === undefined) {
				continue
			}

			const t = projectOnto(from, to, at)
			const point = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
			const d = distance(point, at)
			if (d <= bestDistance) {
				bestDistance = d
				best = { pathIndex, insertAt: i, point }
			}
		}

		if (best !== null) {
			return best
		}
	}

	return null
}
