/**
 * The noise meter, and the human who walks in when it fills
 * (analytic-docs/DECISIONS.md section 8).
 *
 * The meter is one float and a cap. Loud towers add to it per shot, it decays at a flat rate, and
 * reaching the cap costs the player the board's crumbs, the wave's unbanked income and a fifth of
 * every tower's HP -- while the enemies get away.
 *
 * **This system runs after `combat` and `tileEffect`, and before `economy`** (`core/sim.ts`), which is
 * the whole reason it can read shots as events: both pushed this tick's `towerFired` into
 * `world.events` a few slots ago, and `world.events` is cleared at the *top* of the next tick, so they
 * are still there. A system running before `combat` would be summing last tick's shots forever.
 *
 * **Whether Act I can fill the cap at all is not this file's question.** A Mousetrap is 0.30/sec at
 * best against a decay of 1.5/sec; analytic-docs/OPEN-QUESTIONS.md section 3 owns that, and step 22
 * answers it by sweeping the decay over five hundred headless nights. Nothing here is tuned on an
 * impression of one played night.
 */

import { isFiring, isTileEffect } from '@/core/content/behaviours.ts'
import { forfeitCrumbPiles } from '@/core/systems/crumbs.ts'
import { forfeitUnbankedCrumbs } from '@/core/systems/economy.ts'
import { damageTower, destroyTower } from '@/core/systems/placement.ts'
import type { TowerDef } from '@/core/content/schema.ts'
import type { DefId, World } from '@/core/types.ts'

/** `core/` holds ticks; a per-second rate a player could plan against is derived, never stored. */
const TICKS_PER_SECOND = 60

/** What a wake takes off every tower still standing, as a fraction of its `maxHp`. */
const WAKE_DAMAGE_FRACTION = 0.2

/** 0..1, for a bar. 0 rather than `Infinity` at a cap of 0, which a dev panel can produce. */
export function noiseFraction(world: World): number {
	return world.noise.cap === 0 ? 0 : world.noise.level / world.noise.cap
}

/**
 * The number a player can actually plan against: what this tower adds to the meter per second of
 * continuous fire, 0 for one that never fires.
 *
 * `noise: 3` on its own does not say that a Toaster is three times louder than a Mousetrap -- it
 * fires twice as often, so it is nine tenths of a per-second rate louder, and that is the comparison
 * the card has to make.
 *
 * Takes a **def rather than a tower**: the shop asks about the base def and the inspector asks about
 * `effectiveDefOf`, and a tier that moves either `noise` or `cooldownTicks` moves this for free.
 *
 * A tower that writes the board has no shot to count: `tileEffectSystem` pays `def.noise` once a
 * second while it is burning something, so that is the number, as it is.
 */
export function projectedNoisePerSecond(def: TowerDef): number {
	const firing = def.behaviours.find(isFiring)
	if (firing !== undefined) {
		return (def.noise * TICKS_PER_SECOND) / firing.cooldownTicks
	}
	return def.behaviours.some(isTileEffect) ? def.noise : 0
}

/**
 * A human walks in and turns the light on. The order below is fixed and every step of it is
 * load-bearing (step 13A, decision 9).
 */
function wake(world: World): void {
	// 1. Everything on the board runs for it. How fast is `FLEE_SPEED_MULT` in `movement.ts`, and
	// `resolveSystem` is what takes a fled enemy off the board when it gets back to the skirting.
	//
	// `fleeing` **and** `untargetable`: `fleeing` alone would let a tower kill one on the way out,
	// dropping a crumb on a board whose crumbs were just forfeited and counting a kill for something
	// that got away (step 13A, decision 11).
	//
	// This is the only writer of `fleeing`. A thief running home is `Enemy.theft`'s phase, not this
	// flag; a woken thief gets both, and every system asks this flag first -- the wake wins.
	for (const enemy of world.enemies) {
		enemy.flags.fleeing = true
		enemy.flags.untargetable = true
	}

	// Cleared **here** and not left to `targetingSystem` next tick: `combatSystem` reads the id in
	// the slot after targeting, and an untargetable enemy still sitting in someone's `targetEnemyId`
	// takes one free hit on the way out.
	for (const tower of world.towers) {
		tower.targetEnemyId = null
	}

	// 2. Everything still on the floor is swept up by someone who is not you.
	const crumbsOnBoardForfeited = forfeitCrumbPiles(world)

	// 3. The wave's income goes with it. Through `economy.ts` like every other wallet write, which is
	// where the clamp that keeps the wallet non-negative lives.
	const crumbsForfeited = forfeitUnbankedCrumbs(world)

	// 4. Close the wave -- **spawned out, not nulled**. `waveSystem` then moves the night into
	// `'countdown'` with the authored gap on its own next tick, `emitClearedWaves` clears it, and
	// `resolveSystem` can still win the night if it was the last wave, all three through code paths
	// that already exist. Nulling `night.wave` would fail `resolveSystem`'s `lastWaveIsOut`, and a
	// wake on the final wave would hang the night forever.
	//
	// During `'countdown'` every cursor is already at 0, so this is a no-op and `countdownTicks` is
	// untouched: a wake in the gap neither skips nor duplicates the next wave.
	const wave = world.night.wave
	if (wave !== null) {
		for (const spawn of wave.spawns) {
			spawn.remaining = 0
		}
	}

	// 5. Every tower takes 20% of max HP, and whatever that kills leaves through `destroyTower`.
	//
	// A **snapshot**, because `destroyTower` splices `world.towers` and rebuilds the index -- a
	// forward walk of the live array would skip the tower after each one it removed, and the symptom
	// is every second doomed tower surviving a wake it should not have.
	const towersDestroyed: DefId[] = []
	for (const tower of [...world.towers]) {
		damageTower(world, tower, tower.maxHp * WAKE_DAMAGE_FRACTION)
		if (tower.hp <= 0) {
			towersDestroyed.push(tower.defId)
			// `payPenalty: false` -- see `destroyTower`. Every enemy on the board fled a few lines ago;
			// a Cookie Jar buying replacements out of the wave they fled from would refill it.
			destroyTower(world, tower.id, { payPenalty: false })
		}
	}

	// 6. The meter starts again. `level = 0` **here**, in the same call that tested the cap, is what
	// makes "exactly one wake, never two on consecutive ticks" fall out of the code rather than out
	// of a guard flag.
	world.noise.level = 0
	world.noise.wakeCount++
	world.events.push({ kind: 'humanWoke', crumbsForfeited, crumbsOnBoardForfeited, towersDestroyed })
}

export function noiseSystem(world: World): void {
	// Terminal phases run nothing, or the meter keeps moving behind the summary screen.
	if (world.night.phase === 'won' || world.night.phase === 'lost') {
		return
	}

	const noise = world.noise

	// **Accumulate, then decay, then test the cap, in that order.** Decaying first would shave a
	// tower's own shot by the same tick's decay -- a silent 2.5% discount on every loud tower.
	//
	// There is no per-second emitter here. The Gas Stove Burner, the one tower that is loud without
	// firing, pushes a `towerFired` from `tileEffectSystem` once a second while it burns something, so
	// this loop counts it with every shot and needs no branch of its own.
	for (const event of world.events) {
		if (event.kind === 'towerFired') {
			noise.level += event.noise
		}
	}

	noise.level = Math.min(noise.cap, Math.max(0, noise.level - noise.decayPerTick))
	// Here, between the clamp and the wake: on a wake tick this is the only line that sees the cap.
	noise.peakLevel = Math.max(noise.peakLevel, noise.level)

	if (noise.level >= noise.cap) {
		wake(world)
	}
}
