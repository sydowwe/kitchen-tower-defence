import { describe, expect, it } from 'vitest'
import { ant, fruitFly } from '@/core/content/enemies.ts'
import { cardboardBox } from '@/core/content/towers.ts'
import { createCommandQueue } from '@/core/commands.ts'
import { TileFlags } from '@/core/map.ts'
import { tick } from '@/core/sim.ts'
import { barricadeAhead, barricadeHolding } from '@/core/systems/barricades.ts'
import { sellTower } from '@/core/systems/placement.ts'
import type { EnemyDef } from '@/core/content/schema.ts'
import type { Enemy, Tower, Vec2, World } from '@/core/types.ts'
import { createTestWorld } from './fixtures/world.ts'

/**
 * Being stopped is the half of step 10 that can silently be wrong -- a queue that eats a box is
 * visible, a queue that is 0.4 tiles further back than it should be is not -- so every number here
 * is spelled out rather than derived from the system under test.
 *
 * The fixture's map is one row 40 tiles wide with lane `a` running (0,0) to (39,0), so a tile's arc
 * distance is its `x` and a box on tile 10 sits at distance 10. The lane test builds a second lane,
 * because no authored map has one until step 21.
 */

const PATH_ID = 'a'

/** Where the box goes, in tiles along the lane and in the tile it stands on. */
const BOX_DISTANCE = 10

/** `HOLD_GAP_TILES` in `core/systems/barricades.ts`, restated so the assertions are not circular. */
const HOLD_AT = BOX_DISTANCE - 0.5

function makeWorld(): World {
	const world = createTestWorld()
	// A wave permanently mid-spawn: the fixture's night is over, and a terminal phase runs no systems
	// at all. The same trick `tests/charges.spec.ts` uses.
	world.night.phase = 'wave'
	world.night.wave = {
		index: 0,
		startedAtTick: 0,
		spawns: [{ enemyDefId: 'ant', remaining: 1, nextSpawnTick: 1_000_000, spacingTicks: 60, pathId: PATH_ID }],
	}
	return world
}

/**
 * An enemy standing at `distance`, with its def's real speed and enough HP that nothing in this file
 * kills it. Pushed on directly rather than spawned, because every assertion here is about where an
 * enemy already on the board ends its tick.
 */
function addEnemy(world: World, def: EnemyDef, distance: number, pathId = PATH_ID): Enemy {
	const enemy: Enemy = {
		id: world.nextEntityId++,
		defId: def.id,
		pathId,
		distance,
		hp: 10_000,
		maxHp: 10_000,
		statuses: [],
		tags: [...def.tags],
		speed: def.speedTilesPerTick,
		spawnedInWaveIndex: 0,
		stolenItems: [],
		flags: { hidden: false, untargetable: false, fleeing: false },
	}

	world.index.enemies[enemy.id] = world.enemies.length
	world.enemies.push(enemy)
	return enemy
}

/** A box on `tile`, on directly rather than through `placeTower` so the wallet is not part of this. */
function addBox(world: World, tile: Vec2 = { x: BOX_DISTANCE, y: 0 }): Tower {
	const tower: Tower = {
		id: world.nextEntityId++,
		defId: cardboardBox.id,
		tile: { x: tile.x, y: tile.y },
		hp: cardboardBox.maxHp,
		maxHp: cardboardBox.maxHp,
		tier: 0,
		targetingMode: cardboardBox.defaultTargetingMode,
		targetEnemyId: null,
		cooldownTicks: 0,
		state: null,
		totalInvested: cardboardBox.cost,
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

describe('an enemy meeting a box', () => {
	it('is not shoved backwards when the box goes down in front of it', () => {
		const world = makeWorld()
		const box = addBox(world)
		// Inside the 0.5 gap already: the naive `min(next, holdAt)` would put this ant at 9.5, which on
		// screen is an ant teleporting 0.4 tiles backwards the instant a box is placed.
		const enemy = addEnemy(world, ant, BOX_DISTANCE - 0.1)

		run(world, 1)

		// `toBeCloseTo` and not `toBe`: the clamp recovers where the ant stood by subtracting the step
		// `movementSystem` just added, and `(9.9 + 1/60) - 1/60` is 9.899999999999999. What the
		// assertion is about is that it is neither the 9.5 hold point nor 0.0167 further on.
		expect(enemy.distance).toBeCloseTo(BOX_DISTANCE - 0.1, 12)
		expect(box.hp).toBe(cardboardBox.maxHp - ant.meleeDamagePerTick)
	})

	it('walks on at full speed when the box is behind it', () => {
		const world = makeWorld()
		const box = addBox(world)
		const enemy = addEnemy(world, ant, BOX_DISTANCE + 0.1)

		run(world, 1)

		expect(enemy.distance).toBeCloseTo(BOX_DISTANCE + 0.1 + ant.speedTilesPerTick, 12)
		expect(box.hp).toBe(cardboardBox.maxHp)
	})

	it('comes to rest exactly half a tile short of it and stays there', () => {
		const world = makeWorld()
		addBox(world)
		const enemy = addEnemy(world, ant, 5)

		// 4.5 tiles at 1 tile/sec is 270 ticks; 400 leaves it standing at the box for over two seconds.
		const seen: number[] = []
		const queue = createCommandQueue()
		for (let index = 0; index < 400; index++) {
			tick(world, queue)
			seen.push(enemy.distance)
		}

		expect(enemy.distance).toBe(HOLD_AT)
		// Never overshot on any tick, and never oscillated back off the hold point once it arrived --
		// 4.5 tiles is 270 ticks of walking, so everything from tick 300 on is standing at the box.
		expect(Math.max(...seen)).toBe(HOLD_AT)
		expect(seen.slice(300).every(distance => distance === HOLD_AT)).toBe(true)
	})

	it('is not held by a box dropped on a tile it has already passed, however far it walks', () => {
		const world = makeWorld()
		const box = addBox(world)
		const enemy = addEnemy(world, ant, BOX_DISTANCE + 2)

		run(world, 600)

		// 600 ticks at 1 tile/sec is 10 tiles, and the lane is 39 long, so nothing here is a leak.
		expect(enemy.distance).toBeCloseTo(BOX_DISTANCE + 12, 9)
		expect(box.hp).toBe(cardboardBox.maxHp)
	})

	it('flies straight over it: a Fruit Fly is air, and a box is on the floor', () => {
		const world = makeWorld()
		const box = addBox(world)
		const fly = addEnemy(world, fruitFly, BOX_DISTANCE - 1)

		// 60 ticks at 2 tiles/sec carries it from 9 to 11, straight through the box's own distance.
		run(world, 60)

		expect(fly.distance).toBeCloseTo(BOX_DISTANCE + 1, 9)
		expect(box.hp).toBe(cardboardBox.maxHp)
		expect(barricadeAhead(world, fly)).toBeNull()
		expect(barricadeHolding(world, fly)).toBeNull()
	})
})

describe('a queue chewing a box', () => {
	it('takes one enemy s worth of hp off per enemy per tick', () => {
		const world = makeWorld()
		const box = addBox(world)
		for (const distance of [HOLD_AT, HOLD_AT + 0.1, HOLD_AT + 0.2]) {
			addEnemy(world, ant, distance)
		}

		run(world, 1)
		expect(box.hp).toBeCloseTo(cardboardBox.maxHp - 3 * ant.meleeDamagePerTick, 12)

		run(world, 9)
		// 3 ants x 10 ticks x 1/60 of a point each: half a point of the box's 200.
		expect(box.hp).toBeCloseTo(cardboardBox.maxHp - 30 * ant.meleeDamagePerTick, 10)
		expect(cardboardBox.maxHp - box.hp).toBeCloseTo(0.5, 10)
	})

	it('all agree they are chewing, and say so through barricadeHolding', () => {
		const world = makeWorld()
		const box = addBox(world)
		const front = addEnemy(world, ant, HOLD_AT)
		const behind = addEnemy(world, ant, 5)

		run(world, 1)

		expect(barricadeHolding(world, front)?.id).toBe(box.id)
		expect(barricadeHolding(world, behind)).toBeNull()
		expect(barricadeAhead(world, behind)?.tower).toBe(box)
		expect(barricadeAhead(world, behind)?.distance).toBeCloseTo(BOX_DISTANCE, 9)
	})

	it('is released by the box dying: one event, no jump, and full speed from the next tick', () => {
		const world = makeWorld()
		const box = addBox(world)
		const first = addEnemy(world, ant, HOLD_AT)
		const second = addEnemy(world, ant, HOLD_AT)
		// One ant's worth of chew left, so the box dies on the first of the two and the second finds
		// nothing to bite -- the stale-position case.
		box.hp = ant.meleeDamagePerTick

		run(world, 1)

		expect(world.events.filter(event => event.kind === 'towerDestroyed')).toHaveLength(1)
		expect(world.towers).toEqual([])
		// The tick the box died, nobody moved: the clamp had already run for both of them.
		expect(first.distance).toBe(HOLD_AT)
		expect(second.distance).toBe(HOLD_AT)

		run(world, 1)

		// Exactly one tick's step each on the tick after -- no catch-up for the ticks spent chewing.
		expect(first.distance).toBeCloseTo(HOLD_AT + ant.speedTilesPerTick, 12)
		expect(second.distance).toBeCloseTo(HOLD_AT + ant.speedTilesPerTick, 12)
	})

	it('is released by the box being sold, which pays a refund and destroys nothing', () => {
		const world = makeWorld()
		const box = addBox(world)
		const enemy = addEnemy(world, ant, HOLD_AT)

		run(world, 30)
		expect(enemy.distance).toBe(HOLD_AT)
		expect(box.hp).toBeCloseTo(cardboardBox.maxHp - 30 * ant.meleeDamagePerTick, 10)

		// Directly rather than through the command queue: `tick` clears `world.events` at the top, so
		// the event has to be read before the next one runs.
		expect(sellTower(world, box.id)).toBe(true)
		expect(world.events.filter(event => event.kind === 'towerSold')).toHaveLength(1)
		expect(world.events.filter(event => event.kind === 'towerDestroyed')).toHaveLength(0)

		run(world, 60)

		expect(enemy.distance).toBeCloseTo(HOLD_AT + 1, 9)
	})
})

describe('a box on a two-lane map', () => {
	/**
	 * Three rows, with lane `a` along the top and lane `b` two tiles below it. A box on lane `a` is 2
	 * tiles off lane `b`, which is well outside its half-width of 0.5 -- and `nearestOnPath` answers
	 * with a distance for both lanes either way, which is the whole reason the offset is tested.
	 */
	function twoLaneWorld(): World {
		const world = makeWorld()
		const width = world.map.widthTiles
		world.map.heightTiles = 3
		world.map.flags = Array.from({ length: width * 3 }, () => TileFlags.BUILDABLE | TileFlags.TRACK)
		world.map.paths.push({
			id: 'b',
			waypoints: [
				{ x: 0, y: 2 },
				{ x: width - 1, y: 2 },
			],
			lengthTiles: width - 1,
		})
		return world
	}

	it('stops its own lane and leaves the other one walking', () => {
		const world = twoLaneWorld()
		const box = addBox(world)
		const onA = addEnemy(world, ant, 5, 'a')
		const onB = addEnemy(world, ant, 5, 'b')

		run(world, 400)

		expect(onA.distance).toBe(HOLD_AT)
		// 400 ticks at 1 tile/sec, straight past the box's arc distance without slowing.
		expect(onB.distance).toBeCloseTo(5 + 400 / 60, 9)
		expect(barricadeAhead(world, onB)).toBeNull()
		// Only lane `a`'s ant ever bit it: 130 of the 400 ticks were spent standing at the box, and the
		// tolerance here is a couple of ticks either side of when it arrived.
		expect(box.hp).toBeCloseTo(cardboardBox.maxHp - 130 * ant.meleeDamagePerTick, 1)
	})
})
