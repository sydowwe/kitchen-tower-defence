import { getEnemyDef } from '@/core/content/index.ts'
import { canPlace } from '@/core/map.ts'
import { samplePath } from '@/core/path.ts'
import type { NightDef, WaveEntry } from '@/core/content/schema.ts'
import type { MapDef } from '@/core/types.ts'

/**
 * The rules `core/content/nights.ts`'s notes set every wave, as checks both `content.spec` (the
 * campaign) and `endless.spec` (the generated nights) run, so the two cannot drift into two readings
 * of one rule. Each returns the breaks it found as strings, so a failure names the entry.
 */

type Wave = NightDef['waves'][number]

/** The Vinegar Spray's range: the mold's own answer, and the shortest a mold-killing tower reaches. */
export const MOLD_REACH_TILES = 3

/**
 * The tick after the wave starts on which an entry spawns its last enemy. An entry naming no lane is
 * dealt over every lane at its own spacing, so its last enemy is the busiest lane's -- `dealRoundRobin`
 * gives lane 0 the remainder.
 */
export function lastSpawnTick(entry: WaveEntry, lanes: number): number {
	const perLane = entry.pathId === undefined ? Math.ceil(entry.count / lanes) : entry.count
	return entry.startDelayTicks + (perLane - 1) * entry.spacingTicks
}

function isThief(entry: WaveEntry): boolean {
	return getEnemyDef(entry.enemyDefId).thief !== undefined
}

function isStander(entry: WaveEntry): boolean {
	return getEnemyDef(entry.enemyDefId).speedTilesPerTick === 0
}

/**
 * At most one Mouse, one entry of count 1 down a named lane, never the whole of its wave, and the last
 * thing its wave releases -- a Mouse-only wave is five Mice for one lost Cookie Jar, and one released
 * inside the column is caught with the column.
 */
export function mouseBreaks(wave: Wave, lanes: number): string[] {
	const mice = wave.entries.filter(isThief)
	const mouse = mice[0]
	if (mouse === undefined) {
		return []
	}

	const breaks: string[] = []
	if (mice.length > 1) {
		breaks.push(`${mice.length} thief entries`)
	}
	if (mouse.count !== 1) {
		breaks.push(`a thief entry of count ${mouse.count}`)
	}
	if (mouse.pathId === undefined) {
		breaks.push('a thief naming no lane')
	}
	if (wave.entries.length === 1) {
		breaks.push('a thief alone')
	}
	for (const entry of wave.entries) {
		if (entry !== mouse && lastSpawnTick(entry, lanes) >= mouse.startDelayTicks) {
			breaks.push(
				`'${entry.enemyDefId}' spawns at ${lastSpawnTick(entry, lanes)}, after the thief's ${mouse.startDelayTicks}`,
			)
		}
	}
	return breaks
}

/**
 * One mold per entry, standing on a named lane -- nightmare rounds a 2 to a 3, and three on one tile is
 * one patch growing three times as fast -- and never a wave whose walkers and flyers are all
 * Silverfish, which a lost Cookie Jar turns into a row of 110-HP walls.
 */
export function compositionBreaks(wave: Wave): string[] {
	const breaks: string[] = []
	for (const entry of wave.entries.filter(isStander)) {
		if (entry.count !== 1) {
			breaks.push(`a '${entry.enemyDefId}' entry of count ${entry.count}`)
		}
		if (entry.pathId === undefined || entry.startDistanceTiles === undefined) {
			breaks.push(`a '${entry.enemyDefId}' with no lane or distance to stand at`)
		}
	}

	const movers = wave.entries.filter(entry => !isStander(entry) && !isThief(entry))
	if (movers.length > 0 && movers.every(entry => entry.enemyDefId === 'silverfish')) {
		breaks.push('a Silverfish-only wave')
	}
	return breaks
}

/**
 * How many tiles a tower could stand on within `MOLD_REACH_TILES` of where the entry stands, on `map`
 * -- pass the world's own map, boxes and all. 0 is a mold nobody can shoot, which is a night that never
 * ends. Null for an entry that stands nowhere.
 */
export function moldReachableTiles(map: MapDef, entry: WaveEntry): number | null {
	if (entry.startDistanceTiles === undefined) {
		return null
	}
	const path = map.paths.find(candidate => candidate.id === entry.pathId)
	if (path === undefined) {
		return 0
	}
	const at = samplePath(path, entry.startDistanceTiles)
	let reachable = 0
	for (let y = 0; y < map.heightTiles; y++) {
		for (let x = 0; x < map.widthTiles; x++) {
			if (Math.hypot(x - at.x, y - at.y) <= MOLD_REACH_TILES && canPlace(map, { x, y }, 'off_path')) {
				reachable++
			}
		}
	}
	return reachable
}
