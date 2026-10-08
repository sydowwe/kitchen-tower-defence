import { describe, expect, it } from 'vitest'
import { endlessLoadout, endlessTowerIds, newProgress, tonightsLoadout } from '@/core/campaign.ts'
import { getNightDef } from '@/core/content/index.ts'
import {
	buildLoadoutView,
	buildRunLoadoutView,
	hasRun,
	runSelectionFor,
	selectionFor,
	toggleTower,
} from '@/ui/loadoutView.ts'
import { shopOrder } from '@/ui/viewModel.ts'
import type { Progress } from '@/core/campaign.ts'
import type { LoadoutView, RunLoadoutView } from '@/ui/loadoutView.ts'

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

describe("a long night's counter", () => {
	/** A finished Normal campaign: endless open, nothing bought. */
	const finished = progressAt(null, { cleared: ['normal'] })
	const ALL_SPACE = ['clearTheDryingRack', 'takeTheToasterOffTheCounter', 'secondShelf']

	function runViewOf(progress: Progress, mapId = 'pantry', selection?: string[]): RunLoadoutView {
		const view = buildRunLoadoutView(progress, mapId, selection ?? runSelectionFor(progress, mapId, null))
		if (view === null) {
			throw new Error(`no long night on '${mapId}'`)
		}
		return view
	}

	it('rosters every tower a campaign night unlocks, in shop order, none of them new', () => {
		const view = runViewOf(finished)

		expect(endlessTowerIds()).toHaveLength(19)
		expect(view.roster).toHaveLength(19)
		expect(view.roster.map(entry => entry.id)).toEqual(
			shopOrder()
				.map(def => def.id)
				.filter(id => endlessTowerIds().includes(id)),
		)
		expect(view.roster.filter(entry => entry.isNew)).toEqual([])
	})

	it('holds five with nothing owned, and eight with all three counter-space installations', () => {
		const bare = runViewOf(finished)
		expect(bare.slots).toBe(5)
		expect(bare.blocked).toHaveLength(3)
		expect(bare.counter.map(tower => tower.id)).toEqual(endlessTowerIds().slice(0, 5))
		expect(bare.problem).toBeNull()

		const roomy = runViewOf({ ...finished, installations: ALL_SPACE })
		expect(roomy.slots).toBe(8)
		expect(roomy.blocked).toEqual([])
		expect(roomy.counter).toHaveLength(8)
	})

	it("keeps a draft under the map's own night id, and the counter keys its draft the same way", () => {
		const towerIds = ['lemon', 'fan', 'saltShaker']
		expect(runSelectionFor(finished, 'pantry', { nightId: 'endlessPantry', towerIds })).toEqual(towerIds)
		expect(runSelectionFor(finished, 'pantry', { nightId: 'endlessPantry', towerIds: [] })).toEqual([])
		expect(runViewOf(finished, 'pantry', towerIds).draftNightId).toBe('endlessPantry')
	})

	it("ignores another map's draft, and tonight's", () => {
		const fallback = endlessLoadout(finished, 'pantry')
		const towerIds = ['lemon', 'fan']

		expect(runSelectionFor(finished, 'pantry', { nightId: 'endlessSink', towerIds })).toEqual(fallback)
		expect(runSelectionFor(finished, 'pantry', { nightId: 'night18', towerIds })).toEqual(fallback)
	})

	it('names every enemy in the pool once, from the wave it first comes in, and counts none', () => {
		const night = getNightDef('endlessPantry')
		const enemies = runViewOf(finished).run.enemies
		const pool = [...new Set(night.waves.flatMap(wave => wave.entries.map(entry => entry.enemyDefId)))]

		expect(enemies.map(enemy => enemy.id)).toEqual(pool)
		expect(new Set(enemies.map(enemy => enemy.id)).size).toBe(enemies.length)
		expect(enemies[0]?.firstWave).toBe(1)
		for (const enemy of enemies) {
			expect(enemy).not.toHaveProperty('count')
			const first = night.waves.findIndex(wave => wave.entries.some(entry => entry.enemyDefId === enemy.id))
			expect(enemy.firstWave, enemy.id).toBe(first + 1)
		}
	})

	it("carries the map and this tier's best", () => {
		const run = runViewOf({ ...finished, endlessBests: { normal: { pantry: 31 }, cozy: { pantry: 60 } } }).run

		expect(run.mapId).toBe('pantry')
		expect(run.mapNameKey).toBe('map.pantry.name')
		expect(run.best).toBe(31)
		expect(runViewOf(finished, 'sink').run.best).toBeNull()
	})

	it('has no view while endless is locked, nor for a map with no long night', () => {
		expect(buildRunLoadoutView(progressAt('night05'), 'pantry', [])).toBeNull()
		expect(buildRunLoadoutView(finished, 'attic', [])).toBeNull()
	})

	it('says there is no run on a hand-typed map before anything throws on it', () => {
		expect(hasRun(finished, 'pantry')).toBe(true)
		expect(hasRun(progressAt('night05'), 'pantry')).toBe(false)
		expect(hasRun(finished, 'attic')).toBe(false)
		// What the screen would have called without asking: it throws, which is why it asks.
		expect(() => runSelectionFor(finished, 'attic', null)).toThrow("no endless run on map 'attic'")
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
