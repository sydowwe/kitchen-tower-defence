import { loadoutSlots, unlockedTowerIds } from '@/core/campaign.ts'
import { getTowerDef } from '@/core/content/index.ts'
import { addToLoadout } from '@/core/loadout.ts'
import { statsFor } from '@/ui/viewModel.ts'
import { compositionOf, crumbsPerSecondOf, hasFlyer, hitsAir, isEconomy, valueOf } from '@/dev/harness/value.ts'
import type { Progress } from '@/core/campaign.ts'
import type { TowerDef } from '@/core/content/index.ts'
import type { DefId } from '@/core/types.ts'
import type { LoadoutPolicy } from '@/dev/harness/types.ts'

/**
 * Whatever the loadout screen would have preselected: `tonightsLoadout`. In night mode that is the
 * oldest unlocked towers that fit, because a progress built for one night stores no "last night"; in
 * campaign mode it is last night's plus tonight's unlock. So `default` is not the same player in the
 * two modes.
 */
export const defaultLoadout: LoadoutPolicy = {
	name: 'default',
	choose() {
		return null
	},
}

/** The prefix of a fixed list's name: `fixed=saltShaker|lemon|cookieJar`. */
export const FIXED_PREFIX = 'fixed='

/** The unlocked roster, best first by `score`, ties in unlock order. Nothing scoring 0 or less. */
function ranked(progress: Progress, score: (def: TowerDef) => number): TowerDef[] {
	return unlockedTowerIds(progress)
		.map(getTowerDef)
		.map(def => ({ def, score: score(def) }))
		.filter(entry => entry.score > 0)
		.sort((a, b) => b.score - a.score)
		.map(entry => entry.def)
}

/**
 * The reserved slots first, then the ranking down to a full counter. Built with `addToLoadout`, so a
 * list only ever grows the way the loadout screen grows one.
 */
function packed(progress: Progress, reserved: readonly (TowerDef | undefined)[], rest: readonly TowerDef[]): DefId[] {
	const slots = loadoutSlots(progress)
	let ids: DefId[] = []
	for (const def of [...reserved, ...rest]) {
		if (def !== undefined && ids.length < slots) {
			ids = addToLoadout(ids, def.id, slots)
		}
	}
	return ids
}

function bestEconomy(progress: Progress, wants: { economy: boolean }): TowerDef | undefined {
	if (!wants.economy) {
		return undefined
	}
	return ranked(progress, def => (isEconomy(def) ? crumbsPerSecondOf(def) / def.cost : 0))[0]
}

/**
 * Reads tonight's preview: the roster ranked by the card's DPS weighted by what is coming, per crumb.
 * A slot is kept for the best tower that hits air when anything tonight flies, and one for the best
 * economy tower when the policy wants economy.
 */
export const optimalLoadout: LoadoutPolicy = {
	name: 'optimal',
	choose(progress, wants) {
		const nightId = wants.nightId ?? progress.nightId
		if (nightId === null) {
			return null
		}
		const composition = compositionOf(nightId, progress.difficulty)
		function perCrumb(def: TowerDef): number {
			return valueOf(def, composition) / def.cost
		}
		const air = hasFlyer(composition) ? ranked(progress, def => (hitsAir(def) ? perCrumb(def) : 0))[0] : undefined
		return packed(progress, [air, bestEconomy(progress, wants)], ranked(progress, perCrumb))
	},
}

/**
 * Reads nothing about tonight: the roster ranked by the card's raw DPS per crumb, generically strong.
 * The economy slot is kept the same way, and nothing else is.
 */
export const blindLoadout: LoadoutPolicy = {
	name: 'blind',
	choose(progress, wants) {
		function dpsPerCrumb(def: TowerDef): number {
			return (statsFor(def).dps ?? 0) / def.cost
		}
		return packed(progress, [bestEconomy(progress, wants)], ranked(progress, dpsPerCrumb))
	},
}

/** Exactly this list, every night. One that is not legal tonight is refused by `setLoadout`, naming the night. */
export function fixedLoadout(ids: readonly DefId[]): LoadoutPolicy {
	const list = [...ids]
	return {
		name: `${FIXED_PREFIX}${list.join('|')}`,
		choose() {
			return [...list]
		},
	}
}

/** The ids in a `fixed=a|b|c` name, or null for any other name. Unknown ids are the caller's to refuse. */
export function parseFixed(name: string): DefId[] | null {
	if (!name.startsWith(FIXED_PREFIX)) {
		return null
	}
	return name
		.slice(FIXED_PREFIX.length)
		.split('|')
		.map(id => id.trim())
		.filter(id => id.length > 0)
}
