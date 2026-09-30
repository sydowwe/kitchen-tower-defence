import { describe, expect, it } from 'vitest'
import { MAP_SOURCES } from '@/core/content/index.ts'
import { canPlace, loadMap } from '@/core/map.ts'
import { convergenceOf, validateEditorMap } from '@/dev/editor/validate.ts'
import type { MapSource } from '@/core/content/schema.ts'
import type { Vec2 } from '@/core/types.ts'

/**
 * Every authored map held to the bar `counter.json` already clears in `editor.spec`: not one
 * problem from the editor's own rules, errors and warnings both (step 21A, decision 5). The map
 * editor is where a map is judged while it is drawn; this is where it stays judged once it ships.
 */

function entries(): (readonly [string, MapSource])[] {
	return MAP_SOURCES.map(source => [source.id, source] as const)
}

function distance(a: Vec2, b: Vec2): number {
	return Math.hypot(b.x - a.x, b.y - a.y)
}

describe('the map roster', () => {
	it('runs in campaign order', () => {
		expect(MAP_SOURCES.map(source => source.id)).toEqual(['counter', 'sink', 'pantry', 'stove', 'table', 'floor'])
	})

	it('gives the Stove the second spawn point and the Floor the third', () => {
		const lanes = Object.fromEntries(MAP_SOURCES.map(source => [source.id, source.paths.length]))

		expect(lanes).toEqual({ counter: 1, sink: 1, pantry: 1, stove: 2, table: 1, floor: 3 })
	})
})

describe.each(entries())('%s', (_id, source) => {
	const map = loadMap(source)

	it('passes every one of the editor rules, warnings included', () => {
		expect(validateEditorMap(source, map)).toEqual([])
	})

	it('is 24 x 14 with a one-tile track', () => {
		expect([map.widthTiles, map.heightTiles, map.trackWidthTiles]).toEqual([24, 14, 1])
	})

	it('starts with the crack Seal the Baseboard Crack seals', () => {
		expect(map.paths[0]?.id).toBe('crack')
	})

	it('ends every lane within one tile of the fridge', () => {
		for (const path of map.paths) {
			const last = path.waypoints[path.waypoints.length - 1]
			expect(last).toBeDefined()
			expect(distance(last ?? { x: -99, y: -99 }, map.fridge.tile)).toBeLessThanOrEqual(1)
		}
	})

	it('merges every pair of lanes for at least 6 tiles before the fridge', () => {
		const pairs = convergenceOf(map)
		const lanes = map.paths.length

		expect(pairs).toHaveLength((lanes * (lanes - 1)) / 2)
		for (const pair of pairs) {
			expect(pair.sharedTiles, pair.pathIds.join(' + ')).toBeGreaterThanOrEqual(6)
		}
	})
})

// The Counter predates this rule and has buildable tiles under its shelf; step 21A leaves it alone.
describe.each(entries().filter(([id]) => id !== 'counter'))('%s under the shelf', (_id, source) => {
	it('has nowhere to build under the fridge shelf', () => {
		const map = loadMap(source)
		const { x: fx, y: fy } = map.fridge.tile

		// `shelfSlot` in render/layers/fridge.ts at its fullest -- 35 items, six rows -- covers
		// x from fx - 2 to fx + 1 and y from fy + 1 to fy + 5. A tower there draws under the shelf.
		const hidden: string[] = []
		for (let x = fx - 2; x <= fx + 1; x++) {
			for (let y = fy + 1; y <= fy + 5; y++) {
				if (canPlace(map, { x, y }, 'off_path')) {
					hidden.push(`${x},${y}`)
				}
			}
		}

		expect(hidden).toEqual([])
	})
})
