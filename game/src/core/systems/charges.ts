/**
 * The charge machine: a finite magazine, the rearm timer that refills it, and the two questions
 * three systems ask about it.
 *
 * Not a system -- there is no slot for it in `SYSTEM_ORDER`. It is a module of helpers beside
 * `spatial.ts` and `placement.ts`, because `targeting.ts`, `combat.ts` and `status.ts` all read the
 * same machine and the alternative is `targeting.ts` importing `combat.ts`, which already imports
 * `isTargetable` back out of `targeting.ts`.
 *
 * **There is no `phase` field.** `chargePhase` derives the four words from the two numbers already
 * on `TowerState`; a stored phase is a second truth that goes into every save and every replay and
 * can disagree with the counter it describes.
 */

import { isCharge } from '@/core/content/behaviours.ts'
import { getTowerDef } from '@/core/content/index.ts'
import { endsWithItsSource } from '@/core/content/statuses.ts'
import { removeTower } from '@/core/systems/placement.ts'
import type { ChargeBehaviour } from '@/core/content/behaviours.ts'
import type { TowerDef } from '@/core/content/index.ts'
import type { EntityId, Tower, TowerState, World } from '@/core/types.ts'

/** The one member of `TowerState` today, named so the narrowing below has something to return. */
type ChargeState = Extract<TowerState, { kind: 'charge' }>

/** How many and how long, off the def. Null for the towers that have no magazine, which is most. */
export function chargeBehaviourOf(def: TowerDef): ChargeBehaviour | null {
	return def.behaviours.find(isCharge) ?? null
}

/** The live counter on the tower. Null for the same towers, and for one placed before step 10. */
export function chargeStateOf(tower: Tower): ChargeState | null {
	const state = tower.state
	return state !== null && state.kind === 'charge' ? state : null
}

/**
 * Whether any enemy still carries a status this tower applied that ends when its source is spent.
 *
 * It is a scan of `world.enemies` rather than an id remembered on the tower, and that is the point:
 * it covers **both** ways a root ends. A version hooked onto `enemyKilled` misses the enemy that
 * reached the fridge and leaked, and the symptom is a tape that holds a charge forever.
 */
export function hasOutstandingSourceStatus(world: World, towerId: EntityId): boolean {
	return world.enemies.some(enemy =>
		enemy.statuses.some(status => status.sourceId === towerId && endsWithItsSource(status)),
	)
}

/**
 * The firing gate, asked by `targetingSystem` and `combatSystem` alike. True for every tower with no
 * magazine at all.
 *
 * Both have to ask the same question: a tower the targeting system serves and the combat system does
 * not is a tower that aims and never shoots. A rearming Mousetrap is the one-charge case of this and
 * ends its tick with `targetEnemyId` null.
 */
export function chargeAllowsFiring(world: World, tower: Tower): boolean {
	const state = chargeStateOf(tower)
	if (state === null) {
		return true
	}
	return state.charges > 0 && !hasOutstandingSourceStatus(world, tower.id)
}

/**
 * One charge off the magazine, and the rearm clock started if it is not already running.
 *
 * **Not already running** is what keeps a multi-charge tower from resetting its own clock every time
 * it fires: a Fly Paper emptying two charges in two ticks rearms one of them `rearmTicks` after the
 * first shot, not after the second.
 */
export function spendCharge(tower: Tower, behaviour: ChargeBehaviour): void {
	const state = chargeStateOf(tower)
	if (state === null) {
		return
	}

	state.charges = Math.max(0, state.charges - 1)
	if (behaviour.rearmTicks > 0 && state.rearmTicksRemaining === 0) {
		state.rearmTicksRemaining = behaviour.rearmTicks
	}
}

/**
 * The per-tick half, run from the `status` slot (4th) and **not** beside the cooldown in `combat`
 * (7th). `targeting` runs 6th, so a rearm that completes here is visible to targeting on the same
 * tick and the gap between two Mousetrap shots is exactly `rearmTicks`. Decrementing in combat costs
 * one extra tick per cycle -- 397 instead of 396 -- for nothing.
 *
 * A rearm restores **one** charge and restarts the timer while the magazine is still below its
 * maximum. That is what step 17's Fly Paper and step 12's tier upgrades need, and a version that
 * refilled the magazine in one go would make a three-charge tower a one-charge tower with a long
 * pause.
 */
export function tickRearms(world: World): void {
	for (const tower of world.towers) {
		const state = chargeStateOf(tower)
		if (state === null || state.rearmTicksRemaining <= 0) {
			continue
		}

		state.rearmTicksRemaining--
		if (state.rearmTicksRemaining > 0) {
			continue
		}

		const behaviour = chargeBehaviourOf(getTowerDef(tower.defId))
		if (behaviour === null) {
			continue
		}

		state.charges = Math.min(state.charges + 1, behaviour.charges)
		if (state.charges < behaviour.charges) {
			state.rearmTicksRemaining = behaviour.rearmTicks
		}
	}
}

/**
 * The four words for what a charge tower is doing, derived rather than stored. 10C's armed and
 * rearming treatments read this instead of re-deriving `charges === 0 && rearmTicksRemaining > 0`
 * in the renderer.
 */
export function chargePhase(tower: Tower): 'none' | 'armed' | 'rearming' | 'spent' {
	const state = chargeStateOf(tower)
	if (state === null) {
		return 'none'
	}
	if (state.charges > 0) {
		return 'armed'
	}
	return state.rearmTicksRemaining > 0 ? 'rearming' : 'spent'
}

/**
 * A charge tower that can never fire again leaves the board. Sticky Tape's third root ending is what
 * removes it -- no event, no refund: `towerDestroyed` is for a tower that was *killed*, and a
 * `towerSold` with a refund of 0 would lie to a ledger the HUD reads.
 *
 * **Spent is `charges <= 0` and `rearmTicksRemaining === 0`, both.** A Mousetrap drops to 0 charges
 * on the tick it fires; the version that tests the charges alone deletes it from the board on that
 * same tick, with no refund, no event and no message, and it reads exactly like a crash.
 *
 * The end of a root is noticed on the **following** tick, because `resolveSystem` runs ninth and
 * `statusSystem` fourth. That is deliberate: a tape re-firing on the same tick its target died would
 * be reading a dead enemy out of a stale index.
 */
export function retireSpentTowers(world: World): void {
	// Descending, because `removeTower` splices: a forward loop would skip the tower after each one
	// it took out.
	for (let index = world.towers.length - 1; index >= 0; index--) {
		const tower = world.towers[index]
		if (tower === undefined) {
			continue
		}

		const state = chargeStateOf(tower)
		if (state === null || state.charges > 0 || state.rearmTicksRemaining > 0) {
			continue
		}
		if (hasOutstandingSourceStatus(world, tower.id)) {
			continue
		}

		removeTower(world, tower.id)
	}
}
