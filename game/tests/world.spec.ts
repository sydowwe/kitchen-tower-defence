import { describe, expect, it } from 'vitest'
import { createCommandQueue } from '@/core/commands.ts'
import { DIFFICULTIES } from '@/core/content/difficulty.ts'
import { weevil } from '@/core/content/enemies.ts'
import { tick } from '@/core/sim.ts'
import { pushEnemy } from '@/core/systems/pushback.ts'
import { spawnEnemyAt } from '@/core/systems/spawn.ts'
import { createWorld } from '@/core/world.ts'
import type { CreateWorldOptions } from '@/core/world.ts'
import type { World } from '@/core/types.ts'

/**
 * The determinism guarantee, asserted end to end with real content loaded:
 * `(seed, mapId, nightId, difficulty)` decides everything, and the world it produces is plain data
 * a JSON round-trip cannot change.
 *
 * The round-trip assertion is the headline one. It is what fails the moment a `Map`, a `Set`, a
 * `class` instance or a function-typed field appears anywhere in the world -- all four of which
 * survive being written and only stop working when a replay is loaded, weeks later.
 */

const OPTIONS: CreateWorldOptions = { seed: 1234, mapId: 'counter', nightId: 'night01', difficulty: 'normal' }

function options(overrides: Partial<CreateWorldOptions> = {}): CreateWorldOptions {
	return { ...OPTIONS, ...overrides }
}

function roundTrip(world: World): World {
	return JSON.parse(JSON.stringify(world)) as World
}

describe('createWorld', () => {
	it('survives a JSON round-trip unchanged', () => {
		const world = createWorld(options())

		expect(roundTrip(world)).toEqual(world)
		// Spelled out because `map.flags` is the field most likely to be "optimised" into a
		// Uint8Array one day, and a typed array round-trips into `{ "0": 1, "1": 3 }` -- which
		// `toEqual` above would happily accept as equal to the array it came from.
		expect(Array.isArray(roundTrip(world).map.flags)).toBe(true)
		expect(roundTrip(world).map.flags).toEqual(world.map.flags)
		// The two step 13A added. `toEqual` above covers them already; they are named because a field
		// that is 0 on a fresh world survives a round-trip whether or not it is *there*, so this is
		// what catches one that stopped being written at construction.
		expect(roundTrip(world).unbankedCrumbs).toBe(0)
		expect(roundTrip(world).noise.wakeCount).toBe(0)

		// Step 16A's `burrowWindow` is the first nested object on an enemy; a Weevil carries a live one.
		const lane = world.map.paths[0]
		expect(lane).toBeDefined()
		const burrower = spawnEnemyAt(world, weevil, lane?.id ?? '', 0, 0)
		expect(burrower.burrowWindow).not.toBeNull()
		expect(roundTrip(world)).toEqual(world)

		// Step 17B's `feeding` is the second, with `fedAt` beside it: a feeder mid-feed.
		burrower.feeding = { towerId: 7, distance: 3.25, releaseTick: 180 }
		burrower.fedAt.push(7)
		expect(roundTrip(world)).toEqual(world)
		expect(roundTrip(world).enemies[0]?.feeding).toEqual({ towerId: 7, distance: 3.25, releaseTick: 180 })

		// Step 18A's `pushback` is the third: a shoved enemy carries its resistance and when it was set.
		// Fed enemies are never shoved, so the feed is cleared first.
		burrower.feeding = null
		burrower.distance = 5
		expect(pushEnemy(world, burrower, 1.2, 7)).toBeGreaterThan(0)
		expect(burrower.pushback).not.toBeNull()
		expect(roundTrip(world)).toEqual(world)
	})

	it('starts at tick 0 with empty entity arrays and an index consistent with them', () => {
		const world = createWorld(options())

		expect(world.tick).toBe(0)
		expect(world.enemies).toEqual([])
		expect(world.towers).toEqual([])
		expect(world.projectiles).toEqual([])
		expect(world.crumbPiles).toEqual([])
		expect(world.tiles).toEqual([])
		expect(world.index).toEqual({ enemies: {}, towers: {}, projectiles: {}, crumbPiles: {} })
	})

	it('is identical for identical arguments', () => {
		expect(createWorld(options())).toEqual(createWorld(options()))
	})

	it('differs from another seed in its rng state and in what the fridge was stocked with', () => {
		const a = createWorld(options({ seed: 1 }))
		const b = createWorld(options({ seed: 2 }))

		expect(a.rng.state).not.toBe(b.rng.state)
		// The shelf is drawn through `world.rng`, so it is the second thing a seed decides -- and
		// deliberately so: which items are at risk is part of what makes a night its own. The count
		// is fixed by the night and the difficulty, so only the defs may differ.
		expect(a.night.food).toHaveLength(b.night.food.length)
		expect(a.night.food.map(item => item.defId)).not.toEqual(b.night.food.map(item => item.defId))
		// Everything else is decided by the arguments, and those are identical.
		expect({ ...a, seed: 0, rng: b.rng, night: b.night }).toEqual({ ...b, seed: 0, rng: b.rng, night: b.night })
	})

	it('stores the difficulty tier by id and by its resolved multipliers', () => {
		const world = createWorld(options({ difficulty: 'nightmare' }))

		expect(world.difficulty).toEqual(DIFFICULTIES.nightmare)
		expect(world.crumbs).toBe(DIFFICULTIES.nightmare.startingCrumbs)
		expect(world.noise.cap).toBe(DIFFICULTIES.nightmare.noiseCap)
	})

	it('gives the world its own copy of the map, so a night modifier cannot corrupt the def', () => {
		const world = createWorld(options())
		const before = world.map.flags[0]
		world.map.flags[0] = 0

		expect(createWorld(options()).map.flags[0]).toBe(before)
	})

	it('throws with the id in the message for an unknown map, night or difficulty', () => {
		expect(() => createWorld(options({ mapId: 'nosuchmap' }))).toThrow(/nosuchmap/)
		expect(() => createWorld(options({ nightId: 'nosuchnight' }))).toThrow(/nosuchnight/)
		// Not reachable through the types, but it is through a save record.
		expect(() => createWorld(options({ difficulty: 'brutal' as never }))).toThrow(/brutal/)
	})
})

describe('two worlds from the same seed', () => {
	it('are still deeply equal after a hundred ticks', () => {
		const a = createWorld(options())
		const b = createWorld(options())
		const queueA = createCommandQueue()
		const queueB = createCommandQueue()

		for (let i = 0; i < 100; i++) {
			tick(a, queueA)
			tick(b, queueB)
		}

		expect(a.tick).toBe(100)
		expect(a).toEqual(b)
		expect(roundTrip(a)).toEqual(a)
	})
})
