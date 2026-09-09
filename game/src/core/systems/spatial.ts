/**
 * Where an enemy is standing, and which enemies are near a point.
 *
 * `queryEnemiesInRange` is naive O(towers x enemies) every tick, which
 * analytic-docs/ARCHITECTURE.md section 6 budgets for and says when to replace. It exists as a
 * wrapper so the uniform-grid hash that section names can drop in behind it without touching a
 * caller -- every range question in the simulation asks this function, and none of them measures a
 * distance itself.
 *
 * **Everything here is tile space with integers on tile centres** -- the space `samplePath` returns
 * and `Tower.tile` is written in. The `+ 0.5` in `render/layers/entities.ts` is a pixel-space
 * convention and nothing else; adding it here would shift every tower's effective range half a tile
 * up and left, which is invisible on a range-3 circle and surfaces as "why did it not shoot that
 * one".
 */

import { applyLateralOffset, samplePath } from '@/core/path.ts'
import type { Enemy, EntityId, Vec2, World } from '@/core/types.ts'

/**
 * The enemy with this id, or null. Null is the normal case rather than an error: a projectile
 * routinely outlives the enemy it was aimed at.
 *
 * The id is re-checked against the entity found, so a stale `EntityIndex` reads out as "gone"
 * instead of as a different enemy taking the hit.
 */
export function enemyById(world: World, enemyId: EntityId): Enemy | null {
	const position = world.index.enemies[enemyId]
	const enemy = position === undefined ? undefined : world.enemies[position]
	return enemy !== undefined && enemy.id === enemyId ? enemy : null
}

/**
 * Where an enemy is, or null when the map has no path by its `pathId` -- a half-edited map out of
 * step 4's editor. Every caller skips such an enemy rather than throwing on it.
 *
 * **The lateral offset is applied here and nowhere else in `core/`**, so a Moth curving toward a
 * Nightlight is shot where it is drawn: targeting, the three hitbox shapes, splash, projectile aim
 * and the death event's `at` all ask this function.
 *
 * The zero case returns early on purpose. This is the hottest function in `core/` --
 * `queryEnemiesInRange` calls it once per enemy per tower per tick -- and two trig calls is a real
 * cost for an answer that is the bare sample for every enemy in the game but one.
 */
export function enemyPosition(world: World, enemy: Enemy): Vec2 | null {
	const path = world.map.paths.find(candidate => candidate.id === enemy.pathId)
	if (path === undefined) {
		return null
	}
	const at = samplePath(path, enemy.distance)
	if (enemy.lateralOffsetTiles === 0) {
		return { x: at.x, y: at.y }
	}
	return applyLateralOffset(at, enemy.lateralOffsetTiles)
}

/**
 * Every enemy within `radiusTiles` of `center` that passes `filter`, **in `world.enemies` order**.
 * That order is what makes every tie-break downstream deterministic, so nothing here sorts.
 *
 * Squared distances against a squared radius: no square root per enemy per tower per tick.
 */
export function queryEnemiesInRange(
	world: World,
	center: Vec2,
	radiusTiles: number,
	filter?: (enemy: Enemy) => boolean,
): Enemy[] {
	const radiusSquared = radiusTiles * radiusTiles
	const found: Enemy[] = []

	for (const enemy of world.enemies) {
		if (filter !== undefined && !filter(enemy)) {
			continue
		}

		const at = enemyPosition(world, enemy)
		if (at === null) {
			continue
		}

		const dx = at.x - center.x
		const dy = at.y - center.y
		if (dx * dx + dy * dy <= radiusSquared) {
			found.push(enemy)
		}
	}

	return found
}
