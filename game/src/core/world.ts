/**
 * `createWorld` -- the only sanctioned way to get a `World`.
 *
 * The whole determinism guarantee narrows to this function: `(seed, mapId, nightId, difficulty)`
 * plus a command log has to reproduce a session exactly (analytic-docs/ARCHITECTURE.md section 3).
 * So the world it returns is plain data end to end -- no `Date.now()`, no `Math.random()`, no DOM,
 * nothing a `JSON.parse(JSON.stringify(w))` round-trip would lose -- and `tests/world.spec.ts`
 * asserts exactly that.
 *
 * Ids are resolved here and nowhere later. An id that does not exist throws with the id in the
 * message, which is the difference between a one-line fix and a world with `undefined` fields that
 * fails three systems into the first tick.
 */

import { FOODS, getMapDef, getNightDef } from '@/core/content/index.ts'
import { resolveDifficulty } from '@/core/content/difficulty.ts'
import { bindRng, createRngState } from '@/core/rng.ts'
import type { Rng } from '@/core/rng.ts'
import type { DefId, DifficultyId, EntityId, FoodItem, MapDef, World } from '@/core/types.ts'

/** The doc's 1.5/sec (analytic-docs/DECISIONS.md section 8), as the per-tick rate the world holds. */
const NOISE_DECAY_PER_TICK = 1.5 / 60

/**
 * Ticks per second, for the one conversion this file does: an installation authors its decay bonus
 * per second (analytic-docs/CONTENT.md section 8 says "+0.5/sec") and `core/` holds ticks. It
 * happens **here and nowhere else** -- a system dividing by 60 is a system that will one day divide
 * twice (step 13A, decision 15).
 */
const TICKS_PER_SECOND = 60

/** `18 + floor(nightIndex / 3)` items, scaled by difficulty (analytic-docs/CONTENT.md section 7). */
const BASE_FOOD_ITEMS = 18
const NIGHTS_PER_EXTRA_ITEM = 3

export interface CreateWorldOptions {
	seed: number
	mapId: DefId
	nightId: DefId
	difficulty: DifficultyId
	/**
	 * What the player's owned noise installations are worth, already **resolved into a pair of
	 * numbers** rather than passed as a list of ids -- `resolveNoiseModifiers` in
	 * `core/content/installations.ts` is what turns one into the other.
	 *
	 * Folded onto the difficulty tier once, at construction, and never read again: the world carries
	 * the numbers it was built with, so a replay of tonight is not at the mercy of a balance patch
	 * that re-prices White-noise Machine next month. Exactly what `resolveDifficulty` does, for
	 * exactly the same reason.
	 */
	noise?: { capDelta?: number; decayPerSecondDelta?: number }
}

/**
 * A deep copy of the authored map.
 *
 * The world gets its own, because night modifiers write to it: "moving day" consumes 30% of the
 * build tiles (analytic-docs/CONTENT.md section 6). Sharing the def would let one night's damage
 * leak into the next one -- and into the balance harness, which builds thousands of worlds in a
 * single process.
 *
 * **Mold is not one of those writers.** It writes `world.tiles`, not these flags -- see the note on
 * `TileFlags` in core/map.ts.
 */
function cloneMapDef(map: MapDef): MapDef {
	return {
		id: map.id,
		widthTiles: map.widthTiles,
		heightTiles: map.heightTiles,
		paths: map.paths.map(path => ({
			id: path.id,
			waypoints: path.waypoints.map(waypoint => ({ x: waypoint.x, y: waypoint.y })),
			lengthTiles: path.lengthTiles,
		})),
		trackWidthTiles: map.trackWidthTiles,
		flags: [...map.flags],
		fridge: { tile: { x: map.fridge.tile.x, y: map.fridge.tile.y }, glyph: map.fridge.glyph },
		decor: map.decor.map(entry => ({ glyph: entry.glyph, tile: { x: entry.tile.x, y: entry.tile.y } })),
	}
}

/**
 * Tonight's shelf: eighteen-odd items drawn from twelve defs, so duplicates are expected and each
 * one is its own entity with its own id.
 *
 * Drawn through `world.rng` rather than dealt in order, because which items are at risk is part of
 * what makes a night its own -- and going through the seeded generator is what keeps that
 * reproducible. The draw advances the world's rng state, so two seeds open onto different fridges.
 */
function stockFridge(rng: Rng, nightIndex: number, foodItemsMult: number, firstItemId: EntityId): FoodItem[] {
	const count = Math.round((BASE_FOOD_ITEMS + Math.floor(nightIndex / NIGHTS_PER_EXTRA_ITEM)) * foodItemsMult)
	const items: FoodItem[] = []

	for (let index = 0; index < count; index++) {
		const def = rng.pick(FOODS)
		items.push({ id: firstItemId + index, defId: def.id, nameKey: def.nameKey, heldBy: null, lost: false })
	}

	return items
}

export function createWorld({ seed, mapId, nightId, difficulty, noise }: CreateWorldOptions): World {
	const map = getMapDef(mapId)
	const night = getNightDef(nightId)
	const tier = resolveDifficulty(difficulty)

	// A night is authored for one map. Passing both is what a save record does, so the two
	// disagreeing means one of them is stale -- and the symptom would otherwise be enemies walking
	// a path the night never meant.
	if (night.mapId !== map.id) {
		throw new Error(`night '${night.id}' is authored for map '${night.mapId}', not '${map.id}'`)
	}

	// The night opens on a countdown rather than waiting to be told to start (decision 10 of
	// steps/05-waves-and-movement/B-wave-flow-and-food.md): a `'building'` phase that waits forever
	// is a night that never starts if the key handler that calls the first wave has a typo.
	const firstWave = night.waves[0]
	if (firstWave === undefined) {
		throw new Error(`night '${night.id}' has no waves`)
	}

	const rng = createRngState(seed)
	const food = stockFridge(bindRng(rng), night.index, tier.foodItemsMult, 1)

	return {
		tick: 0,
		seed,
		rng,

		enemies: [],
		towers: [],
		projectiles: [],
		crumbPiles: [],
		tiles: [],
		// Empty, and consistent with the empty arrays above. Whoever adds or removes an entity
		// keeps it that way -- see the note on `EntityIndex` in core/types.ts.
		index: { enemies: {}, towers: {}, projectiles: {}, crumbPiles: {} },
		// The food items took ids 1..food.length, and an id is never reused.
		nextEntityId: 1 + food.length,

		crumbs: tier.startingCrumbs,
		// 0, and deliberately **not** `startingCrumbs`: what the night hands you is capital, and a
		// wake on tick 1 must not take it.
		unbankedCrumbs: 0,
		groceryMoney: 0,
		noise: {
			level: 0,
			// Both deltas are additive on top of the tier, which is what makes owning two cap
			// installations worth their sum rather than the larger of them.
			cap: tier.noiseCap + (noise?.capDelta ?? 0),
			decayPerTick: NOISE_DECAY_PER_TICK + (noise?.decayPerSecondDelta ?? 0) / TICKS_PER_SECOND,
			wakeCount: 0,
		},

		map: cloneMapDef(map),
		night: {
			nightId: night.id,
			waveIndex: 0,
			waveCount: night.waves.length,
			phase: 'building',
			countdownTicks: firstWave.countdownTicks,
			wave: null,
			food,
			ticksSkippedTotal: 0,
			crumbsDropped: 0,
			crumbsCollected: 0,
			enemiesKilled: 0,
			clearedThroughWaveIndex: -1,
		},
		difficulty: tier,

		events: [],
	}
}
