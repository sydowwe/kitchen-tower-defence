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
import type { Enemy, EntityId, World } from '@/core/types.ts'

/**
 * What fraction of a push still lands once an enemy is fully resisting: 35% (step 18's "~35% after
 * four pushes"). Draft values, all three -- 18C re-tunes them against night 18, and
 * `tests/pushback.spec.ts` asserts against the names, never the numbers.
 *
 * The floor is what stops two Fans holding a lane shut. Two Fans at 1.5 shots/sec, 1.2 tiles a push,
 * held near the floor by the decay between shots, push a Moth back ~1.45 tiles/sec against its own
 * 1.6 -- the slowest flyer still gains ground.
 */
export const PUSHBACK_FLOOR = 0.35

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
 * - a feeder is reset to its catch point by `core/systems/bait.ts` next tick anyway.
 * - a fleeing enemy is heading *away* from the fridge, and subtracting from its distance speeds its
 *   escape. The wake makes every one untargetable today, so this never fires yet; step 19's thief is
 *   fleeing and targetable, and that step decides the sign.
 */
function canBePushed(enemy: Enemy): boolean {
	return !enemy.tags.includes('push-immune') && !isHeld(enemy) && enemy.feeding === null && !enemy.flags.fleeing
}

/**
 * Shoves `enemy` up to `tiles` back along its lane, less its resistance, and returns the tiles it
 * actually moved. Publishes `enemyPushed` when that is above 0.
 *
 * **Clamped at 0 and never negative.** `samplePath` would draw a negative distance at the spawn, and
 * `resolve` would keep it, but the tick step 19 flips a thief to `fleeing` a negative distance is an
 * instant escape.
 *
 * The raised resistance is stored even when the clamp moved it 0: the gust still hit it.
 */
export function pushEnemy(world: World, enemy: Enemy, tiles: number, sourceTowerId: EntityId): number {
	if (!canBePushed(enemy)) {
		return 0
	}

	const resistance = pushbackResistanceOf(world, enemy)
	const moved = Math.max(0, Math.min(enemy.distance, tiles * (1 - resistance)))
	enemy.distance -= moved
	enemy.pushback = { resistance: Math.min(MAX_RESISTANCE, resistance + RESISTANCE_PER_PUSH), atTick: world.tick }

	if (moved > 0) {
		world.events.push({ kind: 'enemyPushed', enemyId: enemy.id, sourceTowerId, tiles: moved })
	}

	return moved
}
