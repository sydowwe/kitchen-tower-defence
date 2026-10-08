/**
 * Everything the Kitchen is allowed to know, as one plain object built by hand -- the Kitchen's
 * `viewModel.ts`, under the same two rules: keys and numbers, never English, and nothing that holds
 * a reference into the progress it was built from.
 *
 * Rebuilt in a `computed` when the progress store changes, not at 15Hz. No loop runs on this screen.
 * Components under `ui/components/kitchen/` import from here and never from `core/`.
 */

import {
	currentNight,
	DIFFICULTY_LADDER,
	endlessBest,
	endlessMapIds,
	endlessUnlocked,
	tierUnlocked,
} from '@/core/campaign.ts'
import {
	applyNightModifier,
	getEnemyDef,
	getMapDef,
	getNightModifierDef,
	getTowerDef,
	INSTALLATIONS,
	NIGHTS,
	NO_MODIFIERS,
	resolveDifficulty,
} from '@/core/content/index.ts'
import { TileFlags } from '@/core/map.ts'
import { waveEntryCount } from '@/core/systems/spawn.ts'
import { buildModifierView } from '@/ui/viewModel.ts'
import type { Progress } from '@/core/campaign.ts'
import type { InstallationEffect, InstallationId, NightDef } from '@/core/content/index.ts'
import type { DefId, Difficulty, DifficultyId, Vec2, WorldModifiers } from '@/core/types.ts'
import type { ModifierView, StatValueView } from '@/ui/viewModel.ts'

export type { InstallationId } from '@/core/content/index.ts'
export type { DefId, DifficultyId, Vec2 } from '@/core/types.ts'
export type { ModifierView, StatValueView } from '@/ui/viewModel.ts'

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

/** One kind of enemy a night sends, once, where it first turns up. */
export interface EnemyEntryView extends PreviewEntryView {
	/** Every tag, `hud.tag.<tag>`, in the def's order -- the tooltip's keys. */
	tagKeys: string[]
	/** 1-based, the way the HUD counts waves. */
	firstWave: number
}

/** One kind of enemy in tonight's waves, as the loadout screen lists the whole night. */
export interface NightEnemyView extends EnemyEntryView {
	/**
	 * What will spawn tonight at this tier, summed over every wave: each entry through `waveEntryCount`
	 * with the tier and the night modifier, the rounding `startWave` uses. The crack's and the window
	 * screen's cuts are left out, for step 20aB decision 3's reason.
	 */
	count: number
}

/**
 * One tile of the authored board, as the preview draws it. A track tile is also buildable, and it is
 * the track that matters to a player choosing towers against it.
 */
export type MapCell = 'buildable' | 'blocked' | 'decor' | 'track'

/**
 * The map's shape: what the track looks like and where it goes. The authored map, never a world's:
 * moving day's boxes are placed off the seed when the night starts, and are the night's, not the map's.
 */
export interface MapShapeView {
	widthTiles: number
	heightTiles: number
	/** Row-major, `widthTiles * heightTiles` long, like `MapDef.flags`. */
	cells: MapCell[]
	/** One per path, in the map's order: its waypoints, tile centres, the spawn first. */
	lanes: Vec2[][]
	fridge: Vec2
}

export interface NightPreviewView {
	/** The night's 1-based number, as CONTENT.md section 6 counts them. */
	night: number
	mapNameKey: string
	map: MapShapeView
	/** Tonight's night modifier, or null on a plain night. */
	modifier: ModifierView | null
	waveCount: number
	unlocks: PreviewEntryView[]
	/** Every enemy in tonight's waves that no lower-indexed night sends, in order of first appearance. */
	introduces: PreviewEntryView[]
	/** Every enemy in tonight's waves, once each, in order of first appearance. Nothing hatched is a wave. */
	enemies: NightEnemyView[]
}

/** One map a long night can be played on, as the Kitchen offers it. */
export interface EndlessEntryView {
	mapId: DefId
	mapNameKey: string
	map: MapShapeView
	/** The most waves got through on it at the campaign's tier, or null for no run there yet. */
	best: number | null
}

export interface KitchenView {
	groceryMoney: number
	cards: InstallationCardView[]
	/** In `INSTALLATIONS` order, so the room does not reshuffle when a purchase lands. */
	owned: OwnedInstallationView[]
	/** Null once the campaign is finished: there is no next night to preview or start. */
	preview: NightPreviewView | null
	/** Every map's long night, in `endlessMapIds` order. Null until a tier has been cleared. */
	endless: EndlessEntryView[] | null
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

function enemyEntry(id: DefId, waveIndex: number): EnemyEntryView {
	const def = getEnemyDef(id)
	return {
		id: def.id,
		glyph: def.glyph,
		nameKey: def.nameKey,
		tagKeys: def.tags.map(tag => `hud.tag.${tag}`),
		firstWave: waveIndex + 1,
	}
}

/**
 * One walk of the waves: a `Map` keeps first-appearance order, and the count sums as it goes. Each
 * entry is rounded on its own before the sum, as each is when its wave starts.
 */
function compositionOf(night: NightDef, difficulty: Difficulty, modifiers: WorldModifiers): NightEnemyView[] {
	const byId = new Map<DefId, NightEnemyView>()

	night.waves.forEach((wave, index) => {
		for (const entry of wave.entries) {
			const count = waveEntryCount(entry.count, difficulty, modifiers)
			const seen = byId.get(entry.enemyDefId)
			if (seen !== undefined) {
				seen.count += count
				continue
			}
			byId.set(entry.enemyDefId, { ...enemyEntry(entry.enemyDefId, index), count })
		}
	})

	return [...byId.values()]
}

/**
 * Every enemy a night sends, once each, where it first turns up, and **no counts**: a long night's
 * two hundred generated waves sum into the thousands and mean nothing to a player choosing towers.
 */
export function poolOf(night: NightDef): EnemyEntryView[] {
	const byId = new Map<DefId, EnemyEntryView>()

	night.waves.forEach((wave, index) => {
		for (const entry of wave.entries) {
			if (!byId.has(entry.enemyDefId)) {
				byId.set(entry.enemyDefId, enemyEntry(entry.enemyDefId, index))
			}
		}
	})

	return [...byId.values()]
}

/** `TRACK` first: a track tile is `BUILDABLE | TRACK`, and tested the other way round every lane is floor. */
function cellOf(flags: number): MapCell {
	if ((flags & TileFlags.TRACK) !== 0) {
		return 'track'
	}
	if ((flags & TileFlags.BLOCKED) !== 0) {
		return 'blocked'
	}
	if ((flags & TileFlags.DECOR) !== 0) {
		return 'decor'
	}
	return (flags & TileFlags.BUILDABLE) !== 0 ? 'buildable' : 'blocked'
}

/** The authored map as the preview draws it. Every point copied, so nothing holds the def's arrays. */
export function buildMapShape(mapId: DefId): MapShapeView {
	const map = getMapDef(mapId)

	return {
		widthTiles: map.widthTiles,
		heightTiles: map.heightTiles,
		cells: map.flags.map(cellOf),
		lanes: map.paths.map(path => path.waypoints.map(point => ({ x: point.x, y: point.y }))),
		fridge: { x: map.fridge.tile.x, y: map.fridge.tile.y },
	}
}

/**
 * The one builder: the Kitchen shows what is new, and `loadoutView.ts` the whole composition. The
 * tier is the campaign's, which the counts are multiplied by.
 */
export function buildPreview(night: NightDef, difficulty: DifficultyId): NightPreviewView {
	const seenBefore = new Set(NIGHTS.filter(other => other.index < night.index).flatMap(enemyIdsOf))
	const introduced = [...new Set(enemyIdsOf(night))].filter(id => !seenBefore.has(id))
	const modifierDef = night.modifierId === undefined ? null : getNightModifierDef(night.modifierId)
	const modifiers = modifierDef === null ? NO_MODIFIERS : applyNightModifier(NO_MODIFIERS, modifierDef)

	return {
		night: night.index,
		mapNameKey: `map.${night.mapId}.name`,
		map: buildMapShape(night.mapId),
		modifier: buildModifierView(night.modifierId ?? null),
		waveCount: night.waves.length,
		unlocks: (night.unlocksTowerIds ?? []).map(function toEntry(id) {
			const def = getTowerDef(id)
			return { id, glyph: def.glyph, nameKey: def.nameKey }
		}),
		introduces: introduced.map(function toEntry(id) {
			const def = getEnemyDef(id)
			return { id, glyph: def.glyph, nameKey: def.nameKey }
		}),
		enemies: compositionOf(night, resolveDifficulty(difficulty), modifiers),
	}
}

/** One rung of the ladder, as the title offers it. */
export interface TierView {
	id: DifficultyId
	nameKey: string
	descriptionKey: string
	/** The tier the campaign is on now. */
	current: boolean
	/** `tierUnlocked`'s answer. Nothing in `ui/` decides it. */
	unlocked: boolean
	/** While locked, the tier whose clear opens it. Null once it is open. */
	opensOnNameKey: string | null
}

export interface TierPickerView {
	/** In `DIFFICULTY_LADDER` order, easiest first. */
	tiers: TierView[]
	/**
	 * The campaign has something to lose: a night played, money in the jar, or something bought. Picking
	 * another tier asks first only then -- a new campaign on night 1 with nothing in it loses nothing.
	 */
	campaignStarted: boolean
}

function tierNameKey(id: DifficultyId): string {
	return `difficulty.${id}.name`
}

export function buildTierPicker(progress: Progress): TierPickerView {
	return {
		tiers: DIFFICULTY_LADDER.map(function toTier(id, index): TierView {
			const unlocked = tierUnlocked(progress, id)
			const below = DIFFICULTY_LADDER[index - 1]
			return {
				id,
				nameKey: tierNameKey(id),
				descriptionKey: `difficulty.${id}.description`,
				current: progress.difficulty === id,
				unlocked,
				opensOnNameKey: unlocked || below === undefined ? null : tierNameKey(below),
			}
		}),
		campaignStarted:
			Object.keys(progress.nightResults).length > 0 ||
			progress.groceryMoney > 0 ||
			progress.installations.length > 0,
	}
}

function buildEndlessEntries(progress: Progress): EndlessEntryView[] | null {
	if (!endlessUnlocked(progress)) {
		return null
	}
	return endlessMapIds().map(mapId => ({
		mapId,
		mapNameKey: `map.${mapId}.name`,
		map: buildMapShape(mapId),
		best: endlessBest(progress, mapId),
	}))
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
		preview: night === null ? null : buildPreview(night, progress.difficulty),
		endless: buildEndlessEntries(progress),
	}
}
