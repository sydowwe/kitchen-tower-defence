/**
 * Turning an authored wave into enemies on the track.
 *
 * Two halves that never run in the same place: `startWave` translates a `NightDef`'s composition
 * into the `WaveSpawn` cursors the world carries, once; `spawnSystem` reads those cursors every
 * tick and puts one enemy per entry on the board when its clock comes round.
 *
 * **Nothing here decides when a wave begins or ends.** Step 5B owns the countdown, the "wave
 * cleared" test and the removal of an enemy that reaches the fridge -- this file only fills the
 * board.
 */

import { getEnemyDef } from '@/core/content/index.ts'
import type { EnemyDef, NightDef } from '@/core/content/schema.ts'
import type { Enemy, WaveSpawn, World } from '@/core/types.ts'

/**
 * How many of `count` each lane gets, dealt round-robin: 5 over 2 paths is 3 and 2.
 *
 * Lanes that would get nothing are dropped rather than carried as an empty cursor -- a `remaining`
 * of 0 is indistinguishable from a finished entry, and 5B counts unfinished cursors.
 */
function dealRoundRobin(count: number, lanes: number): number[] {
	const shares: number[] = []
	for (let i = 0; i < lanes; i++) {
		const share = Math.floor(count / lanes) + (i < count % lanes ? 1 : 0)
		if (share > 0) {
			shares.push(share)
		}
	}
	return shares
}

/**
 * Builds `world.night.wave` from `night.waves[waveIndex]` and moves the night into `'wave'`.
 *
 * The night is passed in rather than looked up from `world.night.nightId`, so a test -- and the
 * balance harness -- can drive a synthetic night without registering it in `NIGHTS`.
 *
 * **Difficulty is applied here, to copies.** `count` is rounded rather than floored: cozy's 0.85
 * would otherwise delete a one-enemy entry outright, and the `max(1)` is the belt to that brace.
 * HP is scaled at spawn instead (see `spawnEnemy`) and left unrounded.
 */
export function startWave(world: World, night: NightDef, waveIndex: number): void {
	const composition = night.waves[waveIndex]
	if (composition === undefined) {
		throw new Error(`night '${night.id}' has no wave ${waveIndex}; it has ${night.waves.length}`)
	}

	const spawns: WaveSpawn[] = []

	for (const entry of composition.entries) {
		const count = Math.max(1, Math.round(entry.count * world.difficulty.enemyCountMult))
		const nextSpawnTick = world.tick + entry.startDelayTicks

		if (entry.pathId === undefined) {
			// No lane named: spread the entry over every lane on the map, keeping its spacing. The
			// Counter has one path, so this is a no-op until the first two-lane map at night 10.
			const paths = world.map.paths
			dealRoundRobin(count, paths.length).forEach((share, index) => {
				const path = paths[index]
				if (path !== undefined) {
					spawns.push({
						enemyDefId: entry.enemyDefId,
						remaining: share,
						nextSpawnTick,
						spacingTicks: entry.spacingTicks,
						pathId: path.id,
					})
				}
			})
			continue
		}

		// The silent version of this spawns nothing, and the symptom is a night that never ends.
		if (!world.map.paths.some(path => path.id === entry.pathId)) {
			throw new Error(
				`night '${night.id}' wave ${waveIndex} names path '${entry.pathId}', which map '${world.map.id}' does not have`,
			)
		}

		spawns.push({
			enemyDefId: entry.enemyDefId,
			remaining: count,
			nextSpawnTick,
			spacingTicks: entry.spacingTicks,
			pathId: entry.pathId,
		})
	}

	world.night.waveIndex = waveIndex
	world.night.wave = { index: waveIndex, spawns, startedAtTick: world.tick }
	world.night.phase = 'wave'
	world.events.push({ kind: 'waveStarted', waveIndex })
}

/**
 * The one constructor for an `Enemy`, anywhere it comes from: a wave puts one at `distance: 0`, and
 * step 7B's crumb rot hatches a Fruit Fly mid-board at the arc distance `nearestPath` projected. A
 * second constructor is how a hatched enemy ends up aliasing `def.tags` or missing its index entry.
 *
 * `tags` is copied and not aliased: the def's array is shared by every enemy of that kind, and a
 * status system that adds a tag to one of them would be editing the roster.
 *
 * `spawnedInWaveIndex` is -1 for an enemy no wave spawned -- see the field's note in `types.ts`.
 */
export function spawnEnemyAt(
	world: World,
	def: EnemyDef,
	pathId: string,
	distance: number,
	spawnedInWaveIndex: number,
): Enemy {
	// Unrounded on purpose: rounding quantises the whole difficulty curve at low HP, and nothing
	// downstream needs an integer.
	const hp = def.hp * world.difficulty.enemyHpMult

	const enemy: Enemy = {
		id: world.nextEntityId++,
		defId: def.id,
		pathId,
		distance,
		hp,
		maxHp: hp,
		statuses: [],
		tags: [...def.tags],
		speed: def.speedTilesPerTick,
		spawnedInWaveIndex,
		stolenItems: [],
		flags: { hidden: false, untargetable: false, fleeing: false },
	}

	world.enemies.push(enemy)
	world.index.enemies[enemy.id] = world.enemies.length - 1

	return enemy
}

/** One enemy of a wave cursor, at the start of its lane. */
function spawnEnemy(world: World, spawn: WaveSpawn, waveIndex: number): void {
	spawnEnemyAt(world, getEnemyDef(spawn.enemyDefId), spawn.pathId, 0, waveIndex)
}

/**
 * One enemy per due cursor per tick.
 *
 * `nextSpawnTick += spacingTicks`, never `world.tick + spacingTicks`: the two agree until a tick is
 * skipped, and then the second drifts by one tick per wave for the rest of the night.
 */
export function spawnSystem(world: World): void {
	// Terminal phases run nothing, or the night keeps simulating behind the summary screen.
	if (world.night.phase === 'won' || world.night.phase === 'lost') {
		return
	}

	const wave = world.night.wave
	if (wave === null) {
		return
	}

	for (const spawn of wave.spawns) {
		if (spawn.remaining > 0 && spawn.nextSpawnTick <= world.tick) {
			spawnEnemy(world, spawn, wave.index)
			spawn.remaining--
			spawn.nextSpawnTick += spawn.spacingTicks
		}
	}
}
