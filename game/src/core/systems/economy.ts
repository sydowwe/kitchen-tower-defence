/**
 * Tower income: the Toaster Crumb Tray and the Cookie Jar paying into `world.crumbs` -- and the two
 * helpers **every** write to the wallet goes through, wherever it happens.
 *
 * `earnCrumbs` and `spendCrumbs` live here rather than beside their callers for the reason
 * `collectCrumb` is the one paying door for a crumb: `world.unbankedCrumbs` has to agree with
 * `world.crumbs` on every path, and five call sites is five chances to forget the second field.
 * Nothing outside this file may touch either number.
 *
 * **Payouts are on the world clock**, `world.tick % payoutIntervalTicks === 0`, and not on a
 * per-tower timer. That needs no field on `Tower`, nothing extra to serialise, and it lines every
 * tower's payout up on the same tick so the `+N` popups arrive together. The consequence is a tower
 * placed at tick 59 getting a full payout at tick 60, which is not farmable: the sell refund is 70%
 * at best and the purchase is not.
 *
 * No event. Nothing consumes one, and a `GameEvent` member is added by the step that reads it.
 */

import { effectiveDefOf } from '@/core/content/index.ts'
import type { World } from '@/core/types.ts'

/**
 * Adds to the wallet, and records whether it is forfeitable.
 *
 * **`banked` is the exception and defaults to false**, because income is the common case: collection
 * through either door, a tower payout and the early-call bonus are all unbanked. The starting crumbs
 * and a sell refund are the two banked sources -- a refund is returned capital, and a wake that ate
 * it would make selling before one a trap the player cannot see (step 13A, decision 6).
 */
export function earnCrumbs(world: World, amount: number, banked = false): void {
	world.crumbs += amount
	if (!banked) {
		world.unbankedCrumbs += amount
	}
}

/**
 * Takes from the wallet, **drawing the unbanked pool down first**.
 *
 * Without that: start with 200 banked, earn 300, spend 300 on towers, wake -- and the forfeit of 300
 * eats the 200 the night started with. With it, converting income into towers is how you protect it,
 * which is the decision the whole mechanic is for (step 13A, decision 7).
 *
 * `max(0, ...)` on the unbanked side only: a spend is validated before it gets here, so `crumbs`
 * never needs the clamp, and one on it would hide a caller that skipped its own affordability check.
 */
export function spendCrumbs(world: World, amount: number): void {
	world.crumbs -= amount
	world.unbankedCrumbs = Math.max(0, world.unbankedCrumbs - amount)
}

/**
 * Takes the whole unbanked pool out of the wallet and returns what it took. The wake's third step,
 * and its only caller.
 *
 * `min` against `crumbs` is the belt to `spendCrumbs`' brace: the wallet must never go negative even
 * if some future spend path forgets to come through here. The pool is zeroed either way -- a wake
 * takes all of tonight's income, and there is no such thing as half-forfeited.
 *
 * It lives here rather than in `noise.ts` because `world.crumbs` and `world.unbankedCrumbs` are
 * written in exactly one file, which is the whole point of the two helpers above.
 */
export function forfeitUnbankedCrumbs(world: World): number {
	const forfeited = Math.min(world.unbankedCrumbs, world.crumbs)

	world.crumbs -= forfeited
	world.unbankedCrumbs = 0

	return forfeited
}

export function economySystem(world: World): void {
	// Terminal phases run nothing, or the wallet keeps filling behind the summary screen.
	if (world.night.phase === 'won' || world.night.phase === 'lost') {
		return
	}

	for (const tower of world.towers) {
		for (const behaviour of effectiveDefOf(tower).behaviours) {
			if (behaviour.kind !== 'income' || world.tick % behaviour.payoutIntervalTicks !== 0) {
				continue
			}

			// Computed from the def every payout: no accumulator, no float on the world, and the
			// wallet stays a whole number. `max(1)` is what stops nightmare's 0.85 rounding a
			// 1-crumb payout away to nothing.
			earnCrumbs(world, Math.max(1, Math.round(behaviour.crumbsPerPayout * world.difficulty.crumbIncomeMult)))
		}
	}
}
