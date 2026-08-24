import { describe, expect, it } from 'vitest'
import { createCommandQueue } from '@/core/commands.ts'
import { getTowerDef } from '@/core/content/index.ts'
import { samplePath } from '@/core/path.ts'
import { tick } from '@/core/sim.ts'
import { collectCrumb, crumbById, dropCrumb, MERGE_RADIUS_TILES } from '@/core/systems/crumbs.ts'
import { sellTower } from '@/core/systems/placement.ts'
import { createWorld } from '@/core/world.ts'
import { createTestWorld } from './fixtures/world.ts'
import type { CommandQueue } from '@/core/commands.ts'
import type { Crumb, DefId, EntityId, GameEvent, Vec2, World } from '@/core/types.ts'

/**
 * The crumb's whole life: dropped where something died, merged with its neighbours, and removed
 * through exactly one door.
 *
 * The fixture map is a straight lane along `y = 0`, so an enemy at `distance` d stands at `{x: d,
 * y: 0}` -- which is what lets two kills be placed 0.5 tiles apart to the number. Its night is over
 * by default and terminal phases run nothing, so every world here is put into `'wave'` with no
 * running wave: the systems all execute and nothing spawns.
 */

/** The Ant's reward, from analytic-docs/CONTENT.md section 2 and asserted in `content.spec.ts`. */
const ANT_REWARD = 3
/** The Toaster Crumb Tray's, likewise. */
const TRAY_PAYOUT = 4
const PAYOUT_INTERVAL = 60

function runningWorld(): World {
	const world = createTestWorld()
	world.night.phase = 'wave'
	world.night.wave = null
	return world
}

/** An enemy already at zero HP standing `distance` tiles down the lane. `resolveSystem` kills it. */
function killAt(world: World, distance: number): void {
	const enemy = {
		id: world.nextEntityId++,
		defId: 'ant' as DefId,
		pathId: 'a',
		distance,
		hp: 0,
		maxHp: 10,
		statuses: [],
		tags: ['ground' as const],
		speed: 0,
		spawnedInWaveIndex: 0,
		stolenItems: [],
		flags: { hidden: false, untargetable: false, fleeing: false },
	}
	world.enemies.push(enemy)
	world.index.enemies[enemy.id] = world.enemies.length - 1
}

/** A tower on the board without paying for it, so a wallet assertion is about crumbs and not cost. */
function putTower(world: World, defId: DefId, tile: Vec2): EntityId {
	const def = getTowerDef(defId)
	const tower = {
		id: world.nextEntityId++,
		defId,
		tile: { x: tile.x, y: tile.y },
		hp: def.maxHp,
		maxHp: def.maxHp,
		tier: 0,
		targetingMode: def.defaultTargetingMode,
		targetEnemyId: null,
		cooldownTicks: 0,
		state: null,
		totalInvested: def.cost,
	}
	world.towers.push(tower)
	world.index.towers[tower.id] = world.towers.length - 1
	return tower.id
}

function runTicks(world: World, count: number, queue: CommandQueue = createCommandQueue()): GameEvent[] {
	const log: GameEvent[] = []
	for (let index = 0; index < count; index++) {
		tick(world, queue)
		log.push(...world.events)
	}
	return log
}

function collectedEvents(log: readonly GameEvent[]): Extract<GameEvent, { kind: 'crumbCollected' }>[] {
	return log.filter(event => event.kind === 'crumbCollected')
}

function onlyPile(world: World): Crumb {
	expect(world.crumbPiles).toHaveLength(1)
	const crumb = world.crumbPiles[0]
	if (crumb === undefined) {
		throw new Error('no pile')
	}
	return crumb
}

describe('merging', () => {
	it('merges two kills half a tile apart into one pile worth the sum', () => {
		const world = runningWorld()
		killAt(world, 5)
		runTicks(world, 1)
		runTicks(world, 10)

		killAt(world, 5.5)
		runTicks(world, 1)

		const pile = onlyPile(world)
		expect(pile.value).toBe(2 * ANT_REWARD)
		// The **older** age survives, not the newer and not the average: a kill zone's pile rots on
		// the clock of the first thing that died there.
		expect(pile.ageTicks).toBe(11)
		expect(world.night.crumbsDropped).toBe(2 * ANT_REWARD)
	})

	it('leaves two piles for two kills 1.2 tiles apart', () => {
		const world = runningWorld()
		killAt(world, 5)
		killAt(world, 6.2)
		runTicks(world, 1)

		expect(world.crumbPiles.map(crumb => crumb.value)).toEqual([ANT_REWARD, ANT_REWARD])
		expect(world.night.crumbsDropped).toBe(2 * ANT_REWARD)
		expect(1.2).toBeGreaterThan(MERGE_RADIUS_TILES)
	})

	it('does not merge into a pile that is already on its way to a tower', () => {
		const world = runningWorld()
		const claimed = dropCrumb(world, { x: 5, y: 0 }, 10)
		claimed.claimedByTowerId = 999
		claimed.travelTicksRemaining = 45

		dropCrumb(world, { x: 5.2, y: 0 }, 7)

		expect(claimed.value).toBe(10)
		expect(world.crumbPiles).toHaveLength(2)
		expect(world.crumbPiles[1]?.value).toBe(7)
	})
})

describe('the exit door', () => {
	it('credits exactly the value once, as a click, and leaves the index correct', () => {
		const world = runningWorld()
		dropCrumb(world, { x: 3, y: 0 }, 12)
		const target = dropCrumb(world, { x: 8, y: 0 }, 5)
		dropCrumb(world, { x: 20, y: 0 }, 9)
		const before = world.crumbs

		const queue = createCommandQueue()
		queue.enqueue({ kind: 'CollectCrumb', crumbId: target.id })
		const log = runTicks(world, 1, queue)

		expect(world.crumbs - before).toBe(5)
		expect(world.night.crumbsCollected).toBe(5)
		expect(collectedEvents(log)).toEqual([
			{ kind: 'crumbCollected', crumbId: target.id, value: 5, byTowerId: null },
		])
		expect(world.crumbPiles.map(crumb => crumb.value)).toEqual([12, 9])
		expect(world.index.crumbPiles).toEqual(
			Object.fromEntries(world.crumbPiles.map((crumb, position) => [crumb.id, position])),
		)
		for (const crumb of world.crumbPiles) {
			expect(crumbById(world, crumb.id)).toBe(crumb)
		}
	})

	it('credits once for two CollectCrumb commands naming the same pile in one batch', () => {
		const world = runningWorld()
		const crumb = dropCrumb(world, { x: 3, y: 0 }, 8)
		const before = world.crumbs

		const queue = createCommandQueue()
		queue.enqueue({ kind: 'CollectCrumb', crumbId: crumb.id })
		queue.enqueue({ kind: 'CollectCrumb', crumbId: crumb.id })
		const log = runTicks(world, 1, queue)

		expect(world.crumbs - before).toBe(8)
		expect(collectedEvents(log)).toHaveLength(1)
		expect(world.crumbPiles).toEqual([])
	})

	it('is a silent no-op for a pile that has already gone', () => {
		const world = runningWorld()
		const crumb = dropCrumb(world, { x: 3, y: 0 }, 8)
		collectCrumb(world, crumb, null)
		const before = world.crumbs
		world.events.length = 0

		collectCrumb(world, crumb, null)

		expect(world.crumbs).toBe(before)
		expect(world.night.crumbsCollected).toBe(8)
		expect(world.events).toEqual([])
	})
})

describe('tower collection', () => {
	it('flies a pile in and credits it to the tower that claimed it', () => {
		const world = runningWorld()
		const towerId = putTower(world, 'toasterCrumbTray', { x: 0, y: 0 })
		const crumb = dropCrumb(world, { x: 2, y: 0 }, 6)

		runTicks(world, 1)
		expect(crumb.claimedByTowerId).toBe(towerId)
		// Claimed and flown one tick in the same tick: 90 authored, 89 left.
		expect(crumb.travelTicksRemaining).toBe(89)

		const log = runTicks(world, 89)

		expect(world.crumbPiles).toEqual([])
		expect(collectedEvents(log)).toEqual([
			{ kind: 'crumbCollected', crumbId: crumb.id, value: 6, byTowerId: towerId },
		])
		expect(world.night.crumbsCollected).toBe(6)
	})

	it('pays a clicked pile once even though a tower was halfway through carrying it', () => {
		const world = runningWorld()
		putTower(world, 'toasterCrumbTray', { x: 0, y: 0 })
		const crumb = dropCrumb(world, { x: 2, y: 0 }, 6)
		const before = world.crumbs

		const flight = runTicks(world, 60)
		expect(crumb.travelTicksRemaining).toBe(30)
		expect(collectedEvents(flight)).toEqual([])

		const queue = createCommandQueue()
		queue.enqueue({ kind: 'CollectCrumb', crumbId: crumb.id })
		const log = [...flight, ...runTicks(world, 1, queue)]

		// The tray also pays income while the pile is in the air: `world.tick` was 0 through 60, so
		// it hit the 60-tick interval twice.
		const income = 2 * TRAY_PAYOUT
		expect(world.crumbs - before).toBe(6 + income)
		expect(collectedEvents(log)).toEqual([{ kind: 'crumbCollected', crumbId: crumb.id, value: 6, byTowerId: null }])
		expect(world.crumbPiles).toEqual([])
	})

	it('puts a pile back on the floor when the tower carrying it is sold', () => {
		const world = runningWorld()
		const towerId = putTower(world, 'toasterCrumbTray', { x: 0, y: 0 })
		const crumb = dropCrumb(world, { x: 2, y: 0 }, 6)

		runTicks(world, 30)
		expect(crumb.claimedByTowerId).toBe(towerId)

		expect(sellTower(world, towerId)).toBe(true)
		runTicks(world, 1)

		expect(world.crumbPiles).toHaveLength(1)
		expect(crumb.claimedByTowerId).toBeNull()
		expect(crumb.travelTicksRemaining).toBe(0)
		expect(world.night.crumbsCollected).toBe(0)
	})
})

describe('tower income', () => {
	/** A real night, parked in its opening countdown so no wave ever starts and nothing is killed. */
	function quietNight(difficulty: 'cozy' | 'normal' | 'nightmare'): World {
		const world = createWorld({ seed: 1234, mapId: 'counter', nightId: 'night01', difficulty })
		world.night.phase = 'building'
		world.night.countdownTicks = 100_000
		return world
	}

	function payoutsOver(difficulty: 'cozy' | 'normal' | 'nightmare', ticks: number): number {
		const world = quietNight(difficulty)
		putTower(world, 'toasterCrumbTray', { x: 0, y: 0 })
		const before = world.crumbs
		runTicks(world, ticks)
		return world.crumbs - before
	}

	it('pays the doc rate on every interval and nothing in between', () => {
		// 600 ticks starting at tick 0 crosses the 60-tick interval ten times.
		expect(payoutsOver('normal', 600)).toBe(10 * TRAY_PAYOUT)
		expect(600 / PAYOUT_INTERVAL).toBe(10)
	})

	it('scales each payout by the difficulty multiplier, once', () => {
		// round(4 x 1.25) = 5 and round(4 x 0.85) = 3. Applied twice either would be 6 and 3 x 0.85.
		expect(payoutsOver('cozy', 600)).toBe(10 * 5)
		expect(payoutsOver('nightmare', 600)).toBe(10 * 3)
	})

	it('does not count a payout as litter on the floor', () => {
		const world = quietNight('normal')
		putTower(world, 'toasterCrumbTray', { x: 0, y: 0 })
		runTicks(world, 600)

		expect(world.night.crumbsDropped).toBe(0)
	})
})

describe('the ledger', () => {
	it('accounts for every crumb over a headless night, with no leak and no double credit', () => {
		const world = createWorld({ seed: 4242, mapId: 'counter', nightId: 'night01', difficulty: 'normal' })
		const path = world.map.paths[0]
		if (path === undefined) {
			throw new Error('the map has no paths')
		}
		// Near the start of the track, which is where the kills below happen: everything dies every
		// two seconds, so nothing ever walks far. That puts the piles inside the tray's collect
		// radius, and both doors -- its delivery and the clicks further down -- run in one night.
		const beside = samplePath(path, 2)
		putTower(world, 'toasterCrumbTray', { x: Math.round(beside.x), y: Math.round(beside.y) })

		const queue = createCommandQueue()
		const log: GameEvent[] = []
		let ended = false

		for (let index = 0; index < 20_000 && !ended; index++) {
			// A stand-in for towers that kill: every two seconds, everything on the board dies where
			// it stands, which is what puts crumbs on the floor in the first place.
			if (world.tick % 120 === 0) {
				for (const enemy of world.enemies) {
					enemy.hp = 0
				}
			}
			// And a player who clicks the oldest pile now and then, so both doors are used.
			const oldest = world.crumbPiles[0]
			if (world.tick % 300 === 0 && oldest !== undefined) {
				queue.enqueue({ kind: 'CollectCrumb', crumbId: oldest.id })
			}

			tick(world, queue)
			log.push(...world.events)
			ended = world.events.some(event => event.kind === 'nightEnded')
		}

		const collected = collectedEvents(log)
		const onTheBoard = world.crumbPiles.reduce((sum, crumb) => sum + crumb.value, 0)

		expect(ended).toBe(true)
		expect(collected.length).toBeGreaterThan(0)
		expect(world.night.crumbsDropped).toBeGreaterThan(0)
		expect(world.night.crumbsCollected).toBe(collected.reduce((sum, event) => sum + event.value, 0))
		// 7B adds the rot door to the right-hand side of this.
		expect(world.night.crumbsDropped).toBe(world.night.crumbsCollected + onTheBoard)
		expect(collected.some(event => event.byTowerId === null)).toBe(true)
		expect(collected.some(event => event.byTowerId !== null)).toBe(true)
	})
})

describe('serialisation', () => {
	it('survives a JSON round-trip with crumbs on the board', () => {
		const world = runningWorld()
		putTower(world, 'toasterCrumbTray', { x: 0, y: 0 })
		dropCrumb(world, { x: 2, y: 0 }, 6)
		dropCrumb(world, { x: 20, y: 0 }, 11)
		runTicks(world, 5)

		expect(JSON.parse(JSON.stringify(world))).toEqual(world)
	})
})
