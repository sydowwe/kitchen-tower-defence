import { describe, expect, it } from 'vitest'
import { createCommandQueue } from '@/core/commands.ts'
import { TILE_EFFECT_DEFS } from '@/core/content/tileEffects.ts'
import { saltShaker } from '@/core/content/towers.ts'
import { TileFlags } from '@/core/map.ts'
import { tick } from '@/core/sim.ts'
import {
	blocksPlacement,
	clearEffect,
	effectAt,
	forEachTileWithEffect,
	hasEffect,
	neighbours,
	tileAt,
	tileStateAt,
	tilesInRadius,
	writeEffect,
} from '@/core/tiles.ts'
import { applyDamage } from '@/core/systems/combat.ts'
import { canPlaceTower, placeTower } from '@/core/systems/placement.ts'
import { tilesSystem } from '@/core/systems/tiles.ts'
import { createTestWorld } from './fixtures/world.ts'
import type { Enemy, EnemyTag, MapDef, World } from '@/core/types.ts'

/**
 * The tile system, which is entirely headless until 14B draws it -- so this file is the only way to
 * see any of it.
 *
 * The fixture's board is a 40 x 1 lane with path `a` from (0,0) to (39,0), so an enemy's position is
 * `(distance, 0)` and the tile under it is `(Math.round(distance), 0)`. **That board is one row
 * tall**, so `neighbours` on it has at most two members; the adjacency and radius specs below build
 * their own square map instead.
 */

const PATH_ID = 'a'

/**
 * A `fungal` enemy. Its matrix row is loud in both directions -- fire 1.5x, chemical 2.5x -- so a
 * heated tile that subtracted from `hp` instead of going through `resolveDamage` produces a visibly
 * different number rather than no number at all.
 */
const FUNGAL: EnemyTag[] = ['ground', 'fungal']

/** Heat's default, through the fungal row: (14 / 60) * 1.5 per tick. */
const HEAT_ON_FUNGAL = (14 / 60) * 1.5

function makeWorld(): World {
	const world = createTestWorld()
	// A wave permanently mid-spawn, so `resolveSystem` does not declare the night won the moment the
	// board empties. The fixture opens on `'won'`, and a terminal phase runs no systems at all.
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
	speed?: number
	tags?: EnemyTag[]
}

function addEnemy(world: World, overrides: EnemyOverrides = {}): Enemy {
	const enemy: Enemy = {
		id: world.nextEntityId++,
		defId: 'ant',
		pathId: PATH_ID,
		distance: overrides.distance ?? 10,
		lateralOffsetTiles: 0,
		hp: 10_000,
		maxHp: 10_000,
		statuses: [],
		tags: overrides.tags ?? FUNGAL,
		speed: overrides.speed ?? 0,
		spawnedInWaveIndex: 0,
		nextTileWriteTick: 0,
		stolenItems: [],
		flags: { hidden: false, untargetable: false, fleeing: false, revealed: false },
	}

	world.index.enemies[enemy.id] = world.enemies.length
	world.enemies.push(enemy)
	return enemy
}

function run(world: World, count: number): void {
	const queue = createCommandQueue()
	for (let index = 0; index < count; index++) {
		tick(world, queue)
	}
}

function at(x: number) {
	return { x, y: 0 }
}

function roundTrip(world: World): World {
	return JSON.parse(JSON.stringify(world)) as World
}

/** A square board, because the fixture's single row cannot answer a question about adjacency. */
function squareMap(size: number): MapDef {
	return {
		id: 'square',
		widthTiles: size,
		heightTiles: size,
		paths: [
			{
				id: PATH_ID,
				waypoints: [
					{ x: 0, y: 0 },
					{ x: size - 1, y: 0 },
				],
				lengthTiles: size - 1,
			},
		],
		trackWidthTiles: 1,
		flags: new Array<number>(size * size).fill(TileFlags.BUILDABLE),
		fridge: { tile: { x: size - 1, y: size - 1 }, glyph: '🗄️' },
		decor: [],
	}
}

/** Sorted so a spec compares sets rather than the order the scan happens to produce. */
function sorted(tiles: readonly { x: number; y: number }[]): string[] {
	return tiles.map(tile => `${tile.x},${tile.y}`).sort()
}

describe('tileAt', () => {
	it('rounds rather than floors, because integers land on tile centres', () => {
		// The one assertion that fails loudly if somebody swaps in `Math.floor`: that would answer
		// {3, 3} here and put every enemy one tile behind where it is standing, half the time.
		expect(tileAt({ x: 3.4, y: 3.6 })).toEqual({ x: 3, y: 4 })
		expect(tileAt({ x: 2.5, y: -0.4 })).toEqual({ x: 3, y: -0 })
		expect(tileAt({ x: 7, y: 1 })).toEqual({ x: 7, y: 1 })
	})
})

describe('neighbours and tilesInRadius', () => {
	const map = squareMap(5)

	it('returns four tiles orthogonally and eight with diagonals, in the middle of the board', () => {
		expect(sorted(neighbours(map, { x: 2, y: 2 }, false))).toEqual(
			sorted([
				{ x: 1, y: 2 },
				{ x: 3, y: 2 },
				{ x: 2, y: 1 },
				{ x: 2, y: 3 },
			]),
		)
		expect(neighbours(map, { x: 2, y: 2 }, true)).toHaveLength(8)
	})

	it('clamps at the corner and never hands back an off-board tile', () => {
		expect(sorted(neighbours(map, { x: 0, y: 0 }, false))).toEqual(
			sorted([
				{ x: 1, y: 0 },
				{ x: 0, y: 1 },
			]),
		)
		expect(sorted(neighbours(map, { x: 0, y: 0 }, true))).toEqual(
			sorted([
				{ x: 1, y: 0 },
				{ x: 0, y: 1 },
				{ x: 1, y: 1 },
			]),
		)
	})

	it('answers exactly the centre tile at radius 0, and the plus shape at radius 1', () => {
		expect(tilesInRadius(map, { x: 2, y: 2 }, 0)).toEqual([{ x: 2, y: 2 }])
		// Five, not nine: a diagonal neighbour is sqrt(2) away and that is outside a radius of 1.
		expect(sorted(tilesInRadius(map, { x: 2, y: 2 }, 1))).toEqual(
			sorted([
				{ x: 2, y: 2 },
				{ x: 1, y: 2 },
				{ x: 3, y: 2 },
				{ x: 2, y: 1 },
				{ x: 2, y: 3 },
			]),
		)
		expect(sorted(tilesInRadius(map, { x: 0, y: 0 }, 1))).toEqual(
			sorted([
				{ x: 0, y: 0 },
				{ x: 1, y: 0 },
				{ x: 0, y: 1 },
			]),
		)
	})
})

describe('ageing', () => {
	it('applies an effect on exactly three ticks and not on the fourth', () => {
		const world = makeWorld()
		const enemy = addEnemy(world, { distance: 10 })
		writeEffect(world, at(10), 'heat', { durationTicks: 3 })

		run(world, 1)
		expect(enemy.maxHp - enemy.hp).toBeCloseTo(HEAT_ON_FUNGAL, 10)

		run(world, 2)
		// Read first, decrement last: three ticks of damage from three ticks of duration.
		expect(enemy.maxHp - enemy.hp).toBeCloseTo(HEAT_ON_FUNGAL * 3, 10)
		expect(hasEffect(world, at(10), 'heat')).toBe(false)

		run(world, 1)
		expect(enemy.maxHp - enemy.hp).toBeCloseTo(HEAT_ON_FUNGAL * 3, 10)
	})

	it('leaves a permanent effect alone after 600 ticks, and grows it to its last stage', () => {
		const world = makeWorld()
		writeEffect(world, at(10), 'mold')

		run(world, 600)

		const mold = effectAt(world, at(10), 'mold')
		expect(mold?.remainingTicks).toBe(-1)
		// Stage 3 of 3, advanced every 120 ticks on the world clock and then capped.
		expect(mold?.magnitude).toBe(TILE_EFFECT_DEFS.mold.stages)
	})
})

describe('two effects on one cell', () => {
	it('speeds the enemy by exactly 1.6x and burns it through the matrix in the same tick', () => {
		const world = makeWorld()
		// 0.1 * 1.6 = 0.16 of a tile, so the enemy is still on tile 10 when `tiles` runs in slot 12 --
		// speed is read before it moves and damage lands where it ended up.
		const enemy = addEnemy(world, { distance: 10, speed: 0.1 })
		writeEffect(world, at(10), 'slime')
		writeEffect(world, at(10), 'heat')

		run(world, 1)

		expect(enemy.distance - 10).toBeCloseTo(0.16, 10)
		expect(enemy.maxHp - enemy.hp).toBeCloseTo(HEAT_ON_FUNGAL, 10)
	})
})

describe('a flyer', () => {
	it('takes no heat, keeps its base speed over slime, and gains nothing from residue', () => {
		const world = makeWorld()
		const moth = addEnemy(world, { distance: 10, speed: 0.1, tags: ['air'] })
		writeEffect(world, at(10), 'heat')
		writeEffect(world, at(10), 'slime')
		writeEffect(world, at(10), 'residue')

		run(world, 1)

		// One branch, three consequences: either all three hold or the flyer check is not there.
		expect(moth.hp).toBe(moth.maxHp)
		expect(moth.distance - 10).toBeCloseTo(0.1, 10)
		expect(moth.statuses).toEqual([])
	})

	it('is the only thing between a ground enemy and the same three effects', () => {
		const world = makeWorld()
		const ant = addEnemy(world, { distance: 10, speed: 0.1, tags: ['ground'] })
		writeEffect(world, at(10), 'residue')

		run(world, 1)

		expect(ant.statuses.map(status => status.kind)).toEqual(['poison'])
		// Nothing to attribute a tile to: a cell has no source id, and `applyStatuses` takes null.
		expect(ant.statuses[0]?.sourceId).toBeNull()
	})
})

describe('the sparse array', () => {
	it('releases the cell when its last effect is cleared', () => {
		const world = makeWorld()
		writeEffect(world, at(3), 'heat')
		expect(world.tiles).toHaveLength(1)

		expect(clearEffect(world, at(3), 'heat')).toBe(true)
		// `[]`, not `[{ tile, effects: [] }]`: an empty shell would accumulate all night and land in
		// every save.
		expect(world.tiles).toEqual([])
		expect(clearEffect(world, at(3), 'heat')).toBe(false)
	})

	it('keeps the cell while another effect is still on it', () => {
		const world = makeWorld()
		writeEffect(world, at(3), 'heat')
		writeEffect(world, at(3), 'mold')

		clearEffect(world, at(3), 'heat')

		expect(world.tiles).toHaveLength(1)
		expect(tileStateAt(world, at(3))?.effects.map(effect => effect.kind)).toEqual(['mold'])
	})

	it('never grows past the three cells being written, over 600 ticks of writing and expiring', () => {
		const world = makeWorld()

		for (let index = 0; index < 600; index++) {
			// One cell rewritten constantly, one rewritten occasionally, one written once and left to
			// expire. The scan visits exactly the live cells by construction; what can genuinely drift
			// is the set growing, so that is what is measured.
			writeEffect(world, at(5), 'heat')
			if (index % 100 === 0) {
				writeEffect(world, at(6), 'residue')
				writeEffect(world, at(7), 'slime', { durationTicks: 30 })
			}

			run(world, 1)
			expect(world.tiles.length).toBeLessThanOrEqual(3)
		}

		expect(roundTrip(world)).toEqual(world)
	})

	it('finds every cell of one kind and no cell of another', () => {
		const world = makeWorld()
		writeEffect(world, at(1), 'mold')
		writeEffect(world, at(2), 'heat')
		writeEffect(world, at(3), 'mold')

		const found: number[] = []
		forEachTileWithEffect(world, 'mold', state => found.push(state.tile.x))

		expect(found).toEqual([1, 3])
	})
})

describe('an empty board', () => {
	it('is left deeply equal by the system', () => {
		const world = makeWorld()
		const before = roundTrip(world)

		tilesSystem(world)

		expect(world).toEqual(before)
	})

	it('is still empty after 600 ticks, and the system has written nothing', () => {
		const world = makeWorld()
		addEnemy(world, { distance: 10, speed: 0.05 })
		const before = roundTrip(world)

		for (let index = 0; index < 600; index++) {
			tilesSystem(world)
			world.tick++
			expect(world.tiles).toEqual([])
		}

		world.tick = before.tick
		expect(world).toEqual(before)
	})
})

describe('writing onto a cell that already has the kind', () => {
	it('refreshes heat to the longer duration and takes the newer magnitude', () => {
		const world = makeWorld()
		writeEffect(world, at(4), 'heat', { durationTicks: 120, magnitude: 1 })
		writeEffect(world, at(4), 'heat', { durationTicks: 60, magnitude: 0.5 })

		const shortened = effectAt(world, at(4), 'heat')
		expect(shortened?.remainingTicks).toBe(120)
		expect(shortened?.magnitude).toBe(0.5)

		writeEffect(world, at(4), 'heat', { durationTicks: 300, magnitude: 2 })
		expect(effectAt(world, at(4), 'heat')?.remainingTicks).toBe(300)
		expect(effectAt(world, at(4), 'heat')?.magnitude).toBe(2)

		expect(tileStateAt(world, at(4))?.effects).toHaveLength(1)
	})

	it('ignores a second mold, so a grown patch is not knocked back to stage 1', () => {
		const world = makeWorld()
		const mold = writeEffect(world, at(4), 'mold')
		if (mold === null) {
			throw new Error('expected mold to be written onto an on-board tile')
		}
		mold.magnitude = 3

		writeEffect(world, at(4), 'mold', { magnitude: 1 })

		expect(effectAt(world, at(4), 'mold')?.magnitude).toBe(3)
		expect(effectAt(world, at(4), 'mold')?.remainingTicks).toBe(-1)
	})

	it('turns a duration of 0 into one real tick, because the schema allows 0', () => {
		const world = makeWorld()
		// `TileEffectBehaviour.durationTicks` is validated `min(-1)`, so an authored 0 is legal -- and
		// an effect that exists for no ticks at all is a Burner that silently does nothing.
		expect(writeEffect(world, at(4), 'heat', { durationTicks: 0 })?.remainingTicks).toBe(1)
	})

	it('answers null off the board and writes nothing', () => {
		const world = makeWorld()

		expect(writeEffect(world, { x: -1, y: 0 }, 'heat')).toBeNull()
		expect(writeEffect(world, { x: 0, y: 4 }, 'heat')).toBeNull()
		expect(world.tiles).toEqual([])
	})
})

describe('placement over tile state', () => {
	it('refuses a molded tile with `fouled`, and takes the same tile once it is cleared', () => {
		const world = makeWorld()
		world.night.phase = 'countdown'
		world.map.flags[4] = TileFlags.BUILDABLE

		expect(canPlaceTower(world, saltShaker, at(4))).toEqual({ ok: true })

		writeEffect(world, at(4), 'mold')
		expect(blocksPlacement(world, at(4))).toBe(true)
		expect(canPlaceTower(world, saltShaker, at(4))).toEqual({ ok: false, reason: 'fouled' })

		clearEffect(world, at(4), 'mold')
		expect(canPlaceTower(world, saltShaker, at(4))).toEqual({ ok: true })
	})

	it('does not refuse a heated tile: blocking is a field on the def, not a tile having state', () => {
		const world = makeWorld()
		world.night.phase = 'countdown'
		world.map.flags[4] = TileFlags.BUILDABLE
		writeEffect(world, at(4), 'heat')

		expect(canPlaceTower(world, saltShaker, at(4))).toEqual({ ok: true })
	})

	it('strands a tower already standing on a tile that becomes molded, rather than destroying it', () => {
		const world = makeWorld()
		world.night.phase = 'countdown'
		world.map.flags[4] = TileFlags.BUILDABLE

		const tower = placeTower(world, saltShaker, at(4))
		if (tower === null) {
			throw new Error('expected the salt shaker to be placeable at 4,0')
		}

		writeEffect(world, at(4), 'mold')
		// Back to the wave, so the tick actually runs: the fixture's night id is synthetic and
		// `waveSystem` looks it up during `'countdown'`.
		world.night.phase = 'wave'
		run(world, 120)

		expect(world.towers.map(entry => entry.id)).toEqual([tower.id])
		expect(tower.hp).toBe(saltShaker.maxHp)
	})
})

describe('scorch', () => {
	it('is left on the tile under an enemy that takes fire damage, and nowhere else', () => {
		const world = makeWorld()
		const enemy = addEnemy(world, { distance: 12.4 })

		applyDamage(world, enemy, 10, 'fire')

		// 12.4 rounds to 12, which is the tile the enemy is standing on.
		expect(hasEffect(world, at(12), 'scorch')).toBe(true)
		expect(effectAt(world, at(12), 'scorch')?.remainingTicks).toBe(-1)
	})

	it('is not left by a non-fire hit', () => {
		const world = makeWorld()
		const enemy = addEnemy(world, { distance: 12 })

		applyDamage(world, enemy, 10, 'chemical')
		applyDamage(world, enemy, 10, 'physical')
		applyDamage(world, enemy, 10, 'cold')

		expect(world.tiles).toEqual([])
	})

	it('survives 600 ticks of the same enemy burning on it without a second allocation', () => {
		const world = makeWorld()
		const enemy = addEnemy(world, { distance: 12 })

		for (let index = 0; index < 600; index++) {
			applyDamage(world, enemy, 1, 'fire')
		}

		expect(world.tiles).toHaveLength(1)
		expect(tileStateAt(world, at(12))?.effects).toHaveLength(1)
	})
})
