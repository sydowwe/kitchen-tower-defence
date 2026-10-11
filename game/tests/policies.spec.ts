import { describe, expect, it } from 'vitest'
import { newProgress, setLoadout } from '@/core/campaign.ts'
import { ant, mold } from '@/core/content/enemies.ts'
import { getTowerDef, INSTALLATIONS, NIGHTS } from '@/core/content/index.ts'
import { samplePath } from '@/core/path.ts'
import { spawnEnemyAt } from '@/core/systems/spawn.ts'
import { toCsv } from '@/dev/harness/csv.ts'
import { blindLoadout, defaultLoadout, fixedLoadout, optimalLoadout, parseFixed } from '@/dev/harness/loadouts.ts'
import { createLaneWatch, farthestReached, STRANDED_TICKS, watchLane } from '@/dev/harness/policies/greedy.ts'
import { loadoutPolicyNamed, replayNight, runNight } from '@/dev/harness/run.ts'
import { LOADOUT_POLICIES, POLICIES } from '@/dev/harness/types.ts'
import {
	compositionOf,
	damageTermsOf,
	hasFlyer,
	hitsAir,
	isEconomy,
	reachOf,
	sharedValue,
	valueOf,
} from '@/dev/harness/value.ts'
import { statsFor } from '@/ui/viewModel.ts'
import type { Progress } from '@/core/campaign.ts'
import type { DefId, Vec2, World } from '@/core/types.ts'
import type { Answerer } from '@/dev/harness/policies/greedy.ts'
import type { LoadoutPolicy, PolicyFactory } from '@/dev/harness/types.ts'
import type { NightRun } from '@/dev/harness/run.ts'
import type { WeightedEnemy } from '@/dev/harness/value.ts'
import { createTestWorld } from './fixtures/world.ts'

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

describe('greedy answers the gap', () => {
	function placedDefs(run: NightRun): DefId[] {
		return run.log.flatMap(entry => (entry.command.kind === 'PlaceTower' ? [entry.command.defId] : []))
	}

	function damaging(id: DefId): boolean {
		return (statsFor(getTowerDef(id)).dps ?? 0) > 0
	}

	it(
		'night 8 places a tower that hits air, and more than one damaging def',
		() => {
			const placed = placedDefs(runNight(progressFor('night08'), 1234, policy('greedy'), optimalLoadout))
			expect(
				placed.some(id => hitsAir(getTowerDef(id))),
				`[${placed.join(', ')}]`,
			).toBe(true)
			expect(new Set(placed.filter(damaging)).size).toBeGreaterThanOrEqual(2)
		},
		SLOW,
	)

	// Ground-only, so the first Shaker answers everything and the share leaves the ranking alone. Four
	// Shakers, then the saved-for Tray: what ECONOMY_WEIGHT was read against (B2, decision 5). A change
	// to the valuation that moves this says what it did to night 1.
	it('night 1 opens on four Salt Shakers, then a Crumb Tray', () => {
		const placed = placedDefs(runNight(progressFor('night01'), 1234, policy('greedy'), optimalLoadout))
		expect(placed.find(damaging)).toBe('saltShaker')
		expect(placed.slice(0, 5)).toEqual(['saltShaker', 'saltShaker', 'saltShaker', 'saltShaker', 'toasterCrumbTray'])
	})

	describe('the share is per enemy, not per tower', () => {
		// 90% of the night on the ground, 10% in the air; chemical and physical are 1.0 against both.
		const composition: WeightedEnemy[] = [
			{ id: 'ant', tags: ['ground', 'bug'], weight: 900 },
			{ id: 'fly', tags: ['air', 'bug'], weight: 100 },
		]
		const shaker = damageTermsOf(getTowerDef('saltShaker'), composition)
		const spray = damageTermsOf(getTowerDef('sprayBottle'), composition)

		it('splits valueOf by enemy', () => {
			expect(shaker).toEqual([4.5, 0])
			expect(spray[0]).toBeCloseTo(3.24, 10)
			expect(spray[1]).toBeCloseTo(0.36, 10)
			expect(spray[0]! + spray[1]!).toBeCloseTo(valueOf(getTowerDef('sprayBottle'), composition), 10)
		})

		it("a ground-only tower's air term is 0 whatever is standing", () => {
			for (const others of [
				[0, 0],
				[1, 0],
				[0, 1],
				[5, 3],
			]) {
				expect(sharedValue([0, shaker[1]!], others, composition)).toBe(0)
			}
		})

		it('a tower that hits both has its air term halved by one air tower standing', () => {
			const air = [0, spray[1]!]
			expect(sharedValue(air, [3, 1], composition)).toBeCloseTo(0.18, 10)
			expect(sharedValue(air, [3, 2], composition)).toBeCloseTo(0.12, 10)
		})

		it('what nothing standing answers is credited as the whole night', () => {
			// Empty board: valueOf.
			expect(sharedValue(spray, [0, 0], composition)).toBeCloseTo(3.6, 10)
			// The ground held by one Shaker, the air by nothing: half the ground, and the flies as if the
			// night were only flies, 3.6 x 1.0.
			expect(sharedValue(spray, [1, 0], composition)).toBeCloseTo(1.62 + 3.6, 10)
			expect(sharedValue(spray, [1, 1], composition)).toBeCloseTo(1.62 + 0.18, 10)
		})
	})
})

describe('greedy watches the lane', () => {
	function placements(run: NightRun): { defId: DefId; tile: Vec2 }[] {
		return run.log.flatMap(entry => (entry.command.kind === 'PlaceTower' ? [entry.command] : []))
	}

	function damaging(id: DefId): boolean {
		return (statsFor(getTowerDef(id)).dps ?? 0) > 0
	}

	// At b185ca7 it placed three Salt Shakers, then saved for the Cookie Jar from tick 3 to 3,165 while
	// the lane fell, and lost.
	it(
		'night 7 places four damaging towers before its first economy tower',
		() => {
			const placed = placements(runNight(progressFor('night07'), 1234, policy('greedy'), defaultLoadout))
			const firstEconomy = placed.findIndex(entry => isEconomy(getTowerDef(entry.defId)))
			expect(firstEconomy).toBeGreaterThan(0)
			expect(placed.slice(0, firstEconomy).filter(entry => damaging(entry.defId)).length).toBeGreaterThanOrEqual(
				4,
			)
		},
		SLOW,
	)

	// At b185ca7 it stalled at 72,000 ticks with three Mold at full HP 2 to 5 tiles down the vent.
	it(
		'night 12 puts a tower in reach of the Mold down the vent, and does not stall',
		() => {
			const run = runNight(progressFor('night12'), 1234, policy('noEconomy'), optimalLoadout)
			expect(run.row.outcome).not.toBe('stalled')

			const vent = run.world.map.paths.find(path => path.id === 'vent')
			expect(vent).toBeDefined()
			const ventTiles = [0, 1, 2, 3, 4].map(distance => samplePath(vent!, distance))
			const reaching = placements(run).filter(({ defId, tile }) => {
				const reach = reachOf(getTowerDef(defId))
				return ventTiles.some(at => Math.hypot(at.x - tile.x, at.y - tile.y) <= reach)
			})
			expect(reaching.length).toBeGreaterThanOrEqual(1)
		},
		SLOW,
	)

	describe('unanswered is about the board, not the card', () => {
		// The fixture's lane `a` runs (0,0) to (39,0) along +x, so an enemy's distance is its x.
		const composition: WeightedEnemy[] = [
			{ id: 'ant', tags: ant.tags, weight: 1 },
			{ id: 'mold', tags: mold.tags, weight: 1 },
		]

		function answerer(world: World, x: number, answers = [true, true]): Answerer {
			const tile = { x, y: 0 }
			return { tile, reach: 2, answers, farthest: farthestReached(world.map, tile, 2) }
		}

		function readAt(world: World, tick: number, watch: ReturnType<typeof createLaneWatch>, towers: Answerer[]) {
			world.tick = tick
			return watchLane(world, watch, composition, towers)
		}

		it('reads the farthest point of the lane a tower reaches', () => {
			const world = createTestWorld()
			expect(answerer(world, 10).farthest.get('a')).toBeCloseTo(12, 10)
			expect(answerer(world, 38).farthest.get('a')).toBeCloseTo(39, 10)
		})

		it('a walker is slipping only once it has been in range and walked out past the defence', () => {
			const world = createTestWorld()
			const watch = createLaneWatch()
			const towers = [answerer(world, 10)]
			const walker = spawnEnemyAt(world, ant, 'a', 0, 0)

			// Never in range yet: not slipping, and walking, so not stranded.
			expect(readAt(world, 0, watch, towers)).toEqual({ slipping: [false, false], stranded: [[], []] })
			walker.distance = 9
			expect(readAt(world, 1, watch, towers).slipping).toEqual([false, false])
			walker.distance = 14
			expect(readAt(world, 2, watch, towers).slipping).toEqual([true, false])

			// Into the gap before a second tower is not through the defence.
			expect(readAt(world, 3, watch, [...towers, answerer(world, 20)]).slipping).toEqual([false, false])
		})

		it('a walker that has never been in range is neither slipping nor stranded', () => {
			const world = createTestWorld()
			const watch = createLaneWatch()
			const towers = [answerer(world, 10)]
			const walker = spawnEnemyAt(world, ant, 'a', 15, 0)
			for (let tick = 0; tick <= 2 * STRANDED_TICKS; tick++) {
				walker.distance = 15 + tick * 0.05
				expect(readAt(world, tick, watch, towers)).toEqual({ slipping: [false, false], stranded: [[], []] })
			}
		})

		it('an enemy at one distance for 120 ticks with no answering tower in reach is stranded', () => {
			const world = createTestWorld()
			const watch = createLaneWatch()
			spawnEnemyAt(world, mold, 'a', 30, 0)
			const towers = [answerer(world, 10), answerer(world, 30, [true, false])]

			expect(readAt(world, 0, watch, towers).stranded).toEqual([[], []])
			expect(readAt(world, STRANDED_TICKS - 1, watch, towers).stranded).toEqual([[], []])
			expect(readAt(world, STRANDED_TICKS, watch, towers).stranded).toEqual([[], [{ x: 30, y: 0 }]])
			// A tower in reach that can't hit it doesn't count; one that can does.
			expect(readAt(world, STRANDED_TICKS + 1, watch, [...towers, answerer(world, 29)]).stranded).toEqual([
				[],
				[],
			])
		})

		it('a feeding enemy is never stranded', () => {
			const world = createTestWorld()
			const watch = createLaneWatch()
			const fed = spawnEnemyAt(world, ant, 'a', 30, 0)
			fed.feeding = { towerId: 99, distance: 30, releaseTick: 10_000 }
			for (const tick of [0, STRANDED_TICKS, 4 * STRANDED_TICKS]) {
				expect(readAt(world, tick, watch, [answerer(world, 10)]).stranded).toEqual([[], []])
			}
		})

		it('forgets the enemies that are gone', () => {
			const world = createTestWorld()
			const watch = createLaneWatch()
			spawnEnemyAt(world, ant, 'a', 10, 0)
			readAt(world, 0, watch, [answerer(world, 10)])
			expect(watch.reached.size).toBe(1)
			world.enemies = []
			readAt(world, 1, watch, [answerer(world, 10)])
			expect(watch.reached.size).toBe(0)
			expect(watch.still.size).toBe(0)
		})
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
