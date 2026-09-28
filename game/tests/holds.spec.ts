import { describe, expect, it } from 'vitest'
import { ant, fly } from '@/core/content/enemies.ts'
import { hasStatus } from '@/core/content/statuses.ts'
import { flyPaper, saltShaker, stickyTape } from '@/core/content/towers.ts'
import { createCommandQueue } from '@/core/commands.ts'
import { tick } from '@/core/sim.ts'
import { chargeStateOf } from '@/core/systems/charges.ts'
import type { EnemyDef, TowerDef } from '@/core/content/schema.ts'
import type { Enemy, EntityId, Tower, Vec2, World } from '@/core/types.ts'
import { createTestWorld } from './fixtures/world.ts'

/**
 * Holds: a root lasts until its source is spent, so who holds what is bookkeeping that can go wrong
 * in two ways step 17A fixes -- a tower leaving the board with its roots still on, and two holders
 * rooting one enemy and overwriting each other's `sourceId`. The Fly Paper is the tower that made
 * both visible, and it is asserted here beside the Sticky Tape that always had them.
 *
 * The fixture is one row 40 tiles wide with lane `a` along `y = 0`, so an enemy at `distance` d is at
 * `(d, 0)`. Towers go on directly one row off it at `y = 1`, which is off the board and fine for a
 * range query.
 */

const PATH_ID = 'a'

function makeWorld(): World {
	const world = createTestWorld()
	world.night.phase = 'wave'
	world.night.wave = {
		index: 0,
		startedAtTick: 0,
		spawns: [{ enemyDefId: 'ant', remaining: 1, nextSpawnTick: 1_000_000, spacingTicks: 60, pathId: PATH_ID }],
	}
	return world
}

/** Speed 0 unless given: most of these ask who is rooted, not who is walking. */
function addEnemy(world: World, def: EnemyDef, distance: number, speed = 0): Enemy {
	const enemy: Enemy = {
		id: world.nextEntityId++,
		defId: def.id,
		pathId: PATH_ID,
		distance,
		lateralOffsetTiles: 0,
		hp: 10_000,
		maxHp: 10_000,
		statuses: [],
		tags: [...def.tags],
		speed,
		spawnedInWaveIndex: 0,
		nextTileWriteTick: 0,
		burrowWindow: null,
		feeding: null,
		fedAt: [],
		pushback: null,
		theft: null,
		stolenItems: [],
		flags: { hidden: false, untargetable: false, fleeing: false, revealed: false, burrowed: false },
	}

	world.index.enemies[enemy.id] = world.enemies.length
	world.enemies.push(enemy)
	return enemy
}

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

function isRooted(enemy: Enemy): boolean {
	return hasStatus(enemy, 'rooted')
}

function rootedBy(enemy: Enemy): EntityId | null {
	return enemy.statuses.find(status => status.kind === 'rooted')?.sourceId ?? null
}

function onBoard(world: World, tower: Tower): boolean {
	return world.towers.some(candidate => candidate.id === tower.id)
}

describe('a Fly Paper', () => {
	it('spends exactly one charge per flyer it roots, and never touches the third or the ground', () => {
		const world = makeWorld()
		const paper = addTower(world, flyPaper, { x: 10, y: 1 })
		const flies = [addEnemy(world, fly, 9), addEnemy(world, fly, 10), addEnemy(world, fly, 11)]
		const walker = addEnemy(world, ant, 10)

		// Fires at 0 and 30; 300 ticks is ten cooldowns, eight of them with a fly still unrooted in range.
		run(world, 300)

		expect(flies.filter(isRooted)).toHaveLength(2)
		expect(flies.filter(enemy => rootedBy(enemy) === paper.id)).toHaveLength(2)
		expect(chargeStateOf(paper)?.charges).toBe(0)
		expect(isRooted(walker)).toBe(false)
		expect(onBoard(world, paper)).toBe(true)
	})

	it('stays while either fly lives, and leaves the tick after the second dies', () => {
		const world = makeWorld()
		const paper = addTower(world, flyPaper, { x: 10, y: 1 })
		const first = addEnemy(world, fly, 10)
		const second = addEnemy(world, fly, 11)

		run(world, 60)
		expect(isRooted(first) && isRooted(second)).toBe(true)
		expect(chargeStateOf(paper)?.charges).toBe(0)

		first.hp = 0
		run(world, 5)
		expect(onBoard(world, paper)).toBe(true)

		// Taken off the board by `resolve` on this tick; the paper notices in `status` on the next.
		second.hp = 0
		run(world, 1)
		expect(world.enemies).toHaveLength(0)
		expect(onBoard(world, paper)).toBe(true)

		run(world, 1)
		expect(onBoard(world, paper)).toBe(false)
	})
})

describe('two Fly Papers side by side', () => {
	it('root four different Flies and spend four charges between them', () => {
		const world = makeWorld()
		// Mirror images across the lane, so both see the same nearest fly on the same tick. Both target
		// before either fires -- the case a check in `pickTargets` alone cannot see.
		const left = addTower(world, flyPaper, { x: 10, y: 1 })
		const right = addTower(world, flyPaper, { x: 10, y: -1 })
		const flies = [10, 9.5, 10.5, 9].map(distance => addEnemy(world, fly, distance))

		run(world, 120)

		expect(flies.every(isRooted)).toBe(true)
		expect(flies.filter(enemy => rootedBy(enemy) === left.id)).toHaveLength(2)
		expect(flies.filter(enemy => rootedBy(enemy) === right.id)).toHaveLength(2)
		expect(chargeStateOf(left)?.charges).toBe(0)
		expect(chargeStateOf(right)?.charges).toBe(0)
	})
})

describe('a Salt Shaker beside a Sticky Tape', () => {
	it('still shoots the Ant the tape is holding: only a holder skips a held enemy', () => {
		const world = makeWorld()
		const tape = addTower(world, stickyTape, { x: 10, y: 1 })
		const shaker = addTower(world, saltShaker, { x: 11, y: 1 })
		const held = addEnemy(world, ant, 10)

		run(world, 1)
		expect(rootedBy(held)).toBe(tape.id)

		run(world, 120)
		expect(shaker.targetEnemyId).toBe(held.id)
		expect(held.hp).toBeLessThan(held.maxHp)
	})
})

describe('selling a holder mid-root', () => {
	it('lets a Sticky Tape s Ant go the same tick, and it is walking again', () => {
		const world = makeWorld()
		const tape = addTower(world, stickyTape, { x: 10, y: 1 })
		const held = addEnemy(world, ant, 10, ant.speedTilesPerTick)

		run(world, 30)
		expect(rootedBy(held)).toBe(tape.id)
		const stuckAt = held.distance
		run(world, 30)
		expect(held.distance).toBe(stuckAt)

		const queue = createCommandQueue()
		queue.enqueue({ kind: 'SellTower', towerId: tape.id })
		tick(world, queue)

		expect(onBoard(world, tape)).toBe(false)
		expect(isRooted(held)).toBe(false)

		run(world, 1)
		expect(held.distance).toBeGreaterThan(stuckAt)
	})

	it('lets a Fly Paper s Fly go the same tick, and it is flying again', () => {
		const world = makeWorld()
		const paper = addTower(world, flyPaper, { x: 10, y: 1 })
		const held = addEnemy(world, fly, 10, fly.speedTilesPerTick)

		run(world, 30)
		expect(rootedBy(held)).toBe(paper.id)
		const stuckAt = held.distance

		const queue = createCommandQueue()
		queue.enqueue({ kind: 'SellTower', towerId: paper.id })
		tick(world, queue)

		expect(onBoard(world, paper)).toBe(false)
		expect(isRooted(held)).toBe(false)

		run(world, 1)
		expect(held.distance).toBeGreaterThan(stuckAt)
	})
})
