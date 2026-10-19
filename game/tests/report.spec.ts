import { describe, expect, it } from 'vitest'
import { fromCsv, toCsv } from '@/dev/harness/csv.ts'
import { buildReport, flagsOf, incomeTarget } from '@/dev/harness/report.ts'
import { runJob } from '@/dev/harness/run.ts'
import type { Flag, FlagKind } from '@/dev/harness/report.ts'
import type { Row } from '@/dev/harness/types.ts'

/**
 * Step 22C's flag rules, each on synthetic rows at its threshold and one step short of it, and the CSV
 * read back as the report reads it.
 */

function row(overrides: Partial<Row> = {}): Row {
	return {
		mode: 'night',
		night: 'night05',
		nightIndex: 5,
		map: 'sink',
		difficulty: 'normal',
		policy: 'greedy',
		loadoutPolicy: 'default',
		loadout: 'saltShaker|toasterCrumbTray',
		installations: '',
		seed: 1234,
		attempt: 1,
		sweepKnob: null,
		sweepValue: null,
		outcome: 'won',
		ticks: 9000,
		wavesStarted: 9,
		wavesCleared: 9,
		waveCount: 9,
		foodStart: 20,
		foodRemaining: 12,
		crumbsStart: 200,
		crumbsEarned: 900,
		crumbsSpent: 1000,
		crumbsWastedAtSunrise: 100,
		crumbsDropped: 700,
		crumbsCollected: 650,
		crumbsForfeited: 0,
		towersBuilt: 8,
		towersSold: 0,
		towersDestroyed: 0,
		enemiesKilled: 80,
		enemiesLeaked: 4,
		thievesEscaped: 0,
		peakNoise: 12.5,
		wakeCount: 0,
		groceryMoney: 40,
		rosterMeanCost: 80,
		towersAffordablePerWave: 1.25,
		damageTotal: 4000,
		topDamageSource: 'saltShaker',
		topDamageShare: 0.4,
		score: null,
		...overrides,
	}
}

/** `count` rows, seeds from 1234, the first `matching` of them given `then` and the rest `otherwise`. */
function runs(count: number, matching: number, then: Partial<Row>, otherwise: Partial<Row> = {}): Row[] {
	return Array.from({ length: count }, (_, index) =>
		row({ seed: 1234 + index, ...(index < matching ? then : otherwise) }),
	)
}

function ofKind(rows: readonly Row[], kind: FlagKind): Flag[] {
	return flagsOf(rows).filter(flag => flag.kind === kind)
}

describe('too hard', () => {
	it('fires when greedy loses more than 10% of its runs, and not at 10%', () => {
		expect(ofKind(runs(10, 2, { outcome: 'lost' }), 'tooHard')).toHaveLength(1)
		expect(ofKind(runs(10, 1, { outcome: 'lost' }), 'tooHard')).toHaveLength(0)
		expect(ofKind(runs(100, 11, { outcome: 'lost' }), 'tooHard')).toHaveLength(1)
		expect(ofKind(runs(100, 10, { outcome: 'lost' }), 'tooHard')).toHaveLength(0)
	})

	it('counts a stuck campaign night as a loss, reads only greedy, and names the losing seeds', () => {
		const [flag] = ofKind(runs(10, 2, { outcome: 'stuck', mode: 'campaign' }, { mode: 'campaign' }), 'tooHard')
		expect(flag?.numbers).toBe('lost 2 of 10 runs (20%)')
		expect(flag?.runs.map(run => run.seed)).toEqual([1234, 1235])
		expect(flag?.policy).toBe('greedy')
		expect(flag?.nightIndex).toBe(5)
		expect(ofKind(runs(10, 10, { outcome: 'lost', policy: 'casual' }), 'tooHard')).toHaveLength(0)
	})
})

describe('too easy', () => {
	const easy = { policy: 'casual', outcome: 'won', foodRemaining: 15 } as const
	const hard = { policy: 'casual', outcome: 'lost', foodRemaining: 0 } as const

	it('fires when casual keeps 75% of the shelf in 90% of its runs, and not one step short of either', () => {
		expect(ofKind(runs(10, 9, easy, hard), 'tooEasy')).toHaveLength(1)
		expect(ofKind(runs(10, 8, easy, hard), 'tooEasy')).toHaveLength(0)
		// 14 of 20 is 70% of the shelf.
		expect(ofKind(runs(10, 9, { ...easy, foodRemaining: 14 }, hard), 'tooEasy')).toHaveLength(0)
		// Kept the shelf and lost anyway (a stall, say) is not a win.
		expect(ofKind(runs(10, 9, { ...easy, outcome: 'stalled' }, hard), 'tooEasy')).toHaveLength(0)
	})

	it('only on normal and nightmare', () => {
		expect(ofKind(runs(10, 10, { ...easy, difficulty: 'nightmare' }), 'tooEasy')).toHaveLength(1)
		expect(ofKind(runs(10, 10, { ...easy, difficulty: 'cozy' }), 'tooEasy')).toHaveLength(0)
	})
})

describe('dominant', () => {
	const over = { topDamageSource: 'saltShaker', topDamageShare: 0.61 }

	it('fires when one source is above 60% in half the runs, and not at 60% or in one run fewer', () => {
		expect(ofKind(runs(10, 5, over), 'dominant')).toHaveLength(1)
		expect(ofKind(runs(10, 4, over), 'dominant')).toHaveLength(0)
		expect(ofKind(runs(10, 5, { ...over, topDamageShare: 0.6 }), 'dominant')).toHaveLength(0)
	})

	it('reads every policy together, leaving out runs that damaged nothing', () => {
		const rows = [
			...runs(2, 2, { ...over, policy: 'greedy' }),
			...runs(2, 0, {}, { policy: 'casual', topDamageSource: 'lemon', topDamageShare: 0.5 }),
			...runs(6, 0, {}, { policy: 'idle', topDamageSource: null, topDamageShare: null, damageTotal: 0 }),
		]
		const [flag] = ofKind(rows, 'dominant')
		expect(flag?.numbers).toBe('saltShaker did over 60% of the damage in 2 of 4 runs (50%)')
		expect(flag?.policy).toBeNull()
		expect(flag?.runs.map(run => run.policy)).toEqual(['greedy', 'greedy'])
	})
})

describe('lockout', () => {
	function night(winners: readonly string[], loadouts: readonly string[] = ['optimal', 'blind', 'default']): Row[] {
		return loadouts.flatMap(loadoutPolicy =>
			runs(2, 0, {}, { loadoutPolicy, outcome: winners.includes(loadoutPolicy) ? 'won' : 'lost' }),
		)
	}

	it('fires when exactly one of the three wins, and not when two do', () => {
		const [flag] = ofKind(night(['optimal']), 'lockout')
		expect(flag?.loadoutPolicy).toBe('optimal')
		expect(flag?.numbers).toBe('only optimal ever won (wins: optimal 2/2, blind 0/2, default 0/2)')
		expect(ofKind(night(['optimal', 'blind']), 'lockout')).toHaveLength(0)
		// None winning is too hard, not a lockout.
		expect(ofKind(night([]), 'lockout')).toHaveLength(0)
	})

	it('one win in one run is enough to count, and a night missing a loadout policy is not judged', () => {
		const rows = night(['optimal'])
		const blind = rows.find(entry => entry.loadoutPolicy === 'blind')
		if (blind !== undefined) {
			blind.outcome = 'won'
		}
		expect(ofKind(rows, 'lockout')).toHaveLength(0)
		expect(ofKind(night(['optimal'], ['optimal', 'blind']), 'lockout')).toHaveLength(0)
	})
})

describe('stalled or stuck', () => {
	it('fires on any one row, and not on none', () => {
		expect(ofKind(runs(10, 1, { outcome: 'stalled' }), 'stalled')).toHaveLength(1)
		expect(
			ofKind(runs(10, 1, { outcome: 'stuck', mode: 'campaign' }, { mode: 'campaign' }), 'stalled'),
		).toHaveLength(1)
		expect(ofKind(runs(10, 0, {}), 'stalled')).toHaveLength(0)
		expect(ofKind(runs(10, 3, { outcome: 'stalled' }), 'stalled')[0]?.numbers).toBe(
			'3 stalled and 0 stuck of 10 runs',
		)
	})
})

describe('the flags', () => {
	it('keep sweep values and tiers apart', () => {
		const rows = [
			...runs(
				10,
				2,
				{ outcome: 'lost', sweepKnob: 'income', sweepValue: 0.6 },
				{ sweepKnob: 'income', sweepValue: 0.6 },
			),
			...runs(
				10,
				1,
				{ outcome: 'lost', sweepKnob: 'income', sweepValue: 1 },
				{ sweepKnob: 'income', sweepValue: 1 },
			),
		]
		const flags = ofKind(rows, 'tooHard')
		expect(flags.map(flag => flag.sweepValue)).toEqual([0.6])
	})
})

describe('the endless tables', () => {
	/** A lost endless run on `map` that survived `score` waves. */
	function endless(map: string, score: number, overrides: Partial<Row> = {}): Row {
		return row({
			mode: 'endless',
			night: `endless${map}`,
			nightIndex: 19,
			map,
			outcome: 'lost',
			score,
			wavesStarted: score + 1,
			...overrides,
		})
	}

	it('give a table per tier and kitchen, a map to a row, with the median and the spread in each cell', () => {
		const rows = [
			...[2, 3, 4, 5].map((score, at) => endless('counter', score, { seed: 1234 + at })),
			endless('sink', 9),
			endless('sink', 7, { installations: 'a|b|c', seed: 1235 }),
			endless('sink', 6, { difficulty: 'nightmare' }),
		]
		const html = buildReport(rows, 'results.csv')

		expect(html).toContain('id="endless"')
		expect(html).toContain('<h3>normal · no installations</h3>')
		expect(html).toContain('<h3>normal · 3 installations</h3>')
		expect(html).toContain('<h3>nightmare · no installations</h3>')
		// Four scores 2, 3, 4, 5: the median is 3.5, the middle half 2.8-4.3 (interpolated), the extremes 2-5.
		expect(html).toContain(
			'<b>3.5</b><span class="sub">2.8–4.3 middle half · 2–5</span><span class="sub">4 runs</span>',
		)
		expect(html).toContain('<b>9</b>')
	})

	it('count a run that cleared every wave apart, and a run that stalled', () => {
		const html = buildReport(
			[
				endless('counter', 200, { outcome: 'won' }),
				endless('counter', 4, { seed: 1235 }),
				endless('counter', 0, { outcome: 'stalled', score: null, seed: 1236 }),
			],
			'results.csv',
		)

		expect(html).toContain('3 runs · 1 cleared every wave · 1 stalled')
	})

	it("are never read as the campaign's too-hard flag: a run with no end is lost", () => {
		const rows = Array.from({ length: 10 }, (_, at) => endless('counter', 3, { seed: 1234 + at }))

		expect(ofKind(rows, 'tooHard')).toHaveLength(0)
	})
})

describe('the income target', () => {
	it('is 1.5 through Act I and 0.5 at night 18', () => {
		expect(incomeTarget(1)).toBe(1.5)
		expect(incomeTarget(8)).toBe(1.5)
		expect(incomeTarget(13)).toBeCloseTo(1, 12)
		expect(incomeTarget(18)).toBe(0.5)
	})
})

describe('the CSV read back', () => {
	it('is the CSV again, and the report from it has a curve and no script', () => {
		const rows = [
			...runJob({
				kind: 'night',
				nights: ['night01'],
				difficulty: 'normal',
				seed: 1234,
				policy: 'idle',
				loadoutPolicy: 'default',
				installations: [],
				sweep: { knob: 'income', value: 1.2 },
			}),
			row({ loadout: 'a "quoted", list', topDamageSource: null, topDamageShare: null, groceryMoney: null }),
		]
		const csv = toCsv(rows)
		const back = fromCsv(csv)
		expect(toCsv(back)).toBe(csv)
		// Sorted: the unswept row first.
		expect(back[0]?.loadout).toBe('a "quoted", list')
		expect(back[0]?.groceryMoney).toBeNull()
		expect(back[1]?.sweepValue).toBe(1.2)

		const html = buildReport(back, 'results.csv')
		expect(html).toContain('<svg')
		expect(html).not.toContain('<script')
		expect(buildReport(fromCsv(csv), 'results.csv')).toBe(html)
	})

	it('refuses a header that is not the harness columns', () => {
		expect(() => fromCsv('mode,night\nnight,night01\n')).toThrow("not this harness's columns")
	})
})
