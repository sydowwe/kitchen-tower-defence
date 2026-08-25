import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { attack, charge } from '@/core/content/behaviours.ts'
import { ant } from '@/core/content/enemies.ts'
import { STATUS_DEFS } from '@/core/content/statuses.ts'
import { iceCubeTray, stickyTape, TOWERS } from '@/core/content/towers.ts'
import { createCommandQueue } from '@/core/commands.ts'
import { tick } from '@/core/sim.ts'
import type { TowerDef } from '@/core/content/schema.ts'
import type { Enemy, EnemyTag, GameEvent, Tower, Vec2, World } from '@/core/types.ts'
import { createTestWorld } from './fixtures/world.ts'

/**
 * The **wiring**: an `applies` list travelling from a def to a live status, damage over time going
 * through the matrix rather than around it, and the tape spending its charges.
 *
 * `tests/statuses.spec.ts` owns the pure functions -- refresh versus stack, the caps, the
 * suppression -- and nothing here restates any of them. What is asserted below is only what breaks
 * when a system forgets to call them.
 *
 * The fixture's map is one row 40 tiles wide with path `a` from (0,0) to (39,0), so an enemy's
 * position is `(distance, 0)`.
 */

const PATH_ID = 'a'

function makeWorld(): World {
	const world = createTestWorld()
	// A wave permanently mid-spawn: the fixture's `nightId` is synthetic, and this keeps
	// `resolveSystem` from declaring the night won the moment the board empties.
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
	tags?: EnemyTag[]
}

function addEnemy(world: World, overrides: EnemyOverrides = {}): Enemy {
	const hp = overrides.hp ?? 10_000
	const enemy: Enemy = {
		id: world.nextEntityId++,
		defId: 'ant',
		pathId: PATH_ID,
		distance: overrides.distance ?? 0,
		hp,
		maxHp: hp,
		statuses: [],
		tags: overrides.tags ?? [...ant.tags],
		speed: overrides.speed ?? 0,
		spawnedInWaveIndex: 0,
		stolenItems: [],
		flags: { hidden: false, untargetable: false, fleeing: false },
	}

	world.index.enemies[enemy.id] = world.enemies.length
	world.enemies.push(enemy)
	return enemy
}

/** Towers go on directly rather than through `placeTower`: the fixture has one off-track tile. */
function addTower(world: World, def: TowerDef, tile: Vec2): Tower {
	const charges = def.behaviours.find(behaviour => behaviour.kind === 'charge')
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
		state: charges === undefined ? null : { kind: 'charge', charges: charges.charges, rearmTicksRemaining: 0 },
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

/**
 * A `fungal` enemy, which no v1 roster entry is until Mold on night 11. It is here because its row
 * in the matrix is loud in both directions -- fire 1.5x, chemical 2.5x -- so a DoT that skipped
 * `resolveDamage`, or hard-coded one damage type, produces a visibly different number.
 */
const FUNGAL: EnemyTag[] = ['ground', 'fungal']

function towerApplying(id: string, applies: Parameters<typeof attack>[0]['applies'], damageType: 'fire' | 'chemical') {
	return {
		id,
		nameKey: `tower.${id}.name`,
		descriptionKey: `tower.${id}.description`,
		glyph: '🧪',
		role: 'DOT',
		cost: 50,
		maxHp: 100,
		placement: 'off_path',
		noise: 0,
		defaultTargetingMode: 'FIRST',
		behaviours: [attack({ damage: 0, damageType, cooldownTicks: 60, rangeTiles: 3, targets: 'ground', applies })],
	} satisfies TowerDef
}

/** Every synthetic def this file registers. `getTowerDef` reads `TOWERS`, so they have to be in it. */
const testBurner = towerApplying('testBurner', ['burn'], 'fire')
const testPoisoner = towerApplying('testPoisoner', ['poison'], 'chemical')
const testWeakPoisoner = towerApplying('testWeakPoisoner', [{ kind: 'poison', magnitude: 2 / 60 }], 'chemical')

/** The object form of a bare kind, to prove the normaliser produces one descriptor from two inputs. */
const testSlowerObject: TowerDef = {
	...towerApplying('testSlowerObject', [{ kind: 'slow' }], 'fire'),
	behaviours: [
		attack({
			damage: 0,
			damageType: 'cold',
			cooldownTicks: 60,
			rangeTiles: 3,
			targets: 'ground',
			applies: [{ kind: 'slow' }],
		}),
	],
}

/** A plain hitscan tower with no `applies` at all, for the pooling assertion. */
const testPlain: TowerDef = {
	...towerApplying('testPlain', [], 'fire'),
	behaviours: [attack({ damage: 1, damageType: 'physical', cooldownTicks: 60, rangeTiles: 3, targets: 'ground' })],
}

/** The same slow, but carried by a projectile, so "lands on arrival" has something to measure. */
const testSlowShot: TowerDef = {
	...towerApplying('testSlowShot', [], 'fire'),
	behaviours: [
		attack({
			damage: 1,
			damageType: 'cold',
			cooldownTicks: 60,
			rangeTiles: 3,
			targets: 'ground',
			projectileSpeed: 0.2,
			applies: ['slow'],
		}),
	],
}

const REGISTERED: TowerDef[] = [testBurner, testPoisoner, testWeakPoisoner, testSlowerObject, testPlain, testSlowShot]

beforeAll(() => {
	;(TOWERS as TowerDef[]).push(...REGISTERED)
})

afterAll(() => {
	;(TOWERS as TowerDef[]).splice(TOWERS.length - REGISTERED.length, REGISTERED.length)
})

describe('an attack that applies a status', () => {
	it('leaves exactly one slow at the def s duration, and the enemy walks at 0.6x next tick', () => {
		const world = makeWorld()
		// Standing still while the shot is in the air, so the ice cube is fired at the tile the
		// tower is on and arrives the same tick. It is given its speed once the slow has landed.
		const enemy = addEnemy(world, { distance: 10 })
		addTower(world, iceCubeTray, { x: 10, y: 0 })

		run(world, 1)

		expect(enemy.statuses.map(status => status.kind)).toEqual(['slow'])
		// The full duration: `tickStatuses` ran before the shot landed, not after it.
		expect(enemy.statuses[0]?.remainingTicks).toBe(STATUS_DEFS.slow.durationTicks)
		expect(enemy.statuses[0]?.magnitude).toBe(0.4)

		enemy.speed = 0.5
		const before = enemy.distance
		run(world, 1)
		expect(enemy.distance - before).toBeCloseTo(0.5 * 0.6, 10)
	})

	it('normalises a bare kind and an object into the same descriptor', () => {
		const bare = iceCubeTray.behaviours.find(behaviour => behaviour.kind === 'attack')
		const object = testSlowerObject.behaviours.find(behaviour => behaviour.kind === 'attack')

		expect(bare?.applies).toEqual(object?.applies)
		expect(object?.applies).toEqual([{ kind: 'slow', magnitude: null }])

		const world = makeWorld()
		const enemy = addEnemy(world, { distance: 10 })
		addTower(world, testSlowerObject, { x: 10, y: 0 })
		run(world, 1)

		expect(enemy.statuses[0]?.magnitude).toBe(STATUS_DEFS.slow.magnitude)
	})
})

describe('damage over time', () => {
	it('burns a fungal enemy for 5/60 x 1.5 a tick, from a fire source', () => {
		const world = makeWorld()
		const enemy = addEnemy(world, { distance: 10, tags: FUNGAL })
		addTower(world, testBurner, { x: 10, y: 0 })

		// Tick 0 lights it (statusSystem has already run by then); tick 1 is the first burning tick.
		run(world, 2)

		expect(enemy.maxHp - enemy.hp).toBeCloseTo((5 / 60) * 1.5, 10)
	})

	it('poisons the same enemy for 4/60 x 2.5, so the type is not hard-coded to fire', () => {
		const world = makeWorld()
		const enemy = addEnemy(world, { distance: 10, tags: FUNGAL })
		addTower(world, testPoisoner, { x: 10, y: 0 })

		run(world, 2)

		expect(enemy.maxHp - enemy.hp).toBeCloseTo((4 / 60) * 2.5, 10)
	})

	it('stacks poison to exactly 5 off a firing tower, and a sixth shot only refreshes', () => {
		const world = makeWorld()
		const enemy = addEnemy(world, { distance: 10, tags: FUNGAL })
		addTower(world, testPoisoner, { x: 10, y: 0 })

		// One shot a second. Six shots is ticks 0, 60, 120, 180, 240 and 300.
		run(world, 301)

		const poison = enemy.statuses.find(status => status.kind === 'poison')
		expect(poison?.stacks).toBe(5)
		expect(poison?.remainingTicks).toBe(STATUS_DEFS.poison.durationTicks)
		expect(enemy.statuses).toHaveLength(1)
	})

	it('scales five stacks by the stack count and not by the magnitude alone', () => {
		const world = makeWorld()
		const enemy = addEnemy(world, { distance: 10, tags: FUNGAL })
		addTower(world, testPoisoner, { x: 10, y: 0 })

		run(world, 241)
		const atFiveStacks = enemy.hp
		run(world, 1)

		expect(atFiveStacks - enemy.hp).toBeCloseTo((4 / 60) * 5 * 2.5, 10)
	})

	it('halves the per-tick damage for a tower that overrides the magnitude, and nothing else', () => {
		const world = makeWorld()
		const overridden = addEnemy(world, { distance: 10, tags: FUNGAL })
		addTower(world, testWeakPoisoner, { x: 10, y: 0 })

		const plain = makeWorld()
		const default_ = addEnemy(plain, { distance: 10, tags: FUNGAL })
		addTower(plain, testPoisoner, { x: 10, y: 0 })

		run(world, 2)
		run(plain, 2)

		expect(overridden.maxHp - overridden.hp).toBeCloseTo((2 / 60) * 2.5, 10)
		expect((overridden.maxHp - overridden.hp) * 2).toBeCloseTo(default_.maxHp - default_.hp, 10)

		// Duration and the cap are the def's, and an override does not touch either.
		const status = overridden.statuses.find(entry => entry.kind === 'poison')
		expect(status?.remainingTicks).toBe(STATUS_DEFS.poison.durationTicks - 1)
		expect(status?.magnitude).toBeCloseTo(2 / 60, 10)

		run(world, 300)
		expect(overridden.statuses.find(entry => entry.kind === 'poison')?.stacks).toBe(5)
	})

	it('publishes no enemyDamaged for a burning tick, and none for a damage: 0 hit', () => {
		const world = makeWorld()
		addEnemy(world, { distance: 10, tags: FUNGAL })
		addTower(world, testBurner, { x: 10, y: 0 })

		// Tick 0 fires (0 damage, no event) and ticks 1..29 burn. Not one of them may print a number:
		// `render/layers/effects.ts` keys its glyph cache on the rounded amount, and sixty `0`s a
		// second would blow its 32-number cap and take the real hit numbers with it.
		const log = run(world, 30)

		expect(log.filter(event => event.kind === 'enemyDamaged')).toEqual([])
	})
})

describe('rooted', () => {
	it('leaves an enemy s distance untouched over 120 ticks of movement', () => {
		const world = makeWorld()
		const enemy = addEnemy(world, { distance: 10, speed: 0.5 })
		addTower(world, stickyTape, { x: 10, y: 0 })

		run(world, 1)
		expect(enemy.statuses.map(status => status.kind)).toEqual(['rooted'])

		const before = enemy.distance
		run(world, 120)
		expect(enemy.distance).toBe(before)
	})
})

describe('a status carried by a projectile', () => {
	it('is absent the tick the tower fires and present the tick it arrives', () => {
		const world = makeWorld()
		const enemy = addEnemy(world, { distance: 11 })
		addTower(world, testSlowShot, { x: 10, y: 0 })

		// One tile at 0.2 tiles per tick: fired on tick 0, landing on tick 5.
		run(world, 3)
		expect(world.projectiles).toHaveLength(1)
		expect(enemy.statuses).toEqual([])

		run(world, 3)
		expect(world.projectiles).toEqual([])
		expect(enemy.statuses.map(status => status.kind)).toEqual(['slow'])
	})

	it('does not hand the next shot out of the pool the previous one s applies', () => {
		const world = makeWorld()
		const slowed = addEnemy(world, { distance: 11 })
		addTower(world, testSlowShot, { x: 10, y: 0 })

		run(world, 6)
		expect(slowed.statuses.map(status => status.kind)).toEqual(['slow'])
		expect(world.projectiles).toEqual([])

		// The projectile is back in the pool. A plain tower's shot must not inherit its `applies`.
		const clean = makeWorld()
		const target = addEnemy(clean, { distance: 10 })
		addTower(clean, testPlain, { x: 10, y: 0 })

		run(clean, 2)
		expect(target.statuses).toEqual([])
	})
})

describe('Sticky Tape s three charges', () => {
	it('roots one enemy at a time, spends a charge per root, and is gone after the third', () => {
		const world = makeWorld()
		const tape = addTower(world, stickyTape, { x: 10, y: 0 })
		const other = addTower(world, iceCubeTray, { x: 39, y: 0 })

		for (let round = 0; round < 3; round++) {
			const victim = addEnemy(world, { distance: 10, hp: 10 })
			run(world, 1)

			expect(victim.statuses.map(status => status.kind)).toEqual(['rooted'])
			expect(tape.state).toEqual({ kind: 'charge', charges: 2 - round, rearmTicksRemaining: 0 })

			// A second enemy walks in while the first is still stuck: the tape holds.
			const bystander = addEnemy(world, { distance: 10, hp: 10 })
			run(world, 1)
			expect(bystander.statuses).toEqual([])

			// Both die. The release is noticed on the tick after `resolveSystem` removes them.
			victim.hp = 0
			bystander.hp = 0
			run(world, 2)

			// 0.5/sec is a 120-tick gap, and the board is empty, so nothing is fired at meanwhile.
			run(world, 120)
		}

		expect(world.towers.map(tower => tower.id)).toEqual([other.id])
		expect(world.index.towers).toEqual({ [other.id]: 0 })
	})

	it('does not spend a charge while it is standing there with nothing in range', () => {
		const world = makeWorld()
		const tape = addTower(world, stickyTape, { x: 10, y: 0 })

		run(world, 300)

		expect(tape.state).toEqual({ kind: 'charge', charges: 3, rearmTicksRemaining: 0 })
		expect(world.towers).toHaveLength(1)
	})
})

describe('the architecture checkpoint', () => {
	it('adds a fourth status-applying tower as a def and nothing else', () => {
		// `testFreezer` is registered here and nowhere near `core/systems/`. If landing a status ever
		// needs a system change, this is where it shows up.
		const testFreezer: TowerDef = {
			...towerApplying('testFreezer', ['freeze'], 'fire'),
			behaviours: [
				attack({
					damage: 0,
					damageType: 'cold',
					cooldownTicks: 60,
					rangeTiles: 3,
					targets: 'ground',
					applies: ['freeze'],
				}),
				charge({ charges: 1, rearmTicks: 0 }),
			],
		}
		;(TOWERS as TowerDef[]).push(testFreezer)

		try {
			const world = makeWorld()
			const enemy = addEnemy(world, { distance: 10, speed: 0.5 })
			addTower(world, testFreezer, { x: 10, y: 0 })

			run(world, 1)
			expect(enemy.statuses.map(status => status.kind)).toEqual(['freeze'])

			const before = enemy.distance
			run(world, 30)
			expect(enemy.distance).toBe(before)
		} finally {
			;(TOWERS as TowerDef[]).pop()
		}
	})
})
