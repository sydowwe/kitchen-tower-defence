import { describe, expect, it } from 'vitest'
import { createCommandQueue } from '@/core/commands.ts'
import { tick } from '@/core/sim.ts'
import { nightClock } from '@/core/systems/wave.ts'
import { createWorld } from '@/core/world.ts'
import type { CreateWorldOptions } from '@/core/world.ts'
import type { Enemy, GameEvent, World } from '@/core/types.ts'

/**
 * The night as a structure: waves that start on a countdown or early on command, ants that reach
 * the fridge and take named food off the shelf, and a night that ends won or lost.
 *
 * **Nothing here asserts night 1's authored tables.** Step 5C re-tunes them, and a spec that
 * hard-codes them turns a tuning pass into a red suite -- so every number below is either read off
 * the def, set on the world directly, or a rule (2 crumbs a second, 2:00am) rather than content.
 */

const OPTIONS: CreateWorldOptions = { seed: 1234, mapId: 'counter', nightId: 'night01', difficulty: 'normal' }

function options(overrides: Partial<CreateWorldOptions> = {}): CreateWorldOptions {
	return { ...OPTIONS, ...overrides }
}

function firstPathId(world: World): string {
	const path = world.map.paths[0]
	if (path === undefined) {
		throw new Error('the map has no paths')
	}
	return path.id
}

/** Enemies parked past the end of the track, which is what `resolveSystem` reads as a leak. */
function putEnemiesAtTheFridge(world: World, count: number, spawnedInWaveIndex = 0): void {
	const pathId = firstPathId(world)

	for (let index = 0; index < count; index++) {
		const enemy: Enemy = {
			id: world.nextEntityId++,
			defId: 'ant',
			pathId,
			distance: 1000,
			lateralOffsetTiles: 0,
			hp: 10,
			maxHp: 10,
			statuses: [],
			tags: ['ground'],
			speed: 0,
			spawnedInWaveIndex,
			stolenItems: [],
			flags: { hidden: false, untargetable: false, fleeing: false, revealed: false },
		}
		world.enemies.push(enemy)
		world.index.enemies[enemy.id] = world.enemies.length - 1
	}
}

function eventsOfKind<K extends GameEvent['kind']>(events: readonly GameEvent[], kind: K): GameEvent[] {
	return events.filter(event => event.kind === kind)
}

describe('leaks and the fridge', () => {
	it('empties a three-item fridge and loses in the same tick, without shortening the shelf', () => {
		const world = createWorld(options())
		world.night.food = world.night.food.slice(0, 3)
		// Five Ants stealing one each against three items: the two that find nothing left must not
		// crash, invent an id, or emit a second `nightEnded`.
		putEnemiesAtTheFridge(world, 5)

		tick(world, createCommandQueue())

		expect(world.night.food).toHaveLength(3)
		expect(world.night.food.every(item => item.lost)).toBe(true)
		expect(world.enemies).toEqual([])
		expect(world.index.enemies).toEqual({})
		expect(world.night.phase).toBe('lost')
		expect(eventsOfKind(world.events, 'enemyLeaked')).toHaveLength(5)
		expect(eventsOfKind(world.events, 'nightEnded')).toEqual([{ kind: 'nightEnded', won: false }])
	})

	it('takes the items at the front of the shelf, so a replay loses the same food', () => {
		const world = createWorld(options())
		const [first, second] = world.night.food.map(item => item.id)
		putEnemiesAtTheFridge(world, 2)

		tick(world, createCommandQueue())

		expect(eventsOfKind(world.events, 'enemyLeaked')).toEqual([
			expect.objectContaining({ stolenItems: [first] }),
			expect.objectContaining({ stolenItems: [second] }),
		])
		expect(world.night.food.filter(item => item.lost).map(item => item.id)).toEqual([first, second])
	})
})

describe('CallWaveEarly', () => {
	function inCountdown(countdownTicks: number): World {
		const world = createWorld(options())
		world.night.phase = 'countdown'
		world.night.countdownTicks = countdownTicks
		return world
	}

	function call(world: World): void {
		const queue = createCommandQueue()
		queue.enqueue({ kind: 'CallWaveEarly' })
		tick(world, queue)
	}

	it('pays two crumbs per whole second skipped and banks the ticks', () => {
		const world = inCountdown(7 * 60)
		const before = world.crumbs

		call(world)

		expect(world.crumbs - before).toBe(14)
		expect(world.night.ticksSkippedTotal).toBe(420)
		expect(world.night.waveIndex).toBe(1)
		expect(world.night.phase).toBe('wave')
		expect(world.night.countdownTicks).toBe(0)
	})

	it('pays nothing for a countdown already at zero, and starts exactly one wave', () => {
		const world = inCountdown(0)
		const before = world.crumbs

		call(world)

		expect(world.crumbs).toBe(before)
		expect(world.night.ticksSkippedTotal).toBe(0)
		expect(world.night.waveIndex).toBe(1)
		expect(eventsOfKind(world.events, 'waveStarted')).toEqual([{ kind: 'waveStarted', waveIndex: 1 }])
	})

	it('changes nothing at all while a wave is running', () => {
		const world = createWorld(options())
		world.night.phase = 'wave'
		world.night.wave = {
			index: 0,
			startedAtTick: 0,
			// Due far beyond the single tick below, so the wave is still spawning and the wave
			// system has no reason to touch the phase either.
			spawns: [{ enemyDefId: 'ant', remaining: 3, nextSpawnTick: 10_000, spacingTicks: 60, pathId: 'crack' }],
		}
		const before = structuredClone(world)

		call(world)

		expect(world.crumbs).toBe(before.crumbs)
		expect(world.night.waveIndex).toBe(0)
		expect(world.night.phase).toBe('wave')
		expect(world.night.ticksSkippedTotal).toBe(0)
		expect(world.night.countdownTicks).toBe(before.night.countdownTicks)
		expect(world.events).toEqual([])
	})
})

describe('nightClock', () => {
	it('opens at 2:00am on the first wave and reads 6:00am on the last', () => {
		expect(nightClock(0, 6)).toEqual({ hour: 2, minute: 0 })
		expect(nightClock(5, 6)).toEqual({ hour: 6, minute: 0 })
	})

	it('spreads the four hours over the waves in between', () => {
		expect(nightClock(1, 6)).toEqual({ hour: 2, minute: 48 })
		expect(nightClock(3, 5)).toEqual({ hour: 5, minute: 0 })
	})

	it('puts a one-wave night at the start of the night rather than dividing by zero', () => {
		expect(nightClock(0, 1)).toEqual({ hour: 2, minute: 0 })
	})
})

describe('the end of the night', () => {
	it('wins in the tick the last enemy is removed, not the tick after', () => {
		const world = createWorld(options())
		const night = world.night
		night.phase = 'wave'
		night.waveIndex = night.waveCount - 1
		night.wave = {
			index: night.waveCount - 1,
			startedAtTick: 0,
			spawns: [{ enemyDefId: 'ant', remaining: 0, nextSpawnTick: 0, spacingTicks: 60, pathId: 'crack' }],
		}
		putEnemiesAtTheFridge(world, 1, night.waveCount - 1)

		tick(world, createCommandQueue())

		expect(world.enemies).toEqual([])
		expect(world.night.phase).toBe('won')
		expect(eventsOfKind(world.events, 'nightEnded')).toEqual([{ kind: 'nightEnded', won: true }])
	})

	it('runs no system once the night is over', () => {
		const world = createWorld(options())
		world.night.phase = 'won'
		putEnemiesAtTheFridge(world, 1)
		const before = structuredClone(world)

		for (let index = 0; index < 200; index++) {
			tick(world, createCommandQueue())
		}

		expect(world.enemies).toHaveLength(1)
		expect(world.enemies[0]?.distance).toBe(1000)
		expect(world.night.food.some(item => item.lost)).toBe(false)
		expect(world.night.countdownTicks).toBe(before.night.countdownTicks)
	})
})

describe('waveCleared', () => {
	it('fires once for a wave whose stragglers are gone, while the next wave is still spawning', () => {
		const world = createWorld(options())
		const night = world.night
		night.waveIndex = 1
		night.phase = 'wave'
		night.wave = {
			index: 1,
			startedAtTick: 0,
			spawns: [{ enemyDefId: 'ant', remaining: 5, nextSpawnTick: 0, spacingTicks: 60, pathId: 'crack' }],
		}

		const queue = createCommandQueue()
		let clearedWaveZero = 0
		for (let index = 0; index < 300; index++) {
			tick(world, queue)
			clearedWaveZero += world.events.filter(
				event => event.kind === 'waveCleared' && event.waveIndex === 0,
			).length
		}

		// Wave 1 spawned five ants over those 300 ticks and none of them has walked the Counter yet,
		// so wave 1 is emphatically not cleared -- and wave 0's event still fired exactly once.
		expect(clearedWaveZero).toBe(1)
		expect(world.night.clearedThroughWaveIndex).toBe(0)
		expect(world.enemies).toHaveLength(5)
	})
})

describe('a headless night', () => {
	/**
	 * Plays a night out to `nightEnded`, recording every event in order.
	 *
	 * `killEvery` is a stand-in for towers that kill: every N ticks everything on the board dies where
	 * it stands. 0 -- the default -- is an unattended night, where nothing dies, nothing rots and no
	 * Fruit Fly is ever hatched.
	 */
	function playOut(
		seed: number,
		callWaveAt: readonly number[],
		killEvery = 0,
	): { world: World; log: GameEvent[]; endedAt: number } {
		const world = createWorld(options({ seed }))
		const queue = createCommandQueue()
		const log: GameEvent[] = []
		let endedAt = -1

		for (let index = 0; index < 20_000 && endedAt < 0; index++) {
			if (callWaveAt.includes(world.tick)) {
				queue.enqueue({ kind: 'CallWaveEarly' })
			}
			if (killEvery > 0 && world.tick % killEvery === 0) {
				for (const enemy of world.enemies) {
					enemy.hp = 0
				}
			}
			tick(world, queue)
			log.push(...world.events)
			if (world.events.some(event => event.kind === 'nightEnded')) {
				endedAt = world.tick
			}
		}

		return { world, log, endedAt }
	}

	it('plays itself out with no input and no renderer', () => {
		const { world, log, endedAt } = playOut(4242, [])

		expect(endedAt).toBeGreaterThan(0)
		// No towers means every Ant reaches the fridge, so an unattended night is always a loss.
		expect(world.night.phase).toBe('lost')
		expect(log.filter(event => event.kind === 'waveStarted').length).toBeGreaterThan(0)
		expect(log.filter(event => event.kind === 'enemyLeaked').length).toBe(world.night.food.length)
	})

	it('produces the same events at the same ticks on a second run of the same seed and log', () => {
		const first = playOut(4242, [800, 1600])
		const second = playOut(4242, [800, 1600])

		expect(first.endedAt).toBe(second.endedAt)
		expect(first.log).toEqual(second.log)
		expect(first.world.night.food).toEqual(second.world.night.food)
		expect(first.world).toEqual(second.world)
	})

	it('reproduces a night that hatches Fruit Flies, down to the tick each one appears on', () => {
		// Crumbs only exist where something died, so determinism over rot needs a night with kills in
		// it. Ten seconds apart, so piles land past the start of the lane and live long enough to rot.
		const first = playOut(4242, [800, 1600], 600)
		const second = playOut(4242, [800, 1600], 600)

		// Rot is a threshold and not a roll, so "deterministic" here is a real assertion only if flies
		// actually hatched. They only ever leave the log by dying or reaching the fridge.
		const flies = first.log.filter(
			event => (event.kind === 'enemyKilled' || event.kind === 'enemyLeaked') && event.defId === 'fruitFly',
		)
		expect(flies.length).toBeGreaterThan(0)

		expect(first.endedAt).toBe(second.endedAt)
		expect(first.log).toEqual(second.log)
		expect(first.world).toEqual(second.world)
	})

	it('tallies exactly one enemiesKilled per enemyKilled event, over a whole night', () => {
		// A UI counting the events itself would drift the moment a frame ran two ticks; the field is
		// what makes the number replayable, assertable and visible to the balance harness.
		const { world, log } = playOut(4242, [800, 1600], 600)
		const killed = log.filter(event => event.kind === 'enemyKilled').length

		expect(killed).toBeGreaterThan(0)
		expect(world.night.enemiesKilled).toBe(killed)
	})

	it('gives a different seed a different fridge and still ends deterministically', () => {
		const a = playOut(4242, [])
		const b = playOut(7, [])

		expect(a.world.night.food.map(item => item.defId)).not.toEqual(b.world.night.food.map(item => item.defId))
		expect(b.endedAt).toBe(playOut(7, []).endedAt)
	})
})
