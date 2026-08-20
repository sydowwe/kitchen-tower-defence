import { describe, expect, it } from 'vitest'
import { loadMap, TileFlags } from '@/core/map.ts'
import { createDocument, recomputeLengths } from '@/dev/editor/document.ts'
import { convergenceOf, validateEditorMap } from '@/dev/editor/validate.ts'
import { emptyMap, fromJson, toJson } from '@/dev/editor/serialize.ts'
import counterJson from '@/core/content/maps/counter.json'
import type { MapSource } from '@/core/content/schema.ts'
import type { MapDef, Vec2 } from '@/core/types.ts'

/**
 * Every test step 4 has. 4B is a canvas and a set of pointer handlers, and none of that is worth
 * asserting -- what is worth asserting is that a map survives being written out and read back, that
 * a half-finished map never throws, and that the thresholds sit on the right side of the one
 * authored map in the repo.
 */

const counter = counterJson as MapSource

function sourceOf(result: { source: MapSource } | { problems: unknown[] }): MapSource {
	if (!('source' in result)) {
		throw new Error(`expected a valid map, got problems: ${JSON.stringify(result.problems)}`)
	}
	return result.source
}

function clone(source: MapSource): MapSource {
	return structuredClone(source)
}

function trackTiles(map: MapDef): string[] {
	const tiles: string[] = []
	map.flags.forEach((flags, index) => {
		if ((flags & TileFlags.TRACK) !== 0) {
			tiles.push(`${index % map.widthTiles},${Math.floor(index / map.widthTiles)}`)
		}
	})
	return tiles
}

/** A bordered 24 x 14 board with the rows named in `overrides` replaced. */
function board(overrides: Record<number, string> = {}): string[] {
	const border = '#'.repeat(24)
	const floor = `#${'.'.repeat(22)}#`
	return Array.from({ length: 14 }, (_, y) => overrides[y] ?? (y === 0 || y === 13 ? border : floor))
}

function mapWith(id: string, waypoints: Vec2[], rows: string[] = board()): MapSource {
	const last = waypoints[waypoints.length - 1] ?? { x: 1, y: 1 }
	const source: MapSource = {
		id,
		widthTiles: 24,
		heightTiles: 14,
		tiles: rows,
		paths: [{ id: 'lane', waypoints, lengthTiles: 0 }],
		fridge: { tile: { x: last.x, y: last.y }, glyph: '🗄️' },
	}
	recomputeLengths(source)
	return source
}

/**
 * A snake inside the border whose polyline measures exactly `targetLength` tiles. Its horizontal
 * runs are 20 tiles long, so every one of these maps also reports corridor warnings -- the length
 * assertions filter for the length message rather than counting warnings.
 */
function snake(targetLength: number): Vec2[] {
	const waypoints: Vec2[] = [{ x: 1, y: 1 }]
	let x = 1
	let y = 1
	let direction = 1
	let remaining = targetLength

	while (remaining > 1e-9) {
		const room = direction === 1 ? 21 - x : x - 1
		const run = Math.min(remaining, room)
		if (run > 0) {
			x += direction * run
			waypoints.push({ x, y })
			remaining -= run
		}
		if (remaining <= 1e-9) {
			break
		}
		const drop = Math.min(remaining, 1)
		y += drop
		waypoints.push({ x, y })
		remaining -= drop
		direction = -direction
	}

	return waypoints
}

function problemsFor(source: MapSource) {
	return validateEditorMap(source, loadMap(source))
}

function messagesMatching(source: MapSource, needle: string): string[] {
	return problemsFor(source)
		.filter(problem => problem.message.includes(needle))
		.map(problem => problem.message)
}

describe('serialize', () => {
	it('round-trips the Counter to semantically identical flags and track', () => {
		const returned = sourceOf(fromJson(toJson(counter)))

		const before = loadMap(counter)
		const after = loadMap(returned)

		expect(after.flags).toEqual(before.flags)
		expect(trackTiles(after)).toEqual(trackTiles(before))
	})

	it('rounds a dragged waypoint to 2 decimals and recomputes lengthTiles from the rounded value', () => {
		const dragged = clone(counter)
		const waypoint = dragged.paths[0]?.waypoints[1]
		expect(waypoint).toBeDefined()
		if (waypoint === undefined) {
			return
		}
		waypoint.x = 6.123456

		const returned = sourceOf(fromJson(toJson(dragged)))

		expect(returned.paths[0]?.waypoints[1]?.x).toBe(6.12)
		expect(() => loadMap(returned)).not.toThrow()
	})

	it('reports a bad paste as problems rather than throwing', () => {
		const broken = fromJson('{ "id": "oops" }')
		expect('problems' in broken).toBe(true)
		if ('problems' in broken) {
			expect(broken.problems.length).toBeGreaterThan(0)
			expect(broken.problems.every(problem => problem.severity === 'error')).toBe(true)
		}

		expect('problems' in fromJson('not json at all')).toBe(true)
	})

	it('preserves the absence of decor and trackWidthTiles', () => {
		const text = toJson(emptyMap('freshMap'))

		expect(text).not.toContain('"decor"')
		expect(text).not.toContain('"trackWidthTiles"')
		expect(sourceOf(fromJson(text)).id).toBe('freshMap')
	})
})

describe('validateEditorMap', () => {
	it('reports nothing at all for counter.json', () => {
		expect(problemsFor(counter)).toEqual([])
	})

	it('warns on a track of 61 tiles and 19 tiles, but not on 60 or 20', () => {
		expect(messagesMatching(mapWith('long', snake(61)), 'longer than 60')).toHaveLength(1)
		expect(messagesMatching(mapWith('atMax', snake(60)), 'longer than 60')).toHaveLength(0)
		expect(messagesMatching(mapWith('short', snake(19)), 'shorter than 20')).toHaveLength(1)
		expect(messagesMatching(mapWith('atMin', snake(20)), 'shorter than 20')).toHaveLength(0)
	})

	it('lets a segment of exactly 6 tiles pass and warns at 6.01', () => {
		const exact = mapWith('exact', [
			{ x: 1, y: 1 },
			{ x: 7, y: 1 },
		])
		const over = mapWith('over', [
			{ x: 1, y: 1 },
			{ x: 7.01, y: 1 },
		])

		expect(messagesMatching(exact, 'corridor')).toHaveLength(0)
		expect(messagesMatching(over, 'corridor')).toHaveLength(1)
	})

	it('errors when a blocked tile sits under the track', () => {
		const painted = clone(counter)
		const row = painted.tiles[11]
		expect(row).toBeDefined()
		painted.tiles[11] = `${row?.slice(0, 3)}#${row?.slice(4)}`

		const blocked = problemsFor(painted).filter(problem => problem.message.includes('the track crosses it'))
		expect(blocked).toHaveLength(1)
		expect(blocked[0]?.severity).toBe('error')
		expect(blocked[0]?.tile).toEqual({ x: 3, y: 11 })
	})

	it('errors on a lane that stops short of the fridge and on a double-clicked waypoint', () => {
		const stopsShort = mapWith('stopsShort', [
			{ x: 1, y: 1 },
			{ x: 10, y: 1 },
		])
		stopsShort.fridge.tile = { x: 20, y: 12 }

		const doubleClick = mapWith('doubleClick', [
			{ x: 1, y: 1 },
			{ x: 10, y: 1 },
			{ x: 10.05, y: 1 },
		])

		expect(problemsFor(stopsShort).filter(p => p.message.includes('does not end at the fridge'))).toHaveLength(1)
		expect(problemsFor(doubleClick).filter(p => p.message.includes('tiles apart'))).toHaveLength(1)
	})

	it('counts only off_path placement as buildable, and does not warn at exactly 25%', () => {
		const counterMap = loadMap(counter)
		const buildable = counterMap.flags.filter(
			flags => (flags & TileFlags.BUILDABLE) !== 0 && (flags & TileFlags.TRACK) === 0,
		).length

		// 219 floor tiles less the 33 the track crosses, out of 24 x 14.
		expect(buildable).toBe(186)
		expect(Math.round((buildable / 336) * 100)).toBe(55)

		// Row 1 is the lane; rows 3-6 are the only buildable floor: 4 x 21 = 84 of 336, exactly 25%.
		const rows = board({
			1: `#${'.'.repeat(22)}#`,
			3: `#${'.'.repeat(21)}##`,
			4: `#${'.'.repeat(21)}##`,
			5: `#${'.'.repeat(21)}##`,
			6: `#${'.'.repeat(21)}##`,
		})
		for (let y = 0; y < 14; y++) {
			if (y !== 1 && y !== 3 && y !== 4 && y !== 5 && y !== 6) {
				rows[y] = '#'.repeat(24)
			}
		}

		const quarter = mapWith(
			'quarter',
			[
				{ x: 1, y: 1 },
				{ x: 22, y: 1 },
			],
			rows,
		)

		const quarterMap = loadMap(quarter)
		const quarterBuildable = quarterMap.flags.filter(
			flags => (flags & TileFlags.BUILDABLE) !== 0 && (flags & TileFlags.TRACK) === 0,
		).length
		expect(quarterBuildable).toBe(84)
		expect(messagesMatching(quarter, 'buildable')).toHaveLength(0)
	})
})

describe('convergenceOf', () => {
	function twoLaneMap(id: string, a: Vec2[], b: Vec2[]): MapDef {
		const source = mapWith(id, a)
		source.paths.push({ id: 'second', waypoints: b, lengthTiles: 0 })
		recomputeLengths(source)
		return loadMap(source)
	}

	it('reports the shared final stretch of two lanes that merge', () => {
		const map = twoLaneMap(
			'merged',
			[
				{ x: 1, y: 1 },
				{ x: 15, y: 1 },
				{ x: 15, y: 7 },
				{ x: 22, y: 7 },
			],
			[
				{ x: 1, y: 12 },
				{ x: 15, y: 12 },
				{ x: 15, y: 7 },
				{ x: 22, y: 7 },
			],
		)

		const report = convergenceOf(map)
		expect(report).toHaveLength(1)
		expect(report[0]?.sharedTiles).toBe(8)
		expect(report[0]?.mergeTile).toEqual({ x: 15, y: 7 })
		expect(report[0]?.pathIds).toEqual(['lane', 'second'])
	})

	it('reports 0 shared tiles for lanes that never meet', () => {
		const map = twoLaneMap(
			'separate',
			[
				{ x: 1, y: 1 },
				{ x: 10, y: 1 },
			],
			[
				{ x: 1, y: 12 },
				{ x: 10, y: 12 },
			],
		)

		expect(convergenceOf(map)[0]?.sharedTiles).toBe(0)
	})

	it('reports nothing for a single-lane map', () => {
		expect(convergenceOf(loadMap(counter))).toEqual([])
	})
})

describe('createDocument', () => {
	it('recomputes lengthTiles when a waypoint is deleted, and rebuilds the MapDef', () => {
		const doc = createDocument(counter)
		const before = doc.snapshot().paths[0]?.lengthTiles ?? 0

		expect(() =>
			doc.edit(draft => {
				draft.paths[0]?.waypoints.splice(3, 1)
			}),
		).not.toThrow()

		const after = doc.snapshot().paths[0]?.lengthTiles ?? 0
		expect(after).not.toBe(before)
		expect(doc.map.paths[0]?.lengthTiles).toBe(after)
		expect(() => loadMap(doc.source)).not.toThrow()
	})

	it('tolerates a map that is transiently nonsense', () => {
		const doc = createDocument(counter)

		expect(() =>
			doc.edit(draft => {
				draft.paths[0]?.waypoints.splice(1)
			}),
		).not.toThrow()
		expect(doc.map.paths[0]?.waypoints).toHaveLength(1)

		expect(() =>
			doc.edit(draft => {
				draft.paths[0]?.waypoints.splice(0)
			}),
		).not.toThrow()

		expect(() =>
			doc.edit(draft => {
				draft.paths.length = 0
			}),
		).not.toThrow()
		expect(doc.map.paths).toEqual([])
		expect(doc.problems.some(problem => problem.message === 'the map has no paths')).toBe(true)
	})

	it('keeps 20 undo steps: 25 edits then 21 undos lands on the state after edit 5', () => {
		const doc = createDocument(counter)

		for (let n = 1; n <= 25; n++) {
			doc.edit(draft => {
				const first = draft.paths[0]?.waypoints[0]
				if (first !== undefined) {
					first.x = n / 10
				}
			})
		}
		expect(doc.source.paths[0]?.waypoints[0]?.x).toBeCloseTo(2.5, 10)

		for (let n = 0; n < 20; n++) {
			doc.undo()
		}
		expect(doc.source.paths[0]?.waypoints[0]?.x).toBeCloseTo(0.5, 10)
		expect(doc.snapshot().canUndo).toBe(false)

		const revision = doc.snapshot().revision
		doc.undo()
		expect(doc.snapshot().revision).toBe(revision)
		expect(doc.source.paths[0]?.waypoints[0]?.x).toBeCloseTo(0.5, 10)
	})

	it('redoes what it undid, and drops the redo stack on a fresh edit', () => {
		const doc = createDocument(counter)
		doc.edit(draft => {
			draft.tiles[7] = '#......................#'
		})

		doc.undo()
		expect(doc.snapshot().canRedo).toBe(true)
		doc.redo()
		expect(doc.source.tiles[7]).toBe('#......................#')

		doc.undo()
		doc.edit(draft => {
			draft.tiles[6] = '#......................#'
		})
		expect(doc.snapshot().canRedo).toBe(false)
	})

	it('publishes a plain snapshot', () => {
		const snapshot = createDocument(counter).snapshot()

		expect(snapshot).toEqual(JSON.parse(JSON.stringify(snapshot)))
		expect(snapshot.paths).toEqual([{ id: 'crack', lengthTiles: 31.12310562561766 }])
		expect(Math.round(snapshot.buildablePercent)).toBe(55)
		expect(snapshot.problems).toEqual([])
	})

	it('survives a hundred random edits with a loadable map at every step', () => {
		const doc = createDocument(emptyMap('stressMap'))
		let seed = 12345

		function next(limit: number): number {
			seed = (seed * 1664525 + 1013904223) % 4294967296
			return Math.floor((seed / 4294967296) * limit)
		}

		for (let step = 0; step < 100; step++) {
			doc.edit(draft => {
				const path = draft.paths[0]
				const kind = next(4)

				if (path === undefined) {
					return
				}
				if (kind === 0) {
					const index = next(path.waypoints.length)
					const waypoint = path.waypoints[index]
					if (waypoint !== undefined) {
						waypoint.x = 1 + next(2100) / 100
						waypoint.y = 1 + next(1100) / 100
					}
				} else if (kind === 1) {
					path.waypoints.splice(next(path.waypoints.length + 1), 0, {
						x: 1 + next(22),
						y: 1 + next(12),
					})
				} else if (kind === 2 && path.waypoints.length > 1) {
					path.waypoints.splice(next(path.waypoints.length), 1)
				} else {
					const y = 1 + next(12)
					const x = 1 + next(22)
					const row = draft.tiles[y]
					if (row !== undefined) {
						const char = '.#~'[next(3)] ?? '.'
						draft.tiles[y] = `${row.slice(0, x)}${char}${row.slice(x + 1)}`
					}
				}
			})

			expect(() => loadMap(doc.source)).not.toThrow()
			expect(doc.map.widthTiles).toBe(24)
		}

		expect(doc.snapshot().revision).toBe(100)
	})
})
