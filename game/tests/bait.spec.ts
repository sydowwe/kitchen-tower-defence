import { describe, expect, it } from 'vitest'
import { isBait } from '@/core/content/behaviours.ts'
import { ant, beetle, fly, mold } from '@/core/content/enemies.ts'
import { honeyPot } from '@/core/content/towers.ts'
import { createCommandQueue } from '@/core/commands.ts'
import { tick } from '@/core/sim.ts'
import { BAIT_CATCH_WINDOW_TILES, BAIT_LEAN_GAP_TILES, BAIT_LEAN_TILES_PER_TICK } from '@/core/systems/bait.ts'
import type { BaitBehaviour } from '@/core/content/behaviours.ts'
import type { CommandQueue } from '@/core/commands.ts'
import type { EnemyDef } from '@/core/content/schema.ts'
import type { Enemy, Tower, Vec2, World } from '@/core/types.ts'
import { createTestWorld } from './fixtures/world.ts'

/**
 * The Honey Pot's hold, to the tick. The fixture's lane `a` runs (0,0) to (39,0) along `+x`, so a
 * tile's arc distance is its `x` and a pot at `(x, 2)` projects onto the lane at `x`, two tiles to the
 * positive side of it.
 *
 * Every duration and distance is read off `bait.durationTicks` and the `BAIT_*` constants rather
 * than written as a literal, so 17D re-tuning the values moves no assertion here.
 */

const PATH_ID = 'a'

/** Where the pot projects onto the lane. */
const HOLD = 10

/** How far off the lane the pot stands. Inside its 3-tile bait radius. */
const POT_SIDE = 2

const BAIT = honeyPot.behaviours.find(isBait) as BaitBehaviour

function makeWorld(): World {
	const world = createTestWorld()
	// A wave permanently mid-spawn, so the phase is not terminal: `tests/barricades.spec.ts`'s trick.
	world.night.phase = 'wave'
	world.night.wave = {
		index: 0,
		startedAtTick: 0,
		spawns: [{ enemyDefId: 'ant', remaining: 1, nextSpawnTick: 1_000_000, spacingTicks: 60, pathId: PATH_ID }],
	}
	return world
}

/** An enemy at `distance` with its def's real speed and more HP than anything here can take off it. */
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
		speed: def.speedTilesPerTick,
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

/** A pot on `tile`, put down directly so the wallet is not part of this. */
function addPot(world: World, tile: Vec2 = { x: HOLD, y: POT_SIDE }): Tower {
	const tower: Tower = {
		id: world.nextEntityId++,
		defId: honeyPot.id,
		tile: { x: tile.x, y: tile.y },
		hp: honeyPot.maxHp,
		maxHp: honeyPot.maxHp,
		tier: 0,
		targetingMode: honeyPot.defaultTargetingMode,
		targetEnemyId: null,
		cooldownTicks: 0,
		shotsFired: 0,
		state: null,
		totalInvested: honeyPot.cost,
	}

	world.index.towers[tower.id] = world.towers.length
	world.towers.push(tower)
	return tower
}

function run(world: World, ticks: number, queue: CommandQueue = createCommandQueue()): void {
	for (let index = 0; index < ticks; index++) {
		tick(world, queue)
	}
}

describe('an enemy at a Honey Pot', () => {
	it('is frozen for exactly durationTicks, then walks on from the same distance plus one step', () => {
		const world = makeWorld()
		const pot = addPot(world)
		const enemy = addEnemy(world, ant, HOLD)

		// Tick 0: movement takes it to HOLD + one step, inside the window, and it is caught there.
		run(world, 1)
		const caughtAt = HOLD + ant.speedTilesPerTick
		expect(enemy.distance).toBe(caughtAt)
		expect(enemy.feeding).toEqual({ towerId: pot.id, distance: caughtAt, releaseTick: BAIT.durationTicks })

		// Ticks 1 to durationTicks - 1 all end exactly where it was caught.
		for (let index = 1; index < BAIT.durationTicks; index++) {
			run(world, 1)
			expect(enemy.distance).toBe(caughtAt)
		}
		expect(enemy.feeding).not.toBeNull()

		// Tick durationTicks: let go before the clamp, so one ordinary step and no jump.
		run(world, 1)
		expect(enemy.feeding).toBeNull()
		expect(enemy.distance).toBe(caughtAt + ant.speedTilesPerTick)
	})

	it('leans toward the pot, never past the lean target, and walks back to exactly 0', () => {
		const world = makeWorld()
		addPot(world)
		const enemy = addEnemy(world, ant, HOLD)
		const target = POT_SIDE - BAIT_LEAN_GAP_TILES

		const leaning: number[] = []
		for (let index = 0; index < BAIT.durationTicks; index++) {
			run(world, 1)
			leaning.push(enemy.lateralOffsetTiles)
		}

		// Toward the positive side, one step a tick, stopping at the target and holding it.
		expect(leaning[0]).toBeCloseTo(BAIT_LEAN_TILES_PER_TICK, 12)
		expect(Math.max(...leaning)).toBe(target)
		expect(leaning.every((offset, index) => index === 0 || offset >= (leaning[index - 1] ?? 0))).toBe(true)
		expect(leaning.at(-1)).toBe(target)

		// Released: back onto the lane, and exactly 0 rather than a hair off it.
		run(world, Math.ceil(target / BAIT_LEAN_TILES_PER_TICK) + 1)
		expect(enemy.feeding).toBeNull()
		expect(enemy.lateralOffsetTiles).toBe(0)
	})

	it('leans the other way for a pot on the other side of the lane', () => {
		const world = makeWorld()
		addPot(world, { x: HOLD, y: -POT_SIDE })
		const enemy = addEnemy(world, ant, HOLD)

		run(world, BAIT.durationTicks - 1)

		expect(enemy.lateralOffsetTiles).toBe(-(POT_SIDE - BAIT_LEAN_GAP_TILES))
	})
})

describe('feeders chewing the pot', () => {
	it('take the sum of their meleeDamagePerTick off it every tick', () => {
		const world = makeWorld()
		const pot = addPot(world)
		addEnemy(world, ant, HOLD)
		addEnemy(world, beetle, HOLD)

		// Caught on tick 0; the chew starts on tick 1.
		run(world, 1)
		expect(pot.hp).toBe(honeyPot.maxHp)

		run(world, 1)
		expect(pot.hp).toBeCloseTo(honeyPot.maxHp - (ant.meleeDamagePerTick + beetle.meleeDamagePerTick), 12)

		run(world, 1)
		expect(pot.hp).toBeCloseTo(honeyPot.maxHp - 2 * (ant.meleeDamagePerTick + beetle.meleeDamagePerTick), 12)
	})

	it('destroys it at 0 and releases every feeder that same tick, before and after the killing bite', () => {
		const world = makeWorld()
		const pot = addPot(world)
		const before = addEnemy(world, ant, HOLD)
		const killer = addEnemy(world, ant, HOLD)
		const after = addEnemy(world, ant, HOLD)

		run(world, 1)
		expect([before, killer, after].every(enemy => enemy.feeding?.towerId === pot.id)).toBe(true)

		// One and a half bites left: `before` takes it to half a bite, `killer` to 0, and `after` is later
		// in `world.enemies` than the bite that emptied it.
		pot.hp = 1.5 * ant.meleeDamagePerTick
		run(world, 1)

		expect(world.towers.some(tower => tower.id === pot.id)).toBe(false)
		expect(world.events.filter(event => event.kind === 'towerDestroyed')).toHaveLength(1)
		expect(before.feeding).toBeNull()
		expect(killer.feeding).toBeNull()
		expect(after.feeding).toBeNull()
	})

	it('are all let go on the tick the pot is sold', () => {
		const world = makeWorld()
		const pot = addPot(world)
		const first = addEnemy(world, ant, HOLD)
		const second = addEnemy(world, beetle, HOLD)
		const queue = createCommandQueue()

		run(world, 1, queue)
		expect(first.feeding).not.toBeNull()
		expect(second.feeding).not.toBeNull()
		const frozenAt = first.distance

		queue.enqueue({ kind: 'SellTower', towerId: pot.id })
		run(world, 1, queue)

		expect(first.feeding).toBeNull()
		expect(second.feeding).toBeNull()
		expect(first.distance).toBe(frozenAt + ant.speedTilesPerTick)
	})
})

describe('who a pot catches', () => {
	it('never catches a flyer: a Fly crossing the window keeps feeding null and an offset of 0', () => {
		const world = makeWorld()
		addPot(world)
		const enemy = addEnemy(world, fly, HOLD - 0.5)

		// Well past the far edge of the window at a Fly's pace.
		const ticks = Math.ceil((0.5 + BAIT_CATCH_WINDOW_TILES + 1) / fly.speedTilesPerTick)
		for (let index = 0; index < ticks; index++) {
			run(world, 1)
			expect(enemy.feeding).toBeNull()
			expect(enemy.lateralOffsetTiles).toBe(0)
		}
		expect(enemy.distance).toBeGreaterThan(HOLD + BAIT_CATCH_WINDOW_TILES)
	})

	it('feeds an enemy once, and a second pot further along the lane feeds it once more', () => {
		const world = makeWorld()
		const first = addPot(world)
		const second = addPot(world, { x: HOLD + 5, y: POT_SIDE })
		const enemy = addEnemy(world, ant, HOLD)

		// Through the first feed and on to the second pot: 5 tiles at an ant's pace, plus both feeds.
		const catches: number[] = []
		const ticks = 2 * BAIT.durationTicks + Math.ceil(5 / ant.speedTilesPerTick) + 60
		for (let index = 0; index < ticks; index++) {
			const wasFeeding = enemy.feeding !== null
			run(world, 1)
			if (!wasFeeding && enemy.feeding !== null) {
				catches.push(enemy.feeding.towerId)
			}
		}

		expect(catches).toEqual([first.id, second.id])
		expect(enemy.fedAt).toEqual([first.id, second.id])
		expect(enemy.feeding).toBeNull()
	})

	it('never catches a Mold, which does not walk', () => {
		const world = makeWorld()
		addPot(world)
		const enemy = addEnemy(world, mold, HOLD + BAIT_CATCH_WINDOW_TILES / 2)

		for (let index = 0; index < BAIT.durationTicks; index++) {
			run(world, 1)
			expect(enemy.feeding).toBeNull()
			expect(enemy.lateralOffsetTiles).toBe(0)
		}
	})
})

describe('a feeder when the house wakes', () => {
	it('lets go and is further from the fridge one tick later', () => {
		const world = makeWorld()
		addPot(world)
		const enemy = addEnemy(world, ant, HOLD)

		run(world, 10)
		const frozenAt = enemy.distance
		expect(enemy.feeding).not.toBeNull()

		// What `core/systems/noise.ts`'s wake does to every enemy on the board.
		enemy.flags.fleeing = true
		run(world, 1)

		expect(enemy.feeding).toBeNull()
		expect(enemy.distance).toBeLessThan(frozenAt)
	})
})

describe('a whole feed', () => {
	it('draws nothing from world.rng', () => {
		const world = makeWorld()
		addPot(world)
		const enemy = addEnemy(world, ant, HOLD)
		const state = world.rng.state

		run(world, BAIT.durationTicks + 1)

		expect(enemy.fedAt).toHaveLength(1)
		expect(enemy.feeding).toBeNull()
		expect(world.rng.state).toBe(state)
	})
})
