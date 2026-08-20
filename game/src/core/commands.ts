/**
 * The one channel the player can change the world through
 * (analytic-docs/ARCHITECTURE.md section 3).
 *
 * Nothing outside this queue may touch world state -- not a Vue handler, not a canvas click
 * listener. Every payload is plain data: ids, tile coordinates, enum values, never an entity
 * reference. That is what lets `(seed, mapId, nightId, commandLog)` be written to a crash report
 * and replayed.
 */

import type { DefId, EntityId, TargetingMode, Vec2 } from '@/core/types.ts'

export interface PlaceTower {
	kind: 'PlaceTower'
	defId: DefId
	/** Tile coordinates. Validity is the commands system's problem, not the queue's. */
	tile: Vec2
}

export interface SellTower {
	kind: 'SellTower'
	towerId: EntityId
}

export interface UpgradeTower {
	kind: 'UpgradeTower'
	towerId: EntityId
}

export interface SetTargetingMode {
	kind: 'SetTargetingMode'
	towerId: EntityId
	mode: TargetingMode
}

export interface CollectCrumb {
	kind: 'CollectCrumb'
	crumbId: EntityId
}

export interface CallWaveEarly {
	kind: 'CallWaveEarly'
}

/**
 * The simulation does nothing with this: a speed multiplier runs more ticks per frame and lives in
 * `loop.ts`. It travels through the queue anyway so the command log records *when* the player
 * changed speed, which is half of what makes a replay watchable.
 */
export interface SetSpeed {
	kind: 'SetSpeed'
	speed: number
}

export type Command = PlaceTower | SellTower | UpgradeTower | SetTargetingMode | CollectCrumb | CallWaveEarly | SetSpeed

export type CommandKind = Command['kind']

export interface CommandQueue {
	enqueue(command: Command): void
	/** Empties the queue and returns the batch. The sim calls this once per tick, at the boundary. */
	drain(): Command[]
	readonly length: number
}

export function createCommandQueue(): CommandQueue {
	let pending: Command[] = []

	function enqueue(command: Command): void {
		pending.push(command)
	}

	/**
	 * Hands back the array and starts a fresh one, rather than iterating the live array or
	 * truncating it. A command enqueued *while* the batch is being processed -- a tower that sells
	 * itself, a UI reacting to an event -- therefore lands in the next batch, never the current
	 * one. Draining into a fresh array is the whole of that guarantee.
	 */
	function drain(): Command[] {
		const batch = pending
		pending = []
		return batch
	}

	return {
		enqueue,
		drain,
		get length() {
			return pending.length
		},
	}
}
