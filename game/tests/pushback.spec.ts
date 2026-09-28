import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { attack, isConeAttack, isPushback, pushback, toApplications } from '@/core/content/behaviours.ts'
import { ant, fly, mold, moth } from '@/core/content/enemies.ts'
import { resolveDamage } from '@/core/content/matrix.ts'
import { applyStatuses, hasStatus } from '@/core/content/statuses.ts'
import { validateContent } from '@/core/content/schema.ts'
import { cardboardBox, fan, mintPot, TOWERS } from '@/core/content/towers.ts'
import { createCommandQueue } from '@/core/commands.ts'
import { tick } from '@/core/sim.ts'
import { barricadeHolding } from '@/core/systems/barricades.ts'
import {
	PUSHBACK_DECAY_TICKS,
	PUSHBACK_FLOOR,
	PUSHES_TO_FLOOR,
	pushbackResistanceOf,
	pushEnemy,
} from '@/core/systems/pushback.ts'
import type { ConeAttackBehaviour, PushbackBehaviour } from '@/core/content/behaviours.ts'
import type { TowerDef } from '@/core/content/schema.ts'
import type { Enemy, EnemyTag, GameEvent, Tower, Vec2, World } from '@/core/types.ts'
import { createTestWorld } from './fixtures/world.ts'

/**
 * Step 18A: the shove, its resistance, and what it leaves alone.
 *
 * The fixture's lane runs (0,0) to (39,0), so an enemy's position is `(distance, 0)` and "pushed back
 * 1.2 tiles" is a subtraction anyone can check. Towers are pushed onto the world directly, one row off
 * the lane, so every one of them can stand where the geometry wants it.
 *
 * Every assertion is against the defs' fields and the three exported constants, never their values,
 * so 18C's re-tune moves none of them.
 */

const PATH_ID = 'a'

/** Mint Pot is not in `TOWERS` -- nobody can buy it -- and `getTowerDef` reads only `TOWERS`. */
const REGISTERED: TowerDef[] = [mintPot]

beforeAll(() => {
	;(TOWERS as TowerDef[]).push(...REGISTERED)
})

afterAll(() => {
	;(TOWERS as TowerDef[]).splice(TOWERS.length - REGISTERED.length, REGISTERED.length)
})

function makeWorld(): World {
	const world = createTestWorld()
	// A wave permanently mid-spawn, as `combat.spec.ts` does: a phase that runs systems, and a night
	// that is never declared won because the board is empty.
	world.night.phase = 'wave'
	world.night.wave = {
		index: 0,
		startedAtTick: 0,
		spawns: [{ enemyDefId: 'ant', remaining: 1, nextSpawnTick: 1_000_000, spacingTicks: 60, pathId: PATH_ID }],
	}
	return world
}

interface EnemyOverrides {
	distance?: number
	hp?: number
	speed?: number
	tags?: readonly EnemyTag[]
}

/** Speed defaults to 0 so a spec's positions stay exactly where it put them. */
function addEnemy(world: World, overrides: EnemyOverrides = {}): Enemy {
	const hp = overrides.hp ?? 10_000
	const enemy: Enemy = {
		id: world.nextEntityId++,
		defId: 'ant',
		pathId: PATH_ID,
		distance: overrides.distance ?? 0,
		lateralOffsetTiles: 0,
		hp,
		maxHp: hp,
		statuses: [],
		tags: [...(overrides.tags ?? ant.tags)],
		speed: overrides.speed ?? 0,
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

function addTower(world: World, def: TowerDef, tile: Vec2, tier = 0): Tower {
	const tower: Tower = {
		id: world.nextEntityId++,
		defId: def.id,
		tile: { x: tile.x, y: tile.y },
		hp: def.maxHp,
		maxHp: def.maxHp,
		tier,
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

/** Runs `count` ticks, collecting every event published along the way. */
function run(world: World, count: number): GameEvent[] {
	const queue = createCommandQueue()
	const log: GameEvent[] = []
	for (let index = 0; index < count; index++) {
		tick(world, queue)
		log.push(...world.events)
	}
	return log
}

function eventsOfKind<K extends GameEvent['kind']>(
	log: readonly GameEvent[],
	kind: K,
): Extract<GameEvent, { kind: K }>[] {
	return log.filter((event): event is Extract<GameEvent, { kind: K }> => event.kind === kind)
}

function pushOf(def: TowerDef): PushbackBehaviour {
	const found = def.behaviours.find(isPushback)
	if (found === undefined) {
		throw new Error(`tower '${def.id}' has no pushback`)
	}
	return found
}

function coneOf(def: TowerDef): ConeAttackBehaviour {
	const found = def.behaviours.find(isConeAttack)
	if (found === undefined) {
		throw new Error(`tower '${def.id}' has no coneAttack`)
	}
	return found
}

/** A Cardboard Box that outlasts any spec here, so the chewing never takes it down mid-assertion. */
function addBox(world: World, tile: Vec2): Tower {
	const box = addTower(world, cardboardBox, tile)
	box.hp = 1_000_000
	return box
}

/** Stops a tower firing again for the rest of a spec, without taking it off the board. */
function silence(tower: Tower): void {
	tower.cooldownTicks = 1_000_000
}

const FAN_PUSH = pushOf(fan).pushTiles
const MINT_PUSH = pushOf(mintPot).pushTiles

describe('pushEnemy', () => {
	it('moves an enemy back along its lane by the tiles asked, and returns them', () => {
		const world = makeWorld()
		const enemy = addEnemy(world, { distance: 5 })

		expect(pushEnemy(world, enemy, 1.2, 99)).toBeCloseTo(1.2, 9)
		expect(enemy.distance).toBeCloseTo(3.8, 9)
	})

	it('clamps at the start of the lane, and a walking enemy there stays on the board and walks on', () => {
		const world = makeWorld()
		const enemy = addEnemy(world, { distance: 0.5, speed: ant.speedTilesPerTick })

		expect(pushEnemy(world, enemy, 1.2, 99)).toBeCloseTo(0.5, 9)
		expect(enemy.distance).toBe(0)

		run(world, 1)
		expect(world.enemies).toContain(enemy)
		run(world, 1)
		expect(enemy.distance).toBeGreaterThan(0)
	})

	it('leaves world.rng untouched', () => {
		const world = makeWorld()
		const enemy = addEnemy(world, { distance: 10 })
		const before = structuredClone(world.rng)

		pushEnemy(world, enemy, 1.2, 99)
		expect(world.rng).toEqual(before)
	})
})

describe('the Fan', () => {
	it('shoves a Fly in its cone back by exactly its pushTiles on the first push, and says so twice', () => {
		const world = makeWorld()
		const target = addEnemy(world, { distance: 12, tags: fly.tags })
		const tower = addTower(world, fan, { x: 10, y: 1 })

		const log = run(world, 1)

		expect(target.distance).toBeCloseTo(12 - FAN_PUSH, 9)

		const gusts = eventsOfKind(log, 'pushbackFired')
		expect(gusts).toHaveLength(1)
		expect(gusts[0]).toMatchObject({
			towerId: tower.id,
			tile: { x: 10, y: 1 },
			rangeTiles: coneOf(fan).rangeTiles,
			halfAngleDeg: coneOf(fan).coneHalfAngleDeg,
		})
		expect(gusts[0]?.facingRad).toBeCloseTo(Math.atan2(0 - 1, 12 - 10), 9)

		const shoves = eventsOfKind(log, 'enemyPushed')
		expect(shoves).toHaveLength(1)
		expect(shoves[0]?.enemyId).toBe(target.id)
		expect(shoves[0]?.sourceTowerId).toBe(tower.id)
		expect(shoves[0]?.tiles).toBeCloseTo(12 - target.distance, 12)
	})

	it('publishes a gust but no shove when all it catches cannot move', () => {
		const world = makeWorld()
		const immune = addEnemy(world, { distance: 12, tags: ['air', 'push-immune'] })
		addTower(world, fan, { x: 10, y: 1 })

		const log = run(world, 1)

		expect(immune.distance).toBe(12)
		expect(eventsOfKind(log, 'pushbackFired')).toHaveLength(1)
		expect(eventsOfKind(log, 'enemyPushed')).toHaveLength(0)
	})

	it('does not shove a ground enemy its cone never targets', () => {
		const world = makeWorld()
		const walker = addEnemy(world, { distance: 12 })
		addTower(world, fan, { x: 10, y: 1 })

		run(world, 1)
		expect(walker.distance).toBe(12)
	})

	it('does not shove an enemy its own hit just killed', () => {
		const world = makeWorld()
		const target = addEnemy(world, { distance: 12, tags: fly.tags, hp: 0.1 })
		addTower(world, fan, { x: 10, y: 1 })

		const log = run(world, 1)

		expect(eventsOfKind(log, 'enemyPushed')).toHaveLength(0)
		expect(target.distance).toBe(12)
	})

	it('marks what the gust reaches at tier 3, a push-immune flyer included', () => {
		const world = makeWorld()
		const target = addEnemy(world, { distance: 12, tags: fly.tags })
		const immune = addEnemy(world, { distance: 12.5, tags: ['air', 'push-immune'] })
		addTower(world, fan, { x: 10, y: 1 }, 3)

		run(world, 1)

		expect(hasStatus(target, 'marked')).toBe(true)
		expect(hasStatus(immune, 'marked')).toBe(true)
		expect(immune.distance).toBe(12.5)
	})

	it('does not mark anything below tier 3', () => {
		const world = makeWorld()
		const target = addEnemy(world, { distance: 12, tags: fly.tags })
		addTower(world, fan, { x: 10, y: 1 }, 2)

		run(world, 1)
		expect(hasStatus(target, 'marked')).toBe(false)
	})
})

describe('nothing moves that cannot', () => {
	it('leaves a push-immune flyer in a Fan cone where it was', () => {
		const world = makeWorld()
		const immune = addEnemy(world, { distance: 12, tags: ['air', 'push-immune'] })
		addTower(world, fan, { x: 10, y: 1 })

		run(world, 1)
		expect(immune.distance).toBe(12)
	})

	it('leaves a Mold inside a Mint Pot radius where it was', () => {
		const world = makeWorld()
		const patch = addEnemy(world, { distance: 12, tags: mold.tags })
		addTower(world, mintPot, { x: 12, y: 1 })

		const log = run(world, 1)

		expect(eventsOfKind(log, 'pushbackFired')).toHaveLength(1)
		expect(patch.distance).toBe(12)
	})

	it('leaves a Fly held by a Fly Paper where it was', () => {
		const world = makeWorld()
		const stuck = addEnemy(world, { distance: 12, tags: fly.tags })
		applyStatuses(stuck, toApplications(['rooted']), 99, 'physical')

		expect(pushEnemy(world, stuck, FAN_PUSH, 1)).toBe(0)
		expect(stuck.distance).toBe(12)
		expect(stuck.pushback).toBeNull()
	})

	it('leaves an Ant feeding at a Honey Pot where it was', () => {
		const world = makeWorld()
		const feeder = addEnemy(world, { distance: 12 })
		feeder.feeding = { towerId: 99, distance: 12, releaseTick: 180 }

		expect(pushEnemy(world, feeder, MINT_PUSH, 1)).toBe(0)
		expect(feeder.distance).toBe(12)
		expect(feeder.pushback).toBeNull()
	})

	it('leaves a fleeing enemy alone until step 19 decides the sign', () => {
		const world = makeWorld()
		const leaving = addEnemy(world, { distance: 12 })
		leaving.flags.fleeing = true

		expect(pushEnemy(world, leaving, MINT_PUSH, 1)).toBe(0)
		expect(leaving.distance).toBe(12)
	})

	it('has the enemy schema reject a stationary def without the tag', () => {
		expect(() => validateContent({ enemies: [mold] })).not.toThrow()
		expect(() =>
			validateContent({ enemies: [{ ...mold, tags: mold.tags.filter(tag => tag !== 'push-immune') }] }),
		).toThrow(/enemy 'mold': tags: .*push-immune/)
	})
})

describe('resistance', () => {
	it('takes a back-to-back run of pushes down to the floor, and no lower', () => {
		const world = makeWorld()
		const target = addEnemy(world, { distance: 30, tags: fly.tags })

		const moved: number[] = []
		for (let push = 0; push <= PUSHES_TO_FLOOR; push++) {
			moved.push(pushEnemy(world, target, FAN_PUSH, 1))
		}

		expect(moved[0]).toBeCloseTo(FAN_PUSH, 9)
		for (let push = 1; push < moved.length; push++) {
			expect(moved[push]).toBeLessThan(moved[push - 1] ?? Number.POSITIVE_INFINITY)
		}
		expect(moved[PUSHES_TO_FLOOR]).toBeCloseTo(FAN_PUSH * PUSHBACK_FLOOR, 9)

		const next = pushEnemy(world, target, FAN_PUSH, 1)
		expect(next).toBeCloseTo(FAN_PUSH * PUSHBACK_FLOOR, 9)
	})

	it('stores the raised resistance even when the clamp moved the enemy nowhere', () => {
		const world = makeWorld()
		const target = addEnemy(world, { distance: 0 })

		expect(pushEnemy(world, target, MINT_PUSH, 1)).toBe(0)
		expect(pushbackResistanceOf(world, target)).toBeGreaterThan(0)
	})

	it('falls strictly after a pause, and is gone after PUSHBACK_DECAY_TICKS of no pushes', () => {
		const world = makeWorld()
		const target = addEnemy(world, { distance: 30, tags: fly.tags })
		for (let push = 0; push < PUSHES_TO_FLOOR; push++) {
			pushEnemy(world, target, FAN_PUSH, 1)
		}

		const atCap = pushbackResistanceOf(world, target)
		expect(atCap).toBeCloseTo(1 - PUSHBACK_FLOOR, 9)

		world.tick += 1
		const later = pushbackResistanceOf(world, target)
		expect(later).toBeLessThan(atCap)
		world.tick += 30
		expect(pushbackResistanceOf(world, target)).toBeLessThan(later)

		world.tick += PUSHBACK_DECAY_TICKS
		expect(pushbackResistanceOf(world, target)).toBe(0)
		expect(pushEnemy(world, target, FAN_PUSH, 1)).toBeCloseTo(FAN_PUSH, 9)
	})

	it('is 0 for an enemy nobody has pushed', () => {
		const world = makeWorld()
		expect(pushbackResistanceOf(world, addEnemy(world, { distance: 3 }))).toBe(0)
	})
})

describe('barricades, through a Mint Pot', () => {
	it('re-holds an Ant pushed back off a Cardboard Box at the same point', () => {
		const world = makeWorld()
		addBox(world, { x: 20, y: 0 })
		const walker = addEnemy(world, { distance: 15, speed: ant.speedTilesPerTick })

		// Walk it onto the box and let it settle.
		run(world, 6 * 60)
		const holdPoint = walker.distance
		expect(barricadeHolding(world, walker)).not.toBeNull()

		const pot = addTower(world, mintPot, { x: 19, y: 1 })
		run(world, 1)
		silence(pot)
		expect(walker.distance).toBeCloseTo(holdPoint - MINT_PUSH, 9)
		expect(barricadeHolding(world, walker)).toBeNull()

		run(world, 3 * 60)
		expect(walker.distance).toBeCloseTo(holdPoint, 9)
		expect(barricadeHolding(world, walker)?.defId).toBe('cardboardBox')
	})

	it('holds an Ant that had walked past a box, once a push puts the box back ahead of it', () => {
		const world = makeWorld()
		const box = addBox(world, { x: 20, y: 0 })
		const walker = addEnemy(world, { distance: 20.4, speed: ant.speedTilesPerTick })
		expect(barricadeHolding(world, walker)).toBeNull()

		const pot = addTower(world, mintPot, { x: 20, y: 1 })
		run(world, 1)
		silence(pot)
		expect(walker.distance).toBeLessThan(20)

		run(world, 3 * 60)
		expect(walker.distance).toBeLessThan(20)
		expect(barricadeHolding(world, walker)?.id).toBe(box.id)
	})
})

describe('heat, through a Mint Pot', () => {
	it('burns an Ant pushed back onto a heated tile on the tick it lands there', () => {
		const world = makeWorld()
		const magnitude = 0.25
		world.tiles.push({ tile: { x: 10, y: 0 }, effects: [{ kind: 'heat', remainingTicks: 10_000, magnitude }] })
		// Standing on tile 11, and one push from tile 10.
		const walker = addEnemy(world, { distance: 10.3 + MINT_PUSH })
		expect(Math.round(walker.distance)).toBe(11)
		addTower(world, mintPot, { x: 11, y: 1 })

		const before = walker.hp
		run(world, 1)

		expect(Math.round(walker.distance)).toBe(10)
		expect(before - walker.hp).toBeCloseTo(resolveDamage(magnitude, 'fire', walker), 9)
	})
})

describe('two Fans on one lane', () => {
	it('do not lock the slowest flyer out: a Moth inside both cones still gains ground', () => {
		const world = makeWorld()
		// Three tiles short of both Fans, one tile either side of the lane: inside both cones. The HP is
		// the fixture's 10,000, so the chip damage cannot kill it before the question is answered.
		const start = 27
		const target = addEnemy(world, { distance: start, tags: moth.tags, speed: moth.speedTilesPerTick })
		addTower(world, fan, { x: 30, y: 1 })
		addTower(world, fan, { x: 30, y: -1 })

		run(world, 600)
		const afterTen = target.distance
		expect(afterTen).toBeGreaterThan(start)

		// And it is still gaining once its resistance has long since settled, which is what "not
		// locked" means rather than a lucky first ten seconds.
		run(world, 600)
		expect(target.distance).toBeGreaterThan(afterTen)
	})
})

describe('the rider check', () => {
	it('rejects a tower with a pushback and no coneAttack, naming it', () => {
		const gust: TowerDef = {
			...mintPot,
			id: 'testGust',
			nameKey: 'tower.testGust.name',
			descriptionKey: 'tower.testGust.description',
			behaviours: [
				attack({ damage: 1, damageType: 'physical', cooldownTicks: 60, rangeTiles: 3, targets: 'ground' }),
				pushback({ pushTiles: 1, targets: 'ground' }),
			],
			upgrades: [],
		}

		expect(() => validateContent({ towers: [gust] })).toThrow(/tower 'testGust': behaviours: a pushback rides/)
	})

	it('rejects one whose tier adds the pushback while the cone never arrives', () => {
		const base = mintPot.upgrades[0]
		expect(base).toBeDefined()
		const gust: TowerDef = {
			...mintPot,
			id: 'testLateGust',
			nameKey: 'tower.testLateGust.name',
			descriptionKey: 'tower.testLateGust.description',
			behaviours: [
				attack({ damage: 1, damageType: 'physical', cooldownTicks: 60, rangeTiles: 3, targets: 'ground' }),
			],
			upgrades: [],
		}
		gust.upgrades = [
			{ ...(base as NonNullable<typeof base>), addBehaviours: [pushback({ pushTiles: 1, targets: 'ground' })] },
		]

		expect(() => validateContent({ towers: [gust] })).toThrow(/tower 'testLateGust': .*at tier 1/)
	})
})
