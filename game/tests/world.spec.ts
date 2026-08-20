import { describe, expect, it } from 'vitest'
import { createCommandQueue } from '@/core/commands.ts'
import { DIFFICULTIES } from '@/core/content/difficulty.ts'
import { tick } from '@/core/sim.ts'
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

	it('differs from another seed only in its rng state', () => {
		const a = createWorld(options({ seed: 1 }))
		const b = createWorld(options({ seed: 2 }))

		expect(a.rng.state).not.toBe(b.rng.state)
		expect({ ...a, seed: 0, rng: b.rng }).toEqual({ ...b, seed: 0, rng: b.rng })
	})

	it('stores the difficulty tier by id and by its resolved multipliers', () => {
		const world = createWorld(options({ difficulty: 'nightmare' }))

		expect(world.difficulty).toEqual(DIFFICULTIES.nightmare)
		expect(world.crumbs).toBe(DIFFICULTIES.nightmare.startingCrumbs)
		expect(world.noise.cap).toBe(DIFFICULTIES.nightmare.noiseCap)
	})

	it('gives the world its own copy of the map, so a night modifier cannot corrupt the def', () => {
		const world = createWorld(options())
		world.map.buildable[0] = false

		expect(createWorld(options()).map.buildable[0]).toBe(true)
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
