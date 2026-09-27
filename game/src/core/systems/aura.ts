/**
 * Towers that do not fire: a persistent radius that damages and statuses everything standing in it,
 * with no target, no cooldown and no projectile.
 *
 * **A slot of its own, immediately after `combat`, and not a branch inside it.** `combatSystem`
 * opens by finding a firing behaviour and skipping every tower without one -- and an aura tower has
 * none, which is the whole point of it. After `combat` so an aura and a shot landing on the same
 * tick resolve in the order the two towers are read, and before `projectiles` for no reason beyond
 * keeping the damage sources together.
 *
 * The Candle is an aura plus a `reveal`, and needed nothing from this file but a config object. The
 * Gas Stove Burner is not an aura: it writes the floor, in `core/systems/tileEffect.ts`.
 */

import { isAura } from '@/core/content/behaviours.ts'
import { effectiveDefOf } from '@/core/content/index.ts'
import { applyStatuses } from '@/core/content/statuses.ts'
import { applyDamage } from '@/core/systems/combat.ts'
import { circle } from '@/core/systems/hitbox.ts'
import { isTargetable } from '@/core/systems/targeting.ts'
import type { World } from '@/core/types.ts'

/**
 * Ticks between two aura pulses. Six is step 17's number, taken now so that step collapses to adding
 * the Candle: several auras up at once is the case it is a saving for, and 10 pulses a second is far
 * finer than anything a player can see.
 *
 * On the world clock -- `world.tick % AURA_INTERVAL_TICKS` -- the way `economySystem` pays out. That
 * needs no field on `Tower`, nothing extra to serialise, and it lines every aura in the game up on
 * the same tick.
 */
export const AURA_INTERVAL_TICKS = 6

export function auraSystem(world: World): void {
	// Terminal phases run nothing, or the candle keeps burning behind the summary screen.
	if (world.night.phase === 'won' || world.night.phase === 'lost') {
		return
	}
	if (world.tick % AURA_INTERVAL_TICKS !== 0) {
		return
	}

	for (const tower of world.towers) {
		for (const behaviour of effectiveDefOf(tower).behaviours) {
			if (!isAura(behaviour)) {
				continue
			}

			for (const enemy of circle(world, tower.tile, behaviour.radiusTiles, candidate =>
				isTargetable(candidate, behaviour.targets),
			)) {
				// **`damagePerTick * AURA_INTERVAL_TICKS`.** The rate is authored per tick and this
				// pulse stands in for six of them; dealing the per-tick number once every sixth tick is
				// a silent 6x nerf that nothing in the game reports and no balance sheet catches.
				//
				// `applyDamage` and not `dealDamage`: a pulse of 0.6 would print a floating `0` ten
				// times a second per enemy in radius, which is what `render/layers/effects.ts`'s
				// 32-number cap is there to be protected from. The feedback for an aura is the fill.
				if (behaviour.damagePerTick > 0) {
					applyDamage(world, enemy, behaviour.damagePerTick * AURA_INTERVAL_TICKS, behaviour.damageType)
				}
				applyStatuses(enemy, behaviour.applies, tower.id, behaviour.damageType)
			}
		}
	}
}
