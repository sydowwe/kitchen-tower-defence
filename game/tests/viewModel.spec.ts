import { describe, expect, it } from 'vitest'
import { createCommandQueue } from '@/core/commands.ts'
import { getTowerDef } from '@/core/content/index.ts'
import { tick } from '@/core/sim.ts'
import { dropCrumb } from '@/core/systems/crumbs.ts'
import { canPlaceTower, placeTower, refundFor } from '@/core/systems/placement.ts'
import { createWorld } from '@/core/world.ts'
import { buildHudSnapshot, buildTowerInspector } from '@/ui/viewModel.ts'
import { createTestWorld } from './fixtures/world.ts'
import type { CreateWorldOptions } from '@/core/world.ts'
import type { FoodItem, Tower, World } from '@/core/types.ts'

/**
 * The half of step 8 that can be silently wrong: a bonus preview that disagrees with what the wallet
 * does, an affordability flag off by one crumb, a snapshot holding a live reference into the world.
 *
 * Nothing here asserts that the snapshot has a `crumbs` field -- that is what `type-check` is for.
 */

const VIEW = { speed: 1, paused: false } as const

const OPTIONS: CreateWorldOptions = { seed: 1234, mapId: 'counter', nightId: 'night01', difficulty: 'normal' }

/** The fixture world's tile 0 is buildable and off the track; everything else on it is track. */
const LEGAL_TILE = { x: 0, y: 0 }

function buildableWorld(): World {
	const world = createTestWorld()
	world.night.phase = 'countdown'
	return world
}

function foodItem(id: number, defId: string, lost: boolean): FoodItem {
	return { id, defId, nameKey: `food.${defId}.name`, heldBy: null, lost }
}

describe('the early-call bonus preview', () => {
	it('promises exactly what calling the wave pays, for a countdown that is not whole seconds', () => {
		const world = createWorld(OPTIONS)
		world.night.phase = 'countdown'
		// 1.51 seconds. The preview and the payer both floor it to one second, or the button says +4.
		world.night.countdownTicks = 91

		const preview = buildHudSnapshot(world, VIEW).earlyCallBonus
		expect(preview).toBe(2)

		const before = world.crumbs
		const queue = createCommandQueue()
		queue.enqueue({ kind: 'CallWaveEarly' })
		tick(world, queue)

		expect(world.crumbs - before).toBe(preview)
	})

	it('previews nothing and pays nothing outside the countdown', () => {
		const world = createWorld(OPTIONS)
		world.night.phase = 'wave'
		world.night.countdownTicks = 300

		expect(buildHudSnapshot(world, VIEW).earlyCallBonus).toBe(0)

		const before = world.crumbs
		const queue = createCommandQueue()
		queue.enqueue({ kind: 'CallWaveEarly' })
		tick(world, queue)

		expect(world.crumbs).toBe(before)
	})
})

describe('shop affordability', () => {
	function entryFor(world: World, id: string): { cost: number; affordable: boolean } {
		const entry = buildHudSnapshot(world, VIEW).shop.find(candidate => candidate.id === id)
		if (entry === undefined) {
			throw new Error(`no shop entry for '${id}'`)
		}
		return entry
	}

	it('flips at exactly the cost, and agrees with canPlaceTower on both sides of it', () => {
		const world = buildableWorld()
		const def = getTowerDef('saltShaker')

		world.crumbs = def.cost
		expect(entryFor(world, 'saltShaker').affordable).toBe(true)
		expect(canPlaceTower(world, def, LEGAL_TILE)).toEqual({ ok: true })

		world.crumbs = def.cost - 1
		expect(entryFor(world, 'saltShaker').affordable).toBe(false)
		expect(canPlaceTower(world, def, LEGAL_TILE)).toEqual({ ok: false, reason: 'tooExpensive' })
	})
})

describe('the inspector', () => {
	function placedTower(world: World): Tower {
		const tower = placeTower(world, getTowerDef('saltShaker'), LEGAL_TILE)
		if (tower === null) {
			throw new Error('the fixture refused a legal placement')
		}
		return tower
	}

	it('previews the refund the sale actually pays, at both rates', () => {
		const world = buildableWorld()
		const tower = placedTower(world)
		// 70% of 101 is 70.7 and 50% is 50.5 -- neither divides evenly, so a preview that rounded the
		// other way from `refundFor` would show up here.
		tower.totalInvested = 101

		const duringCountdown = buildTowerInspector(world, tower.id)
		expect(duringCountdown?.refund).toBe(70)
		expect(duringCountdown?.refund).toBe(refundFor(world, tower))
		expect(duringCountdown?.refundIsPenalised).toBe(false)

		world.night.phase = 'wave'

		const duringWave = buildTowerInspector(world, tower.id)
		expect(duringWave?.refund).toBe(50)
		expect(duringWave?.refund).toBe(refundFor(world, tower))
		expect(duringWave?.refundIsPenalised).toBe(true)
	})

	it('is null for a tower that has been sold, rather than an error', () => {
		const world = buildableWorld()
		const tower = placedTower(world)

		world.towers = []
		world.index.towers = {}

		expect(buildTowerInspector(world, tower.id)).toBeNull()
	})

	it('gives an economy tower income and collect numbers, and no damage numbers at all', () => {
		const world = buildableWorld()
		const tower = placeTower(world, getTowerDef('toasterCrumbTray'), LEGAL_TILE)
		const stats = buildTowerInspector(world, tower?.id ?? -1)?.stats

		// 4 crumbs every 60 ticks is 4/sec; a null damage is "no attack" and 0 would be "zero damage".
		expect(stats?.crumbsPerSecond).toBe(4)
		expect(stats?.collectRadiusTiles).toBe(2.5)
		expect(stats?.damage).toBeNull()
		expect(stats?.dps).toBeNull()
		expect(stats?.damageType).toBeNull()
	})

	it('derives the attack card from the def, rounded to two decimals', () => {
		const world = buildableWorld()
		const stats = buildHudSnapshot(world, VIEW).shop.find(entry => entry.id === 'saltShaker')?.stats

		// 5 damage at 60 ticks a shot: 1/sec, 5 dps, range 3.
		expect(stats?.damage).toBe(5)
		expect(stats?.ratePerSecond).toBe(1)
		expect(stats?.dps).toBe(5)
		expect(stats?.rangeTiles).toBe(3)
		expect(stats?.crumbsPerSecond).toBeNull()
		// A circle, and a tower that lands nothing: both are what the cone tower below is not.
		expect(stats?.coneHalfAngleDeg).toBeNull()
		expect(stats?.applies).toEqual([])
	})

	it('gives a cone tower the same card plus its opening and its resolved poison rate', () => {
		const world = buildableWorld()
		const stats = buildHudSnapshot(world, VIEW).shop.find(entry => entry.id === 'sprayBottle')?.stats

		// 3 damage at 50 ticks a shot: 1.2/sec, 3.6 dps, range 3, a 30-degree half-opening.
		expect(stats?.damage).toBe(3)
		expect(stats?.ratePerSecond).toBe(1.2)
		expect(stats?.dps).toBe(3.6)
		expect(stats?.rangeTiles).toBe(3)
		expect(stats?.coneHalfAngleDeg).toBe(30)
		// The def's per-application override of 2/60 a tick, not the status table's 4/sec default.
		expect(stats?.applies).toEqual([{ kind: 'poison', perSecond: 2 }])
	})

	it('gives a charge tower its magazine and its rearm in seconds', () => {
		const world = buildableWorld()
		const stats = buildHudSnapshot(world, VIEW).shop.find(entry => entry.id === 'mousetrap')?.stats

		// One charge, and 396 ticks is 6.6 seconds -- not 396, and not 6.6000000000000005.
		expect(stats?.charges).toBe(1)
		expect(stats?.rearmSeconds).toBe(6.6)
		expect(stats?.damage).toBe(60)
		// A trap is not a wall: nothing in v1 can damage it, so it carries no HP row.
		expect(stats?.hitPoints).toBeNull()
		expect(stats?.blocksPath).toBe(false)
	})

	it('gives a tape a magazine and no rearm at all, because it does not rearm', () => {
		const world = buildableWorld()
		const stats = buildHudSnapshot(world, VIEW).shop.find(entry => entry.id === 'stickyTape')?.stats

		expect(stats?.charges).toBe(3)
		expect(stats?.rearmSeconds).toBeNull()
	})

	it('gives a barricade its hit points and nothing that implies an attack', () => {
		const world = buildableWorld()
		const stats = buildHudSnapshot(world, VIEW).shop.find(entry => entry.id === 'cardboardBox')?.stats

		// The doc's 200 HP, off `maxHp`, and the four rows a wall must not claim.
		expect(stats?.hitPoints).toBe(200)
		expect(stats?.blocksPath).toBe(true)
		expect(stats?.damage).toBeNull()
		expect(stats?.rangeTiles).toBeNull()
		expect(stats?.charges).toBeNull()
		expect(stats?.crumbsPerSecond).toBeNull()
	})

	it('gives a lamp its radius and no targets, because it does not shoot', () => {
		const world = buildableWorld()
		const stats = buildHudSnapshot(world, VIEW).shop.find(entry => entry.id === 'nightlight')?.stats

		// The def's `reveal({ radiusTiles: 4 })`, which is the only row this tower has.
		expect(stats?.revealRadiusTiles).toBe(4)
		// CONTENT.md section 1's "both" is what a lamp *covers*, and `targets` is derived from a firing
		// behaviour. A "Targets: ground and air" row on a tower that fires nothing is a lie (11C,
		// decision 9).
		expect(stats?.targets).toBeNull()
		expect(stats?.damage).toBeNull()
		expect(stats?.rangeTiles).toBeNull()
	})

	it('gives every tower that is not a lamp a null reveal radius', () => {
		const world = buildableWorld()
		const stats = buildHudSnapshot(world, VIEW).shop.find(entry => entry.id === 'toaster')?.stats

		expect(stats?.revealRadiusTiles).toBeNull()
		// The row the Toaster exists for, and the one 11C moved to the top of the card.
		expect(stats?.targets).toBe('air')
	})

	it('carries a slow as a named status with no rate, because a magnitude is not damage', () => {
		const world = buildableWorld()
		const stats = buildHudSnapshot(world, VIEW).shop.find(entry => entry.id === 'iceCubeTray')?.stats

		expect(stats?.applies).toEqual([{ kind: 'slow', perSecond: null }])
	})
})

describe('the clock', () => {
	function clockAt(waveIndex: number, waveCount: number): { hour: number; minute: number } {
		const world = createTestWorld()
		world.night.waveIndex = waveIndex
		world.night.waveCount = waveCount
		return buildHudSnapshot(world, VIEW).clock
	}

	it('opens at 2:00 on the first wave and reads 6:00 on the last', () => {
		expect(clockAt(0, 6)).toEqual({ hour: 2, minute: 0 })
		expect(clockAt(5, 6)).toEqual({ hour: 6, minute: 0 })
	})

	it('does not divide by zero on a one-wave night', () => {
		expect(clockAt(0, 1)).toEqual({ hour: 2, minute: 0 })
	})
})

describe('the fridge', () => {
	it('counts what is left, names what went, and keeps the shelf length after everything is lost', () => {
		const world = createTestWorld()
		world.night.food = [
			foodItem(1, 'pizzaSlice', true),
			foodItem(2, 'cheese', false),
			foodItem(3, 'apple', true),
			foodItem(4, 'milk', false),
		]

		const food = buildHudSnapshot(world, VIEW).food
		expect(food.remaining).toBe(2)
		expect(food.total).toBe(4)
		expect(food.lostNameKeys).toEqual(['food.pizzaSlice.name', 'food.apple.name'])
		// The highest lost index, not the last element: theft takes from the front and never splices.
		expect(food.lastLostNameKey).toBe('food.apple.name')

		for (const item of world.night.food) {
			item.lost = true
		}

		const emptied = buildHudSnapshot(world, VIEW).food
		expect(emptied.remaining).toBe(0)
		expect(emptied.total).toBe(4)
		expect(emptied.lastLostNameKey).toBe('food.milk.name')
	})
})

describe('crumbs on the board', () => {
	it('reports piles and value separately, because neither substitutes for the other', () => {
		const world = createTestWorld()
		dropCrumb(world, { x: 5, y: 0 }, 3)
		dropCrumb(world, { x: 20, y: 0 }, 40)
		const rotting = dropCrumb(world, { x: 30, y: 0 }, 1)
		rotting.ageTicks = 1200

		expect(buildHudSnapshot(world, VIEW).crumbsOnBoard).toEqual({ piles: 3, value: 44, rotting: 1 })
	})
})

describe('the summary', () => {
	it('counts the wave that emptied the fridge as survived on a win and not on a loss', () => {
		const world = createTestWorld()
		world.night.waveIndex = 4
		world.night.waveCount = 6

		world.night.phase = 'won'
		expect(buildHudSnapshot(world, VIEW).summary?.wavesSurvived).toBe(5)

		world.night.phase = 'lost'
		expect(buildHudSnapshot(world, VIEW).summary?.wavesSurvived).toBe(4)
	})

	it('is null while the night is still being played', () => {
		const world = buildableWorld()
		expect(buildHudSnapshot(world, VIEW).summary).toBeNull()
	})
})

describe('detachment from the world', () => {
	it('does not change when the world does', () => {
		const world = buildableWorld()
		world.night.food = [foodItem(1, 'cheese', false), foodItem(2, 'apple', false)]
		dropCrumb(world, { x: 5, y: 0 }, 7)

		const snapshot = buildHudSnapshot(world, VIEW)
		const before = structuredClone(snapshot)

		world.crumbs -= 50
		world.night.food[0]!.lost = true
		world.enemies.push({
			id: 99,
			defId: 'ant',
			pathId: 'a',
			distance: 0,
			lateralOffsetTiles: 0,
			hp: 10,
			maxHp: 10,
			statuses: [],
			tags: ['ground'],
			speed: 0,
			spawnedInWaveIndex: 0,
			stolenItems: [],
			flags: { hidden: false, untargetable: false, fleeing: false, revealed: false },
		})
		dropCrumb(world, { x: 12, y: 0 }, 5)

		expect(snapshot).toEqual(before)
	})

	it('survives a JSON round-trip unchanged, so nothing exotic is hiding in it', () => {
		const world = buildableWorld()
		const tower = placeTower(world, getTowerDef('saltShaker'), LEGAL_TILE)
		const snapshot = buildHudSnapshot(world, VIEW, buildTowerInspector(world, tower?.id ?? -1))

		// A Map, a class instance or an accessor would not come back deep-equal.
		expect(JSON.parse(JSON.stringify(snapshot))).toStrictEqual(snapshot)
	})
})
