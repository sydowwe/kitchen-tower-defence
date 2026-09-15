import { describe, expect, it } from 'vitest'
import { attack } from '@/core/content/behaviours.ts'
import { effectiveDef, effectiveDefOf, getTowerDef } from '@/core/content/index.ts'
import { validateContent } from '@/core/content/schema.ts'
import { applyStatuses } from '@/core/content/statuses.ts'
import { applicationsForShot } from '@/core/systems/combat.ts'
import { chargeStateOf } from '@/core/systems/charges.ts'
import { cardboardBox, saltShaker, TOWERS } from '@/core/content/towers.ts'
import { foldUpgrades, MAX_TIER, tier, upgradeCost } from '@/core/content/upgrades.ts'
import { createCommandQueue } from '@/core/commands.ts'
import { tick } from '@/core/sim.ts'
import { commandsSystem, upgradeCostFor } from '@/core/systems/commands.ts'
import { damageTower, placeTower, refundFor, sellTower } from '@/core/systems/placement.ts'
import { TileFlags } from '@/core/map.ts'
import type { AttackBehaviour, ChargeBehaviour } from '@/core/content/behaviours.ts'
import type { StatusHolder } from '@/core/content/statuses.ts'
import type { TowerDef } from '@/core/content/schema.ts'
import type { TowerUpgrade } from '@/core/content/upgrades.ts'
import type { Enemy, EnemyTag, EntityId, GameEvent, Tower, Vec2, World } from '@/core/types.ts'
import { createTestWorld } from './fixtures/world.ts'

/**
 * The fold, the prices, and the three live counters `UpgradeTower` has to reconcile.
 *
 * This is the part of step 12 that can silently be wrong: every assertion here is about a number
 * that no screen shows until 12C, so nothing else would notice it drifting. The numbers are spelled
 * out rather than recomputed from the def -- a test that recomputes the implementation agrees with
 * whatever the implementation does.
 */

const PATH_ID = 'a'

/** The fixture's tile 0 is buildable and off-track, which is the one square a tower may stand on. */
const BUILDABLE: Vec2 = { x: 0, y: 0 }

function makeWorld(): World {
	const world = createTestWorld()
	// A wave that is permanently mid-spawn, so `resolveSystem` does not declare the night won the
	// moment the board empties, and a build window is `'countdown'`.
	world.night.phase = 'countdown'
	return world
}

function fightingWorld(): World {
	const world = createTestWorld()
	world.night.phase = 'wave'
	world.night.wave = {
		index: 0,
		startedAtTick: 0,
		spawns: [{ enemyDefId: 'ant', remaining: 1, nextSpawnTick: 1_000_000, spacingTicks: 60, pathId: PATH_ID }],
	}
	return world
}

/** Neither tag has a matrix row, so every damage number below is the base one and nothing else. */
const PLAIN: EnemyTag[] = ['ground', 'bug']

/**
 * An enemy standing still at an exact point, on a one-tile lane of its own. The fixture's lane is a
 * single row, and the splash assertion needs two enemies half a tile apart.
 *
 * `tags` is overridable because two of the tier-3 assertions below are about the matrix: fire is
 * x1.2 against `air` and physical is x0.4 against `armored`, and `PLAIN` has no row at all.
 */
function addEnemyAt(world: World, at: Vec2, tags: EnemyTag[] = PLAIN): Enemy {
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
		hp: 10_000,
		maxHp: 10_000,
		statuses: [],
		tags: [...tags],
		speed: 0,
		spawnedInWaveIndex: 0,
		stolenItems: [],
		flags: { hidden: false, untargetable: false, fleeing: false, revealed: false },
	}

	world.index.enemies[enemy.id] = world.enemies.length
	world.enemies.push(enemy)
	return enemy
}

/**
 * An enemy standing still on the fixture's own lane `a`, where a tile's arc distance is its `x`.
 * The reflect assertion needs an enemy that is *chewing*, which means being on the same lane as the
 * box and inside `HOLD_GAP_TILES` of it -- a lane of its own would never meet one.
 */
function addLaneEnemy(world: World, distance: number, tags: EnemyTag[] = PLAIN): Enemy {
	const enemy: Enemy = {
		id: world.nextEntityId++,
		defId: 'ant',
		pathId: PATH_ID,
		distance,
		lateralOffsetTiles: 0,
		hp: 10_000,
		maxHp: 10_000,
		statuses: [],
		tags: [...tags],
		speed: 0,
		spawnedInWaveIndex: 0,
		stolenItems: [],
		flags: { hidden: false, untargetable: false, fleeing: false, revealed: false },
	}

	world.index.enemies[enemy.id] = world.enemies.length
	world.enemies.push(enemy)
	return enemy
}

/**
 * A tower pushed straight onto the board at a given tier, so a spec can hold the tier-3 numbers
 * without buying them. `state` is seeded from the **effective** def, exactly as `placeTower` seeds it
 * from the base one.
 */
function addTower(world: World, defId: string, tile: Vec2, towerTier = 0): Tower {
	const def = effectiveDef(defId, towerTier)
	const charge = def.behaviours.find((behaviour): behaviour is ChargeBehaviour => behaviour.kind === 'charge')

	const tower: Tower = {
		id: world.nextEntityId++,
		defId: def.id,
		tile: { x: tile.x, y: tile.y },
		hp: def.maxHp,
		maxHp: def.maxHp,
		tier: towerTier,
		targetingMode: def.defaultTargetingMode,
		targetEnemyId: null,
		cooldownTicks: 0,
		shotsFired: 0,
		state: charge === undefined ? null : { kind: 'charge', charges: charge.charges, rearmTicksRemaining: 0 },
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

function upgrade(world: World, tower: Tower): void {
	commandsSystem(world, [{ kind: 'UpgradeTower', towerId: tower.id }])
}

function attackOf(def: TowerDef): AttackBehaviour {
	const found = def.behaviours.find((behaviour): behaviour is AttackBehaviour => behaviour.kind === 'attack')
	expect(found).toBeDefined()
	return found as AttackBehaviour
}

function chargeOf(def: TowerDef): ChargeBehaviour {
	const found = def.behaviours.find((behaviour): behaviour is ChargeBehaviour => behaviour.kind === 'charge')
	expect(found).toBeDefined()
	return found as ChargeBehaviour
}

// --- the fold ---------------------------------------------------------------------------------

/** A synthetic def with a base every assertion below can be checked against by eye. */
function testDef(upgrades: TowerUpgrade[]): TowerDef {
	return {
		id: 'testFolded',
		nameKey: 'tower.testFolded.name',
		descriptionKey: 'tower.testFolded.description',
		glyph: '🧪',
		role: 'BASIC_DPS',
		cost: 100,
		maxHp: 100,
		placement: 'off_path',
		noise: 0,
		defaultTargetingMode: 'FIRST',
		behaviours: [
			attack({ damage: 5, damageType: 'physical', cooldownTicks: 60, rangeTiles: 3, targets: 'ground' }),
		],
		upgrades,
	}
}

const doubleDamage = tier({
	nameKey: 'tower.testFolded.tier1.name',
	multiply: [{ kind: 'attack', fields: { damage: 2 } }],
})

const plusThreeDamage = tier({
	nameKey: 'tower.testFolded.tier2.name',
	multiply: [],
	add: [{ kind: 'attack', fields: { damage: 3 } }],
})

const doubleRangeAndSplash = tier({
	nameKey: 'tower.testFolded.tier3.name',
	descriptionKey: 'tower.testFolded.tier3.description',
	multiply: [{ kind: 'attack', fields: { rangeTiles: 2 } }],
	add: [{ kind: 'attack', fields: { splashRadiusTiles: 0.8 } }],
})

describe('foldUpgrades', () => {
	it('folds 1 -> 2 -> 3 in order, and the order is the answer', () => {
		const def = testDef([doubleDamage, plusThreeDamage, doubleRangeAndSplash])
		const folded = attackOf(foldUpgrades(def, MAX_TIER))

		// 5 x 2 = 10, + 3 = 13. Range 3 x 2 = 6, and the splash the third tier adds.
		expect(folded.damage).toBe(13)
		expect(folded.rangeTiles).toBe(6)
		expect(folded.splashRadiusTiles).toBe(0.8)

		// The same two tiers the other way round: (5 + 3) x 2 = 16. Asserted against the documented
		// order rather than against whatever the implementation happens to do.
		const swapped = testDef([plusThreeDamage, doubleDamage, doubleRangeAndSplash])
		expect(attackOf(foldUpgrades(swapped, MAX_TIER)).damage).toBe(16)
	})

	it('runs multiply before add within one tier', () => {
		const both = tier({
			nameKey: 'tower.testFolded.tier1.name',
			multiply: [{ kind: 'attack', fields: { damage: 2 } }],
			add: [{ kind: 'attack', fields: { damage: 3 } }],
		})

		// 5 x 2 + 3, and not (5 + 3) x 2 = 16. The multiplier describes the tower as it stands and
		// the flat add is a bonus on top of it.
		expect(attackOf(foldUpgrades(testDef([both]), 1)).damage).toBe(13)
	})

	it('rounds a tick field to an integer, and cleans the float dust off everything else', () => {
		const faster = tier({
			nameKey: 'tower.testFolded.tier1.name',
			multiply: [{ kind: 'attack', fields: { cooldownTicks: 1 / 1.4 } }],
		})

		// 60 / 1.4 is 42.857..., and `cooldownTicks` is `z.number().int()` in the schema.
		expect(attackOf(foldUpgrades(testDef([faster]), 1)).cooldownTicks).toBe(43)

		const bumped = tier({
			nameKey: 'tower.testFolded.tier1.name',
			multiply: [{ kind: 'attack', fields: { damage: 1.4 } }],
		})
		const twice = foldUpgrades(testDef([bumped, bumped, doubleRangeAndSplash]), 2)

		// 5 x 1.4 x 1.4 is 9.799999999999999 in float, and `ui/viewModel.ts` puts `damage` on the
		// inspector raw.
		expect(attackOf(twice).damage).toBe(9.8)
	})

	it('returns the base def itself at tier 0, and never touches it at any tier', () => {
		const def = testDef([doubleDamage, plusThreeDamage, doubleRangeAndSplash])

		expect(foldUpgrades(def, 0)).toBe(def)

		foldUpgrades(def, MAX_TIER)
		expect(attackOf(def).damage).toBe(5)
		expect(attackOf(def).rangeTiles).toBe(3)
		expect(attackOf(def).splashRadiusTiles).toBe(0)
	})

	it('throws with the def id and the kind when a delta names a behaviour the tower has not got', () => {
		const wrong = tier({
			nameKey: 'tower.testFolded.tier1.name',
			multiply: [{ kind: 'income', fields: { crumbsPerPayout: 2 } }],
		})

		expect(() => foldUpgrades(testDef([wrong]), 1)).toThrow(/testFolded/)
		expect(() => foldUpgrades(testDef([wrong]), 1)).toThrow(/income/)
	})

	it('throws when a delta names a field that is not a number on that behaviour', () => {
		const wrong = tier({
			nameKey: 'tower.testFolded.tier1.name',
			multiply: [{ kind: 'attack', fields: { damgae: 2 } }],
		})

		expect(() => foldUpgrades(testDef([wrong]), 1)).toThrow(/attack.damgae/)
	})
})

describe('upgradeCost', () => {
	it('is 60% / 120% / 250% of the base cost, rounded', () => {
		expect(upgradeCost(saltShaker, 1)).toBe(30)
		expect(upgradeCost(saltShaker, 2)).toBe(60)
		expect(upgradeCost(saltShaker, 3)).toBe(125)

		// The Cardboard Box's 25 is the one base cost that does not divide cleanly by the rates.
		expect(upgradeCost(cardboardBox, 1)).toBe(15)
		expect(upgradeCost(cardboardBox, 2)).toBe(30)
		expect(upgradeCost(cardboardBox, 3)).toBe(63)
	})

	it('is 1-based, where Tower.tier is 0-based', () => {
		const world = makeWorld()
		const tower = addTower(world, 'saltShaker', BUILDABLE)

		// A freshly placed tower is tier 0, and the next one it can buy is tier 1 at 30.
		expect(tower.tier).toBe(0)
		expect(upgradeCostFor(world, tower)).toBe(30)

		tower.tier = MAX_TIER
		expect(upgradeCostFor(world, tower)).toBe(0)
	})
})

describe('effectiveDef', () => {
	it('hands back the same object on a second call, so the memo is live', () => {
		expect(effectiveDef('saltShaker', 2)).toBe(effectiveDef('saltShaker', 2))
		// A different tier is a different key, which is what makes "invalidated on upgrade" true by
		// construction rather than by a call someone forgets.
		expect(effectiveDef('saltShaker', 2)).not.toBe(effectiveDef('saltShaker', 1))
	})

	it('leaves the base def alone when a tower on the board is upgraded to the top', () => {
		const world = makeWorld()
		const tower = addTower(world, 'saltShaker', BUILDABLE)
		world.crumbs = 1000

		upgrade(world, tower)
		upgrade(world, tower)
		upgrade(world, tower)
		expect(tower.tier).toBe(3)
		expect(attackOf(effectiveDefOf(tower)).splashRadiusTiles).toBe(0.8)

		expect(attackOf(getTowerDef('saltShaker')).damage).toBe(5)
		expect(attackOf(getTowerDef('saltShaker')).splashRadiusTiles).toBe(0)

		// And a tower *placed* afterwards is tier 0, which is what tier 0 means.
		world.map.flags[4] = TileFlags.BUILDABLE
		const fresh = placeTower(world, getTowerDef('saltShaker'), { x: 4, y: 0 })
		expect(fresh).not.toBeNull()
		if (fresh === null) {
			return
		}
		expect(fresh.tier).toBe(0)
		expect(attackOf(effectiveDefOf(fresh)).damage).toBe(5)
		expect(attackOf(effectiveDefOf(fresh)).splashRadiusTiles).toBe(0)
	})
})

describe('UpgradeTower', () => {
	it('pays, bumps the tier, and adds the price to totalInvested', () => {
		const world = makeWorld()
		const tower = placeTower(world, getTowerDef('saltShaker'), BUILDABLE)
		expect(tower).not.toBeNull()
		if (tower === null) {
			return
		}

		// 200 starting crumbs, minus the 50 base.
		expect(world.crumbs).toBe(150)

		upgrade(world, tower)
		upgrade(world, tower)

		expect(tower.tier).toBe(2)
		// 50 + 30 + 60, and the wallet is 200 minus the same three.
		expect(tower.totalInvested).toBe(140)
		expect(world.crumbs).toBe(60)

		// 70% outside a wave, 50% once one is in progress -- and a percentage of what went in.
		expect(refundFor(world, tower)).toBe(98)
		world.night.phase = 'wave'
		expect(refundFor(world, tower)).toBe(70)
	})

	it('changes nothing and spends nothing at the top tier', () => {
		const world = makeWorld()
		const tower = addTower(world, 'saltShaker', BUILDABLE, MAX_TIER)
		world.crumbs = 1000
		const invested = tower.totalInvested

		upgrade(world, tower)

		expect(tower.tier).toBe(MAX_TIER)
		expect(tower.totalInvested).toBe(invested)
		expect(world.crumbs).toBe(1000)
	})

	it('changes nothing and spends nothing when the wallet is one crumb short', () => {
		const world = makeWorld()
		const tower = addTower(world, 'saltShaker', BUILDABLE)
		world.crumbs = 29

		upgrade(world, tower)

		expect(tower.tier).toBe(0)
		expect(world.crumbs).toBe(29)

		world.crumbs = 30
		upgrade(world, tower)
		expect(tower.tier).toBe(1)
		expect(world.crumbs).toBe(0)
	})

	it('changes nothing and spends nothing against a tower that has been sold', () => {
		const world = makeWorld()
		const tower = placeTower(world, getTowerDef('saltShaker'), BUILDABLE)
		expect(tower).not.toBeNull()
		if (tower === null) {
			return
		}

		sellTower(world, tower.id)
		const after = world.crumbs

		upgrade(world, tower)

		expect(world.towers).toEqual([])
		expect(world.crumbs).toBe(after)
	})

	it('changes nothing once the night is over', () => {
		for (const phase of ['won', 'lost'] as const) {
			const world = makeWorld()
			const tower = addTower(world, 'saltShaker', BUILDABLE)
			world.night.phase = phase

			upgrade(world, tower)

			expect(tower.tier).toBe(0)
			expect(world.crumbs).toBe(200)
		}
	})

	it('raises a damaged Cardboard Box by the delta and not to full', () => {
		const world = makeWorld()
		const tower = addTower(world, 'cardboardBox', BUILDABLE)
		world.crumbs = 1000

		damageTower(world, tower, 50)
		expect(tower.hp).toBe(150)

		upgrade(world, tower)

		// 200 x 1.4 = 280, so the box gains 80 of maxHp and 80 of hp. The 50 it had been chewed for
		// is still missing: upgrading mid-chew is not a free repair.
		expect(tower.maxHp).toBe(280)
		expect(tower.hp).toBe(230)
		expect(tower.maxHp - tower.hp).toBe(50)
	})

	it('clamps a rearming Mousetrap to the new numbers instead of letting the old one run out', () => {
		const world = makeWorld()
		const tower = addTower(world, 'mousetrap', BUILDABLE, 2)
		world.crumbs = 1000

		// Mid-rearm on the old 396.
		const state = tower.state
		expect(state).not.toBeNull()
		if (state === null) {
			return
		}
		state.charges = 0
		state.rearmTicksRemaining = 390
		tower.cooldownTicks = 390

		upgrade(world, tower)

		// T3 halves both numbers, so neither counter may still be holding 390.
		expect(chargeOf(effectiveDefOf(tower)).rearmTicks).toBe(198)
		expect(state.rearmTicksRemaining).toBe(198)
		expect(tower.cooldownTicks).toBe(198)
	})
})

describe('the tier-3s that are pure deltas', () => {
	it('fires a Mousetrap twice as often at tier 3', () => {
		function shotTicks(towerTier: number): number[] {
			const world = fightingWorld()
			addEnemyAt(world, { x: 0, y: 0 })
			addTower(world, 'mousetrap', { x: 0, y: 0 }, towerTier)

			return run(world, 800)
				.filter(entry => entry.event.kind === 'towerFired')
				.map(entry => entry.tick)
		}

		// One number, 396 ticks, does both jobs on the base def: halving only the rearm would leave
		// the cooldown gating every shot and this list unchanged.
		expect(shotTicks(0)).toEqual([0, 396, 792])
		expect(shotTicks(MAX_TIER)).toEqual([0, 198, 396, 594, 792])
	})

	it('splashes a Salt Shaker at tier 3, and hits the primary exactly once', () => {
		const world = fightingWorld()
		const primary = addEnemyAt(world, { x: 0, y: 0 })
		const neighbour = addEnemyAt(world, { x: 0.5, y: 0 })
		// One tile below the primary and 1.12 from the neighbour, so `CLOSEST` picks the primary.
		const tower = addTower(world, 'saltShaker', { x: 0, y: 1 }, MAX_TIER)
		tower.targetingMode = 'CLOSEST'

		// 0.1 tiles a tick over one tile, so the shot lands on tick 10 and the next is not until 60.
		const hits = run(world, 30)
			.map(entry => entry.event)
			.filter(event => event.kind === 'enemyDamaged')

		expect(hits.filter(event => event.enemyId === primary.id)).toHaveLength(1)
		// 0.5 tiles away, inside the 0.8 the tier adds. `dealSplashDamage` includes the primary in
		// its circle, which is what stops it being hit twice.
		expect(hits.filter(event => event.enemyId === neighbour.id)).toHaveLength(1)
	})

	it('delivers a Toaster Crumb Tray s piles with no trip at tier 3', () => {
		expect(effectiveDef('toasterCrumbTray', 0).behaviours).toContainEqual(
			expect.objectContaining({ kind: 'collect', travelTicks: 90 }),
		)
		expect(effectiveDef('toasterCrumbTray', MAX_TIER).behaviours).toContainEqual(
			expect.objectContaining({ kind: 'collect', travelTicks: 0 }),
		)
	})

	it('stops a Cookie Jar owing the enemy side at tier 3', () => {
		expect(effectiveDef('cookieJar', 0).behaviours).toContainEqual(
			expect.objectContaining({ kind: 'income', enemyCrumbsOnDestroy: 200 }),
		)
		expect(effectiveDef('cookieJar', MAX_TIER).behaviours).toContainEqual(
			expect.objectContaining({ kind: 'income', enemyCrumbsOnDestroy: 0 }),
		)
	})
})

describe('the six tier-3s that needed a field', () => {
	it('burns a Nightlight s aura for exactly its per-second rate over a second', () => {
		const world = fightingWorld()
		const enemy = addEnemyAt(world, { x: 0, y: 0 })
		addTower(world, 'nightlight', { x: 0, y: 1 }, MAX_TIER)

		run(world, 60)

		// 6/sec, pulsed 10 times a second at 6 ticks' worth each. Dealing the per-*tick* number once
		// every sixth tick instead would be 1 damage here -- a silent 6x nerf nothing else reports.
		expect(10_000 - enemy.hp).toBeCloseTo(6, 6)
	})

	it('routes that aura through the tag matrix', () => {
		const world = fightingWorld()
		const moth = addEnemyAt(world, { x: 0, y: 0 }, ['air', 'bug'])
		addTower(world, 'nightlight', { x: 0, y: 1 }, MAX_TIER)

		run(world, 60)

		// `fire` and not `physical`, which is x0.5 against `air` where fire is x1.2: 6 x 1.2 = 7.2.
		// A lamp whose whole job is moths should not carry the worst damage type against them.
		expect(10_000 - moth.hp).toBeCloseTo(7.2, 6)
	})

	it('lands the Ice Cube Tray s freeze on the 4th hit and the 8th, for the authored 90 ticks', () => {
		const world = fightingWorld()
		const enemy = addEnemyAt(world, { x: 0, y: 0 })
		addTower(world, 'iceCubeTray', { x: 0, y: 1 }, MAX_TIER)

		const queue = createCommandQueue()
		const frozenOnHit: number[] = []
		const freezeTicksOnLanding: number[] = []
		let hits = 0
		let wasFrozen = false

		for (let index = 0; index < 300; index++) {
			tick(world, queue)
			hits += world.events.filter(event => event.kind === 'enemyDamaged' && event.enemyId === enemy.id).length

			const freeze = enemy.statuses.find(status => status.kind === 'freeze')
			if (freeze !== undefined && !wasFrozen) {
				frozenOnHit.push(hits)
				freezeTicksOnLanding.push(freeze.remainingTicks)
			}
			wasFrozen = freeze !== undefined
		}

		// Not the 1st and the 5th, which is what incrementing `shotsFired` *after* the filter gives.
		expect(frozenOnHit).toEqual([4, 8])
		// The doc's 1.5 seconds, not `STATUS_DEFS.freeze.durationTicks` -- 4 seconds on every fourth
		// shot of a tower firing every 39 ticks is a permanent freeze.
		expect(freezeTicksOnLanding).toEqual([90, 90])
	})

	it('turns the slow away on the hit the freeze lands, with no branch anywhere', () => {
		const applies = attackOf(effectiveDef('iceCubeTray', MAX_TIER)).applies

		// Freeze **first** is the whole mechanism: `STATUS_DEFS.slow.suppressedBy` is `['freeze']`, so
		// `applyStatus` refuses the slow by itself. Reversed, the slow lands and the freeze overwrites
		// it -- same damage, different story in the code.
		expect(applies.map(application => application.kind)).toEqual(['freeze', 'slow'])

		const onTheFourth: StatusHolder = { statuses: [] }
		applyStatuses(onTheFourth, applicationsForShot(applies, 4), 1, 'cold')
		expect(onTheFourth.statuses.map(status => status.kind)).toEqual(['freeze'])

		const onTheThird: StatusHolder = { statuses: [] }
		applyStatuses(onTheThird, applicationsForShot(applies, 3), 1, 'cold')
		expect(onTheThird.statuses.map(status => status.kind)).toEqual(['slow'])
	})

	it('puts two poison stacks on per Spray Bottle hit, and still caps at five', () => {
		const world = fightingWorld()
		const enemy = addEnemyAt(world, { x: 0, y: 0 })
		addTower(world, 'sprayBottle', { x: 0, y: 1 }, MAX_TIER)

		function poisonStacks(): number {
			return enemy.statuses.find(status => status.kind === 'poison')?.stacks ?? 0
		}

		// A cone lands the tick it fires, and 1.2/sec is 50 ticks between shots.
		run(world, 1)
		expect(poisonStacks()).toBe(2)
		run(world, 50)
		expect(poisonStacks()).toBe(4)
		// Poison's cap is 5, so two a hit reaches it on the third spray rather than the fifth -- which
		// is what "the DoT goes on twice as fast" means without touching the cooldown.
		run(world, 50)
		expect(poisonStacks()).toBe(5)
	})

	it('roots three enemies with one Sticky Tape, and leaves on the tick the last one ends', () => {
		const world = fightingWorld()
		const enemies = [0, 0.5, 1, 1.5].map(x => addEnemyAt(world, { x, y: 0 }))
		const tape = addTower(world, 'stickyTape', { x: 0, y: 1 }, MAX_TIER)

		function rooted(): Enemy[] {
			return enemies.filter(enemy => enemy.statuses.some(status => status.kind === 'rooted'))
		}

		// 0.5/sec is 120 ticks a strip, so three are laid by tick 240 and the fourth never is: the
		// tape is holding `maxOutstanding` of them and stops firing with two charges still in hand.
		run(world, 400)
		expect(rooted()).toHaveLength(3)
		expect(chargeStateOf(tape)?.charges).toBe(2)
		expect(world.towers).toContain(tape)

		// Spent, with all three still stuck. `retireSpentTowers` asks `> 0` and not `maxOutstanding`
		// for exactly this: the tape may not leave the board while it is still holding anything.
		const state = chargeStateOf(tape)
		expect(state).not.toBeNull()
		if (state === null) {
			return
		}
		state.charges = 0

		run(world, 1)
		expect(world.towers).toContain(tape)

		for (const enemy of rooted().slice(0, 2)) {
			enemy.statuses.length = 0
		}
		run(world, 1)
		expect(world.towers).toContain(tape)

		rooted()[0]?.statuses.splice(0)
		run(world, 1)
		expect(world.towers).not.toContain(tape)
	})

	it('reflects 8 a second off a tier-3 Cardboard Box, through the matrix and with no damage number', () => {
		function chewFor(seconds: number, tags?: EnemyTag[]): { lost: number; numbers: number } {
			const world = fightingWorld()
			// Inside `HOLD_GAP_TILES` of the box on tile 10, so it is chewing from the first tick.
			const enemy = addLaneEnemy(world, 9.9, tags)
			addTower(world, 'cardboardBox', { x: 10, y: 0 }, MAX_TIER)

			const numbers = run(world, 60 * seconds).filter(
				entry => entry.event.kind === 'enemyDamaged' && entry.event.enemyId === enemy.id,
			).length

			return { lost: 10_000 - enemy.hp, numbers }
		}

		const plain = chewFor(1)
		expect(plain.lost).toBeCloseTo(8, 3)
		// **No `enemyDamaged`.** 0.133 a tick rounds to a floating `0`, and sixty a second per chewing
		// enemy would blow `render/layers/effects.ts`'s 32-number cap and take the real hits with it.
		expect(plain.numbers).toBe(0)

		// x0.4 for physical against `armored`: the reflect is damage like any other and the matrix is
		// what makes a Roach a worse thing to leave chewing than an Ant.
		expect(chewFor(1, ['ground', 'armored']).lost).toBeCloseTo(3.2, 3)
	})

	it('fires a tier-3 Toaster at two flyers, and twice at one when that is all there is', () => {
		function shotsAt(count: number): (EntityId | null)[] {
			const world = fightingWorld()
			for (let index = 0; index < count; index++) {
				addEnemyAt(world, { x: index, y: 0 }, ['air', 'bug'])
			}
			addTower(world, 'toaster', { x: 0, y: 1 }, MAX_TIER)

			run(world, 1)
			return world.projectiles.map(projectile => projectile.targetEnemyId)
		}

		// Two projectiles means two *targets*: 35 fire is 42 against `air` and a Fly has 14 HP, so a
		// second grain at the same one is an upgrade the player cannot tell is working.
		const two = shotsAt(2)
		expect(two).toHaveLength(2)
		expect(new Set(two).size).toBe(2)

		// And with one in range the last target repeats, so the upgrade never fires *less*.
		const one = shotsAt(1)
		expect(one).toHaveLength(2)
		expect(new Set(one).size).toBe(1)
	})
})

describe('the roster', () => {
	it('gives every tower exactly three tiers', () => {
		for (const def of TOWERS) {
			expect(def.upgrades).toHaveLength(MAX_TIER)
		}
	})

	it('names the tower and the count when one has the wrong number of tiers', () => {
		const broken = { ...saltShaker, upgrades: saltShaker.upgrades.slice(0, 2) }

		expect(() => validateContent({ towers: [broken] })).toThrow(/saltShaker/)
		expect(() => validateContent({ towers: [broken] })).toThrow(/expected exactly 3 tiers, got 2/)
	})

	it('derives every tier key from the tower s own id', () => {
		for (const def of TOWERS) {
			def.upgrades.forEach((upgrade, index) => {
				expect(upgrade.nameKey).toBe(`tower.${def.id}.tier${index + 1}.name`)
				// Tiers 1 and 2 have no description: the before -> after diff is the description.
				expect(upgrade.descriptionKey).toBe(
					index === MAX_TIER - 1 ? `tower.${def.id}.tier${index + 1}.description` : null,
				)
			})
		}
	})

	it('keeps every tick field an integer at every tier', () => {
		for (const def of TOWERS) {
			for (let towerTier = 0; towerTier <= MAX_TIER; towerTier++) {
				for (const behaviour of effectiveDef(def.id, towerTier).behaviours) {
					for (const [name, value] of Object.entries(behaviour)) {
						if (name.endsWith('Ticks')) {
							expect(Number.isInteger(value)).toBe(true)
						}
					}
				}
				// `maxHp` is `z.number().int()` too, and it is the one def-level field a tier folds.
				expect(Number.isInteger(effectiveDef(def.id, towerTier).maxHp)).toBe(true)
			}
		}
	})

	it('bumps the defining stat of the four towers whose tier 3 is authored here', () => {
		// The documented placeholder curve: +40% a tier, re-tuned in 12C against the inspector.
		expect(attackOf(effectiveDef('saltShaker', 1)).damage).toBe(7)
		expect(attackOf(effectiveDef('saltShaker', 2)).damage).toBe(9.8)
		expect(attackOf(effectiveDef('mousetrap', 2)).damage).toBe(117.6)
		expect(effectiveDef('cardboardBox', 2).maxHp).toBe(392)
		expect(chargeOf(effectiveDef('stickyTape', 2)).charges).toBe(5)
	})
})
