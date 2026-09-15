import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { attack } from '@/core/content/behaviours.ts'
import { ant, fly } from '@/core/content/enemies.ts'
import { saltShaker, toaster, TOWERS } from '@/core/content/towers.ts'
import { createCommandQueue } from '@/core/commands.ts'
import { totalLength } from '@/core/path.ts'
import { tick } from '@/core/sim.ts'
import { placeTower } from '@/core/systems/placement.ts'
import { queryEnemiesInRange } from '@/core/systems/spatial.ts'
import { isFlyer, isTargetable, pickTarget } from '@/core/systems/targeting.ts'
import { createWorld } from '@/core/world.ts'
import type { AttackBehaviour } from '@/core/content/behaviours.ts'
import type { TowerDef } from '@/core/content/schema.ts'
import type { Enemy, EnemyTag, GameEvent, TargetingMode, Tower, Vec2, World } from '@/core/types.ts'
import { createTestWorld } from './fixtures/world.ts'

/**
 * Range, target choice, the shot on its cooldown, the projectile, and the death at the other end.
 *
 * The fixture's map is one row 40 tiles wide with path `a` running (0,0) to (39,0), so an enemy's
 * position is `(distance, 0)` and every range assertion below is arithmetic anyone can check by
 * eye. Its night is over, so every test starts by putting it back into a phase that runs systems.
 *
 * Towers and enemies are pushed onto the world directly rather than through `placeTower`, because
 * the fixture's single off-track tile would put every tower in this file on the same square. The
 * one test that cares about placement is the acceptance run at the bottom, which uses the Counter.
 */

const PATH_ID = 'a'

/** The fixture's lane, measured: waypoints (0,0) to (39,0). */
const LANE_LENGTH = 39

function makeWorld(): World {
	const world = createTestWorld()
	// A wave that is permanently mid-spawn. The fixture's `nightId` is synthetic, so a phase the
	// wave system counts down in would send it to `getNightDef('test')`; and a wave still spawning
	// keeps `resolveSystem` from declaring the night won the moment the board empties.
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
	pathId?: string
	tags?: EnemyTag[]
	hidden?: boolean
	untargetable?: boolean
}

/** Speed defaults to 0 so a spec's positions stay exactly where it put them. */
function addEnemy(world: World, overrides: EnemyOverrides = {}): Enemy {
	const hp = overrides.hp ?? 10
	const enemy: Enemy = {
		id: world.nextEntityId++,
		defId: 'ant',
		pathId: overrides.pathId ?? PATH_ID,
		distance: overrides.distance ?? 0,
		lateralOffsetTiles: 0,
		hp,
		maxHp: hp,
		statuses: [],
		tags: overrides.tags ?? [...ant.tags],
		speed: overrides.speed ?? 0,
		spawnedInWaveIndex: 0,
		stolenItems: [],
		flags: {
			hidden: overrides.hidden ?? false,
			untargetable: overrides.untargetable ?? false,
			fleeing: false,
			revealed: false,
		},
	}

	world.index.enemies[enemy.id] = world.enemies.length
	world.enemies.push(enemy)
	return enemy
}

function addTower(world: World, def: TowerDef, tile: Vec2, targetingMode?: TargetingMode): Tower {
	const tower: Tower = {
		id: world.nextEntityId++,
		defId: def.id,
		tile: { x: tile.x, y: tile.y },
		hp: def.maxHp,
		maxHp: def.maxHp,
		tier: 0,
		targetingMode: targetingMode ?? def.defaultTargetingMode,
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

/** Runs `count` ticks, collecting every event with the tick it was published on. */
function run(world: World, count: number): { tick: number; event: GameEvent }[] {
	const queue = createCommandQueue()
	const log: { tick: number; event: GameEvent }[] = []

	for (let index = 0; index < count; index++) {
		const at = world.tick
		tick(world, queue)
		for (const event of world.events) {
			log.push({ tick: at, event })
		}
	}

	return log
}

function ticksOfKind(log: readonly { tick: number; event: GameEvent }[], kind: GameEvent['kind']): number[] {
	return log.filter(entry => entry.event.kind === kind).map(entry => entry.tick)
}

function eventsOfKind<K extends GameEvent['kind']>(
	log: readonly { tick: number; event: GameEvent }[],
	kind: K,
): Extract<GameEvent, { kind: K }>[] {
	return log.filter(entry => entry.event.kind === kind).map(entry => entry.event as Extract<GameEvent, { kind: K }>)
}

function shotOf(def: TowerDef): AttackBehaviour {
	const found = def.behaviours.find(behaviour => behaviour.kind === 'attack')
	if (found === undefined || found.kind !== 'attack') {
		throw new Error(`tower '${def.id}' has no attack behaviour`)
	}
	return found
}

/**
 * A second DPS tower, registered for the length of this file.
 *
 * It exists to prove the acceptance criterion "adding a DPS tower requires zero changes to
 * `core/systems/`" and to get a *chemical* source onto the board -- the Salt Shaker is physical, and
 * physical against an Ant multiplies by exactly 1.0, which is the one multiplier a broken matrix
 * lookup also produces. `getTowerDef` reads `TOWERS`, so a synthetic def has to be in it; the cast
 * is because `TOWERS` infers a union of literal-id types.
 */
const testSprayer: TowerDef = {
	id: 'testSprayer',
	nameKey: 'tower.testSprayer.name',
	descriptionKey: 'tower.testSprayer.description',
	glyph: '🧪',
	role: 'BASIC_DPS',
	cost: 50,
	maxHp: 100,
	placement: 'off_path',
	noise: 3,
	defaultTargetingMode: 'FIRST',
	// Not the roster, so no tiers. The per-entry schema bounds `upgrades` at three and the
	// collection check in `validateContent` is what requires three of a real tower.
	upgrades: [],
	behaviours: [
		attack({
			damage: 10,
			damageType: 'chemical',
			cooldownTicks: 60,
			rangeTiles: 3,
			targets: 'ground',
			projectileSpeed: 0.2,
		}),
	],
}

/** The same tower with `projectileSpeed: 0`, so both halves of decision 2 have a user here. */
const testInstant: TowerDef = {
	...testSprayer,
	id: 'testInstant',
	nameKey: 'tower.testInstant.name',
	descriptionKey: 'tower.testInstant.description',
	behaviours: [{ ...shotOf(testSprayer), projectileSpeed: 0 }],
}

const REGISTERED: TowerDef[] = [testSprayer, testInstant]

beforeAll(() => {
	;(TOWERS as TowerDef[]).push(...REGISTERED)
})

afterAll(() => {
	;(TOWERS as TowerDef[]).splice(TOWERS.length - REGISTERED.length, REGISTERED.length)
})

describe('range', () => {
	it('includes an enemy at exactly rangeTiles and excludes one a thousandth further', () => {
		const world = makeWorld()
		const inRange = addEnemy(world, { distance: 13 })
		const outOfRange = addEnemy(world, { distance: 13.001 })

		// Tower on (10,0), enemies on (13,0) and (13.001,0): exactly 3 tiles and 3.001 tiles.
		const found = queryEnemiesInRange(world, { x: 10, y: 0 }, 3)

		expect(found.map(enemy => enemy.id)).toEqual([inRange.id])
		expect(found.map(enemy => enemy.id)).not.toContain(outOfRange.id)
	})

	it('measures from the tile itself, with no half-tile offset', () => {
		const world = makeWorld()
		addEnemy(world, { distance: 10 })

		// A `+ 0.5` anywhere in core/ would make this 3.5 tiles away and drop it from a range-3 query.
		expect(queryEnemiesInRange(world, { x: 13, y: 0 }, 3)).toHaveLength(1)
	})

	it('skips an enemy whose path the map does not have, rather than throwing', () => {
		const world = makeWorld()
		addEnemy(world, { distance: 10, pathId: 'a-lane-that-was-deleted' })

		expect(() => queryEnemiesInRange(world, { x: 10, y: 0 }, 3)).not.toThrow()
		expect(queryEnemiesInRange(world, { x: 10, y: 0 }, 3)).toEqual([])
	})
})

describe('isTargetable', () => {
	const ground: EnemyTag[] = ['ground', 'swarm', 'bug']
	const air: EnemyTag[] = ['air', 'swarm']

	it('lets a ground attack hit ground only, an air attack air only, and both hit either', () => {
		const world = makeWorld()
		const walker = addEnemy(world, { tags: ground })
		const flyer = addEnemy(world, { tags: air })

		expect(isTargetable(walker, 'ground')).toBe(true)
		expect(isTargetable(walker, 'air')).toBe(false)
		expect(isTargetable(walker, 'both')).toBe(true)

		expect(isTargetable(flyer, 'ground')).toBe(false)
		expect(isTargetable(flyer, 'air')).toBe(true)
		expect(isTargetable(flyer, 'both')).toBe(true)
	})

	it('refuses a hidden or untargetable enemy whatever the attack targets', () => {
		const world = makeWorld()
		const hidden = addEnemy(world, { tags: ground, hidden: true })
		const untargetable = addEnemy(world, { tags: ground, untargetable: true })

		for (const targets of ['ground', 'air', 'both'] as const) {
			expect(isTargetable(hidden, targets)).toBe(false)
			expect(isTargetable(untargetable, targets)).toBe(false)
		}
	})

	it('keeps them out of a tower s pick even standing on top of it', () => {
		const world = makeWorld()
		addEnemy(world, { distance: 10, hidden: true })
		addEnemy(world, { distance: 10, untargetable: true })
		const tower = addTower(world, saltShaker, { x: 10, y: 0 })

		expect(pickTarget(world, tower, shotOf(saltShaker))).toBeNull()
	})

	it('does not let a ground tower shoot a flyer that walked into range', () => {
		const world = makeWorld()
		addEnemy(world, { distance: 10, tags: ['air'] })
		const tower = addTower(world, saltShaker, { x: 10, y: 0 })

		expect(pickTarget(world, tower, shotOf(saltShaker))).toBeNull()
		expect(pickTarget(world, tower, { ...shotOf(saltShaker), targets: 'both' })?.tags).toEqual(['air'])
	})
})

/**
 * Step 11A. Both halves of the filter, with the two real defs that make the distinction matter --
 * the Salt Shaker, which cannot touch a Fly, and the Toaster, which can touch nothing else.
 *
 * The counts are of `towerFired`, not of damage: a tower that aims at something it cannot hurt and
 * spends its cooldown on it still fails these.
 */
describe('the air filter, both directions', () => {
	it('never fires a ground tower with only a flyer in range, over 600 ticks', () => {
		const world = makeWorld()
		addEnemy(world, { distance: 10, hp: 10_000, tags: [...fly.tags] })
		addTower(world, saltShaker, { x: 10, y: 1 })

		expect(ticksOfKind(run(world, 600), 'towerFired')).toEqual([])
	})

	it('never fires an air tower with only ground enemies in range, over 600 ticks', () => {
		const world = makeWorld()
		// Three Ants standing on the Toaster's own tile. Nothing else in the codebase covers this
		// direction: the Toaster is the first def in the game whose `targets` is `'air'`.
		for (const distance of [9, 10, 11]) {
			addEnemy(world, { distance, hp: 10_000, tags: [...ant.tags] })
		}
		addTower(world, toaster, { x: 10, y: 0 })

		expect(ticksOfKind(run(world, 600), 'towerFired')).toEqual([])
	})

	it('picks the one Fly out of a board of Ants, and never the Fly for a ground reach', () => {
		const world = makeWorld()
		for (const distance of [8, 9, 10, 11, 12]) {
			addEnemy(world, { distance, tags: [...ant.tags] })
		}
		const flyer = addEnemy(world, { distance: 10, tags: [...fly.tags] })
		const tower = addTower(world, toaster, { x: 10, y: 0 })

		expect(pickTarget(world, tower, shotOf(toaster))?.id).toBe(flyer.id)

		// The same board, the same tower, the ground half of the filter: five candidates and never the
		// sixth, whichever mode is asking.
		for (const mode of ['FIRST', 'LAST', 'STRONGEST', 'WEAKEST', 'CLOSEST', 'RANDOM'] as const) {
			tower.targetingMode = mode
			expect(pickTarget(world, tower, { ...shotOf(saltShaker), rangeTiles: 4 })?.id).not.toBe(flyer.id)
		}
	})

	it('answers the floor question with the same predicate a barricade asks', () => {
		const world = makeWorld()
		const walker = addEnemy(world, { tags: [...ant.tags] })
		const flyer = addEnemy(world, { tags: [...fly.tags] })

		expect(isFlyer(flyer)).toBe(true)
		expect(isFlyer(walker)).toBe(false)

		// And it is *not* `isTargetable`: a hidden flyer is off the floor whether or not it can be shot.
		const hiddenFlyer = addEnemy(world, { tags: [...fly.tags], hidden: true })
		expect(isFlyer(hiddenFlyer)).toBe(true)
		expect(isTargetable(hiddenFlyer, 'air')).toBe(false)
	})
})

describe('the six targeting modes', () => {
	/**
	 * Three Ants on the one lane, at 8, 10 and 12 tiles, against a tower on (10,1). Distances to the
	 * tower are sqrt(5), 1 and sqrt(5); remaining track is 31, 29 and 27.
	 */
	function threeEnemies(mode: TargetingMode): { world: World; tower: Tower; ids: number[] } {
		const world = makeWorld()
		const near = addEnemy(world, { distance: 8, hp: 9 })
		const middle = addEnemy(world, { distance: 10, hp: 3 })
		const far = addEnemy(world, { distance: 12, hp: 6 })
		const tower = addTower(world, saltShaker, { x: 10, y: 1 }, mode)

		return { world, tower, ids: [near.id, middle.id, far.id] }
	}

	function picked(mode: TargetingMode): number {
		const { world, tower, ids } = threeEnemies(mode)
		const target = pickTarget(world, tower, shotOf(saltShaker))
		expect(target).not.toBeNull()
		expect(ids).toContain(target?.id)
		return target?.id ?? -1
	}

	it('FIRST takes the one nearest the fridge and LAST the one furthest from it', () => {
		const { ids } = threeEnemies('FIRST')
		const [near, , far] = ids

		expect(picked('FIRST')).toBe(far)
		expect(picked('LAST')).toBe(near)
	})

	it('STRONGEST takes the most HP and WEAKEST the least', () => {
		const { ids } = threeEnemies('STRONGEST')
		const [near, middle] = ids

		expect(picked('STRONGEST')).toBe(near)
		expect(picked('WEAKEST')).toBe(middle)
	})

	it('CLOSEST takes the smallest euclidean distance to the tower', () => {
		const { ids } = threeEnemies('CLOSEST')
		const [, middle] = ids

		expect(picked('CLOSEST')).toBe(middle)
	})

	it('RANDOM picks the same enemy on a second run of the same seed', () => {
		expect(picked('RANDOM')).toBe(picked('RANDOM'))
	})

	it('RANDOM stays inside the range, and does not draw at all when nothing is in it', () => {
		const world = makeWorld()
		const tower = addTower(world, saltShaker, { x: 10, y: 1 }, 'RANDOM')
		const before = { ...world.rng }

		expect(pickTarget(world, tower, shotOf(saltShaker))).toBeNull()
		expect(world.rng).toEqual(before)
	})
})

describe('FIRST on a two-lane map', () => {
	/**
	 * A short lane and a long one, merging nowhere. The enemy on the short lane has walked *less*
	 * raw distance and is still nearly at the fridge; a `FIRST` that maximised raw `distance` would
	 * pick the other one.
	 */
	function twoLanes(mode: TargetingMode): { world: World; onShortLane: Enemy; onLongLane: Enemy; tower: Tower } {
		const world = makeWorld()
		world.map.paths.push({
			id: 'b',
			waypoints: [
				{ x: 0, y: 2 },
				{ x: 10, y: 2 },
			],
			lengthTiles: 10,
		})

		// Lane b is 10 long: 9 walked leaves 1 to go, at (9,2).
		const onShortLane = addEnemy(world, { pathId: 'b', distance: 9 })
		// Lane a is 39 long: 12 walked leaves 27 to go, at (12,0).
		const onLongLane = addEnemy(world, { pathId: PATH_ID, distance: 12 })
		const tower = addTower(world, saltShaker, { x: 10, y: 1 }, mode)

		return { world, onShortLane, onLongLane, tower }
	}

	it('picks the enemy nearer the fridge even though the other s raw distance is larger', () => {
		const { world, onShortLane, onLongLane, tower } = twoLanes('FIRST')

		expect(onLongLane.distance).toBeGreaterThan(onShortLane.distance)
		expect(pickTarget(world, tower, shotOf(saltShaker))?.id).toBe(onShortLane.id)
	})

	it('and LAST picks the other one', () => {
		const { world, onLongLane, tower } = twoLanes('LAST')

		expect(pickTarget(world, tower, shotOf(saltShaker))?.id).toBe(onLongLane.id)
	})
})

describe('the firing cooldown', () => {
	it('fires on ticks 0, 60, 120 ... with no drift over 600 ticks', () => {
		const world = makeWorld()
		// Enough HP to survive 600 ticks of a 5-damage shot every second.
		addEnemy(world, { distance: 10, hp: 10_000 })
		addTower(world, saltShaker, { x: 10, y: 1 })

		const fired = ticksOfKind(run(world, 600), 'towerFired')

		expect(fired[0]).toBe(0)
		expect(fired).toHaveLength(10)
		for (let index = 1; index < fired.length; index++) {
			expect((fired[index] ?? 0) - (fired[index - 1] ?? 0)).toBe(60)
		}
	})

	it('fires once when an enemy finally walks in, not a banked burst', () => {
		const world = makeWorld()
		addTower(world, saltShaker, { x: 10, y: 1 })

		expect(ticksOfKind(run(world, 300), 'towerFired')).toEqual([])

		addEnemy(world, { distance: 10, hp: 10_000 })
		expect(ticksOfKind(run(world, 1), 'towerFired')).toEqual([300])
		// The next 58 ticks are still inside the one-second cooldown.
		expect(ticksOfKind(run(world, 58), 'towerFired')).toEqual([])
	})

	it('carries the tower s noise on the event, for step 13', () => {
		const world = makeWorld()
		addEnemy(world, { distance: 10, hp: 10_000 })
		addTower(world, testSprayer, { x: 10, y: 1 })

		expect(eventsOfKind(run(world, 1), 'towerFired')[0]?.noise).toBe(3)
	})
})

describe('a shot landing', () => {
	it('takes an Ant for 1.5x from a chemical source, through the projectile and the tags', () => {
		const world = makeWorld()
		const target = addEnemy(world, { distance: 10, hp: 100 })
		addTower(world, testSprayer, { x: 10, y: 1 })

		// One tile of travel at 0.2 tiles per tick: fired on tick 0, landing on tick 5.
		const log = run(world, 3)
		expect(world.projectiles).toHaveLength(1)
		expect(ticksOfKind(log, 'enemyDamaged')).toEqual([])

		const landed = run(world, 3)
		// ground x1.0, swarm x1.5, bug x1.0 -- 10 base becomes 15.
		expect(eventsOfKind(landed, 'enemyDamaged')[0]?.amount).toBeCloseTo(15, 10)
		expect(target.hp).toBeCloseTo(85, 10)
		expect(world.projectiles).toEqual([])
		expect(world.index.projectiles).toEqual({})
	})

	it('resolves on the same tick with no projectile at all when projectileSpeed is 0', () => {
		const world = makeWorld()
		const target = addEnemy(world, { distance: 10, hp: 100 })
		addTower(world, testInstant, { x: 10, y: 1 })

		const log = run(world, 1)

		expect(world.projectiles).toEqual([])
		expect(eventsOfKind(log, 'enemyDamaged')[0]?.amount).toBeCloseTo(15, 10)
		expect(target.hp).toBeCloseTo(85, 10)
	})

	it('flies on and despawns when its target dies mid-flight', () => {
		const world = makeWorld()
		const target = addEnemy(world, { distance: 10, hp: 100 })
		addTower(world, testSprayer, { x: 10, y: 1 })

		run(world, 2)
		expect(world.projectiles).toHaveLength(1)

		// Killed by something else while the shot is still in the air.
		target.hp = 0
		run(world, 1)
		expect(world.enemies).toEqual([])

		run(world, 10)
		expect(world.projectiles).toEqual([])
		expect(world.index.projectiles).toEqual({})
	})

	it('keeps a world with live projectiles on it JSON-round-trippable', () => {
		const world = makeWorld()
		addEnemy(world, { distance: 10, hp: 10_000 })
		addTower(world, saltShaker, { x: 10, y: 1 })

		run(world, 3)

		expect(world.projectiles.length).toBeGreaterThan(0)
		expect(JSON.parse(JSON.stringify(world))).toEqual(world)
	})
})

describe('death', () => {
	it('emits one enemyKilled with the def and the position, and clears the index in the same tick', () => {
		const world = makeWorld()
		const doomed = addEnemy(world, { distance: 5, hp: 0 })

		const log = run(world, 1)

		expect(eventsOfKind(log, 'enemyKilled')).toEqual([
			{ kind: 'enemyKilled', enemyId: doomed.id, defId: 'ant', at: { x: 5, y: 0 } },
		])
		expect(world.enemies).toEqual([])
		expect(world.index.enemies).toEqual({})
	})

	it('kills rather than leaks an enemy that dies on the tick it reaches the fridge', () => {
		const world = makeWorld()
		const lane = world.map.paths[0]
		if (lane === undefined) {
			throw new Error('the fixture map has no paths')
		}
		// Standing on the fridge: one more tick without the death check and this is a leak.
		expect(totalLength(lane)).toBe(LANE_LENGTH)
		const doomed = addEnemy(world, { distance: LANE_LENGTH, hp: 0 })

		const log = run(world, 1)

		expect(ticksOfKind(log, 'enemyKilled')).toEqual([0])
		expect(ticksOfKind(log, 'enemyLeaked')).toEqual([])
		expect(world.night.food.some(item => item.lost)).toBe(false)
		expect(world.enemies).toEqual([])
		expect(eventsOfKind(log, 'enemyKilled')[0]?.enemyId).toBe(doomed.id)
	})
})

describe('four Salt Shakers on the Counter', () => {
	it('clears wave 1 of night 1 with no leak, headless', () => {
		const world = createWorld({ seed: 1234, mapId: 'counter', nightId: 'night01', difficulty: 'normal' })
		// Only wave 1 is under test: with one wave in the night, `resolveSystem` ends it as soon as
		// the board is clear rather than sending the next six.
		world.night.waveCount = 1

		for (const tile of [
			{ x: 3, y: 12 },
			{ x: 7, y: 8 },
			{ x: 13, y: 4 },
			{ x: 15, y: 3 },
		]) {
			expect(placeTower(world, saltShaker, tile)).not.toBeNull()
		}
		expect(world.towers).toHaveLength(4)

		const queue = createCommandQueue()
		const log: GameEvent[] = []
		for (let index = 0; index < 6000 && world.night.phase !== 'won' && world.night.phase !== 'lost'; index++) {
			tick(world, queue)
			log.push(...world.events)
		}

		expect(world.night.phase).toBe('won')
		expect(log.filter(event => event.kind === 'enemyLeaked')).toEqual([])
		expect(log.filter(event => event.kind === 'enemyKilled')).toHaveLength(5)
		expect(world.night.food.some(item => item.lost)).toBe(false)
	})
})
