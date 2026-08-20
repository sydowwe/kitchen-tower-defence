import { describe, expect, it } from 'vitest'
import { getMapDef } from '@/core/content/index.ts'
import { canPlace, flagsAt, loadMap, TileFlags } from '@/core/map.ts'
import { remainingToFridge, samplePath, totalLength } from '@/core/path.ts'
import counterJson from '@/core/content/maps/counter.json'
import type { MapSource } from '@/core/content/schema.ts'
import type { MapDef, Path } from '@/core/types.ts'

/**
 * The whole of step 3's testing lives here, because this is its half that can be silently wrong:
 * an off-by-one in the binary search shows up as an enemy that jitters at every corner, which reads
 * as a renderer bug for a week.
 *
 * Assertions are against `counter.json` itself wherever the derivation is the thing under test, so
 * that editing the map re-runs the check rather than leaving a synthetic path agreeing with itself.
 */

const EPSILON = 1e-9

/** An L-bend and a diagonal: three segments, no two of them the same length or direction. */
function testPath(): Path {
	return {
		id: 'test',
		waypoints: [
			{ x: 1, y: 1 },
			{ x: 4, y: 1 },
			{ x: 4, y: 5 },
			{ x: 7, y: 9 },
		],
		lengthTiles: 12,
	}
}

/** Distance from the start to each waypoint of `testPath`: 0, 3, 7, 12. */
function cumulativeOf(path: Path): number[] {
	const out = [0]
	for (let i = 1; i < path.waypoints.length; i++) {
		const from = path.waypoints[i - 1]!
		const to = path.waypoints[i]!
		out.push(out[i - 1]! + Math.hypot(to.x - from.x, to.y - from.y))
	}
	return out
}

describe('samplePath', () => {
	it('starts at the first waypoint and ends at the last', () => {
		const path = testPath()

		expect(samplePath(path, 0)).toMatchObject({ x: 1, y: 1 })
		const end = samplePath(path, totalLength(path))
		expect(end.x).toBeCloseTo(7, 10)
		expect(end.y).toBeCloseTo(9, 10)
	})

	it('measures the polyline as 12 tiles, matching the authored lengthTiles', () => {
		expect(totalLength(testPath())).toBeCloseTo(12, 10)
	})

	it('returns each waypoint exactly at its own cumulative distance', () => {
		// The one that catches an off-by-one in the binary search: at a distance landing on a
		// waypoint, two segments are equally valid and only one of them gives the right position.
		const path = testPath()
		const cumulative = cumulativeOf(path)

		cumulative.forEach((distance, index) => {
			const waypoint = path.waypoints[index]!
			const sample = samplePath(path, distance)

			expect(Math.hypot(sample.x - waypoint.x, sample.y - waypoint.y)).toBeLessThan(EPSILON)
		})
	})

	it('picks the segment being entered at a corner, so the angle does not flip back and forth', () => {
		const path = testPath()

		// 3 tiles in is the first corner: the segment being left runs east (angle 0), the one being
		// entered runs south (angle +pi/2 in tile space, y growing downward).
		expect(samplePath(path, 3 - 1e-6).angle).toBeCloseTo(0, 5)
		expect(samplePath(path, 3).angle).toBeCloseTo(Math.PI / 2, 10)
		expect(samplePath(path, 3 + 1e-6).angle).toBeCloseTo(Math.PI / 2, 5)
	})

	it('never steps backwards as distance increases, segment boundaries included', () => {
		const path = testPath()
		const total = totalLength(path)
		let previous = samplePath(path, 0)
		let travelled = 0

		for (let step = 1; step <= 1200; step++) {
			const sample = samplePath(path, (total * step) / 1200)
			const moved = Math.hypot(sample.x - previous.x, sample.y - previous.y)

			expect(moved).toBeGreaterThanOrEqual(0)
			travelled += moved
			previous = sample
		}

		// Monotone along the track means the samples add up to the track, not more.
		expect(travelled).toBeCloseTo(total, 6)
	})

	it('clamps at both ends, so a pushback past the start is the start', () => {
		const path = testPath()

		expect(samplePath(path, -5)).toEqual(samplePath(path, 0))
		expect(samplePath(path, 999)).toEqual(samplePath(path, totalLength(path)))
	})

	it('reports remaining distance along the track, not euclidean to the fridge', () => {
		const path = testPath()

		expect(remainingToFridge(path, 0)).toBeCloseTo(12, 10)
		expect(remainingToFridge(path, 3)).toBeCloseTo(9, 10)
		expect(remainingToFridge(path, -5)).toBeCloseTo(12, 10)
		expect(remainingToFridge(path, 999)).toBe(0)
		// The straight line from waypoint 1 to the end is shorter than what is left of the track.
		expect(remainingToFridge(path, 3)).toBeGreaterThan(Math.hypot(7 - 4, 9 - 1))
	})
})

/** Every TRACK tile as `'x,y'`, sorted -- comparable across two loads of the same map. */
function trackTilesOf(map: MapDef): string[] {
	const out: string[] = []
	map.flags.forEach((flags, index) => {
		if ((flags & TileFlags.TRACK) !== 0) {
			out.push(`${index % map.widthTiles},${Math.floor(index / map.widthTiles)}`)
		}
	})
	return out.sort()
}

describe('loadMap', () => {
	const counter = counterJson as MapSource

	it('marks the tile of every waypoint of counter.json as TRACK', () => {
		const map = loadMap(counter)

		for (const path of map.paths) {
			for (const waypoint of path.waypoints) {
				expect(flagsAt(map, waypoint) & TileFlags.TRACK).toBe(TileFlags.TRACK)
			}
		}
	})

	it('rasterises the counter as 32 track tiles, none of them blocked', () => {
		const map = loadMap(counter)
		const track = map.flags.filter(flags => (flags & TileFlags.TRACK) !== 0)

		// The polyline is 31 tiles long and axis-aligned, so it covers 32 tile centres.
		expect(track).toHaveLength(32)
		expect(track.every(flags => (flags & TileFlags.BLOCKED) === 0)).toBe(true)
	})

	it('derives track from the polyline, so deleting a waypoint changes which tiles are track', () => {
		const shortened = structuredClone(counter)
		const path = shortened.paths[0]!
		path.waypoints.splice(1, 1)
		path.lengthTiles = 0
		const before = trackTilesOf(loadMap(counter))

		// lengthTiles is deliberately wrong now, so this also proves the tripwire names the path.
		expect(() => loadMap(shortened)).toThrow(/path 'crack'/)

		// The corner at 5,12 is gone, so the first leg is now a diagonal across the bottom-left.
		path.lengthTiles = Math.hypot(5 - 0, 8 - 12) + 11 + 5 + 6
		const after = trackTilesOf(loadMap(shortened))

		expect(after).not.toEqual(before)
		expect(before).toContain('2,12')
		expect(after).not.toContain('2,12')
		expect(after).toContain('2,10')
	})

	it('throws with the path id when lengthTiles disagrees with the waypoints by 0.5', () => {
		const wrong = structuredClone(counter)
		wrong.paths[0]!.lengthTiles = 31.5

		expect(() => loadMap(wrong)).toThrow(/map 'counter'.*path 'crack'.*31\.5/s)
	})

	it('throws with the map id on an illegal tile char, even with zod gone in production', () => {
		const painted = structuredClone(counter)
		painted.tiles[3] = 'T'.repeat(24)

		expect(() => loadMap(painted)).toThrow(/map 'counter'.*'T'/s)
	})

	it('throws with the map id and the row number on a short row', () => {
		const short = structuredClone(counter)
		short.tiles[5] = '...'

		expect(() => loadMap(short)).toThrow(/map 'counter': row 5 is 3 chars, expected 24/)
	})

	it('keeps decor and the fridge glyph, which 3B draws and the simulation ignores', () => {
		const map = loadMap(counter)

		expect(map.fridge).toEqual({ tile: { x: 22, y: 3 }, glyph: '🗄️' })
		expect(map.decor).toHaveLength(3)
	})
})

describe('canPlace', () => {
	const counter = getMapDef('counter')

	it('puts a barricade on the track and nothing else', () => {
		const onTrack = { x: 16, y: 3 }

		expect(flagsAt(counter, onTrack) & TileFlags.TRACK).toBe(TileFlags.TRACK)
		expect(canPlace(counter, onTrack, 'path_only')).toBe(true)
		expect(canPlace(counter, onTrack, 'off_path')).toBe(false)
	})

	it('puts an off_path tower on a buildable tile beside the track and nowhere else', () => {
		const beside = { x: 16, y: 2 }
		const blocked = { x: 10, y: 5 }

		expect(canPlace(counter, beside, 'off_path')).toBe(true)
		expect(canPlace(counter, beside, 'path_only')).toBe(false)
		expect(flagsAt(counter, blocked) & TileFlags.BLOCKED).toBe(TileFlags.BLOCKED)
		expect(canPlace(counter, blocked, 'off_path')).toBe(false)
		expect(canPlace(counter, blocked, 'path_only')).toBe(false)
	})

	it('refuses decor, and anything off the board', () => {
		expect(flagsAt(counter, { x: 3, y: 2 }) & TileFlags.DECOR).toBe(TileFlags.DECOR)
		expect(canPlace(counter, { x: 3, y: 2 }, 'off_path')).toBe(false)

		for (const tile of [
			{ x: -1, y: 0 },
			{ x: 0, y: -1 },
			{ x: 24, y: 3 },
			{ x: 3, y: 14 },
			{ x: 1.5, y: 3 },
		]) {
			expect(canPlace(counter, tile, 'off_path')).toBe(false)
			expect(canPlace(counter, tile, 'path_only')).toBe(false)
		}
	})
})
