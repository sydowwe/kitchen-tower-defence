/**
 * Everything the loadout screen is allowed to know: `kitchenView.ts`'s rules for the counter you set
 * out before bed (analytic-docs/DECISIONS.md section 10). Keys and numbers, never English, nothing
 * that holds a reference into the progress it was built from. Components under
 * `ui/components/loadout/` import from here and never from `core/`.
 *
 * **Selection order is the counter's order**, oldest first, because it is what "the oldest makes way"
 * reads. The roster and the night's shop run in `shopOrder` instead, which is why nothing on this
 * screen prints a key badge.
 *
 * Two screens share the counter: tonight's night, and a long night on one map. Each has its own
 * builder and its own selection; `toggleTower` serves both, because the room on the counter is the
 * player's whichever night it is set out for.
 */

import {
	currentNight,
	endlessBest,
	endlessLoadout,
	endlessMapIds,
	endlessTowerIds,
	endlessUnlocked,
	loadoutSlots,
	previousLoadout,
	tonightsLoadout,
	unlockedTowerIds,
} from '@/core/campaign.ts'
import { endlessNightId, getNightDef, getTowerDef, INSTALLATIONS, LOADOUT_MAX_SLOTS } from '@/core/content/index.ts'
import { addToLoadout, checkLoadout, removeFromLoadout } from '@/core/loadout.ts'
import { buildMapShape, buildPreview, poolOf } from '@/ui/kitchenView.ts'
import { shopOrder, statsFor } from '@/ui/viewModel.ts'
import type { Progress } from '@/core/campaign.ts'
import type { InstallationId, TowerRole } from '@/core/content/index.ts'
import type { LoadoutProblem } from '@/core/loadout.ts'
import type { DefId } from '@/core/types.ts'
import type { EnemyEntryView, MapShapeView, NightPreviewView } from '@/ui/kitchenView.ts'
import type { TowerStatsView } from '@/ui/viewModel.ts'

export type { TowerRole } from '@/core/content/index.ts'
export type { LoadoutProblem } from '@/core/loadout.ts'
export type { DefId } from '@/core/types.ts'

/**
 * What the player has chosen so far and not yet started with. Held by `useSessionStore()` and never
 * saved: the loadout is saved by Start, which is `chooseLoadout` or `chooseEndlessLoadout`.
 */
export interface LoadoutDraft {
	/** The night it is for: tonight's id, or the map's endless night id for a long night. */
	nightId: DefId
	towerIds: DefId[]
}

/** A tower standing on the counter. */
export interface CounterTowerView {
	id: DefId
	glyph: string
	nameKey: string
}

/** A space the counter would have if this installation were bought. Its glyph is not a tower's. */
export interface BlockedSpaceView {
	id: InstallationId
	glyph: string
	nameKey: string
}

export interface RosterTowerView {
	id: DefId
	glyph: string
	nameKey: string
	descriptionKey: string
	role: TowerRole
	stats: TowerStatsView
	/** On the counter now. */
	chosen: boolean
	/** Tonight unlocks it. Marked whether or not it is chosen: the default never brings it in over another. */
	isNew: boolean
}

/** The counter and the cupboard, which both screens draw the same way. */
export interface CounterView {
	/** The id a draft of this counter is kept under. */
	draftNightId: DefId
	/** How many towers the counter holds tonight, with the space the player owns. */
	slots: number
	/** The selection, in selection order. */
	counter: CounterTowerView[]
	/** One per unowned counter-space installation, in `INSTALLATIONS` order. `slots + blocked.length` is 8. */
	blocked: BlockedSpaceView[]
	/** Every tower the night can be played with, in `shopOrder`. */
	roster: RosterTowerView[]
	/** The roles present in `roster`, in the order the roster first reaches them. */
	roles: TowerRole[]
	/** `checkLoadout`'s answer for the selection. Start waits on null. */
	problem: LoadoutProblem | null
}

export interface LoadoutView extends CounterView {
	preview: NightPreviewView
	/** Last night's loadout, or null when there is none or it is what is already on the counter. */
	lastNight: CounterTowerView[] | null
}

/** A long night on one map, as its counter screen describes it. */
export interface RunPreviewView {
	mapId: DefId
	mapNameKey: string
	map: MapShapeView
	/** The most waves got through on this map at the campaign's tier, or null for no run yet. */
	best: number | null
	/** Every enemy the run sends, once each, where it first comes in. No counts: see `poolOf`. */
	enemies: EnemyEntryView[]
}

/** No "last night's" preset: `endlessLoadout` already falls back to night 18's counter. */
export interface RunLoadoutView extends CounterView {
	run: RunPreviewView
}

function counterTower(id: DefId): CounterTowerView {
	const def = getTowerDef(id)
	return { id: def.id, glyph: def.glyph, nameKey: def.nameKey }
}

/** As sets. Taking a tower off and putting it back moves it to the end, and that is the same counter. */
function sameTowers(a: readonly DefId[], b: readonly DefId[]): boolean {
	return a.length === b.length && a.every(id => b.includes(id))
}

/** A draft for `nightId` that could still be played with `available` -- or is empty: see `selectionFor`. */
function keptDraft(
	progress: Progress,
	draft: LoadoutDraft | null,
	nightId: DefId,
	available: readonly DefId[],
): DefId[] | null {
	if (draft === null || draft.nightId !== nightId) {
		return null
	}
	const problem = checkLoadout(draft.towerIds, available, loadoutSlots(progress))
	return problem === null || problem === 'empty' ? [...draft.towerIds] : null
}

/**
 * What the counter shows: the draft, when it is for tonight and could still be played -- or is empty,
 * which is a counter the player cleared and not a stale draft -- and otherwise `tonightsLoadout`.
 *
 * Empty is let through because the draft is the only place a cleared counter is held: refusing it
 * would put the default back the moment the last tower came off.
 */
export function selectionFor(progress: Progress, draft: LoadoutDraft | null): DefId[] {
	const nightId = progress.nightId
	const kept = nightId === null ? null : keptDraft(progress, draft, nightId, unlockedTowerIds(progress))
	return kept ?? tonightsLoadout(progress)
}

/**
 * Whether there is a long night to set out for on `mapId`: endless is open, and the map has one. The
 * screen asks this before anything else, because `endlessLoadout` throws on a map with no run, and a
 * hand-typed URL is exactly such a map.
 */
export function hasRun(progress: Progress, mapId: DefId): boolean {
	return endlessUnlocked(progress) && endlessMapIds().includes(mapId)
}

/**
 * `selectionFor` for a long night on `mapId`: a draft kept under the map's endless night id, else
 * `endlessLoadout`. A draft for any other night -- tonight's, or another map's -- is not this one.
 * Throws on a map with no run, like `endlessLoadout`: ask `hasRun` first.
 */
export function runSelectionFor(progress: Progress, mapId: DefId, draft: LoadoutDraft | null): DefId[] {
	return keptDraft(progress, draft, endlessNightId(mapId), endlessTowerIds()) ?? endlessLoadout(progress, mapId)
}

/** Takes a chosen tower back off; brings any other one, the oldest making way on a full counter. */
export function toggleTower(progress: Progress, selection: readonly DefId[], id: DefId): DefId[] {
	return selection.includes(id)
		? removeFromLoadout(selection, id)
		: addToLoadout(selection, id, loadoutSlots(progress))
}

/** The counter and the cupboard, for a night played with `available` that brings `newIds` new. */
function buildCounterView(
	progress: Progress,
	draftNightId: DefId,
	available: readonly DefId[],
	newIds: readonly DefId[],
	selection: readonly DefId[],
): CounterView {
	const slots = loadoutSlots(progress)
	const blocked = INSTALLATIONS.filter(
		def => def.effect.kind === 'loadoutSlots' && !progress.installations.includes(def.id),
	).map(def => ({ id: def.id, glyph: def.glyph, nameKey: def.nameKey }))
	if (slots + blocked.length !== LOADOUT_MAX_SLOTS) {
		throw new Error(
			`the counter has ${slots} spaces and ${blocked.length} blocked, which is not ${LOADOUT_MAX_SLOTS}`,
		)
	}

	const roster = shopOrder()
		.filter(def => available.includes(def.id))
		.map((def): RosterTowerView => ({
			id: def.id,
			glyph: def.glyph,
			nameKey: def.nameKey,
			descriptionKey: def.descriptionKey,
			role: def.role,
			stats: statsFor(def),
			chosen: selection.includes(def.id),
			isNew: newIds.includes(def.id),
		}))

	return {
		draftNightId,
		slots,
		counter: selection.map(counterTower),
		blocked,
		roster,
		roles: [...new Set(roster.map(entry => entry.role))],
		problem: checkLoadout(selection, available, slots),
	}
}

/** Null once the campaign is finished: there is no night to set the counter out for. */
export function buildLoadoutView(progress: Progress, selection: readonly DefId[]): LoadoutView | null {
	const night = currentNight(progress)
	if (night === null) {
		return null
	}

	const previous = previousLoadout(progress)

	return {
		...buildCounterView(progress, night.id, unlockedTowerIds(progress), night.unlocksTowerIds ?? [], selection),
		preview: buildPreview(night, progress.difficulty),
		lastNight: previous === null || sameTowers(previous, selection) ? null : previous.map(counterTower),
	}
}

/**
 * The counter for a long night on `mapId`: every tower a campaign night unlocks, none of them new.
 * Null while endless is locked, and for a map with no long night -- there is no run to set out for.
 */
export function buildRunLoadoutView(
	progress: Progress,
	mapId: DefId,
	selection: readonly DefId[],
): RunLoadoutView | null {
	if (!hasRun(progress, mapId)) {
		return null
	}

	const nightId = endlessNightId(mapId)

	return {
		...buildCounterView(progress, nightId, endlessTowerIds(), [], selection),
		run: {
			mapId,
			mapNameKey: `map.${mapId}.name`,
			map: buildMapShape(mapId),
			best: endlessBest(progress, mapId),
			enemies: poolOf(getNightDef(nightId)),
		},
	}
}
