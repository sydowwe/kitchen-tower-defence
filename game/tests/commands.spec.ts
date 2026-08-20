import { describe, expect, it } from 'vitest'
import { createCommandQueue, type Command } from '@/core/commands.ts'

/**
 * The queue's one real rule: a batch is a snapshot. Anything enqueued while the current batch is
 * being processed belongs to the *next* tick, because a system that could grow the list it is
 * iterating is a system whose behaviour depends on iteration order -- and that is the end of
 * determinism.
 */

/** Compiles only while the union is exhaustive: the `never` default is the assertion. */
function describeCommand(command: Command): string {
	switch (command.kind) {
		case 'PlaceTower':
			return `place ${command.defId} at ${command.tile.x},${command.tile.y}`
		case 'SellTower':
			return `sell ${command.towerId}`
		case 'UpgradeTower':
			return `upgrade ${command.towerId}`
		case 'SetTargetingMode':
			return `retarget ${command.towerId} to ${command.mode}`
		case 'CollectCrumb':
			return `collect ${command.crumbId}`
		case 'CallWaveEarly':
			return 'call wave early'
		case 'SetSpeed':
			return `speed ${command.speed}`
		default: {
			const unreachable: never = command
			return unreachable
		}
	}
}

describe('command queue', () => {
	it('returns an empty batch from an empty queue without throwing', () => {
		expect(createCommandQueue().drain()).toEqual([])
	})

	it('hands back commands in the order they were enqueued', () => {
		const queue = createCommandQueue()
		queue.enqueue({ kind: 'CallWaveEarly' })
		queue.enqueue({ kind: 'SellTower', towerId: 4 })

		expect(queue.drain().map(command => command.kind)).toEqual(['CallWaveEarly', 'SellTower'])
	})

	it('empties itself on drain', () => {
		const queue = createCommandQueue()
		queue.enqueue({ kind: 'CallWaveEarly' })
		queue.drain()

		expect(queue.length).toBe(0)
		expect(queue.drain()).toEqual([])
	})

	it('defers commands enqueued while a batch is being processed to the next batch', () => {
		const queue = createCommandQueue()
		queue.enqueue({ kind: 'CollectCrumb', crumbId: 1 })

		const batch = queue.drain()
		const processed: number[] = []
		for (const command of batch) {
			if (command.kind === 'CollectCrumb') {
				processed.push(command.crumbId)
				// A tower reacting to the collection, a UI reacting to an event: same thing.
				queue.enqueue({ kind: 'CollectCrumb', crumbId: command.crumbId + 1 })
			}
		}

		// The batch did not grow underneath the loop...
		expect(processed).toEqual([1])
		expect(batch).toHaveLength(1)
		// ...and the new command is waiting for the next tick boundary.
		expect(queue.drain()).toEqual([{ kind: 'CollectCrumb', crumbId: 2 }])
	})

	it('round-trips every command shape through JSON unchanged', () => {
		const commands: Command[] = [
			{ kind: 'PlaceTower', defId: 'saltShaker', tile: { x: 3, y: 7 } },
			{ kind: 'SellTower', towerId: 12 },
			{ kind: 'UpgradeTower', towerId: 12 },
			{ kind: 'SetTargetingMode', towerId: 12, mode: 'STRONGEST' },
			{ kind: 'CollectCrumb', crumbId: 88 },
			{ kind: 'CallWaveEarly' },
			{ kind: 'SetSpeed', speed: 3 },
		]

		for (const command of commands) {
			expect(JSON.parse(JSON.stringify(command))).toEqual(command)
		}
	})

	it('covers every kind in an exhaustive switch', () => {
		expect(describeCommand({ kind: 'PlaceTower', defId: 'saltShaker', tile: { x: 1, y: 2 } })).toBe(
			'place saltShaker at 1,2',
		)
		expect(describeCommand({ kind: 'CallWaveEarly' })).toBe('call wave early')
	})
})
