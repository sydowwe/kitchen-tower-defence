/**
 * The night schedule -- nights 1 to 3, the Counter's three nights
 * (analytic-docs/CONTENT.md section 6): 6, 7 and 8 waves, Ant from night 1, Roach from night 3.
 *
 * Difficulty scalars are applied at runtime by `startWave` and are never baked in here.
 *
 * **What sets the pace is the spawn window against the crossing, not the wave count.** The Counter's
 * `crack` is 31.1 tiles, so an Ant is on the board for ~31 seconds and a Roach for ~17. A wave that
 * spawns in three seconds and then waits twelve is a clump followed by a stare: the board's count
 * jumps, sits flat for ten seconds and jumps again. So every wave below spawns over roughly as long
 * as the gap that follows it, which turns the same enemies into a stream, and the ramp lives in the
 * spacing tightening and the counts growing.
 *
 * Two numbers that are not free:
 *
 * - **`waves[0].countdownTicks` does double duty** -- it is both the run-up before wave 1 and the gap
 *   after it (`waveSystem` reads the countdown off the wave that just finished spawning). It is short
 *   here because a night that opens on twelve seconds of empty counter opens on nothing happening.
 * - A wave's countdown starts when its **last enemy spawns**, not when the wave starts, so the gap
 *   between two waves arriving is `spawn window + countdown`.
 *
 * Step 5C tuned these against a night watched at 1x and 3x. They are content, and no spec asserts
 * them -- `tests/spawn.spec.ts` and `tests/night.spec.ts` both build their own nights on purpose, so
 * the next tuning pass is an edit here and nothing else.
 */

import type { NightDef } from '@/core/content/schema.ts'

/** The opening. Long enough to read the board, short enough that the night starts. */
const OPENING_TICKS = 6 * 60

export const night01: NightDef = {
	id: 'night01',
	index: 1,
	mapId: 'counter',
	waves: [
		{
			entries: [{ enemyDefId: 'ant', count: 5, spacingTicks: 75, startDelayTicks: 0, pathId: 'crack' }],
			countdownTicks: OPENING_TICKS,
		},
		{
			entries: [{ enemyDefId: 'ant', count: 7, spacingTicks: 66, startDelayTicks: 0, pathId: 'crack' }],
			countdownTicks: 7 * 60,
		},
		{
			entries: [{ enemyDefId: 'ant', count: 9, spacingTicks: 60, startDelayTicks: 0, pathId: 'crack' }],
			countdownTicks: 8 * 60,
		},
		{
			// The first wave that arrives in two runs: a gap you could have built into, if there were
			// anything to build yet.
			entries: [
				{ enemyDefId: 'ant', count: 8, spacingTicks: 50, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 5, spacingTicks: 50, startDelayTicks: 240, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [{ enemyDefId: 'ant', count: 14, spacingTicks: 45, startDelayTicks: 0, pathId: 'crack' }],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 12, spacingTicks: 40, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 8, spacingTicks: 40, startDelayTicks: 210, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
	],
}

export const night02: NightDef = {
	id: 'night02',
	index: 2,
	mapId: 'counter',
	waves: [
		{
			entries: [{ enemyDefId: 'ant', count: 7, spacingTicks: 66, startDelayTicks: 0, pathId: 'crack' }],
			countdownTicks: OPENING_TICKS,
		},
		{
			entries: [{ enemyDefId: 'ant', count: 9, spacingTicks: 60, startDelayTicks: 0, pathId: 'crack' }],
			countdownTicks: 7 * 60,
		},
		{
			entries: [{ enemyDefId: 'ant', count: 11, spacingTicks: 52, startDelayTicks: 0, pathId: 'crack' }],
			countdownTicks: 7 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 10, spacingTicks: 45, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 7, spacingTicks: 45, startDelayTicks: 210, pathId: 'crack' },
			],
			countdownTicks: 7 * 60,
		},
		{
			entries: [{ enemyDefId: 'ant', count: 16, spacingTicks: 40, startDelayTicks: 0, pathId: 'crack' }],
			countdownTicks: 7 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 14, spacingTicks: 36, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 9, spacingTicks: 36, startDelayTicks: 200, pathId: 'crack' },
			],
			countdownTicks: 7 * 60,
		},
		{
			entries: [{ enemyDefId: 'ant', count: 20, spacingTicks: 30, startDelayTicks: 0, pathId: 'crack' }],
			countdownTicks: 7 * 60,
		},
	],
}

/**
 * The Roach arrives in wave 3, two of them well behind that wave's Ants and spaced far enough apart
 * to be watched one at a time. It crosses in ~17 seconds against the Ant's ~31, so what makes it read
 * as a change of pace is seeing it overtake the column it was released behind -- which only happens
 * if it is not released inside a clump.
 */
export const night03: NightDef = {
	id: 'night03',
	index: 3,
	mapId: 'counter',
	waves: [
		{
			entries: [{ enemyDefId: 'ant', count: 9, spacingTicks: 60, startDelayTicks: 0, pathId: 'crack' }],
			countdownTicks: OPENING_TICKS,
		},
		{
			entries: [{ enemyDefId: 'ant', count: 11, spacingTicks: 52, startDelayTicks: 0, pathId: 'crack' }],
			countdownTicks: 7 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 11, spacingTicks: 50, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 2, spacingTicks: 150, startDelayTicks: 420, pathId: 'crack' },
			],
			countdownTicks: 7 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 12, spacingTicks: 45, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 3, spacingTicks: 120, startDelayTicks: 300, pathId: 'crack' },
			],
			countdownTicks: 7 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 13, spacingTicks: 42, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 5, spacingTicks: 90, startDelayTicks: 240, pathId: 'crack' },
			],
			countdownTicks: 7 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 16, spacingTicks: 38, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 5, spacingTicks: 75, startDelayTicks: 240, pathId: 'crack' },
			],
			countdownTicks: 7 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 16, spacingTicks: 34, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 8, spacingTicks: 60, startDelayTicks: 180, pathId: 'crack' },
			],
			countdownTicks: 7 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 20, spacingTicks: 30, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 10, spacingTicks: 50, startDelayTicks: 150, pathId: 'crack' },
			],
			countdownTicks: 7 * 60,
		},
	],
}

export const NIGHTS = [night01, night02, night03]
