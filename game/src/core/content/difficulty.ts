/**
 * The three difficulty tiers of analytic-docs/CONTENT.md section 9, transcribed.
 *
 * Global scalars only -- there is no per-tier content anywhere, and nothing in the simulation
 * branches on `difficulty.id`. A system reads a multiplier; the id is carried for display and for
 * the save record.
 *
 * `createWorld` copies the resolved numbers onto the world rather than storing the id alone, so a
 * replay of tonight's session is not at the mercy of a balance patch that changes what 'nightmare'
 * means next month.
 */

import type { Difficulty, DifficultyId } from '@/core/types.ts'

export const DIFFICULTIES: Readonly<Record<DifficultyId, Difficulty>> = {
	cozy: {
		id: 'cozy',
		enemyHpMult: 0.8,
		enemyCountMult: 0.85,
		crumbIncomeMult: 1.25,
		startingCrumbs: 250,
		foodItemsMult: 1.3,
		noiseCap: 130,
		groceryMoneyMult: 0.7,
	},
	normal: {
		id: 'normal',
		enemyHpMult: 1,
		enemyCountMult: 1,
		crumbIncomeMult: 1,
		startingCrumbs: 200,
		foodItemsMult: 1,
		noiseCap: 100,
		groceryMoneyMult: 1,
	},
	nightmare: {
		id: 'nightmare',
		enemyHpMult: 1.35,
		enemyCountMult: 1.25,
		crumbIncomeMult: 0.85,
		startingCrumbs: 150,
		foodItemsMult: 0.75,
		noiseCap: 80,
		groceryMoneyMult: 1.5,
	},
}

/**
 * A fresh, mutable copy. The world owns its numbers; the table above stays untouched.
 *
 * The id is typed, but it also arrives from a save record and from a URL, so an unknown one throws
 * here with the id in the message rather than spreading `undefined` into a world whose every
 * multiplier is then `NaN`.
 */
export function resolveDifficulty(id: DifficultyId): Difficulty {
	const tier = DIFFICULTIES[id] as Difficulty | undefined
	if (tier === undefined) {
		throw new Error(`unknown difficulty '${id}'`)
	}
	return { ...tier }
}
