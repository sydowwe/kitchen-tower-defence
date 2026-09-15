/**
 * The tick over `world.tiles`: what the board does to whatever is standing on it, how a staged
 * effect grows, and the ageing that retires the rest.
 *
 * The model and every pure read live in `core/tiles.ts` -- see its header for why the split is an
 * import cycle away from being one file.
 *
 * **Nothing here branches on a `TileEffectKind`.** `effect`, `applies`, `stages` and `onRewrite` are
 * fields on `TILE_EFFECT_DEFS` precisely so the passes below filter on them, and a sixth kind is a
 * config entry rather than a case.
 *
 * Speed is deliberately *not* read here. `movement` runs 5th and this runs 12th, so a slime has to
 * be read before the enemy moves while damage has to land where it ended up -- both through the one
 * `tileUnder` helper below, which is therefore the only place the flyer check is written.
 */

import { applyStatuses } from '@/core/content/statuses.ts'
import { TILE_EFFECT_DEFS } from '@/core/content/tileEffects.ts'
import { tileAt, tileStateAt } from '@/core/tiles.ts'
import { applyDamage } from '@/core/systems/combat.ts'
import { enemyPosition } from '@/core/systems/spatial.ts'
import { isFlyer } from '@/core/systems/targeting.ts'
import type { Enemy, TileState, World } from '@/core/types.ts'

/**
 * The cell this enemy is standing on, or null -- for an empty board, for a flyer, for an enemy whose
 * path the map has lost, and for a cell with nothing on it.
 *
 * **The one flyer check for tile effects in the codebase**, which is what `isFlyer`'s docstring in
 * `core/systems/targeting.ts` already predicts. A Moth is off the floor, so the floor does nothing to
 * it: no heat, no slime, no residue.
 */
export function tileUnder(world: World, enemy: Enemy): TileState | null {
	if (world.tiles.length === 0 || isFlyer(enemy)) {
		return null
	}

	const at = enemyPosition(world, enemy)
	if (at === null) {
		return null
	}

	return tileStateAt(world, tileAt(at))
}

/**
 * What to multiply this enemy's speed by for the floor it is on. Exactly `1` with nothing under it,
 * for a flyer, and for a cell carrying no `speedMultiplier` effect -- so `movementSystem`'s common
 * line is unchanged in value and `tileUnder`'s early-out is what keeps it cheap.
 *
 * Several speed effects on one cell **multiply**, matching the tag matrix's rule. There is only ever
 * one today.
 */
export function tileSpeedMultiplier(world: World, enemy: Enemy): number {
	const state = tileUnder(world, enemy)
	if (state === null) {
		return 1
	}

	let multiplier = 1
	for (const effect of state.effects) {
		if (TILE_EFFECT_DEFS[effect.kind].effect !== 'speedMultiplier') {
			continue
		}
		// The magnitude *is* the multiplier for a tile -- 1.6 is 1.6x. See the header of
		// core/content/tileEffects.ts: this is not `StatusDef`'s "fraction removed" convention.
		multiplier *= effect.magnitude
	}

	return multiplier
}

export function tilesSystem(world: World): void {
	// Terminal phases run nothing, or the floor keeps burning enemies behind the summary screen.
	if (world.night.phase === 'won' || world.night.phase === 'lost') {
		return
	}
	// The board with nothing on it costs one comparison. Most of a night is this case.
	if (world.tiles.length === 0) {
		return
	}

	for (const enemy of world.enemies) {
		const state = tileUnder(world, enemy)
		if (state === null) {
			continue
		}

		// **Indexed against a length read once, not `for...of`.** `applyDamage` writes a scorch mark
		// onto the tile under whatever it damages -- which, for a heated cell, is this very array. A
		// `for...of` would walk into the effect it just appended; capturing the count leaves the new
		// mark to the next tick, and costs no allocation to do it.
		const effects = state.effects
		for (let index = 0, count = effects.length; index < count; index++) {
			const effect = effects[index]
			if (effect === undefined) {
				continue
			}
			const def = TILE_EFFECT_DEFS[effect.kind]

			// `applyDamage`, never `dealDamage`: a 0.23 heat tick would print a floating number over
			// every enemy on the tile sixty times a second and blow `render/layers/effects.ts`'s
			// 32-number cap, exactly as `auraSystem` documents. Through it rather than off `hp`, so a
			// fungal enemy standing in fire takes the matrix multiplier.
			if (def.effect === 'damageOverTime' && def.damageType !== null) {
				applyDamage(world, enemy, effect.magnitude, def.damageType)
			}
			// No source id: a cell has none (there is nothing to attribute a kill to), and a null one
			// simply never matches the charge bookkeeping's `status.sourceId === towerId`.
			if (def.applies.length > 0) {
				applyStatuses(enemy, def.applies, null, def.damageType)
			}
		}
	}

	// On the world clock, the way `AURA_INTERVAL_TICKS` and `economySystem`'s payouts are: no field on
	// `TileEffect`, nothing extra in the save, and every patch on the board grows on the same tick. A
	// patch written mid-interval reaches stage 2 a fraction early, which is invisible against the gap.
	for (const state of world.tiles) {
		for (const effect of state.effects) {
			const def = TILE_EFFECT_DEFS[effect.kind]
			if (def.stages <= 1 || world.tick % def.stageTicks !== 0) {
				continue
			}
			effect.magnitude = Math.min(effect.magnitude + 1, def.stages)
		}
	}

	// Last, and after everything above has been read off -- `tickStatuses`' rule to the letter, so a
	// burn and a heated tile cannot end up one tick out of step with each other. An effect with one
	// tick left applies this tick and is gone from the next one.
	//
	// Both arrays are walked backwards, because both are spliced while being iterated.
	for (let cell = world.tiles.length - 1; cell >= 0; cell--) {
		const state = world.tiles[cell]
		if (state === undefined) {
			continue
		}

		for (let index = state.effects.length - 1; index >= 0; index--) {
			const effect = state.effects[index]
			if (effect === undefined || effect.remainingTicks < 0) {
				continue
			}
			effect.remainingTicks--
			if (effect.remainingTicks <= 0) {
				state.effects.splice(index, 1)
			}
		}

		// The cell is released with its last effect. An empty shell left behind would accumulate for
		// the whole night, land in the save, and turn the linear scan into a grid sweep.
		if (state.effects.length === 0) {
			world.tiles.splice(cell, 1)
		}
	}
}
