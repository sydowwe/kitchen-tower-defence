/**
 * Every enemy walks its polyline, one tick's worth.
 *
 * That is the whole system, and deliberately so: no steering, no collision, no separation. Enemies
 * overlap freely, which is correct for the genre -- there is no pathfinding anywhere in this
 * codebase (analytic-docs/DECISIONS.md section 3) and an enemy is `{ pathId, distance }`.
 *
 * **`speed` is already tiles per tick**, converted once at authoring time in
 * `core/content/enemies.ts`. There is no `TICK` factor here and there must not be one: `core/` has
 * no clock, and multiplying by 1/60 a second time would put an Ant a minute per tile behind.
 *
 * An enemy walking past the end of its path is not handled here -- step 5B removes it, and
 * `samplePath` clamps for the renderer in the meantime.
 */

import { speedMultiplier } from '@/core/content/statuses.ts'
import type { World } from '@/core/types.ts'

export function movementSystem(world: World): void {
	// Terminal phases run nothing, or the night keeps simulating behind the summary screen.
	if (world.night.phase === 'won' || world.night.phase === 'lost') {
		return
	}

	for (const enemy of world.enemies) {
		enemy.distance += enemy.speed * speedMultiplier(enemy)
	}
}
