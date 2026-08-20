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
import { createRngState } from '@/core/rng.ts'
import type { DefId, DifficultyId, MapDef, World } from '@/core/types.ts'

/** The doc's 1.5/sec (analytic-docs/DECISIONS.md section 8), as the per-tick rate the world holds. */
const NOISE_DECAY_PER_TICK = 1.5 / 60

export interface CreateWorldOptions {
	seed: number
	mapId: DefId
	nightId: DefId
	difficulty: DifficultyId
}

/**
 * A deep copy of the authored map.
 *
 * The world gets its own, because night modifiers write to it: "moving day" consumes 30% of the
 * build tiles (analytic-docs/CONTENT.md section 6) and mold permanently corrupts them (step 15).
 * Sharing the def would let one night's damage leak into the next one -- and into the balance
 * harness, which builds thousands of worlds in a single process.
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
		buildable: [...map.buildable],
		fridge: { x: map.fridge.x, y: map.fridge.y },
	}
}

export function createWorld({ seed, mapId, nightId, difficulty }: CreateWorldOptions): World {
	const map = getMapDef(mapId)
	const night = getNightDef(nightId)
	const tier = resolveDifficulty(difficulty)

	// A night is authored for one map. Passing both is what a save record does, so the two
	// disagreeing means one of them is stale -- and the symptom would otherwise be enemies walking
	// a path the night never meant.
	if (night.mapId !== map.id) {
		throw new Error(`night '${night.id}' is authored for map '${night.mapId}', not '${map.id}'`)
	}

	return {
		tick: 0,
		seed,
		rng: createRngState(seed),

		enemies: [],
		towers: [],
		projectiles: [],
		crumbPiles: [],
		tiles: [],
		// Empty, and consistent with the empty arrays above. Whoever adds or removes an entity
		// keeps it that way -- see the note on `EntityIndex` in core/types.ts.
		index: { enemies: {}, towers: {}, projectiles: {}, crumbPiles: {} },
		nextEntityId: 1,

		crumbs: tier.startingCrumbs,
		groceryMoney: 0,
		noise: { level: 0, cap: tier.noiseCap, decayPerTick: NOISE_DECAY_PER_TICK, hasFilled: false },

		map: cloneMapDef(map),
		night: {
			nightId: night.id,
			waveIndex: 0,
			waveCount: night.waves.length,
			phase: 'building',
			countdownTicks: 0,
			wave: null,
			// The fridge is stocked at night start by step 5, which owns the item pool and the
			// `18 + floor(nightIndex / 3)` count (analytic-docs/CONTENT.md section 7).
			food: [],
		},
		difficulty: tier,

		events: [],
	}
}
