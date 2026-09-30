import { describe, expect, it } from 'vitest'
import {
	applyNightResult,
	buyInstallation,
	currentNight,
	loadoutSlots,
	newProgress,
	nightResultOf,
	previousLoadout,
	setLoadout,
	tonightsLoadout,
	unlockedTowerIds,
	worldOptionsFor,
} from '@/core/campaign.ts'
import { getInstallationDef, NIGHTS, resolveModifiers, TOWERS } from '@/core/content/index.ts'
import { groceryMoneyFor } from '@/core/systems/scoring.ts'
import { createWorld } from '@/core/world.ts'
import type { NightResult, Progress } from '@/core/campaign.ts'

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

/** Freezes every object and array reachable from `value`, so a write anywhere throws. */
function deepFreeze<T>(value: T): T {
	if (typeof value === 'object' && value !== null) {
		for (const child of Object.values(value)) {
			deepFreeze(child)
		}
		Object.freeze(value)
	}
	return value
}

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
