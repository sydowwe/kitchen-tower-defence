import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isCollect } from '@/core/content/behaviours.ts'
import { DIFFICULTIES } from '@/core/content/difficulty.ts'
import { ant, beetle, mold } from '@/core/content/enemies.ts'
import {
	INSTALLATIONS,
	LOADOUT_BASE_SLOTS,
	LOADOUT_MAX_SLOTS,
	NO_MODIFIERS,
	resolveModifiers,
} from '@/core/content/installations.ts'
import { NIGHTS } from '@/core/content/nights.ts'
import { toasterCrumbTray } from '@/core/content/towers.ts'
import { createCommandQueue } from '@/core/commands.ts'
import { tick } from '@/core/sim.ts'
import { collectTravelTicksFor, crumbById, crumbsSystem, dropCrumb } from '@/core/systems/crumbs.ts'
import { isOnShelf, takeFood } from '@/core/systems/fridge.ts'
import { spawnDestroyPenalty, spawnEnemyAt, startWave } from '@/core/systems/spawn.ts'
import { spreadSystem } from '@/core/systems/spread.ts'
import { createWorld } from '@/core/world.ts'
import type { NightDef, WaveEntry } from '@/core/content/schema.ts'
import type { CreateWorldOptions } from '@/core/world.ts'
import type { DefId, DifficultyId, Tower, Vec2, World } from '@/core/types.ts'

/**
 * Step 20A: every installation reaches the system it changes.
 *
 * **Every world here is built through `resolveModifiers([id])` into `createWorld`**, never by writing
 * `world.modifiers` by hand -- the point is that the id reaches the system, and a hand-written
 * modifier would test the system and skip the fold. The noise pair is in `noise.spec.ts` and the
 * Tupperware in `theft.spec.ts`, beside what they change.
 */

const OPTIONS: CreateWorldOptions = { seed: 1234, mapId: 'counter', nightId: 'night01', difficulty: 'normal' }

function worldWith(ids: DefId[], difficulty: DifficultyId = 'normal', nightId = 'night01'): World {
	return createWorld({ ...OPTIONS, difficulty, nightId, modifiers: resolveModifiers(ids) })
}

function entry(enemyDefId: DefId, count: number, extra: Partial<WaveEntry> = {}): WaveEntry {
	return { enemyDefId, count, spacingTicks: 10, startDelayTicks: 0, pathId: 'crack', ...extra }
}

/** How many enemies of each kind the running wave's cursors will spawn. */
function spawnCounts(world: World): Record<string, number> {
	const counts: Record<string, number> = {}
	for (const spawn of world.night.wave?.spawns ?? []) {
		counts[spawn.enemyDefId] = (counts[spawn.enemyDefId] ?? 0) + spawn.remaining
	}
	return counts
}

describe('the fold', () => {
	it('is the fourteen of analytic-docs/CONTENT.md section 8 at its prices, in its order', () => {
		expect(INSTALLATIONS.map(def => def.id)).toEqual([
			'oilTheHinges',
			'closeTheKitchenDoor',
			'buyABroom',
			'sealTheBaseboardCrack',
			'nightShiftDustpan',
			'fixTheWindowScreen',
			'pantryShelfLiner',
			'betterTupperware',
			'biggerFridge',
			'emergencySnackStash',
			'whiteNoiseMachine',
			'clearTheDryingRack',
			'takeTheToasterOffTheCounter',
			'secondShelf',
		])
		expect(INSTALLATIONS.map(def => def.cost)).toEqual([
			90, 100, 110, 120, 140, 150, 160, 180, 200, 220, 260, 170, 240, 320,
		])
	})

	it('is NO_MODIFIERS for nothing owned, and throws with the id for an unknown one', () => {
		expect(resolveModifiers([])).toEqual(NO_MODIFIERS)
		expect(createWorld(OPTIONS).modifiers).toEqual(NO_MODIFIERS)
		expect(() => resolveModifiers(['buyABroom', 'buyAMop'])).toThrow(/buyAMop/)
	})

	it('adds both cap installations together to +55', () => {
		expect(resolveModifiers(['closeTheKitchenDoor', 'whiteNoiseMachine']).noiseCapDelta).toBe(55)
	})

	it('converts the per-second and seconds units into ticks, once', () => {
		const modifiers = resolveModifiers(INSTALLATIONS.map(def => def.id))
		expect(modifiers).toEqual({
			noiseCapDelta: 55,
			noiseDecayPerTickDelta: 0.5 / 60,
			sweepRadiusTiles: 1.5,
			collectTravelTicksMax: 42,
			crackSpawnMult: 0.8,
			flyerDelayWaves: 1,
			spreadRateMult: 0.6,
			stealsReduction: 1,
			foodBonus: 4,
			snackStash: { atOnShelf: 3, items: 3 },
			loadoutSlots: 8,
		})
	})
})

describe('counter space', () => {
	const SLOT_IDS = ['clearTheDryingRack', 'takeTheToasterOffTheCounter', 'secondShelf']

	it('is 5 with nothing owned, and carried onto the world it was built with', () => {
		expect(LOADOUT_BASE_SLOTS).toBe(5)
		expect(LOADOUT_MAX_SLOTS).toBe(8)
		expect(resolveModifiers([]).loadoutSlots).toBe(5)
		expect(worldWith(['secondShelf']).modifiers.loadoutSlots).toBe(6)
	})

	it('is 6 with any one, 7 with any two, 8 with all three', () => {
		for (const id of SLOT_IDS) {
			expect(resolveModifiers([id]).loadoutSlots).toBe(6)
		}
		for (const [a, b] of [
			['clearTheDryingRack', 'takeTheToasterOffTheCounter'],
			['clearTheDryingRack', 'secondShelf'],
			['takeTheToasterOffTheCounter', 'secondShelf'],
		] as const) {
			expect(resolveModifiers([a, b]).loadoutSlots).toBe(7)
		}
		expect(resolveModifiers(SLOT_IDS).loadoutSlots).toBe(8)
	})

	it('caps at 8, not 9: four copies of one slot installation', () => {
		// There is no fourth slot installation to own, so the cap is reached by repeating one.
		expect(resolveModifiers(Array(4).fill('secondShelf')).loadoutSlots).toBe(8)
	})

	it('touches no other field', () => {
		expect({ ...resolveModifiers(SLOT_IDS), loadoutSlots: NO_MODIFIERS.loadoutSlots }).toEqual(NO_MODIFIERS)
	})
})

describe('Buy a Broom', () => {
	/** Three piles: B is 1.2 tiles from A, C is 2 tiles from A (and 0.8 from B, clear of a merge). */
	function threePiles(world: World): { a: number; b: number; c: number } {
		const a = dropCrumb(world, { x: 5, y: 5 }, 3).id
		const b = dropCrumb(world, { x: 6.2, y: 5 }, 4).id
		const c = dropCrumb(world, { x: 7, y: 5 }, 5).id
		return { a, b, c }
	}

	function click(world: World, crumbId: number): void {
		const queue = createCommandQueue()
		queue.enqueue({ kind: 'CollectCrumb', crumbId })
		tick(world, queue)
	}

	it('pays every pile within 1.5 tiles of the clicked one, and leaves the pile 2 tiles away', () => {
		const world = worldWith(['buyABroom'])
		const { a, b, c } = threePiles(world)
		const wallet = world.crumbs

		click(world, a)

		expect(crumbById(world, a)).toBeNull()
		expect(crumbById(world, b)).toBeNull()
		expect(crumbById(world, c)?.value).toBe(5)
		expect(world.night.crumbsCollected).toBe(7)
		expect(world.crumbs - wallet).toBe(7)
		expect(world.events.filter(event => event.kind === 'crumbCollected')).toHaveLength(2)
	})

	it('pays the clicked pile alone without it', () => {
		const world = worldWith([])
		const { a, b, c } = threePiles(world)

		click(world, a)

		expect(crumbById(world, a)).toBeNull()
		expect(crumbById(world, b)?.value).toBe(4)
		expect(crumbById(world, c)?.value).toBe(5)
		expect(world.night.crumbsCollected).toBe(3)
	})
})

describe('Night Shift Dustpan', () => {
	const at: Vec2 = { x: 5, y: 5 }

	function putTray(world: World, tier: number): Tower {
		const tower: Tower = {
			id: world.nextEntityId++,
			defId: toasterCrumbTray.id,
			tile: { x: at.x, y: at.y },
			hp: toasterCrumbTray.maxHp,
			maxHp: toasterCrumbTray.maxHp,
			tier,
			targetingMode: toasterCrumbTray.defaultTargetingMode,
			targetEnemyId: null,
			cooldownTicks: 0,
			shotsFired: 0,
			state: null,
			totalInvested: toasterCrumbTray.cost,
		}
		world.towers.push(tower)
		world.index.towers[tower.id] = world.towers.length - 1
		return tower
	}

	const collect = toasterCrumbTray.behaviours.find(isCollect)

	it('caps a Crumb Tray flight of 90 ticks at 42', () => {
		const world = worldWith(['nightShiftDustpan'])
		putTray(world, 0)
		const pile = dropCrumb(world, { x: at.x + 1, y: at.y }, 3)

		expect(collect?.travelTicks).toBe(90)
		expect(collect === undefined ? null : collectTravelTicksFor(world, collect)).toBe(42)

		crumbsSystem(world)
		// Claimed at 42, and the claim tick is the flight's first.
		expect(pile.claimedByTowerId).not.toBeNull()
		expect(pile.travelTicksRemaining).toBe(41)
	})

	it('leaves the tier-3 instant collection instant: a cap, not an override', () => {
		const world = worldWith(['nightShiftDustpan'])
		putTray(world, 3)
		const pile = dropCrumb(world, { x: at.x + 1, y: at.y }, 3)

		crumbsSystem(world)

		expect(pile.travelTicksRemaining).toBeLessThanOrEqual(0)
		expect(crumbById(world, pile.id)).toBeNull()
		expect(world.night.crumbsCollected).toBe(3)
	})
})

describe('Seal the Baseboard Crack', () => {
	const night: NightDef = {
		id: 'installationsSpecCrack',
		index: 1,
		mapId: 'counter',
		waves: [
			{
				entries: [
					entry('ant', 10),
					entry('fly', 10),
					entry('roach', 1),
					entry('mold', 10, { startDistanceTiles: 5 }),
				],
				countdownTicks: 60,
			},
		],
	}

	it('spawns 8 of 10 Ants, all 10 Flies, the one Roach, and every Mold that never came through it', () => {
		const world = worldWith(['sealTheBaseboardCrack'])
		startWave(world, night, 0)
		expect(spawnCounts(world)).toEqual({ ant: 8, fly: 10, roach: 1, mold: 10 })
	})

	it('cuts after the difficulty tier, per cursor', () => {
		// Nightmare's count multiplier first, then the crack's 0.8 on what that left.
		const world = worldWith(['sealTheBaseboardCrack'], 'nightmare')
		startWave(world, night, 0)
		const scaled = Math.round(10 * DIFFICULTIES.nightmare.enemyCountMult)
		expect(spawnCounts(world).ant).toBe(Math.round(scaled * 0.8))
	})

	it('spawns the authored counts without it', () => {
		const world = worldWith([])
		startWave(world, night, 0)
		expect(spawnCounts(world)).toEqual({ ant: 10, fly: 10, roach: 1, mold: 10 })
	})
})

describe('Fix the Window Screen', () => {
	const night: NightDef = {
		id: 'installationsSpecScreen',
		index: 1,
		mapId: 'counter',
		waves: [
			{ entries: [entry('ant', 3), entry('fly', 3)], countdownTicks: 60 },
			{ entries: [entry('ant', 2)], countdownTicks: 60 },
			{ entries: [entry('fly', 2)], countdownTicks: 60 },
		],
	}

	/** Wave 1 has only flyers and wave 0 none, so the screen leaves the *middle* wave empty. */
	const hollow: NightDef = {
		id: 'installationsSpecHollow',
		index: 1,
		mapId: 'counter',
		waves: [
			{ entries: [entry('ant', 2)], countdownTicks: 60 },
			{ entries: [entry('fly', 2)], countdownTicks: 60 },
			{ entries: [entry('ant', 2)], countdownTicks: 60 },
		],
	}

	beforeAll(() => {
		;(NIGHTS as NightDef[]).push(night, hollow)
	})

	afterAll(() => {
		;(NIGHTS as NightDef[]).splice(NIGHTS.length - 2, 2)
	})

	/**
	 * Plays the whole night, killing everything the tick after it appears, and returns what each wave
	 * spawned as `defId -> count`, keyed by wave index. `cleared` is every `waveCleared` index, in order.
	 */
	function playNight(world: World, cleared: number[] = []): Record<number, Record<string, number>> {
		const spawned: Record<number, Record<string, number>> = {}
		const seen = new Set<number>()
		const queue = createCommandQueue()

		for (let ticks = 0; ticks < 5_000 && world.night.phase !== 'won' && world.night.phase !== 'lost'; ticks++) {
			tick(world, queue)
			for (const event of world.events) {
				if (event.kind === 'waveCleared') {
					cleared.push(event.waveIndex)
				}
			}
			for (const enemy of world.enemies) {
				if (!seen.has(enemy.id)) {
					seen.add(enemy.id)
					const wave = (spawned[enemy.spawnedInWaveIndex] ??= {})
					wave[enemy.defId] = (wave[enemy.defId] ?? 0) + 1
				}
				enemy.hp = 0
			}
		}

		return spawned
	}

	it('moves each wave’s flyers one wave later, drops the last wave’s, and the night is still won', () => {
		const world = worldWith(['fixTheWindowScreen'], 'normal', night.id)

		const spawned = playNight(world)

		expect(spawned[0]).toEqual({ ant: 3 })
		expect(spawned[1]).toEqual({ ant: 2, fly: 3 })
		// Wave 2 is left empty: its own flyers would arrive after a night with no wave 3. An empty last
		// wave is spawned out on the tick it starts, and the board is already clear.
		expect(spawned[2]).toBeUndefined()
		expect(world.night.phase).toBe('won')
	})

	it('clears an emptied middle wave and counts down to the next one', () => {
		const world = worldWith(['fixTheWindowScreen'], 'normal', hollow.id)
		const cleared: number[] = []

		const spawned = playNight(world, cleared)

		expect(spawned[0]).toEqual({ ant: 2 })
		expect(spawned[1]).toBeUndefined()
		expect(spawned[2]).toEqual({ ant: 2, fly: 2 })
		// The night-ending tick emits `nightEnded`, never the last wave's `waveCleared`, screen or not.
		expect(cleared).toEqual([0, 1])
		expect(world.night.phase).toBe('won')
	})

	it('sends every wave as authored without it', () => {
		const world = worldWith([], 'normal', night.id)
		const spawned = playNight(world)
		expect(spawned[0]).toEqual({ ant: 3, fly: 3 })
		expect(spawned[1]).toEqual({ ant: 2 })
		expect(spawned[2]).toEqual({ fly: 2 })
		expect(world.night.phase).toBe('won')
	})

	it('has a jar destroyed in wave 1 buy from a composition that includes the shifted Flies', () => {
		const world = worldWith(['fixTheWindowScreen'], 'normal', night.id)
		startWave(world, night, 1)
		const before = world.night.wave?.spawns.length ?? 0

		spawnDestroyPenalty(world, 100)

		const bought = (world.night.wave?.spawns ?? []).slice(before).map(spawn => spawn.enemyDefId)
		expect(bought).toContain('fly')
		expect(bought).toContain('ant')
	})
})

describe('Pantry Shelf Liner', () => {
	function moldTiles(world: World): number {
		return world.tiles.filter(state => state.effects.some(effect => effect.kind === 'mold')).length
	}

	/** The tick a spawned Mold's second write lands on. */
	function secondWriteTick(world: World): number {
		const lane = world.map.paths[0]?.id ?? ''
		spawnEnemyAt(world, mold, lane, 5, 0)

		spreadSystem(world)
		expect(moldTiles(world)).toBe(1)

		for (let at = 1; at < 5_000; at++) {
			world.tick = at
			spreadSystem(world)
			if (moldTiles(world) > 1) {
				return at
			}
		}
		return -1
	}

	it('lands a Mold’s second write 1200 ticks after its first, not 720', () => {
		expect(mold.tileWriter?.intervalTicks).toBe(720)
		expect(secondWriteTick(worldWith(['pantryShelfLiner']))).toBe(1200)
		expect(secondWriteTick(worldWith([]))).toBe(720)
	})
})

describe('Bigger Fridge', () => {
	it('adds four items after the tier’s rounding, on any tier', () => {
		expect(worldWith([]).night.food).toHaveLength(18)
		expect(worldWith(['biggerFridge']).night.food).toHaveLength(22)
		expect(worldWith(['biggerFridge'], 'cozy').night.food).toHaveLength(
			Math.round(18 * DIFFICULTIES.cozy.foodItemsMult) + 4,
		)
	})

	it('gives the stocked items ids 1..n, with the entity ids after them', () => {
		const world = worldWith(['biggerFridge'])
		expect(world.night.food.map(item => item.id)).toEqual(Array.from({ length: 22 }, (_, index) => index + 1))
		expect(world.nextEntityId).toBe(23)
	})
})

describe('Emergency Snack Stash', () => {
	function onShelf(world: World): number {
		return world.night.food.filter(isOnShelf).length
	}

	/** Eats the front of the shelf until `left` items are on it. */
	function eatDownTo(world: World, left: number): void {
		for (const item of world.night.food) {
			if (onShelf(world) <= left) {
				return
			}
			if (isOnShelf(item)) {
				item.lostTo = 'eaten'
			}
		}
	}

	it('restocks three once, when a take leaves three or fewer, and never again that night', () => {
		const world = worldWith(['emergencySnackStash'])
		const lane = world.map.paths[0]?.id ?? ''
		const stocked = world.night.food.length

		// 5 to 4: above the line, nothing.
		eatDownTo(world, 5)
		takeFood(world, spawnEnemyAt(world, ant, lane, 0, 0))
		expect(onShelf(world)).toBe(4)
		expect(world.night.snackStashUsed).toBe(false)

		// 4 to 2, straight past 3 on a Beetle's take: three more.
		takeFood(world, spawnEnemyAt(world, beetle, lane, 0, 0))
		expect(onShelf(world)).toBe(2 + 3)
		expect(world.night.snackStashUsed).toBe(true)

		// Three new items on the end, on the shelf, with ids nothing else has.
		const added = world.night.food.slice(stocked)
		expect(added).toHaveLength(3)
		expect(added.every(isOnShelf)).toBe(true)
		const ids = world.night.food.map(item => item.id)
		expect(new Set(ids).size).toBe(ids.length)
		expect(Math.min(...added.map(item => item.id))).toBeGreaterThan(stocked)

		// 4 to 2: below the line again, and nothing.
		eatDownTo(world, 4)
		takeFood(world, spawnEnemyAt(world, beetle, lane, 0, 0))
		expect(onShelf(world)).toBe(2)
		expect(world.night.food).toHaveLength(stocked + 3)
	})

	it('does nothing without it', () => {
		const world = worldWith([])
		const lane = world.map.paths[0]?.id ?? ''
		eatDownTo(world, 4)
		takeFood(world, spawnEnemyAt(world, beetle, lane, 0, 0))
		expect(onShelf(world)).toBe(2)
		expect(world.night.snackStashUsed).toBe(false)
	})
})
