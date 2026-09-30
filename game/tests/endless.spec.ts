import { describe, expect, it } from 'vitest'
import { createCommandQueue } from '@/core/commands.ts'
import {
	ENDLESS_NIGHTS,
	endlessNightId,
	ENDLESS_WAVE_COUNT,
	findNightDef,
	generateEndlessNight,
	getEnemyDef,
	getMapDef,
	getNightDef,
	isEndlessNightId,
	MAPS,
	NIGHTS,
} from '@/core/content/index.ts'
import { tick } from '@/core/sim.ts'
import { spawnSystem, startWave } from '@/core/systems/spawn.ts'
import { createWorld } from '@/core/world.ts'
import type { NightDef } from '@/core/content/schema.ts'
import type { Enemy, World } from '@/core/types.ts'
import { compositionBreaks, moldReachableTiles, mouseBreaks } from './fixtures/nightRules.ts'

/**
 * The endless nights (step 21D). **Properties, never constants**: step 21G re-tunes the curve after
 * playing runs, and nothing here should need editing when it does.
 */

const SEED = 1234

/** Every enemy some campaign night sends: what the endless pool is derived from. */
const CAMPAIGN_ENEMIES = new Set(
	NIGHTS.flatMap(night => night.waves.flatMap(wave => wave.entries.map(entry => entry.enemyDefId))),
)

type Wave = NightDef['waves'][number]

function worldFor(mapId: string): World {
	return createWorld({ seed: SEED, mapId, nightId: endlessNightId(mapId), difficulty: 'normal' })
}

/** Starts wave `index`, spawns every enemy it has, then clears the board and returns what spawned. */
function spawnOut(world: World, night: NightDef, index: number): Enemy[] {
	startWave(world, night, index)
	const spawns = world.night.wave?.spawns ?? []
	while (spawns.some(spawn => spawn.remaining > 0)) {
		spawnSystem(world)
		world.tick++
	}
	const spawned = world.enemies
	world.enemies = []
	world.index.enemies = {}
	return spawned
}

function isGroundWalker(defId: string): boolean {
	const def = getEnemyDef(defId)
	return def.tags.includes('ground') && def.speedTilesPerTick > 0
}

function isFlyer(defId: string): boolean {
	return getEnemyDef(defId).tags.includes('air')
}

function isStander(defId: string): boolean {
	return getEnemyDef(defId).speedTilesPerTick === 0
}

/** Σ count × hp × hpMult: the HP a wave puts on the board at `hpMult`, before the tier. */
function threatOf(wave: Wave): number {
	return wave.entries.reduce(
		(sum, entry) => sum + entry.count * getEnemyDef(entry.enemyDefId).hp * (entry.hpMult ?? 1),
		0,
	)
}

/** Σ count × reward: the crumbs the wave pays if every enemy in it dies. */
function incomeOf(wave: Wave): number {
	return wave.entries.reduce((sum, entry) => sum + entry.count * getEnemyDef(entry.enemyDefId).reward, 0)
}

/** The mean def HP of an enemy in these waves, by count: what the weights shift, `hpMult` aside. */
function meanDefHp(waves: readonly Wave[]): number {
	const entries = waves.flatMap(wave => wave.entries)
	const hp = entries.reduce((sum, entry) => sum + entry.count * getEnemyDef(entry.enemyDefId).hp, 0)
	const count = entries.reduce((sum, entry) => sum + entry.count, 0)
	return hp / count
}

function endlessOn(mapId: string): NightDef {
	return getNightDef(endlessNightId(mapId))
}

describe('an endless run', () => {
	it('produces valid waves for at least 100 waves, on every map', () => {
		expect(ENDLESS_WAVE_COUNT).toBeGreaterThanOrEqual(100)

		for (const map of MAPS) {
			const world = worldFor(map.id)
			const night = endlessOn(map.id)
			for (let index = 0; index < 100; index++) {
				const wave = night.waves[index]
				expect(
					wave?.entries.every(entry => entry.count >= 1),
					`${map.id} wave ${index}`,
				).toBe(true)

				let spawned: Enemy[] = []
				expect(() => {
					spawned = spawnOut(world, night, index)
				}, `${map.id} wave ${index}`).not.toThrow()

				expect(spawned.length).toBeGreaterThan(0)
				for (const enemy of spawned) {
					expect(CAMPAIGN_ENEMIES.has(enemy.defId), `${map.id} wave ${index}: '${enemy.defId}'`).toBe(true)
				}
			}
		}
	})

	it('spawns each enemy at its def HP times the wave’s hpMult, on Normal', () => {
		const world = worldFor('sink')
		const night = endlessOn('sink')
		const multOf = new Map(night.waves[60]?.entries.map(entry => [entry.enemyDefId, entry.hpMult ?? 1]))

		const spawned = spawnOut(world, night, 60)

		expect(spawned.length).toBeGreaterThan(0)
		for (const enemy of spawned) {
			const expected = getEnemyDef(enemy.defId).hp * (multOf.get(enemy.defId) ?? Number.NaN)
			expect(enemy.hp).toBeCloseTo(expected, 10)
			expect(enemy.maxHp).toBeCloseTo(expected, 10)
		}
		// Wave 60 is tougher than its defs: the multiplier is doing something.
		expect(spawned.every(enemy => enemy.hp > getEnemyDef(enemy.defId).hp)).toBe(true)
	})

	it('builds a world that ticks a thousand times and survives a JSON round-trip', () => {
		for (const map of MAPS) {
			const world = worldFor(map.id)
			const queue = createCommandQueue()
			for (let i = 0; i < 1000; i++) {
				tick(world, queue)
			}

			expect(world.tick).toBe(1000)
			expect(world.enemies.length).toBeGreaterThan(0)
			expect(JSON.parse(JSON.stringify(world))).toEqual(world)
		}
	})
})

describe('the endless waves are not degenerate', () => {
	it('puts a ground walker in every wave, so none is all flyers or all molds', () => {
		for (const night of ENDLESS_NIGHTS) {
			night.waves.forEach((wave, index) => {
				const ids = wave.entries.map(entry => entry.enemyDefId)
				expect(ids.some(isGroundWalker), `${night.id} wave ${index}`).toBe(true)
				expect(ids.every(isFlyer)).toBe(false)
				expect(ids.every(isStander)).toBe(false)
			})
		}
	})

	it('holds at least 3 kinds of enemy in every window of 10 waves', () => {
		for (const night of ENDLESS_NIGHTS) {
			for (let start = 0; start + 10 <= night.waves.length; start++) {
				const kinds = new Set(
					night.waves.slice(start, start + 10).flatMap(wave => wave.entries.map(entry => entry.enemyDefId)),
				)
				expect(kinds.size, `${night.id} waves ${start}-${start + 9}`).toBeGreaterThanOrEqual(3)
			}
		}
	})

	it('leans toward the tougher defs as the run goes on', () => {
		for (const night of ENDLESS_NIGHTS) {
			expect(meanDefHp(night.waves.slice(90, 100)), night.id).toBeGreaterThan(meanDefHp(night.waves.slice(0, 10)))
		}
	})

	it('grows its threat faster than its income, so the run ends', () => {
		for (const night of ENDLESS_NIGHTS) {
			const early = night.waves[10]
			const late = night.waves[100]
			expect(early).toBeDefined()
			expect(late).toBeDefined()
			if (early === undefined || late === undefined) {
				continue
			}
			expect(threatOf(late) / incomeOf(late), night.id).toBeGreaterThan(threatOf(early) / incomeOf(early))
			expect(threatOf(late)).toBeGreaterThan(threatOf(early))
		}
	})
})

describe('the campaign’s rules, on every endless wave', () => {
	it('releases a Mouse last, alone in its entry and never alone in its wave', () => {
		for (const night of ENDLESS_NIGHTS) {
			const lanes = getMapDef(night.mapId).paths.length
			night.waves.forEach((wave, index) => {
				expect(mouseBreaks(wave, lanes), `${night.id} wave ${index}`).toEqual([])
			})
		}
	})

	it('sends no Mouse in the first five waves, and does send one somewhere', () => {
		for (const night of ENDLESS_NIGHTS) {
			const miceAt = night.waves.flatMap((wave, index) =>
				wave.entries.some(entry => getEnemyDef(entry.enemyDefId).thief !== undefined) ? [index] : [],
			)
			expect(miceAt.length, night.id).toBeGreaterThan(0)
			expect(Math.min(...miceAt)).toBeGreaterThanOrEqual(5)
		}
	})

	it('stands one mold per entry, and never sends a Silverfish-only wave', () => {
		for (const night of ENDLESS_NIGHTS) {
			night.waves.forEach((wave, index) => {
				expect(compositionBreaks(wave), `${night.id} wave ${index}`).toEqual([])
			})
		}
	})

	it('stands every mold where a tower on its own map can reach it', () => {
		for (const night of ENDLESS_NIGHTS) {
			const map = getMapDef(night.mapId)
			let molds = 0
			for (const entry of night.waves.flatMap(wave => wave.entries)) {
				const reachable = moldReachableTiles(map, entry)
				if (reachable !== null) {
					molds++
					expect(
						reachable,
						`${night.id}: a mold ${entry.startDistanceTiles} along '${entry.pathId}'`,
					).toBeGreaterThan(0)
				}
			}
			expect(molds, night.id).toBeGreaterThan(0)
		}
	})
})

describe('generating the endless nights', () => {
	it('is deterministic in the map, and two maps meet different waves', () => {
		for (const map of MAPS) {
			const once = generateEndlessNight(map)
			expect(generateEndlessNight(map)).toEqual(once)
			expect(once).toEqual(endlessOn(map.id))
		}

		expect(endlessOn('sink').waves).not.toEqual(endlessOn('pantry').waves)
		expect(endlessOn('counter').waves).not.toEqual(endlessOn('table').waves)
	})

	it('makes one night per map, in MAPS order, named after it', () => {
		expect(ENDLESS_NIGHTS.map(night => night.mapId)).toEqual(MAPS.map(map => map.id))
		expect(ENDLESS_NIGHTS.map(night => night.id)).toEqual(MAPS.map(map => endlessNightId(map.id)))
		expect(endlessNightId('sink')).toBe('endlessSink')
		expect(ENDLESS_NIGHTS.every(night => night.waves.length === ENDLESS_WAVE_COUNT)).toBe(true)
	})

	it('is the night after the campaign, with no unlock and no modifier', () => {
		const lastCampaignIndex = Math.max(...NIGHTS.map(night => night.index))
		for (const night of ENDLESS_NIGHTS) {
			expect(night.index).toBe(lastCampaignIndex + 1)
			expect(night.unlocksTowerIds).toBeUndefined()
			expect(night.modifierId).toBeUndefined()
		}
	})
})

describe('resolving a night id', () => {
	it('resolves every endless id through getNightDef, and still throws on an unknown one', () => {
		for (const night of ENDLESS_NIGHTS) {
			expect(getNightDef(night.id)).toBe(night)
			expect(isEndlessNightId(night.id)).toBe(true)
		}
		expect(() => getNightDef('endlessAttic')).toThrow(/endlessAttic/)
		expect(isEndlessNightId('night01')).toBe(false)
	})

	it('answers null from findNightDef for a night no array holds', () => {
		expect(findNightDef('test')).toBeNull()
		expect(findNightDef('night01')).toBe(NIGHTS[0])
		expect(findNightDef('endlessSink')).toBe(endlessOn('sink'))
	})

	it('keeps the endless nights out of the campaign', () => {
		expect(NIGHTS).toHaveLength(18)
		expect(NIGHTS.some(night => isEndlessNightId(night.id))).toBe(false)
	})
})
