import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isAttack } from '@/core/content/behaviours.ts'
import { ant, silverfish, weevil } from '@/core/content/enemies.ts'
import { resolveDamage } from '@/core/content/matrix.ts'
import { STATUS_DEFS, applyStatus, createStatus, findStatus } from '@/core/content/statuses.ts'
import { bayLeaf, cardboardBox, lemon, saltShaker, TOWERS } from '@/core/content/towers.ts'
import { createCommandQueue } from '@/core/commands.ts'
import { createRngState } from '@/core/rng.ts'
import { tick } from '@/core/sim.ts'
import { noiseSystem } from '@/core/systems/noise.ts'
import { spawnProjectile } from '@/core/systems/projectiles.ts'
import { spawnEnemyAt } from '@/core/systems/spawn.ts'
import { suppressionZones } from '@/core/systems/suppress.ts'
import { isTargetable } from '@/core/systems/targeting.ts'
import { tileSpeedMultiplier } from '@/core/systems/tiles.ts'
import { writeEffect } from '@/core/tiles.ts'
import type { AttackBehaviour, SuppressKind } from '@/core/content/behaviours.ts'
import type { DamageTarget } from '@/core/content/matrix.ts'
import type { EnemyDef, TowerDef } from '@/core/content/schema.ts'
import type { Enemy, GameEvent, Tower, Vec2, World } from '@/core/types.ts'
import { createTestWorld } from './fixtures/world.ts'

/**
 * Burrowing and armor: the two places step 16 can be silently wrong.
 *
 * The fixture's map is one row 40 tiles wide with lane `a` running (0,0) to (39,0), so an enemy's arc
 * distance is its `x` and a tower on tile `(x, 0)` sits at distance `x`. Every Weevil below that is
 * not about the roll carries a hand-set window, so the assertions do not move when step 16C re-tunes
 * the def's fractions.
 */

const PATH_ID = 'a'
const LANE_TILES = 39

/** The window every hand-built Weevil below carries. */
const WINDOW = { fromTiles: 5, toTiles: 25 }

/**
 * A suppressor for an ability that does not exist. `SuppressKind` has one member, so the only way to
 * build a Bay Leaf that suppresses something else is a cast -- which is the point: `suppress.ts` has
 * to filter on the field, not on "is this a suppress tower".
 */
const testOtherSuppressor: TowerDef = {
	...bayLeaf,
	id: 'testOtherSuppressor',
	nameKey: 'tower.testOtherSuppressor.name',
	descriptionKey: 'tower.testOtherSuppressor.description',
	behaviours: [{ kind: 'suppress', radiusTiles: 40, suppresses: 'dig' as SuppressKind }],
	upgrades: [],
}

const REGISTERED: TowerDef[] = [testOtherSuppressor]

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

interface EnemyOptions {
	distance: number
	speed?: number
	burrowWindow?: Enemy['burrowWindow']
}

/** An enemy with enough HP that nothing here kills it. Pushed on directly so the rng is not part of it. */
function addEnemy(world: World, def: EnemyDef, options: EnemyOptions): Enemy {
	const enemy: Enemy = {
		id: world.nextEntityId++,
		defId: def.id,
		pathId: PATH_ID,
		distance: options.distance,
		lateralOffsetTiles: 0,
		hp: 10_000,
		maxHp: 10_000,
		statuses: [],
		tags: [...def.tags],
		speed: options.speed ?? 0,
		spawnedInWaveIndex: 0,
		nextTileWriteTick: 0,
		burrowWindow: options.burrowWindow ?? null,
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

/** A Weevil on `WINDOW`, standing still unless given a speed. */
function addWeevil(world: World, distance: number, speed = 0): Enemy {
	return addEnemy(world, weevil, { distance, speed, burrowWindow: { ...WINDOW } })
}

/** A tower on `tile`, pushed on directly rather than through `placeTower` so the wallet is not part of this. */
function addTower(world: World, def: TowerDef, tile: Vec2): Tower {
	const tower = makeTower(world, def, tile)
	world.index.towers[tower.id] = world.towers.length
	world.towers.push(tower)
	return tower
}

/** A tower that is **not** on the board: a projectile's source, with nothing in `world.towers` to fire again. */
function makeTower(world: World, def: TowerDef, tile: Vec2): Tower {
	return {
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
}

function attackOf(def: TowerDef): AttackBehaviour {
	const found = def.behaviours.find(isAttack)
	if (found === undefined) {
		throw new Error(`${def.id} has no attack`)
	}
	return found
}

function run(world: World, ticks: number): void {
	const queue = createCommandQueue()
	for (let index = 0; index < ticks; index++) {
		tick(world, queue)
	}
}

/** Ticks until nothing is in flight, capped so a projectile that never lands fails rather than hangs. */
function runUntilLanded(world: World): void {
	const queue = createCommandQueue()
	for (let guard = 0; guard < 600 && world.projectiles.length > 0; guard++) {
		tick(world, queue)
	}
	expect(world.projectiles).toHaveLength(0)
}

/** One shot from `def` at `target`, flown all the way, and the HP it took off. */
function shoot(world: World, def: TowerDef, target: Enemy): number {
	const attack = attackOf(def)
	const before = target.hp
	spawnProjectile(world, makeTower(world, def, { x: 0, y: 0 }), attack, target, attack.applies)
	runUntilLanded(world)
	return before - target.hp
}

type EnemyDamaged = Extract<GameEvent, { kind: 'enemyDamaged' }>

/**
 * One shot from `def` at `target`, flown all the way, and the one `enemyDamaged` it published.
 * Collected every tick: `tick()` clears `world.events` at the top, so reading them once at the end
 * sees only the last tick's.
 */
function heardHit(world: World, def: TowerDef, target: Enemy): EnemyDamaged {
	const attack = attackOf(def)
	const queue = createCommandQueue()
	const hits: EnemyDamaged[] = []

	spawnProjectile(world, makeTower(world, def, { x: 0, y: 0 }), attack, target, attack.applies)
	for (let guard = 0; guard < 600 && world.projectiles.length > 0; guard++) {
		tick(world, queue)
		for (const event of world.events) {
			if (event.kind === 'enemyDamaged' && event.enemyId === target.id) {
				hits.push(event)
			}
		}
	}

	expect(hits).toHaveLength(1)
	const [hit] = hits
	if (hit === undefined) {
		throw new Error('the shot landed nothing')
	}
	return hit
}

describe('a burrowed Weevil', () => {
	it('is not a Salt Shaker target while it is under', () => {
		const world = makeWorld()
		const enemy = addWeevil(world, 10)
		const shaker = addTower(world, saltShaker, { x: 11, y: 0 })

		run(world, 1)

		expect(enemy.flags.burrowed).toBe(true)
		expect(shaker.targetEnemyId).toBeNull()
		expect(enemy.hp).toBe(10_000)
	})

	it('takes nothing from a heated cell under it, while a surfaced enemy beside it burns', () => {
		const world = makeWorld()
		const under = addWeevil(world, 10)
		const surfaced = addEnemy(world, ant, { distance: 10 })
		writeEffect(world, { x: 10, y: 0 }, 'heat')

		run(world, 30)

		expect(under.flags.burrowed).toBe(true)
		expect(under.hp).toBe(10_000)
		expect(surfaced.hp).toBeLessThan(10_000)
	})

	it('gets exactly 1 from a slimed cell, where a surfaced enemy gets the slime', () => {
		const world = makeWorld()
		const under = addWeevil(world, 10)
		const surfaced = addEnemy(world, ant, { distance: 10 })
		run(world, 1)
		writeEffect(world, { x: 10, y: 0 }, 'slime', { magnitude: 1.6 })

		expect(tileSpeedMultiplier(world, under)).toBe(1)
		expect(tileSpeedMultiplier(world, surfaced)).toBeCloseTo(1.6, 10)
	})

	it('walks under a Cardboard Box in its window, leaving the box whole', () => {
		const world = makeWorld()
		const enemy = addWeevil(world, 9, weevil.speedTilesPerTick)
		const box = addTower(world, cardboardBox, { x: 12, y: 0 })

		// 4 tiles at 1.0 tiles/sec is 240 ticks; 300 puts it a tile past the box and still under.
		run(world, 300)

		expect(enemy.flags.burrowed).toBe(true)
		expect(enemy.distance).toBeGreaterThan(12)
		expect(box.hp).toBe(cardboardBox.maxHp)
	})
})

describe('the burrow window', () => {
	function windowOn(seed: number): Enemy['burrowWindow'] {
		const world = makeWorld()
		world.rng = createRngState(seed)
		return spawnEnemyAt(world, weevil, PATH_ID, 0, 0).burrowWindow
	}

	it('is the same on the same seed and different on another', () => {
		expect(windowOn(1234)).toEqual(windowOn(1234))
		expect(windowOn(1234)).not.toEqual(windowOn(99))
	})

	it("stays inside the def's bounds, in tiles of the lane it spawns on", () => {
		const burrow = weevil.burrow
		expect(burrow).toBeDefined()
		if (burrow === undefined) {
			return
		}

		const world = makeWorld()
		const epsilon = 1e-9
		for (let index = 0; index < 200; index++) {
			const span = spawnEnemyAt(world, weevil, PATH_ID, 0, 0).burrowWindow
			expect(span).not.toBeNull()
			if (span === null) {
				return
			}
			const length = span.toTiles - span.fromTiles

			expect(span.fromTiles).toBeGreaterThanOrEqual(0)
			expect(span.fromTiles).toBeLessThanOrEqual(burrow.startMaxFraction * LANE_TILES + epsilon)
			expect(span.toTiles).toBeLessThanOrEqual(LANE_TILES)
			expect(length).toBeLessThanOrEqual(burrow.lengthMaxFraction * LANE_TILES + epsilon)
			// Clamped at the fridge is the one way to be shorter than the minimum.
			if (span.toTiles < LANE_TILES) {
				expect(length).toBeGreaterThanOrEqual(burrow.lengthMinFraction * LANE_TILES - epsilon)
			}
		}
	})

	it('is null for a def that does not burrow, and costs that spawn no draw', () => {
		const world = makeWorld()
		const before = { ...world.rng }

		const spawned = spawnEnemyAt(world, ant, PATH_ID, 0, 0)

		expect(spawned.burrowWindow).toBeNull()
		expect(world.rng).toEqual(before)
	})
})

describe('a Bay Leaf', () => {
	/** Bay Leaf on tile 15 with radius 3: an enemy on the lane is suppressed over `x` in [12, 18]. */
	const LEAF_X = 15
	const LEAF_RADIUS = 3

	it('surfaces a Weevil on the tick it steps in, holds it up inside, and lets it dive again on leaving', () => {
		const world = makeWorld()
		const enemy = addWeevil(world, 11, weevil.speedTilesPerTick)
		addTower(world, bayLeaf, { x: LEAF_X, y: 0 })
		const shaker = addTower(world, saltShaker, { x: 13, y: 0 })
		const queue = createCommandQueue()
		const events: GameEvent[] = []

		let surfacedOnTick: number | null = null
		// Walk from 11 to 22: dive at once, surface at 12, dive again past 18, still inside the window.
		while (enemy.distance < 22) {
			const wasBurrowed = enemy.flags.burrowed
			tick(world, queue)
			const tickEvents = world.events.filter(
				event => event.kind === 'enemyBurrowed' || event.kind === 'enemySurfaced',
			)
			events.push(...tickEvents)

			// Never an event without a change, and exactly one with one.
			expect(tickEvents).toHaveLength(wasBurrowed === enemy.flags.burrowed ? 0 : 1)

			const inside = Math.abs(enemy.distance - LEAF_X) <= LEAF_RADIUS
			expect(enemy.flags.burrowed).toBe(!inside)

			if (inside && surfacedOnTick === null) {
				surfacedOnTick = world.tick
				// The same tick: burrow runs after movement and before targeting.
				expect(shaker.targetEnemyId).toBe(enemy.id)
			}
		}

		expect(surfacedOnTick).not.toBeNull()
		expect(events.map(event => event.kind)).toEqual(['enemyBurrowed', 'enemySurfaced', 'enemyBurrowed'])
		expect(events.every(event => 'enemyId' in event && event.enemyId === enemy.id)).toBe(true)
	})

	it('does nothing to burrowing when its suppress names a different ability', () => {
		const world = makeWorld()
		const enemy = addWeevil(world, 10)
		addTower(world, testOtherSuppressor, { x: 10, y: 0 })

		run(world, 1)

		expect(suppressionZones(world, 'burrow')).toEqual([])
		expect(enemy.flags.burrowed).toBe(true)
	})
})

describe('the wake and the burrow flag', () => {
	it('leaves a fleeing Weevil untargetable on the tick after, outside its window', () => {
		const world = makeWorld()
		// Past the window, so `burrowSystem` writes `burrowed: false` on it every tick.
		const enemy = addWeevil(world, 30)
		world.noise.level = world.noise.cap
		world.events.push({ kind: 'towerFired', towerId: 0, defId: 'mousetrap', noise: 1 })
		noiseSystem(world)
		expect(enemy.flags.untargetable).toBe(true)

		run(world, 1)

		expect(enemy.flags.burrowed).toBe(false)
		expect(enemy.flags.untargetable).toBe(true)
		expect(isTargetable(enemy, 'both')).toBe(false)
	})
})

describe('a shot in flight', () => {
	it('deals nothing and despawns when its Weevil dives before it lands', () => {
		const world = makeWorld()
		// One tick short of the window: it dives on the first tick, and the grain is 4 tiles out.
		const enemy = addWeevil(world, WINDOW.fromTiles - 0.01, weevil.speedTilesPerTick)
		const attack = attackOf(saltShaker)
		spawnProjectile(world, makeTower(world, saltShaker, { x: 1, y: 0 }), attack, enemy, attack.applies)

		run(world, 1)
		expect(enemy.flags.burrowed).toBe(true)
		runUntilLanded(world)

		expect(enemy.hp).toBe(10_000)
	})
})

describe('the Silverfish and the Lemon', () => {
	it('takes 0.4x from a Salt Shaker grain, 0.7x once a Lemon shot lands, and 0.4x after the strip', () => {
		const world = makeWorld()
		const fish = addEnemy(world, silverfish, { distance: 10 })
		const grain = attackOf(saltShaker).damage

		expect(shoot(world, saltShaker, fish)).toBeCloseTo(grain * 0.4, 10)

		// Chemical against `armored` is 1.0 -- the Lemon's own hit is not what the strip is for.
		expect(shoot(world, lemon, fish)).toBeCloseTo(attackOf(lemon).damage * 1.0, 10)
		expect(findStatus(fish, 'armorStrip')).toBeDefined()

		expect(shoot(world, saltShaker, fish)).toBeCloseTo(grain * 0.7, 10)

		run(world, STATUS_DEFS.armorStrip.durationTicks)
		expect(findStatus(fish, 'armorStrip')).toBeUndefined()
		expect(shoot(world, saltShaker, fish)).toBeCloseTo(grain * 0.4, 10)
	})

	it('publishes the multiplier the hit actually got: 0.4, then 0.7 once a Lemon shot has landed', () => {
		const world = makeWorld()
		const fish = addEnemy(world, silverfish, { distance: 10 })

		expect(heardHit(world, saltShaker, fish).multiplier).toBeCloseTo(0.4, 10)
		heardHit(world, lemon, fish)
		expect(heardHit(world, saltShaker, fish).multiplier).toBeCloseTo(0.7, 10)
	})

	it('publishes 1.5 for a chemical hit on an Ant, which is swarm', () => {
		const world = makeWorld()
		const target = addEnemy(world, ant, { distance: 10 })

		const hit = heardHit(world, lemon, target)
		expect(hit.multiplier).toBeCloseTo(1.5, 10)
		expect(hit.amount).toBeCloseTo(attackOf(lemon).damage * 1.5, 10)
	})

	it('moves the armored factor inside the product, not after it', () => {
		const stripped: DamageTarget = { tags: ['armored', 'mammal'], statuses: [] }
		applyStatus(stripped, createStatus('armorStrip'))

		// 0.7 armored-stripped x 1.5 mammal. Not 0.8 (the whole product moved halfway to 1.0), and
		// not 0.9 (0.4 x 1.5 plus a flat 0.3).
		expect(resolveDamage(10, 'physical', stripped)).toBeCloseTo(10 * 0.7 * 1.5, 10)

		const marked: DamageTarget = { tags: ['armored'], statuses: [] }
		applyStatus(marked, createStatus('armorStrip'))
		applyStatus(marked, createStatus('marked'))

		expect(resolveDamage(10, 'physical', marked)).toBeCloseTo(10 * 0.7 * 1.25, 10)
	})
})
