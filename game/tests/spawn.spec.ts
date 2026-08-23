import { describe, expect, it } from 'vitest'
import { createCommandQueue } from '@/core/commands.ts'
import { DIFFICULTIES } from '@/core/content/difficulty.ts'
import type { NightDef } from '@/core/content/schema.ts'
import { tick } from '@/core/sim.ts'
import { startWave } from '@/core/systems/index.ts'
import type { DifficultyId, World } from '@/core/types.ts'
import { createTestWorld } from './fixtures/world.ts'

/**
 * Every night here is a literal. **Nothing asserts against `night01`'s authored numbers** -- step 5C
 * re-tunes those, and a spec that hard-codes them turns a tuning pass into a red suite.
 */

type Entry = NightDef['waves'][number]['entries'][number]

function nightOf(...entries: Entry[]): NightDef {
	return {
		id: 'spec',
		index: 1,
		mapId: 'test',
		waves: [{ entries, countdownTicks: 12 * 60 }],
	}
}

function worldOn(difficulty: DifficultyId = 'normal'): World {
	const world = createTestWorld()
	world.difficulty = { ...DIFFICULTIES[difficulty] }
	return world
}

/** Runs `count` ticks and returns the tick each enemy first appeared on. */
function spawnTicksOver(world: World, count: number): number[] {
	const queue = createCommandQueue()
	const ticks: number[] = []

	for (let i = 0; i < count; i++) {
		const before = world.enemies.length
		const at = world.tick
		tick(world, queue)
		for (let n = before; n < world.enemies.length; n++) {
			ticks.push(at)
		}
	}

	return ticks
}

describe('startWave and spawnSystem', () => {
	it('spawns exactly the authored count, one every spacingTicks', () => {
		const world = worldOn()
		startWave(world, nightOf({ enemyDefId: 'ant', count: 10, spacingTicks: 30, startDelayTicks: 0 }), 0)

		const ticks = spawnTicksOver(world, 301)

		expect(ticks).toEqual([0, 30, 60, 90, 120, 150, 180, 210, 240, 270])
		expect(world.enemies).toHaveLength(10)
	})

	it('holds the first spawn until startDelayTicks has passed', () => {
		const world = worldOn()
		startWave(world, nightOf({ enemyDefId: 'ant', count: 3, spacingTicks: 30, startDelayTicks: 45 }), 0)

		expect(spawnTicksOver(world, 150)).toEqual([45, 75, 105])
	})

	it('sets the wave up as a running wave and announces it', () => {
		const world = worldOn()
		world.tick = 500
		startWave(world, nightOf({ enemyDefId: 'ant', count: 2, spacingTicks: 30, startDelayTicks: 20 }), 0)

		expect(world.night.phase).toBe('wave')
		expect(world.night.waveIndex).toBe(0)
		expect(world.night.wave).toEqual({
			index: 0,
			startedAtTick: 500,
			spawns: [{ enemyDefId: 'ant', remaining: 2, nextSpawnTick: 520, spacingTicks: 30, pathId: 'a' }],
		})
		expect(world.events).toEqual([{ kind: 'waveStarted', waveIndex: 0 }])
	})

	it('indexes each spawned enemy by its position in world.enemies', () => {
		const world = worldOn()
		startWave(world, nightOf({ enemyDefId: 'ant', count: 3, spacingTicks: 1, startDelayTicks: 0 }), 0)
		spawnTicksOver(world, 3)

		// The fixture's `nextEntityId` starts at 2, and ids are never reused.
		expect(world.enemies.map(enemy => enemy.id)).toEqual([2, 3, 4])
		expect(world.index.enemies).toEqual({ 2: 0, 3: 1, 4: 2 })
		expect(world.enemies.every(enemy => enemy.spawnedInWaveIndex === 0)).toBe(true)
	})

	it('gives each enemy its own tags array rather than an alias of the def', () => {
		const world = worldOn()
		startWave(world, nightOf({ enemyDefId: 'ant', count: 2, spacingTicks: 1, startDelayTicks: 0 }), 0)
		spawnTicksOver(world, 2)

		const [first, second] = world.enemies
		expect(first?.tags).toEqual(['ground', 'swarm', 'bug'])
		expect(first?.tags).not.toBe(second?.tags)
	})

	it('does nothing at all while night.wave is null', () => {
		const world = worldOn()
		// A build phase whose countdown outlasts the run, so the wave system neither starts wave 0
		// nor -- the fixture's night id being synthetic -- throws trying to look one up.
		world.night.phase = 'building'
		world.night.countdownTicks = 10_000

		spawnTicksOver(world, 120)

		expect(world.enemies).toHaveLength(0)
		expect(world.night.phase).toBe('building')
		expect(world.night.countdownTicks).toBe(9880)
	})
})

describe('difficulty scalars', () => {
	it('scales count up and HP up on nightmare, without rounding the HP', () => {
		const world = worldOn('nightmare')
		const night = nightOf({ enemyDefId: 'ant', count: 5, spacingTicks: 10, startDelayTicks: 0 })
		const authored = structuredClone(night)

		startWave(world, night, 0)
		spawnTicksOver(world, 100)

		// round(5 * 1.25) = 6, and the Ant's 10 HP * 1.35 stays 13.5.
		expect(world.enemies).toHaveLength(6)
		expect(world.enemies.every(enemy => enemy.hp === 13.5 && enemy.maxHp === 13.5)).toBe(true)
		expect(night).toEqual(authored)
	})

	it('rounds a one-enemy entry up on cozy rather than deleting it', () => {
		const world = worldOn('cozy')
		startWave(world, nightOf({ enemyDefId: 'ant', count: 1, spacingTicks: 10, startDelayTicks: 0 }), 0)
		spawnTicksOver(world, 30)

		// round(1 * 0.85) = 1. floor would be 0, and the entry would vanish on the easiest tier only.
		expect(world.enemies).toHaveLength(1)
		expect(world.enemies[0]?.hp).toBe(8)
	})
})

describe('lanes', () => {
	function twoPathWorld(): World {
		const world = worldOn()
		// As long as lane 'a', so that neither lane's enemies reach the fridge and get eaten
		// mid-assertion -- these tests are about who spawns where, not about leaks.
		world.map.paths.push({
			id: 'b',
			waypoints: [
				{ x: 0, y: 0 },
				{ x: 39, y: 0 },
			],
			lengthTiles: 39,
		})
		return world
	}

	it('deals an entry with no pathId round-robin across every lane', () => {
		const world = twoPathWorld()
		startWave(world, nightOf({ enemyDefId: 'ant', count: 5, spacingTicks: 20, startDelayTicks: 0 }), 0)

		expect(world.night.wave?.spawns.map(spawn => [spawn.pathId, spawn.remaining])).toEqual([
			['a', 3],
			['b', 2],
		])

		spawnTicksOver(world, 200)
		expect(world.enemies.filter(enemy => enemy.pathId === 'a')).toHaveLength(3)
		expect(world.enemies.filter(enemy => enemy.pathId === 'b')).toHaveLength(2)
	})

	it('keeps the spacing of the entry per lane rather than dividing it', () => {
		const world = twoPathWorld()
		startWave(world, nightOf({ enemyDefId: 'ant', count: 4, spacingTicks: 20, startDelayTicks: 0 }), 0)

		// Two lanes, two enemies each, both lanes on the same clock: 2 enemies on tick 0 and 2 on 20.
		expect(spawnTicksOver(world, 60)).toEqual([0, 0, 20, 20])
	})

	it('throws with both ids when an entry names a path the map does not have', () => {
		const world = worldOn()
		const night = nightOf({ enemyDefId: 'ant', count: 1, spacingTicks: 20, startDelayTicks: 0, pathId: 'crack' })

		expect(() => startWave(world, night, 0)).toThrow(/crack/)
		expect(() => startWave(world, night, 0)).toThrow(/test/)
	})
})

describe('movementSystem', () => {
	it('advances an ant exactly one tile of arc length in 60 ticks', () => {
		const world = worldOn()
		startWave(world, nightOf({ enemyDefId: 'ant', count: 1, spacingTicks: 60, startDelayTicks: 0 }), 0)

		// Spawn runs 2nd and movement 4th, so the ant spawned during the first tick also moves
		// during it: 60 calls are 60 steps of 1/60 of a tile, not 59.
		spawnTicksOver(world, 60)

		// 60 additions of 1/60 is not exactly 1 in binary floating point -- the tolerance is spelled
		// out rather than rounded, because this is the assertion that catches a units slip.
		expect(world.enemies[0]?.distance).toBeCloseTo(1, 9)
	})

	it('walks a roach 1.8 times as far as an ant over the same 60 ticks', () => {
		const world = worldOn()
		startWave(
			world,
			nightOf(
				{ enemyDefId: 'ant', count: 1, spacingTicks: 60, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 1, spacingTicks: 60, startDelayTicks: 0 },
			),
			0,
		)
		spawnTicksOver(world, 60)

		expect(world.enemies[1]?.distance).toBeCloseTo(1.8, 9)
	})

	it('freezes an enemy in place through speedMultiplier', () => {
		const world = worldOn()
		startWave(world, nightOf({ enemyDefId: 'ant', count: 1, spacingTicks: 60, startDelayTicks: 0 }), 0)
		spawnTicksOver(world, 1)

		const enemy = world.enemies[0]
		expect(enemy).toBeDefined()
		const before = enemy?.distance ?? 0
		// Freeze is magnitude 1, so speedMultiplier is 0. Nothing applies a status until step 9;
		// this is here so a movement system that ignores statuses fails now rather than then.
		enemy?.statuses.push({ kind: 'freeze', remainingTicks: 600, stacks: 1, magnitude: 1, sourceId: null })
		spawnTicksOver(world, 30)

		expect(enemy?.distance).toBe(before)
	})
})
