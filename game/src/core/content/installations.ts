/**
 * The installations you buy with Grocery Money between nights
 * (analytic-docs/CONTENT.md section 8).
 *
 * **Three of the doc's fourteen are here**, and they are the three that make a loud tower a choice
 * rather than a trap: they raise the noise cap or the decay rate, so the counterplay
 * analytic-docs/DECISIONS.md section 8 promises exists. The other eleven touch eleven different
 * systems -- a sweep radius, a spawn count, a mold rate -- and belong to step 20, with the effect
 * shape it will pick once it can see all fourteen at once (step 13A, decisions 13 and 14).
 *
 * `cost` is Grocery Money and **nothing spends it yet**. That is step 20's too; the field is here
 * because it is what the doc authors and a price invented later is a price nobody checked.
 */

import type { InstallationDef } from '@/core/content/schema.ts'
import type { DefId } from '@/core/types.ts'

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
	effect: Pick<InstallationDef, 'noiseCapDelta' | 'noiseDecayPerSecondDelta'>,
): InstallationDefOf<Id> {
	return {
		id,
		nameKey: `installation.${id}.name`,
		descriptionKey: `installation.${id}.description`,
		cost,
		...effect,
	}
}

/**
 * analytic-docs/CONTENT.md section 8, in the doc's own order and at the doc's own prices.
 *
 * `noiseDecayPerSecondDelta` is authored **per second**, the way the doc writes it. `core/` holds
 * ticks, and the one conversion happens in `core/world.ts` beside the base rate -- a def should read
 * the way the document it was transcribed from reads (step 13A, decision 15).
 */
export const INSTALLATIONS = [
	installation('oilTheHinges', 90, { noiseDecayPerSecondDelta: 0.5 }),
	installation('closeTheKitchenDoor', 100, { noiseCapDelta: 25 }),
	installation('whiteNoiseMachine', 260, { noiseCapDelta: 30 }),
]

/**
 * What a set of owned installations is worth, as the resolved pair `CreateWorldOptions.noise` takes.
 *
 * **Summed additively**, so owning both cap installations is worth their sum rather than the larger
 * of them -- which is what makes the second one a purchase and not a duplicate.
 *
 * Exported so 13B's dev panel and step 20's metagame fold the same way. An unknown id throws with
 * the id in the message, like every other lookup in `core/content/index.ts`: the ids arrive from a
 * save record, and a silently ignored one is a cap that is quietly 25 lower than the player paid
 * for.
 */
export function resolveNoiseModifiers(ids: DefId[]): { capDelta: number; decayPerSecondDelta: number } {
	let capDelta = 0
	let decayPerSecondDelta = 0

	for (const id of ids) {
		const def = INSTALLATIONS.find(entry => entry.id === id)
		if (def === undefined) {
			throw new Error(`unknown installation id '${id}'`)
		}
		capDelta += def.noiseCapDelta ?? 0
		decayPerSecondDelta += def.noiseDecayPerSecondDelta ?? 0
	}

	return { capDelta, decayPerSecondDelta }
}
