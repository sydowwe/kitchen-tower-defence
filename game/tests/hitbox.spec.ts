import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { attack, coneAttack } from '@/core/content/behaviours.ts'
import { beetle } from '@/core/content/enemies.ts'
import { sprayBottle, TOWERS } from '@/core/content/towers.ts'
import { createCommandQueue } from '@/core/commands.ts'
import { tick } from '@/core/sim.ts'
import { circle, cone, line } from '@/core/systems/hitbox.ts'
import type { TowerDef } from '@/core/content/schema.ts'
import type { Enemy, EnemyTag, GameEvent, Tower, Vec2, World } from '@/core/types.ts'
import { createTestWorld } from './fixtures/world.ts'

/**
 * The three shapes, and the two things that fire through them: the cone interpreter and the splash
 * circle.
 *
 * Enemies are placed at **exact points** rather than at a distance along the fixture's one lane: a
 * wedge needs positions off the x axis, and the fixture's lane is a single row. `addEnemyAt` pushes
 * a one-tile path starting at the point it is given, so an enemy at distance 0 stands exactly there
 * and every assertion below is arithmetic anyone can check by eye.
 */

/** Neither tag has a matrix row, so every damage number here is the base one and nothing else. */
const PLAIN: EnemyTag[] = ['ground', 'bug']
const FLYER: EnemyTag[] = ['air', 'bug']

function makeWorld(): World {
	const world = createTestWorld()
	// A wave permanently mid-spawn, so `resolveSystem` does not declare the night won mid-test.
	world.night.phase = 'wave'
	world.night.wave = {
		index: 0,
		startedAtTick: 0,
		spawns: [{ enemyDefId: 'ant', remaining: 1, nextSpawnTick: 1_000_000, spacingTicks: 60, pathId: 'a' }],
	}
	return world
}

interface EnemyOverrides {
	hp?: number
	tags?: EnemyTag[]
}

function addEnemyAt(world: World, at: Vec2, overrides: EnemyOverrides = {}): Enemy {
	const hp = overrides.hp ?? 10_000
	const pathId = `lane${world.nextEntityId}`
	world.map.paths.push({
		id: pathId,
		waypoints: [
			{ x: at.x, y: at.y },
			{ x: at.x + 1, y: at.y },
		],
		lengthTiles: 1,
	})

	const enemy: Enemy = {
		id: world.nextEntityId++,
		defId: 'ant',
		pathId,
		distance: 0,
		lateralOffsetTiles: 0,
		hp,
		maxHp: hp,
		statuses: [],
		tags: overrides.tags ?? [...PLAIN],
		speed: 0,
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

function run(world: World, count: number): GameEvent[] {
	const queue = createCommandQueue()
	const log: GameEvent[] = []

	for (let index = 0; index < count; index++) {
		tick(world, queue)
		log.push(...world.events)
	}

	return log
}

/** A point `distance` tiles from the origin at `degrees` off the +x axis. */
function polar(distance: number, degrees: number): Vec2 {
	const radians = (degrees * Math.PI) / 180
	return { x: distance * Math.cos(radians), y: distance * Math.sin(radians) }
}

const ORIGIN: Vec2 = { x: 0, y: 0 }

// --- the synthetic defs ---------------------------------------------------------------------------

/** A ground-only cone, so `targets` has something to turn away that the Spray Bottle would hit. */
const testGroundCone: TowerDef = {
	id: 'testGroundCone',
	nameKey: 'tower.testGroundCone.name',
	descriptionKey: 'tower.testGroundCone.description',
	glyph: '🧴',
	role: 'DOT',
	cost: 100,
	maxHp: 100,
	placement: 'off_path',
	noise: 0,
	defaultTargetingMode: 'CLOSEST',
	/** Not the roster, so no tiers -- see `tests/upgrades.spec.ts` for what the roster must carry. */
	upgrades: [],
	behaviours: [
		coneAttack({
			damage: 7,
			damageType: 'physical',
			cooldownTicks: 60,
			rangeTiles: 3,
			coneHalfAngleDeg: 30,
			targets: 'ground',
		}),
	],
}

/** Instant AoE: `attack` with a radius, which is the only way there is one. No `aoeAttack` kind. */
const testBomb: TowerDef = {
	...testGroundCone,
	id: 'testBomb',
	nameKey: 'tower.testBomb.name',
	descriptionKey: 'tower.testBomb.description',
	behaviours: [
		attack({
			damage: 10,
			damageType: 'physical',
			cooldownTicks: 60,
			rangeTiles: 3,
			targets: 'ground',
			splashRadiusTiles: 1.5,
		}),
	],
}

/** The same, thrown: the splash has to resolve identically from a projectile's arrival. */
const testBombShot: TowerDef = {
	...testGroundCone,
	id: 'testBombShot',
	nameKey: 'tower.testBombShot.name',
	descriptionKey: 'tower.testBombShot.description',
	behaviours: [
		attack({
			damage: 10,
			damageType: 'physical',
			cooldownTicks: 60,
			rangeTiles: 3,
			targets: 'ground',
			projectileSpeed: 0.5,
			splashRadiusTiles: 1.5,
		}),
	],
}

const REGISTERED: TowerDef[] = [testGroundCone, testBomb, testBombShot]

beforeAll(() => {
	;(TOWERS as TowerDef[]).push(...REGISTERED)
})

afterAll(() => {
	;(TOWERS as TowerDef[]).splice(TOWERS.length - REGISTERED.length, REGISTERED.length)
})

// --- the shapes -----------------------------------------------------------------------------------

describe('cone', () => {
	it('takes an enemy 25 degrees off the axis and leaves one at 35', () => {
		const world = makeWorld()
		const inside = addEnemyAt(world, polar(2, 25))
		const outside = addEnemyAt(world, polar(2, 35))

		const caught = cone(world, ORIGIN, 0, 3, 30)

		expect(caught.map(enemy => enemy.id)).toEqual([inside.id])
		expect(caught.map(enemy => enemy.id)).not.toContain(outside.id)
	})

	it('hits what is in front of a cone facing left, across the atan2 branch cut', () => {
		const world = makeWorld()
		// atan2 gives this one -3.042 rad against a facing of +3.142: a raw subtraction is -6.18,
		// which is 354 degrees off axis rather than the 5.7 it actually is.
		const inFront = addEnemyAt(world, { x: -2, y: -0.2 })
		const behind = addEnemyAt(world, { x: 2, y: 0 })

		const caught = cone(world, ORIGIN, Math.PI, 3, 30)

		expect(caught.map(enemy => enemy.id)).toEqual([inFront.id])
		expect(caught.map(enemy => enemy.id)).not.toContain(behind.id)
	})

	it('excludes one past the range and one inside the radius but behind the tower', () => {
		const world = makeWorld()
		addEnemyAt(world, { x: 3.5, y: 0 })
		addEnemyAt(world, { x: -2, y: 0 })
		const hit = addEnemyAt(world, { x: 2.9, y: 0 })

		expect(cone(world, ORIGIN, 0, 3, 30).map(enemy => enemy.id)).toEqual([hit.id])
	})

	it('counts an enemy standing on the origin as inside, whatever the facing', () => {
		const world = makeWorld()
		const onTop = addEnemyAt(world, ORIGIN)

		expect(cone(world, ORIGIN, Math.PI / 2, 3, 30).map(enemy => enemy.id)).toEqual([onTop.id])
	})

	it('passes its filter through to the one range query and does not re-walk the enemies', () => {
		const world = makeWorld()
		const walker = addEnemyAt(world, { x: 2, y: 0 })
		addEnemyAt(world, { x: 2.2, y: 0 }, { tags: FLYER })

		const caught = cone(world, ORIGIN, 0, 3, 30, enemy => !enemy.tags.includes('air'))

		expect(caught.map(enemy => enemy.id)).toEqual([walker.id])
	})
})

describe('circle', () => {
	it('is the range query under another name, to the thousandth of a tile', () => {
		const world = makeWorld()
		const inside = addEnemyAt(world, { x: 3, y: 0 })
		addEnemyAt(world, { x: 3.001, y: 0 })

		expect(circle(world, ORIGIN, 3).map(enemy => enemy.id)).toEqual([inside.id])
	})
})

describe('line', () => {
	it('includes 0.4 tiles beside a 1-tile-wide segment and excludes 0.6', () => {
		const world = makeWorld()
		const inside = addEnemyAt(world, { x: 2, y: 0.4 })
		const outside = addEnemyAt(world, { x: 2, y: 0.6 })

		const caught = line(world, { x: 0, y: 0 }, { x: 4, y: 0 }, 1)

		expect(caught.map(enemy => enemy.id)).toEqual([inside.id])
		expect(caught.map(enemy => enemy.id)).not.toContain(outside.id)
	})

	it('stops at the end of the segment rather than running down the infinite line', () => {
		const world = makeWorld()
		addEnemyAt(world, { x: 5, y: 0 })
		const atTheEnd = addEnemyAt(world, { x: 4.4, y: 0 })

		expect(line(world, { x: 0, y: 0 }, { x: 4, y: 0 }, 1).map(enemy => enemy.id)).toEqual([atTheEnd.id])
	})
})

// --- the cone interpreter -------------------------------------------------------------------------

describe('the Spray Bottle firing', () => {
	it('damages and poisons all three enemies in its wedge on one cooldown', () => {
		const world = makeWorld()
		const aimedAt = addEnemyAt(world, { x: 11, y: 0 }, { hp: 55 })
		const above = addEnemyAt(world, { x: 12, y: 0.5 }, { hp: 55 })
		const below = addEnemyAt(world, { x: 12, y: -0.5 }, { hp: 55 })
		// In range, and 90 degrees off the aim: the cone is a wedge and not a circle.
		const aside = addEnemyAt(world, { x: 10, y: 2 }, { hp: 55 })
		addTower(world, sprayBottle, { x: 10, y: 0 })

		const log = run(world, 1)

		expect(log.filter(event => event.kind === 'towerFired')).toHaveLength(1)
		for (const caught of [aimedAt, above, below]) {
			expect(caught.hp).toBeCloseTo(52, 10)
			expect(caught.statuses.map(status => status.kind)).toEqual(['poison'])
			// The row's own 2/sec, not the status table's 4 -- a per-tick magnitude either way.
			expect(caught.statuses[0]?.magnitude).toBeCloseTo(2 / 60, 10)
		}

		expect(aside.hp).toBe(55)
		expect(aside.statuses).toEqual([])
	})

	it('leaves a flyer in the wedge of a ground-only cone untouched', () => {
		const world = makeWorld()
		const walker = addEnemyAt(world, { x: 11, y: 0 }, { hp: 55 })
		const flyer = addEnemyAt(world, { x: 12, y: 0.4 }, { hp: 55, tags: FLYER })
		addTower(world, testGroundCone, { x: 10, y: 0 })

		run(world, 1)

		expect(walker.hp).toBeCloseTo(48, 10)
		expect(flyer.hp).toBe(55)
	})

	it('holds its fire for the cone s cooldown, 50 ticks at 1.2 a second', () => {
		const world = makeWorld()
		addEnemyAt(world, { x: 11, y: 0 })
		addTower(world, sprayBottle, { x: 10, y: 0 })

		const fired: number[] = []
		const queue = createCommandQueue()
		for (let index = 0; index < 101; index++) {
			const at = world.tick
			tick(world, queue)
			if (world.events.some(event => event.kind === 'towerFired')) {
				fired.push(at)
			}
		}

		expect(fired).toEqual([0, 50, 100])
	})
})

// --- splash ---------------------------------------------------------------------------------------

describe('splash through circle', () => {
	it('damages the primary target exactly once and leaves a flyer in the radius alone', () => {
		const world = makeWorld()
		const primary = addEnemyAt(world, { x: 11, y: 0 }, { hp: 100 })
		const alongside = addEnemyAt(world, { x: 11.5, y: 0 }, { hp: 100 })
		const flyer = addEnemyAt(world, { x: 11, y: 1 }, { hp: 100, tags: FLYER })
		const outside = addEnemyAt(world, { x: 12.6, y: 0 }, { hp: 100 })
		addTower(world, testBomb, { x: 10, y: 0 })

		run(world, 1)

		// 10, not 20: hitting the target and then the circle would double-damage it, and the symptom
		// looks exactly like the tag matrix being applied twice.
		expect(primary.hp).toBeCloseTo(90, 10)
		expect(alongside.hp).toBeCloseTo(90, 10)
		expect(flyer.hp).toBe(100)
		expect(outside.hp).toBe(100)
	})

	it('resolves the same way from a projectile s arrival', () => {
		const world = makeWorld()
		const primary = addEnemyAt(world, { x: 11, y: 0 }, { hp: 100 })
		const alongside = addEnemyAt(world, { x: 11.5, y: 0 }, { hp: 100 })
		addTower(world, testBombShot, { x: 10, y: 0 })

		// One tile at 0.5 tiles per tick: spawned and moved half a tile on tick 0, arriving on tick 1.
		run(world, 1)
		expect(primary.hp).toBe(100)
		expect(world.projectiles).toHaveLength(1)

		run(world, 1)
		expect(primary.hp).toBeCloseTo(90, 10)
		expect(alongside.hp).toBeCloseTo(90, 10)
		expect(world.projectiles).toEqual([])
	})
})

// --- the architecture checkpoint --------------------------------------------------------------------

describe('the architecture checkpoint', () => {
	it('adds a cone tower that applies a status as a def and nothing else', () => {
		// Registered here and nowhere near `core/systems/`. If "cone, 3 tiles, chemical, applies
		// poison" ever needs a system change, this is where it shows up.
		const testMister: TowerDef = {
			...testGroundCone,
			id: 'testMister',
			nameKey: 'tower.testMister.name',
			descriptionKey: 'tower.testMister.description',
			behaviours: [
				coneAttack({
					damage: 1,
					damageType: 'chemical',
					cooldownTicks: 60,
					rangeTiles: 3,
					coneHalfAngleDeg: 45,
					targets: 'both',
					applies: ['slow'],
				}),
			],
		}
		;(TOWERS as TowerDef[]).push(testMister)

		try {
			const world = makeWorld()
			const walker = addEnemyAt(world, { x: 11, y: 0 })
			const flyer = addEnemyAt(world, { x: 11.5, y: 1 }, { tags: FLYER })
			addTower(world, testMister, { x: 10, y: 0 })

			run(world, 1)

			expect(walker.statuses.map(status => status.kind)).toEqual(['slow'])
			expect(flyer.statuses.map(status => status.kind)).toEqual(['slow'])
		} finally {
			;(TOWERS as TowerDef[]).pop()
		}
	})
})

describe('the Beetle', () => {
	it('is a bruiser only because of its HP: every damage type lands on it at 1.0', () => {
		const world = makeWorld()
		const target = addEnemyAt(world, { x: 11, y: 0 }, { hp: beetle.hp, tags: [...beetle.tags] })
		addTower(world, sprayBottle, { x: 10, y: 0 })

		run(world, 1)

		expect(target.hp).toBeCloseTo(52, 10)
	})
})
