/**
 * Which enemy each tower is shooting at. Separate from `combat.ts` so the choice can be tested
 * without dealing damage.
 *
 * **Every tower's target is refreshed every tick**, not only the ones off cooldown. This system
 * runs *before* `combat`, so a version that skipped towers still on cooldown would be reading last
 * tick's counter and would skip a tower on exactly the tick it is about to fire. The unconditional
 * version costs the O(towers x enemies) pass analytic-docs/ARCHITECTURE.md section 6 already
 * budgets for.
 *
 * The six modes are analytic-docs/CONTENT.md section 5.
 */

import { isFiring } from '@/core/content/behaviours.ts'
import type { TargetClass } from '@/core/content/behaviours.ts'
import { effectiveDefOf } from '@/core/content/index.ts'
import { remainingToFridge } from '@/core/path.ts'
import { bindRng } from '@/core/rng.ts'
import { chargeAllowsFiring, holdsSourceStatusFrom } from '@/core/systems/charges.ts'
import { enemyPosition, queryEnemiesInRange } from '@/core/systems/spatial.ts'
import type { Enemy, Tower, World } from '@/core/types.ts'

/**
 * The one predicate for "may this attack pick that enemy". Step 11's flyers and step 16's burrowing
 * extend this function rather than six call sites.
 */
export function isTargetable(enemy: Enemy, targets: TargetClass): boolean {
	// `hidden` is what the enemy is; `revealed` is what a lamp is doing to it this tick
	// (`core/systems/light.ts`). `untargetable` keeps its own unconditional no: that is step 16's
	// burrow flag, and a lamp does not surface a Weevil -- the Bay Leaf's `suppress` does.
	if ((enemy.flags.hidden && !enemy.flags.revealed) || enemy.flags.untargetable) {
		return false
	}
	if (targets === 'both') {
		return true
	}
	// Through `isFlyer` below, so `tags.includes('air')` is written once in `core/`: what the two
	// predicates disagree about is the `hidden` check above, never what counts as being off the floor.
	const isAir = isFlyer(enemy)
	return targets === 'air' ? isAir : !isAir
}

/**
 * Whether this enemy is off the floor. `tags.includes('air')` and **not** `isTargetable`: that
 * predicate answers what a tower may shoot at, and reusing it for the floor question would walk a
 * `hidden` Weevil straight through a Cardboard Box in step 16.
 *
 * The one answer for every reader that asks about the floor rather than about a target:
 * `core/systems/barricades.ts` today, step 14's tile effects, step 17's auras, step 18's pushback.
 */
export function isFlyer(enemy: Enemy): boolean {
	return enemy.tags.includes('air')
}

/**
 * The entry with the lowest or highest score, **keeping the first one on a tie** -- so the winner is
 * decided by `world.enemies` order, which `queryEnemiesInRange` preserves. A `sort` is not stable
 * enough to promise that, and the symptom of an unstable one is a replay that diverges after ten
 * minutes.
 */
function bestBy(
	enemies: readonly Enemy[],
	score: (enemy: Enemy) => number,
	prefer: 'lowest' | 'highest',
): Enemy | null {
	let best: Enemy | null = null
	let bestScore = 0

	for (const enemy of enemies) {
		const value = score(enemy)
		if (best === null || (prefer === 'lowest' ? value < bestScore : value > bestScore)) {
			best = enemy
			bestScore = value
		}
	}

	return best
}

/**
 * Track distance still to walk. `FIRST` and `LAST` compare this and never raw `distance`: on a
 * multi-path map raw distance makes a tower prefer whichever lane happens to be longer
 * (analytic-docs/CONTENT.md section 5).
 */
function remaining(world: World, enemy: Enemy): number {
	const path = world.map.paths.find(candidate => candidate.id === enemy.pathId)
	// Unreachable from `pickTarget` -- the query already dropped every enemy whose path is missing.
	return path === undefined ? 0 : remainingToFridge(path, enemy.distance)
}

function distanceSquaredFrom(world: World, tower: Tower, enemy: Enemy): number {
	const at = enemyPosition(world, enemy)
	if (at === null) {
		return Number.POSITIVE_INFINITY
	}
	const dx = at.x - tower.tile.x
	const dy = at.y - tower.tile.y
	return dx * dx + dy * dy
}

/**
 * How far a behaviour reaches and what it is allowed to reach. Structural rather than a union of
 * `AttackBehaviour | ConeAttackBehaviour`, because the six modes below do not care which descriptor
 * the two numbers came from -- a cone picks its aim with exactly the same code and no branch.
 */
export interface Reach {
	rangeTiles: number
	targets: TargetClass
}

/** The mode applied to a list that has already been filtered by range and targetability. */
function bestOf(world: World, tower: Tower, candidates: readonly Enemy[]): Enemy | null {
	switch (tower.targetingMode) {
		case 'FIRST':
			return bestBy(candidates, enemy => remaining(world, enemy), 'lowest')
		case 'LAST':
			return bestBy(candidates, enemy => remaining(world, enemy), 'highest')
		case 'STRONGEST':
			return bestBy(candidates, enemy => enemy.hp, 'highest')
		case 'WEAKEST':
			return bestBy(candidates, enemy => enemy.hp, 'lowest')
		case 'CLOSEST':
			return bestBy(candidates, enemy => distanceSquaredFrom(world, tower, enemy), 'lowest')
		// Through the world's generator, never `Math.random`: a replay has to reproduce which enemy
		// was shot. The draw only happens when there is something to draw from, so a tower with an
		// empty range does not advance the stream.
		case 'RANDOM':
			return bindRng(world.rng).pick(candidates)
	}
}

/**
 * Up to `count` **distinct** enemies in range, best first under the tower's own mode. Fewer than
 * `count` when fewer are in range, and empty when none are.
 *
 * **Take the best, exclude it, take the next** -- and never a `sort`. `bestOf` keeps the first
 * entry on a tie, so the winner is decided by `world.enemies` order; a comparison sort is not stable
 * enough to promise a replay reproduces *which* two enemies a Toaster shot, and the symptom of that
 * is a divergence ten minutes in.
 *
 * `count === 1` is the whole game except the Toaster's tier 3, and it deliberately does not copy the
 * candidate list: this runs once per tower per tick, on the path
 * analytic-docs/ARCHITECTURE.md section 6 budgets against.
 */
export function pickTargets(world: World, tower: Tower, reach: Reach, count: number): Enemy[] {
	// An enemy this tower is already holding is not a target: see `holdsSourceStatusFrom`. It reads
	// false for every tower that applies nothing `untilSourceSpent`, which is all of them but the
	// Sticky Tape, so this is a `some` over an empty array on the ordinary path.
	const candidates = queryEnemiesInRange(
		world,
		tower.tile,
		reach.rangeTiles,
		enemy => isTargetable(enemy, reach.targets) && !holdsSourceStatusFrom(enemy, tower.id),
	)
	if (count <= 0 || candidates.length === 0) {
		return []
	}
	if (count === 1) {
		const best = bestOf(world, tower, candidates)
		return best === null ? [] : [best]
	}

	const pool = [...candidates]
	const picked: Enemy[] = []
	while (picked.length < count && pool.length > 0) {
		const best = bestOf(world, tower, pool)
		if (best === null) {
			break
		}
		picked.push(best)
		pool.splice(pool.indexOf(best), 1)
	}

	return picked
}

/** One ranking and not two: the single-target case is the first entry of the list above. */
export function pickTarget(world: World, tower: Tower, reach: Reach): Enemy | null {
	return pickTargets(world, tower, reach, 1)[0] ?? null
}

export function targetingSystem(world: World): void {
	// Terminal phases run nothing, or the night keeps simulating behind the summary screen.
	if (world.night.phase === 'won' || world.night.phase === 'lost') {
		return
	}

	for (const tower of world.towers) {
		const firing = effectiveDefOf(tower).behaviours.find(isFiring)
		if (firing === undefined) {
			continue
		}
		// The same gate `combat` asks in the slot after this one -- see the header. A tower that
		// cannot fire is left with no target rather than a target it will never consume: a rearming
		// Mousetrap does not aim, and 10C draws no range line for one.
		if (!chargeAllowsFiring(world, tower)) {
			tower.targetEnemyId = null
			continue
		}
		tower.targetEnemyId = pickTarget(world, tower, firing)?.id ?? null
	}
}
