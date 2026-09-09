import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { reveal } from '@/core/content/behaviours.ts'
import { fly, moth } from '@/core/content/enemies.ts'
import { nightlight, TOWERS } from '@/core/content/towers.ts'
import { createCommandQueue } from '@/core/commands.ts'
import { applyLateralOffset, samplePath } from '@/core/path.ts'
import { tick } from '@/core/sim.ts'
import { LIGHT_MAX_OFFSET_TILES } from '@/core/systems/light.ts'
import { enemyPosition } from '@/core/systems/spatial.ts'
import { isTargetable } from '@/core/systems/targeting.ts'
import type { EnemyDef, TowerDef } from '@/core/content/schema.ts'
import type { Enemy, Tower, Vec2, World } from '@/core/types.ts'
import { createTestWorld } from './fixtures/world.ts'

/**
 * The one enemy that leaves the polyline, and the proof that it does not.
 *
 * The fixture's map is one row 40 tiles wide with lane `a` running (0,0) to (39,0), so an enemy's arc
 * distance is its `x`, the heading is 0 throughout, and the path normal `(-sin 0, cos 0)` is `(0, 1)`
 * -- which makes every offset below readable as a `y`. A lamp at `(10, 3)` is therefore three tiles
 * off the lane on the positive side, and the moth's target offset while it is level with it is `+3`.
 *
 * **A lamp placed *on* the lane pulls nothing**: its normal component is 0, and the moth is already
 * going there. Every attraction assertion here puts the lamp beside the track for that reason.
 */

const PATH_ID = 'a'

/** `LIGHT_ATTRACTION_TILES` is 5, so a lamp 3 tiles off the lane is in reach over `x` in [6, 14]. */
const LAMP_OFFSET_TILES = 3
const LAMP_X = 10

/** The Moth's own speed, in tiles per tick: 1.6/sec. Restated so nothing here is circular. */
const MOTH_SPEED = 1.6 / 60

/** The tick the moth is level with a lamp at `LAMP_X`, and the tick it is clear of one 3 tiles off. */
const TICKS_TO_LEAVE_RANGE = Math.ceil(14 / MOTH_SPEED)

/**
 * A lamp that reveals and does **not** attract. There is no such content today, which is exactly why
 * it is asserted: `attractsLightDrawn` is load-bearing and nothing in `TOWERS` would notice if the
 * system ignored it.
 */
const testDarkLamp: TowerDef = {
	...nightlight,
	id: 'testDarkLamp',
	nameKey: 'tower.testDarkLamp.name',
	descriptionKey: 'tower.testDarkLamp.description',
	behaviours: [reveal({ radiusTiles: 4, attractsLightDrawn: false })],
}

const REGISTERED: TowerDef[] = [testDarkLamp]

beforeAll(() => {
	;(TOWERS as TowerDef[]).push(...REGISTERED)
})

afterAll(() => {
	;(TOWERS as TowerDef[]).splice(TOWERS.length - REGISTERED.length, REGISTERED.length)
})

/** A wave permanently mid-spawn, so no system sees a terminal phase. `tests/barricades.spec.ts`'s trick. */
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

/** An enemy at `distance` with its def's real speed, and enough HP that nothing here kills it. */
function addEnemy(world: World, def: EnemyDef, distance = 0, speed = def.speedTilesPerTick): Enemy {
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
		stolenItems: [],
		flags: { hidden: false, untargetable: false, fleeing: false, revealed: false },
	}

	world.index.enemies[enemy.id] = world.enemies.length
	world.enemies.push(enemy)
	return enemy
}

/** A lamp on `tile`, pushed on directly rather than through `placeTower` so the wallet is not part of this. */
function addLamp(world: World, tile: Vec2, def: TowerDef = nightlight): Tower {
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
		state: null,
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

describe('a Moth passing a Nightlight', () => {
	it('curves off the lane and is back at exactly 0 within 120 ticks of leaving the light', () => {
		const world = makeWorld()
		addLamp(world, { x: LAMP_X, y: LAMP_OFFSET_TILES })
		const enemy = addEnemy(world, moth)

		// Level with the lamp: 375 ticks at 1.6 tiles/sec puts it at x = 10, and it has been in reach
		// since x = 6 -- 150 ticks at 0.03 tiles/tick, which is past the 3-tile clamp.
		run(world, 375)
		expect(enemy.lateralOffsetTiles).toBeCloseTo(LIGHT_MAX_OFFSET_TILES, 10)

		// Out of reach at x = 14, and then 120 ticks -- 2 seconds, the step's budget. Exactly 0 and not
		// "close to": the follower is linear at a fixed rate precisely so this is assertable, and an
		// exponential ease is what this catches.
		run(world, TICKS_TO_LEAVE_RANGE - 375 + 120)
		expect(enemy.lateralOffsetTiles).toBe(0)
	})

	it('advances its distance at exactly the rate it would on a lamp-free lane, tick for tick', () => {
		const lit = makeWorld()
		addLamp(lit, { x: LAMP_X, y: LAMP_OFFSET_TILES })
		const curving = addEnemy(lit, moth)

		const dark = makeWorld()
		const straight = addEnemy(dark, moth)

		const queue = createCommandQueue()
		let deviated = false

		for (let index = 0; index < TICKS_TO_LEAVE_RANGE; index++) {
			tick(lit, queue)
			tick(dark, queue)
			expect(curving.distance).toBe(straight.distance)
			deviated ||= curving.lateralOffsetTiles !== 0
		}

		// The comparison is only worth anything if the lit moth actually left the lane during it.
		expect(deviated).toBe(true)
		expect(straight.lateralOffsetTiles).toBe(0)
		expect(curving.distance).toBeCloseTo(TICKS_TO_LEAVE_RANGE * MOTH_SPEED, 10)
	})

	it('never deviates past the 3-tile clamp, however far off the lane the lamp is', () => {
		const world = makeWorld()
		// Four tiles rather than the doc's five: at five the lamp is inside the moth's 5-tile reach for
		// a single tick of a straight lane, which cannot demonstrate a clamp at all. At four it is in
		// reach over `x` in [7, 13] -- 225 ticks, three times what the follower needs to saturate.
		addLamp(world, { x: LAMP_X, y: 4 })
		const enemy = addEnemy(world, moth)

		let peak = 0
		for (let index = 0; index < TICKS_TO_LEAVE_RANGE; index++) {
			run(world, 1)
			peak = Math.max(peak, Math.abs(enemy.lateralOffsetTiles))
			expect(Math.abs(enemy.lateralOffsetTiles)).toBeLessThanOrEqual(LIGHT_MAX_OFFSET_TILES)
		}

		expect(peak).toBeCloseTo(LIGHT_MAX_OFFSET_TILES, 10)
	})

	it('is pulled toward one of two lamps on opposite sides, and never to a net zero', () => {
		const world = makeWorld()
		// Symmetric about the lane, so every base point is equidistant from both: a summing
		// implementation flies the moth dead straight between them, which is the opposite of the picture.
		const first = addLamp(world, { x: LAMP_X, y: LAMP_OFFSET_TILES })
		addLamp(world, { x: LAMP_X, y: -LAMP_OFFSET_TILES })
		const enemy = addEnemy(world, moth)

		run(world, 375)

		// The tie goes to the earlier entry of `world.towers`, so a replay resolves it the same way.
		expect(world.towers[0]?.id).toBe(first.id)
		expect(enemy.lateralOffsetTiles).toBeCloseTo(LIGHT_MAX_OFFSET_TILES, 10)
	})

	it('is unmoved by a light that reveals but does not attract', () => {
		const world = makeWorld()
		addLamp(world, { x: LAMP_X, y: LAMP_OFFSET_TILES }, testDarkLamp)
		const enemy = addEnemy(world, moth)

		run(world, 375)

		// Still lit -- it is level with the lamp, 3 tiles inside a radius of 4 -- and still on its lane.
		expect(enemy.flags.revealed).toBe(true)
		expect(enemy.lateralOffsetTiles).toBe(0)
	})
})

describe('a Fly on the same lane past the same Nightlight', () => {
	it('keeps a lateral offset of 0 for the whole crossing: `air` is not `light-drawn`', () => {
		const world = makeWorld()
		addLamp(world, { x: LAMP_X, y: LAMP_OFFSET_TILES })
		const enemy = addEnemy(world, fly)

		for (let index = 0; index < Math.ceil(20 / fly.speedTilesPerTick); index++) {
			run(world, 1)
			expect(enemy.lateralOffsetTiles).toBe(0)
		}
	})
})

describe('enemyPosition', () => {
	it('displaces the base sample along `(-sin θ, cos θ)`, the sign every later step inherits', () => {
		const world = makeWorld()
		const enemy = addEnemy(world, moth, 10, 0)
		enemy.lateralOffsetTiles = 2

		// The lane runs +x, so the normal is (0, 1) and a positive offset is +y to the number.
		const at = enemyPosition(world, enemy)
		expect(at?.x).toBeCloseTo(10, 10)
		expect(at?.y).toBeCloseTo(2, 10)

		// And the same displacement asked of the helper directly, on a heading pointing down the y axis:
		// a quarter turn from `atan2(dy, dx)`, never a copy of the trig at the call site.
		const displaced = applyLateralOffset({ x: 4, y: 7, angle: Math.PI / 2 }, 2)
		expect(displaced.x).toBeCloseTo(2, 10)
		expect(displaced.y).toBeCloseTo(7, 10)
	})

	it('returns the bare sample when the offset is 0, which is every enemy but a lit Moth', () => {
		const world = makeWorld()
		const enemy = addEnemy(world, moth, 12, 0)
		const path = world.map.paths[0]
		expect(path).toBeDefined()

		const at = samplePath(path!, 12)
		expect(enemyPosition(world, enemy)).toEqual({ x: at.x, y: at.y })
	})
})

describe('the reveal half', () => {
	/** Nothing in v1 is `hidden` -- the Booklouse is Act III's -- so the rail is asserted synthetically. */
	function addHidden(world: World): Enemy {
		const enemy = addEnemy(world, moth, 2, 0)
		enemy.flags.hidden = true
		return enemy
	}

	it('is skipped by isTargetable while nothing lights it', () => {
		const world = makeWorld()
		const enemy = addHidden(world)

		run(world, 1)

		expect(enemy.flags.revealed).toBe(false)
		expect(isTargetable(enemy, 'both')).toBe(false)
	})

	it('is targetable in the same tick the Nightlight is placed, not the tick after', () => {
		const world = makeWorld()
		const enemy = addHidden(world)

		const queue = createCommandQueue()
		// Tile (0,0) is the fixture's one buildable non-track tile, and it is 2 tiles from the enemy --
		// inside the lamp's radius of 4. Driven through `tick()` with a command rather than by calling
		// the system, because the ordering (`commands` -> ... -> `light` -> `targeting`) is the assertion.
		queue.enqueue({ kind: 'PlaceTower', defId: nightlight.id, tile: { x: 0, y: 0 } })
		tick(world, queue)

		expect(world.towers).toHaveLength(1)
		expect(enemy.flags.revealed).toBe(true)
		expect(isTargetable(enemy, 'both')).toBe(true)
	})

	it('is re-hidden on the tick the Nightlight is sold', () => {
		const world = makeWorld()
		const enemy = addHidden(world)
		const lamp = addLamp(world, { x: 0, y: 0 })

		run(world, 1)
		expect(enemy.flags.revealed).toBe(true)

		const queue = createCommandQueue()
		queue.enqueue({ kind: 'SellTower', towerId: lamp.id })
		tick(world, queue)

		// Recomputed from scratch every tick, so there is no field to clear and no tick of latency.
		expect(world.towers).toHaveLength(0)
		expect(enemy.flags.revealed).toBe(false)
		expect(isTargetable(enemy, 'both')).toBe(false)
	})

	it('leaves `untargetable` alone: a lamp does not surface a burrowed enemy', () => {
		const world = makeWorld()
		const enemy = addEnemy(world, moth, 2, 0)
		enemy.flags.untargetable = true
		addLamp(world, { x: 0, y: 0 })

		run(world, 1)

		expect(enemy.flags.revealed).toBe(true)
		expect(isTargetable(enemy, 'both')).toBe(false)
	})
})
