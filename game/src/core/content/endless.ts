/**
 * The endless nights: one per map, each a plain `NightDef` that `getNightDef` resolves like any other,
 * so every system that plays a night plays this one and none of them knows it is endless.
 *
 * **Not in `NIGHTS`.** The campaign walks that array by position -- Continue, the unlocked towers, the
 * previous loadout -- and an endless night in it would be night 19.
 *
 * **Deterministic in the map alone.** The generator's rng is opened from a hash of the map id, so every
 * run on a map meets the same waves: a best on the Sink compares like with like, and a replay needs no
 * seed beyond the world's, which still decides the shelf and every roll made during the night.
 *
 * Wave `n` draws from every enemy some campaign night sends (the pool is derived from `NIGHTS`, never
 * listed), weighted toward the higher-HP defs as `n` grows. HP and count rise smoothly and income only
 * with the count, so the run ends -- that is the point, and surviving all `ENDLESS_WAVE_COUNT` waves is
 * a win. The campaign's rules hold on every wave: see `moverEntries`, `moldEntry` and `mouseEntry`.
 *
 * **Imports the leaves, never `core/content/index.ts`**: that file imports this one, and the cycle
 * would leave `ENDLESS_NIGHTS` undefined while it evaluates.
 */

import { ENEMIES } from '@/core/content/enemies.ts'
import { MAPS } from '@/core/content/maps/index.ts'
import { NIGHTS } from '@/core/content/nights.ts'
import { canPlace } from '@/core/map.ts'
import { samplePath } from '@/core/path.ts'
import { createRng } from '@/core/rng.ts'
import type { EnemyDef, NightDef, WaveEntry } from '@/core/content/schema.ts'
import type { Rng } from '@/core/rng.ts'
import type { DefId, MapDef } from '@/core/types.ts'

/** Far past where a run ends. */
export const ENDLESS_WAVE_COUNT = 200

/**
 * The night after the campaign's last: `createWorld` stocks `18 + floor(19 / 3)` items for it, and
 * `scoring.ts` computes a pay nothing pays out.
 */
const ENDLESS_NIGHT_INDEX = NIGHTS.length + 1

// --- the schema's bounds ---------------------------------------------------------------------------
// Restated rather than imported: `schema.ts` is dev-only and must stay tree-shakeable. The boot check
// runs zod over every wave below, so a value past one of these is a dev crash of the whole app at
// module load. Everything is clamped to them here.

const MAX_ENTRY_COUNT = 500
const MAX_WAVE_DELAY_TICKS = 7200

// --- the curve ---------------------------------------------------------------------------------------
// **A draft, written from arithmetic, not from play.** Step 21G re-tunes every number here after
// playing runs, and `tests/endless.spec.ts` pins properties rather than any of these constants.
//
// A wave is a budget of HP at `hpMult` 1, split over its kinds. Wave 0's 700 is about night 12's
// opening wave, below night 18's ~1150, because the run starts from the tier's starting crumbs with an
// empty board. The budget grows by 3.5% of wave 0's a wave and so does the income (it is bought
// enemy by enemy at each def's own `reward`); `hpMult` grows by 3% a wave on top, and income never
// sees it. Threat is their product, so it outgrows income: wave 30 pays about one and a half times
// wave 0's crumbs (less than the budget's 2x, because the draw has leaned toward defs with more HP per
// crumb) and carries about four times its HP. `hpMult` reaches 6.97 at wave 199.

const BASE_BUDGET_HP = 700
const BUDGET_GROWTH_PER_WAVE = 0.035
const HP_MULT_GROWTH_PER_WAVE = 0.03

/**
 * Kinds per wave, a lead walker included: 3, and one more every 25 waves up to the whole pool. The
 * lead takes 40% of the budget and the rest share the remainder evenly.
 */
const BASE_KINDS = 3
const WAVES_PER_EXTRA_KIND = 25
const LEAD_SHARE = 0.4

/**
 * How hard the draw leans on HP: a def's weight is `(hp / lightest hp) ^ tilt`. -0.5 at wave 0 favours
 * the Ant three to one over the Silverfish; +1.5 by wave 100 favours the Silverfish thirty-six to one.
 */
const TILT_START = -0.5
const TILT_PER_WAVE = 0.02
const TILT_MAX = 1.5

/**
 * The file's pacing rule (`core/content/nights.ts`): a wave spawns over about as long as the gap after
 * it. The lead streams for 14 seconds and the others join up to 6 seconds in; the count grows inside the
 * same window, which is what tightens the spacing. The opening is longer than the campaign's six
 * seconds because it is also the gap after wave 1, and wave 1 here is a night-12 wave.
 */
const SPAWN_WINDOW_TICKS = 14 * 60
const MAX_STAGGER_TICKS = 6 * 60
const COUNTDOWN_TICKS = 8 * 60
const OPENING_TICKS = 10 * 60

/** A single enemy's entry has no second spawn, so its spacing is never read; one second is the file's. */
const SINGLE_SPACING_TICKS = 60

/**
 * Molds from wave 5, one at a time and not every wave: two in five. Mold is permanent, and night 11's
 * note measured twelve over eleven waves as what an ignored night can stand.
 */
const FIRST_MOLD_WAVE = 4
const MOLD_CHANCE = 0.4

/**
 * **The reach a mold spot has to be in: 3 tiles**, the Vinegar Spray's range and the shortest a
 * mold-killing tower reaches -- the same reach `tests/content.spec.ts` holds the campaign's molds to. A
 * spot is kept when some tile a tower can stand on is within it. Spots are sampled every half-tile,
 * never inside the first 3 tiles of a lane (the crack) or the last 4 (under the fridge's shelf).
 */
const MOLD_REACH_TILES = 3
const MOLD_SAMPLE_STEP_TILES = 0.5
const MOLD_MIN_TILES = 3
const MOLD_FRIDGE_CLEARANCE_TILES = 4

/**
 * A thief from wave 11, one in five waves, never two: the warning needs waves in front of it. Released
 * two seconds after every other entry's last spawn, down one named lane.
 */
const FIRST_THIEF_WAVE = 10
const THIEF_CHANCE = 0.2
const THIEF_GAP_TICKS = 2 * 60

// --- the pool ----------------------------------------------------------------------------------------

/**
 * Every enemy some campaign night sends, in roster order. The Fruit Fly is out (no night schedules
 * it), and an enemy a later step schedules is in without a line here.
 */
function scheduledEnemies(): EnemyDef[] {
	const scheduled = new Set(
		NIGHTS.flatMap(night => night.waves.flatMap(wave => wave.entries.map(entry => entry.enemyDefId))),
	)
	return ENEMIES.filter(def => scheduled.has(def.id))
}

const POOL = scheduledEnemies()

function isFlyerDef(def: EnemyDef): boolean {
	return def.tags.includes('air')
}

/** Streams down every lane: walkers and flyers. The mold stands and the thief is released last. */
const MOVERS = POOL.filter(def => def.speedTilesPerTick > 0 && def.thief === undefined)
/** What leads a wave, so every wave has one on the ground. */
const WALKERS = MOVERS.filter(def => !isFlyerDef(def))
const STANDERS = POOL.filter(def => def.speedTilesPerTick === 0)
const THIEVES = POOL.filter(def => def.thief !== undefined)

const LIGHTEST_HP = Math.min(...MOVERS.map(def => def.hp))

// --- ids ---------------------------------------------------------------------------------------------

/** `endlessSink` for `sink`. */
export function endlessNightId(mapId: DefId): DefId {
	return `endless${mapId.charAt(0).toUpperCase()}${mapId.slice(1)}`
}

/** FNV-1a: the map id as the generator's seed, so a map's waves are its own and nobody else's. */
function hashString(text: string): number {
	let hash = 0x811c9dc5
	for (let index = 0; index < text.length; index++) {
		hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193)
	}
	return hash | 0
}

// --- the generator -----------------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value))
}

/** Three decimals: a readable number in a dump, and nothing the curve could feel. */
function round3(value: number): number {
	return Math.round(value * 1000) / 1000
}

function hpMultAt(waveIndex: number): number {
	return round3(1 + HP_MULT_GROWTH_PER_WAVE * waveIndex)
}

function budgetAt(waveIndex: number): number {
	return BASE_BUDGET_HP * (1 + BUDGET_GROWTH_PER_WAVE * waveIndex)
}

function weightAt(def: EnemyDef, waveIndex: number): number {
	const tilt = Math.min(TILT_MAX, TILT_START + TILT_PER_WAVE * waveIndex)
	return (def.hp / LIGHTEST_HP) ** tilt
}

/** One of `candidates`, drawn by weight. Throws on an empty list, like `rng.pick`. */
function pickWeighted(rng: Rng, candidates: readonly EnemyDef[], waveIndex: number): EnemyDef {
	const weights = candidates.map(def => weightAt(def, waveIndex))
	let roll = rng.next() * weights.reduce((sum, weight) => sum + weight, 0)
	for (const [index, def] of candidates.entries()) {
		roll -= weights[index] ?? 0
		if (roll < 0) {
			return def
		}
	}
	const last = candidates[candidates.length - 1]
	if (last === undefined) {
		throw new RangeError('endless: cannot draw from an empty pool')
	}
	return last
}

/**
 * The spawn the entry's busiest lane makes last, in ticks after the wave starts. An entry naming no
 * lane is dealt round-robin, and lane 0 gets the remainder.
 */
function lastSpawnTick(entry: WaveEntry, lanes: number): number {
	const perLane = entry.pathId === undefined ? Math.ceil(entry.count / lanes) : entry.count
	return entry.startDelayTicks + (perLane - 1) * entry.spacingTicks
}

/**
 * The walkers and flyers: a lead walker first, then the rest of the wave's kinds, each streamed down
 * every lane (no `pathId`, so `startWave` deals it round-robin). Spacing is per lane, and fits the
 * entry's share of the window.
 */
function moverEntries(rng: Rng, waveIndex: number, lanes: number, hpMult: number): WaveEntry[] {
	const kinds = Math.min(MOVERS.length, BASE_KINDS + Math.floor(waveIndex / WAVES_PER_EXTRA_KIND))
	const lead = pickWeighted(rng, WALKERS, waveIndex)
	const chosen = [lead]
	while (chosen.length < kinds) {
		chosen.push(
			pickWeighted(
				rng,
				MOVERS.filter(def => !chosen.includes(def)),
				waveIndex,
			),
		)
	}

	const budget = budgetAt(waveIndex)
	const restShare = chosen.length > 1 ? (budget * (1 - LEAD_SHARE)) / (chosen.length - 1) : 0

	return chosen.map((def, index) => {
		const share = index === 0 ? budget * LEAD_SHARE : restShare
		const count = clamp(Math.round(share / def.hp), 1, MAX_ENTRY_COUNT)
		const startDelayTicks = index === 0 ? 0 : rng.int(MAX_STAGGER_TICKS + 1)
		const perLane = Math.ceil(count / lanes)
		const spacingTicks =
			perLane > 1
				? clamp(Math.floor((SPAWN_WINDOW_TICKS - startDelayTicks) / (perLane - 1)), 1, MAX_WAVE_DELAY_TICKS)
				: SINGLE_SPACING_TICKS
		return { enemyDefId: def.id, count, spacingTicks, startDelayTicks, hpMult }
	})
}

/** A place a mold can stand: a lane and a distance along it. */
interface MoldSpot {
	pathId: DefId
	distanceTiles: number
}

/**
 * Every distance, on every lane, where some tile a tower can stand on is within `MOLD_REACH_TILES`. A
 * mold nobody can shoot eats the board for the rest of the run.
 */
function moldSpotsOn(map: MapDef): MoldSpot[] {
	const spots: MoldSpot[] = []
	for (const path of map.paths) {
		const last = path.lengthTiles - MOLD_FRIDGE_CLEARANCE_TILES
		for (let distance = MOLD_MIN_TILES; distance <= last; distance += MOLD_SAMPLE_STEP_TILES) {
			if (inReachOfBuildSpace(map, samplePath(path, distance))) {
				spots.push({ pathId: path.id, distanceTiles: distance })
			}
		}
	}
	return spots
}

function inReachOfBuildSpace(map: MapDef, at: { x: number; y: number }): boolean {
	const minX = Math.max(0, Math.floor(at.x - MOLD_REACH_TILES))
	const maxX = Math.min(map.widthTiles - 1, Math.ceil(at.x + MOLD_REACH_TILES))
	const minY = Math.max(0, Math.floor(at.y - MOLD_REACH_TILES))
	const maxY = Math.min(map.heightTiles - 1, Math.ceil(at.y + MOLD_REACH_TILES))
	for (let y = minY; y <= maxY; y++) {
		for (let x = minX; x <= maxX; x++) {
			if (Math.hypot(x - at.x, y - at.y) <= MOLD_REACH_TILES && canPlace(map, { x, y }, 'off_path')) {
				return true
			}
		}
	}
	return false
}

/** One mold, count 1, on a computed spot and a named lane, some time inside the wave's window. */
function moldEntry(rng: Rng, def: EnemyDef, spots: readonly MoldSpot[], hpMult: number): WaveEntry {
	const spot = rng.pick(spots)
	return {
		enemyDefId: def.id,
		count: 1,
		spacingTicks: SINGLE_SPACING_TICKS,
		startDelayTicks: rng.int(SPAWN_WINDOW_TICKS + 1),
		pathId: spot.pathId,
		startDistanceTiles: spot.distanceTiles,
		hpMult,
	}
}

/** One thief, count 1, down a named lane, after every other entry's last spawn. */
function mouseEntry(rng: Rng, def: EnemyDef, map: MapDef, others: readonly WaveEntry[], hpMult: number): WaveEntry {
	const lanes = map.paths.length
	const releasedAfter = Math.max(...others.map(entry => lastSpawnTick(entry, lanes)))
	return {
		enemyDefId: def.id,
		count: 1,
		spacingTicks: SINGLE_SPACING_TICKS,
		startDelayTicks: Math.min(MAX_WAVE_DELAY_TICKS, releasedAfter + THIEF_GAP_TICKS),
		pathId: rng.pick(map.paths).id,
		hpMult,
	}
}

/** The endless night on `map`. Pure in the map: calling it twice returns two deep-equal nights. */
export function generateEndlessNight(map: MapDef): NightDef {
	const rng = createRng(hashString(`endless:${map.id}`))
	const lanes = map.paths.length
	const spots = moldSpotsOn(map)
	const waves: NightDef['waves'] = []

	for (let waveIndex = 0; waveIndex < ENDLESS_WAVE_COUNT; waveIndex++) {
		const hpMult = hpMultAt(waveIndex)
		const entries = moverEntries(rng, waveIndex, lanes, hpMult)

		const stander = STANDERS[0]
		if (stander !== undefined && spots.length > 0 && waveIndex >= FIRST_MOLD_WAVE && rng.chance(MOLD_CHANCE)) {
			entries.push(moldEntry(rng, stander, spots, hpMult))
		}

		const thief = THIEVES[0]
		if (thief !== undefined && waveIndex >= FIRST_THIEF_WAVE && rng.chance(THIEF_CHANCE)) {
			entries.push(mouseEntry(rng, thief, map, entries, hpMult))
		}

		waves.push({ entries, countdownTicks: waveIndex === 0 ? OPENING_TICKS : COUNTDOWN_TICKS })
	}

	return { id: endlessNightId(map.id), index: ENDLESS_NIGHT_INDEX, mapId: map.id, waves }
}

/** One per map, in `MAPS` order. */
export const ENDLESS_NIGHTS: NightDef[] = MAPS.map(generateEndlessNight)

export function isEndlessNightId(id: DefId): boolean {
	return ENDLESS_NIGHTS.some(night => night.id === id)
}
