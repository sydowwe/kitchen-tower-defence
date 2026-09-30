import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getMapDef } from '@/core/content/index.ts'
import { ENEMIES, ant, mold } from '@/core/content/enemies.ts'
import { NO_MODIFIERS, resolveModifiers } from '@/core/content/installations.ts'
import { NIGHT_MODIFIER_WRITES, NIGHT_MODIFIERS, applyNightModifier } from '@/core/content/modifiers.ts'
import { NIGHTS } from '@/core/content/nights.ts'
import { validateContent } from '@/core/content/schema.ts'
import { TOWERS, toasterCrumbTray } from '@/core/content/towers.ts'
import { TileFlags, canPlace } from '@/core/map.ts'
import { applyDamage, dealDamage } from '@/core/systems/combat.ts'
import { economySystem } from '@/core/systems/economy.ts'
import { resolveSystem } from '@/core/systems/resolve.ts'
import { spawnEnemyAt, startWave, waveEntryCount } from '@/core/systems/spawn.ts'
import { spreadSystem } from '@/core/systems/spread.ts'
import { statusSystem } from '@/core/systems/status.ts'
import { applyStatuses } from '@/core/content/statuses.ts'
import { createWorld } from '@/core/world.ts'
import type { NightDef } from '@/core/content/schema.ts'
import type { DamageType, DefId, DifficultyId, Enemy, Tower, Vec2, World, WorldModifiers } from '@/core/types.ts'

/**
 * Step 21B: the night modifiers, built headless.
 *
 * Every modified world here is built the way the campaign will build one -- a night def naming the
 * modifier, into `createWorld` -- never by writing `world.modifiers` by hand. The night is one
 * synthetic night on the Counter, pushed into `NIGHTS` and popped after each test, with its
 * `modifierId` set per build so that nothing else about the two worlds being compared differs.
 */

const COUNTER_LANE = 'crack'

const night: NightDef = {
	id: 'modifiersSpecNight',
	index: 1,
	mapId: 'counter',
	waves: [
		{
			entries: [
				{ enemyDefId: 'ant', count: 5, spacingTicks: 10, startDelayTicks: 0, pathId: COUNTER_LANE },
				{ enemyDefId: 'ant', count: 1, spacingTicks: 10, startDelayTicks: 0, pathId: COUNTER_LANE },
			],
			countdownTicks: 60,
		},
	],
}

beforeEach(() => {
	;(NIGHTS as NightDef[]).push(night)
})

afterEach(() => {
	delete night.modifierId
	;(NIGHTS as NightDef[]).pop()
})

function build(
	modifierId: DefId | null,
	{
		seed = 1234,
		difficulty = 'normal',
		modifiers,
	}: { seed?: number; difficulty?: DifficultyId; modifiers?: WorldModifiers } = {},
): World {
	if (modifierId === null) {
		delete night.modifierId
	} else {
		night.modifierId = modifierId
	}
	return createWorld({ seed, mapId: 'counter', nightId: night.id, difficulty, modifiers })
}

/** Every leaf of a JSON value by its dotted path. An empty array or object is a leaf of its own. */
function leaves(value: unknown, path: string, into: Map<string, unknown>): Map<string, unknown> {
	if (value === null || typeof value !== 'object') {
		into.set(path, value)
		return into
	}
	const entries = Object.entries(value)
	if (entries.length === 0) {
		into.set(path, Array.isArray(value) ? '[]' : '{}')
	}
	for (const [key, child] of entries) {
		leaves(child, path === '' ? key : `${path}.${key}`, into)
	}
	return into
}

/** The dotted paths at which two worlds differ, as they would be saved. */
function changedPaths(a: World, b: World): string[] {
	const left = leaves(JSON.parse(JSON.stringify(a)), '', new Map())
	const right = leaves(JSON.parse(JSON.stringify(b)), '', new Map())
	const keys = new Set([...left.keys(), ...right.keys()])
	return [...keys].filter(key => left.has(key) !== right.has(key) || !Object.is(left.get(key), right.get(key)))
}

function isUnder(path: string, prefix: string): boolean {
	return path === prefix || path.startsWith(`${prefix}.`)
}

/** Boxed tiles: off-path buildable on the authored map, and not on the world's. */
function boxedTiles(world: World): Vec2[] {
	const authored = getMapDef('counter')
	const boxed: Vec2[] = []
	for (let y = 0; y < authored.heightTiles; y++) {
		for (let x = 0; x < authored.widthTiles; x++) {
			if (canPlace(authored, { x, y }, 'off_path') && !canPlace(world.map, { x, y }, 'off_path')) {
				boxed.push({ x, y })
			}
		}
	}
	return boxed
}

function spawnCounts(world: World): number {
	return (world.night.wave?.spawns ?? []).reduce((sum, spawn) => sum + spawn.remaining, 0)
}

/** An enemy standing on the Counter's lane with no tags, so the matrix is 1.0 for every type. */
function untagged(world: World): Enemy {
	const enemy = spawnEnemyAt(world, ant, COUNTER_LANE, 3, 0)
	enemy.tags = []
	enemy.hp = 1000
	return enemy
}

describe('every night modifier', () => {
	it('is analytic-docs/CONTENT.md section 6’s five', () => {
		expect(NIGHT_MODIFIERS.map(def => def.id)).toEqual([
			'dishesLeftOut',
			'dampNight',
			'dinnerParty',
			'movingDay',
			'heatwave',
		])
	})

	it('changes exactly the fields its effects declare, and nothing else', () => {
		for (const def of NIGHT_MODIFIERS) {
			const plain = build(null)
			const modified = build(def.id)
			const declared = [...def.effects.flatMap(effect => NIGHT_MODIFIER_WRITES[effect.kind]), 'night.modifierId']
			const changed = changedPaths(plain, modified)

			const undeclared = changed.filter(path => !declared.some(prefix => isUnder(path, prefix)))
			expect(undeclared, def.id).toEqual([])
			for (const prefix of declared) {
				expect(
					changed.some(path => isUnder(path, prefix)),
					`${def.id} declares ${prefix}`,
				).toBe(true)
			}
			expect(changed.some(path => isUnder(path, 'rng'))).toBe(false)
			expect(modified.night.modifierId).toBe(def.id)
		}
	})

	it('fails boot when a night names one that does not exist, or when its glyph is a tower’s', () => {
		const typo: NightDef = { ...night, modifierId: 'heatWave' }
		expect(() => validateContent({ nights: [typo], modifiers: NIGHT_MODIFIERS })).toThrow(
			/modifierId: no modifier 'heatWave'/,
		)

		const cardboard = { ...NIGHT_MODIFIERS[3], effects: [{ kind: 'boxes', fraction: 0.3, glyph: '📦' }] }
		expect(() => validateContent({ towers: TOWERS, enemies: ENEMIES, modifiers: [cardboard] })).toThrow(
			/effects\.0\.glyph: '📦' is a tower's or an enemy's/,
		)
	})
})

describe('moving day', () => {
	it('is the same boxes for the same seed, and other boxes for another', () => {
		expect(build('movingDay').map.flags).toEqual(build('movingDay').map.flags)
		expect(build('movingDay', { seed: 99 }).map.flags).not.toEqual(build('movingDay').map.flags)
	})

	it('boxes round(0.3 x n) of the n placeable tiles, none of them track, each refused and drawn', () => {
		const authored = getMapDef('counter')
		const before = JSON.stringify(authored)
		let placeable = 0
		for (let y = 0; y < authored.heightTiles; y++) {
			for (let x = 0; x < authored.widthTiles; x++) {
				if (canPlace(authored, { x, y }, 'off_path')) {
					placeable++
				}
			}
		}

		const world = build('movingDay')
		const boxed = boxedTiles(world)

		expect(placeable).toBeGreaterThan(100)
		expect(boxed).toHaveLength(Math.round(0.3 * placeable))
		for (const tile of boxed) {
			const flags = world.map.flags[tile.y * world.map.widthTiles + tile.x] ?? 0
			expect(flags & TileFlags.TRACK).toBe(0)
			expect(flags & TileFlags.BUILDABLE).toBe(0)
			expect(flags & TileFlags.DECOR).toBe(TileFlags.DECOR)
			expect(canPlace(world.map, tile, 'off_path')).toBe(false)
			expect(canPlace(world.map, tile, 'path_only')).toBe(false)
			expect(world.map.decor.filter(entry => entry.tile.x === tile.x && entry.tile.y === tile.y)).toEqual([
				{ glyph: '🧳', tile },
			])
		}
		// The authored decor is still there, with one box per boxed tile after it.
		expect(world.map.decor).toHaveLength(authored.decor.length + boxed.length)
		expect(JSON.stringify(getMapDef('counter'))).toBe(before)
	})
})

describe('a damp night', () => {
	/** The tick a Mold's second write lands on, its first being the tick it spawns. */
	function secondWriteTick(world: World): number {
		spawnEnemyAt(world, mold, COUNTER_LANE, 5, 0)
		spreadSystem(world)
		for (let at = 1; at < 5_000; at++) {
			world.tick = at
			spreadSystem(world)
			if (world.tiles.filter(state => state.effects.some(effect => effect.kind === 'mold')).length > 1) {
				return at
			}
		}
		return -1
	}

	it('pulses a Mold every 480 ticks, not 720', () => {
		expect(mold.tileWriter?.intervalTicks).toBe(720)
		expect(secondWriteTick(build('dampNight'))).toBe(480)
		expect(secondWriteTick(build(null))).toBe(720)
	})

	it('multiplies with the Pantry Shelf Liner to 0.9, and pulses every 800', () => {
		const liner = resolveModifiers(['pantryShelfLiner'])
		const world = build('dampNight', { modifiers: liner })

		// A product, never a max: 0.6 x 1.5.
		expect(world.modifiers.spreadRateMult).toBeCloseTo(0.9, 12)
		expect(secondWriteTick(world)).toBe(800)
		// And the options' object is left as it was passed.
		expect(liner.spreadRateMult).toBe(0.6)
	})
})

describe('after a dinner party', () => {
	it('spawns 10 of a 5-count entry, and 3 of a 1-count entry at nightmare', () => {
		const normal = build('dinnerParty')
		startWave(normal, night, 0)
		expect(normal.night.wave?.spawns.map(spawn => spawn.remaining)).toEqual([10, 2])

		const nightmare = build('dinnerParty', { difficulty: 'nightmare' })
		startWave(nightmare, night, 0)
		// round(1 x 1.25 x 2) = round(2.5): once, over the product.
		expect(nightmare.night.wave?.spawns[1]?.remaining).toBe(3)
		expect(waveEntryCount(1, { enemyCountMult: 1.25 }, { enemyCountMult: 2 })).toBe(3)

		const plain = build(null)
		startWave(plain, night, 0)
		expect(spawnCounts(plain)).toBe(6)
	})

	it('drops 6 for an Ant, and leaves a Crumb Tray’s payout alone', () => {
		const world = build('dinnerParty')
		const enemy = spawnEnemyAt(world, ant, COUNTER_LANE, 3, 0)
		enemy.hp = 0
		resolveSystem(world)

		expect(ant.reward).toBe(3)
		expect(world.crumbPiles.map(pile => pile.value)).toEqual([6])

		const tray: Tower = {
			id: world.nextEntityId++,
			defId: toasterCrumbTray.id,
			tile: { x: 1, y: 1 },
			hp: toasterCrumbTray.maxHp,
			maxHp: toasterCrumbTray.maxHp,
			tier: 0,
			targetingMode: toasterCrumbTray.defaultTargetingMode,
			targetEnemyId: null,
			cooldownTicks: 0,
			shotsFired: 0,
			state: null,
			totalInvested: toasterCrumbTray.cost,
		}
		world.towers.push(tray)
		world.index.towers[tray.id] = world.towers.length - 1
		const wallet = world.crumbs

		economySystem(world)

		expect(world.crumbs - wallet).toBe(4)
	})
})

describe('a heatwave', () => {
	function hit(world: World, damageType: DamageType): number {
		return applyDamage(world, untagged(world), 10, damageType)
	}

	it('deals 13 of 10 fire, 7 of 10 cold, and 10 of 10 physical', () => {
		const world = build('heatwave')
		expect(hit(world, 'fire')).toBeCloseTo(13, 12)
		expect(hit(world, 'cold')).toBeCloseTo(7, 12)
		expect(hit(world, 'physical')).toBe(10)
		expect(hit(build(null), 'fire')).toBe(10)
	})

	it('warms a burn tick by the same 1.3', () => {
		function burnTick(world: World): number {
			const enemy = untagged(world)
			applyStatuses(
				enemy,
				[{ kind: 'burn', magnitude: null, durationTicks: null, stacks: null, everyNthHit: null }],
				null,
				'fire',
			)
			const before = enemy.hp
			statusSystem(world)
			return before - enemy.hp
		}

		const plain = burnTick(build(null))
		expect(plain).toBeGreaterThan(0)
		expect(burnTick(build('heatwave')) / plain).toBeCloseTo(1.3, 12)
	})

	it('reports the hit’s multiplier as 1.3', () => {
		const world = build('heatwave')
		dealDamage(world, untagged(world), 10, 'fire', 7)
		const event = world.events.find(entry => entry.kind === 'enemyDamaged')
		expect(event?.kind === 'enemyDamaged' ? event.multiplier : null).toBeCloseTo(1.3, 12)
	})
})

describe('dishes left out', () => {
	it('puts 15 piles of 5 on the floor at tick 0, counted as dropped, without touching the world’s rng', () => {
		const world = build('dishesLeftOut')

		expect(world.tick).toBe(0)
		expect(world.crumbPiles).toHaveLength(15)
		expect(world.crumbPiles.every(pile => pile.value === 5 && pile.ageTicks === 0)).toBe(true)
		expect(world.night.crumbsDropped).toBe(75)
		expect(world.rng).toEqual(build(null).rng)
	})
})

describe('no leak between worlds', () => {
	it('builds a plain world at NO_MODIFIERS after every modifier’s', () => {
		for (const def of NIGHT_MODIFIERS) {
			build(def.id)
			applyNightModifier(NO_MODIFIERS, def)
		}

		expect(build(null).modifiers).toEqual(NO_MODIFIERS)
		expect(NO_MODIFIERS.damageTypeMult.fire).toBe(1)
		expect(NO_MODIFIERS.damageTypeMult.cold).toBe(1)
		expect(resolveModifiers([]).damageTypeMult).not.toBe(NO_MODIFIERS.damageTypeMult)
	})
})
