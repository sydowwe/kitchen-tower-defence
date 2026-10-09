import { describe, expect, it } from 'vitest'
import { newProgress, setLoadout } from '@/core/campaign.ts'
import { getTowerDef, INSTALLATIONS, NIGHTS } from '@/core/content/index.ts'
import { toCsv } from '@/dev/harness/csv.ts'
import { blindLoadout, defaultLoadout, fixedLoadout, optimalLoadout, parseFixed } from '@/dev/harness/loadouts.ts'
import { loadoutPolicyNamed, replayNight, runNight } from '@/dev/harness/run.ts'
import { LOADOUT_POLICIES, POLICIES } from '@/dev/harness/types.ts'
import { compositionOf, hasFlyer, hitsAir, isEconomy } from '@/dev/harness/value.ts'
import type { Progress } from '@/core/campaign.ts'
import type { DefId } from '@/core/types.ts'
import type { LoadoutPolicy, PolicyFactory } from '@/dev/harness/types.ts'
import type { NightRun } from '@/dev/harness/run.ts'

/**
 * The scripted players are measuring instruments, so what is asserted is that they measure: legal
 * loadouts on every night, nothing reaching the world except through commands, the one knob between
 * `greedy` and `noEconomy`, and a smoke run where nothing throws and nothing goes NaN.
 */

const COUNTER_SPACE: DefId[] = INSTALLATIONS.filter(def => def.effect.kind === 'loadoutSlots').map(def => def.id)

const CAP = 3_600

/**
 * The smoke run is ~2.6s alone and well past vitest's 5s default with the whole suite running beside
 * it. The budget that matters is its own cost, so the timeout is not the place to hold it.
 */
const SLOW = 30_000

function progressFor(nightId: DefId, installations: DefId[] = []): Progress {
	return { ...newProgress(), nightId, installations: [...installations] }
}

function policy(name: string): PolicyFactory {
	const found = POLICIES[name]
	if (found === undefined) {
		throw new Error(`no policy '${name}'`)
	}
	return found
}

function capped(progress: Progress, seed: number, name: string, loadout: LoadoutPolicy = defaultLoadout): NightRun {
	return runNight(progress, seed, policy(name), loadout, undefined, {
		mode: 'night',
		sweep: null,
		attempt: 1,
		maxTicks: CAP,
	})
}

/** Every number anywhere under `value`, with the path to it when one is not finite. */
function nonFinite(value: unknown, path = 'world'): string[] {
	if (typeof value === 'number') {
		return Number.isFinite(value) ? [] : [`${path} = ${value}`]
	}
	if (Array.isArray(value)) {
		return value.flatMap((entry, index) => nonFinite(entry, `${path}[${index}]`))
	}
	if (value !== null && typeof value === 'object') {
		return Object.entries(value).flatMap(([key, entry]) => nonFinite(entry, `${path}.${key}`))
	}
	return []
}

describe('the registries', () => {
	it('name every policy and loadout policy the report reads', () => {
		expect(Object.keys(POLICIES)).toEqual(['idle', 'greedy', 'noEconomy', 'casual', 'random'])
		expect(Object.keys(LOADOUT_POLICIES)).toEqual(['default', 'optimal', 'blind'])
	})

	it('parse a fixed list by name, and leave every other name alone', () => {
		expect(parseFixed('fixed=saltShaker|lemon|cookieJar')).toEqual(['saltShaker', 'lemon', 'cookieJar'])
		expect(parseFixed('optimal')).toBeNull()
		const fixed = loadoutPolicyNamed('fixed=saltShaker|toasterCrumbTray')
		expect(fixed.name).toBe('fixed=saltShaker|toasterCrumbTray')
		expect(fixed.choose(progressFor('night01'), { economy: false })).toEqual(['saltShaker', 'toasterCrumbTray'])
	})

	it('refuse a fixed list that is not legal tonight, naming the night', () => {
		expect(() => runNight(progressFor('night01'), 1234, policy('idle'), fixedLoadout(['lemon']))).toThrow(
			/'night01'.*notUnlocked/,
		)
	})
})

describe('every loadout policy gives a legal loadout on every night', () => {
	for (const installations of [[], COUNTER_SPACE]) {
		const slots = 5 + installations.length
		it(`at ${slots} slots`, () => {
			expect(NIGHTS).toHaveLength(18)
			expect(COUNTER_SPACE).toHaveLength(3)
			for (const night of NIGHTS) {
				const progress = progressFor(night.id, installations)
				for (const loadoutPolicy of [optimalLoadout, blindLoadout]) {
					for (const economy of [true, false]) {
						const chosen = loadoutPolicy.choose(progress, { economy })
						expect(chosen, `${loadoutPolicy.name} on ${night.id}`).not.toBeNull()
						const stored = setLoadout(progress, chosen ?? [])
						expect(stored.ok, `${loadoutPolicy.name} on ${night.id}: [${chosen?.join(', ')}]`).toBe(true)
						expect(chosen!.length).toBeLessThanOrEqual(slots)
						// Economy only when it is wanted, and the economy slot when it is.
						expect(chosen!.some(id => isEconomy(getTowerDef(id)))).toBe(economy)
					}
				}
			}
		})
	}

	it('optimal brings something that hits air on every night whose preview has a flyer', () => {
		let flyerNights = 0
		for (const night of NIGHTS) {
			if (!hasFlyer(compositionOf(night.id, 'normal'))) {
				continue
			}
			flyerNights++
			const chosen = optimalLoadout.choose(progressFor(night.id), { economy: true }) ?? []
			expect(
				chosen.some(id => hitsAir(getTowerDef(id))),
				`${night.id}: [${chosen.join(', ')}]`,
			).toBe(true)
		}
		// Flies from night 2, so nearly every night has one; the loop is not vacuous.
		expect(flyerNights).toBeGreaterThan(10)
	})
})

describe('policies act only through commands', () => {
	for (const name of ['greedy', 'noEconomy', 'casual', 'random']) {
		it(
			`${name}'s night replays from its log to the same world`,
			() => {
				const run = capped(progressFor('night08'), 4321, name)
				// Something happened that the replay has to reproduce.
				expect(run.log.length).toBeGreaterThan(10)
				expect(run.row.towersBuilt).toBeGreaterThan(0)

				expect(replayNight(run.options, undefined, run.log, CAP)).toEqual(run.world)
			},
			SLOW,
		)
	}
})

describe('the economy knob', () => {
	function placedDefs(run: NightRun): DefId[] {
		return run.log.flatMap(entry => (entry.command.kind === 'PlaceTower' ? [entry.command.defId] : []))
	}

	it(
		'noEconomy never places an economy tower, even with one brought',
		() => {
			for (const nightId of ['night01', 'night04', 'night08']) {
				const run = runNight(progressFor(nightId), 1234, policy('noEconomy'), defaultLoadout)
				expect(run.row.loadout).toMatch(/toasterCrumbTray/)
				const placed = placedDefs(run)
				expect(placed.length).toBeGreaterThan(5)
				expect(placed.filter(id => isEconomy(getTowerDef(id)))).toEqual([])
			}
		},
		SLOW,
	)

	it('noEconomy asks its loadout for no economy, and greedy asks for some', () => {
		expect(policy('noEconomy')({ seed: 1 }).economy).toBe(false)
		expect(policy('greedy')({ seed: 1 }).economy).toBe(true)
		expect(optimalLoadout.choose(progressFor('night04'), { economy: false })).not.toContain('cookieJar')
	})

	it('greedy places at least one economy tower on night 1', () => {
		const run = runNight(progressFor('night01'), 1234, policy('greedy'), optimalLoadout)
		expect(placedDefs(run).filter(id => isEconomy(getTowerDef(id))).length).toBeGreaterThanOrEqual(1)
	})
})

describe('the smoke run', () => {
	// Night 1 is the Counter's one lane and the first two towers; 11 is the Stove's two lanes with mold,
	// flyers and a modifier; 17 is the Floor's three lanes with a thief, a burrower and slime among ten
	// enemy kinds.
	it(
		'nights 1, 11 and 17 x five seeds x greedy and random: no throw, nothing NaN, no debt, rows that print',
		() => {
			const rows = []
			for (const nightId of ['night01', 'night11', 'night17']) {
				for (let seed = 1; seed <= 5; seed++) {
					for (const name of ['greedy', 'random']) {
						const run = capped(progressFor(nightId), seed, name)
						expect(nonFinite(run.world), `${name} on ${nightId}, seed ${seed}`).toEqual([])
						expect(run.world.crumbs).toBeGreaterThanOrEqual(0)
						expect(nonFinite(run.row)).toEqual([])
						rows.push(run.row)
					}
				}
			}

			const csv = toCsv(rows)
			expect(csv.trimEnd().split('\n')).toHaveLength(1 + 30)
			expect(csv).not.toMatch(/NaN|Infinity|undefined/)
		},
		SLOW,
	)
})
