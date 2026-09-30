/**
 * The rules of a campaign: how one night's result, or one purchase, turns a player's progress into
 * the next progress (analytic-docs/DECISIONS.md section 7).
 *
 * **Every function here is pure and returns a new object.** None of them mutates its argument: the
 * store that owns a `Progress` applies a reducer, saves the result and assigns it only once the save
 * succeeded, and that only works if the old progress is still the old progress. Headless, so the
 * balance harness plays a campaign by exactly the rules the game does.
 */

import {
	ENDLESS_NIGHTS,
	getInstallationDef,
	getNightDef,
	isEndlessNightId,
	NIGHTS,
	resolveModifiers,
} from '@/core/content/index.ts'
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
	/**
	 * The tiers the campaign has been won on, in the order they were first cleared, no repeats. A
	 * lifetime record: `startCampaign` keeps it, and only `resetProgress`'s fresh progress drops it.
	 */
	cleared: DifficultyId[]
	/** The most endless waves survived, per tier and then per map id. Kept like `cleared`. */
	endlessBests: Partial<Record<DifficultyId, Record<DefId, number>>>
}

/** What a finished world reports to the campaign. */
export interface NightResult {
	nightId: DefId
	won: boolean
	groceryMoney: number
}

/** What a finished endless run reports: how far it got, where, and on which tier. */
export interface EndlessResult {
	mapId: DefId
	difficulty: DifficultyId
	waves: number
}

export type BuyInstallationResult = { ok: true; progress: Progress } | { ok: false; reason: 'owned' | 'tooExpensive' }

export type SetLoadoutResult = { ok: true; progress: Progress } | { ok: false; reason: LoadoutProblem }

export type StartCampaignResult = { ok: true; progress: Progress } | { ok: false; reason: 'locked' }

/** The tiers, easiest first. Each one above `STARTING_TIER` opens on a clear of the one below it. */
export const DIFFICULTY_LADDER: readonly DifficultyId[] = ['cozy', 'normal', 'nightmare']

/** What a new player's campaign is played on. It and every tier below it are open from the start. */
const STARTING_TIER: DifficultyId = 'normal'

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
		difficulty: STARTING_TIER,
		loadouts: {},
		cleared: [],
		endlessBests: {},
	}
}

/** Two levels deep: every progress in the store's history shares these records until one is copied. */
function copyBests(bests: Progress['endlessBests']): Progress['endlessBests'] {
	return Object.fromEntries(Object.entries(bests).map(([tier, byMap]) => [tier, { ...byMap }]))
}

/** Whether a campaign may be started on `tier`. */
export function tierUnlocked(progress: Progress, tier: DifficultyId): boolean {
	const position = DIFFICULTY_LADDER.indexOf(tier)
	if (position <= DIFFICULTY_LADDER.indexOf(STARTING_TIER)) {
		return true
	}
	const below = DIFFICULTY_LADDER[position - 1]
	return below !== undefined && progress.cleared.includes(below)
}

/**
 * A new campaign on `tier`: night 1 with an empty kitchen, keeping only the lifetime record. A tier
 * belongs to one campaign (analytic-docs/OPEN-QUESTIONS.md section 2), so installations, Grocery Money,
 * results and loadouts all go -- carried over, they would make the next tier easier than this one.
 */
export function startCampaign(progress: Progress, tier: DifficultyId): StartCampaignResult {
	if (!tierUnlocked(progress, tier)) {
		return { ok: false, reason: 'locked' }
	}
	return {
		ok: true,
		progress: {
			...newProgress(),
			difficulty: tier,
			cleared: [...progress.cleared],
			endlessBests: copyBests(progress.endlessBests),
		},
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
 * replayed, so Grocery Money cannot be farmed on night 1. The win that moves past the last night
 * clears the campaign's tier.
 *
 * Throws on a night that is not a campaign night. An endless run recorded here would pay, and write a
 * result the next load reads as corrupt: it goes through `applyEndlessResult`.
 */
export function applyNightResult(progress: Progress, result: NightResult): Progress {
	if (!NIGHTS.some(night => night.id === result.nightId)) {
		throw new Error(`'${result.nightId}' is not a campaign night, so it has no night result`)
	}
	const previous = progress.nightResults[result.nightId]
	const record: NightRecord = {
		attempts: (previous?.attempts ?? 0) + 1,
		wins: (previous?.wins ?? 0) + (result.won ? 1 : 0),
		bestGroceryMoney: Math.max(previous?.bestGroceryMoney ?? 0, result.groceryMoney),
	}
	const advances = result.won && result.nightId === progress.nightId
	const nightId = advances ? nightAfter(result.nightId) : progress.nightId
	const clears = advances && nightId === null && !progress.cleared.includes(progress.difficulty)

	return {
		...progress,
		nightId,
		groceryMoney: progress.groceryMoney + result.groceryMoney,
		installations: [...progress.installations],
		nightResults: { ...progress.nightResults, [result.nightId]: record },
		cleared: clears ? [...progress.cleared, progress.difficulty] : [...progress.cleared],
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

// --- endless -----------------------------------------------------------------------------------------
// A run is played at the current campaign's tier, with its installations and every tower a campaign
// night unlocks, and pays no Grocery Money: a mode with no end paying the campaign's currency would be
// the farm `applyNightResult` refuses. Opened for life by the first clear, on every map.

/** Whether endless may be played: once any tier has been cleared, for good. */
export function endlessUnlocked(progress: Progress): boolean {
	return progress.cleared.length > 0
}

/** The maps an endless run can be played on, in `MAPS` order. */
export function endlessMapIds(): DefId[] {
	return ENDLESS_NIGHTS.map(night => night.mapId)
}

/** Every tower a campaign night unlocks, in unlock order: what an endless loadout chooses from. */
export function endlessTowerIds(): DefId[] {
	return NIGHTS.flatMap(night => night.unlocksTowerIds ?? [])
}

/** The endless night on `mapId`. Throws on a map with none, like every lookup. */
function endlessNightOn(mapId: DefId): NightDef {
	const night = ENDLESS_NIGHTS.find(entry => entry.mapId === mapId)
	if (night === undefined) {
		throw new Error(`there is no endless run on map '${mapId}'`)
	}
	return night
}

/** The loadout stored under `key`, if an endless run could be played with it. */
function legalEndlessLoadout(progress: Progress, key: DefId): DefId[] | null {
	const stored = progress.loadouts[key]
	if (stored === undefined || checkLoadout(stored, endlessTowerIds(), loadoutSlots(progress)) !== null) {
		return null
	}
	return [...stored]
}

/**
 * What a run on `mapId` is played with unless the player chooses otherwise: the map's own stored
 * loadout if it is still legal; else night 18's, the counter the campaign was finished with; else the
 * first endless towers, as many as fit. Stored in `loadouts` under the map's endless night id.
 */
export function endlessLoadout(progress: Progress, mapId: DefId): DefId[] {
	const lastNight = NIGHTS[NIGHTS.length - 1]
	return (
		legalEndlessLoadout(progress, endlessNightOn(mapId).id) ??
		(lastNight === undefined ? null : legalEndlessLoadout(progress, lastNight.id)) ??
		endlessTowerIds().slice(0, loadoutSlots(progress))
	)
}

/**
 * Stores the loadout chosen for a run on `mapId`, whatever night the campaign is on. Refused with the
 * problem when a run could not be played with it. Throws while endless is locked: there is no run to
 * choose for.
 */
export function setEndlessLoadout(progress: Progress, mapId: DefId, ids: readonly DefId[]): SetLoadoutResult {
	const nightId = endlessNightOn(mapId).id
	if (!endlessUnlocked(progress)) {
		throw new Error('endless is locked until a tier is cleared; there is no run to choose a loadout for')
	}
	const problem = checkLoadout(ids, endlessTowerIds(), loadoutSlots(progress))
	if (problem !== null) {
		return { ok: false, reason: problem }
	}

	return {
		ok: true,
		progress: {
			...progress,
			installations: [...progress.installations],
			nightResults: { ...progress.nightResults },
			loadouts: { ...progress.loadouts, [nightId]: [...ids] },
			cleared: [...progress.cleared],
		},
	}
}

/** The most waves survived on `mapId` at the campaign's current tier, or null for no run yet. */
export function endlessBest(progress: Progress, mapId: DefId): number | null {
	return progress.endlessBests[progress.difficulty]?.[mapId] ?? null
}

/**
 * `worldOptionsFor` for an endless run: the map's endless night, at the campaign's tier, with its
 * installations and `endlessLoadout`. Throws while endless is locked, and on a map with no run.
 */
export function worldOptionsForEndless(progress: Progress, mapId: DefId, seed: number): CreateWorldOptions {
	const night = endlessNightOn(mapId)
	if (!endlessUnlocked(progress)) {
		throw new Error('endless is locked until a tier is cleared')
	}

	return {
		seed,
		mapId: night.mapId,
		nightId: night.id,
		difficulty: progress.difficulty,
		modifiers: resolveModifiers(progress.installations),
		loadout: endlessLoadout(progress, mapId),
	}
}

/** The waves a night got through: the wave that ended a won night counts, the one that lost it doesn't. */
export function wavesSurvivedOf(world: World): number {
	return world.night.phase === 'won' ? world.night.waveIndex + 1 : world.night.waveIndex
}

/** What a finished endless run scored. Throws while it is still running, and for a campaign night. */
export function endlessResultOf(world: World): EndlessResult {
	const { nightId, phase } = world.night
	if (!isEndlessNightId(nightId)) {
		throw new Error(`'${nightId}' is a campaign night, not an endless run`)
	}
	if (phase !== 'won' && phase !== 'lost') {
		throw new Error(`the endless run '${nightId}' has not ended, so it has no result`)
	}
	return { mapId: world.map.id, difficulty: world.difficulty.id, waves: wavesSurvivedOf(world) }
}

/** Keeps the better of the stored best and this run, under the run's own tier and map. Nothing else moves. */
export function applyEndlessResult(progress: Progress, result: EndlessResult): Progress {
	// Throws on a map with no run: a best for it would be dropped by the next load anyway.
	endlessNightOn(result.mapId)
	const bests = copyBests(progress.endlessBests)
	const tier = bests[result.difficulty] ?? {}
	tier[result.mapId] = Math.max(tier[result.mapId] ?? 0, result.waves)
	bests[result.difficulty] = tier

	return {
		...progress,
		installations: [...progress.installations],
		nightResults: { ...progress.nightResults },
		cleared: [...progress.cleared],
		endlessBests: bests,
	}
}
