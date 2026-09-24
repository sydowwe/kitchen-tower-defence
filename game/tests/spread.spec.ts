import { describe, expect, it } from 'vitest'
import { createCommandQueue } from '@/core/commands.ts'
import { ant, fly, mold, slug } from '@/core/content/enemies.ts'
import type { NightDef } from '@/core/content/schema.ts'
import { cardboardBox, saltShaker } from '@/core/content/towers.ts'
import { TileFlags } from '@/core/map.ts'
import { bindRng, createRngState } from '@/core/rng.ts'
import { tick } from '@/core/sim.ts'
import { clearEffect, effectAt, hasEffect, writeEffect } from '@/core/tiles.ts'
import { canPlaceTower, placeTower } from '@/core/systems/placement.ts'
import { spawnEnemyAt, startWave } from '@/core/systems/spawn.ts'
import { createTestWorld } from './fixtures/world.ts'
import type { Enemy, GameEvent, MapDef, Vec2, World } from '@/core/types.ts'

/**
 * Enemies that write the board: the Mold's spread and the Slug's trail, through `spreadSystem`.
 *
 * The spread specs run on their own square board, because the shared fixture is one row tall and
 * every adjacency question on it is degenerate. The trail and speed specs use the fixture, where an
 * enemy at `distance` d stands on tile `(round(d), 0)`.
 */

const PATH_ID = 'a'
const PULSE = mold.tileWriter?.intervalTicks ?? 0

/**
 * A `size x size` board, all buildable, with the lane along the middle row as `TRACK` -- so a patch
 * has a road to prefer and build space above and below it to fall back on. `blocked` cells are `#`.
 */
function squareMap(size: number, blocked: Vec2[] = []): MapDef {
	const row = Math.floor(size / 2)
	const flags = new Array<number>(size * size).fill(TileFlags.BUILDABLE)
	for (let x = 0; x < size; x++) {
		flags[row * size + x] = TileFlags.BUILDABLE | TileFlags.TRACK
	}
	for (const tile of blocked) {
		flags[tile.y * size + tile.x] = TileFlags.BLOCKED
	}

	return {
		id: 'square',
		widthTiles: size,
		heightTiles: size,
		paths: [
			{
				id: PATH_ID,
				waypoints: [
					{ x: 0, y: row },
					{ x: size - 1, y: row },
				],
				lengthTiles: size - 1,
			},
		],
		trackWidthTiles: 1,
		flags,
		fridge: { tile: { x: size - 1, y: row }, glyph: '🗄️' },
		decor: [],
	}
}

/** A wave permanently mid-spawn, so an empty board does not end the night and freeze every system. */
function makeWorld(map?: MapDef, seed = 1234): World {
	const world = createTestWorld()
	world.seed = seed
	world.rng = createRngState(seed)
	if (map !== undefined) {
		world.map = map
	}
	world.night.phase = 'wave'
	world.night.wave = {
		index: 0,
		startedAtTick: 0,
		spawns: [{ enemyDefId: 'ant', remaining: 1, nextSpawnTick: 1_000_000, spacingTicks: 60, pathId: PATH_ID }],
	}
	return world
}

/** Runs `count` ticks and hands back every event they published, in order. */
function run(world: World, count: number): GameEvent[] {
	const queue = createCommandQueue()
	const events: GameEvent[] = []
	for (let index = 0; index < count; index++) {
		tick(world, queue)
		events.push(...world.events)
	}
	return events
}

function key(tile: Vec2): string {
	return `${tile.x},${tile.y}`
}

function moldedCells(world: World): string[] {
	return world.tiles
		.filter(state => state.effects.some(effect => effect.kind === 'mold'))
		.map(state => key(state.tile))
		.sort()
}

function isOrthogonal(a: Vec2, b: Vec2): boolean {
	return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1
}

function parse(cell: string): Vec2 {
	const [x, y] = cell.split(',').map(Number)
	return { x: x ?? NaN, y: y ?? NaN }
}

/** The one cell a pulse added, and the set it was added to. */
function onePulse(world: World): { added: string[]; before: string[] } {
	const before = moldedCells(world)
	run(world, PULSE)
	const after = moldedCells(world)
	return { added: after.filter(cell => !before.includes(cell)), before }
}

function spawnMold(world: World, distance: number): Enemy {
	return spawnEnemyAt(world, mold, PATH_ID, distance, 0)
}

describe('the mold defs', () => {
	it('pulses every 12 seconds, forever, at stage 1', () => {
		// Pinned so a re-tune is a visible edit, not drift. 15C moved the mold from 360 to 720 on a
		// measured night 11; the slug's 480 has not been watched yet.
		expect(mold.tileWriter).toEqual({
			effect: 'mold',
			mode: 'spread',
			magnitude: 1,
			durationTicks: -1,
			intervalTicks: 720,
		})
		expect(slug.tileWriter).toEqual({
			effect: 'slime',
			mode: 'trail',
			magnitude: 1.6,
			durationTicks: 480,
			intervalTicks: 1,
		})
	})
})

describe('a mold spreading', () => {
	it('molds its own tile on its first pulse and nothing else, even beside another patch', () => {
		const world = makeWorld(squareMap(7))
		writeEffect(world, { x: 1, y: 3 }, 'mold')
		writeEffect(world, { x: 1, y: 2 }, 'mold')

		spawnMold(world, 4)
		run(world, 1)

		expect(moldedCells(world)).toEqual(['1,2', '1,3', '4,3'])
	})

	it('adds exactly one orthogonal, unblocked, on-board cell per pulse, never one it already has', () => {
		const blocked = [
			{ x: 3, y: 2 },
			{ x: 2, y: 4 },
		]
		const world = makeWorld(squareMap(7, blocked))
		spawnMold(world, 3)
		run(world, 1)
		expect(moldedCells(world)).toEqual(['3,3'])

		for (let pulse = 0; pulse < 30; pulse++) {
			const { added, before } = onePulse(world)

			expect(added).toHaveLength(1)
			const cell = parse(added[0] ?? '')
			expect(cell.x).toBeGreaterThanOrEqual(0)
			expect(cell.x).toBeLessThan(7)
			expect(cell.y).toBeGreaterThanOrEqual(0)
			expect(cell.y).toBeLessThan(7)
			expect(before.some(existing => isOrthogonal(parse(existing), cell))).toBe(true)
		}

		// 30 pulses plus the first is 31 cells, and neither `#` was ever one of them.
		expect(moldedCells(world)).toHaveLength(31)
		expect(hasEffect(world, { x: 3, y: 2 }, 'mold')).toBe(false)
		expect(hasEffect(world, { x: 2, y: 4 }, 'mold')).toBe(false)
	})

	it('takes the track before the build space, and only leaves it when the row is full', () => {
		for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
			const world = makeWorld(squareMap(7), seed)
			spawnMold(world, 3)
			run(world, 1)

			// Seven track cells in the row: the first six pulses may only land on it.
			for (let pulse = 0; pulse < 6; pulse++) {
				const { added } = onePulse(world)
				expect(parse(added[0] ?? '').y).toBe(3)
			}
			expect(moldedCells(world)).toEqual(['0,3', '1,3', '2,3', '3,3', '4,3', '5,3', '6,3'])

			// Row full: the seventh has to leave it.
			const { added } = onePulse(world)
			expect(parse(added[0] ?? '').y).not.toBe(3)
		}
	})

	it('draws exactly once from world.rng per spreading pulse', () => {
		const world = makeWorld(squareMap(7))
		spawnMold(world, 3)
		run(world, 1)
		run(world, PULSE - 1)

		const expected = { ...world.rng }
		bindRng(expected).next()

		run(world, 1)

		expect(moldedCells(world)).toHaveLength(2)
		expect(world.rng).toEqual(expected)
	})

	it('spreads to the same cells in the same order from the same seed, over 40 pulses', () => {
		function history(seed: number): string[] {
			const world = makeWorld(squareMap(9), seed)
			spawnMold(world, 4)
			run(world, 1)
			const order: string[] = []
			for (let pulse = 0; pulse < 40; pulse++) {
				order.push(...onePulse(world).added)
			}
			return order
		}

		const first = history(77)
		expect(first).toHaveLength(40)
		expect(history(77)).toEqual(first)
		// And the seed is doing something: a different one walks a different patch.
		expect(history(78)).not.toEqual(first)
	})

	it('is not moved by a cell being cleared and re-written, which reorders world.tiles', () => {
		function run40(reorder: boolean): { order: string[]; rng: World['rng'] } {
			const world = makeWorld(squareMap(9), 91)
			spawnMold(world, 4)
			run(world, 1)
			const order: string[] = []
			for (let pulse = 0; pulse < 40; pulse++) {
				if (reorder && pulse === 20) {
					// 15B's Vinegar Spray in miniature: the cell set is identical afterwards, but the
					// rewritten cell has moved to the end of the sparse array.
					const first = world.tiles[0]?.tile
					if (first === undefined) {
						throw new Error('expected a molded cell to clear')
					}
					clearEffect(world, first, 'mold')
					writeEffect(world, first, 'mold')
				}
				order.push(...onePulse(world).added)
			}
			return { order, rng: world.rng }
		}

		const plain = run40(false)
		const reordered = run40(true)

		expect(reordered.order).toEqual(plain.order)
		expect(reordered.rng).toEqual(plain.rng)
	})

	it('stops when the mold dies, and leaves every cell it wrote for 600 ticks after', () => {
		const world = makeWorld(squareMap(7))
		const enemy = spawnMold(world, 3)
		run(world, 1 + PULSE * 2)
		const grown = moldedCells(world)
		expect(grown).toHaveLength(3)

		enemy.hp = 0
		run(world, 1)
		expect(world.enemies).toEqual([])

		run(world, 600)

		expect(moldedCells(world)).toEqual(grown)
		for (const cell of grown) {
			expect(effectAt(world, parse(cell), 'mold')?.remainingTicks).toBe(-1)
		}
	})

	it('never walks and never leaks, over a whole minute', () => {
		const world = makeWorld()
		const enemy = spawnMold(world, 0)

		const events = run(world, 3600)

		expect(enemy.distance).toBe(0)
		expect(world.enemies).toContain(enemy)
		expect(events.filter(event => event.kind === 'enemyLeaked')).toEqual([])
	})
})

describe('placement on a molded tile', () => {
	it('refuses both an off-path tower and a path-only one with `fouled`, and strands what was there', () => {
		const world = makeWorld(squareMap(7))
		const standing = placeTower(world, saltShaker, { x: 4, y: 2 })
		expect(standing).not.toBeNull()
		expect(canPlaceTower(world, cardboardBox, { x: 4, y: 3 })).toEqual({ ok: true })

		// The mold lands on 3,3 and has taken the whole track row before it reaches 4,2. Unkillable,
		// because the shaker is in range of it and this spec is about the board, not the fight.
		const enemy = spawnMold(world, 3)
		enemy.hp = 1_000_000
		run(world, 1 + PULSE * 6)
		for (let pulse = 0; pulse < 42 && !hasEffect(world, { x: 4, y: 2 }, 'mold'); pulse++) {
			run(world, PULSE)
		}

		expect(canPlaceTower(world, cardboardBox, { x: 4, y: 3 })).toEqual({ ok: false, reason: 'fouled' })
		expect(hasEffect(world, { x: 4, y: 2 }, 'mold')).toBe(true)
		expect(world.towers.map(tower => tower.id)).toEqual([standing?.id])
	})
})

describe('a slug', () => {
	const SLUG_STEP = slug.speedTilesPerTick

	it('slimes every tile it crosses, and not the one ahead of it', () => {
		const world = makeWorld()
		spawnEnemyAt(world, slug, PATH_ID, 5, 0)

		// 450 ticks at 0.4 tiles/sec is 3 tiles: 5.0 to 8.0.
		run(world, 450)

		for (const x of [5, 6, 7, 8]) {
			expect(effectAt(world, { x, y: 0 }, 'slime')?.magnitude).toBe(1.6)
		}
		expect(hasEffect(world, { x: 9, y: 0 }, 'slime')).toBe(false)
		expect(hasEffect(world, { x: 4, y: 0 }, 'slime')).toBe(false)
	})

	it('refreshes a tile it crosses twice rather than stacking a second effect on it', () => {
		const world = makeWorld()
		const enemy = spawnEnemyAt(world, slug, PATH_ID, 5, 0)
		run(world, 450)
		// Last written on tile 5 when the slug left it around tick 74, so well into its 8 seconds.
		expect(effectAt(world, { x: 5, y: 0 }, 'slime')?.remainingTicks).toBeLessThan(480 - 300)

		enemy.distance = 5
		run(world, 1)

		const cell = world.tiles.find(state => state.tile.x === 5 && state.tile.y === 0)
		expect(cell?.effects).toHaveLength(1)
		// Written at 480 this tick, aged once by `tiles` in the same tick.
		expect(cell?.effects[0]?.remainingTicks).toBe(479)
	})

	it('walks its own trail at exactly its authored speed', () => {
		const world = makeWorld()
		const enemy = spawnEnemyAt(world, slug, PATH_ID, 5, 0)

		run(world, 120)

		expect(enemy.distance - 5).toBeCloseTo(SLUG_STEP * 120, 12)
		expect(hasEffect(world, { x: 6, y: 0 }, 'slime')).toBe(true)
	})

	it('speeds a ground enemy behind it by exactly 1.6x, and neither a second slug nor a flyer', () => {
		const world = makeWorld()
		writeEffect(world, { x: 10, y: 0 }, 'slime')
		const walker = spawnEnemyAt(world, ant, PATH_ID, 10, 0)
		const other = spawnEnemyAt(world, slug, PATH_ID, 10, 0)
		const flyer = spawnEnemyAt(world, fly, PATH_ID, 10, 0)

		run(world, 1)

		expect(walker.distance - 10).toBeCloseTo(ant.speedTilesPerTick * 1.6, 12)
		expect(other.distance - 10).toBeCloseTo(SLUG_STEP, 12)
		expect(flyer.distance - 10).toBeCloseTo(fly.speedTilesPerTick, 12)
	})

	it('leaves a cell that expires on exactly tick written + 480, and the step drops back that tick', () => {
		const world = makeWorld()
		const writer = spawnEnemyAt(world, slug, PATH_ID, 10, 0)
		const walker = spawnEnemyAt(world, ant, PATH_ID, 10.2, 0)
		// Slow enough to stay on tile 10 for the whole 8 seconds.
		walker.speed = 0.0001

		// Tick 0: the slug writes tile 10. Then it is carried off the tile, so nothing refreshes it.
		run(world, 1)
		writer.distance = 30
		expect(effectAt(world, { x: 10, y: 0 }, 'slime')?.remainingTicks).toBe(479)

		const steps: number[] = []
		while (world.tick <= 480) {
			const before = walker.distance
			run(world, 1)
			steps.push(walker.distance - before)
			// `world.tick` counts completed ticks: after tick 479 has run it reads 480.
			expect(hasEffect(world, { x: 10, y: 0 }, 'slime')).toBe(world.tick < 480)
		}

		// `steps[k]` is tick k + 1. Tick 479 is the last slimed one; tick 480 is back to plain speed.
		expect(steps[478]).toBeCloseTo(0.0001 * 1.6, 12)
		expect(steps[479]).toBeCloseTo(0.0001, 12)
	})
})

describe('WaveEntry.startDistanceTiles', () => {
	function nightOf(startDistanceTiles?: number): NightDef {
		return {
			id: 'spec',
			index: 1,
			mapId: 'test',
			waves: [
				{
					entries: [
						{ enemyDefId: 'mold', count: 2, spacingTicks: 60, startDelayTicks: 0, startDistanceTiles },
					],
					countdownTicks: 600,
				},
			],
		}
	}

	it('puts the entry s enemies that far along the lane', () => {
		const world = makeWorld()
		startWave(world, nightOf(12.5), 0)

		run(world, 61)

		expect(world.enemies.map(enemy => enemy.distance)).toEqual([12.5, 12.5])
	})

	it('defaults to the start of the lane when the entry names none', () => {
		const world = makeWorld()
		startWave(world, nightOf(), 0)

		expect(world.night.wave?.spawns[0]).not.toHaveProperty('startDistanceTiles')
		run(world, 1)
		expect(world.enemies.map(enemy => enemy.distance)).toEqual([0])
	})

	it('throws naming the night for a distance past the end of the lane', () => {
		const world = makeWorld()

		expect(() => startWave(world, nightOf(40), 0)).toThrow(/night 'spec' wave 0: .*40 tiles along path 'a'/)
	})
})
