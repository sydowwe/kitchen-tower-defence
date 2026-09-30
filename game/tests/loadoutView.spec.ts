import { describe, expect, it } from 'vitest'
import { newProgress, tonightsLoadout } from '@/core/campaign.ts'
import { buildLoadoutView, selectionFor, toggleTower } from '@/ui/loadoutView.ts'
import type { Progress } from '@/core/campaign.ts'
import type { LoadoutView } from '@/ui/loadoutView.ts'

/**
 * The loadout screen's view model. What drifts silently here is a counter that disagrees with the
 * night it starts, a blocked space that is not the installation that clears it, a preset button that
 * does nothing when clicked, and a cleared counter that quietly refills.
 */

/** Night 5's six, in unlock order. */
const NIGHT5_ROSTER = ['saltShaker', 'toasterCrumbTray', 'stickyTape', 'mousetrap', 'cookieJar', 'sprayBottle']
const NIGHT4_COUNTER = ['saltShaker', 'toasterCrumbTray', 'stickyTape', 'mousetrap', 'cookieJar']

function progressAt(nightId: string | null, overrides: Partial<Progress> = {}): Progress {
	return { ...newProgress(), nightId, ...overrides }
}

function viewOf(progress: Progress, selection: string[] = tonightsLoadout(progress)): LoadoutView {
	const view = buildLoadoutView(progress, selection)
	if (view === null) {
		throw new Error('no loadout view for a finished campaign')
	}
	return view
}

describe('the counter on night 5', () => {
	it('with nothing owned: six in the cupboard, five out, the Spray Bottle new and left out', () => {
		const progress = progressAt('night05')
		const view = viewOf(progress)

		expect(view.roster.map(entry => entry.id)).toEqual(NIGHT5_ROSTER)
		expect(view.counter.map(tower => tower.id)).toEqual(tonightsLoadout(progress))
		expect(view.counter.map(tower => tower.id)).toEqual(NIGHT4_COUNTER)

		const spray = view.roster.find(entry => entry.id === 'sprayBottle')
		expect(spray?.isNew).toBe(true)
		expect(spray?.chosen).toBe(false)
		expect(view.roster.filter(entry => entry.isNew)).toHaveLength(1)
		expect(view.roster.filter(entry => entry.chosen)).toHaveLength(5)

		expect(view.slots).toBe(5)
		expect(view.blocked.map(space => space.id)).toEqual([
			'clearTheDryingRack',
			'takeTheToasterOffTheCounter',
			'secondShelf',
		])
		expect(view.problem).toBeNull()
	})

	it('with the Drying Rack: six spaces, two blocked, and the Spray Bottle out by default', () => {
		const view = viewOf(progressAt('night05', { installations: ['clearTheDryingRack'] }))

		expect(view.slots).toBe(6)
		expect(view.blocked.map(space => space.id)).toEqual(['takeTheToasterOffTheCounter', 'secondShelf'])
		expect(view.counter.map(tower => tower.id)).toEqual(NIGHT5_ROSTER)
		expect(view.roster.find(entry => entry.id === 'sprayBottle')?.chosen).toBe(true)
	})

	it('names the roles on the roster once each, in the order the roster reaches them', () => {
		const view = viewOf(progressAt('night05'))

		// Salt Shaker, Crumb Tray, Sticky Tape, Mousetrap, Cookie Jar, Spray Bottle.
		expect(view.roles).toEqual(['BASIC_DPS', 'ECONOMY', 'CONTROL', 'BURST_DPS', 'DOT'])
	})

	it('has no view once the campaign is finished', () => {
		expect(buildLoadoutView(progressAt(null), [])).toBeNull()
	})
})

describe('toggleTower', () => {
	const progress = progressAt('night05')

	it('puts a sixth tower on a five-space counter by taking the oldest off', () => {
		const next = toggleTower(progress, NIGHT4_COUNTER, 'sprayBottle')

		expect(next).toEqual(['toasterCrumbTray', 'stickyTape', 'mousetrap', 'cookieJar', 'sprayBottle'])
		expect(viewOf(progress, next).roster.find(entry => entry.id === 'saltShaker')?.chosen).toBe(false)
	})

	it('takes a chosen tower back off, and leaves the rest in order', () => {
		expect(toggleTower(progress, NIGHT4_COUNTER, 'stickyTape')).toEqual([
			'saltShaker',
			'toasterCrumbTray',
			'mousetrap',
			'cookieJar',
		])
	})

	it("leaves 'empty' once every tower is off", () => {
		const cleared = NIGHT4_COUNTER.reduce<string[]>((ids, id) => toggleTower(progress, ids, id), NIGHT4_COUNTER)
		const view = viewOf(progress, cleared)

		expect(cleared).toEqual([])
		expect(view.counter).toEqual([])
		expect(view.problem).toBe('empty')
	})
})

describe('selectionFor', () => {
	const progress = progressAt('night05')

	it('prefers a legal draft for tonight, in its own order', () => {
		const towerIds = ['sprayBottle', 'saltShaker']
		expect(selectionFor(progress, { nightId: 'night05', towerIds })).toEqual(towerIds)
	})

	it('keeps a cleared counter cleared, rather than putting the default back', () => {
		expect(selectionFor(progress, { nightId: 'night05', towerIds: [] })).toEqual([])
	})

	it('ignores a draft for another night', () => {
		expect(selectionFor(progress, { nightId: 'night04', towerIds: ['saltShaker'] })).toEqual(NIGHT4_COUNTER)
	})

	it('ignores a draft naming a tower that is not unlocked yet', () => {
		expect(selectionFor(progress, { nightId: 'night05', towerIds: ['saltShaker', 'fan'] })).toEqual(NIGHT4_COUNTER)
	})

	it('ignores a draft that no longer fits the counter', () => {
		// Six towers, drafted with the Drying Rack owned, after a reset took it away.
		expect(selectionFor(progress, { nightId: 'night05', towerIds: NIGHT5_ROSTER })).toEqual(NIGHT4_COUNTER)
	})

	it('reads no draft as the default', () => {
		expect(selectionFor(progress, null)).toEqual(tonightsLoadout(progress))
	})
})

describe("last night's", () => {
	it('is null with nothing stored for last night', () => {
		expect(viewOf(progressAt('night05')).lastNight).toBeNull()
	})

	it('is null when the counter holds the same towers in another order', () => {
		const progress = progressAt('night05', { loadouts: { night04: NIGHT4_COUNTER } })
		const reordered = ['cookieJar', 'saltShaker', 'toasterCrumbTray', 'stickyTape', 'mousetrap']

		expect(viewOf(progress).lastNight).toBeNull()
		expect(viewOf(progress, reordered).lastNight).toBeNull()
	})

	it('is last night, in its order, once the counter differs', () => {
		const progress = progressAt('night05', { loadouts: { night04: NIGHT4_COUNTER } })
		const swapped = toggleTower(progress, NIGHT4_COUNTER, 'sprayBottle')

		expect(viewOf(progress, swapped).lastNight?.map(tower => tower.id)).toEqual(NIGHT4_COUNTER)
	})
})
