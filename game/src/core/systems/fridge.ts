/**
 * The shelf, and the only writer of food state.
 *
 * `FoodItem.heldBy`, `droppedAt` and `lostTo`, and `Enemy.stolenItems`, are written here and nowhere
 * else, and always together: an item a thief holds is in that thief's list and names it back. Two
 * writers is how the same pizza ends up on two sprites, or on one that no longer exists.
 *
 * **A helper file, not a slot.** `resolve`, `theft`, `crumbs` and `commands` call it. It never imports
 * any of them -- they import this, and the cycle surfaces as an `undefined` at module load.
 */

import { getEnemyDef } from '@/core/content/index.ts'
import { enemyById } from '@/core/systems/spatial.ts'
import type { EnemyDef } from '@/core/content/schema.ts'
import type { Enemy, EntityId, FoodItem, Vec2, World } from '@/core/types.ts'

/** Sitting on the shelf: not carried, not on the floor, not gone. Only these can be taken. */
export function isOnShelf(item: FoodItem): boolean {
	return item.heldBy === null && item.droppedAt === null && item.lostTo === null
}

/**
 * Lying on the floor where a thief died, waiting to be fetched. Not `isOnFloor`: that is
 * `core/systems/targeting.ts`'s, about an enemy, and the two would be auto-imported for each other.
 */
export function isDropped(item: FoodItem): boolean {
	return item.droppedAt !== null
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
 * A thief died carrying: everything it held lands at `at`, the point its crumb dropped on, and stays
 * there until a click or a `collect` radius fetches it. Every item sits at the one exact point --
 * fanning them apart is the renderer's.
 *
 * An enemy carrying nothing pushes no event, or every Ant death is one the renderer has to filter.
 */
export function dropCarried(world: World, enemy: Enemy, at: Vec2): void {
	const items = [...enemy.stolenItems]
	if (items.length === 0) {
		return
	}

	for (const id of items) {
		const item = foodItem(world, id)
		if (item !== null) {
			item.heldBy = null
			item.droppedAt = { x: at.x, y: at.y }
		}
	}
	enemy.stolenItems = []

	world.events.push({ kind: 'foodDropped', enemyId: enemy.id, items, at: { x: at.x, y: at.y } })
}

/**
 * The one door off the floor, for the click (`byTowerId` null) and a tower's `collect` radius alike.
 *
 * A silent no-op for anything not on the floor -- on the shelf, carried, gone, or unknown. Frames pass
 * between a click and its tick, and a tower may have fetched it in between; two clicks in one batch
 * return it once because the second finds it already on the shelf.
 */
export function collectFood(world: World, foodId: EntityId, byTowerId: EntityId | null): void {
	const item = foodItem(world, foodId)
	if (item === null || item.droppedAt === null) {
		return
	}

	// Read before `returnToShelf` clears it: the flight home starts where the food lay.
	const from = item.droppedAt
	returnToShelf(world, [foodId])
	world.events.push({ kind: 'foodReturned', items: [foodId], from, byTowerId })
}

/**
 * The night was won with food still on the floor: it is lost where it lies. Called before
 * `nightEnded` is pushed, so a summary built off that tick already sees it.
 */
export function forfeitDroppedFood(world: World): void {
	for (const item of world.night.food) {
		if (item.droppedAt !== null) {
			item.droppedAt = null
			item.lostTo = 'floor'
		}
	}
}

/**
 * Puts these items back on the shelf, from a thief's paws or from the floor, and takes each out of
 * the list of whoever was holding it. `collectFood` is the floor's caller.
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
