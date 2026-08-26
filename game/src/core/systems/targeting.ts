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
import { getTowerDef } from '@/core/content/index.ts'
import { remainingToFridge } from '@/core/path.ts'
import { bindRng } from '@/core/rng.ts'
import { chargeAllowsFiring } from '@/core/systems/charges.ts'
import { enemyPosition, queryEnemiesInRange } from '@/core/systems/spatial.ts'
import type { Enemy, Tower, World } from '@/core/types.ts'

/**
 * The one predicate for "may this attack pick that enemy". Step 11's flyers and step 16's burrowing
 * extend this function rather than six call sites.
 */
export function isTargetable(enemy: Enemy, targets: TargetClass): boolean {
	if (enemy.flags.hidden || enemy.flags.untargetable) {
		return false
	}
	if (targets === 'both') {
		return true
	}
	const isAir = enemy.tags.includes('air')
	return targets === 'air' ? isAir : !isAir
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

export function pickTarget(world: World, tower: Tower, reach: Reach): Enemy | null {
	const candidates = queryEnemiesInRange(world, tower.tile, reach.rangeTiles, enemy =>
		isTargetable(enemy, reach.targets),
	)
	if (candidates.length === 0) {
		return null
	}

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

export function targetingSystem(world: World): void {
	// Terminal phases run nothing, or the night keeps simulating behind the summary screen.
	if (world.night.phase === 'won' || world.night.phase === 'lost') {
		return
	}

	for (const tower of world.towers) {
		const firing = getTowerDef(tower.defId).behaviours.find(isFiring)
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
