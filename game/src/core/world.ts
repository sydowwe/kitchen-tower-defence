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

import { getMapDef, getNightDef } from '@/core/content/index.ts'
import { resolveDifficulty } from '@/core/content/difficulty.ts'
import { NO_MODIFIERS } from '@/core/content/installations.ts'
import { bindRng, createRngState } from '@/core/rng.ts'
import { drawFoodItem } from '@/core/systems/fridge.ts'
import type { Rng } from '@/core/rng.ts'
import type { DefId, DifficultyId, EntityId, FoodItem, MapDef, World, WorldModifiers } from '@/core/types.ts'

/** The doc's 1.5/sec (analytic-docs/DECISIONS.md section 8), as the per-tick rate the world holds. */
const NOISE_DECAY_PER_TICK = 1.5 / 60

/** `18 + floor(nightIndex / 3)` items, scaled by difficulty (analytic-docs/CONTENT.md section 7). */
const BASE_FOOD_ITEMS = 18
const NIGHTS_PER_EXTRA_ITEM = 3

export interface CreateWorldOptions {
	seed: number
	mapId: DefId
	nightId: DefId
	difficulty: DifficultyId
	/**
	 * What the player's owned installations are worth, already **resolved into numbers** rather than
	 * passed as a list of ids -- `resolveModifiers` in `core/content/installations.ts` is what turns
	 * one into the other. Absent is `NO_MODIFIERS`.
	 *
	 * Carried on the world as `world.modifiers`, and never re-resolved: a replay of tonight is not at
	 * the mercy of a balance patch that re-prices White-noise Machine next month. Exactly what
	 * `resolveDifficulty` does, for exactly the same reason.
	 */
	modifiers?: WorldModifiers
	/** The towers this night may place. Absent or null is any tower -- see `NightState.availableTowerIds`. */
	availableTowerIds?: DefId[] | null
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
function stockFridge(
	rng: Rng,
	nightIndex: number,
	foodItemsMult: number,
	foodBonus: number,
	firstItemId: EntityId,
): FoodItem[] {
	// The bonus after the tier's rounding: "+4 every night" is four, on any tier.
	const scaled = Math.round((BASE_FOOD_ITEMS + Math.floor(nightIndex / NIGHTS_PER_EXTRA_ITEM)) * foodItemsMult)
	const count = scaled + foodBonus
	const items: FoodItem[] = []

	for (let index = 0; index < count; index++) {
		items.push(drawFoodItem(rng, firstItemId + index))
	}

	return items
}

export function createWorld({
	seed,
	mapId,
	nightId,
	difficulty,
	modifiers = NO_MODIFIERS,
	availableTowerIds = null,
}: CreateWorldOptions): World {
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
	const food = stockFridge(bindRng(rng), night.index, tier.foodItemsMult, modifiers.foodBonus, 1)

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
		noise: {
			level: 0,
			// Folded into the meter here rather than read off `modifiers` by `noiseSystem`: cap and decay
			// are meter state the tier feeds too.
			cap: tier.noiseCap + modifiers.noiseCapDelta,
			decayPerTick: NOISE_DECAY_PER_TICK + modifiers.noiseDecayPerTickDelta,
			wakeCount: 0,
			peakLevel: 0,
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
			snackStashUsed: false,
			ticksSkippedTotal: 0,
			crumbsDropped: 0,
			crumbsCollected: 0,
			enemiesKilled: 0,
			clearedThroughWaveIndex: -1,
			// A copy, for `modifiers`' reason below.
			availableTowerIds: availableTowerIds === null ? null : [...availableTowerIds],
			pay: null,
		},
		difficulty: tier,
		// A copy, so no two worlds share the object -- the harness builds thousands in one process.
		modifiers: { ...modifiers, snackStash: modifiers.snackStash === null ? null : { ...modifiers.snackStash } },

		events: [],
	}
}
