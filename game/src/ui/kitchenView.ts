/**
 * Everything the Kitchen is allowed to know, as one plain object built by hand -- the Kitchen's
 * `viewModel.ts`, under the same two rules: keys and numbers, never English, and nothing that holds
 * a reference into the progress it was built from.
 *
 * Rebuilt in a `computed` when the progress store changes, not at 15Hz. No loop runs on this screen.
 * Components under `ui/components/kitchen/` import from here and never from `core/`.
 */

import { currentNight } from '@/core/campaign.ts'
import { getEnemyDef, getTowerDef, INSTALLATIONS, NIGHTS } from '@/core/content/index.ts'
import type { Progress } from '@/core/campaign.ts'
import type { InstallationEffect, InstallationId, NightDef } from '@/core/content/index.ts'
import type { DefId } from '@/core/types.ts'
import type { StatValueView } from '@/ui/viewModel.ts'

export type { InstallationId } from '@/core/content/index.ts'
export type { StatValueView } from '@/ui/viewModel.ts'

export interface InstallationCardView {
	id: InstallationId
	glyph: string
	nameKey: string
	descriptionKey: string
	/** What it does, with its number read off the def in the def's own units. */
	effect: StatValueView
	cost: number
	/**
	 * `affordable` is `groceryMoney >= cost`, with `>=` for `ShopEntry.affordable`'s reason: a 120
	 * installation with exactly 120 in the jar is the one purchase the player has been saving for.
	 */
	state: 'owned' | 'affordable' | 'unaffordable'
}

/** One thing standing in the room. The scene places it by id. */
export interface OwnedInstallationView {
	id: InstallationId
	glyph: string
	nameKey: string
}

/** A tower or an enemy, named on the preview. */
export interface PreviewEntryView {
	id: DefId
	glyph: string
	nameKey: string
}

export interface NightPreviewView {
	/** The night's 1-based number, as CONTENT.md section 6 counts them. */
	night: number
	mapNameKey: string
	waveCount: number
	unlocks: PreviewEntryView[]
	/** Every enemy in tonight's waves that no lower-indexed night sends, in order of first appearance. */
	introduces: PreviewEntryView[]
}

export interface KitchenView {
	groceryMoney: number
	cards: InstallationCardView[]
	/** In `INSTALLATIONS` order, so the room does not reshuffle when a purchase lands. */
	owned: OwnedInstallationView[]
	/** Null once the campaign is finished: there is no next night to preview or start. */
	preview: NightPreviewView | null
}

/**
 * The card's line, one `case` per effect kind. A new kind fails `type-check` here, like the fold in
 * `resolveModifiers`, and never falls through to a default line.
 *
 * The two multipliers are authored as the fraction *left* (0.8) and read by a player as the fraction
 * *taken off* (20%), which is the one conversion here.
 */
function effectLine(effect: InstallationEffect): StatValueView {
	switch (effect.kind) {
		case 'noiseCap':
			return { textKey: 'kitchen.effect.noiseCap', params: { n: effect.delta } }
		case 'noiseDecay':
			return { textKey: 'kitchen.effect.noiseDecay', params: { n: effect.perSecondDelta } }
		case 'sweep':
			return { textKey: 'kitchen.effect.sweep', params: { n: effect.radiusTiles } }
		case 'collectTravel':
			return { textKey: 'kitchen.effect.collectTravel', params: { n: effect.maxSeconds } }
		case 'crackSpawns':
			return { textKey: 'kitchen.effect.crackSpawns', params: { n: percentOff(effect.mult) } }
		case 'flyerDelay':
			return { textKey: 'kitchen.effect.flyerDelay', params: { n: effect.waves } }
		case 'spreadRate':
			return { textKey: 'kitchen.effect.spreadRate', params: { n: percentOff(effect.mult) } }
		case 'steals':
			return { textKey: 'kitchen.effect.steals', params: { n: effect.reduction } }
		case 'foodBonus':
			return { textKey: 'kitchen.effect.foodBonus', params: { n: effect.items } }
		case 'snackStash':
			return { textKey: 'kitchen.effect.snackStash', params: { items: effect.items, at: effect.atOnShelf } }
		case 'loadoutSlots':
			return { textKey: 'kitchen.effect.loadoutSlots', params: { n: effect.slots } }
		default: {
			const unprinted: never = effect
			throw new Error(`an installation effect the card cannot print: ${String(unprinted)}`)
		}
	}
}

function percentOff(mult: number): number {
	return Math.round((1 - mult) * 100)
}

function enemyIdsOf(night: NightDef): DefId[] {
	return night.waves.flatMap(wave => wave.entries.map(entry => entry.enemyDefId))
}

function buildPreview(night: NightDef): NightPreviewView {
	const seenBefore = new Set(NIGHTS.filter(other => other.index < night.index).flatMap(enemyIdsOf))
	const introduced = [...new Set(enemyIdsOf(night))].filter(id => !seenBefore.has(id))

	return {
		night: night.index,
		mapNameKey: `map.${night.mapId}.name`,
		waveCount: night.waves.length,
		unlocks: (night.unlocksTowerIds ?? []).map(function toEntry(id) {
			const def = getTowerDef(id)
			return { id, glyph: def.glyph, nameKey: def.nameKey }
		}),
		introduces: introduced.map(function toEntry(id) {
			const def = getEnemyDef(id)
			return { id, glyph: def.glyph, nameKey: def.nameKey }
		}),
	}
}

export function buildKitchenView(progress: Progress): KitchenView {
	const owned = new Set(progress.installations)
	const night = currentNight(progress)

	return {
		groceryMoney: progress.groceryMoney,
		cards: INSTALLATIONS.map(function toCard(def): InstallationCardView {
			let state: InstallationCardView['state'] = 'unaffordable'
			if (owned.has(def.id)) {
				state = 'owned'
			} else if (progress.groceryMoney >= def.cost) {
				state = 'affordable'
			}
			return {
				id: def.id,
				glyph: def.glyph,
				nameKey: def.nameKey,
				descriptionKey: def.descriptionKey,
				effect: effectLine(def.effect),
				cost: def.cost,
				state,
			}
		}),
		owned: INSTALLATIONS.filter(def => owned.has(def.id)).map(def => ({
			id: def.id,
			glyph: def.glyph,
			nameKey: def.nameKey,
		})),
		preview: night === null ? null : buildPreview(night),
	}
}
