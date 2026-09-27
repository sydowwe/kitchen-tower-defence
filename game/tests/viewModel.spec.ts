import { describe, expect, it } from 'vitest'
import { createCommandQueue } from '@/core/commands.ts'
import { ant, beetle, silverfish, weevil } from '@/core/content/enemies.ts'
import { getTowerDef } from '@/core/content/index.ts'
import { applyStatus, createStatus } from '@/core/content/statuses.ts'
import { tick } from '@/core/sim.ts'
import { burrowSystem } from '@/core/systems/burrow.ts'
import { dropCrumb } from '@/core/systems/crumbs.ts'
import { canPlaceTower, placeTower, refundFor } from '@/core/systems/placement.ts'
import { spawnEnemyAt } from '@/core/systems/spawn.ts'
import { createWorld } from '@/core/world.ts'
import { buildEnemyTooltip, buildHudSnapshot, buildTowerInspector } from '@/ui/viewModel.ts'
import { createTestWorld } from './fixtures/world.ts'
import type { CreateWorldOptions } from '@/core/world.ts'
import type { EnemyDamageView, EnemyTooltipView, UpgradeSlotView } from '@/ui/viewModel.ts'
import type { DamageType, FoodItem, Tower, Vec2, World } from '@/core/types.ts'

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
		// Since step 13A a wake damages every tower, so the HP row is on all of them -- but a trap is
		// still not a wall, and nothing walks into it.
		expect(stats?.hitPoints).toBe(getTowerDef('mousetrap').maxHp)
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

	it('gives a scrubber its cleaning radius, and a patch rate only where a pulse has a limit', () => {
		const world = buildableWorld()
		const shop = buildHudSnapshot(world, VIEW).shop
		const vinegar = shop.find(entry => entry.id === 'vinegarSpray')?.stats
		const soda = shop.find(entry => entry.id === 'bakingSoda')?.stats
		const salt = shop.find(entry => entry.id === 'saltShaker')?.stats

		// One patch a pulse, one pulse a second: "one patch a second", and the table's 4/s poison.
		expect(vinegar?.cleanseRadiusTiles).toBe(3)
		expect(vinegar?.cleansePerSecond).toBe(1)
		expect(vinegar?.applies).toEqual([{ kind: 'poison', perSecond: 4 }])
		// The whole circle each pulse has no count to print.
		expect(soda?.cleanseRadiusTiles).toBe(1.2)
		expect(soda?.cleansePerSecond).toBeNull()
		expect(soda?.ratePerSecond).toBe(0.6)
		// Null, never 0, for a tower with no `cleanse`.
		expect(salt?.cleanseRadiusTiles).toBeNull()
		expect(salt?.cleansePerSecond).toBeNull()
	})
})

describe('the upgrade slots', () => {
	function slotsFor(world: World, defId: string, at: Vec2 = LEGAL_TILE): UpgradeSlotView[] {
		const tower = placeTower(world, getTowerDef(defId), at)
		if (tower === null) {
			throw new Error(`the fixture refused a legal '${defId}'`)
		}
		const slots = buildTowerInspector(world, tower.id)?.upgrades
		if (slots === undefined) {
			throw new Error('a tower that was just placed has no inspector')
		}
		return slots
	}

	it('emits a row for the stat the tier moved and no row for any stat it did not', () => {
		const world = buildableWorld()
		const first = slotsFor(world, 'saltShaker')[0]

		// The Salt Shaker's first tier is +2 damage, so the diff is that row and the dps it carries
		// with it -- `dps` is `damage x rate` and a diff that showed the damage moving while the
		// damage-per-second sat still would be the panel contradicting the card above it.
		//
		// Everything else stays off the list. A diff that emitted every field is the failure worth
		// catching: it is not visibly wrong, it is eleven rows of unchanged numbers with the one that
		// moved buried among them.
		expect(first?.diff).toEqual([
			{
				labelKey: 'hud.stat.damage',
				from: { textKey: 'hud.stat.plain', params: { n: 5 } },
				to: { textKey: 'hud.stat.plain', params: { n: 7 } },
			},
			{
				labelKey: 'hud.stat.dps',
				from: { textKey: 'hud.stat.plain', params: { n: 5 } },
				to: { textKey: 'hud.stat.plain', params: { n: 7 } },
			},
		])
		expect(first?.diff.map(row => row.labelKey)).not.toContain('hud.stat.range')
		expect(first?.diff.map(row => row.labelKey)).not.toContain('hud.stat.rate')
		expect(first?.diff.map(row => row.labelKey)).not.toContain('hud.stat.noise')
	})

	it('moves the rate and the dps together when a tier moves the cooldown, and nothing else', () => {
		const world = buildableWorld()
		// 75 ticks -> 60 is 0.8/sec -> 1/sec, and 2 damage makes it 1.6 dps -> 2. The damage row does
		// not move, which is what tells the player what this tier is actually for.
		const first = slotsFor(world, 'iceCubeTray')[0]

		expect(first?.diff).toEqual([
			{
				labelKey: 'hud.stat.rate',
				from: { textKey: 'hud.stat.perSecond', params: { n: 0.8 } },
				to: { textKey: 'hud.stat.perSecond', params: { n: 1 } },
			},
			{
				labelKey: 'hud.stat.dps',
				from: { textKey: 'hud.stat.plain', params: { n: 1.6 } },
				to: { textKey: 'hud.stat.plain', params: { n: 2 } },
			},
		])
	})

	it('prices all three tiers and states them against the tier the tower is standing on', () => {
		const world = buildableWorld()
		const tower = placeTower(world, getTowerDef('saltShaker'), LEGAL_TILE)
		if (tower === null) {
			throw new Error('the fixture refused a legal placement')
		}
		tower.tier = 1
		// Exactly the second tier's price, so `>=` and not `>` is what decides the flag.
		world.crumbs = 60

		const slots = buildTowerInspector(world, tower.id)?.upgrades ?? []

		// 60% / 120% / 250% of the Salt Shaker's 50.
		expect(slots.map(slot => slot.cost)).toEqual([30, 60, 125])
		expect(slots.map(slot => slot.state)).toEqual(['owned', 'next', 'locked'])
		expect(slots.map(slot => slot.affordable)).toEqual([true, true, false])
		// Tier 3 is the only one with a sentence: the other two have their diff.
		expect(slots.map(slot => slot.descriptionKey)).toEqual([null, null, 'tower.saltShaker.tier3.description'])
	})

	it('draws both scrubbers tier 3 as a cleaning-radius row rather than a blank slot', () => {
		const vinegar = slotsFor(buildableWorld(), 'vinegarSpray')[2]
		const soda = slotsFor(buildableWorld(), 'bakingSoda')[2]

		expect(vinegar?.diff).toEqual([
			{
				labelKey: 'hud.stat.cleans',
				from: { textKey: 'hud.stat.tiles', params: { n: 3 } },
				to: { textKey: 'hud.stat.tiles', params: { n: 6 } },
			},
		])
		expect(soda?.diff).toEqual([
			{
				labelKey: 'hud.stat.cleans',
				from: { textKey: 'hud.stat.tiles', params: { n: 1.2 } },
				to: { textKey: 'hud.stat.tiles', params: { n: 2 } },
			},
		])
	})

	it("diffs the Bay Leaf's first tier as exactly one row, the radius it brings them up within", () => {
		const first = slotsFor(buildableWorld(), 'bayLeaf')[0]

		expect(first?.diff).toEqual([
			{
				labelKey: 'hud.stat.bringsUp',
				from: { textKey: 'hud.stat.tiles', params: { n: 3 } },
				to: { textKey: 'hud.stat.tiles', params: { n: 3.5 } },
			},
		])
	})

	it('reports the dps of a tier-3 tower off the folded def and not the base one', () => {
		const world = buildableWorld()
		const tower = placeTower(world, getTowerDef('saltShaker'), LEGAL_TILE)
		if (tower === null) {
			throw new Error('the fixture refused a legal placement')
		}

		// 5 damage at 1/sec at tier 0; 9 at the same rate once all three tiers are folded in. This is
		// the number step 12C's acceptance checks with a stopwatch against a single ant.
		expect(buildTowerInspector(world, tower.id)?.stats.dps).toBe(5)

		tower.tier = 3
		expect(buildTowerInspector(world, tower.id)?.stats.dps).toBe(9)
		expect(buildTowerInspector(world, tower.id)?.stats.damage).toBe(9)
	})
})

describe('the Bay Leaf card', () => {
	it('has a suppress radius of 3, and every other tower has none', () => {
		const shop = buildHudSnapshot(buildableWorld(), VIEW).shop

		for (const entry of shop) {
			expect(entry.stats.suppressRadiusTiles).toBe(entry.id === 'bayLeaf' ? 3 : null)
		}
		expect(shop.some(entry => entry.id === 'bayLeaf')).toBe(true)
	})
})

describe('the enemy tooltip', () => {
	function rowFor(tooltip: EnemyTooltipView | null, damageType: DamageType): EnemyDamageView | undefined {
		return tooltip?.damage.find(row => row.damageType === damageType)
	}

	it('shows a stripped Silverfish at x0.7 physical and x1.1 cold, live, in hud.damage order', () => {
		const world = createTestWorld()
		const fish = spawnEnemyAt(world, silverfish, 'a', 10, 0)

		const bare = buildEnemyTooltip(world, fish.id)
		expect(bare?.damage.map(row => row.damageType)).toEqual(['physical', 'fire', 'cold', 'chemical', 'electric'])
		expect(rowFor(bare, 'physical')).toEqual({ damageType: 'physical', multiplier: 0.4, band: 'weak' })
		expect(rowFor(bare, 'cold')).toEqual({ damageType: 'cold', multiplier: 1.2, band: 'strong' })

		applyStatus(fish, createStatus('armorStrip'))
		const stripped = buildEnemyTooltip(world, fish.id)

		expect(rowFor(stripped, 'physical')).toEqual({ damageType: 'physical', multiplier: 0.7, band: 'weak' })
		expect(rowFor(stripped, 'cold')).toEqual({ damageType: 'cold', multiplier: 1.1, band: 'strong' })
		expect(rowFor(stripped, 'fire')).toEqual({ damageType: 'fire', multiplier: 1, band: 'neutral' })
		expect(stripped?.tagKeys).toEqual(['hud.tag.ground', 'hud.tag.armored', 'hud.tag.bug'])
	})

	it('ceils both HP numbers on a difficulty-scaled enemy with fractional HP', () => {
		const world = createTestWorld()
		world.difficulty.enemyHpMult = 1.35
		// 55 x 1.35 = 74.25, and then chipped down to a sliver a floor would print as dead.
		const enemy = spawnEnemyAt(world, beetle, 'a', 10, 0)
		enemy.hp = 0.3

		const tooltip = buildEnemyTooltip(world, enemy.id)
		expect(enemy.maxHp).toBeCloseTo(74.25, 10)
		expect(tooltip?.hp).toBe(1)
		expect(tooltip?.maxHp).toBe(75)
	})

	it('still describes a burrowed Weevil, and says it is under', () => {
		const world = createTestWorld()
		// The fixture's night is over, and a terminal phase runs no burrowing.
		world.night.phase = 'wave'
		const enemy = spawnEnemyAt(world, weevil, 'a', 10, 0)
		enemy.burrowWindow = { fromTiles: 5, toTiles: 25 }
		burrowSystem(world)

		expect(enemy.flags.burrowed).toBe(true)
		expect(buildEnemyTooltip(world, enemy.id)?.burrowed).toBe(true)
	})

	it('is null for an id that is not on the board', () => {
		const world = createTestWorld()
		spawnEnemyAt(world, ant, 'a', 10, 0)

		expect(buildEnemyTooltip(world, 12_345)).toBeNull()
	})

	it('places itself in the board space the enemy is drawn in', () => {
		const world = createTestWorld()
		const enemy = spawnEnemyAt(world, ant, 'a', 7.5, 0)

		const tooltip = buildEnemyTooltip(world, enemy.id)
		expect(tooltip?.at).toEqual({ x: 7.5, y: 0 })
		expect(tooltip?.widthTiles).toBe(40)
		expect(tooltip?.heightTiles).toBe(1)
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
		// With an inspector in it, so the `upgrades` array is covered by the assertion that already
		// guards this rather than by a second one beside it.
		const tower = placeTower(world, getTowerDef('saltShaker'), LEGAL_TILE)
		// And a tooltip, so `tagKeys` and the damage rows are covered too.
		const fish = spawnEnemyAt(world, silverfish, 'a', 10, 0)

		const snapshot = buildHudSnapshot(
			world,
			VIEW,
			buildTowerInspector(world, tower?.id ?? -1),
			buildEnemyTooltip(world, fish.id),
		)
		expect(snapshot.enemyTooltip).not.toBeNull()
		const before = structuredClone(snapshot)

		// A tier folded after the snapshot was built. `effectiveDef` hands out a shared, memoised def,
		// and a slot holding one by reference would follow it.
		if (tower !== null) {
			tower.tier = 3
		}
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
			nextTileWriteTick: 0,
			burrowWindow: null,
			feeding: null,
			fedAt: [],
			stolenItems: [],
			flags: { hidden: false, untargetable: false, fleeing: false, revealed: false, burrowed: false },
		})
		dropCrumb(world, { x: 12, y: 0 }, 5)
		// A tooltip holding `enemy.tags` by reference would grow a tag here.
		fish.tags.push('boss')
		fish.hp -= 40
		fish.distance = 20
		fish.flags.burrowed = true
		applyStatus(fish, createStatus('armorStrip'))

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
