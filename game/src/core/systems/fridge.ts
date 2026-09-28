/**
 * The shelf, and the only writer of food state.
 *
 * `FoodItem.heldBy`, `droppedAt` and `lostTo`, and `Enemy.stolenItems`, are written here and nowhere
 * else, and always together: an item a thief holds is in that thief's list and names it back. Two
 * writers is how the same pizza ends up on two sprites, or on one that no longer exists.
 *
 * **A helper file, not a slot.** `resolve` and `theft` call it. It never imports either of them --
 * `resolve.ts` imports this, and the cycle surfaces as an `undefined` at module load.
 */

import { getEnemyDef } from '@/core/content/index.ts'
import { enemyById } from '@/core/systems/spatial.ts'
import type { EnemyDef } from '@/core/content/schema.ts'
import type { Enemy, EntityId, FoodItem, World } from '@/core/types.ts'

/** Sitting on the shelf: not carried, not on the floor, not gone. Only these can be taken. */
export function isOnShelf(item: FoodItem): boolean {
	return item.heldBy === null && item.droppedAt === null && item.lostTo === null
}

/**
 * Gone for the night. **Not** "not on the shelf": an item a thief is still carrying can come back, so
 * the fridge is empty only when every item is gone.
 */
export function isGone(item: FoodItem): boolean {
	return item.lostTo !== null
}

/**
 * How many items this enemy takes at the fridge, after the night's `stealsReduction`. Never below 1
 * for an enemy that steals at all -- and 0 stays 0, or the Mold would be handed an item.
 */
export function stealsFor(world: World, def: EnemyDef): number {
	return def.steals === 0 ? 0 : Math.max(1, def.steals - world.night.stealsReduction)
}

function foodItem(world: World, id: EntityId): FoodItem | null {
	return world.night.food.find(item => item.id === id) ?? null
}

/**
 * The one take, for a walker leaking at the fridge and a thief completing its grab alike, so a
 * `stealsReduction` cannot apply to one and not the other. Returns the ids taken, which may be fewer
 * than `stealsFor` -- or none, at an empty shelf.
 *
 * The **first items on the shelf** rather than a random draw, so what leaves the fridge is decided by
 * the order the night stocked it in and stays the same on a replay. "On the shelf" and not "not gone":
 * an item another thief is already carrying is not there to take.
 *
 * A walker eats what it takes on the spot. A thief holds it, and `resolve` decides later whether it
 * escaped.
 */
export function takeFood(world: World, enemy: Enemy): EntityId[] {
	const def = getEnemyDef(enemy.defId)
	const count = stealsFor(world, def)
	const carries = def.thief !== undefined
	const taken: EntityId[] = []

	for (const item of world.night.food) {
		if (taken.length >= count) {
			break
		}
		if (!isOnShelf(item)) {
			continue
		}
		if (carries) {
			item.heldBy = enemy.id
			enemy.stolenItems.push(item.id)
		} else {
			item.lostTo = 'eaten'
		}
		taken.push(item.id)
	}

	return taken
}

/** A thief left the map: everything it carried is gone for the night. Returns those ids. */
export function escapeWith(world: World, enemy: Enemy): EntityId[] {
	const items = [...enemy.stolenItems]

	for (const id of items) {
		const item = foodItem(world, id)
		if (item !== null) {
			item.heldBy = null
			item.lostTo = 'escaped'
		}
	}
	enemy.stolenItems = []

	return items
}

/**
 * Puts these items back on the shelf, from a thief's paws or from the floor, and takes each out of
 * the list of whoever was holding it. Step 19B's pickups call it too.
 */
export function returnToShelf(world: World, ids: readonly EntityId[]): void {
	for (const id of ids) {
		const item = foodItem(world, id)
		if (item === null) {
			continue
		}
		if (item.heldBy !== null) {
			const holder = enemyById(world, item.heldBy)
			if (holder !== null) {
				holder.stolenItems = holder.stolenItems.filter(held => held !== id)
			}
		}
		item.heldBy = null
		item.droppedAt = null
		item.lostTo = null
	}
}
