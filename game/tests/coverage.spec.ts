import { describe, expect, it } from 'vitest'
import { getMapDef } from '@/core/content/index.ts'
import { trackCoverage } from '@/core/coverage.ts'
import { samplePath, totalLength } from '@/core/path.ts'
import type { MapDef, Path, Vec2 } from '@/core/types.ts'

/**
 * `trackCoverage` is what the harness's placement and a hint would rank tiles by, so it has to be
 * exact and it has to be the reach the tower really has -- `queryEnemiesInRange`'s.
 */

function lane(id: string, waypoints: Vec2[]): Path {
	let length = 0
	for (let index = 1; index < waypoints.length; index++) {
		const from = waypoints[index - 1]!
		const to = waypoints[index]!
		length += Math.hypot(to.x - from.x, to.y - from.y)
	}
	return { id, waypoints, lengthTiles: length }
}

/** Only `paths` is read; the rest is there to be a `MapDef`. */
function mapOf(paths: Path[]): MapDef {
	return {
		id: 'spec',
		widthTiles: 40,
		heightTiles: 20,
		paths,
		trackWidthTiles: 1,
		flags: [],
		fridge: { tile: { x: 39, y: 10 }, glyph: '🗄️' },
		decor: [],
	}
}

describe('trackCoverage is exact', () => {
	const straight = mapOf([
		lane('a', [
			{ x: 0, y: 10 },
			{ x: 39, y: 10 },
		]),
	])

	it('is the chord 2 sqrt(r^2 - d^2) off a long straight', () => {
		expect(trackCoverage(straight, { x: 20, y: 8 }, 3)).toBeCloseTo(2 * Math.sqrt(5), 12)
		expect(trackCoverage(straight, { x: 20, y: 9 }, 3)).toBeCloseTo(2 * Math.sqrt(8), 12)
		expect(trackCoverage(straight, { x: 20, y: 10 }, 3)).toBeCloseTo(6, 12)
		expect(trackCoverage(straight, { x: 20, y: 11 }, 2.5)).toBeCloseTo(2 * Math.sqrt(5.25), 12)
	})

	it('is 0 for a range that does not reach, and for one that only touches', () => {
		expect(trackCoverage(straight, { x: 20, y: 5 }, 3)).toBe(0)
		expect(trackCoverage(straight, { x: 20, y: 7 }, 3)).toBe(0)
		expect(trackCoverage(straight, { x: 20, y: 9 }, 0)).toBe(0)
	})

	it('is clipped at a lane end', () => {
		// Centre level with the first waypoint: half the chord is before the lane starts.
		expect(trackCoverage(straight, { x: 0, y: 8 }, 3)).toBeCloseTo(Math.sqrt(5), 12)
	})

	it('covers more inside a right-angle corner than at the same distance from a straight', () => {
		const corner = mapOf([
			lane('a', [
				{ x: 0, y: 10 },
				{ x: 20, y: 10 },
				{ x: 20, y: 0 },
			]),
		])
		const inside = trackCoverage(corner, { x: 19, y: 9 }, 3)
		const beside = trackCoverage(corner, { x: 10, y: 9 }, 3)

		expect(beside).toBeCloseTo(2 * Math.sqrt(8), 12)
		// One past the corner on each leg, plus sqrt(8) along each: 2 (1 + sqrt 8).
		expect(inside).toBeCloseTo(2 * (1 + Math.sqrt(8)), 12)
		expect(inside).toBeGreaterThan(beside)
	})

	it('counts a stretch two lanes share twice, because both lanes walk it', () => {
		const shared = mapOf([
			lane('a', [
				{ x: 0, y: 10 },
				{ x: 39, y: 10 },
			]),
			lane('b', [
				{ x: 0, y: 10 },
				{ x: 39, y: 10 },
			]),
		])
		expect(trackCoverage(shared, { x: 20, y: 8 }, 3)).toBeCloseTo(4 * Math.sqrt(5), 12)
	})
})

describe('trackCoverage is the targeting measure', () => {
	it("matches the Counter's crack sampled every 0.05 tiles, inclusive from the tile centre", () => {
		const counter = getMapDef('counter')
		const crack = counter.paths.find(path => path.id === 'crack')!
		const step = 0.05
		const length = totalLength(crack)

		const cases: [Vec2, number][] = [
			[{ x: 10, y: 4 }, 3],
			[{ x: 4, y: 9 }, 3],
			[{ x: 14, y: 3 }, 2.5],
			[{ x: 20, y: 5 }, 3],
			[{ x: 7, y: 7 }, 4],
			[{ x: 1, y: 1 }, 3],
		]
		for (const [tile, range] of cases) {
			let inside = 0
			for (let at = 0; at <= length; at += step) {
				const point = samplePath(crack, at)
				// `queryEnemiesInRange`'s test: squared distance from the tile centre, inclusive.
				if ((point.x - tile.x) ** 2 + (point.y - tile.y) ** 2 <= range * range) {
					inside++
				}
			}
			expect(Math.abs(inside * step - trackCoverage(counter, tile, range))).toBeLessThan(0.1)
		}
		// A case that does reach the track, so the loop is not comparing zeros.
		expect(trackCoverage(counter, { x: 10, y: 4 }, 3)).toBeGreaterThan(5)
	})
})
