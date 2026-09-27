import { describe, expect, it } from 'vitest'
import { ant, fly } from '@/core/content/enemies.ts'
import { gasStoveBurner, mousetrap, saltShaker } from '@/core/content/towers.ts'
import { createCommandQueue } from '@/core/commands.ts'
import { tick } from '@/core/sim.ts'
import { projectedNoisePerSecond } from '@/core/systems/noise.ts'
import { hasEffect } from '@/core/tiles.ts'
import type { EnemyDef, TowerDef } from '@/core/content/schema.ts'
import type { Enemy, Tower, Vec2, World } from '@/core/types.ts'
import { createTestWorld } from './fixtures/world.ts'

/**
 * The Gas Stove Burner: `tileEffectSystem` writing heat under it, the tile system burning what stands
 * there, and the once-a-second noise rule.
 *
 * The fixture is one row 40 tiles wide, tile 0 buildable and every other tile track, so an enemy at
 * `distance` d stands on tile `(d, 0)` and a Burner -- `path_only` -- goes on any tile but 0.
 */

const PATH_ID = 'a'
const BURNER_TILE: Vec2 = { x: 10, y: 0 }

/** A wave permanently mid-spawn, so no system sees a terminal phase. */
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

/** Speed 0: held on its tile the way a root would, without a tower in the picture. */
function addEnemy(world: World, def: EnemyDef, distance: number): Enemy {
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
		speed: 0,
		spawnedInWaveIndex: 0,
		nextTileWriteTick: 0,
		burrowWindow: null,
		stolenItems: [],
		flags: { hidden: false, untargetable: false, fleeing: false, revealed: false, burrowed: false },
	}

	world.index.enemies[enemy.id] = world.enemies.length
	world.enemies.push(enemy)
	return enemy
}

function addTower(world: World, def: TowerDef, tile: Vec2): Tower {
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
		state: null,
		totalInvested: def.cost,
	}

	world.index.towers[tower.id] = world.towers.length
	world.towers.push(tower)
	return tower
}

/** Every `towerFired` from `towerId` over `ticks` ticks. */
function firedBy(world: World, towerId: number, ticks: number): { noise: number }[] {
	const queue = createCommandQueue()
	const fired: { noise: number }[] = []
	for (let index = 0; index < ticks; index++) {
		tick(world, queue)
		for (const event of world.events) {
			if (event.kind === 'towerFired' && event.towerId === towerId) {
				fired.push({ noise: event.noise })
			}
		}
	}
	return fired
}

function run(world: World, ticks: number): void {
	const queue = createCommandQueue()
	for (let index = 0; index < ticks; index++) {
		tick(world, queue)
	}
}

describe('the Gas Stove Burner s heat', () => {
	it('is on its tile at the end of the tick it is placed, every tick after, and gone the tick it is sold', () => {
		const world = makeWorld()
		const queue = createCommandQueue()

		queue.enqueue({ kind: 'PlaceTower', defId: gasStoveBurner.id, tile: BURNER_TILE })
		tick(world, queue)
		const burner = world.towers[0]
		expect(burner?.defId).toBe('gasStoveBurner')
		expect(hasEffect(world, BURNER_TILE, 'heat')).toBe(true)

		for (let index = 0; index < 600; index++) {
			tick(world, queue)
			expect(hasEffect(world, BURNER_TILE, 'heat')).toBe(true)
		}

		queue.enqueue({ kind: 'SellTower', towerId: burner!.id })
		tick(world, queue)
		expect(world.towers).toHaveLength(0)
		expect(hasEffect(world, BURNER_TILE, 'heat')).toBe(false)
		// The cell is released with its last effect, not left as an empty shell.
		expect(world.tiles).toHaveLength(0)
	})

	it('takes 14 x 1.5 off an Ant held on it for 60 ticks, through the swarm row of the matrix', () => {
		const world = makeWorld()
		addTower(world, gasStoveBurner, BURNER_TILE)
		const enemy = addEnemy(world, ant, BURNER_TILE.x)

		run(world, 60)

		expect(enemy.maxHp - enemy.hp).toBeCloseTo(14 * 1.5, 6)
	})

	it('takes nothing off a Fly over the same tile: a flyer is not on the floor', () => {
		const world = makeWorld()
		addTower(world, gasStoveBurner, BURNER_TILE)
		const enemy = addEnemy(world, fly, BURNER_TILE.x)

		run(world, 60)

		expect(enemy.hp).toBe(enemy.maxHp)
	})

	it('touches nothing a tile away at base radius', () => {
		const world = makeWorld()
		addTower(world, gasStoveBurner, BURNER_TILE)
		const enemy = addEnemy(world, ant, BURNER_TILE.x + 1)

		run(world, 60)

		expect(enemy.hp).toBe(enemy.maxHp)
		expect(hasEffect(world, { x: BURNER_TILE.x + 1, y: 0 }, 'heat')).toBe(false)
	})

	it('reaches the tiles either side at tier 3', () => {
		const world = makeWorld()
		const burner = addTower(world, gasStoveBurner, BURNER_TILE)
		burner.tier = 3

		run(world, 1)

		expect(hasEffect(world, { x: BURNER_TILE.x - 1, y: 0 }, 'heat')).toBe(true)
		expect(hasEffect(world, BURNER_TILE, 'heat')).toBe(true)
		expect(hasEffect(world, { x: BURNER_TILE.x + 1, y: 0 }, 'heat')).toBe(true)
		expect(hasEffect(world, { x: BURNER_TILE.x + 2, y: 0 }, 'heat')).toBe(false)
	})
})

describe('the Gas Stove Burner s noise', () => {
	it('is one towerFired of noise 2 per second while an enemy stands on its ring: two in 120 ticks', () => {
		const world = makeWorld()
		const burner = addTower(world, gasStoveBurner, BURNER_TILE)
		addEnemy(world, ant, BURNER_TILE.x)

		expect(firedBy(world, burner.id, 120)).toEqual([{ noise: 2 }, { noise: 2 }])
	})

	it('is nothing at all with the ring empty, so an idle Burner never wakes the house', () => {
		const world = makeWorld()
		const burner = addTower(world, gasStoveBurner, BURNER_TILE)
		addEnemy(world, ant, BURNER_TILE.x + 3)

		expect(firedBy(world, burner.id, 120)).toEqual([])
		expect(world.noise.level).toBe(0)
	})

	it('is nothing for a Fly over the ring, which it is not burning', () => {
		const world = makeWorld()
		const burner = addTower(world, gasStoveBurner, BURNER_TILE)
		addEnemy(world, fly, BURNER_TILE.x)

		expect(firedBy(world, burner.id, 120)).toEqual([])
	})

	it('projects to 2/sec on the card, and leaves every firing tower s projection alone', () => {
		expect(projectedNoisePerSecond(gasStoveBurner)).toBe(2)
		expect(projectedNoisePerSecond(saltShaker)).toBe(0)
		expect(projectedNoisePerSecond(mousetrap)).toBeCloseTo((2 * 60) / 396, 10)
	})
})
