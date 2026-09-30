/**
 * The rules of a loadout as a list: what adding to one does, and what makes one legal
 * (analytic-docs/DECISIONS.md section 10).
 *
 * **Knows nothing about `Progress`.** `core/campaign.ts` asks these with tonight's unlocked towers and
 * slot count; step 22's loadout policies ask them with lists of their own.
 *
 * **Array order is selection order**, oldest first. It is what "swap the oldest" reads, and it is
 * never a display order. Every function returns a new array and leaves its argument alone.
 */

import type { DefId } from '@/core/types.ts'

/** Why a loadout is not one a night can be played with, in the order `checkLoadout` asks. */
export type LoadoutProblem = 'empty' | 'duplicate' | 'notUnlocked' | 'tooMany'

/**
 * Brings `id`. Already brought is an unchanged copy. With room it goes on the end; on a full counter
 * the oldest choice makes way for it.
 */
export function addToLoadout(ids: readonly DefId[], id: DefId, slots: number): DefId[] {
	if (ids.includes(id)) {
		return [...ids]
	}
	const kept = ids.length >= slots ? ids.slice(ids.length - slots + 1) : [...ids]
	return [...kept, id]
}

export function removeFromLoadout(ids: readonly DefId[], id: DefId): DefId[] {
	return ids.filter(entry => entry !== id)
}

/** The first problem with this loadout, or null for one a night can be played with. */
export function checkLoadout(ids: readonly DefId[], unlocked: readonly DefId[], slots: number): LoadoutProblem | null {
	if (ids.length === 0) {
		return 'empty'
	}
	if (new Set(ids).size !== ids.length) {
		return 'duplicate'
	}
	if (ids.some(id => !unlocked.includes(id))) {
		return 'notUnlocked'
	}
	if (ids.length > slots) {
		return 'tooMany'
	}
	return null
}
