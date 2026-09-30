/**
 * The rules of a campaign: how one night's result, or one purchase, turns a player's progress into
 * the next progress (analytic-docs/DECISIONS.md section 7).
 *
 * **Every function here is pure and returns a new object.** None of them mutates its argument: the
 * store that owns a `Progress` applies a reducer, saves the result and assigns it only once the save
 * succeeded, and that only works if the old progress is still the old progress. Headless, so the
 * balance harness plays a campaign by exactly the rules the game does.
 */

import { getInstallationDef, getNightDef, NIGHTS, resolveModifiers } from '@/core/content/index.ts'
import { checkLoadout } from '@/core/loadout.ts'
import type { NightDef } from '@/core/content/index.ts'
import type { LoadoutProblem } from '@/core/loadout.ts'
import type { DefId, DifficultyId, World } from '@/core/types.ts'
import type { CreateWorldOptions } from '@/core/world.ts'

/** How one night has gone, every time it was played. Statistics beyond this are step 23's. */
export interface NightRecord {
	attempts: number
	wins: number
	bestGroceryMoney: number
}

/**
 * Everything a campaign carries between nights. **Unlocked towers are not on it**: they are derived
 * from `nightId` by `unlockedTowerIds`, so moving a tower's unlock night reaches an old save.
 */
export interface Progress {
	/** The next night to play. Null once the last one is won. */
	nightId: DefId | null
	groceryMoney: number
	installations: DefId[]
	nightResults: Record<DefId, NightRecord>
	difficulty: DifficultyId
	/**
	 * The last loadout chosen for each night, keyed by night id, in selection order. Written only by
	 * `setLoadout`, when a night starts, so a reload, a Retry and the balance harness all rebuild
	 * tonight from progress alone. Read only through `tonightsLoadout` and `previousLoadout`, which
	 * re-check it: a stored loadout is a preference, not a promise.
	 */
	loadouts: Record<DefId, DefId[]>
}

/** What a finished world reports to the campaign. */
export interface NightResult {
	nightId: DefId
	won: boolean
	groceryMoney: number
}

export type BuyInstallationResult = { ok: true; progress: Progress } | { ok: false; reason: 'owned' | 'tooExpensive' }

export type SetLoadoutResult = { ok: true; progress: Progress } | { ok: false; reason: LoadoutProblem }

function firstNight(): NightDef {
	const night = NIGHTS[0]
	if (night === undefined) {
		throw new Error('there are no nights')
	}
	return night
}

export function newProgress(): Progress {
	return {
		nightId: firstNight().id,
		groceryMoney: 0,
		installations: [],
		nightResults: {},
		difficulty: 'normal',
		loadouts: {},
	}
}

/** The night to play next, or null once the campaign is done. */
export function currentNight(progress: Progress): NightDef | null {
	return progress.nightId === null ? null : getNightDef(progress.nightId)
}

/**
 * Every tower unlocked by the current night or any night before it, in the order they unlocked. A
 * finished campaign has them all. The current night's own unlock is included -- it is what that
 * night is played with.
 */
export function unlockedTowerIds(progress: Progress): DefId[] {
	const upTo = currentNight(progress)?.index ?? Infinity
	return NIGHTS.filter(night => night.index <= upTo).flatMap(night => night.unlocksTowerIds ?? [])
}

/** What a finished world paid. Throws while the night is still running: there is nothing to report. */
export function nightResultOf(world: World): NightResult {
	const pay = world.night.pay
	if (pay === null) {
		throw new Error(`night '${world.night.nightId}' has not ended, so it has no result`)
	}
	return { nightId: world.night.nightId, won: world.night.phase === 'won', groceryMoney: pay.total }
}

/** The night after this one in `NIGHTS`' order, or null after the last. */
function nightAfter(nightId: DefId): DefId | null {
	const position = NIGHTS.findIndex(night => night.id === nightId)
	if (position === -1) {
		throw new Error(`unknown night id '${nightId}'`)
	}
	return NIGHTS[position + 1]?.id ?? null
}

/**
 * Pays the result, records it, and moves on **only on a win of the current night**. A loss keeps the
 * night, so the next night's unlock is not granted -- a loss never consumes it. A result for any
 * other night pays and records but moves nothing: the campaign is linear and a won night is not
 * replayed, so Grocery Money cannot be farmed on night 1.
 */
export function applyNightResult(progress: Progress, result: NightResult): Progress {
	const previous = progress.nightResults[result.nightId]
	const record: NightRecord = {
		attempts: (previous?.attempts ?? 0) + 1,
		wins: (previous?.wins ?? 0) + (result.won ? 1 : 0),
		bestGroceryMoney: Math.max(previous?.bestGroceryMoney ?? 0, result.groceryMoney),
	}
	const advances = result.won && result.nightId === progress.nightId

	return {
		...progress,
		nightId: advances ? nightAfter(result.nightId) : progress.nightId,
		groceryMoney: progress.groceryMoney + result.groceryMoney,
		installations: [...progress.installations],
		nightResults: { ...progress.nightResults, [result.nightId]: record },
	}
}

/**
 * Buys one installation with Grocery Money. An unknown id throws, like every lookup; owning it
 * already or not affording it is a refusal the shop can name.
 */
export function buyInstallation(progress: Progress, id: DefId): BuyInstallationResult {
	const def = getInstallationDef(id)
	if (progress.installations.includes(id)) {
		return { ok: false, reason: 'owned' }
	}
	if (progress.groceryMoney < def.cost) {
		return { ok: false, reason: 'tooExpensive' }
	}

	return {
		ok: true,
		progress: {
			...progress,
			groceryMoney: progress.groceryMoney - def.cost,
			installations: [...progress.installations, id],
			nightResults: { ...progress.nightResults },
		},
	}
}

/** How many towers a loadout may hold, with the counter space the player owns. */
export function loadoutSlots(progress: Progress): number {
	return resolveModifiers(progress.installations).loadoutSlots
}

/** The loadout stored for `nightId`, if tonight could still be played with it. */
function legalStoredLoadout(progress: Progress, nightId: DefId): DefId[] | null {
	const stored = progress.loadouts[nightId]
	if (stored === undefined || checkLoadout(stored, unlockedTowerIds(progress), loadoutSlots(progress)) !== null) {
		return null
	}
	return [...stored]
}

/**
 * The loadout chosen for the night before tonight, if it is still a legal one: "last night's". Null
 * on the first night, on a finished campaign, and when nothing was chosen or it no longer fits.
 */
export function previousLoadout(progress: Progress): DefId[] | null {
	const tonight = currentNight(progress)
	const before = tonight === null ? undefined : NIGHTS.find(night => night.index === tonight.index - 1)
	return before === undefined ? null : legalStoredLoadout(progress, before.id)
}

/**
 * What tonight is played with unless the player chooses otherwise, and what the loadout screen
 * preselects: tonight's own stored loadout if it is still legal; else last night's plus tonight's
 * unlocks **while there is room**; else the first towers unlocked, as many as fit. Never empty.
 *
 * A new tower is never swapped in over an old one. The first full counter is the moment the mechanic
 * teaches itself, and a default that dropped the Salt Shaker to make room would make the player's
 * first cut for them.
 */
export function tonightsLoadout(progress: Progress): DefId[] {
	const slots = loadoutSlots(progress)
	const tonight = currentNight(progress)
	const stored = tonight === null ? null : legalStoredLoadout(progress, tonight.id)
	if (stored !== null) {
		return stored
	}

	const previous = previousLoadout(progress)
	if (previous !== null && tonight !== null) {
		const added = (tonight.unlocksTowerIds ?? []).filter(id => !previous.includes(id))
		// `previous` is legal, so it fits, and the slice only ever cuts tonight's unlocks.
		return [...previous, ...added].slice(0, slots)
	}

	return unlockedTowerIds(progress).slice(0, slots)
}

/**
 * Stores the loadout chosen for tonight, replacing any earlier choice for it. Refused with the
 * problem when tonight could not be played with it. Throws on a finished campaign: there is no
 * tonight to choose for.
 */
export function setLoadout(progress: Progress, ids: readonly DefId[]): SetLoadoutResult {
	const nightId = progress.nightId
	if (nightId === null) {
		throw new Error('the campaign is finished; there is no night to choose a loadout for')
	}
	const problem = checkLoadout(ids, unlockedTowerIds(progress), loadoutSlots(progress))
	if (problem !== null) {
		return { ok: false, reason: problem }
	}

	return {
		ok: true,
		progress: {
			...progress,
			installations: [...progress.installations],
			nightResults: { ...progress.nightResults },
			// A new object, never a write into the old one: every progress spread from this one shares it.
			loadouts: { ...progress.loadouts, [nightId]: [...ids] },
		},
	}
}

/**
 * The one translation from progress to a world: tonight's night on its own map, at the campaign's
 * difficulty, with what the player owns folded in and tonight's loadout. The game and the balance
 * harness both build their nights through this, so a save cannot build two different nights.
 *
 * A night nobody chose a loadout for plays the default the loadout screen would have shown.
 */
export function worldOptionsFor(progress: Progress, seed: number): CreateWorldOptions {
	const night = currentNight(progress)
	if (night === null) {
		throw new Error('the campaign is finished; there is no night to play')
	}

	return {
		seed,
		mapId: night.mapId,
		nightId: night.id,
		difficulty: progress.difficulty,
		modifiers: resolveModifiers(progress.installations),
		loadout: tonightsLoadout(progress),
	}
}
