import { describe, expect, it } from 'vitest'
import { ENDLESS_WAVE_COUNT, endlessNightId, getInstallationDef, getNightDef } from '@/core/content/index.ts'
import { endlessMapIds, newProgress, worldOptionsFor, worldOptionsForEndless } from '@/core/campaign.ts'
import { createCommandQueue } from '@/core/commands.ts'
import { tick } from '@/core/sim.ts'
import { waveEntryCount } from '@/core/systems/spawn.ts'
import { createWorld } from '@/core/world.ts'
import { fromCsv, toCsv } from '@/dev/harness/csv.ts'
import { defaultLoadout } from '@/dev/harness/loadouts.ts'
import { greedy } from '@/dev/harness/policies/greedy.ts'
import { idle } from '@/dev/harness/policies/idle.ts'
import {
	ENDLESS_MAX_TICKS,
	MAX_NIGHT_TICKS,
	replayNight,
	runCampaign,
	runEndless,
	runJob,
	runNight,
} from '@/dev/harness/run.ts'
import { runShard } from '@/dev/harness/shard.ts'
import { scripted } from './fixtures/scriptedPolicy.ts'
import type { Progress } from '@/core/campaign.ts'
import type { NightDef } from '@/core/content/index.ts'
import type { DefId, World } from '@/core/types.ts'
import type { Job, LoadoutPolicy } from '@/dev/harness/types.ts'

/**
 * The harness's determinism, which step 22C's parallel runs and 22D's tuning stand on: the same jobs
 * give the same bytes in any order, a night's log replays to the same world, and a night's clock is
 * the one its def schedules.
 */

function nightJob(overrides: Partial<Job> = {}): Job {
	return {
		kind: 'night',
		nights: ['night01'],
		difficulty: 'normal',
		seed: 1234,
		policy: 'idle',
		loadoutPolicy: 'default',
		installations: [],
		sweep: null,
		...overrides,
	}
}

describe('the CSV', () => {
	it('is byte-identical for the same jobs run twice, and for the same jobs in reverse', () => {
		const jobs: Job[] = []
		for (const difficulty of ['cozy', 'normal', 'nightmare'] as const) {
			for (const nightId of ['night01', 'night04', 'night10']) {
				for (const seed of [1234, 1235]) {
					jobs.push(nightJob({ nights: [nightId], difficulty, seed }))
				}
			}
		}
		jobs.push(nightJob({ kind: 'campaign', nights: ['night03'] }))

		const first = toCsv(jobs.flatMap(runJob))
		const again = toCsv(jobs.flatMap(runJob))
		const reversed = toCsv([...jobs].reverse().flatMap(runJob))

		expect(again).toBe(first)
		expect(reversed).toBe(first)
		// A header and one row a night job, one for the campaign that stuck on night 1.
		expect(first.trimEnd().split('\n')).toHaveLength(1 + 18 + 1)
		// Nineteen jobs, twice. Passes alone, past vitest's 5s default with the suite running beside it.
	}, 30_000)

	it('sorts by difficulty and then night, whatever order the jobs ran in', () => {
		const csv = toCsv(
			[
				nightJob({ nights: ['night02'], difficulty: 'nightmare' }),
				nightJob({ nights: ['night02'] }),
				nightJob({ nights: ['night01'], difficulty: 'nightmare' }),
				nightJob({ nights: ['night01'] }),
			].flatMap(runJob),
		)
		const keys = csv
			.trimEnd()
			.split('\n')
			.slice(1)
			.map(line => line.split(',').slice(1, 5).join(' '))

		expect(keys).toEqual([
			'night01 1 counter normal',
			'night02 2 counter normal',
			'night01 1 counter nightmare',
			'night02 2 counter nightmare',
		])
	})
})

describe('replay', () => {
	it('rebuilds the world a night ended on from its options and its logged commands', () => {
		for (const nightId of ['night01', 'night05']) {
			const policy = scripted({
				towers: ['saltShaker', 'toasterCrumbTray', 'saltShaker'],
				upgradeFrom: 1200,
				sellFrom: 2400,
				callEarly: true,
			})
			const run = runNight({ ...newProgress(), nightId }, 1234, policy, defaultLoadout)

			const kinds = new Set(run.log.map(entry => entry.command.kind))
			expect([...kinds].sort()).toEqual([
				'CallWaveEarly',
				'CollectCrumb',
				'PlaceTower',
				'SellTower',
				'UpgradeTower',
			])
			expect(replayNight(run.options, undefined, run.log)).toEqual(run.world)
		}
		// Four whole nights. Two seconds alone, past vitest's 5s default with the suite running beside it.
	}, 30_000)

	it('names the tower that did the most damage, by def', () => {
		const run = runNight(newProgress(), 1234, scripted(), defaultLoadout)

		expect(run.row.towersBuilt).toBeGreaterThan(1)
		expect(run.row.topDamageSource).toBe('saltShaker')
		expect(run.row.topDamageShare).toBe(1)
		expect(run.row.damageTotal).toBeGreaterThan(0)
	})
})

/**
 * The tick each wave of `night` starts on, for a night nobody calls early and no Cookie Jar holds open.
 *
 * The opening countdown runs out on tick `countdown - 1`: `waveSystem` decrements on tick 0. A wave
 * started on tick `s` spawns nothing that tick, because `spawn` runs before `wave`, so a cursor's first
 * enemy comes on `max(s + 1, s + delay)` and each later one on its schedule or the tick after the last,
 * whichever is later. On the tick the last one spawns `wave` arms the countdown, and the next wave
 * starts that many ticks later.
 */
function scheduleOf(world: World, night: NightDef): number[] {
	const starts: number[] = []
	let start = Math.max(1, night.waves[0]?.countdownTicks ?? 1) - 1
	const lanes = world.map.paths.length

	night.waves.forEach((wave, index) => {
		starts.push(start)
		let lastSpawn = start
		for (const entry of wave.entries) {
			const count = waveEntryCount(entry.count, world.difficulty, world.modifiers)
			const perLane = entry.pathId === undefined ? Math.ceil(count / lanes) : count
			let spawned = start
			for (let k = 0; k < perLane; k++) {
				spawned = Math.max(
					k === 0 ? start + 1 : spawned + 1,
					start + entry.startDelayTicks + k * entry.spacingTicks,
				)
			}
			lastSpawn = Math.max(lastSpawn, spawned)
		}
		if (index < night.waves.length - 1) {
			start = lastSpawn + Math.max(1, wave.countdownTicks)
		}
	})

	return starts
}

describe('the wave schedule', () => {
	it('starts every wave of an idle night 1 on the tick its def schedules', () => {
		const progress = newProgress()
		const world = createWorld(worldOptionsFor(progress, 1234))
		const queue = createCommandQueue()
		const started: number[] = []

		while (world.night.phase !== 'won' && world.night.phase !== 'lost') {
			tick(world, queue)
			for (const event of world.events) {
				if (event.kind === 'waveStarted') {
					// The tick it happened on: `world.tick` counts completed ticks.
					started.push(world.tick - 1)
				}
			}
		}

		const schedule = scheduleOf(world, getNightDef('night01'))
		// Six seconds of opening, ending on tick 359.
		expect(schedule[0]).toBe(359)
		expect(started.length).toBeGreaterThanOrEqual(4)
		expect(started).toEqual(schedule.slice(0, started.length))

		const run = runNight(progress, 1234, idle, defaultLoadout)
		expect(run.row.wavesStarted).toBe(started.length)
		expect(run.row.ticks).toBe(world.tick)
		expect(run.row.ticks).toBe(run.world.tick)
	})
})

describe('a stall', () => {
	it('is a row, with no Grocery Money, and no throw', () => {
		const [row] = runJob(nightJob({ maxTicks: 1000 }))

		expect(row?.outcome).toBe('stalled')
		expect(row?.ticks).toBe(1000)
		expect(row?.groceryMoney).toBeNull()
		expect(toCsv(row === undefined ? [] : [row]).split('\n')[1]).toMatch(/,stalled,1000,.*,0\.000,0,,62\.500,/)
	})

	it('ends a campaign', () => {
		const rows = runJob(nightJob({ kind: 'campaign', nights: ['night03'], maxTicks: 1000 }))

		expect(rows.map(row => [row.night, row.outcome])).toEqual([['night01', 'stalled']])
	})
})

/** Asks for `picks` in turn, then keeps answering the last one. State on the object, never the module. */
function loadoutsInTurn(...picks: DefId[][]): LoadoutPolicy {
	let asked = 0
	return {
		name: 'inTurn',
		choose() {
			const pick = picks[Math.min(asked, picks.length - 1)] ?? null
			asked++
			return pick
		},
	}
}

function endlessJob(overrides: Partial<Job> = {}): Job {
	return {
		kind: 'endless',
		nights: ['counter', 'sink'],
		difficulty: 'normal',
		seed: 1234,
		policy: 'greedy',
		loadoutPolicy: 'optimal',
		installations: [],
		sweep: null,
		...overrides,
	}
}

describe('an endless job', () => {
	it('gives a row a map, scored by the game and not recomputed, and the same CSV twice and reversed', () => {
		const jobs = [endlessJob(), endlessJob({ difficulty: 'nightmare', nights: ['stove'] })]

		const rows = jobs.flatMap(runJob)
		expect(rows.map(row => [row.mode, row.night, row.map, row.difficulty, row.outcome])).toEqual([
			['endless', 'endlessCounter', 'counter', 'normal', 'lost'],
			['endless', 'endlessSink', 'sink', 'normal', 'lost'],
			['endless', 'endlessStove', 'stove', 'nightmare', 'lost'],
		])
		for (const row of rows) {
			// `endlessResultOf`'s: the wave that lost the run does not count, and that wave is the last started.
			expect(row.score).toBe(row.wavesStarted - 1)
			expect(row.foodRemaining).toBe(0)
			expect(row.ticks).toBeLessThan(ENDLESS_MAX_TICKS)
			expect(row.waveCount).toBe(ENDLESS_WAVE_COUNT)
		}

		const csv = toCsv(rows)
		expect(toCsv(jobs.flatMap(runJob))).toBe(csv)
		expect(toCsv([...jobs].reverse().flatMap(runJob))).toBe(csv)
		expect(fromCsv(csv).map(row => row.score)).toEqual(rows.map(row => row.score))
	})

	it("stops, stalled and unscored, once the job's wave cap has started", () => {
		const [row] = runJob(endlessJob({ nights: ['counter'], maxWaves: 2 }))

		expect(row).toMatchObject({ outcome: 'stalled', wavesStarted: 2, score: null, groceryMoney: null })
		expect(row?.foodRemaining).toBeGreaterThan(0)
	})

	it('has a tick cap that clears the last generated wave on every map and tier', () => {
		for (const difficulty of ['cozy', 'normal', 'nightmare'] as const) {
			for (const mapId of endlessMapIds()) {
				const progress: Progress = { ...newProgress(), nightId: null, cleared: [difficulty], difficulty }
				const world = createWorld(worldOptionsForEndless(progress, mapId, 1234))
				const starts = scheduleOf(world, getNightDef(endlessNightId(mapId)))

				// Starts the last wave with a campaign night's cap to spare for clearing it.
				expect(starts).toHaveLength(ENDLESS_WAVE_COUNT)
				expect(starts[ENDLESS_WAVE_COUNT - 1], `${mapId} on ${difficulty}`).toBeLessThan(
					ENDLESS_MAX_TICKS - MAX_NIGHT_TICKS,
				)
			}
		}
	})

	it('fails naming the job when its campaign has not been cleared, and never plays a campaign night instead', () => {
		expect(() => runEndless(newProgress(), 'counter', 1234, greedy, defaultLoadout)).toThrow(
			/endless run 'endlessCounter' \(greedy\/default, seed 1234\).*not cleared on 'normal'.*locked/,
		)
		// Through the shard that runs it, the error names the job's index and what it was.
		expect(() =>
			runShard(
				[endlessJob({ nights: ['nowhere'], loadoutPolicy: 'default' })],
				{ index: 0, count: 1 },
				() => undefined,
			),
		).toThrow(
			/job 0 \(endless nowhere normal greedy\/default seed 1234\) threw: there is no endless run on map 'nowhere'/,
		)
	})
})

describe('a campaign', () => {
	it('advances on a win and pays it', () => {
		const { rows, progress } = runCampaign(newProgress(), 1234, scripted(), defaultLoadout, 2)
		const [first, second] = rows

		expect(first).toMatchObject({ night: 'night01', outcome: 'won', attempt: 1, mode: 'campaign' })
		expect(first?.groceryMoney ?? 0).toBeGreaterThan(0)
		expect(second).toMatchObject({ night: 'night02', attempt: 1 })
		expect(progress.nightResults.night01).toEqual({ attempts: 1, wins: 1, bestGroceryMoney: first?.groceryMoney })

		// Every dollar paid is still held or was spent on an installation.
		const paid = rows.reduce((sum, row) => sum + (row.groceryMoney ?? 0), 0)
		const spent = progress.installations.reduce((sum, id) => sum + getInstallationDef(id).cost, 0)
		expect(progress.groceryMoney + spent).toBe(paid)
	})

	it('retries a loss on the same seed, and stops as stuck once a retry would be the same night', () => {
		const loadouts = loadoutsInTurn(['saltShaker'], ['toasterCrumbTray'])
		const { rows, progress } = runCampaign(newProgress(), 1234, idle, loadouts, 18)

		expect(rows.map(row => [row.night, row.attempt, row.seed, row.loadout, row.outcome])).toEqual([
			['night01', 1, 1234, 'saltShaker', 'lost'],
			['night01', 2, 1234, 'toasterCrumbTray', 'stuck'],
		])
		// Both losses paid, at the loss rate, and nothing was affordable.
		expect(progress.nightResults.night01?.attempts).toBe(2)
		expect(progress.groceryMoney).toBe((rows[0]?.groceryMoney ?? 0) + (rows[1]?.groceryMoney ?? 0))
		expect(progress.installations).toEqual([])
	})

	it('stops after one attempt when nothing about the retry would change', () => {
		const { rows } = runCampaign(newProgress(), 1234, idle, defaultLoadout, 18)

		expect(rows.map(row => [row.night, row.attempt, row.outcome])).toEqual([['night01', 1, 'stuck']])
	})
})
