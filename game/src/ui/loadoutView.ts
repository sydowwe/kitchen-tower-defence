/**
 * Everything the loadout screen is allowed to know: `kitchenView.ts`'s rules for the counter you set
 * out before bed (analytic-docs/DECISIONS.md section 10). Keys and numbers, never English, nothing
 * that holds a reference into the progress it was built from. Components under
 * `ui/components/loadout/` import from here and never from `core/`.
 *
 * **Selection order is the counter's order**, oldest first, because it is what "the oldest makes way"
 * reads. The roster and the night's shop run in `shopOrder` instead, which is why nothing on this
 * screen prints a key badge.
 */

import { currentNight, loadoutSlots, previousLoadout, tonightsLoadout, unlockedTowerIds } from '@/core/campaign.ts'
import { getTowerDef, INSTALLATIONS, LOADOUT_MAX_SLOTS } from '@/core/content/index.ts'
import { addToLoadout, checkLoadout, removeFromLoadout } from '@/core/loadout.ts'
import { buildPreview } from '@/ui/kitchenView.ts'
import { shopOrder, statsFor } from '@/ui/viewModel.ts'
import type { Progress } from '@/core/campaign.ts'
import type { InstallationId, TowerRole } from '@/core/content/index.ts'
import type { LoadoutProblem } from '@/core/loadout.ts'
import type { DefId } from '@/core/types.ts'
import type { NightPreviewView } from '@/ui/kitchenView.ts'
import type { TowerStatsView } from '@/ui/viewModel.ts'

export type { TowerRole } from '@/core/content/index.ts'
export type { LoadoutProblem } from '@/core/loadout.ts'
export type { DefId } from '@/core/types.ts'

/**
 * What the player has chosen so far and not yet started with. Held by `useSessionStore()` and never
 * saved: the loadout is saved by Start, which is `chooseLoadout`.
 */
export interface LoadoutDraft {
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

export interface LoadoutView {
	preview: NightPreviewView
	/** How many towers the counter holds tonight, with the space the player owns. */
	slots: number
	/** The selection, in selection order. */
	counter: CounterTowerView[]
	/** One per unowned counter-space installation, in `INSTALLATIONS` order. `slots + blocked.length` is 8. */
	blocked: BlockedSpaceView[]
	/** Every unlocked tower, in `shopOrder`. */
	roster: RosterTowerView[]
	/** The roles present in `roster`, in the order the roster first reaches them. */
	roles: TowerRole[]
	/** Last night's loadout, or null when there is none or it is what is already on the counter. */
	lastNight: CounterTowerView[] | null
	/** `checkLoadout`'s answer for the selection. Start waits on null. */
	problem: LoadoutProblem | null
}

function counterTower(id: DefId): CounterTowerView {
	const def = getTowerDef(id)
	return { id: def.id, glyph: def.glyph, nameKey: def.nameKey }
}

/** As sets. Taking a tower off and putting it back moves it to the end, and that is the same counter. */
function sameTowers(a: readonly DefId[], b: readonly DefId[]): boolean {
	return a.length === b.length && a.every(id => b.includes(id))
}

/**
 * What the counter shows: the draft, when it is for tonight and could still be played -- or is empty,
 * which is a counter the player cleared and not a stale draft -- and otherwise `tonightsLoadout`.
 *
 * Empty is let through because the draft is the only place a cleared counter is held: refusing it
 * would put the default back the moment the last tower came off.
 */
export function selectionFor(progress: Progress, draft: LoadoutDraft | null): DefId[] {
	if (draft !== null && draft.nightId === progress.nightId) {
		const problem = checkLoadout(draft.towerIds, unlockedTowerIds(progress), loadoutSlots(progress))
		if (problem === null || problem === 'empty') {
			return [...draft.towerIds]
		}
	}
	return tonightsLoadout(progress)
}

/** Takes a chosen tower back off; brings any other one, the oldest making way on a full counter. */
export function toggleTower(progress: Progress, selection: readonly DefId[], id: DefId): DefId[] {
	return selection.includes(id)
		? removeFromLoadout(selection, id)
		: addToLoadout(selection, id, loadoutSlots(progress))
}

/** Null once the campaign is finished: there is no night to set the counter out for. */
export function buildLoadoutView(progress: Progress, selection: readonly DefId[]): LoadoutView | null {
	const night = currentNight(progress)
	if (night === null) {
		return null
	}

	const slots = loadoutSlots(progress)
	const blocked = INSTALLATIONS.filter(
		def => def.effect.kind === 'loadoutSlots' && !progress.installations.includes(def.id),
	).map(def => ({ id: def.id, glyph: def.glyph, nameKey: def.nameKey }))
	if (slots + blocked.length !== LOADOUT_MAX_SLOTS) {
		throw new Error(
			`the counter has ${slots} spaces and ${blocked.length} blocked, which is not ${LOADOUT_MAX_SLOTS}`,
		)
	}

	const unlocked = unlockedTowerIds(progress)
	const tonight = night.unlocksTowerIds ?? []
	const roster = shopOrder()
		.filter(def => unlocked.includes(def.id))
		.map((def): RosterTowerView => ({
			id: def.id,
			glyph: def.glyph,
			nameKey: def.nameKey,
			descriptionKey: def.descriptionKey,
			role: def.role,
			stats: statsFor(def),
			chosen: selection.includes(def.id),
			isNew: tonight.includes(def.id),
		}))

	const previous = previousLoadout(progress)

	return {
		preview: buildPreview(night),
		slots,
		counter: selection.map(counterTower),
		blocked,
		roster,
		roles: [...new Set(roster.map(entry => entry.role))],
		lastNight: previous === null || sameTowers(previous, selection) ? null : previous.map(counterTower),
		problem: checkLoadout(selection, unlocked, slots),
	}
}
