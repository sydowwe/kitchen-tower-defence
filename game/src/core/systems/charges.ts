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
import { effectiveDefOf } from '@/core/content/index.ts'
import { endsWithItsSource } from '@/core/content/statuses.ts'
import { removeTower } from '@/core/systems/placement.ts'
import type { ChargeBehaviour } from '@/core/content/behaviours.ts'
import type { TowerDef } from '@/core/content/index.ts'
import type { Enemy, EntityId, Tower, TowerState, World } from '@/core/types.ts'

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
 * How many enemies still carry a status this tower applied that ends when its source is spent. One
 * per enemy, because a status of one kind exists at most once on one enemy -- so this is the number
 * of roots the tape is currently holding.
 *
 * It is a scan of `world.enemies` rather than a list remembered on the tower, and that is the point:
 * it covers **both** ways a root ends. A version hooked onto `enemyKilled` misses the enemy that
 * reached the fridge and leaked, and the symptom is a tape that holds a charge forever.
 */
export function countOutstandingSourceStatuses(world: World, towerId: EntityId): number {
	let count = 0
	for (const enemy of world.enemies) {
		if (holdsSourceStatusFrom(enemy, towerId)) {
			count++
		}
	}
	return count
}

/**
 * Whether this one enemy is already held by this tower -- carrying a status it applied that ends
 * when the tower is spent.
 *
 * **`targeting.ts` excludes these, and that is what makes "roots 3 enemies" mean three.** A tape at
 * `maxOutstanding: 3` may fire while one root is out, and `CLOSEST` would hand it the same enemy
 * again; `rooted` merges under the `refresh` rule, so the count would never leave 1 and the tower
 * would spend its whole magazine re-sticking one ant. At `maxOutstanding: 1` the firing gate hid
 * this, which is why it only shows up now.
 */
export function holdsSourceStatusFrom(enemy: Enemy, towerId: EntityId): boolean {
	return enemy.statuses.some(status => status.sourceId === towerId && endsWithItsSource(status))
}

/**
 * The firing gate, asked by `targetingSystem` and `combatSystem` alike. True for every tower with no
 * magazine at all.
 *
 * Both have to ask the same question: a tower the targeting system serves and the combat system does
 * not is a tower that aims and never shoots. A rearming Mousetrap is the one-charge case of this and
 * ends its tick with `targetEnemyId` null.
 *
 * **`maxOutstanding` and not `> 0`.** A Sticky Tape holds one root at a time and its tier 3 holds
 * three; the tower stops firing once it is holding that many, whatever it still has in the magazine.
 */
export function chargeAllowsFiring(world: World, tower: Tower): boolean {
	const state = chargeStateOf(tower)
	if (state === null) {
		return true
	}
	if (state.charges <= 0) {
		return false
	}

	const behaviour = chargeBehaviourOf(effectiveDefOf(tower))
	const maxOutstanding = behaviour?.maxOutstanding ?? 1
	return countOutstandingSourceStatuses(world, tower.id) < maxOutstanding
}

/**
 * One charge off the magazine, and the rearm clock started if it is not already running.
 *
 * **Not already running** is what keeps a multi-charge tower from resetting its own clock every time
 * it fires: a tier-3 Fly Paper emptying two charges in two shots rearms one of them `rearmTicks` after
 * the first shot, not after the second.
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
 * maximum. That is what the Fly Paper's tier 3 (a fresh sheet every `rearmTicks`) and step 12's
 * tier upgrades need, and a version that refilled the magazine in one go would make a four-charge
 * paper a one-charge paper with a long pause. A base Fly Paper never rearms: `rearmTicks: 0`.
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

		const behaviour = chargeBehaviourOf(effectiveDefOf(tower))
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
		// Still `> 0` and not against `maxOutstanding`: a tape with three roots out and nothing left in
		// the magazine must not leave the board until the **last** one ends.
		if (countOutstandingSourceStatuses(world, tower.id) > 0) {
			continue
		}

		removeTower(world, tower.id)
	}
}
