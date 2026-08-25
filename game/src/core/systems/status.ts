/**
 * Per-tick status effects, the ageing that retires them, and the charge bookkeeping that reads the
 * same statuses to decide a tower is finished.
 *
 * Runs *before* movement so a slow applied this tick is felt this tick.
 *
 * **Nothing here branches on a status kind.** `effect` is a field on `STATUS_DEFS` precisely so the
 * per-tick reads filter on it, and an eighth status is a config entry rather than a case below.
 */

import { STATUS_DEFS, tickStatuses } from '@/core/content/statuses.ts'
import { applyDamage, hasOutstandingSourceStatus } from '@/core/systems/combat.ts'
import { removeTower } from '@/core/systems/placement.ts'
import type { World } from '@/core/types.ts'

export function statusSystem(world: World): void {
	// Terminal phases run nothing, or the night keeps burning enemies behind the summary screen.
	if (world.night.phase === 'won' || world.night.phase === 'lost') {
		return
	}

	for (const enemy of world.enemies) {
		for (const status of enemy.statuses) {
			const def = STATUS_DEFS[status.kind]
			if (def.effect !== 'damageOverTime') {
				continue
			}
			// `magnitude * stacks`, never magnitude alone: three stacks of burn is 15/sec, and the
			// symptom of dropping the factor is a tower that feels fine on one enemy and useless on
			// a wave. A DoT status always resolves as *some* damage type -- the applying behaviour's
			// if it had one, the def's otherwise -- so the fallback below is unreachable in practice.
			applyDamage(
				world,
				enemy,
				status.magnitude * status.stacks,
				status.damageType ?? def.damageType ?? 'physical',
			)
		}

		// Last, and after the damage above has been read off. A status with one tick left delivers
		// this tick and is gone from the next one; decrementing first costs every DoT in the game
		// one tick of damage. **A dead enemy is not removed here** -- `resolveSystem` is the only
		// place an entity leaves an array, and routing a burn kill through it is what gets the kill
		// event, the crumb drop and `night.enemiesKilled` for free.
		tickStatuses(enemy)
	}

	retireSpentTowers(world)
}

/**
 * A charge tower with nothing left and nothing outstanding is done with. Sticky Tape's third root
 * ending is what removes it -- no event, no refund: `towerDestroyed` is step 10's, and a `towerSold`
 * with a refund of 0 would lie to a ledger the HUD reads.
 *
 * The end of a root is noticed on the **following** tick, because `resolveSystem` runs ninth and
 * this system first. That is deliberate: a tape re-firing on the same tick its target died would be
 * reading a dead enemy out of a stale index.
 */
function retireSpentTowers(world: World): void {
	// Descending, because `removeTower` splices: a forward loop would skip the tower after each one
	// it took out.
	for (let index = world.towers.length - 1; index >= 0; index--) {
		const tower = world.towers[index]
		if (tower === undefined || tower.state === null || tower.state.kind !== 'charge') {
			continue
		}
		if (tower.state.charges > 0 || hasOutstandingSourceStatus(world, tower.id)) {
			continue
		}
		removeTower(world, tower.id)
	}
}
