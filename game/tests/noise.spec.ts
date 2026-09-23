import { describe, expect, it } from 'vitest'
import { createCommandQueue } from '@/core/commands.ts'
import { DIFFICULTIES } from '@/core/content/difficulty.ts'
import { TileFlags } from '@/core/map.ts'
import { INSTALLATIONS, getTowerDef, resolveNoiseModifiers } from '@/core/content/index.ts'
import { tick } from '@/core/sim.ts'
import { dropCrumb } from '@/core/systems/crumbs.ts'
import { earnCrumbs } from '@/core/systems/economy.ts'
import { FLEE_SPEED_MULT } from '@/core/systems/movement.ts'
import { noiseFraction, noiseSystem, projectedNoisePerSecond } from '@/core/systems/noise.ts'
import { canPlaceTower, placeTower, sellTower } from '@/core/systems/placement.ts'
import { createWorld } from '@/core/world.ts'
import { createTestWorld } from './fixtures/world.ts'
import type { CommandQueue } from '@/core/commands.ts'
import type { CreateWorldOptions } from '@/core/world.ts'
import type { TowerDef } from '@/core/content/index.ts'
import type { Enemy, GameEvent, Vec2, World } from '@/core/types.ts'

/**
 * The meter, the wake and what the wake costs -- every one of them driven to the cap directly rather
 * than waited for.
 *
 * **This is the half of step 13 that can silently be wrong**, which is why it carries every
 * assertion: a decay authored per second and spent per tick, a wake that fires on two consecutive
 * ticks, a forfeit that takes money already spent. None of them is visible on screen.
 *
 * Whether a played Act I night can reach the cap at all is a different question and not this file's
 * -- analytic-docs/OPEN-QUESTIONS.md section 3 owns it, and step 22 answers it headless. Nothing
 * here asserts a tower's authored `noise`, only that the meter does arithmetic on it correctly.
 */

const OPTIONS: CreateWorldOptions = { seed: 1234, mapId: 'counter', nightId: 'night01', difficulty: 'normal' }

function options(overrides: Partial<CreateWorldOptions> = {}): CreateWorldOptions {
	return { ...OPTIONS, ...overrides }
}

/** The fixture's night is `'won'`, which is terminal and runs nothing. Every noise spec needs it live. */
function noisyWorld(): World {
	const world = createTestWorld()
	world.night.phase = 'wave'
	return world
}

/** An enemy on the fixture's lane, at `distance`, with no statuses. */
function putEnemy(world: World, distance: number, speed = 0.05): Enemy {
	const enemy: Enemy = {
		id: world.nextEntityId++,
		defId: 'ant',
		pathId: 'a',
		distance,
		lateralOffsetTiles: 0,
		hp: 10,
		maxHp: 10,
		statuses: [],
		tags: ['ground'],
		speed,
		spawnedInWaveIndex: 0,
		nextTileWriteTick: 0,
		stolenItems: [],
		flags: { hidden: false, untargetable: false, fleeing: false, revealed: false },
	}
	world.enemies.push(enemy)
	world.index.enemies[enemy.id] = world.enemies.length - 1
	return enemy
}

function eventsOfKind<K extends GameEvent['kind']>(events: readonly GameEvent[], kind: K): GameEvent[] {
	return events.filter(event => event.kind === kind)
}

/**
 * Ticks a real night forward until `until` holds, **sweeping the board after every tick**.
 *
 * Nothing defends the fridge in these specs, so without the sweep the first ant to reach it empties
 * the shelf, the night goes `'lost'`, and every phase this file waits for stops arriving -- a
 * synchronous spin that takes vitest's whole run down rather than failing one test. The bound is the
 * belt to that brace.
 */
function advanceTo(world: World, queue: CommandQueue, until: (world: World) => boolean, limit = 30_000): void {
	for (let n = 0; n < limit && !until(world); n++) {
		tick(world, queue)
		if (world.enemies.length > 0) {
			world.enemies = []
			world.index.enemies = {}
		}
	}

	if (!until(world)) {
		throw new Error(`the night never got there in ${limit} ticks; phase '${world.night.phase}'`)
	}
}

/** One `towerFired` event of the given loudness, as `combatSystem` would have pushed it. */
function fired(world: World, noise: number): void {
	world.events.push({ kind: 'towerFired', towerId: 1, defId: 'mousetrap', noise })
}

/** The first tile of the authored map this def may actually stand on. Asked, never assumed. */
function firstBuildableTile(world: World, def: TowerDef): Vec2 {
	for (let y = 0; y < world.map.heightTiles; y++) {
		for (let x = 0; x < world.map.widthTiles; x++) {
			if (canPlaceTower(world, def, { x, y }).ok) {
				return { x, y }
			}
		}
	}
	throw new Error(`map '${world.map.id}' has nowhere to put a '${def.id}'`)
}

/**
 * Drives the meter over the cap and runs the system, so the wake fires on this call.
 *
 * It takes a shot rather than assigning `level = cap`, because the system decays *after* it
 * accumulates: a level parked exactly on the cap is a level 0.025 under it by the time the cap is
 * tested, and a spec that assigned one would quietly assert nothing at all.
 */
function wakeNow(world: World): void {
	world.noise.level = world.noise.cap
	fired(world, 1)
	noiseSystem(world)
}

describe('the meter', () => {
	it('adds a shot’s own noise value, unrounded', () => {
		const world = noisyWorld()
		const mousetrap = getTowerDef('mousetrap')
		fired(world, mousetrap.noise)
		noiseSystem(world)

		// The def's 2, minus one tick of decay -- and the def's value rather than a copy of it, so a
		// re-tune in step 22 moves this assertion with it.
		expect(world.noise.level).toBeCloseTo(mousetrap.noise - 1.5 / 60, 10)
	})

	it('decays by exactly 1.5 over 60 ticks from a level that is neither 0 nor the cap', () => {
		const world = noisyWorld()
		world.noise.level = 50

		for (let n = 0; n < 60; n++) {
			noiseSystem(world)
		}

		// The one assertion that catches a per-second rate stored in a per-tick field: that bug reads
		// as 50 - 90 clamped to 0 here, not as 48.5.
		expect(world.noise.level).toBeCloseTo(48.5, 10)
	})

	it('decays during building and countdown, not only during a wave', () => {
		for (const phase of ['building', 'countdown'] as const) {
			const world = noisyWorld()
			world.night.phase = phase
			world.noise.level = 10
			noiseSystem(world)

			expect(world.noise.level).toBeCloseTo(10 - 1.5 / 60, 10)
		}
	})

	it('runs nothing in the two terminal phases', () => {
		for (const phase of ['won', 'lost'] as const) {
			const world = noisyWorld()
			world.night.phase = phase
			world.noise.level = 10
			fired(world, 3)
			noiseSystem(world)

			expect(world.noise.level).toBe(10)
		}
	})

	it('accumulates before it decays, so a shot is not shaved by its own tick', () => {
		const world = noisyWorld()
		fired(world, 3)
		noiseSystem(world)

		// Decay-first would give 3 flat, having clamped 0 - 0.025 to 0 before adding the shot.
		expect(world.noise.level).toBeCloseTo(3 - 1.5 / 60, 10)
	})

	it('never falls below 0', () => {
		const world = noisyWorld()
		world.noise.level = 0.01
		noiseSystem(world)

		expect(world.noise.level).toBe(0)
	})

	it('reads out as a fraction of the cap, and as 0 when there is no cap', () => {
		const world = noisyWorld()
		world.noise.level = 25

		expect(noiseFraction(world)).toBe(0.25)

		world.noise.cap = 0
		expect(noiseFraction(world)).toBe(0)
	})

	it('projects a per-second rate off the def, and 0 for a tower that never fires', () => {
		// 2 noise every 396 ticks. The rate is what a player can plan against; the bare 2 is not.
		expect(projectedNoisePerSecond(getTowerDef('mousetrap'))).toBeCloseTo((2 * 60) / 396, 10)
		// Silent, but it does fire: 0 because the def is 0, not because there is no behaviour.
		expect(projectedNoisePerSecond(getTowerDef('saltShaker'))).toBe(0)
		// No firing behaviour at all.
		expect(projectedNoisePerSecond(getTowerDef('cookieJar'))).toBe(0)
	})
})

describe('the wake', () => {
	it('fires exactly once when the level is driven past the cap, and not again next tick', () => {
		const world = noisyWorld()
		world.noise.level = world.noise.cap - 0.01
		fired(world, 5)
		noiseSystem(world)

		expect(eventsOfKind(world.events, 'humanWoke')).toHaveLength(1)
		expect(world.noise.wakeCount).toBe(1)
		// Zeroed in the same call that tested the cap, which is what makes "never twice running" a
		// property of the code rather than of a guard flag.
		expect(world.noise.level).toBe(0)

		world.events.length = 0
		noiseSystem(world)
		expect(eventsOfKind(world.events, 'humanWoke')).toHaveLength(0)
		expect(world.noise.wakeCount).toBe(1)
	})

	it('clamps the level to the cap rather than letting it overshoot', () => {
		const world = noisyWorld()
		world.noise.level = 90
		fired(world, 1000)
		noiseSystem(world)

		// Woke, so it is 0 -- but the clamp is what stopped 1090 becoming the level a second wake
		// would still be sitting on next tick.
		expect(world.noise.level).toBe(0)
		expect(world.noise.wakeCount).toBe(1)
	})

	it('sends every enemy fleeing, untargetable, and off every tower’s sights', () => {
		const world = noisyWorld()
		const enemy = putEnemy(world, 10)
		const tower = placeTower(world, getTowerDef('saltShaker'), { x: 0, y: 0 })
		expect(tower).not.toBeNull()
		tower!.targetEnemyId = enemy.id

		wakeNow(world)

		expect(enemy.flags.fleeing).toBe(true)
		// `fleeing` alone would let a tower kill one on the way out, dropping a crumb on a board whose
		// crumbs were just forfeited.
		expect(enemy.flags.untargetable).toBe(true)
		// Cleared here: `combatSystem` reads the id a slot later and would take one free hit.
		expect(tower!.targetEnemyId).toBeNull()
	})

	it('sweeps every uncollected pile off the board without crediting anything', () => {
		const world = noisyWorld()
		dropCrumb(world, { x: 5, y: 0 }, 7)
		dropCrumb(world, { x: 15, y: 0 }, 11)
		const walletBefore = world.crumbs
		const collectedBefore = world.night.crumbsCollected

		wakeNow(world)

		expect(world.crumbPiles).toEqual([])
		expect(world.index.crumbPiles).toEqual({})
		expect(world.crumbs).toBe(walletBefore)
		// A forfeited crumb was dropped and not collected -- which is what keeps the cleanliness ratio
		// meaning something.
		expect(world.night.crumbsCollected).toBe(collectedBefore)

		const woke = eventsOfKind(world.events, 'humanWoke')[0]
		expect(woke).toMatchObject({ crumbsOnBoardForfeited: 18 })
	})

	it('takes the unbanked pool out of the wallet and leaves the banked part alone', () => {
		const world = noisyWorld()
		world.crumbs = 0
		world.unbankedCrumbs = 0
		earnCrumbs(world, 200, true)
		earnCrumbs(world, 120)

		wakeNow(world)

		expect(world.crumbs).toBe(200)
		expect(world.unbankedCrumbs).toBe(0)
		expect(eventsOfKind(world.events, 'humanWoke')[0]).toMatchObject({ crumbsForfeited: 120 })
	})

	it('takes 20% of max HP off every tower, and removes the ones that cannot take it', () => {
		const world = noisyWorld()
		world.crumbs = 10_000

		const healthy = placeTower(world, getTowerDef('saltShaker'), { x: 0, y: 0 })
		const doomed = placeTower(world, getTowerDef('cardboardBox'), { x: 1, y: 0 })
		expect(healthy).not.toBeNull()
		expect(doomed).not.toBeNull()

		const doomedId = doomed!.id
		const doomedDefId = doomed!.defId
		// 19% of max: under the 20% the wake takes, so it does not survive it.
		doomed!.hp = doomed!.maxHp * 0.19

		wakeNow(world)

		expect(healthy!.hp).toBe(healthy!.maxHp * 0.8)
		expect(world.towers.map(tower => tower.id)).not.toContain(doomedId)
		expect(eventsOfKind(world.events, 'towerDestroyed')).toHaveLength(1)
		expect(eventsOfKind(world.events, 'humanWoke')[0]).toMatchObject({ towersDestroyed: [doomedDefId] })
	})

	it('destroys every doomed tower, not every second one', () => {
		const world = noisyWorld()
		world.crumbs = 10_000

		// Four in a row, all doomed. A forward `for...of` over the live array skips the tower after
		// each one `destroyTower` splices out, and the symptom is two survivors.
		// Tiles 1 and up are the fixture's track, which is where a `path_only` box goes.
		for (let x = 1; x <= 4; x++) {
			const tower = placeTower(world, getTowerDef('cardboardBox'), { x, y: 0 })
			expect(tower).not.toBeNull()
			tower!.hp = 1
		}
		expect(world.towers).toHaveLength(4)

		wakeNow(world)

		expect(world.towers).toEqual([])
		expect(eventsOfKind(world.events, 'towerDestroyed')).toHaveLength(4)
	})

	it('suppresses the Cookie Jar’s destroy penalty, so no new spawns are appended', () => {
		const world = createWorld(options())
		const queue = createCommandQueue()
		// Into `'wave'`, so `night.wave` is non-null and `spawnDestroyPenalty` would have something to
		// append to.
		advanceTo(world, queue, w => w.night.wave !== null)

		const jar = placeTower(world, getTowerDef('cookieJar'), firstBuildableTile(world, getTowerDef('cookieJar')))
		expect(jar).not.toBeNull()
		jar!.hp = 1

		const cursorsBefore = world.night.wave!.spawns.length
		wakeNow(world)

		// The one nobody would think to check: a jar dying to a wake buying replacements out of the
		// very wave that just fled would refill a board the player was told was empty.
		expect(world.towers.map(tower => tower.defId)).not.toContain('cookieJar')
		expect(world.night.wave!.spawns).toHaveLength(cursorsBefore)
	})

	it('closes the running wave without nulling it', () => {
		const world = createWorld(options())
		const queue = createCommandQueue()
		advanceTo(world, queue, w => w.night.wave !== null && w.night.wave.spawns.some(spawn => spawn.remaining > 0))

		wakeNow(world)

		// **Not nulled**: `resolveSystem`'s `lastWaveIsOut` requires it, and a wake on the final wave
		// would hang the night forever with a board that empties and a phase that never moves.
		expect(world.night.wave).not.toBeNull()
		expect(world.night.wave!.spawns.every(spawn => spawn.remaining === 0)).toBe(true)
	})
})

describe('fleeing', () => {
	it('walks an enemy backwards at twice its speed, ignoring a freeze', () => {
		const world = noisyWorld()
		const enemy = putEnemy(world, 10, 0.05)
		wakeNow(world)

		// A freeze is a speed multiplier of 0. An enemy that can never leave is a board that never
		// empties and a night that never ends (decision 12).
		enemy.statuses.push({
			kind: 'freeze',
			remainingTicks: 600,
			stacks: 1,
			magnitude: 1,
			sourceId: null,
			damageType: null,
		})

		const queue = createCommandQueue()
		tick(world, queue)

		expect(enemy.distance).toBeCloseTo(10 - 0.05 * FLEE_SPEED_MULT, 10)
	})

	it('removes an enemy that gets back to 0 with no kill, no crumb and no event', () => {
		const world = noisyWorld()
		const enemy = putEnemy(world, 0.05, 0.05)
		enemy.flags.fleeing = true
		enemy.flags.untargetable = true
		const killsBefore = world.night.enemiesKilled

		const queue = createCommandQueue()
		tick(world, queue)

		expect(world.enemies).toEqual([])
		expect(world.crumbPiles).toEqual([])
		expect(eventsOfKind(world.events, 'enemyKilled')).toHaveLength(0)
		expect(eventsOfKind(world.events, 'enemyLeaked')).toHaveLength(0)
		expect(world.night.enemiesKilled).toBe(killsBefore)
	})

	it('leaves rather than dies when a shot in flight left it on 1 HP', () => {
		const world = noisyWorld()
		const enemy = putEnemy(world, 0.05, 0.05)
		enemy.flags.fleeing = true
		enemy.hp = 1

		const queue = createCommandQueue()
		tick(world, queue)

		// The flee branch runs before the death branch, so it does not pay out at the skirting board.
		expect(world.enemies).toEqual([])
		expect(eventsOfKind(world.events, 'enemyKilled')).toHaveLength(0)
		expect(world.night.crumbsDropped).toBe(0)
	})

	it('does not chew a barricade it is walking away from', () => {
		const world = noisyWorld()
		world.crumbs = 10_000
		const box = placeTower(world, getTowerDef('cardboardBox'), { x: 12, y: 0 })
		expect(box).not.toBeNull()

		const enemy = putEnemy(world, 12, 0.05)
		enemy.flags.fleeing = true
		enemy.flags.untargetable = true

		const queue = createCommandQueue()
		tick(world, queue)

		// A retreating ant snapping forward onto a box it already passed, and taking a bite out of it,
		// is what skipping the loop prevents.
		expect(box!.hp).toBe(box!.maxHp)
		expect(enemy.distance).toBeCloseTo(12 - 0.05 * FLEE_SPEED_MULT, 10)
	})
})

describe('the banked / unbanked split', () => {
	it('leaves the wallet untouched when every crumb earned was spent on towers', () => {
		const world = noisyWorld()
		world.crumbs = 0
		world.unbankedCrumbs = 0
		earnCrumbs(world, 200, true)
		earnCrumbs(world, 300)
		expect(world.crumbs).toBe(500)

		// The fixture's lane is track from tile 1 on, and a salt shaker stands beside the track. Ten
		// plain build tiles is enough room to spend the whole 300 in one currency.
		for (let x = 0; x < 10; x++) {
			world.map.flags[x] = TileFlags.BUILDABLE
		}

		// Spend the 300 back out. The unbanked pool is drawn down first, so there is nothing left to
		// forfeit -- converting income into towers is how you protect it (decision 7).
		const shaker = getTowerDef('saltShaker')
		let spent = 0
		for (let x = 0; spent + shaker.cost <= 300; x++) {
			expect(placeTower(world, shaker, { x, y: 0 })).not.toBeNull()
			spent += shaker.cost
		}
		expect(spent).toBe(300)

		const before = world.crumbs
		wakeNow(world)

		expect(world.crumbs).toBe(before)
		expect(world.crumbs).toBeGreaterThanOrEqual(0)
		expect(world.unbankedCrumbs).toBe(0)
	})

	it('never takes a sell refund, because a refund is returned capital', () => {
		const world = noisyWorld()
		world.crumbs = 0
		world.unbankedCrumbs = 0
		earnCrumbs(world, 300)

		const tower = placeTower(world, getTowerDef('saltShaker'), { x: 0, y: 0 })
		expect(tower).not.toBeNull()
		expect(sellTower(world, tower!.id)).toBe(true)

		const refunded = world.crumbs
		// The refund landed banked, so what is left unbanked is only the income the purchase did not
		// draw down.
		const unbanked = world.unbankedCrumbs
		wakeNow(world)

		expect(world.crumbs).toBe(refunded - unbanked)
		expect(world.crumbs).toBeGreaterThan(0)
	})
})

describe('a night that has been woken', () => {
	it('starts the next wave exactly once, at the tick it would have, when the wake lands in the gap', () => {
		const world = createWorld(options())
		const queue = createCommandQueue()
		advanceTo(world, queue, w => w.night.phase === 'countdown')

		const countdownBefore = world.night.countdownTicks
		const waveIndexBefore = world.night.waveIndex
		wakeNow(world)

		// A wake during the gap neither skips nor duplicates the next wave.
		expect(world.night.countdownTicks).toBe(countdownBefore)
		expect(world.night.waveIndex).toBe(waveIndexBefore)

		let started = 0
		for (let n = 0; n < countdownBefore + 2; n++) {
			tick(world, queue)
			started += eventsOfKind(world.events, 'waveStarted').length
		}

		expect(started).toBe(1)
		expect(world.night.waveIndex).toBe(waveIndexBefore + 1)
	})

	it('can still reach won when the wake lands on the last wave', () => {
		const world = createWorld(options())
		const queue = createCommandQueue()
		// Straight to the last wave, so the wake has to leave `night.wave` in a shape
		// `resolveSystem`'s `lastWaveIsOut` can still read.
		advanceTo(world, queue, w => w.night.waveIndex === w.night.waveCount - 1 && w.night.wave !== null)

		// The sweep stops here, so the last wave puts its own enemies on the board and the wake has
		// something real to send running.
		for (let n = 0; n < 600 && world.enemies.length === 0; n++) {
			tick(world, queue)
		}
		expect(world.enemies.length).toBeGreaterThan(0)

		wakeNow(world)
		expect(world.noise.wakeCount).toBe(1)

		// Long enough for every fled enemy to walk back off the board. A wake that nulled `night.wave`
		// would sit here at `'wave'` forever with nothing on the board.
		for (let n = 0; n < 20_000 && world.night.phase !== 'won'; n++) {
			tick(world, queue)
		}

		expect(world.night.phase).toBe('won')
	})
})

describe('the noise installations', () => {
	it('folds a resolved pair onto the difficulty tier, additively, at construction', () => {
		const world = createWorld(options({ noise: { capDelta: 55, decayPerSecondDelta: 0.5 } }))

		expect(world.noise.cap).toBe(DIFFICULTIES.normal.noiseCap + 55)
		expect(world.noise.decayPerTick).toBeCloseTo(2 / 60, 10)
	})

	it('resolves the three defs into that pair, summed', () => {
		const resolved = resolveNoiseModifiers(['closeTheKitchenDoor', 'whiteNoiseMachine', 'oilTheHinges'])

		// **Against the defs, not against literals copied out of the doc** -- otherwise this is a
		// second transcription of CONTENT.md section 8 rather than a test of the fold.
		const expectedCap = INSTALLATIONS.reduce((sum, def) => sum + (def.noiseCapDelta ?? 0), 0)
		const expectedDecay = INSTALLATIONS.reduce((sum, def) => sum + (def.noiseDecayPerSecondDelta ?? 0), 0)

		expect(resolved).toEqual({ capDelta: expectedCap, decayPerSecondDelta: expectedDecay })

		const world = createWorld(options({ noise: resolved }))
		expect(world.noise.cap).toBe(DIFFICULTIES.normal.noiseCap + expectedCap)
		expect(world.noise.decayPerTick).toBeCloseTo((1.5 + expectedDecay) / 60, 10)
	})

	it('is nothing at all when nothing is owned', () => {
		expect(resolveNoiseModifiers([])).toEqual({ capDelta: 0, decayPerSecondDelta: 0 })
		expect(createWorld(options()).noise.cap).toBe(DIFFICULTIES.normal.noiseCap)
	})

	it('throws with the id in the message for one that does not exist', () => {
		expect(() => resolveNoiseModifiers(['nosuchinstallation'])).toThrow(/nosuchinstallation/)
	})
})
