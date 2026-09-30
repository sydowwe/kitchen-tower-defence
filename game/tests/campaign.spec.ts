import { describe, expect, it } from 'vitest'
import {
	applyEndlessResult,
	applyNightResult,
	buyInstallation,
	currentNight,
	DIFFICULTY_LADDER,
	endlessBest,
	endlessLoadout,
	endlessMapIds,
	endlessResultOf,
	endlessTowerIds,
	endlessUnlocked,
	loadoutSlots,
	newProgress,
	nightResultOf,
	previousLoadout,
	setEndlessLoadout,
	setLoadout,
	startCampaign,
	tierUnlocked,
	tonightsLoadout,
	unlockedTowerIds,
	wavesSurvivedOf,
	worldOptionsFor,
	worldOptionsForEndless,
} from '@/core/campaign.ts'
import { getInstallationDef, MAPS, NIGHTS, resolveModifiers, TOWERS } from '@/core/content/index.ts'
import { groceryMoneyFor } from '@/core/systems/scoring.ts'
import { createWorld } from '@/core/world.ts'
import type { NightResult, Progress } from '@/core/campaign.ts'
import type { DifficultyId } from '@/core/types.ts'
import { deepFreeze } from './fixtures/freeze.ts'

/**
 * The campaign's rules as pure functions: a result or a purchase in, a new progress out, the old one
 * untouched. Nothing here is saved or drawn.
 */

function progressAt(nightId: string | null, overrides: Partial<Progress> = {}): Progress {
	return { ...newProgress(), nightId, ...overrides }
}

function result(nightId: string, won: boolean, groceryMoney: number): NightResult {
	return { nightId, won, groceryMoney }
}

/** A campaign on `tier` played to night 18 and won there: the real path to a clear. */
function clearedOn(tier: DifficultyId, overrides: Partial<Progress> = {}): Progress {
	return applyNightResult(progressAt('night18', { difficulty: tier, ...overrides }), result('night18', true, 300))
}

const FIRST_FIVE = ['saltShaker', 'toasterCrumbTray', 'stickyTape', 'mousetrap', 'cookieJar']

describe('a new campaign', () => {
	it('starts on night 1 with nothing, on normal', () => {
		const progress = newProgress()

		expect(progress).toEqual({
			nightId: 'night01',
			groceryMoney: 0,
			installations: [],
			nightResults: {},
			difficulty: 'normal',
			loadouts: {},
			cleared: [],
			endlessBests: {},
		})
		expect(currentNight(progress)?.index).toBe(1)
		expect(unlockedTowerIds(progress)).toEqual(['saltShaker', 'toasterCrumbTray'])
	})
})

describe('applyNightResult', () => {
	it('pays a loss but keeps the night, so the next unlock is not granted', () => {
		const before = progressAt('night03', { groceryMoney: 100 })
		const unlockedBefore = unlockedTowerIds(before)

		const after = applyNightResult(before, result('night03', false, 42))

		expect(after.groceryMoney).toBe(142)
		expect(after.nightId).toBe('night03')
		expect(unlockedTowerIds(after)).toEqual(unlockedBefore)
		expect(unlockedTowerIds(after)).toEqual(['saltShaker', 'toasterCrumbTray', 'stickyTape', 'mousetrap'])
		expect(after.nightResults['night03']).toEqual({ attempts: 1, wins: 0, bestGroceryMoney: 42 })
	})

	it('moves a win on to the next night and unlocks its tower', () => {
		const after = applyNightResult(progressAt('night03'), result('night03', true, 200))

		expect(after.nightId).toBe('night04')
		expect(after.groceryMoney).toBe(200)
		expect(unlockedTowerIds(after)).toContain('cookieJar')
		expect(unlockedTowerIds(after)).toHaveLength(5)
		expect(after.nightResults['night03']).toEqual({ attempts: 1, wins: 1, bestGroceryMoney: 200 })
	})

	it('adds to a night’s record: attempts, wins, and the best pay rather than the last', () => {
		let progress = progressAt('night03')
		progress = applyNightResult(progress, result('night03', false, 60))
		progress = applyNightResult(progress, result('night03', false, 30))
		progress = applyNightResult(progress, result('night03', true, 250))

		expect(progress.nightResults['night03']).toEqual({ attempts: 3, wins: 1, bestGroceryMoney: 250 })
		expect(progress.groceryMoney).toBe(340)
		expect(progress.nightId).toBe('night04')
	})

	it('finishes the campaign on a win of night 18, with all nineteen towers unlocked', () => {
		const after = applyNightResult(progressAt('night18'), result('night18', true, 300))

		expect(after.nightId).toBeNull()
		expect(currentNight(after)).toBeNull()
		expect(unlockedTowerIds(after)).toHaveLength(19)
		expect([...unlockedTowerIds(after)].sort()).toEqual(TOWERS.map((def): string => def.id).sort())
	})

	it('pays and records a win of some other night, but does not move', () => {
		const after = applyNightResult(progressAt('night05'), result('night01', true, 80))

		expect(after.nightId).toBe('night05')
		expect(after.groceryMoney).toBe(80)
		expect(after.nightResults['night01']).toEqual({ attempts: 1, wins: 1, bestGroceryMoney: 80 })
	})
})

describe('buyInstallation', () => {
	const broom = getInstallationDef('buyABroom')

	it('deducts exactly the cost and adds the installation', () => {
		const bought = buyInstallation(progressAt('night02', { groceryMoney: 150 }), 'buyABroom')

		expect(bought.ok).toBe(true)
		if (bought.ok) {
			expect(broom.cost).toBe(110)
			expect(bought.progress.groceryMoney).toBe(40)
			expect(bought.progress.installations).toEqual(['buyABroom'])
		}
	})

	it('buys with exactly the cost in hand, down to 0 and never below', () => {
		const bought = buyInstallation(progressAt('night02', { groceryMoney: 110 }), 'buyABroom')

		expect(bought.ok && bought.progress.groceryMoney).toBe(0)
	})

	it('refuses one it cannot afford, by a dollar', () => {
		expect(buyInstallation(progressAt('night02', { groceryMoney: 109 }), 'buyABroom')).toEqual({
			ok: false,
			reason: 'tooExpensive',
		})
	})

	it('refuses one already owned, whatever the wallet says', () => {
		const progress = progressAt('night02', { groceryMoney: 10_000, installations: ['buyABroom'] })

		expect(buyInstallation(progress, 'buyABroom')).toEqual({ ok: false, reason: 'owned' })
	})

	it('throws on an unknown id', () => {
		expect(() => buyInstallation(newProgress(), 'buyABroooom')).toThrow(/buyABroooom/)
	})
})

describe('purity', () => {
	it('returns a new progress from every reducer run on a deep-frozen one, and throws nothing', () => {
		const frozen = deepFreeze(
			progressAt('night03', {
				groceryMoney: 500,
				installations: ['oilTheHinges'],
				nightResults: { night02: { attempts: 1, wins: 1, bestGroceryMoney: 90 } },
				loadouts: { night02: ['saltShaker', 'stickyTape'], night03: ['mousetrap'] },
			}),
		)
		const snapshot = JSON.parse(JSON.stringify(frozen)) as Progress

		const lost = applyNightResult(frozen, result('night03', false, 40))
		const won = applyNightResult(frozen, result('night03', true, 200))
		const bought = buyInstallation(frozen, 'buyABroom')
		const owned = buyInstallation(frozen, 'oilTheHinges')
		const chosen = setLoadout(frozen, ['saltShaker', 'mousetrap'])
		const refused = setLoadout(frozen, [])

		for (const next of [lost, won, bought.ok ? bought.progress : null, chosen.ok ? chosen.progress : null]) {
			expect(next).not.toBeNull()
			expect(next).not.toBe(frozen)
			expect(next?.nightResults).not.toBe(frozen.nightResults)
			expect(next?.installations).not.toBe(frozen.installations)
		}
		expect(chosen.ok && chosen.progress.loadouts).not.toBe(frozen.loadouts)
		expect(chosen.ok && chosen.progress.loadouts).toEqual({
			night02: ['saltShaker', 'stickyTape'],
			night03: ['saltShaker', 'mousetrap'],
		})
		expect(owned).toEqual({ ok: false, reason: 'owned' })
		expect(refused).toEqual({ ok: false, reason: 'empty' })
		expect(frozen).toEqual(snapshot)

		expect(() => unlockedTowerIds(frozen)).not.toThrow()
		expect(() => tonightsLoadout(frozen)).not.toThrow()
		expect(() => previousLoadout(frozen)).not.toThrow()
		expect(() => worldOptionsFor(frozen, 1)).not.toThrow()
	})

	it('holds for the lifetime record’s reducers, which copy the bests two levels deep', () => {
		const frozen = deepFreeze(
			progressAt('night03', {
				installations: ['oilTheHinges'],
				nightResults: { night02: { attempts: 1, wins: 1, bestGroceryMoney: 90 } },
				loadouts: { endlessSink: ['fan'] },
				cleared: ['normal'],
				endlessBests: { normal: { sink: 12, counter: 4 }, cozy: { sink: 30 } },
			}),
		)
		const snapshot = JSON.parse(JSON.stringify(frozen)) as Progress

		const started = startCampaign(frozen, 'nightmare')
		const chosen = setEndlessLoadout(frozen, 'sink', ['saltShaker', 'fan'])
		const better = applyEndlessResult(frozen, { mapId: 'sink', difficulty: 'normal', waves: 20 })
		const worse = applyEndlessResult(frozen, { mapId: 'pantry', difficulty: 'nightmare', waves: 3 })

		expect(started.ok).toBe(true)
		expect(chosen.ok).toBe(true)
		for (const next of [started.ok ? started.progress : null, chosen.ok ? chosen.progress : null, better, worse]) {
			expect(next).not.toBeNull()
			expect(next).not.toBe(frozen)
			expect(next?.cleared).not.toBe(frozen.cleared)
		}
		for (const next of [started.ok ? started.progress : null, better, worse]) {
			expect(next?.endlessBests).not.toBe(frozen.endlessBests)
			expect(next?.endlessBests.normal).not.toBe(frozen.endlessBests.normal)
			expect(next?.endlessBests.cozy).not.toBe(frozen.endlessBests.cozy)
		}
		expect(better.endlessBests).toEqual({ normal: { sink: 20, counter: 4 }, cozy: { sink: 30 } })
		expect(worse.endlessBests).toEqual({
			normal: { sink: 12, counter: 4 },
			cozy: { sink: 30 },
			nightmare: { pantry: 3 },
		})
		expect(chosen.ok && chosen.progress.loadouts).toEqual({ endlessSink: ['saltShaker', 'fan'] })
		expect(frozen).toEqual(snapshot)

		expect(() => endlessLoadout(frozen, 'sink')).not.toThrow()
		expect(() => worldOptionsForEndless(frozen, 'sink', 1)).not.toThrow()
	})
})

describe('the ladder', () => {
	it('is cozy, normal, nightmare', () => {
		expect(DIFFICULTY_LADDER).toEqual(['cozy', 'normal', 'nightmare'])
	})

	it('lets a fresh progress start Cozy and Normal, and refuses Nightmare as locked', () => {
		const fresh = newProgress()

		expect(tierUnlocked(fresh, 'cozy')).toBe(true)
		expect(tierUnlocked(fresh, 'normal')).toBe(true)
		expect(tierUnlocked(fresh, 'nightmare')).toBe(false)
		expect(startCampaign(fresh, 'cozy').ok).toBe(true)
		expect(startCampaign(fresh, 'normal').ok).toBe(true)
		expect(startCampaign(fresh, 'nightmare')).toEqual({ ok: false, reason: 'locked' })
	})

	it('opens Nightmare on a Normal clear, and a Cozy clear opens nothing new', () => {
		expect(tierUnlocked(clearedOn('normal'), 'nightmare')).toBe(true)
		expect(startCampaign(clearedOn('normal'), 'nightmare').ok).toBe(true)

		const cozy = clearedOn('cozy')
		expect(cozy.cleared).toEqual(['cozy'])
		expect(DIFFICULTY_LADDER.filter(tier => tierUnlocked(cozy, tier))).toEqual(['cozy', 'normal'])
		expect(startCampaign(cozy, 'nightmare')).toEqual({ ok: false, reason: 'locked' })
	})
})

describe('a clear', () => {
	it('is recorded by winning night 18, once, and never by a loss', () => {
		const won = clearedOn('normal')
		expect(won.nightId).toBeNull()
		expect(won.cleared).toEqual(['normal'])

		const lost = applyNightResult(progressAt('night18'), result('night18', false, 120))
		expect(lost.cleared).toEqual([])

		// A second Normal campaign, won again: still one entry.
		const again = clearedOn('normal', { cleared: won.cleared })
		expect(again.cleared).toEqual(['normal'])

		// A later night won on a finished campaign moves nothing, so it clears nothing either.
		const replay = applyNightResult(progressAt(null, { difficulty: 'nightmare' }), result('night18', true, 50))
		expect(replay.cleared).toEqual([])
	})

	it('keeps the order tiers were cleared in', () => {
		const normal = clearedOn('normal')
		const nightmare = clearedOn('nightmare', { cleared: normal.cleared })
		const cozy = clearedOn('cozy', { cleared: nightmare.cleared })

		expect(cozy.cleared).toEqual(['normal', 'nightmare', 'cozy'])
	})

	it('throws on an endless night rather than paying for it or recording it', () => {
		expect(() => applyNightResult(clearedOn('normal'), result('endlessSink', false, 0))).toThrow(/endlessSink/)
		expect(() => applyNightResult(newProgress(), result('night99', true, 0))).toThrow(/night99/)
	})
})

describe('startCampaign', () => {
	it('keeps the lifetime record and nothing else', () => {
		const chosen = setEndlessLoadout(clearedOn('normal'), 'sink', ['fan', 'saltShaker'])
		if (!chosen.ok) {
			throw new Error(`the endless loadout was refused: ${chosen.reason}`)
		}
		const before = applyEndlessResult(
			{
				...chosen.progress,
				groceryMoney: 480,
				installations: ['buyABroom', 'clearTheDryingRack'],
				loadouts: { ...chosen.progress.loadouts, night18: ['saltShaker'] },
			},
			{ mapId: 'sink', difficulty: 'normal', waves: 23 },
		)

		const started = startCampaign(before, 'nightmare')

		expect(started).toEqual({
			ok: true,
			progress: {
				nightId: 'night01',
				groceryMoney: 0,
				installations: [],
				nightResults: {},
				difficulty: 'nightmare',
				loadouts: {},
				cleared: ['normal'],
				endlessBests: { normal: { sink: 23 } },
			},
		})
	})
})

describe('endless', () => {
	it('is locked before a clear, open after it, and still open after a new campaign', () => {
		expect(endlessUnlocked(newProgress())).toBe(false)
		expect(endlessUnlocked(progressAt('night18'))).toBe(false)

		const cleared = clearedOn('normal')
		expect(endlessUnlocked(cleared)).toBe(true)

		const started = startCampaign(cleared, 'nightmare')
		expect(started.ok && endlessUnlocked(started.progress)).toBe(true)
	})

	it('is played on every map, in MAPS order, with all nineteen towers', () => {
		expect(endlessMapIds()).toEqual(MAPS.map(map => map.id))
		expect(endlessMapIds()).toHaveLength(6)
		expect(endlessTowerIds()).toEqual(unlockedTowerIds(progressAt(null)))
		expect([...endlessTowerIds()].sort()).toEqual(TOWERS.map((def): string => def.id).sort())
	})

	it('builds a run on the map’s endless night with the campaign’s tier, installations and loadout', () => {
		const started = startCampaign(clearedOn('normal'), 'nightmare')
		if (!started.ok) {
			throw new Error('nightmare stayed locked after a normal clear')
		}
		const progress: Progress = { ...started.progress, nightId: 'night07', installations: ['buyABroom'] }
		const world = createWorld(worldOptionsForEndless(progress, 'sink', 91))

		expect(world.seed).toBe(91)
		expect(world.night.nightId).toBe('endlessSink')
		expect(world.map.id).toBe('sink')
		expect(world.difficulty.id).toBe('nightmare')
		expect(world.modifiers).toEqual(resolveModifiers(['buyABroom']))
		expect(world.night.loadout).toEqual(endlessLoadout(progress, 'sink'))
		expect(world.night.loadout).toEqual(FIRST_FIVE)
	})

	it('throws while locked, and for a map with no run', () => {
		expect(() => worldOptionsForEndless(newProgress(), 'sink', 1)).toThrow(/locked/)
		expect(() => worldOptionsForEndless(clearedOn('normal'), 'atticMap', 1)).toThrow(/atticMap/)
		expect(() => setEndlessLoadout(newProgress(), 'sink', ['saltShaker'])).toThrow(/locked/)
	})
})

describe('the endless loadout', () => {
	it('is the stored one when it is legal, whatever night the campaign is on', () => {
		const started = startCampaign(clearedOn('normal'), 'normal')
		if (!started.ok) {
			throw new Error('normal was refused')
		}
		const chosen = setEndlessLoadout(started.progress, 'pantry', ['fan', 'honeyPot', 'saltShaker'])

		expect(chosen.ok).toBe(true)
		if (chosen.ok) {
			expect(chosen.progress.nightId).toBe('night01')
			expect(chosen.progress.loadouts).toEqual({ endlessPantry: ['fan', 'honeyPot', 'saltShaker'] })
			expect(endlessLoadout(chosen.progress, 'pantry')).toEqual(['fan', 'honeyPot', 'saltShaker'])
			// Stored per map: the Sink has none of its own.
			expect(endlessLoadout(chosen.progress, 'sink')).toEqual(FIRST_FIVE)
		}
	})

	it('is night 18’s after a campaign, with nothing stored for the map', () => {
		const eighteen = ['fan', 'sprayBottle', 'saltShaker', 'honeyPot', 'mousetrap']
		const chosen = setLoadout(progressAt('night18'), eighteen)
		if (!chosen.ok) {
			throw new Error(`night 18's loadout was refused: ${chosen.reason}`)
		}
		const cleared = applyNightResult(chosen.progress, result('night18', true, 300))

		expect(endlessLoadout(cleared, 'stove')).toEqual(eighteen)
	})

	it('is the first five endless towers, fresh, and when what is stored no longer fits', () => {
		expect(endlessLoadout(newProgress(), 'sink')).toEqual(FIRST_FIVE)
		const six = ['saltShaker', 'toasterCrumbTray', 'stickyTape', 'mousetrap', 'cookieJar', 'fan']
		expect(
			endlessLoadout(progressAt(null, { cleared: ['normal'], loadouts: { endlessSink: six } }), 'sink'),
		).toEqual(FIRST_FIVE)
	})

	it('refuses what a run could not be played with', () => {
		const cleared = clearedOn('normal')

		expect(setEndlessLoadout(cleared, 'sink', [])).toEqual({ ok: false, reason: 'empty' })
		expect(setEndlessLoadout(cleared, 'sink', ['goldenToaster'])).toEqual({ ok: false, reason: 'notUnlocked' })
		expect(setEndlessLoadout(cleared, 'sink', [...FIRST_FIVE, 'fan'])).toEqual({ ok: false, reason: 'tooMany' })
	})
})

describe('an endless result', () => {
	function lostRun(waveIndex: number): ReturnType<typeof createWorld> {
		const world = createWorld(worldOptionsForEndless(clearedOn('normal'), 'table', 5))
		world.night.waveIndex = waveIndex
		world.night.phase = 'lost'
		return world
	}

	it('is the waves survived: a run lost at wave index 7 is 7', () => {
		const world = lostRun(7)

		expect(wavesSurvivedOf(world)).toBe(7)
		expect(endlessResultOf(world)).toEqual({ mapId: 'table', difficulty: 'normal', waves: 7 })
	})

	it('throws while the run is still going, and for a campaign night', () => {
		const running = createWorld(worldOptionsForEndless(clearedOn('normal'), 'table', 5))
		expect(() => endlessResultOf(running)).toThrow(/endlessTable/)

		const campaign = createWorld(worldOptionsFor(newProgress(), 1))
		campaign.night.phase = 'lost'
		expect(() => endlessResultOf(campaign)).toThrow(/night01/)
	})

	it('replaces a lower best, leaves a higher one alone, and only under its own tier', () => {
		let progress = applyEndlessResult(clearedOn('normal'), { mapId: 'sink', difficulty: 'normal', waves: 14 })
		expect(endlessBest(progress, 'sink')).toBe(14)
		expect(endlessBest(progress, 'pantry')).toBeNull()

		progress = applyEndlessResult(progress, { mapId: 'sink', difficulty: 'normal', waves: 9 })
		expect(endlessBest(progress, 'sink')).toBe(14)

		progress = applyEndlessResult(progress, { mapId: 'sink', difficulty: 'normal', waves: 21 })
		expect(endlessBest(progress, 'sink')).toBe(21)

		progress = applyEndlessResult(progress, { mapId: 'sink', difficulty: 'cozy', waves: 40 })
		expect(progress.endlessBests).toEqual({ normal: { sink: 21 }, cozy: { sink: 40 } })
		expect(endlessBest(progress, 'sink')).toBe(21)
		expect(endlessBest({ ...progress, difficulty: 'cozy' }, 'sink')).toBe(40)
		expect(endlessBest({ ...progress, difficulty: 'nightmare' }, 'sink')).toBeNull()
	})

	it('moves nothing else and pays nothing', () => {
		const before = clearedOn('normal', { groceryMoney: 75, installations: ['buyABroom'] })
		const after = applyEndlessResult(before, { mapId: 'floor', difficulty: 'normal', waves: 6 })

		expect({ ...after, endlessBests: before.endlessBests }).toEqual(before)
	})
})

describe('nightResultOf', () => {
	it('throws while the night is still running', () => {
		const world = createWorld(worldOptionsFor(newProgress(), 1))

		expect(() => nightResultOf(world)).toThrow(/night01/)
	})

	it('reports the stored pay of a finished night', () => {
		const world = createWorld(worldOptionsFor(newProgress(), 1))
		world.night.phase = 'lost'
		world.night.pay = groceryMoneyFor(world)

		expect(nightResultOf(world)).toEqual({ nightId: 'night01', won: false, groceryMoney: world.night.pay.total })
	})
})

describe('worldOptionsFor', () => {
	it('builds tonight’s world with the broom’s sweep and tonight’s loadout', () => {
		const progress = progressAt('night04', { installations: ['buyABroom'], difficulty: 'nightmare' })
		const world = createWorld(worldOptionsFor(progress, 77))

		expect(world.seed).toBe(77)
		expect(world.night.nightId).toBe('night04')
		expect(world.map.id).toBe(NIGHTS[3]?.mapId)
		expect(world.difficulty.id).toBe('nightmare')
		expect(world.modifiers.sweepRadiusTiles).toBe(1.5)
		expect(world.modifiers).toEqual(resolveModifiers(['buyABroom']))
		expect(world.night.loadout).toEqual(tonightsLoadout(progress))
		expect(world.night.loadout).toEqual(['saltShaker', 'toasterCrumbTray', 'stickyTape', 'mousetrap', 'cookieJar'])
	})

	it('builds with a stored loadout, in the order it was chosen', () => {
		const progress = progressAt('night04', { loadouts: { night04: ['cookieJar', 'saltShaker'] } })

		expect(createWorld(worldOptionsFor(progress, 1)).night.loadout).toEqual(['cookieJar', 'saltShaker'])
	})

	it('falls back to the default, rather than throwing, on a stored loadout naming a tower from a later night', () => {
		// Only a content change moving the Fan's unlock could have stored this.
		const progress = progressAt('night03', { loadouts: { night03: ['saltShaker', 'fan'] } })

		expect(createWorld(worldOptionsFor(progress, 1)).night.loadout).toEqual(unlockedTowerIds(progress))
	})

	it('throws for a finished campaign: there is no night to build', () => {
		expect(() => worldOptionsFor(progressAt(null), 1)).toThrow()
	})
})

describe('loadoutSlots', () => {
	it('is 5 with nothing owned, and one more per counter-space installation', () => {
		expect(loadoutSlots(newProgress())).toBe(5)
		expect(loadoutSlots(progressAt('night05', { installations: ['clearTheDryingRack', 'buyABroom'] }))).toBe(6)
		expect(
			loadoutSlots(
				progressAt('night05', {
					installations: ['clearTheDryingRack', 'takeTheToasterOffTheCounter', 'secondShelf'],
				}),
			),
		).toBe(8)
	})
})

describe('tonightsLoadout', () => {
	it('is every unlocked tower on nights 1 to 4, which fit, and night 4 fills all five slots', () => {
		const sizes = ['night01', 'night02', 'night03', 'night04'].map(nightId => {
			const progress = progressAt(nightId)
			const unlocked = unlockedTowerIds(progress)
			expect(unlocked.length).toBeLessThanOrEqual(5)
			expect(tonightsLoadout(progress)).toEqual(unlocked)
			return unlocked.length
		})

		expect(sizes).toEqual([2, 3, 4, 5])
	})

	it('is five of six on night 5, the first cut: the Spray Bottle waits, and nothing was dropped for it', () => {
		const fresh = progressAt('night05')
		expect(unlockedTowerIds(fresh)).toHaveLength(6)
		expect(tonightsLoadout(fresh)).toEqual([
			'saltShaker',
			'toasterCrumbTray',
			'stickyTape',
			'mousetrap',
			'cookieJar',
		])

		// Coming from a full night-4 counter: last night's five, and the new tower is not swapped in.
		const five = ['cookieJar', 'mousetrap', 'saltShaker', 'stickyTape', 'toasterCrumbTray']
		const afterNight4 = progressAt('night05', { loadouts: { night04: five } })
		expect(tonightsLoadout(afterNight4)).toEqual(five)
		expect(tonightsLoadout(afterNight4)).not.toContain('sprayBottle')
	})

	it('adds tonight’s unlock to last night’s when there is room', () => {
		const withRack = progressAt('night05', {
			installations: ['clearTheDryingRack'],
			loadouts: { night04: ['cookieJar', 'mousetrap'] },
		})

		expect(tonightsLoadout(withRack)).toEqual(['cookieJar', 'mousetrap', 'sprayBottle'])
	})

	it('preselects the same three, in the same order, on a retry after a loss', () => {
		const three = ['mousetrap', 'saltShaker', 'stickyTape']
		const chosen = setLoadout(progressAt('night03'), three)
		if (!chosen.ok) {
			throw new Error(`three of night 3's four were refused: ${chosen.reason}`)
		}

		const lost = applyNightResult(chosen.progress, result('night03', false, 30))
		expect(lost.nightId).toBe('night03')
		expect(tonightsLoadout(lost)).toEqual(three)

		const won = applyNightResult(chosen.progress, result('night03', true, 200))
		expect(won.nightId).toBe('night04')
		expect(previousLoadout(won)).toEqual(three)
		expect(tonightsLoadout(won)).toEqual([...three, 'cookieJar'])
	})
})

describe('previousLoadout', () => {
	it('is null on night 1, with nothing stored, and for a stored loadout that no longer fits', () => {
		expect(previousLoadout(newProgress())).toBeNull()
		expect(previousLoadout(progressAt('night04'))).toBeNull()
		expect(previousLoadout(progressAt('night04', { loadouts: { night03: ['saltShaker', 'fan'] } }))).toBeNull()
	})

	it('reads the night one below tonight’s, never tonight’s own or an older one', () => {
		const progress = progressAt('night04', {
			loadouts: { night02: ['stickyTape'], night03: ['mousetrap'], night04: ['cookieJar'] },
		})

		expect(previousLoadout(progress)).toEqual(['mousetrap'])
	})
})

describe('setLoadout', () => {
	it('stores the loadout for tonight and leaves every other night’s', () => {
		const set = setLoadout(progressAt('night05', { loadouts: { night04: ['saltShaker'] } }), ['sprayBottle'])

		expect(set.ok && set.progress.loadouts).toEqual({ night04: ['saltShaker'], night05: ['sprayBottle'] })
	})

	it('refuses six on five slots and takes them on six', () => {
		const six = ['saltShaker', 'toasterCrumbTray', 'stickyTape', 'mousetrap', 'cookieJar', 'sprayBottle']

		expect(setLoadout(progressAt('night05'), six)).toEqual({ ok: false, reason: 'tooMany' })
		expect(setLoadout(progressAt('night05', { installations: ['clearTheDryingRack'] }), six).ok).toBe(true)
	})

	it('refuses a tower from a later night', () => {
		expect(setLoadout(progressAt('night03'), ['saltShaker', 'cookieJar'])).toEqual({
			ok: false,
			reason: 'notUnlocked',
		})
	})

	it('throws for a finished campaign: there is no tonight to choose for', () => {
		expect(() => setLoadout(progressAt(null), ['saltShaker'])).toThrow()
	})
})
