import { describe, expect, it } from 'vitest'
import { createCommandQueue } from '@/core/commands.ts'
import { DIFFICULTIES } from '@/core/content/difficulty.ts'
import { getTowerDef } from '@/core/content/index.ts'
import { resolveModifiers } from '@/core/content/installations.ts'
import { tick } from '@/core/sim.ts'
import { canPlaceTower, placeTower } from '@/core/systems/placement.ts'
import { createWorld } from '@/core/world.ts'
import { toCsv } from '@/dev/harness/csv.ts'
import { runJob } from '@/dev/harness/run.ts'
import { mergeShards, runShard } from '@/dev/harness/shard.ts'
import { parseSweep, sweepPatch } from '@/dev/harness/sweep.ts'
import type { DefId, World } from '@/core/types.ts'
import type { Job, Sweep } from '@/dev/harness/types.ts'

/**
 * Step 22C's sweep: a patch on one world's own copies, each knob moving the number it names, a range
 * built by index, and sharding that cannot change a byte of the CSV.
 */

function nightJob(overrides: Partial<Job> = {}): Job {
	return {
		kind: 'night',
		nights: ['night01'],
		difficulty: 'normal',
		seed: 1234,
		policy: 'greedy',
		loadoutPolicy: 'default',
		installations: [],
		sweep: null,
		...overrides,
	}
}

/** Night 1 on the Counter, built the way the harness builds it, then swept. */
function sweptWorld(sweep: Sweep | null, installations: DefId[] = []): World {
	const world = createWorld({
		seed: 1234,
		mapId: 'counter',
		nightId: 'night01',
		difficulty: 'normal',
		modifiers: resolveModifiers(installations),
	})
	sweepPatch(sweep)?.(world)
	return world
}

/** The first Ant of the night, killed where it stands: the pile it leaves. */
function antPile(sweep: Sweep | null): number {
	const world = sweptWorld(sweep)
	const queue = createCommandQueue()
	world.night.countdownTicks = 1
	while (world.enemies.length === 0) {
		tick(world, queue)
	}
	const [ant] = world.enemies
	expect(ant?.defId).toBe('ant')
	if (ant !== undefined) {
		ant.hp = 0
	}
	tick(world, queue)
	expect(world.crumbPiles).toHaveLength(1)
	return world.crumbPiles[0]?.value ?? 0
}

/** Ten seconds of one Crumb Tray on a night parked in its countdown, so nothing else earns. */
function trayIncome(sweep: Sweep | null): number {
	const world = sweptWorld(sweep)
	world.night.countdownTicks = 100_000
	const tray = getTowerDef('toasterCrumbTray')
	let placed = false
	for (let y = 0; y < world.map.heightTiles && !placed; y++) {
		for (let x = 0; x < world.map.widthTiles && !placed; x++) {
			if (canPlaceTower(world, tray, { x, y }).ok) {
				placed = placeTower(world, tray, { x, y }) !== null
			}
		}
	}
	expect(placed).toBe(true)
	const before = world.crumbs
	const queue = createCommandQueue()
	for (let index = 0; index < 600; index++) {
		tick(world, queue)
	}
	return world.crumbs - before
}

describe('a sweep patch', () => {
	it("touches only its own world: an unswept job after a swept one is a fresh unswept job's row", () => {
		const fresh = runJob(nightJob())
		const swept = runJob(nightJob({ sweep: { knob: 'enemyHp', value: 2 } }))
		const after = runJob(nightJob())

		expect(after).toEqual(fresh)
		expect(DIFFICULTIES.normal.enemyHpMult).toBe(1)
		// And the sweep did something, or the equality above proves nothing.
		expect(swept[0]?.sweepKnob).toBe('enemyHp')
		expect(swept[0]?.sweepValue).toBe(2)
		expect(swept[0]?.damageTotal).toBeGreaterThan(fresh[0]?.damageTotal ?? Infinity)
	})

	it('income=2 doubles an Ant pile and a Crumb Tray payout', () => {
		expect(antPile(null)).toBe(3)
		expect(antPile({ knob: 'income', value: 2 })).toBe(6)
		// Ten payouts of 4, then of 8.
		expect(trayIncome(null)).toBe(40)
		expect(trayIncome({ knob: 'income', value: 2 })).toBe(80)
	})

	it('noiseDecay sets the base per second and keeps what Oil the Hinges adds', () => {
		expect(sweptWorld({ knob: 'noiseDecay', value: 3 }).noise.decayPerTick).toBeCloseTo(3 / 60, 12)
		expect(sweptWorld({ knob: 'noiseDecay', value: 3 }, ['oilTheHinges']).noise.decayPerTick).toBeCloseTo(
			(3 + 0.5) / 60,
			12,
		)
		expect(sweptWorld({ knob: 'noiseDecay', value: 0 }).noise.decayPerTick).toBe(0)
	})

	it('towerCost=2 halves the wallet at tick 0 and the income', () => {
		const world = sweptWorld({ knob: 'towerCost', value: 2 })
		expect(world.crumbs).toBe(100)
		expect(world.difficulty.crumbIncomeMult).toBe(0.5)
		expect(antPile({ knob: 'towerCost', value: 1.5 })).toBe(2)
	})

	it('startingCrumbs, enemyHp and enemyCount multiply what the tier gave', () => {
		expect(sweptWorld({ knob: 'startingCrumbs', value: 1.5 }).crumbs).toBe(300)
		expect(sweptWorld({ knob: 'enemyHp', value: 1.2 }).difficulty.enemyHpMult).toBe(1.2)
		expect(sweptWorld({ knob: 'enemyCount', value: 2 }).difficulty.enemyCountMult).toBe(2)

		const nightmare = createWorld({ seed: 1, mapId: 'counter', nightId: 'night01', difficulty: 'nightmare' })
		sweepPatch({ knob: 'enemyHp', value: 2 })?.(nightmare)
		expect(nightmare.difficulty.enemyHpMult).toBe(2.7)
		expect(DIFFICULTIES.nightmare.enemyHpMult).toBe(1.35)
	})

	it('refuses a knob it does not know', () => {
		expect(() => sweepPatch({ knob: 'rot', value: 2 })).toThrow("unknown sweep knob 'rot'")
	})
})

describe('a sweep range', () => {
	it('is exact: 0.6:1.6:0.1 is eleven values ending at 1.6', () => {
		const values = parseSweep('income=0.6:1.6:0.1').map(sweep => sweep.value)
		expect(values).toEqual([0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6])
		expect(values).toHaveLength(11)
		expect(values[values.length - 1]).toBe(1.6)
	})

	it('takes one value, stops short of a to that is off the step, and keeps from-decimals', () => {
		expect(parseSweep('enemyHp=1.25')).toEqual([{ knob: 'enemyHp', value: 1.25 }])
		expect(parseSweep('noiseDecay=1:2.05:0.5').map(sweep => sweep.value)).toEqual([1, 1.5, 2])
		expect(parseSweep('income=0.65:0.95:0.1').map(sweep => sweep.value)).toEqual([0.65, 0.75, 0.85, 0.95])
	})

	it('refuses what it cannot build', () => {
		expect(() => parseSweep('rot=1:2:0.5')).toThrow("unknown sweep knob 'rot'")
		expect(() => parseSweep('income')).toThrow('wants a value')
		expect(() => parseSweep('income=2:1:0.1')).toThrow('from <= to')
		expect(() => parseSweep('income=1:2:0')).toThrow('step above 0')
		expect(() => parseSweep('income=1e1')).toThrow('plain decimal')
		expect(() => parseSweep('towerCost=0:1:0.5')).toThrow('only noiseDecay may be 0')
	})
})

describe('sharding', () => {
	const jobs: Job[] = [
		nightJob({ policy: 'idle' }),
		nightJob({ policy: 'idle', nights: ['night04'], seed: 1235 }),
		nightJob({ policy: 'idle', difficulty: 'nightmare' }),
		nightJob({ policy: 'idle', sweep: { knob: 'enemyHp', value: 2 } }),
		nightJob({ policy: 'idle', sweep: { knob: 'income', value: 0.6 }, nights: ['night04'] }),
		nightJob({ policy: 'idle', kind: 'campaign', nights: ['night02'] }),
	]

	function shardOutput(index: number, count: number): string {
		let output = ''
		runShard(jobs, { index, count }, line => {
			output += line
		})
		return output
	}

	it('changes nothing: two shards merged give the CSV one does', () => {
		const whole = toCsv(jobs.flatMap(runJob))
		const merged = toCsv(mergeShards([shardOutput(1, 2), shardOutput(0, 2)], jobs.length))
		expect(merged).toBe(whole)
		expect(toCsv(mergeShards([shardOutput(0, 1)], jobs.length))).toBe(whole)
	})

	it('refuses a merge that is missing a job or has one twice', () => {
		expect(() => mergeShards([shardOutput(0, 2)], jobs.length)).toThrow('missing [1, 3, 5]')
		expect(() => mergeShards([shardOutput(0, 2), shardOutput(0, 2), shardOutput(1, 2)], jobs.length)).toThrow(
			'repeated [0, 2, 4]',
		)
	})

	it('names the shard and the job that threw', () => {
		const broken = [...jobs, nightJob({ policy: 'idle', sweep: { knob: 'rot', value: 2 } })]
		expect(() => runShard(broken, { index: 0, count: 2 }, () => undefined)).toThrow(
			"shard 0/2: job 6 (night night01 normal idle/default seed 1234 rot=2) threw: unknown sweep knob 'rot'",
		)
	})
})
