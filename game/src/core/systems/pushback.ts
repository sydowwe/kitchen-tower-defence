/**
 * One shove back down the track, and how much the next one is resisted.
 *
 * **A helper file, not a slot**, like `dealDamage` or `hitbox.ts`: `SYSTEM_ORDER` does not grow a
 * 'pushback' system. `fireCone` in `core/systems/combat.ts` calls `pushEnemy` once per enemy a gust
 * caught, and that is the only caller. Because the push lands in `combat`, after `barricades` has
 * already run, a pushed enemy is re-blocked by `nearestAhead` next tick and re-enters a heat tile on
 * its own -- neither of those files knows a push happened.
 *
 * **Never import from `combat.ts`**, which imports this. The cycle surfaces as an `undefined` at
 * module load rather than as a type error.
 */

import { isHeld } from '@/core/systems/targeting.ts'
import { isGrabbing, isThiefFleeing } from '@/core/systems/theft.ts'
import type { Enemy, EntityId, World } from '@/core/types.ts'

/**
 * What fraction of a push still lands once an enemy is fully resisting: 25%. Step 18C lowered it from
 * the draft's 35% against night 18 and kept the other two; analytic-docs/OPEN-QUESTIONS.md has what
 * the measurement showed. `tests/pushback.spec.ts` asserts against the names, never the numbers.
 *
 * The floor is what stops a stack of Fans holding a lane shut. Two Fans at 1.5 shots/sec, 1.2 tiles a
 * push, held near the floor by the decay between shots, push a Moth back ~1.1 tiles/sec against its
 * own 1.6. It takes four overlapping cones to hold a Moth and five to hold a Fly.
 */
export const PUSHBACK_FLOOR = 0.25

/** Pushes, back to back, that take an unresisted enemy down to the floor. */
export const PUSHES_TO_FLOOR = 4

/** Ticks a fully resisting enemy takes to forget every push, decaying linearly. ~4 seconds. */
export const PUSHBACK_DECAY_TICKS = 240

/** The most resistance there is, and what each push adds towards it. */
const MAX_RESISTANCE = 1 - PUSHBACK_FLOOR
const RESISTANCE_PER_PUSH = MAX_RESISTANCE / PUSHES_TO_FLOOR
const DECAY_PER_TICK = MAX_RESISTANCE / PUSHBACK_DECAY_TICKS

/**
 * The fraction of the next push this enemy shrugs off, as of `world.tick`: 0 for one never pushed,
 * up to `1 - PUSHBACK_FLOOR`. Derived from the stored value and its age every time it is asked, so
 * nothing has to age it.
 */
export function pushbackResistanceOf(world: World, enemy: Enemy): number {
	if (enemy.pushback === null) {
		return 0
	}
	const elapsed = world.tick - enemy.pushback.atTick
	return Math.max(0, enemy.pushback.resistance - elapsed * DECAY_PER_TICK)
}

/**
 * Whether anything is allowed to shove this enemy at all. Each no is a reason, not a tuning:
 *
 * - `push-immune` is what the enemy *is* -- the Mold, which cannot walk back to where it stood.
 * - a held enemy is stuck to a Fly Paper or a Sticky Tape, and a fly shoved 1.2 tiles from its paper
 *   while still rooted to it reads as a bug.
 * - a feeder is reset to its catch point by `core/systems/bait.ts` next tick anyway, and a thief
 *   grabbing at the fridge is standing still the same way.
 * - an enemy fleeing a wake is untargetable and running for the door; the board has to empty.
 */
function canBePushed(enemy: Enemy): boolean {
	return (
		!enemy.tags.includes('push-immune') &&
		!isHeld(enemy) &&
		enemy.feeding === null &&
		!enemy.flags.fleeing &&
		!isGrabbing(enemy)
	)
}

/**
 * Shoves `enemy` up to `tiles` back along its lane, less its resistance, and returns the tiles it
 * actually moved. Publishes `enemyPushed` when that is above 0.
 *
 * "Back" is away from where it is going. For a walker that is toward the start of the lane,
 * **clamped at 0**: `samplePath` would draw a negative distance, but `resolve` reads a thief at 0 as
 * escaped. For a thief running home it is toward the fridge, **clamped at the lane length** -- a gust
 * that sped a thief's escape would be a tower working for the other side.
 *
 * The raised resistance is stored even when the clamp moved it 0: the gust still hit it.
 */
export function pushEnemy(world: World, enemy: Enemy, tiles: number, sourceTowerId: EntityId): number {
	if (!canBePushed(enemy)) {
		return 0
	}

	const resistance = pushbackResistanceOf(world, enemy)
	const wanted = tiles * (1 - resistance)
	let moved: number
	if (isThiefFleeing(enemy)) {
		const length = world.map.paths.find(path => path.id === enemy.pathId)?.lengthTiles ?? enemy.distance
		moved = Math.max(0, Math.min(length - enemy.distance, wanted))
		enemy.distance += moved
	} else {
		moved = Math.max(0, Math.min(enemy.distance, wanted))
		enemy.distance -= moved
	}
	enemy.pushback = { resistance: Math.min(MAX_RESISTANCE, resistance + RESISTANCE_PER_PUSH), atTick: world.tick }

	if (moved > 0) {
		world.events.push({ kind: 'enemyPushed', enemyId: enemy.id, sourceTowerId, tiles: moved })
	}

	return moved
}
