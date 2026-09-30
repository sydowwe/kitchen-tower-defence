/**
 * Grocery Money: what a night pays into the metagame (analytic-docs/CONTENT.md section 8).
 *
 * **The only function in `src/` that computes it.** `resolveSystem` calls it once, as the night ends,
 * and stores the result on `world.night.pay`; everything else reads that. A second computation is a
 * second answer, and the one that drifts is the one on the summary screen.
 */

import { getNightDef } from '@/core/content/index.ts'
import { isGone } from '@/core/systems/fridge.ts'
import type { GroceryMoneyBreakdown, World } from '@/core/types.ts'

/** What a lost night still pays, as a fraction of a won one (analytic-docs/DECISION-LOG.md). */
export const GROCERY_LOSS_RATE = 0.4

const TICKS_PER_SECOND = 60

const BASE = 25
const BASE_PER_NIGHT = 5
const PER_ITEM_SAVED = 8
const PER_KILL = 0.25
const CLEANLINESS_MAX = 40
const NO_WAKE_BONUS = 50
const PER_SECOND_SKIPPED = 2

/**
 * Tonight's pay, term by term. **Each term is rounded where it is computed**, so the terms sum to
 * `subtotal` exactly and the summary's lines add up to the one under them.
 *
 * Won is `phase === 'won'`; anything else pays at the loss rate. On a win `forfeitDroppedFood` has
 * already run, so food on the floor is gone and not counted; on a loss everything is.
 */
export function groceryMoneyFor(world: World): GroceryMoneyBreakdown {
	const night = world.night
	const nightIndex = getNightDef(night.nightId).index

	const itemsRemaining = night.food.filter(item => !isGone(item)).length
	const enemiesKilled = night.enemiesKilled
	// A floor nothing fell on is clean -- and 0/0 is `NaN`. The clamp is for crumbs collected without
	// ever being dropped, like a night that opens with them scattered.
	const cleanlinessRatio = night.crumbsDropped === 0 ? 1 : Math.min(1, night.crumbsCollected / night.crumbsDropped)
	const secondsSkipped = Math.floor(night.ticksSkippedTotal / TICKS_PER_SECOND)
	const woke = world.noise.wakeCount > 0

	const base = BASE + BASE_PER_NIGHT * nightIndex
	const foodSaved = PER_ITEM_SAVED * itemsRemaining
	const kills = Math.round(PER_KILL * enemiesKilled)
	const cleanliness = Math.round(CLEANLINESS_MAX * cleanlinessRatio)
	const noWake = woke ? 0 : NO_WAKE_BONUS
	const earlyCall = PER_SECOND_SKIPPED * secondsSkipped

	const subtotal = base + foodSaved + kills + cleanliness + noWake + earlyCall
	const difficultyMult = world.difficulty.groceryMoneyMult
	const lossMult = night.phase === 'won' ? 1 : GROCERY_LOSS_RATE

	return {
		base,
		foodSaved,
		kills,
		cleanliness,
		noWake,
		earlyCall,
		subtotal,
		difficultyMult,
		lossMult,
		total: Math.round(subtotal * difficultyMult * lossMult),
		itemsRemaining,
		enemiesKilled,
		cleanlinessRatio,
		secondsSkipped,
		woke,
	}
}
