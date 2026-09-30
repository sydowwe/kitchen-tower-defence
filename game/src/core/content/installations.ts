/**
 * The installations you buy with Grocery Money between nights
 * (analytic-docs/CONTENT.md section 8).
 *
 * All fourteen of the doc's. Each carries one effect, and `resolveModifiers` folds a set of owned ids
 * into the one `WorldModifiers` a world is built with. No system reads an installation id; each reads
 * the field of `world.modifiers` it owns.
 *
 * `cost` is Grocery Money, and nothing in this file spends it.
 */

import type { InstallationDef } from '@/core/content/schema.ts'
import type { DefId, WorldModifiers } from '@/core/types.ts'

/** One installation's effect. Exported for the card, which prints a line per kind. */
export type InstallationEffect = InstallationDef['effect']

/**
 * The food and tower pattern: the id is written once and both keys are derived from it, so the
 * literal id survives into `INSTALLATIONS` and `ui/locales/contentKeys.ts` can demand an English
 * entry per installation id. See the note on `FoodDefOf`.
 */
export interface InstallationDefOf<Id extends string> extends InstallationDef {
	id: Id
	nameKey: `installation.${Id}.name`
	descriptionKey: `installation.${Id}.description`
}

function installation<Id extends string>(
	id: Id,
	cost: number,
	glyph: string,
	effect: InstallationEffect,
): InstallationDefOf<Id> {
	return {
		id,
		nameKey: `installation.${id}.name`,
		descriptionKey: `installation.${id}.description`,
		glyph,
		cost,
		effect,
	}
}

/**
 * analytic-docs/CONTENT.md section 8, in the doc's own order, at the doc's own prices and in the
 * doc's own units: the decay per second, the dustpan in seconds, "20% fewer" as the 0.8 left.
 */
export const INSTALLATIONS = [
	installation('oilTheHinges', 90, '🛢️', { kind: 'noiseDecay', perSecondDelta: 0.5 }),
	installation('closeTheKitchenDoor', 100, '🚪', { kind: 'noiseCap', delta: 25 }),
	installation('buyABroom', 110, '🧹', { kind: 'sweep', radiusTiles: 1.5 }),
	installation('sealTheBaseboardCrack', 120, '🧱', { kind: 'crackSpawns', mult: 0.8 }),
	installation('nightShiftDustpan', 140, '🪣', { kind: 'collectTravel', maxSeconds: 0.7 }),
	installation('fixTheWindowScreen', 150, '🪟', { kind: 'flyerDelay', waves: 1 }),
	installation('pantryShelfLiner', 160, '🧻', { kind: 'spreadRate', mult: 0.6 }),
	installation('betterTupperware', 180, '🥡', { kind: 'steals', reduction: 1 }),
	installation('biggerFridge', 200, '🧊', { kind: 'foodBonus', items: 4 }),
	installation('emergencySnackStash', 220, '🍫', { kind: 'snackStash', atOnShelf: 3, items: 3 }),
	installation('whiteNoiseMachine', 260, '📻', { kind: 'noiseCap', delta: 30 }),
	installation('clearTheDryingRack', 170, '🍽️', { kind: 'loadoutSlots', slots: 1 }),
	installation('takeTheToasterOffTheCounter', 240, '🔌', { kind: 'loadoutSlots', slots: 1 }),
	installation('secondShelf', 320, '🪵', { kind: 'loadoutSlots', slots: 1 }),
]

export type InstallationId = (typeof INSTALLATIONS)[number]['id']

/**
 * How many towers a night may be brought with before any counter space is bought
 * (analytic-docs/DECISIONS.md section 10).
 */
export const LOADOUT_BASE_SLOTS = 5

/** And with all of it. The fold caps here, so owning more slots than there are is still eight. */
export const LOADOUT_MAX_SLOTS = 8

/**
 * Ticks per second, for the one conversion the fold does. A system dividing by 60 is a system that
 * will one day divide twice.
 */
const TICKS_PER_SECOND = 60

/** What a world with nothing owned carries: the identity of every fold rule below. */
export const NO_MODIFIERS: WorldModifiers = {
	noiseCapDelta: 0,
	noiseDecayPerTickDelta: 0,
	sweepRadiusTiles: 0,
	collectTravelTicksMax: null,
	crackSpawnMult: 1,
	flyerDelayWaves: 0,
	spreadRateMult: 1,
	stealsReduction: 0,
	foodBonus: 0,
	snackStash: null,
	loadoutSlots: LOADOUT_BASE_SLOTS,
	enemyCountMult: 1,
	crumbValueMult: 1,
	damageTypeMult: { physical: 1, fire: 1, cold: 1, chemical: 1, electric: 1 },
}

/**
 * A copy no other `WorldModifiers` shares a nested object with. `{ ...modifiers }` alone is shallow,
 * and a fold that then wrote `damageTypeMult.fire` would be writing `NO_MODIFIERS`' record -- fire at
 * x1.3 in every world built after the first heatwave, in a harness that builds thousands.
 */
export function copyModifiers(modifiers: WorldModifiers): WorldModifiers {
	return {
		...modifiers,
		snackStash: modifiers.snackStash === null ? null : { ...modifiers.snackStash },
		damageTypeMult: { ...modifiers.damageTypeMult },
	}
}

/**
 * What a set of owned installations is worth, as the `WorldModifiers` `createWorld` takes.
 *
 * **The fold rule is per kind** (step 20A, decision 4). Deltas and counts sum, so the second cap
 * installation is a purchase and not a duplicate. The broom takes the widest radius and the dustpan
 * the shortest flight. Multipliers multiply, so a night modifier lands in the same object:
 * `applyNightModifier` in `core/content/modifiers.ts` folds tonight's over this one.
 *
 * An unknown id throws with the id in the message, like every other lookup in `core/content/`: the ids
 * arrive from a save record, and a silently ignored one is a cap 25 lower than the player paid for.
 */
export function resolveModifiers(ids: readonly DefId[]): WorldModifiers {
	const modifiers = copyModifiers(NO_MODIFIERS)

	for (const id of ids) {
		const def = INSTALLATIONS.find(entry => entry.id === id)
		if (def === undefined) {
			throw new Error(`unknown installation id '${id}'`)
		}

		const effect = def.effect
		switch (effect.kind) {
			case 'noiseCap':
				modifiers.noiseCapDelta += effect.delta
				break
			case 'noiseDecay':
				modifiers.noiseDecayPerTickDelta += effect.perSecondDelta / TICKS_PER_SECOND
				break
			case 'sweep':
				modifiers.sweepRadiusTiles = Math.max(modifiers.sweepRadiusTiles, effect.radiusTiles)
				break
			case 'collectTravel': {
				const ticks = Math.round(effect.maxSeconds * TICKS_PER_SECOND)
				const current = modifiers.collectTravelTicksMax
				modifiers.collectTravelTicksMax = current === null ? ticks : Math.min(current, ticks)
				break
			}
			case 'crackSpawns':
				modifiers.crackSpawnMult *= effect.mult
				break
			case 'flyerDelay':
				modifiers.flyerDelayWaves += effect.waves
				break
			case 'spreadRate':
				modifiers.spreadRateMult *= effect.mult
				break
			case 'steals':
				modifiers.stealsReduction += effect.reduction
				break
			case 'foodBonus':
				modifiers.foodBonus += effect.items
				break
			case 'snackStash':
				// Only one installation carries a stash, so its own value rather than a fold.
				modifiers.snackStash = { atOnShelf: effect.atOnShelf, items: effect.items }
				break
			case 'loadoutSlots':
				modifiers.loadoutSlots += effect.slots
				break
			default: {
				// A new kind fails `type-check` here, which is the point of the union.
				const unfolded: never = effect
				throw new Error(`installation '${id}' has an effect the fold does not know: ${String(unfolded)}`)
			}
		}
	}

	// Once, after the loop, rather than inside the case.
	modifiers.loadoutSlots = Math.min(modifiers.loadoutSlots, LOADOUT_MAX_SLOTS)

	return modifiers
}
