import { describe, expect, it } from 'vitest'
import { createCommandQueue } from '@/core/commands.ts'
import { SYSTEM_ORDER, tick } from '@/core/sim.ts'
import { createTestWorld } from './fixtures/world.ts'

/**
 * Step 2A's systems are all no-ops, so these assertions are about the frame the rest of the
 * simulation hangs on: the tick counter, the order the systems run in, and the fact that a tick
 * over an empty world changes nothing else.
 */

describe('tick', () => {
	it('advances world.tick by exactly one per call', () => {
		const world = createTestWorld()
		const queue = createCommandQueue()

		tick(world, queue)
		expect(world.tick).toBe(1)

		for (let i = 0; i < 99; i++) {
			tick(world, queue)
		}
		expect(world.tick).toBe(100)
	})

	it('drains the queue exactly once per tick', () => {
		const world = createTestWorld()
		const queue = createCommandQueue()
		queue.enqueue({ kind: 'CallWaveEarly' })

		tick(world, queue)

		expect(queue.length).toBe(0)
	})

	it('mutates nothing but world.tick while every system is a stub', () => {
		const world = createTestWorld()
		const before = structuredClone(world)

		tick(world, createCommandQueue())

		expect(world.tick).toBe(before.tick + 1)
		world.tick = before.tick
		expect(world).toEqual(before)
	})

	it('leaves the world serialisable after ticking', () => {
		const world = createTestWorld()
		const queue = createCommandQueue()
		for (let i = 0; i < 10; i++) {
			tick(world, queue)
		}

		expect(JSON.parse(JSON.stringify(world))).toEqual(world)
	})
})

describe('system order', () => {
	/**
	 * Written out as a literal rather than derived, so that reordering a system in a later step
	 * fails here and has to be a deliberate two-file edit. The order is documented on `tick`.
	 */
	it('matches the documented order', () => {
		expect(SYSTEM_ORDER).toEqual([
			'commands',
			'spawn',
			'status',
			'movement',
			'targeting',
			'combat',
			'projectiles',
			'tiles',
			'crumbs',
			'noise',
			'economy',
			'resolve',
			'events',
		])
	})

	it('has a file per system in core/systems/', async () => {
		const systems = await import('@/core/systems/index.ts')
		for (const name of SYSTEM_ORDER) {
			expect(systems).toHaveProperty(`${name}System`)
		}
	})
})
