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

import { isAttack } from '@/core/content/behaviours.ts'
import { getTowerDef } from '@/core/content/index.ts'
import { resolveDamage } from '@/core/content/matrix.ts'
import { spawnProjectile } from '@/core/systems/projectiles.ts'
import { enemyById, enemyPosition } from '@/core/systems/spatial.ts'
import type { DamageType, Enemy, EntityId, World } from '@/core/types.ts'

/**
 * `base` damage of `damageType` onto `enemy`, through the tag matrix, and the resolved amount back.
 *
 * The event carries the **resolved** number rather than the base one, because that is what 6C's
 * damage numbers show and what a balance report has to add up.
 */
export function dealDamage(
	world: World,
	enemy: Enemy,
	base: number,
	damageType: DamageType,
	sourceTowerId: EntityId,
): number {
	const amount = resolveDamage(base, damageType, enemy)
	enemy.hp -= amount

	// An enemy whose path is missing has no position to report. It is a half-edited map out of
	// step 4's editor, and 6C draws nothing for a hit it cannot place.
	const at = enemyPosition(world, enemy) ?? { x: 0, y: 0 }
	world.events.push({ kind: 'enemyDamaged', enemyId: enemy.id, sourceTowerId, amount, at })

	return amount
}

export function combatSystem(world: World): void {
	// Terminal phases run nothing, or the night keeps simulating behind the summary screen.
	if (world.night.phase === 'won' || world.night.phase === 'lost') {
		return
	}

	for (const tower of world.towers) {
		const def = getTowerDef(tower.defId)
		const attack = def.behaviours.find(isAttack)
		if (attack === undefined) {
			continue
		}

		// Decrement first, then fire in the same tick. Firing first and decrementing after gives a
		// period of `cooldown + 1` -- 61 ticks instead of 60, a silent 1.6% DPS loss.
		tower.cooldownTicks = Math.max(0, tower.cooldownTicks - 1)
		if (tower.cooldownTicks > 0 || tower.targetEnemyId === null) {
			continue
		}

		const target = enemyById(world, tower.targetEnemyId)
		if (target === null) {
			continue
		}

		// Assigned, never `+=`. A tower that sat with nothing in range must not bank shots and then
		// empty the bank when one walks in.
		tower.cooldownTicks = attack.cooldownTicks
		// `noise` is step 13's meter. Emitted now, consumed then.
		world.events.push({ kind: 'towerFired', towerId: tower.id, defId: def.id, noise: def.noise })

		if (attack.projectileSpeed > 0) {
			spawnProjectile(world, tower, attack, target)
		} else {
			// `projectileSpeed: 0` is documented on `AttackBehaviour` as "the hit lands the same
			// tick, with no `Projectile` entity at all". Both paths stay real; later towers want
			// this one.
			dealDamage(world, target, attack.damage, attack.damageType, tower.id)
		}
	}
}
