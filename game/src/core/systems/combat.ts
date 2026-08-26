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

import { isConeAttack, isFiring } from '@/core/content/behaviours.ts'
import { getTowerDef } from '@/core/content/index.ts'
import { resolveDamage } from '@/core/content/matrix.ts'
import { applyStatuses } from '@/core/content/statuses.ts'
import { chargeAllowsFiring, chargeBehaviourOf, spendCharge } from '@/core/systems/charges.ts'
import { circle, cone } from '@/core/systems/hitbox.ts'
import { spawnProjectile } from '@/core/systems/projectiles.ts'
import { enemyById, enemyPosition } from '@/core/systems/spatial.ts'
import { isTargetable } from '@/core/systems/targeting.ts'
import type { ConeAttackBehaviour, StatusApplication, TargetClass } from '@/core/content/behaviours.ts'
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
 * The world is unused today and taken anyway, so both halves of the split read the same at every
 * call site and 9B's splash has it when it needs a position.
 */
export function applyDamage(_world: World, enemy: Enemy, base: number, damageType: DamageType): number {
	const amount = resolveDamage(base, damageType, enemy)
	enemy.hp -= amount
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
	world.events.push({ kind: 'enemyDamaged', enemyId: enemy.id, sourceTowerId, amount, at })

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
 * The wedge, aimed at the target the ordinary targeting modes chose and then landing on everything
 * inside it. One target choice, many hits -- that is what makes a cone the crowd answer.
 */
function fireCone(world: World, tower: Tower, behaviour: ConeAttackBehaviour, target: Enemy): void {
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

	for (const enemy of caught) {
		dealDamage(world, enemy, behaviour.damage, behaviour.damageType, tower.id)
		applyStatuses(enemy, behaviour.applies, tower.id, behaviour.damageType)
	}
}

export function combatSystem(world: World): void {
	// Terminal phases run nothing, or the night keeps simulating behind the summary screen.
	if (world.night.phase === 'won' || world.night.phase === 'lost') {
		return
	}

	for (const tower of world.towers) {
		const def = getTowerDef(tower.defId)
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

		const target = enemyById(world, tower.targetEnemyId)
		if (target === null) {
			continue
		}

		// Assigned, never `+=`. A tower that sat with nothing in range must not bank shots and then
		// empty the bank when one walks in.
		tower.cooldownTicks = firing.cooldownTicks
		const charges = chargeBehaviourOf(def)
		if (charges !== null) {
			spendCharge(tower, charges)
		}
		// `noise` is step 13's meter. Emitted now, consumed then.
		world.events.push({ kind: 'towerFired', towerId: tower.id, defId: def.id, noise: def.noise })

		if (isConeAttack(firing)) {
			// A cone lands the tick it fires -- there is no `projectileSpeed` on the descriptor.
			fireCone(world, tower, firing, target)
		} else if (firing.projectileSpeed > 0) {
			spawnProjectile(world, tower, firing, target)
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
					firing.applies,
				)
			}
		} else {
			// `projectileSpeed: 0` is documented on `AttackBehaviour` as "the hit lands the same
			// tick, with no `Projectile` entity at all". Both paths stay real; later towers want
			// this one.
			dealDamage(world, target, firing.damage, firing.damageType, tower.id)
			applyStatuses(target, firing.applies, tower.id, firing.damageType)
		}
	}
}
