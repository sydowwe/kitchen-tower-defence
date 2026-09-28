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
 * An enemy walking past the end of its path is not handled here -- `resolveSystem` removes it (or
 * `theftSystem` stops a thief there), and `samplePath` clamps for the renderer in the meantime.
 */

import { getEnemyDef } from '@/core/content/index.ts'
import { speedMultiplier } from '@/core/content/statuses.ts'
import { isGrabbing, isThiefFleeing } from '@/core/systems/theft.ts'
import { tileSpeedMultiplier } from '@/core/systems/tiles.ts'
import type { Enemy, World } from '@/core/types.ts'

/**
 * How fast a fled enemy runs for the door, as a multiple of its own `speed`. Set by
 * `core/systems/noise.ts`'s wake; read only here.
 *
 * **`speedMultiplier` is deliberately not applied to it** (step 13A, decision 12): a frozen or
 * rooted enemy that can never leave is a board that never empties and a night that never ends. Flee
 * speed is exactly `speed * 2`, whatever is stuck to it.
 */
export const FLEE_SPEED_MULT = 2

/**
 * This tick's step along the lane for an enemy on its own feet, **signed**: positive toward the
 * fridge, negative for a thief running home. Not the wake's flight, which `movementSystem` handles
 * first and nothing else recomputes.
 *
 * The one copy of the formula. `barricadesSystem` rebuilds where the enemy stood before this tick
 * from it, and two copies is the tile-factor bug step 15A already hit once.
 *
 * Unlike the wake's flight, a thief's keeps both factors: a frozen or taped Mouse on its way out is
 * the counterplay the flight exists for.
 */
export function stepTiles(world: World, enemy: Enemy): number {
	// The tile factor is exactly 1 for an enemy on a bare floor, for a flyer, and for an empty
	// board, so this is unchanged in value for every enemy in the game but a slimed one.
	const walked = enemy.speed * speedMultiplier(enemy) * tileSpeedMultiplier(world, enemy)
	if (isThiefFleeing(enemy)) {
		return -walked * (getEnemyDef(enemy.defId).thief?.fleeSpeedMult ?? 1)
	}
	return walked
}

export function movementSystem(world: World): void {
	// Terminal phases run nothing, or the night keeps simulating behind the summary screen.
	if (world.night.phase === 'won' || world.night.phase === 'lost') {
		return
	}

	for (const enemy of world.enemies) {
		// A fled enemy walks back the way it came -- see `FLEE_SPEED_MULT`. No clamp: `samplePath`
		// already clamps a negative distance for the renderer, and `resolveSystem` removes it at 0.
		//
		// **No `tileSpeedMultiplier` here either**, for the same reason the status one is absent: the
		// rate at which the board empties is not negotiable, and a slug's road is not allowed to
		// change it. Heat and residue still apply to a fleeing enemy -- `tilesSystem` does not ask --
		// because those are not speed.
		if (enemy.flags.fleeing) {
			enemy.distance -= enemy.speed * FLEE_SPEED_MULT
			continue
		}

		// A thief at the fridge stands still until `theftSystem` sends it home.
		if (isGrabbing(enemy)) {
			continue
		}

		// A thief arriving overshoots the fridge by up to one step; `theftSystem` clamps it, and
		// `samplePath` clamps for anything that reads in between. A fleeing one runs past the start of
		// its lane the same way, and `resolveSystem` removes it at 0.
		enemy.distance += stepTiles(world, enemy)
	}
}
