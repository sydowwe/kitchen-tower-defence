/**
 * Thieves (analytic-docs/DECISIONS.md section 6): walk to the fridge, stand there for `grabTicks`,
 * take their items by name, and run back down the lane with them.
 *
 * This system only moves `Enemy.theft` from one phase to the next. The walking is `movement`'s, the
 * food is `core/systems/fridge.ts`'s, and escaping or dying is `resolve`'s, which runs in the slot
 * after this one.
 *
 * **Last before `resolve`**, so a thief killed anywhere earlier in the tick its grab would complete
 * is skipped here and takes nothing. `resolve` removes it the same tick.
 */

import { getEnemyDef } from '@/core/content/index.ts'
import { takeFood } from '@/core/systems/fridge.ts'
import type { Enemy, World } from '@/core/types.ts'

/** Walking backwards, for either reason: the wake's flight or a thief's. The renderer's mirror. */
export function isRetreating(enemy: Enemy): boolean {
	return enemy.flags.fleeing || enemy.theft?.phase === 'fleeing'
}

/** Standing at the fridge with its hands in it. */
export function isGrabbing(enemy: Enemy): boolean {
	return enemy.theft?.phase === 'grabbing'
}

/**
 * A thief on its own flight home -- **not** a woken one. The wake wins: an enemy with `flags.fleeing`
 * runs at the wake's speed, untargetable, through boxes and past pushes, whatever its phase says.
 */
export function isThiefFleeing(enemy: Enemy): boolean {
	return enemy.theft?.phase === 'fleeing' && !enemy.flags.fleeing
}

/** How far through its grab a thief is, 0..1. 0 for anything that is not grabbing. */
export function grabProgress(world: World, enemy: Enemy): number {
	const theft = enemy.theft
	const thief = getEnemyDef(enemy.defId).thief
	if (theft === null || theft.phase !== 'grabbing' || thief === undefined) {
		return 0
	}
	const remaining = theft.grabEndsTick - world.tick
	return Math.min(1, Math.max(0, 1 - remaining / thief.grabTicks))
}

export function theftSystem(world: World): void {
	// Terminal phases run nothing, or a grab completes behind the summary screen.
	if (world.night.phase === 'won' || world.night.phase === 'lost') {
		return
	}

	for (const enemy of world.enemies) {
		const theft = enemy.theft
		const thief = getEnemyDef(enemy.defId).thief
		if (theft === null || thief === undefined || enemy.hp <= 0) {
			continue
		}

		// The wake wins. A thief woken on the way in never arrives, and one woken mid-grab leaves with
		// nothing: the grab only ever completes below.
		if (enemy.flags.fleeing) {
			theft.phase = 'fleeing'
			continue
		}

		if (theft.phase === 'approaching') {
			const path = world.map.paths.find(candidate => candidate.id === enemy.pathId)
			if (path === undefined || enemy.distance < path.lengthTiles) {
				continue
			}
			// `movement` overshoots by up to one step; this is where it lands on the fridge.
			enemy.distance = path.lengthTiles
			theft.phase = 'grabbing'
			theft.grabEndsTick = world.tick + thief.grabTicks
			continue
		}

		if (theft.phase === 'grabbing' && world.tick >= theft.grabEndsTick) {
			const items = takeFood(world, enemy)
			theft.phase = 'fleeing'
			world.events.push({ kind: 'thiefGrabbed', enemyId: enemy.id, items })
		}
	}
}
