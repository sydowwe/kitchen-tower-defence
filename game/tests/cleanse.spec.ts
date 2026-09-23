import { describe, expect, it } from 'vitest'
import { isAttack, isCleanse } from '@/core/content/behaviours.ts'
import { beetle, fly, mold, slug } from '@/core/content/enemies.ts'
import { effectiveDefOf } from '@/core/content/index.ts'
import { resolveDamage } from '@/core/content/matrix.ts'
import { validateContent } from '@/core/content/schema.ts'
import { bakingSoda, saltShaker, vinegarSpray } from '@/core/content/towers.ts'
import { createCommandQueue } from '@/core/commands.ts'
import { TileFlags } from '@/core/map.ts'
import { tick } from '@/core/sim.ts'
import { effectAt, hasEffect, writeEffect } from '@/core/tiles.ts'
import { placeTower } from '@/core/systems/placement.ts'
import { spawnEnemyAt } from '@/core/systems/spawn.ts'
import { createTestWorld } from './fixtures/world.ts'
import type { TowerDef } from '@/core/content/schema.ts'
import type { Enemy, GameEvent, MapDef, Tower, Vec2, World } from '@/core/types.ts'

/**
 * The two scrubbers: `cleanseSystem`, the Vinegar Spray and the Baking Soda -- and, because it needs
 * a chemical tower to exist, the step's damage-matrix pair against the Mold.
 *
 * Everything runs on a 7 x 7 board with the lane along row 3 and the fridge at (6, 3), so every
 * distance below is arithmetic on integers. The towers stand at (3, 1), two rows above the lane.
 */

const PATH_ID = 'a'
const SIZE = 7
const LANE_ROW = 3
const TOWER_TILE = { x: 3, y: 1 }

function squareMap(): MapDef {
	const flags = new Array<number>(SIZE * SIZE).fill(TileFlags.BUILDABLE)
	for (let x = 0; x < SIZE; x++) {
		flags[LANE_ROW * SIZE + x] = TileFlags.BUILDABLE | TileFlags.TRACK
	}

	return {
		id: 'square',
		widthTiles: SIZE,
		heightTiles: SIZE,
		paths: [
			{
				id: PATH_ID,
				waypoints: [
					{ x: 0, y: LANE_ROW },
					{ x: SIZE - 1, y: LANE_ROW },
				],
				lengthTiles: SIZE - 1,
			},
		],
		trackWidthTiles: 1,
		flags,
		fridge: { tile: { x: SIZE - 1, y: LANE_ROW }, glyph: '🗄️' },
		decor: [],
	}
}

/** A wave permanently mid-spawn, so an empty board does not end the night and freeze every system. */
function makeWorld(): World {
	const world = createTestWorld()
	world.map = squareMap()
	world.night.phase = 'wave'
	world.night.wave = {
		index: 0,
		startedAtTick: 0,
		spawns: [{ enemyDefId: 'ant', remaining: 1, nextSpawnTick: 1_000_000, spacingTicks: 60, pathId: PATH_ID }],
	}
	return world
}

function run(world: World, count: number): GameEvent[] {
	const queue = createCommandQueue()
	const events: GameEvent[] = []
	for (let index = 0; index < count; index++) {
		tick(world, queue)
		events.push(...world.events)
	}
	return events
}

function place(world: World, def: TowerDef, tier = 0): Tower {
	const tower = placeTower(world, def, TOWER_TILE)
	if (tower === null) {
		throw new Error(`could not place '${def.id}' at ${TOWER_TILE.x},${TOWER_TILE.y}`)
	}
	tower.tier = tier
	return tower
}

/** An enemy that stays exactly where it was put. */
function standing(world: World, def: Parameters<typeof spawnEnemyAt>[1], distance: number): Enemy {
	const enemy = spawnEnemyAt(world, def, PATH_ID, distance, 0)
	enemy.speed = 0
	return enemy
}

function key(tile: Vec2): string {
	return `${tile.x},${tile.y}`
}

function cellsWith(world: World, kind: 'mold' | 'slime'): string[] {
	return world.tiles
		.filter(state => state.effects.some(effect => effect.kind === kind))
		.map(state => key(state.tile))
		.sort()
}

// --- the damage matrix, end to end ---------------------------------------------------------------

describe('a shot on a Mold, through the whole projectile path', () => {
	/**
	 * The first hit a tower lands on a mold standing in its range: the `enemyDamaged` amount, and
	 * whether a `Projectile` was in flight at some tick before it -- which is what proves the hit came
	 * through `spawnProjectile` -> `projectilesSystem` -> `dealDamage` and not a shortcut.
	 */
	function firstHit(def: TowerDef): { amount: number; flew: boolean } {
		const world = makeWorld()
		place(world, def)
		const target = standing(world, mold, 3)
		let flew = false

		for (let n = 0; n < 300; n++) {
			const events = run(world, 1)
			flew ||= world.projectiles.length > 0
			const hit = events.find(event => event.kind === 'enemyDamaged' && event.enemyId === target.id)
			if (hit !== undefined && hit.kind === 'enemyDamaged') {
				return { amount: hit.amount, flew }
			}
		}
		throw new Error(`'${def.id}' never hit the mold`)
	}

	it('resolves a Salt Shaker to exactly 0.2x and a Vinegar Spray to exactly 2.5x', () => {
		// One pair in one place: this is what catches `fungal` becoming an average of the matrix
		// instead of its row, and it needs both ends of the row to do it.
		const salt = firstHit(saltShaker)
		const vinegar = firstHit(vinegarSpray)

		expect(salt.flew).toBe(true)
		expect(vinegar.flew).toBe(true)
		// 5 physical x 0.2 and 4 chemical x 2.5. `ground` and `spreads` have no row.
		expect(salt.amount).toBeCloseTo(1, 10)
		expect(vinegar.amount).toBeCloseTo(10, 10)
	})
})

describe('the Slug s two tags', () => {
	it('multiply to exactly 3.0x chemical and 0.5x cold', () => {
		// `slime` 1.5 x `soft` 2.0, and `slime` 1.0 x `soft` 0.5 -- written out, not looked up.
		const slugTarget = { tags: slug.tags, statuses: [] }
		expect(resolveDamage(10, 'chemical', slugTarget)).toBeCloseTo(30, 10)
		expect(resolveDamage(10, 'cold', slugTarget)).toBeCloseTo(5, 10)
	})
})

// --- the Vinegar Spray ----------------------------------------------------------------------------

describe('a Vinegar Spray scrubbing mold', () => {
	/**
	 * (5,1) and (4,2) are both sqrt(5) from the fridge at (6,3); (5,1) is row-major index 12 and
	 * (4,2) is 18, so the tie goes to (5,1). (1,1) is 5.39 away and goes last. (5,5) is outside the
	 * radius-3 circle round (3,1) and is never touched.
	 */
	const MOLDED: Vec2[] = [
		{ x: 1, y: 1 },
		{ x: 4, y: 2 },
		{ x: 5, y: 1 },
		{ x: 5, y: 5 },
	]

	/** The cell each pulse removed, in order, from a fresh world. */
	function clearingOrder(): string[] {
		const world = makeWorld()
		place(world, vinegarSpray)
		for (const tile of MOLDED) {
			writeEffect(world, tile, 'mold')
		}

		const order: string[] = []
		let before = cellsWith(world, 'mold')
		// Tick 0 is a pulse (0 % 60), then every 60 ticks after it.
		for (const ticks of [1, 60, 60, 60, 60]) {
			run(world, ticks)
			const after = cellsWith(world, 'mold')
			const gone = before.filter(cell => !after.includes(cell))
			expect(gone.length).toBeLessThanOrEqual(1)
			order.push(...gone)
			before = after
		}

		expect(cellsWith(world, 'mold')).toEqual(['5,5'])
		return order
	}

	it('clears exactly one cell a pulse, nearest the fridge first, ties to the lower row-major index', () => {
		const first = clearingOrder()
		const second = clearingOrder()

		expect(first).toEqual(['5,1', '4,2', '1,1'])
		expect(second).toEqual(first)
	})

	it('still cleans with no enemy anywhere on the board', () => {
		const world = makeWorld()
		const tower = place(world, vinegarSpray)
		writeEffect(world, { x: 4, y: 2 }, 'mold')
		writeEffect(world, { x: 2, y: 2 }, 'mold')

		run(world, 61)

		expect(world.enemies).toEqual([])
		expect(tower.targetEnemyId).toBeNull()
		expect(cellsWith(world, 'mold')).toEqual([])
	})

	it('leaves slime alone: it clears only what its `clears` names', () => {
		const world = makeWorld()
		place(world, vinegarSpray)
		writeEffect(world, { x: 4, y: 2 }, 'slime')

		run(world, 1)

		expect(hasEffect(world, { x: 4, y: 2 }, 'slime')).toBe(true)
	})
})

// --- the Baking Soda ------------------------------------------------------------------------------

describe('a Baking Soda scrubbing slime', () => {
	/**
	 * Distances from the tower at (3,1): (3,0), (2,1) and (3,2) are 1; (4,2) is 1.41; (5,1) is
	 * exactly 2; (5,3) is 2.83.
	 */
	const SLIMED: Vec2[] = [
		{ x: 3, y: 0 },
		{ x: 2, y: 1 },
		{ x: 3, y: 2 },
		{ x: 4, y: 2 },
		{ x: 5, y: 1 },
		{ x: 5, y: 3 },
	]

	function slimedAfterOnePulse(tier: number): string[] {
		const world = makeWorld()
		place(world, bakingSoda, tier)
		for (const tile of SLIMED) {
			writeEffect(world, tile, 'slime')
		}
		run(world, 1)
		return cellsWith(world, 'slime')
	}

	it('clears every slimed cell inside 1.2 tiles in one pulse, and none outside it', () => {
		expect(slimedAfterOnePulse(0)).toEqual(['4,2', '5,1', '5,3'])
	})

	it('at tier 3 takes a cell at exactly its 2.0-tile radius, and still not one beyond it', () => {
		expect(slimedAfterOnePulse(3)).toEqual(['5,3'])
	})

	it('pulses on its own 100-tick clock, not every tick', () => {
		const world = makeWorld()
		place(world, bakingSoda)
		run(world, 1)
		writeEffect(world, { x: 3, y: 2 }, 'slime')

		// Ticks 1 to 99 pass it by; tick 100 is the next pulse.
		run(world, 99)
		expect(hasEffect(world, { x: 3, y: 2 }, 'slime')).toBe(true)
		run(world, 1)
		expect(hasEffect(world, { x: 3, y: 2 }, 'slime')).toBe(false)
	})
})

describe('clearing a cell s last effect', () => {
	it('removes the cell from world.tiles instead of leaving an empty TileState', () => {
		const world = makeWorld()
		place(world, vinegarSpray)
		writeEffect(world, { x: 4, y: 2 }, 'mold')

		run(world, 1)

		expect(world.tiles).toEqual([])
	})

	it('keeps the cell, with only what was not cleared, when something else is on it', () => {
		const world = makeWorld()
		place(world, vinegarSpray)
		writeEffect(world, { x: 4, y: 2 }, 'mold')
		writeEffect(world, { x: 4, y: 2 }, 'scorch')

		run(world, 1)

		expect(world.tiles).toHaveLength(1)
		expect(world.tiles[0]?.effects.map(effect => effect.kind)).toEqual(['scorch'])
		expect(effectAt(world, { x: 4, y: 2 }, 'mold')).toBeNull()
	})
})

// --- the instant-AoE branch -----------------------------------------------------------------------

describe('a Baking Soda shot', () => {
	it('lands on every ground enemy in its splash the tick it fires, with no projectile, once each', () => {
		const world = makeWorld()
		place(world, bakingSoda)
		// On the lane at row 3. The primary is (3,3), 2 tiles below the tower and the closest thing in
		// range; (4,3) is 1 tile from it and inside the 1.2 splash; (5,3) is 2 from it and outside.
		// The fly sits on the primary's own tile, and a ground-only splash must not reach it.
		const primary = standing(world, beetle, 3)
		const beside = standing(world, beetle, 4)
		const beyond = standing(world, beetle, 5)
		const flyer = standing(world, fly, 3)

		let events: GameEvent[] = []
		for (let n = 0; n < 5 && !events.some(event => event.kind === 'towerFired'); n++) {
			events = run(world, 1)
		}

		const hits = events.filter(event => event.kind === 'enemyDamaged')
		expect(events.filter(event => event.kind === 'towerFired')).toHaveLength(1)
		expect(world.projectiles).toEqual([])
		// 6 chemical against a Beetle, whose `ground` and `bug` have no matrix row.
		expect(hits.map(hit => (hit.kind === 'enemyDamaged' ? [hit.enemyId, hit.amount] : null)).sort()).toEqual(
			[
				[primary.id, 6],
				[beside.id, 6],
			].sort(),
		)
		expect(primary.hp).toBe(beetle.hp - 6)
		expect(beside.hp).toBe(beetle.hp - 6)
		expect(beyond.hp).toBe(beetle.hp)
		expect(flyer.hp).toBe(fly.hp)
	})
})

// --- tiers and validation -------------------------------------------------------------------------

describe('the two tier 3s, through effectiveDefOf', () => {
	it('doubles the Vinegar Spray s scrubbing reach and leaves its aim where it was', () => {
		const world = makeWorld()
		const def = effectiveDefOf(place(world, vinegarSpray, 3))

		expect(def.behaviours.find(isCleanse)?.radiusTiles).toBe(6)
		expect(def.behaviours.find(isAttack)?.rangeTiles).toBe(3)
		expect(def.behaviours.find(isAttack)?.damage).toBe(8)
	})

	it('raises both of the Baking Soda s radii to 2.0 -- the splash and the scrub, not one of them', () => {
		const world = makeWorld()
		const def = effectiveDefOf(place(world, bakingSoda, 3))

		expect(def.behaviours.find(isAttack)?.splashRadiusTiles).toBe(2)
		expect(def.behaviours.find(isCleanse)?.radiusTiles).toBe(2)
		expect(def.behaviours.find(isAttack)?.damage).toBe(10)
	})
})

describe('the two scrubbers as content', () => {
	it('validate, three tiers each', () => {
		expect(() => validateContent({ towers: [vinegarSpray, bakingSoda] })).not.toThrow()
		expect(vinegarSpray.upgrades).toHaveLength(3)
		expect(bakingSoda.upgrades).toHaveLength(3)
	})

	it('reject a pasted millisecond interval and a cleanse that clears nothing', () => {
		const slow = {
			...vinegarSpray,
			behaviours: vinegarSpray.behaviours.map(b => (isCleanse(b) ? { ...b, intervalTicks: 1000 } : b)),
		}
		const empty = {
			...vinegarSpray,
			behaviours: vinegarSpray.behaviours.map(b => (isCleanse(b) ? { ...b, clears: [] } : b)),
		}

		expect(() => validateContent({ towers: [slow] })).toThrow(/intervalTicks/)
		expect(() => validateContent({ towers: [empty] })).toThrow(/clears/)
	})
})
