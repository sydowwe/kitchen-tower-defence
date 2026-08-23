/**
 * The shape of a night: when a wave starts, when it counts as cleared, and how long the player gets
 * before the next one comes on its own.
 *
 * This is the only place `night.phase` moves while a night is being *played*. The two terminal
 * transitions are `resolveSystem`'s, because they depend on the board being empty and `resolve` is
 * the system that empties it -- deciding them here, nine systems earlier, would report a win one
 * tick after it happened.
 *
 * **Ordering worth knowing.** `commands` runs 1st, `spawn` 2nd, this 3rd. So a wave started by
 * `CallWaveEarly` has its first enemies spawned later in the same tick, while a wave started by the
 * countdown expiring spawns on the following one. Deterministic either way, but an assertion
 * pinning an exact spawn tick will disagree with itself depending on which path started the wave.
 */

import { getNightDef } from '@/core/content/index.ts'
import { startWave } from '@/core/systems/spawn.ts'
import type { Wave, World } from '@/core/types.ts'

/** A night runs 2:00am to 6:00am (analytic-docs/DECISIONS.md section 5). */
const NIGHT_START_HOUR = 2
const NIGHT_HOURS = 4
const MINUTES_PER_HOUR = 60

/**
 * The clock the HUD shows, as a pure function of wave progress. Nothing stores an hour.
 *
 * The denominator is `waveCount - 1`, not `waveCount`, so the **last** wave of the night reads
 * 6:00am rather than the night being over before the clock gets there.
 */
export function nightClock(waveIndex: number, waveCount: number): { hour: number; minute: number } {
	// A one-wave night has no span to divide by, and its only wave is the start of the night.
	const spans = Math.max(1, waveCount - 1)
	const progress = Math.min(Math.max(waveIndex / spans, 0), 1)
	const minutes = Math.round((NIGHT_START_HOUR + progress * NIGHT_HOURS) * MINUTES_PER_HOUR)

	return { hour: Math.floor(minutes / MINUTES_PER_HOUR), minute: minutes % MINUTES_PER_HOUR }
}

/**
 * True once every cursor of the wave has put its last enemy on the board. Spawned out, not cleared:
 * the enemies are still walking.
 */
export function hasFinishedSpawning(wave: Wave): boolean {
	return wave.spawns.every(spawn => spawn.remaining === 0)
}

/**
 * Emits `waveCleared` for every wave that has both finished spawning and lost its last enemy, and
 * moves the high-water mark past it.
 *
 * This has to work while the *next* wave is already on the board -- waves overlap, and
 * `Enemy.spawnedInWaveIndex` is the only field that can tell one wave's stragglers from another's.
 * The mark is what stops the event repeating every tick for the rest of the night.
 */
function emitClearedWaves(world: World): void {
	const night = world.night

	while (night.clearedThroughWaveIndex < night.waveIndex) {
		const index = night.clearedThroughWaveIndex + 1
		// A wave the night has already moved past necessarily finished spawning -- that is the only
		// way the next one ever started. Only the current wave has to be asked.
		const spawnedOut = index < night.waveIndex || (night.wave !== null && hasFinishedSpawning(night.wave))

		if (!spawnedOut || world.enemies.some(enemy => enemy.spawnedInWaveIndex === index)) {
			return
		}

		night.clearedThroughWaveIndex = index
		world.events.push({ kind: 'waveCleared', waveIndex: index })
	}
}

export function waveSystem(world: World): void {
	const night = world.night

	// Terminal phases run nothing, or the night keeps simulating behind the summary screen.
	if (night.phase === 'won' || night.phase === 'lost') {
		return
	}

	emitClearedWaves(world)

	if (night.phase === 'building' || night.phase === 'countdown') {
		night.countdownTicks = Math.max(0, night.countdownTicks - 1)
		if (night.countdownTicks === 0) {
			// `'building'` is the run-up to wave 0; a countdown is the gap before the next one.
			const next = night.phase === 'building' ? 0 : night.waveIndex + 1
			startWave(world, getNightDef(night.nightId), next)
		}
		return
	}

	const wave = night.wave
	if (wave === null || !hasFinishedSpawning(wave)) {
		return
	}

	// The countdown only starts once the wave's last enemy has *spawned*, so two waves are never
	// spawning at once and `night.wave` stays a single wave. Overlap is live enemies, not schedules.
	if (night.waveIndex >= night.waveCount - 1) {
		// The last wave gets no countdown. `resolveSystem` ends the night once the board is clear.
		return
	}

	// The authored countdown is on the night def's wave, not on the runtime `Wave`.
	const authored = getNightDef(night.nightId).waves[night.waveIndex]
	if (authored === undefined) {
		throw new Error(`night '${night.nightId}' has no wave ${night.waveIndex}`)
	}

	night.countdownTicks = authored.countdownTicks
	night.phase = 'countdown'
}
