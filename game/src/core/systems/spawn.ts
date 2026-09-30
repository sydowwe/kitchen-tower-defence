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

import { getEnemyDef, getNightDef } from '@/core/content/index.ts'
import { bindRng } from '@/core/rng.ts'
import { isFlyer } from '@/core/systems/targeting.ts'
import type { EnemyDef, NightDef, WaveEntry } from '@/core/content/schema.ts'
import type { Difficulty, Enemy, Path, WaveSpawn, World, WorldModifiers } from '@/core/types.ts'

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
 * One authored entry turned into the cursors that spawn it: one per lane it is spread over, or one
 * for the lane it names.
 *
 * `count` is passed in rather than read off the entry, because the two callers count differently --
 * `startWave` applies the difficulty multiplier and the destroy penalty buys enemies one at a time
 * against a budget. Everything else the entry says (its spacing, its lane, the round-robin over
 * every lane when it names none, and the throw for a lane the map does not have) is carried here
 * once for both.
 */
export function cursorsFor(world: World, entry: WaveEntry, count: number): WaveSpawn[] {
	const spawns: WaveSpawn[] = []
	const nextSpawnTick = world.tick + entry.startDelayTicks

	if (entry.pathId === undefined) {
		// No lane named: spread the entry over every lane on the map, keeping its spacing. The
		// Counter has one path, so this is a no-op until the first two-lane map at night 10.
		const paths = world.map.paths
		dealRoundRobin(count, paths.length).forEach((share, index) => {
			const path = paths[index]
			if (path !== undefined) {
				spawns.push(cursor(entry, share, nextSpawnTick, path))
			}
		})
		return spawns
	}

	// The silent version of this spawns nothing, and the symptom is a night that never ends.
	const path = world.map.paths.find(candidate => candidate.id === entry.pathId)
	if (path === undefined) {
		throw new Error(`wave entry names path '${entry.pathId}', which map '${world.map.id}' does not have`)
	}

	spawns.push(cursor(entry, count, nextSpawnTick, path))

	return spawns
}

/**
 * One cursor for one lane. `startDistanceTiles` and `hpMult` are carried only when the entry authors
 * them, so every cursor for an entry that does not is the object it was before the fields existed.
 */
function cursor(entry: WaveEntry, remaining: number, nextSpawnTick: number, path: Path): WaveSpawn {
	const spawn: WaveSpawn = {
		enemyDefId: entry.enemyDefId,
		remaining,
		nextSpawnTick,
		spacingTicks: entry.spacingTicks,
		pathId: path.id,
	}

	if (entry.startDistanceTiles !== undefined) {
		// A throw and not a clamp: an enemy placed past the fridge is eaten by `resolveSystem` on the
		// tick it spawns, and the night that authored the typo is what `startWave` adds to the message.
		if (entry.startDistanceTiles > path.lengthTiles) {
			throw new Error(
				`wave entry starts '${entry.enemyDefId}' ${entry.startDistanceTiles} tiles along path '${path.id}', which is ${path.lengthTiles} long`,
			)
		}
		spawn.startDistanceTiles = entry.startDistanceTiles
	}
	if (entry.hpMult !== undefined) {
		spawn.hpMult = entry.hpMult
	}

	return spawn
}

function isFlyerEntry(entry: WaveEntry): boolean {
	return isFlyer(getEnemyDef(entry.enemyDefId))
}

/**
 * What wave `waveIndex` actually sends: **the only reader of a night's entries for spawning**, so
 * `startWave` -- from the countdown and from `CallWaveEarly` alike -- and the Cookie Jar's destroy
 * penalty cannot disagree about it.
 *
 * With `flyerDelayWaves` (Fix the Window Screen), a wave sends its own ground entries plus the flyer
 * entries of the wave that many before it. A last-wave flyer would arrive after a night that has no
 * later wave, so it never comes; a wave left with nothing is legal, and spawns out on the tick it
 * starts. With no delay it is the authored entries in the authored order, so cursor order -- and every
 * replay recorded before the screen existed -- is unchanged.
 */
export function waveComposition(world: World, night: NightDef, waveIndex: number): WaveEntry[] {
	const own = night.waves[waveIndex]
	if (own === undefined) {
		throw new Error(`night '${night.id}' has no wave ${waveIndex}; it has ${night.waves.length}`)
	}

	const delay = world.modifiers.flyerDelayWaves
	if (delay === 0) {
		return [...own.entries]
	}

	const entries = own.entries.filter(entry => !isFlyerEntry(entry))
	const shifted = night.waves[waveIndex - delay]
	if (shifted !== undefined) {
		entries.push(...shifted.entries.filter(isFlyerEntry))
	}
	return entries
}

/**
 * Whether an entry's enemies walk in through the baseboard crack: on the ground, from the start of a
 * lane. A flyer comes in the window, and a Mold with `startDistanceTiles` never came through the crack.
 */
function comesThroughCrack(entry: WaveEntry): boolean {
	return !isFlyerEntry(entry) && (entry.startDistanceTiles ?? 0) === 0
}

/**
 * How many enemies an authored `count` sends: the tier's multiplier and tonight's night modifier's,
 * **rounded once over the product**. Rounded rather than floored, because cozy's 0.85 would otherwise
 * delete a one-enemy entry outright, and the `max(1)` is the belt to that brace.
 *
 * Exported for the next-night preview, which calls it with the tier and tonight's fold rather than
 * copying the rounding into `ui/`.
 */
export function waveEntryCount(
	count: number,
	difficulty: Pick<Difficulty, 'enemyCountMult'>,
	modifiers: Pick<WorldModifiers, 'enemyCountMult'>,
): number {
	return Math.max(1, Math.round(count * difficulty.enemyCountMult * modifiers.enemyCountMult))
}

/**
 * Builds `world.night.wave` from `waveComposition` and moves the night into `'wave'`.
 *
 * The night is passed in rather than looked up from `world.night.nightId`, so a test -- and the
 * balance harness -- can drive a synthetic night without registering it in `NIGHTS`.
 *
 * **Difficulty is applied here, to copies**, through `waveEntryCount`. HP is scaled at spawn instead
 * (see `spawnEnemy`) and left unrounded.
 *
 * **`crackSpawnMult` comes after the difficulty, per cursor**, and only on the map's first lane -- the
 * crack Seal the Baseboard Crack seals. The same `max(1, round(...))`, for the same reason.
 */
export function startWave(world: World, night: NightDef, waveIndex: number): void {
	const composition = waveComposition(world, night, waveIndex)
	const crack = world.map.paths[0]
	const spawns: WaveSpawn[] = []

	for (const entry of composition) {
		const count = waveEntryCount(entry.count, world.difficulty, world.modifiers)
		try {
			const cursors = cursorsFor(world, entry, count)
			if (crack !== undefined && comesThroughCrack(entry)) {
				for (const cursor of cursors) {
					if (cursor.pathId === crack.id) {
						cursor.remaining = Math.max(1, Math.round(cursor.remaining * world.modifiers.crackSpawnMult))
					}
				}
			}
			spawns.push(...cursors)
		} catch (error) {
			// `cursorsFor` knows the entry and the map but not which night authored it, and a bad
			// lane is an authoring mistake that has to name the night to be fixable.
			throw new Error(`night '${night.id}' wave ${waveIndex}: ${error instanceof Error ? error.message : error}`)
		}
	}

	world.night.waveIndex = waveIndex
	world.night.wave = { index: waveIndex, spawns, startedAtTick: world.tick }
	world.night.phase = 'wave'
	world.events.push({ kind: 'waveStarted', waveIndex })
}

/**
 * The stretch of `pathId` a burrowing enemy spends under the floor, or null for a def without
 * `burrow`.
 *
 * **The rng is drawn only for a def that burrows**, twice. An Ant spawning must leave `world.rng`
 * untouched, or every seeded replay and `RANDOM`-targeting spec on nights 1-12 shifts with no Weevil
 * anywhere in sight.
 */
function burrowWindowFor(world: World, def: EnemyDef, pathId: string): Enemy['burrowWindow'] {
	if (def.burrow === undefined) {
		return null
	}
	const lane = world.map.paths.find(path => path.id === pathId)
	if (lane === undefined) {
		return null
	}

	const rng = bindRng(world.rng)
	const length = lane.lengthTiles
	const { startMaxFraction, lengthMinFraction, lengthMaxFraction } = def.burrow
	const fromTiles = rng.next() * startMaxFraction * length
	const span = (lengthMinFraction + rng.next() * (lengthMaxFraction - lengthMinFraction)) * length
	return { fromTiles, toTiles: Math.min(length, fromTiles + span) }
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
 *
 * `hpMult` is the wave entry's, on top of the tier's. It defaults to 1 because the hatch has no entry.
 */
export function spawnEnemyAt(
	world: World,
	def: EnemyDef,
	pathId: string,
	distance: number,
	spawnedInWaveIndex: number,
	hpMult = 1,
): Enemy {
	// Unrounded on purpose: rounding quantises the whole difficulty curve at low HP, and nothing
	// downstream needs an integer.
	const hp = def.hp * world.difficulty.enemyHpMult * hpMult

	const enemy: Enemy = {
		id: world.nextEntityId++,
		defId: def.id,
		pathId,
		distance,
		// On its lane. `core/systems/light.ts` moves flyers off it and `core/systems/bait.ts` everything
		// else; `enemyPosition` returns the bare sample while it is 0.
		lateralOffsetTiles: 0,
		hp,
		maxHp: hp,
		statuses: [],
		tags: [...def.tags],
		speed: def.speedTilesPerTick,
		spawnedInWaveIndex,
		// Due now: `spreadSystem` runs after this one, so a writer's first mark lands the tick it spawns.
		nextTileWriteTick: world.tick,
		burrowWindow: burrowWindowFor(world, def, pathId),
		feeding: null,
		fedAt: [],
		// Unshoved. `pushEnemy` writes the first one.
		pushback: null,
		// Every thief starts on its way in. `core/systems/theft.ts` moves it on from there.
		theft: def.thief === undefined ? null : { phase: 'approaching', grabEndsTick: 0 },
		stolenItems: [],
		flags: { hidden: false, untargetable: false, fleeing: false, revealed: false, burrowed: false },
	}

	world.enemies.push(enemy)
	world.index.enemies[enemy.id] = world.enemies.length - 1

	return enemy
}

/** One enemy of a wave cursor, at the start of its lane unless the entry authored somewhere else. */
function spawnEnemy(world: World, spawn: WaveSpawn, waveIndex: number): void {
	spawnEnemyAt(
		world,
		getEnemyDef(spawn.enemyDefId),
		spawn.pathId,
		spawn.startDistanceTiles ?? 0,
		waveIndex,
		spawn.hpMult ?? 1,
	)
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

/**
 * The Cookie Jar's destroy penalty: a budget of crumbs handed to the enemy side and spent on extra
 * enemies, appended to the wave that is already running.
 *
 * **Bought from the running wave's own composition**, so the penalty knows no enemy names: the
 * authored entries are walked in order, repeatedly, buying one enemy at a time at that enemy's own
 * `reward`, until the budget cannot afford anything left. Night 1 therefore gets ants and night 5
 * gets beetles, and a roster added in step 11 needs no line here.
 *
 * **Appending cursors holds the wave open.** `hasFinishedSpawning` gates the countdown to the next
 * wave and `emitClearedWaves`, and a wave with a live penalty cursor is not finished spawning. That
 * is the penalty being real, and it is why the burst is bounded by a budget rather than a
 * multiplier.
 */
export function spawnDestroyPenalty(world: World, crumbs: number): void {
	const wave = world.night.wave
	// Null before wave 0, i.e. during `'building'` -- nothing in v1 can destroy a tower then, and
	// skipping beats throwing if something in step 13 ever can.
	if (wave === null || crumbs <= 0) {
		return
	}

	// Through `waveComposition`, so a jar destroyed in the wave the screen shifted flyers into buys
	// flyers too. Its cursors are not cut by `crackSpawnMult`: they are bought against a budget.
	const composition = waveComposition(world, getNightDef(world.night.nightId), world.night.waveIndex)

	const bought = new Map<number, number>()
	let budget = crumbs
	let boughtAnything = true

	while (boughtAnything) {
		boughtAnything = false
		composition.forEach((entry, index) => {
			const price = getEnemyDef(entry.enemyDefId).reward
			// A free enemy would buy an infinite burst; the roster has none, and this is the guard
			// rather than the discovery.
			if (price <= 0 || price > budget) {
				return
			}
			budget -= price
			bought.set(index, (bought.get(index) ?? 0) + 1)
			boughtAnything = true
		})
	}

	composition.forEach((entry, index) => {
		const count = bought.get(index)
		if (count === undefined) {
			return
		}
		// `startDelayTicks: 0` -- the penalty arrives now. The entry's own delay is when *the wave*
		// scheduled it, and re-applying it here would make a destroyed jar cost nothing for 4 seconds.
		wave.spawns.push(...cursorsFor(world, { ...entry, startDelayTicks: 0 }, count))
	})
}
