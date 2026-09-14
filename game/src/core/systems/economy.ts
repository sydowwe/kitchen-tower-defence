/**
 * Tower income: the Toaster Crumb Tray and the Cookie Jar paying into `world.crumbs`.
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
			world.crumbs += Math.max(1, Math.round(behaviour.crumbsPerPayout * world.difficulty.crumbIncomeMult))
		}
	}
}
