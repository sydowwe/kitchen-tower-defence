import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ant } from '@/core/content/enemies.ts'
import { NIGHTS } from '@/core/content/nights.ts'
import { cookieJar, mousetrap, saltShaker, stickyTape } from '@/core/content/towers.ts'
import { createCommandQueue } from '@/core/commands.ts'
import { tick } from '@/core/sim.ts'
import { chargePhase } from '@/core/systems/charges.ts'
import { damageTower, destroyTower } from '@/core/systems/placement.ts'
import { hasFinishedSpawning } from '@/core/systems/wave.ts'
import type { NightDef, TowerDef } from '@/core/content/schema.ts'
import type { Enemy, Tower, Vec2, World } from '@/core/types.ts'
import { createTestWorld } from './fixtures/world.ts'

/**
 * The rearm half of the charge machine, tower HP, and the Cookie Jar's destroy penalty.
 *
 * `tests/status.spec.ts` owns the Sticky Tape's three charges and nothing here restates them. What
 * this file asserts is the machinery the tape never exercises: a magazine that comes back, a tower
 * that stays on the board at 0 charges, and the one path a killed tower leaves by.
 *
 * The fixture's map is one row 40 tiles wide with path `a` from (0,0) to (39,0), so an enemy's
 * position is `(distance, 0)` and the Mousetrap's range of 1 reaches `distance +/- 1`.
 */

const PATH_ID = 'a'

/** 396 ticks: the Mousetrap's cooldown and its rearm are the same interval (CONTENT.md section 1). */
const REARM_TICKS = 396

/**
 * A night whose entries name the fixture's lane, so the destroy penalty has a composition to buy
 * from. `getNightDef` reads `NIGHTS`, so it has to be in it -- the same trick `status.spec.ts` uses
 * for synthetic towers.
 *
 * An Ant is worth 3 and a Roach 5, so one pass over the two entries costs 8 and the Cookie Jar's
 * 200 buys exactly 25 of each with nothing left over.
 */
const penaltyNight: NightDef = {
	id: 'chargeSpecNight',
	index: 1,
	mapId: 'test',
	waves: [
		{
			entries: [
				{ enemyDefId: 'ant', count: 4, spacingTicks: 30, startDelayTicks: 0, pathId: PATH_ID },
				{ enemyDefId: 'roach', count: 2, spacingTicks: 40, startDelayTicks: 120, pathId: PATH_ID },
			],
			countdownTicks: 300,
		},
	],
}

beforeAll(() => {
	;(NIGHTS as NightDef[]).push(penaltyNight)
})

afterAll(() => {
	;(NIGHTS as NightDef[]).pop()
})

function makeWorld(): World {
	const world = createTestWorld()
	// A wave permanently mid-spawn: the fixture's night is over, and a terminal phase runs no
	// systems at all.
	world.night.phase = 'wave'
	world.night.wave = {
		index: 0,
		startedAtTick: 0,
		spawns: [{ enemyDefId: 'ant', remaining: 1, nextSpawnTick: 1_000_000, spacingTicks: 60, pathId: PATH_ID }],
	}
	return world
}

function addEnemy(world: World, distance: number): Enemy {
	const enemy: Enemy = {
		id: world.nextEntityId++,
		defId: 'ant',
		pathId: PATH_ID,
		distance,
		lateralOffsetTiles: 0,
		hp: 10_000,
		maxHp: 10_000,
		statuses: [],
		tags: [...ant.tags],
		speed: 0,
		spawnedInWaveIndex: 0,
		nextTileWriteTick: 0,
		burrowWindow: null,
		feeding: null,
		fedAt: [],
		stolenItems: [],
		flags: { hidden: false, untargetable: false, fleeing: false, revealed: false, burrowed: false },
	}

	world.index.enemies[enemy.id] = world.enemies.length
	world.enemies.push(enemy)
	return enemy
}

/** Towers go on directly rather than through `placeTower`: the fixture has one off-track tile. */
function addTower(world: World, def: TowerDef, tile: Vec2): Tower {
	const charges = def.behaviours.find(behaviour => behaviour.kind === 'charge')
	const tower: Tower = {
		id: world.nextEntityId++,
		defId: def.id,
		tile: { x: tile.x, y: tile.y },
		hp: def.maxHp,
		maxHp: def.maxHp,
		tier: 0,
		targetingMode: def.defaultTargetingMode,
		targetEnemyId: null,
		cooldownTicks: 0,
		shotsFired: 0,
		state: charges === undefined ? null : { kind: 'charge', charges: charges.charges, rearmTicksRemaining: 0 },
		totalInvested: def.cost,
	}

	world.index.towers[tower.id] = world.towers.length
	world.towers.push(tower)
	return tower
}

function run(world: World, ticks: number): void {
	const queue = createCommandQueue()
	for (let index = 0; index < ticks; index++) {
		tick(world, queue)
	}
}

/**
 * The ticks a tower fired on, over `ticks` ticks, with `perFrame` calls to `tick` per loop
 * iteration. `world.tick` counts *completed* ticks, so the tick a shot happened on is one less.
 */
function firingTicks(world: World, towerId: number, ticks: number, perFrame: number): number[] {
	const queue = createCommandQueue()
	const fired: number[] = []

	for (let step = 0; step < ticks; step += perFrame) {
		for (let inner = 0; inner < perFrame; inner++) {
			tick(world, queue)
			if (world.events.some(event => event.kind === 'towerFired' && event.towerId === towerId)) {
				fired.push(world.tick - 1)
			}
		}
	}

	return fired
}

describe('a tower at zero charges', () => {
	it('stays on the board while it can still rearm, and leaves when it cannot', () => {
		const world = makeWorld()
		addEnemy(world, 10)
		const trap = addTower(world, mousetrap, { x: 10, y: 0 })
		// A tape with its last root already ended: nothing outstanding, nothing to rearm with.
		const tape = addTower(world, stickyTape, { x: 30, y: 0 })
		tape.state = { kind: 'charge', charges: 0, rearmTicksRemaining: 0 }

		run(world, 1)

		expect(world.towers.map(tower => tower.id)).toEqual([trap.id])
		expect(trap.state).toEqual({ kind: 'charge', charges: 0, rearmTicksRemaining: REARM_TICKS })
		expect(chargePhase(trap)).toBe('rearming')
	})

	it('is spent, not rearming, when its behaviour has no rearm at all', () => {
		const world = makeWorld()
		addEnemy(world, 10)
		const tape = addTower(world, stickyTape, { x: 10, y: 0 })

		run(world, 1)

		// One root laid: a charge gone and the timer still at 0, because `rearmTicks` is 0.
		expect(tape.state).toEqual({ kind: 'charge', charges: 2, rearmTicksRemaining: 0 })

		run(world, 300)
		expect(tape.state?.rearmTicksRemaining).toBe(0)
	})
})

describe('a rearming Mousetrap', () => {
	it('takes no target and fires nothing while a Salt Shaker beside it works normally', () => {
		const world = makeWorld()
		addEnemy(world, 10)
		addEnemy(world, 10.5)
		const trap = addTower(world, mousetrap, { x: 10, y: 0 })
		const shaker = addTower(world, saltShaker, { x: 12, y: 0 })

		run(world, 1)
		expect(trap.state?.charges).toBe(0)

		run(world, 1)

		expect(trap.targetEnemyId).toBeNull()
		expect(shaker.targetEnemyId).not.toBeNull()
		expect(world.events.filter(event => event.kind === 'towerFired' && event.towerId === trap.id)).toEqual([])
	})

	it('comes back with exactly one charge and a stopped timer', () => {
		const world = makeWorld()
		addEnemy(world, 10)
		const trap = addTower(world, mousetrap, { x: 10, y: 0 })

		run(world, 1)
		expect(trap.state).toEqual({ kind: 'charge', charges: 0, rearmTicksRemaining: REARM_TICKS })

		// The enemy walks off the board, so the restored charge is not spent again on the tick it
		// arrives -- which is what the trap does with something still in range, and is asserted below.
		world.enemies = []
		world.index.enemies = {}

		// One tick short of the rearm: still rearming, one tick left on the clock.
		run(world, REARM_TICKS - 1)
		expect(trap.state).toEqual({ kind: 'charge', charges: 0, rearmTicksRemaining: 1 })
		expect(chargePhase(trap)).toBe('rearming')

		run(world, 1)
		expect(trap.state).toEqual({ kind: 'charge', charges: 1, rearmTicksRemaining: 0 })
		expect(chargePhase(trap)).toBe('armed')
	})
})

describe('the gap between two Mousetrap shots', () => {
	it('is 396 ticks over three cycles, at one tick per frame and at three', () => {
		const single = makeWorld()
		addEnemy(single, 10)
		const singleTrap = addTower(single, mousetrap, { x: 10, y: 0 })

		const triple = makeWorld()
		addEnemy(triple, 10)
		const tripleTrap = addTower(triple, mousetrap, { x: 10, y: 0 })

		const atOneX = firingTicks(single, singleTrap.id, 3 * REARM_TICKS, 1)
		const atThreeX = firingTicks(triple, tripleTrap.id, 3 * REARM_TICKS, 3)

		expect(atOneX).toEqual([0, REARM_TICKS, 2 * REARM_TICKS])
		// A rearm scaled by a `dt` rather than counted in ticks would not survive the second form.
		expect(atThreeX).toEqual(atOneX)
	})
})

describe('damaging and destroying a tower', () => {
	it('clamps hp at zero and emits nothing on its own', () => {
		const world = makeWorld()
		const shaker = addTower(world, saltShaker, { x: 10, y: 0 })

		damageTower(world, shaker, 40)
		expect(shaker.hp).toBe(60)

		damageTower(world, shaker, 500)
		expect(shaker.hp).toBe(0)
		expect(world.events).toEqual([])
		// Still on the board: whoever damaged it is what calls `destroyTower`.
		expect(world.towers).toHaveLength(1)
	})

	it('emits one towerDestroyed, clears both the array and the index, and refuses a second call', () => {
		const world = makeWorld()
		const shaker = addTower(world, saltShaker, { x: 10, y: 0 })

		expect(destroyTower(world, shaker.id)).toBe(true)

		expect(world.events).toEqual([
			{ kind: 'towerDestroyed', towerId: shaker.id, defId: 'saltShaker', tile: { x: 10, y: 0 } },
		])
		expect(world.towers).toEqual([])
		expect(world.index.towers[shaker.id]).toBeUndefined()

		expect(destroyTower(world, shaker.id)).toBe(false)
		expect(world.events).toHaveLength(1)
	})
})

describe('the Cookie Jar destroy penalty', () => {
	it('buys 200 crumbs of the running wave s own enemies and appends them to it', () => {
		const world = makeWorld()
		world.night.nightId = penaltyNight.id
		world.night.waveIndex = 0
		const wave = world.night.wave
		const jar = addTower(world, cookieJar, { x: 10, y: 0 })

		// The wave has already spawned out, so the appended cursors are the only thing holding it.
		wave?.spawns.forEach(spawn => (spawn.remaining = 0))
		expect(wave !== null && hasFinishedSpawning(wave)).toBe(true)

		destroyTower(world, jar.id)

		const appended = wave?.spawns.slice(1) ?? []
		expect(appended).toEqual([
			{ enemyDefId: 'ant', remaining: 25, nextSpawnTick: world.tick, spacingTicks: 30, pathId: PATH_ID },
			{ enemyDefId: 'roach', remaining: 25, nextSpawnTick: world.tick, spacingTicks: 40, pathId: PATH_ID },
		])
		// 25 ants at 3 and 25 roaches at 5 is 200 exactly -- the whole budget and not a crumb more.
		expect(25 * 3 + 25 * 5).toBe(200)
		expect(wave !== null && hasFinishedSpawning(wave)).toBe(false)
	})

	it('appends nothing for a tower that owes nothing', () => {
		const world = makeWorld()
		world.night.nightId = penaltyNight.id
		const shaker = addTower(world, saltShaker, { x: 10, y: 0 })

		destroyTower(world, shaker.id)

		expect(world.night.wave?.spawns).toHaveLength(1)
	})

	it('changes nothing and does not throw when there is no wave running', () => {
		const world = makeWorld()
		world.night.nightId = penaltyNight.id
		world.night.wave = null
		world.night.phase = 'building'
		const jar = addTower(world, cookieJar, { x: 10, y: 0 })

		expect(() => destroyTower(world, jar.id)).not.toThrow()
		expect(world.night.wave).toBeNull()
		expect(world.enemies).toEqual([])
	})
})
