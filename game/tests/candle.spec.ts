import { describe, expect, it } from 'vitest'
import { ant, moth } from '@/core/content/enemies.ts'
import { findStatus } from '@/core/content/statuses.ts'
import { candle } from '@/core/content/towers.ts'
import { createCommandQueue } from '@/core/commands.ts'
import { tick } from '@/core/sim.ts'
import { LIGHT_MAX_OFFSET_TILES, lightSources } from '@/core/systems/light.ts'
import type { EnemyDef } from '@/core/content/schema.ts'
import type { Enemy, Tower, Vec2, World } from '@/core/types.ts'
import { createTestWorld } from './fixtures/world.ts'

/**
 * The Candle is config on two systems that already existed -- the aura and the light registry -- so
 * what is asserted is that both actually pick it up, at the right numbers.
 *
 * The fixture is one row 40 tiles wide with lane `a` along `y = 0`. The moth assertion follows the
 * Nightlight's in `tests/light.spec.ts` exactly: a lamp at `(10, 3)`, three tiles off the lane.
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

function addEnemy(world: World, def: EnemyDef, distance: number, speed: number): Enemy {
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
		stolenItems: [],
		flags: { hidden: false, untargetable: false, fleeing: false, revealed: false, burrowed: false },
	}

	world.index.enemies[enemy.id] = world.enemies.length
	world.enemies.push(enemy)
	return enemy
}

function addCandle(world: World, tile: Vec2, tier = 0): Tower {
	const tower: Tower = {
		id: world.nextEntityId++,
		defId: candle.id,
		tile: { x: tile.x, y: tile.y },
		hp: candle.maxHp,
		maxHp: candle.maxHp,
		tier,
		targetingMode: candle.defaultTargetingMode,
		targetEnemyId: null,
		cooldownTicks: 0,
		shotsFired: 0,
		state: null,
		totalInvested: candle.cost,
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

describe('the Candle as a light', () => {
	it('is in the light registry', () => {
		const world = makeWorld()
		const lit = addCandle(world, { x: 10, y: 1 })

		expect(lightSources(world).map(tower => tower.id)).toEqual([lit.id])
	})

	it('pulls a passing Moth off the lane to the clamp, exactly as a Nightlight does', () => {
		const world = makeWorld()
		addCandle(world, { x: 10, y: 3 })
		const enemy = addEnemy(world, moth, 0, moth.speedTilesPerTick)

		// Level with the lamp after 375 ticks at 1.6 tiles/sec, in reach since x = 6.
		run(world, 375)

		expect(enemy.lateralOffsetTiles).toBeCloseTo(LIGHT_MAX_OFFSET_TILES, 10)
	})
})

describe('the Candle as an aura', () => {
	it('takes 5 x 1.5 off an Ant held in its radius for 60 ticks, through the swarm row', () => {
		const world = makeWorld()
		addCandle(world, { x: 10, y: 1 })
		const enemy = addEnemy(world, ant, 10, 0)

		run(world, 60)

		expect(enemy.maxHp - enemy.hp).toBeCloseTo(5 * 1.5, 6)
		expect(findStatus(enemy, 'burn')).toBeUndefined()
	})

	it('at tier 3, stacks burn to 3 in three pulses and never to 4', () => {
		const world = makeWorld()
		addCandle(world, { x: 10, y: 1 }, 3)
		const enemy = addEnemy(world, ant, 10, 0)

		// Pulses on ticks 0, 6 and 12.
		run(world, 18)
		expect(findStatus(enemy, 'burn')?.stacks).toBe(3)

		run(world, 120)
		expect(findStatus(enemy, 'burn')?.stacks).toBe(3)
	})
})
