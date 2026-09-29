import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isCollect, isPushback, toApplications } from '@/core/content/behaviours.ts'
import { ant, beetle, ENEMIES, mold, mouse } from '@/core/content/enemies.ts'
import { applyStatuses } from '@/core/content/statuses.ts'
import { validateContent } from '@/core/content/schema.ts'
import { cardboardBox, mintPot, saltShaker, toasterCrumbTray, TOWERS } from '@/core/content/towers.ts'
import { createCommandQueue } from '@/core/commands.ts'
import { tick } from '@/core/sim.ts'
import { barricadeHolding } from '@/core/systems/barricades.ts'
import { isDropped, isGone, isOnShelf, stealsFor, takeFood } from '@/core/systems/fridge.ts'
import { FLEE_SPEED_MULT } from '@/core/systems/movement.ts'
import { pushEnemy } from '@/core/systems/pushback.ts'
import { spawnEnemyAt } from '@/core/systems/spawn.ts'
import { isTargetable, pickTarget } from '@/core/systems/targeting.ts'
import { grabProgress, isRetreating } from '@/core/systems/theft.ts'
import { createWorld } from '@/core/world.ts'
import type { Command } from '@/core/commands.ts'
import type { EnemyDef, TowerDef } from '@/core/content/schema.ts'
import type { Enemy, EntityId, FoodItem, GameEvent, Tower, Vec2, World } from '@/core/types.ts'
import { createTestWorld } from './fixtures/world.ts'

/**
 * Step 19A: the thief, headless.
 *
 * The fixture's lane runs (0,0) to (39,0), so an enemy's position is `(distance, 0)` and the fridge is
 * at `distance` 39. Every assertion reads `grabTicks`, `fleeSpeedMult` and `steals` off the defs, never
 * their values, so step 19D's re-tune moves none of them.
 *
 * The synthetic `burglar` is a Mouse with 3 steals and a handful of HP, for the specs where the Mouse's
 * 200 would get in the way.
 */

const PATH_ID = 'a'
const LANE = 39

const burglar: EnemyDef = {
	...mouse,
	id: 'burglar',
	nameKey: 'enemy.burglar.name',
	descriptionKey: 'enemy.burglar.description',
	hp: 20,
	steals: 3,
}

const GRAB_TICKS = mouse.thief?.grabTicks ?? 0
const FLEE_MULT = mouse.thief?.fleeSpeedMult ?? 0

/** `burglar` is not in the roster, and Mint Pot is not buyable; `getEnemyDef` / `getTowerDef` read only those. */
beforeAll(() => {
	;(ENEMIES as EnemyDef[]).push(burglar)
	;(TOWERS as TowerDef[]).push(mintPot)
})

afterAll(() => {
	;(ENEMIES as EnemyDef[]).splice(ENEMIES.length - 1, 1)
	;(TOWERS as TowerDef[]).splice(TOWERS.length - 1, 1)
})

/** A running wave that never spawns, and a shelf of `items` fresh items. */
function makeWorld(items = 8): World {
	const world = createTestWorld()
	world.night.phase = 'wave'
	world.night.wave = {
		index: 0,
		startedAtTick: 0,
		spawns: [{ enemyDefId: 'ant', remaining: 1, nextSpawnTick: 1_000_000, spacingTicks: 60, pathId: PATH_ID }],
	}
	world.night.food = Array.from({ length: items }, (_, index): FoodItem => ({
		id: world.nextEntityId + index,
		defId: 'cheese',
		nameKey: 'food.cheese.name',
		heldBy: null,
		droppedAt: null,
		lostTo: null,
	}))
	world.nextEntityId += items
	return world
}

function spawn(world: World, def: EnemyDef, distance: number): Enemy {
	return spawnEnemyAt(world, def, PATH_ID, distance, 0)
}

/** A thief already on its way home, carrying whatever the shelf gives it. */
function fleeingThief(world: World, def: EnemyDef, distance: number, carrying = true): Enemy {
	const thief = spawn(world, def, distance)
	if (thief.theft === null) {
		throw new Error(`'${def.id}' is not a thief`)
	}
	thief.theft.phase = 'fleeing'
	if (carrying) {
		takeFood(world, thief)
	}
	return thief
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

function eventsOfKind<K extends GameEvent['kind']>(
	log: readonly GameEvent[],
	kind: K,
): Extract<GameEvent, { kind: K }>[] {
	return log.filter((event): event is Extract<GameEvent, { kind: K }> => event.kind === kind)
}

function shelfIds(world: World): EntityId[] {
	return world.night.food.filter(isOnShelf).map(item => item.id)
}

/** Every held id names its holder back, and every holder lists exactly what names it. */
function expectHoldsConsistent(world: World): void {
	for (const enemy of world.enemies) {
		for (const id of enemy.stolenItems) {
			expect(world.night.food.find(item => item.id === id)?.heldBy).toBe(enemy.id)
		}
	}
	for (const item of world.night.food) {
		if (item.heldBy !== null) {
			expect(world.enemies.find(enemy => enemy.id === item.heldBy)?.stolenItems).toContain(item.id)
		}
	}
}

/** A thief one step short of the fridge, so the first tick puts it there. */
function arrivingThief(world: World, def: EnemyDef): Enemy {
	return spawn(world, def, LANE - def.speedTilesPerTick / 2)
}

describe('the grab', () => {
	it('stops at the fridge for exactly grabTicks, then takes the first stealsFor items off the shelf', () => {
		const world = makeWorld()
		const thief = arrivingThief(world, burglar)
		const firstIds = shelfIds(world).slice(0, stealsFor(world, burglar))

		run(world, 1)
		expect(thief.distance).toBe(LANE)
		expect(thief.theft).toEqual({ phase: 'grabbing', grabEndsTick: GRAB_TICKS })

		// Up to the tick before `grabEndsTick`: standing still, and the shelf untouched.
		const log = run(world, GRAB_TICKS - 1)
		expect(world.tick).toBe(GRAB_TICKS)
		expect(thief.distance).toBe(LANE)
		expect(eventsOfKind(log, 'thiefGrabbed')).toHaveLength(0)
		expect(world.night.food.every(isOnShelf)).toBe(true)
		expect(grabProgress(world, thief)).toBe(1)

		const grab = run(world, 1)
		expect(firstIds).toHaveLength(burglar.steals)
		expect(thief.stolenItems).toEqual(firstIds)
		for (const id of firstIds) {
			expect(world.night.food.find(item => item.id === id)?.heldBy).toBe(thief.id)
		}
		expect(eventsOfKind(grab, 'thiefGrabbed')).toEqual([
			{ kind: 'thiefGrabbed', enemyId: thief.id, items: firstIds },
		])
		expect(thief.theft?.phase).toBe('fleeing')
		// Carried is not gone: the fridge is not empty while a thief still has it.
		expect(world.night.food.some(isGone)).toBe(false)
	})

	it('reports its progress from 0 to 1 over the grab', () => {
		const world = makeWorld()
		const thief = arrivingThief(world, burglar)
		run(world, 1)

		expect(grabProgress(world, thief)).toBeCloseTo(1 / GRAB_TICKS, 9)
		run(world, GRAB_TICKS / 2 - 1)
		expect(grabProgress(world, thief)).toBeCloseTo(0.5, 9)
	})

	it('takes nothing when killed during the grab', () => {
		const world = makeWorld()
		const thief = arrivingThief(world, burglar)
		run(world, 2)
		thief.hp = 0

		const log = run(world, 1)
		expect(eventsOfKind(log, 'enemyKilled')).toHaveLength(1)
		expect(world.night.food.every(isOnShelf)).toBe(true)
	})

	it('takes nothing when a burn earlier in the completing tick kills it', () => {
		const world = makeWorld()
		const thief = arrivingThief(world, burglar)
		run(world, GRAB_TICKS)
		expect(thief.theft?.phase).toBe('grabbing')

		// `status` runs in the completing tick, long before `theft`.
		thief.hp = 1
		thief.statuses.push({
			kind: 'burn',
			remainingTicks: 5,
			stacks: 1,
			magnitude: 10,
			sourceId: null,
			damageType: 'fire',
		})

		const log = run(world, 1)
		expect(eventsOfKind(log, 'thiefGrabbed')).toHaveLength(0)
		expect(eventsOfKind(log, 'enemyKilled')).toHaveLength(1)
		expect(world.night.food.every(isOnShelf)).toBe(true)
	})

	it('never hands a second thief the items the first one is holding', () => {
		const world = makeWorld(8)
		const first = fleeingThief(world, burglar, 20)
		const second = fleeingThief(world, burglar, 25)

		expect(first.stolenItems).toHaveLength(burglar.steals)
		expect(second.stolenItems).toHaveLength(burglar.steals)
		expect(second.stolenItems.some(id => first.stolenItems.includes(id))).toBe(false)
		expectHoldsConsistent(world)
	})

	it('never leaks, even standing on the fridge', () => {
		const world = makeWorld()
		arrivingThief(world, burglar)

		const log = run(world, 2)
		expect(eventsOfKind(log, 'enemyLeaked')).toHaveLength(0)
		expect(world.enemies).toHaveLength(1)
	})
})

describe('the flight', () => {
	it('runs home at exactly speed x fleeSpeedMult on a bare floor, and slower under a slow', () => {
		const world = makeWorld()
		const thief = fleeingThief(world, burglar, 20)

		run(world, 1)
		expect(thief.distance).toBeCloseTo(20 - burglar.speedTilesPerTick * FLEE_MULT, 12)

		const slowed = fleeingThief(world, burglar, 20)
		applyStatuses(slowed, toApplications(['slow']), 99, 'cold')
		run(world, 1)
		expect(20 - slowed.distance).toBeGreaterThan(0)
		expect(20 - slowed.distance).toBeLessThan(burglar.speedTilesPerTick * FLEE_MULT)
	})

	it('is held by a box behind it, at the box plus the gap, and chews it', () => {
		const world = makeWorld()
		const box = addTower(world, cardboardBox, { x: 15, y: 0 })
		box.hp = box.maxHp = 1_000_000
		const thief = fleeingThief(world, burglar, 15.6)
		thief.hp = thief.maxHp = 1_000_000

		run(world, 30)

		expect(thief.distance).toBeCloseTo(15.5, 9)
		expect(barricadeHolding(world, thief)?.id).toBe(box.id)
		expect(box.hp).toBeLessThan(1_000_000)
		// It chews every tick it is at the hold point, and only then: 15.6 to 15.5 takes a few ticks.
		const ticksHeld = 30 - Math.ceil(0.1 / (burglar.speedTilesPerTick * FLEE_MULT)) + 1
		expect(1_000_000 - box.hp).toBeCloseTo(ticksHeld * burglar.meleeDamagePerTick, 6)
	})

	it('is not held by a box it has already passed on the way back', () => {
		const world = makeWorld()
		const box = addTower(world, cardboardBox, { x: 25, y: 0 })
		const thief = fleeingThief(world, burglar, 20)

		run(world, 10)

		expect(thief.distance).toBeCloseTo(20 - 10 * burglar.speedTilesPerTick * FLEE_MULT, 9)
		expect(barricadeHolding(world, thief)).toBeNull()
		expect(box.hp).toBe(box.maxHp)
	})

	it('reads as retreating, and targetable', () => {
		const world = makeWorld()
		const thief = fleeingThief(world, burglar, 20)

		expect(isRetreating(thief)).toBe(true)
		expect(isTargetable(thief, 'ground')).toBe(true)
	})
})

describe('the escape', () => {
	it('marks exactly its items escaped, removes it, pays nothing, counts no kill, and says so', () => {
		const world = makeWorld()
		const thief = fleeingThief(world, burglar, burglar.speedTilesPerTick / 2)
		const carried = [...thief.stolenItems]
		const crumbs = world.crumbs

		const log = run(world, 1)

		expect(world.enemies).toEqual([])
		expect(world.index.enemies).toEqual({})
		for (const item of world.night.food) {
			expect(item.lostTo).toBe(carried.includes(item.id) ? 'escaped' : null)
			expect(item.heldBy).toBeNull()
		}
		expect(world.crumbs).toBe(crumbs)
		expect(world.crumbPiles).toEqual([])
		expect(world.night.enemiesKilled).toBe(0)
		expect(eventsOfKind(log, 'enemyKilled')).toHaveLength(0)
		expect(eventsOfKind(log, 'thiefEscaped')).toEqual([
			{ kind: 'thiefEscaped', enemyId: thief.id, defId: burglar.id, items: carried },
		])
	})

	it('is a kill, with the items dropped where it died, when it dies on the tick it would have escaped', () => {
		const world = makeWorld()
		const thief = fleeingThief(world, burglar, burglar.speedTilesPerTick / 2)
		const carried = [...thief.stolenItems]
		thief.hp = 0

		const log = run(world, 1)

		expect(world.enemies).toEqual([])
		expect(world.night.enemiesKilled).toBe(1)
		expect(eventsOfKind(log, 'enemyKilled')).toHaveLength(1)
		expect(eventsOfKind(log, 'thiefEscaped')).toHaveLength(0)
		expect(world.night.food.filter(isDropped).map(item => item.id)).toEqual(carried)
		expect(world.night.food.some(isGone)).toBe(false)
	})

	it('keeps the night alive while a thief holds the last items, and loses it when they escape', () => {
		const world = makeWorld(burglar.steals)
		const thief = fleeingThief(world, burglar, 1)
		expect(world.night.food.every(item => item.heldBy === thief.id)).toBe(true)

		run(world, 1)
		expect(world.night.phase).toBe('wave')

		const log = run(world, Math.ceil(1 / (burglar.speedTilesPerTick * FLEE_MULT)))
		expect(eventsOfKind(log, 'thiefEscaped')).toHaveLength(1)
		expect(world.night.phase).toBe('lost')
	})
})

describe('the wake', () => {
	function wakeNextTick(world: World): void {
		world.noise.level = world.noise.cap * 2
	}

	it('sends a thief woken mid-grab home with nothing', () => {
		const world = makeWorld()
		const thief = arrivingThief(world, burglar)
		run(world, 2)
		expect(thief.theft?.phase).toBe('grabbing')

		wakeNextTick(world)
		const woken = run(world, 1)
		expect(eventsOfKind(woken, 'humanWoke')).toHaveLength(1)
		expect(thief.flags.fleeing).toBe(true)
		expect(thief.theft?.phase).toBe('fleeing')

		const log = run(world, GRAB_TICKS * 2)
		expect(eventsOfKind(log, 'thiefGrabbed')).toHaveLength(0)
		expect(thief.stolenItems).toEqual([])
		expect(world.night.food.every(isOnShelf)).toBe(true)
	})

	it('runs a carrying thief out at the wake speed, untargetable, and its items escape at 0', () => {
		const world = makeWorld()
		const thief = fleeingThief(world, burglar, 5)
		const carried = [...thief.stolenItems]

		wakeNextTick(world)
		run(world, 1)
		expect(isTargetable(thief, 'ground')).toBe(false)

		const before = thief.distance
		run(world, 1)
		expect(thief.distance).toBeCloseTo(before - burglar.speedTilesPerTick * FLEE_SPEED_MULT, 12)

		const log = run(world, Math.ceil(thief.distance / (burglar.speedTilesPerTick * FLEE_SPEED_MULT)) + 1)
		expect(world.enemies).toEqual([])
		expect(eventsOfKind(log, 'thiefEscaped')).toEqual([
			{ kind: 'thiefEscaped', enemyId: thief.id, defId: burglar.id, items: carried },
		])
		expect(world.night.food.filter(item => item.lostTo === 'escaped').map(item => item.id)).toEqual(carried)
		expect(world.night.enemiesKilled).toBe(0)
	})
})

describe('pushback, through Mint Pot', () => {
	const PUSH_TILES = mintPot.behaviours.find(isPushback)?.pushTiles ?? 0

	it('shoves a fleeing thief toward the fridge, and says it moved exactly the gain', () => {
		const world = makeWorld()
		const thief = fleeingThief(world, burglar, 10)
		thief.speed = 0
		thief.hp = thief.maxHp = 1_000_000
		const pot = addTower(world, mintPot, { x: 10, y: 1 })

		const log = run(world, 1)

		expect(PUSH_TILES).toBeGreaterThan(0)
		expect(thief.distance).toBeCloseTo(10 + PUSH_TILES, 9)
		const shoves = eventsOfKind(log, 'enemyPushed')
		expect(shoves).toHaveLength(1)
		expect(shoves[0]?.sourceTowerId).toBe(pot.id)
		expect(shoves[0]?.tiles).toBeCloseTo(thief.distance - 10, 12)
	})

	it('never pushes a fleeing thief past the lane length', () => {
		const world = makeWorld()
		const thief = fleeingThief(world, burglar, LANE - 0.3)

		expect(pushEnemy(world, thief, PUSH_TILES, 99)).toBeCloseTo(0.3, 9)
		expect(thief.distance).toBe(LANE)
	})

	it('leaves a grabbing thief where it stands', () => {
		const world = makeWorld()
		const thief = arrivingThief(world, burglar)
		thief.hp = thief.maxHp = 1_000_000
		run(world, 1)
		addTower(world, mintPot, { x: LANE, y: 1 })

		const log = run(world, 1)
		expect(eventsOfKind(log, 'pushbackFired')).toHaveLength(1)
		expect(eventsOfKind(log, 'enemyPushed')).toHaveLength(0)
		expect(thief.distance).toBe(LANE)
	})
})

describe('FIRST', () => {
	it('prefers a fleeing thief 3 tiles from the crack over an Ant 5 from the fridge, and a grabbing thief over both', () => {
		const world = makeWorld()
		// Listed first, so a tie would go to it: the thief has to win on the score.
		spawn(world, ant, LANE - 5)
		const runner = fleeingThief(world, burglar, 3, false)
		const tower = addTower(world, saltShaker, { x: 20, y: 1 })
		tower.targetingMode = 'FIRST'
		const reach = { rangeTiles: 50, targets: 'ground' as const }

		expect(pickTarget(world, tower, reach)?.id).toBe(runner.id)

		const grabber = spawn(world, burglar, LANE)
		grabber.theft = { phase: 'grabbing', grabEndsTick: 1_000 }
		expect(pickTarget(world, tower, reach)?.id).toBe(grabber.id)
	})
})

describe('the stealsReduction hook', () => {
	it('takes one off every thief and walker alike through the one take, never below 1, and 0 stays 0', () => {
		const world = createWorld({
			seed: 1234,
			mapId: 'counter',
			nightId: 'night01',
			difficulty: 'normal',
			food: { stealsReduction: 1 },
		})
		expect(world.night.stealsReduction).toBe(1)
		const lane = world.map.paths[0]?.id ?? ''

		// `resolve`'s leak and `theft`'s grab both call `takeFood`, so this is both doors at once.
		const walker = spawnEnemyAt(world, ant, lane, 0, 0)
		const bruiser = spawnEnemyAt(world, beetle, lane, 0, 0)
		const thief = spawnEnemyAt(world, mouse, lane, 0, 0)

		expect(takeFood(world, walker)).toHaveLength(1)
		expect(takeFood(world, bruiser)).toHaveLength(beetle.steals - 1)
		expect(takeFood(world, thief)).toHaveLength(mouse.steals - 1)
		expect(stealsFor(world, mold)).toBe(0)
		expect(stealsFor(world, ant)).toBe(1)
	})

	it('is 0 on a world built without it', () => {
		const world = createWorld({ seed: 1234, mapId: 'counter', nightId: 'night01', difficulty: 'normal' })
		expect(world.night.stealsReduction).toBe(0)
		expect(stealsFor(world, mouse)).toBe(mouse.steals)
	})
})

describe('dropped food', () => {
	const TRAY_RADIUS = toasterCrumbTray.behaviours.find(isCollect)?.radiusTiles ?? 0

	/** One tick with these commands in its batch. */
	function runWith(world: World, commands: readonly Command[]): GameEvent[] {
		const queue = createCommandQueue()
		for (const command of commands) {
			queue.enqueue(command)
		}
		tick(world, queue)
		return [...world.events]
	}

	/** A three-item burglar killed halfway home. Returns what it carried and where it fell. */
	function killCarrying(world: World): { carried: EntityId[]; at: Vec2; log: GameEvent[] } {
		const thief = fleeingThief(world, burglar, 20)
		const carried = [...thief.stolenItems]
		thief.hp = 0
		const log = run(world, 1)
		const at = eventsOfKind(log, 'enemyKilled')[0]?.at ?? { x: Number.NaN, y: Number.NaN }
		return { carried, at, log }
	}

	function foodById(world: World, id: EntityId): FoodItem | undefined {
		return world.night.food.find(item => item.id === id)
	}

	it('lands exactly the carried items at the death position, off the shelf and not gone', () => {
		const world = makeWorld()
		const thief = fleeingThief(world, burglar, 20)
		const carried = [...thief.stolenItems]
		thief.hp = 0

		const log = run(world, 1)
		const killed = eventsOfKind(log, 'enemyKilled')
		expect(killed).toHaveLength(1)
		const at = killed[0]?.at

		expect(carried).toHaveLength(3)
		expect(world.night.food.filter(isDropped).map(item => item.id)).toEqual(carried)
		for (const id of carried) {
			const item = foodById(world, id)
			expect(item?.droppedAt).toEqual(at)
			// A copy, never the event's object.
			expect(item?.droppedAt).not.toBe(at)
			expect(item?.heldBy).toBeNull()
			expect(item && isOnShelf(item)).toBe(false)
			expect(item && isGone(item)).toBe(false)
		}
		expect(thief.stolenItems).toEqual([])
		expect(eventsOfKind(log, 'foodDropped')).toEqual([
			{ kind: 'foodDropped', enemyId: thief.id, items: carried, at },
		])
	})

	it('goes back on the shelf, as the same food, one CollectFood per item, and once for a double click', () => {
		const world = makeWorld()
		const before = structuredClone(world.night.food)
		const { carried, at } = killCarrying(world)
		const [first] = carried

		const log = runWith(world, [
			...carried.map((foodId): Command => ({ kind: 'CollectFood', foodId })),
			{ kind: 'CollectFood', foodId: first ?? -1 },
		])

		expect(world.night.food).toEqual(before)
		expect(world.night.food.every(isOnShelf)).toBe(true)
		expect(eventsOfKind(log, 'foodReturned')).toEqual(
			carried.map(id => ({ kind: 'foodReturned', items: [id], from: at, byTowerId: null })),
		)
	})

	it('is fetched by a Toaster Crumb Tray in reach on the next tick, and left by one out of it', () => {
		expect(TRAY_RADIUS).toBe(2.5)

		// In reach: the tower is there before the kill, so the tick after it is the first chance.
		const world = makeWorld()
		const near = addTower(world, toasterCrumbTray, { x: 20, y: 1 })
		const { carried, at } = killCarrying(world)
		expect(Math.hypot(at.x - near.tile.x, at.y - near.tile.y)).toBeLessThanOrEqual(TRAY_RADIUS)
		expect(world.night.food.filter(isDropped)).toHaveLength(3)

		const log = run(world, 1)
		expect(world.night.food.every(isOnShelf)).toBe(true)
		expect(eventsOfKind(log, 'foodReturned')).toEqual(
			carried.map(id => ({ kind: 'foodReturned', items: [id], from: at, byTowerId: near.id })),
		)

		// Out of reach: six tiles along the lane.
		const other = makeWorld()
		const far = addTower(other, toasterCrumbTray, { x: 26, y: 0 })
		const dropped = killCarrying(other)
		expect(Math.hypot(dropped.at.x - far.tile.x, dropped.at.y - far.tile.y)).toBeGreaterThan(TRAY_RADIUS)

		const idle = run(other, 60)
		expect(eventsOfKind(idle, 'foodReturned')).toHaveLength(0)
		for (const id of dropped.carried) {
			expect(foodById(other, id)?.droppedAt).toEqual(dropped.at)
		}
	})

	it('is lost to the floor on the tick a night is won with it still there', () => {
		const world = makeWorld()
		const { carried } = killCarrying(world)
		expect(world.night.phase).toBe('wave')

		// The last spawn is out and the board is empty: the next resolve wins the night.
		const lastSpawn = world.night.wave?.spawns[0]
		expect(lastSpawn).toBeDefined()
		if (lastSpawn !== undefined) {
			lastSpawn.remaining = 0
		}
		const log = run(world, 1)

		expect(eventsOfKind(log, 'nightEnded')).toEqual([{ kind: 'nightEnded', won: true }])
		for (const item of world.night.food) {
			expect(item.lostTo).toBe(carried.includes(item.id) ? 'floor' : null)
			expect(item.droppedAt).toBeNull()
		}
	})

	it('is left exactly where it was by a wake', () => {
		const world = makeWorld()
		// A wave still to come. A wake zeroes the remaining spawns, so on the fixture's one-wave night
		// it would also win the night on the spot -- and a win is what forfeits the floor, not the wake.
		world.night.waveCount = 2
		const { carried, at } = killCarrying(world)
		const before = structuredClone(world.night.food)

		world.noise.level = world.noise.cap * 2
		const log = run(world, 1)

		expect(eventsOfKind(log, 'humanWoke')).toHaveLength(1)
		expect(world.night.food).toEqual(before)
		for (const id of carried) {
			expect(foodById(world, id)?.droppedAt).toEqual(at)
		}
	})

	it('drops nothing for an Ant, and CollectFood for a shelf, carried or unknown id changes nothing', () => {
		const world = makeWorld()
		const walker = spawn(world, ant, 10)
		walker.hp = 0
		expect(eventsOfKind(run(world, 1), 'foodDropped')).toHaveLength(0)

		const thief = fleeingThief(world, burglar, 20)
		const [held] = thief.stolenItems
		const [shelved] = shelfIds(world)
		const before = structuredClone(world.night.food)

		const log = runWith(world, [
			{ kind: 'CollectFood', foodId: shelved ?? -1 },
			{ kind: 'CollectFood', foodId: held ?? -1 },
			{ kind: 'CollectFood', foodId: 999_999 },
		])

		expect(world.night.food).toEqual(before)
		expect(thief.stolenItems).toHaveLength(3)
		expect(eventsOfKind(log, 'foodReturned')).toHaveLength(0)
		expectHoldsConsistent(world)
	})
})

describe('the food invariant', () => {
	it('holds every tick through two grabs, a kill, a leak and an escape', () => {
		const world = makeWorld(10)
		const queue = createCommandQueue()

		const first = arrivingThief(world, burglar)
		// Arrives while the first is still grabbing, so both hold items at once.
		const second = spawn(world, burglar, LANE - 40 * burglar.speedTilesPerTick)
		spawn(world, ant, LANE - 60 * ant.speedTilesPerTick)
		let killed = false

		for (let index = 0; index < 5000 && world.enemies.length > 0; index++) {
			// The first one dies halfway home; the second gets away.
			if (!killed && first.theft?.phase === 'fleeing' && first.distance < LANE / 2) {
				first.hp = 0
				killed = true
			}
			tick(world, queue)
			expectHoldsConsistent(world)
		}

		expect(killed).toBe(true)
		expect(world.enemies).toEqual([])
		expect(world.night.food.filter(item => item.lostTo === 'escaped')).toHaveLength(burglar.steals)
		expect(world.night.food.filter(item => item.lostTo === 'eaten')).toHaveLength(ant.steals)
		expect(second.stolenItems).toEqual([])
	})

	it('leaves world.rng untouched through a whole grab, flight and escape', () => {
		const world = makeWorld()
		const rng = structuredClone(world.rng)
		arrivingThief(world, burglar)

		const log = run(world, GRAB_TICKS + Math.ceil(LANE / (burglar.speedTilesPerTick * FLEE_MULT)) + 2)

		expect(eventsOfKind(log, 'thiefEscaped')).toHaveLength(1)
		expect(world.rng).toEqual(rng)
	})
})

describe('the schema', () => {
	it('rejects a thief field with no thief tag, and a thief tag with no field', () => {
		const untagged: EnemyDef = { ...burglar, tags: ['ground', 'mammal'] }
		const unfielded: EnemyDef = { ...ant, tags: [...ant.tags, 'thief'] }

		expect(() => validateContent({ enemies: [untagged] })).toThrow(/thief/)
		expect(() => validateContent({ enemies: [unfielded] })).toThrow(/thief/)
		expect(() => validateContent({ enemies: [mouse] })).not.toThrow()
	})
})
