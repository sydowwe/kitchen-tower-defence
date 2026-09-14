import { describe, expect, it } from 'vitest'
import { attack } from '@/core/content/behaviours.ts'
import { effectiveDef, effectiveDefOf, getTowerDef } from '@/core/content/index.ts'
import { validateContent } from '@/core/content/schema.ts'
import { cardboardBox, saltShaker, TOWERS } from '@/core/content/towers.ts'
import { foldUpgrades, MAX_TIER, tier, upgradeCost } from '@/core/content/upgrades.ts'
import { createCommandQueue } from '@/core/commands.ts'
import { tick } from '@/core/sim.ts'
import { commandsSystem, upgradeCostFor } from '@/core/systems/commands.ts'
import { damageTower, placeTower, refundFor, sellTower } from '@/core/systems/placement.ts'
import { TileFlags } from '@/core/map.ts'
import type { AttackBehaviour, ChargeBehaviour } from '@/core/content/behaviours.ts'
import type { TowerDef } from '@/core/content/schema.ts'
import type { TowerUpgrade } from '@/core/content/upgrades.ts'
import type { Enemy, EnemyTag, GameEvent, Tower, Vec2, World } from '@/core/types.ts'
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
 */
function addEnemyAt(world: World, at: Vec2): Enemy {
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
		tags: [...PLAIN],
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
