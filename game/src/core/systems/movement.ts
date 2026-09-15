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

/**
 * How fast a fled enemy runs for the door, as a multiple of its own `speed`. Set by
 * `core/systems/noise.ts`'s wake; read only here.
 *
 * **`speedMultiplier` is deliberately not applied to it** (step 13A, decision 12): a frozen or
 * rooted enemy that can never leave is a board that never empties and a night that never ends. Flee
 * speed is exactly `speed * 2`, whatever is stuck to it.
 */
export const FLEE_SPEED_MULT = 2

export function movementSystem(world: World): void {
	// Terminal phases run nothing, or the night keeps simulating behind the summary screen.
	if (world.night.phase === 'won' || world.night.phase === 'lost') {
		return
	}

	for (const enemy of world.enemies) {
		// A fled enemy walks back the way it came -- see `FLEE_SPEED_MULT`. No clamp: `samplePath`
		// already clamps a negative distance for the renderer, and `resolveSystem` removes it at 0.
		if (enemy.flags.fleeing) {
			enemy.distance -= enemy.speed * FLEE_SPEED_MULT
			continue
		}

		enemy.distance += enemy.speed * speedMultiplier(enemy)
	}
}
