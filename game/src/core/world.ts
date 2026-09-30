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

import { getMapDef, getNightDef, getTowerDef } from '@/core/content/index.ts'
import { resolveDifficulty } from '@/core/content/difficulty.ts'
import { copyModifiers, NO_MODIFIERS } from '@/core/content/installations.ts'
import { applyNightModifier, getNightModifierDef } from '@/core/content/modifiers.ts'
import { canPlace, TileFlags } from '@/core/map.ts'
import { samplePath } from '@/core/path.ts'
import { bindRng, createRng, createRngState } from '@/core/rng.ts'
import { dropCrumb, MERGE_RADIUS_TILES } from '@/core/systems/crumbs.ts'
import { drawFoodItem } from '@/core/systems/fridge.ts'
import type { NightModifierEffect } from '@/core/content/modifiers.ts'
import type { NightModifierDef } from '@/core/content/schema.ts'
import type { Rng } from '@/core/rng.ts'
import type { DefId, DifficultyId, EntityId, FoodItem, MapDef, Vec2, World, WorldModifiers } from '@/core/types.ts'

/** The doc's 1.5/sec (analytic-docs/DECISIONS.md section 8), as the per-tick rate the world holds. */
const NOISE_DECAY_PER_TICK = 1.5 / 60

/** `18 + floor(nightIndex / 3)` items, scaled by difficulty (analytic-docs/CONTENT.md section 7). */
const BASE_FOOD_ITEMS = 18
const NIGHTS_PER_EXTRA_ITEM = 3

/**
 * What a night modifier's board effects draw from: a generator per effect kind, opened on the seed and
 * salted. **Never `world.rng`, and never a `fork()` of it** (which writes `rng.forks`): the world's own
 * stream stays exactly what it would have been without the modifier, so every Weevil window and
 * `RANDOM` target that night is untouched by it.
 */
const BOARD_SALTS = { scatterCrumbs: 0x5ca77e40, boxes: 0x00b0c5e5 } as const

/**
 * Scattered piles stand at least this far apart: clear of `MERGE_RADIUS_TILES`, so none merge, and far
 * enough that fifteen read as fifteen rather than as a few clumps.
 */
const SCATTER_SPACING_TILES = Math.max(1, MERGE_RADIUS_TILES)

/** Draws per pile before a map is declared too small for its scatter. */
const SCATTER_ATTEMPTS_PER_PILE = 100

export interface CreateWorldOptions {
	seed: number
	mapId: DefId
	nightId: DefId
	difficulty: DifficultyId
	/**
	 * What the player's owned installations are worth, already **resolved into numbers** rather than
	 * passed as a list of ids -- `resolveModifiers` in `core/content/installations.ts` is what turns
	 * one into the other. Absent is `NO_MODIFIERS`. The night's own modifier, if it names one, is folded
	 * over this here, and is never passed in.
	 *
	 * Carried on the world as `world.modifiers`, and never re-resolved: a replay of tonight is not at
	 * the mercy of a balance patch that re-prices White-noise Machine next month. Exactly what
	 * `resolveDifficulty` does, for exactly the same reason.
	 */
	modifiers?: WorldModifiers
	/**
	 * The towers brought tonight. Absent or null is any tower -- see `NightState.loadout`. A list is
	 * checked for being a list of towers, not for fitting the counter: how many slots a campaign has is
	 * `core/campaign.ts`'s rule, and a dev panel builds worlds with modifiers that aren't the progress's.
	 */
	loadout?: DefId[] | null
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

/** A copy of a non-null loadout, refused when it is empty, names a tower twice, or names no tower. */
function copyLoadout(loadout: DefId[]): DefId[] {
	if (loadout.length === 0) {
		throw new Error('a loadout names no towers: pass null for any tower')
	}
	if (new Set(loadout).size !== loadout.length) {
		throw new Error(`a loadout names a tower twice: ${loadout.join(', ')}`)
	}
	for (const id of loadout) {
		getTowerDef(id)
	}
	return [...loadout]
}

/** A point on the lanes, uniform over their combined length, so a short lane is no denser than a long one. */
function pointOnLanes(map: MapDef, rng: Rng): Vec2 {
	const total = map.paths.reduce((sum, path) => sum + path.lengthTiles, 0)
	let along = rng.next() * total
	for (const path of map.paths) {
		if (along <= path.lengthTiles) {
			const at = samplePath(path, along)
			return { x: at.x, y: at.y }
		}
		along -= path.lengthTiles
	}
	throw new Error(`map '${map.id}' has no lanes to scatter on`)
}

/**
 * Dishes left out: `piles` piles of `value` on the lanes at tick 0, through `dropCrumb` -- the one door
 * onto the floor, so they count in `crumbsDropped` and leaving them is a dirty kitchen. They rot from
 * tick 0 like any pile.
 *
 * Spaced against `world.crumbPiles` itself rather than against the draws, so a lane doubling back past
 * itself or two lanes side by side cannot merge two of them either. A map with no room throws: the
 * silent version is a night that scatters fewer than it says.
 */
function scatterCrumbs(world: World, piles: number, value: number, rng: Rng): void {
	const spacingSquared = SCATTER_SPACING_TILES * SCATTER_SPACING_TILES

	for (let attempts = 0; world.crumbPiles.length < piles; attempts++) {
		if (attempts >= piles * SCATTER_ATTEMPTS_PER_PILE) {
			throw new Error(`map '${world.map.id}' has no room on its lanes for ${piles} scattered piles`)
		}
		const at = pointOnLanes(world.map, rng)
		const crowded = world.crumbPiles.some(pile => {
			const dx = pile.position.x - at.x
			const dy = pile.position.y - at.y
			return dx * dx + dy * dy < spacingSquared
		})
		if (!crowded) {
			dropCrumb(world, at, value)
		}
	}
}

/**
 * Moving day: boxes on `round(fraction x n)` of the n tiles a tower could stand on, picked without
 * replacement. Never track -- a box on a lane would sit in a barricade's slot and in the enemies' way.
 *
 * A boxed tile becomes `DECOR` in the world's own copy of the flags and gets a decor entry, so the
 * terrain bake draws it and `canPlace`, the ghost and the refusal toast all say no with nothing new.
 */
function placeBoxes(world: World, fraction: number, glyph: string, rng: Rng): void {
	const map = world.map
	const free: Vec2[] = []
	for (let y = 0; y < map.heightTiles; y++) {
		for (let x = 0; x < map.widthTiles; x++) {
			if (canPlace(map, { x, y }, 'off_path')) {
				free.push({ x, y })
			}
		}
	}

	const count = Math.round(fraction * free.length)
	for (let picked = 0; picked < count; picked++) {
		// A partial Fisher-Yates: the pick is swapped to the front, out of the rest's way.
		const swap = picked + rng.int(free.length - picked)
		const tile = free[swap]
		const displaced = free[picked]
		if (tile === undefined || displaced === undefined) {
			continue
		}
		free[swap] = displaced
		free[picked] = tile

		const index = tile.y * map.widthTiles + tile.x
		map.flags[index] = ((map.flags[index] ?? 0) & ~TileFlags.BUILDABLE) | TileFlags.DECOR
		map.decor.push({ glyph, tile: { x: tile.x, y: tile.y } })
	}
}

/**
 * A night modifier's things, built onto a world that is otherwise finished. Its numbers are already in
 * `world.modifiers`: those kinds build nothing here.
 */
function buildOnBoard(world: World, def: NightModifierDef): void {
	for (const effect of def.effects) {
		buildEffect(world, effect)
	}
}

function buildEffect(world: World, effect: NightModifierEffect): void {
	switch (effect.kind) {
		case 'scatterCrumbs':
			scatterCrumbs(world, effect.piles, effect.value, createRng(world.seed ^ BOARD_SALTS.scatterCrumbs))
			break
		case 'boxes':
			placeBoxes(world, effect.fraction, effect.glyph, createRng(world.seed ^ BOARD_SALTS.boxes))
			break
		case 'spreadRate':
		case 'enemyCount':
		case 'crumbValue':
		case 'damageType':
			break
		default: {
			// A new kind fails `type-check` here as well as in `applyNightModifier`.
			const unbuilt: never = effect
			throw new Error(`a night modifier effect createWorld does not know: ${String(unbuilt)}`)
		}
	}
}

export function createWorld({
	seed,
	mapId,
	nightId,
	difficulty,
	modifiers = NO_MODIFIERS,
	loadout = null,
}: CreateWorldOptions): World {
	const map = getMapDef(mapId)
	const night = getNightDef(nightId)
	const tier = resolveDifficulty(difficulty)
	// A copy, for `modifiers`' reason below.
	const brought = loadout === null ? null : copyLoadout(loadout)

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

	// **The night brings its modifier, and the options bring the installations.** A modifier passed in
	// beside the night could disagree with it, and the save and the harness both build tonight from its
	// id. Folded into a copy either way, so no two worlds share an object -- the harness builds
	// thousands in one process.
	const tonight = night.modifierId === undefined ? null : getNightModifierDef(night.modifierId)
	const folded = tonight === null ? copyModifiers(modifiers) : applyNightModifier(modifiers, tonight)

	const rng = createRngState(seed)
	const food = stockFridge(bindRng(rng), night.index, tier.foodItemsMult, folded.foodBonus, 1)

	const world: World = {
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
			cap: tier.noiseCap + folded.noiseCapDelta,
			decayPerTick: NOISE_DECAY_PER_TICK + folded.noiseDecayPerTickDelta,
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
			loadout: brought,
			modifierId: tonight === null ? null : tonight.id,
			pay: null,
		},
		difficulty: tier,
		modifiers: folded,

		events: [],
	}

	// After the shelf, and off generators of their own: see `BOARD_SALTS`.
	if (tonight !== null) {
		buildOnBoard(world, tonight)
	}

	return world
}
