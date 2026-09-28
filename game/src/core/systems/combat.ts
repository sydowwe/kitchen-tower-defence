/**
 * Towers firing, and the one function every damage source in the game routes through.
 *
 * `dealDamage` is a helper on this file rather than a slot in the tick: `SYSTEM_ORDER` does not
 * grow a 'damage' system, because damage is something several systems do rather than a stage they
 * all wait for. It **never removes an enemy** -- `resolveSystem` is the single place an entity
 * leaves an array (see the note on `EntityIndex` in core/types.ts).
 *
 * Nothing here re-runs the range check. `targeting` refreshed `tower.targetEnemyId` this tick and
 * nothing has moved since, so the id is current and the range it passed is still true.
 */

import { isConeAttack, isFiring, isPushback } from '@/core/content/behaviours.ts'
import { effectiveDefOf } from '@/core/content/index.ts'
import { resolveDamage } from '@/core/content/matrix.ts'
import { applyStatuses } from '@/core/content/statuses.ts'
// **`@/core/tiles.ts`, never `@/core/systems/tiles.ts`.** That one imports `applyDamage` from this
// file, and the cycle is why the model and the tick are two files at all.
import { tileAt, writeEffect } from '@/core/tiles.ts'
import { chargeAllowsFiring, chargeBehaviourOf, spendCharge } from '@/core/systems/charges.ts'
import { circle, cone } from '@/core/systems/hitbox.ts'
import { spawnProjectile } from '@/core/systems/projectiles.ts'
import { pushEnemy } from '@/core/systems/pushback.ts'
import { enemyById, enemyPosition } from '@/core/systems/spatial.ts'
import { appliesHold, isHeld, isTargetable, pickTarget, pickTargets } from '@/core/systems/targeting.ts'
import type {
	ConeAttackBehaviour,
	PushbackBehaviour,
	StatusApplication,
	TargetClass,
} from '@/core/content/behaviours.ts'
import type { DamageType, Enemy, EntityId, Tower, Vec2, World } from '@/core/types.ts'

/**
 * `base` damage of `damageType` onto `enemy`, through the tag matrix, and the resolved amount back.
 * **No event.**
 *
 * This half exists for damage over time. Burn is 5/60 = 0.083 per tick, and
 * `render/layers/effects.ts` rounds the amount to key its glyph cache: every burning enemy would
 * print a stack of `0`s sixty times a second and blow that layer's 32-number cap, taking the real
 * hit numbers with it. The feedback for DoT is 9C's flicker instead.
 *
 * The world is what the scorch mark below is written into -- the parameter step 9 took unused and
 * held open for exactly this.
 */
export function applyDamage(world: World, enemy: Enemy, base: number, damageType: DamageType): number {
	const amount = resolveDamage(base, damageType, enemy)
	enemy.hp -= amount

	// **The type test comes first, before anything is computed.** This function runs for every DoT
	// tick of every enemy, and `enemyPosition` is the hottest function in `core/` -- calling it
	// unconditionally would put a `samplePath` into every poison tick in the game.
	//
	// Every burn tick since step 9 and every Toaster shot since step 11 leaves a permanent mark on
	// the floor from the night this ships. `scorch` is `onRewrite: 'ignore'` and permanent, so a
	// burning enemy standing still costs one scan and no allocation -- and it has to *stay* that way:
	// giving scorch a duration would turn a burning ant into a per-tick allocator.
	if (damageType === 'fire') {
		const at = enemyPosition(world, enemy)
		if (at !== null) {
			writeEffect(world, tileAt(at), 'scorch')
		}
	}

	return amount
}

/**
 * The same, plus the `enemyDamaged` event a discrete hit publishes.
 *
 * The event carries the **resolved** number rather than the base one, because that is what 6C's
 * damage numbers show and what a balance report has to add up. A resolved 0 publishes nothing:
 * Sticky Tape is `damage: 0`, and without this every root prints a floating `0` over its target.
 */
export function dealDamage(
	world: World,
	enemy: Enemy,
	base: number,
	damageType: DamageType,
	sourceTowerId: EntityId,
): number {
	const amount = applyDamage(world, enemy, base, damageType)
	if (amount === 0) {
		return amount
	}

	// An enemy whose path is missing has no position to report. It is a half-edited map out of
	// step 4's editor, and 6C draws nothing for a hit it cannot place.
	const at = enemyPosition(world, enemy) ?? { x: 0, y: 0 }
	// `base` cannot be 0 here: a resolved 0 returned above, and every matrix entry that zeroes a hit
	// zeroes the amount with it.
	world.events.push({ kind: 'enemyDamaged', enemyId: enemy.id, sourceTowerId, amount, multiplier: amount / base, at })

	return amount
}

/**
 * One instant hit spread over a circle: the splash both the instant path below and a projectile's
 * arrival resolve through.
 *
 * **The primary target is inside the circle** -- it is queried like everything else and damaged
 * exactly once. Hitting the target *and then* the circle double-damages it, and the symptom is a
 * damage total that looks precisely like the tag matrix being applied twice.
 */
export function dealSplashDamage(
	world: World,
	center: Vec2,
	radiusTiles: number,
	base: number,
	damageType: DamageType,
	targets: TargetClass,
	sourceTowerId: EntityId,
	applies: readonly StatusApplication[],
): void {
	for (const enemy of circle(world, center, radiusTiles, candidate => isTargetable(candidate, targets))) {
		dealDamage(world, enemy, base, damageType, sourceTowerId)
		applyStatuses(enemy, applies, sourceTowerId, damageType)
	}
}

/**
 * The applications this shot actually lands, once the periodic ones have been filtered against the
 * tower's shot count. `everyNthHit: null` is every hit, which is all of them but the Ice Cube Tray's
 * tier-3 freeze.
 *
 * **It returns the behaviour's own array untouched unless something is periodic.** A filtered array
 * is a new array, and `Projectile.applies` holds the behaviour's by reference on purpose -- so a
 * fresh one per shot is both safe and an allocation on the path
 * analytic-docs/ARCHITECTURE.md section 6 budgets against. Every shot in the game but one takes the
 * early return.
 */
export function applicationsForShot(
	applies: readonly StatusApplication[],
	shotsFired: number,
): readonly StatusApplication[] {
	if (!applies.some(application => application.everyNthHit !== null)) {
		return applies
	}
	return applies.filter(application => application.everyNthHit === null || shotsFired % application.everyNthHit === 0)
}

/**
 * The wedge, aimed at the target the ordinary targeting modes chose and then landing on everything
 * inside it. One target choice, many hits -- that is what makes a cone the crowd answer.
 *
 * `pushback` is the def's rider, if it has one (`PushbackBehaviour`): the Fan's gust is this same
 * shot, so it shares the aim, the cooldown and the wedge. Per caught enemy the order is damage, the
 * cone's statuses, then -- if the enemy also passes the pushback's `targets` -- the pushback's
 * statuses and the shove. Damage first keeps the damage number where the hit landed.
 *
 * **The position is read here, at fire time, for every tower.** An earlier tower in this tick's loop
 * may already have pushed the target `targeting` picked, and the cone follows where it is now.
 */
function fireCone(
	world: World,
	tower: Tower,
	behaviour: ConeAttackBehaviour,
	target: Enemy,
	applies: readonly StatusApplication[],
	pushback: PushbackBehaviour | undefined,
): void {
	// An enemy whose path the map has lost has no position to aim at. Every caller in core/ skips
	// such an enemy rather than throwing, or a half-edited map out of step 4's editor takes the whole
	// tick down.
	const at = enemyPosition(world, target)
	if (at === null) {
		return
	}

	const direction = Math.atan2(at.y - tower.tile.y, at.x - tower.tile.x)
	const caught = cone(world, tower.tile, direction, behaviour.rangeTiles, behaviour.coneHalfAngleDeg, enemy =>
		isTargetable(enemy, behaviour.targets),
	)

	if (pushback === undefined) {
		for (const enemy of caught) {
			dealDamage(world, enemy, behaviour.damage, behaviour.damageType, tower.id)
			applyStatuses(enemy, applies, tower.id, behaviour.damageType)
		}
		return
	}

	// Once per gust, whatever it caught: 18B draws the wedge from this even when it blew on nothing.
	world.events.push({
		kind: 'pushbackFired',
		towerId: tower.id,
		tile: { x: tower.tile.x, y: tower.tile.y },
		facingRad: direction,
		rangeTiles: behaviour.rangeTiles,
		halfAngleDeg: behaviour.coneHalfAngleDeg,
	})
	const pushApplies = applicationsForShot(pushback.applies, tower.shotsFired)

	for (const enemy of caught) {
		dealDamage(world, enemy, behaviour.damage, behaviour.damageType, tower.id)
		applyStatuses(enemy, applies, tower.id, behaviour.damageType)
		// Killed by this hit: `resolve` removes it this tick, and a shove on it is a slide 18B would
		// start on an enemy it never draws again.
		if (enemy.hp <= 0 || !isTargetable(enemy, pushback.targets)) {
			continue
		}
		// Before the shove, and whether or not it moves: the Marked lands on everything the gust
		// reaches, a push-immune or held enemy included.
		applyStatuses(enemy, pushApplies, tower.id, behaviour.damageType)
		pushEnemy(world, enemy, pushback.pushTiles, tower.id)
	}
}

export function combatSystem(world: World): void {
	// Terminal phases run nothing, or the night keeps simulating behind the summary screen.
	if (world.night.phase === 'won' || world.night.phase === 'lost') {
		return
	}

	for (const tower of world.towers) {
		const def = effectiveDefOf(tower)
		const firing = def.behaviours.find(isFiring)
		if (firing === undefined) {
			continue
		}

		// Decrement first, then fire in the same tick. Firing first and decrementing after gives a
		// period of `cooldown + 1` -- 61 ticks instead of 60, a silent 1.6% DPS loss.
		tower.cooldownTicks = Math.max(0, tower.cooldownTicks - 1)
		if (tower.cooldownTicks > 0 || tower.targetEnemyId === null) {
			continue
		}

		// The charge gate, the same predicate `targetingSystem` asked in the slot before this one. A
		// spent tower fires nothing, and one whose last application is still running holds -- Sticky
		// Tape roots one enemy at a time. `statusSystem` is what notices the tape is finished with;
		// nothing here removes it.
		if (!chargeAllowsFiring(world, tower)) {
			continue
		}

		let target = enemyById(world, tower.targetEnemyId)
		// Targeting ran for every tower before any of them fired, so two holders can have picked the
		// same enemy this tick. If an earlier one in this loop has just rooted it, pick again rather than
		// overwrite that root's `sourceId` -- `pickTargets` already skips held enemies.
		if (target !== null && appliesHold(firing) && isHeld(target)) {
			target = pickTarget(world, tower, firing)
		}
		if (target === null) {
			continue
		}

		// Assigned, never `+=`. A tower that sat with nothing in range must not bank shots and then
		// empty the bank when one walks in.
		tower.cooldownTicks = firing.cooldownTicks

		// **Incremented before the applications are filtered**, and here rather than on one of the
		// three paths below so a cone counts too. Incrementing after would give the first shot a count
		// of 0, and `0 % 4 === 0` lands the "every fourth hit" freeze on the very first one.
		tower.shotsFired++
		const applies = applicationsForShot(firing.applies, tower.shotsFired)

		const charges = chargeBehaviourOf(def)
		if (charges !== null) {
			spendCharge(tower, charges)
		}
		// `noise` is step 13's meter. Emitted now, consumed then.
		world.events.push({ kind: 'towerFired', towerId: tower.id, defId: def.id, noise: def.noise })

		if (isConeAttack(firing)) {
			// A cone lands the tick it fires -- there is no `projectileSpeed` on the descriptor.
			fireCone(world, tower, firing, target, applies, def.behaviours.find(isPushback))
		} else if (firing.projectileSpeed > 0) {
			// One shot per target, in the tower's own mode order. With fewer enemies in range than
			// `projectilesPerShot` the last one repeats, so the upgrade never fires *less* than it did.
			const spread = pickTargets(world, tower, firing, firing.projectilesPerShot)
			for (let shot = 0; shot < firing.projectilesPerShot; shot++) {
				spawnProjectile(world, tower, firing, spread[Math.min(shot, spread.length - 1)] ?? target, applies)
			}
		} else if (firing.splashRadiusTiles > 0) {
			// Instant AoE is `attack` with a radius, resolved through the same `circle` a projectile's
			// arrival uses. There is deliberately no `aoeAttack` kind.
			const at = enemyPosition(world, target)
			if (at !== null) {
				dealSplashDamage(
					world,
					at,
					firing.splashRadiusTiles,
					firing.damage,
					firing.damageType,
					firing.targets,
					tower.id,
					applies,
				)
			}
		} else {
			// `projectileSpeed: 0` is documented on `AttackBehaviour` as "the hit lands the same
			// tick, with no `Projectile` entity at all". Both paths stay real; later towers want
			// this one.
			dealDamage(world, target, firing.damage, firing.damageType, tower.id)
			applyStatuses(target, applies, tower.id, firing.damageType)
		}
	}
}
