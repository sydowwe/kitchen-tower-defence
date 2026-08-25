/**
 * The night schedule -- nights 1 to 7 (analytic-docs/CONTENT.md section 6): 6, 7, 8, 8, 9, 9 and 10
 * waves, Ant from night 1, Roach from night 3, Beetle from night 5. All seven are on the Counter;
 * see the note above `night04` for why the last four are not on the maps section 6 names.
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

/**
 * Nights 4 to 7 are authored **on the Counter**. analytic-docs/CONTENT.md section 6 puts 4-6 on the
 * Sink and 7 in the Pantry, and neither map exists: step 21 authors the other five and re-wires the
 * campaign in full. Until then `createWorld` throws on a night whose `mapId` is not the map it was
 * handed, and `GameView.vue` only ever passes `'counter'`.
 *
 * Wave counts are section 6's: 8, 9, 9, 10. Everything else is drafted from arithmetic against the
 * `crack`'s 31.1 tiles -- step 9C re-tunes it after watching a night at 1x and 3x, the way 5C tuned
 * nights 1-3.
 *
 * The Beetle is the new enemy, from night 5. It crosses in ~44 seconds against the Ant's ~31 and the
 * Roach's ~17, so one released with a wave is still walking when the next arrives. That overlap is
 * the point -- but it is why the beetle counts below climb by one or two per night and not by the
 * roach's steps, and why they are released late in a wave rather than with its opening column.
 */
export const night04: NightDef = {
	id: 'night04',
	index: 4,
	mapId: 'counter',
	waves: [
		{
			entries: [{ enemyDefId: 'ant', count: 10, spacingTicks: 58, startDelayTicks: 0, pathId: 'crack' }],
			countdownTicks: OPENING_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 12, spacingTicks: 52, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 2, spacingTicks: 150, startDelayTicks: 420, pathId: 'crack' },
			],
			countdownTicks: 7 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 12, spacingTicks: 48, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 3, spacingTicks: 120, startDelayTicks: 330, pathId: 'crack' },
			],
			countdownTicks: 7 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 14, spacingTicks: 44, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 4, spacingTicks: 100, startDelayTicks: 300, pathId: 'crack' },
			],
			countdownTicks: 7 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 15, spacingTicks: 40, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 5, spacingTicks: 85, startDelayTicks: 260, pathId: 'crack' },
			],
			countdownTicks: 7 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 16, spacingTicks: 36, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 6, spacingTicks: 72, startDelayTicks: 240, pathId: 'crack' },
			],
			countdownTicks: 7 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 18, spacingTicks: 32, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 8, spacingTicks: 60, startDelayTicks: 200, pathId: 'crack' },
			],
			countdownTicks: 7 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 20, spacingTicks: 30, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 10, spacingTicks: 48, startDelayTicks: 180, pathId: 'crack' },
			],
			countdownTicks: 7 * 60,
		},
	],
}

/**
 * The Beetle arrives in wave 3, the way night 3 introduced the Roach: two of them, released well
 * behind that wave's Ants and 5 seconds apart, so the first is watched crossing before the second
 * sets off. Two at 55 HP is 110 HP of one thing at a time, which is what the night is asking about.
 */
export const night05: NightDef = {
	id: 'night05',
	index: 5,
	mapId: 'counter',
	waves: [
		{
			entries: [{ enemyDefId: 'ant', count: 11, spacingTicks: 56, startDelayTicks: 0, pathId: 'crack' }],
			countdownTicks: OPENING_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 12, spacingTicks: 50, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 3, spacingTicks: 120, startDelayTicks: 360, pathId: 'crack' },
			],
			countdownTicks: 7 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 12, spacingTicks: 48, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 3, spacingTicks: 110, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 2, spacingTicks: 300, startDelayTicks: 480, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 13, spacingTicks: 44, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 4, spacingTicks: 95, startDelayTicks: 280, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 2, spacingTicks: 270, startDelayTicks: 440, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 14, spacingTicks: 42, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 4, spacingTicks: 88, startDelayTicks: 260, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 2, spacingTicks: 240, startDelayTicks: 420, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 15, spacingTicks: 38, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 5, spacingTicks: 80, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 2, spacingTicks: 220, startDelayTicks: 400, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 16, spacingTicks: 35, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 6, spacingTicks: 70, startDelayTicks: 220, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 200, startDelayTicks: 360, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 17, spacingTicks: 32, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 7, spacingTicks: 62, startDelayTicks: 200, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 180, startDelayTicks: 340, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 18, spacingTicks: 30, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 8, spacingTicks: 55, startDelayTicks: 180, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 165, startDelayTicks: 320, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
	],
}

/** The Beetle from wave 2 and in every wave after it: what was a visitor on night 5 is the shape of the night here. */
export const night06: NightDef = {
	id: 'night06',
	index: 6,
	mapId: 'counter',
	waves: [
		{
			entries: [
				{ enemyDefId: 'ant', count: 12, spacingTicks: 52, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 3, spacingTicks: 110, startDelayTicks: 360, pathId: 'crack' },
			],
			countdownTicks: OPENING_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 13, spacingTicks: 48, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 4, spacingTicks: 100, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 2, spacingTicks: 270, startDelayTicks: 440, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 14, spacingTicks: 44, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 4, spacingTicks: 92, startDelayTicks: 280, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 2, spacingTicks: 240, startDelayTicks: 420, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 15, spacingTicks: 42, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 5, spacingTicks: 84, startDelayTicks: 260, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 220, startDelayTicks: 400, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 16, spacingTicks: 38, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 6, spacingTicks: 76, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 200, startDelayTicks: 380, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 17, spacingTicks: 35, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 7, spacingTicks: 68, startDelayTicks: 220, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 180, startDelayTicks: 360, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 18, spacingTicks: 33, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 8, spacingTicks: 60, startDelayTicks: 200, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 165, startDelayTicks: 330, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 19, spacingTicks: 30, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 9, spacingTicks: 54, startDelayTicks: 180, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 150, startDelayTicks: 310, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 20, spacingTicks: 28, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 10, spacingTicks: 48, startDelayTicks: 160, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 140, startDelayTicks: 290, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
	],
}

/** Ten waves, all three enemies from the first one, and the last night before the Fly arrives. */
export const night07: NightDef = {
	id: 'night07',
	index: 7,
	mapId: 'counter',
	waves: [
		{
			entries: [
				{ enemyDefId: 'ant', count: 13, spacingTicks: 50, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 4, spacingTicks: 100, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 2, spacingTicks: 260, startDelayTicks: 460, pathId: 'crack' },
			],
			countdownTicks: OPENING_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 14, spacingTicks: 46, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 5, spacingTicks: 92, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 2, spacingTicks: 240, startDelayTicks: 430, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 15, spacingTicks: 43, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 5, spacingTicks: 86, startDelayTicks: 280, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 220, startDelayTicks: 410, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 16, spacingTicks: 40, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 6, spacingTicks: 78, startDelayTicks: 260, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 205, startDelayTicks: 390, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 17, spacingTicks: 37, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 7, spacingTicks: 72, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 190, startDelayTicks: 370, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 18, spacingTicks: 34, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 8, spacingTicks: 66, startDelayTicks: 220, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 175, startDelayTicks: 350, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 19, spacingTicks: 32, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 9, spacingTicks: 60, startDelayTicks: 200, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 160, startDelayTicks: 330, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 20, spacingTicks: 30, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 10, spacingTicks: 55, startDelayTicks: 190, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 150, startDelayTicks: 310, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 21, spacingTicks: 28, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 11, spacingTicks: 50, startDelayTicks: 170, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 140, startDelayTicks: 290, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 22, spacingTicks: 26, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 12, spacingTicks: 45, startDelayTicks: 150, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 130, startDelayTicks: 270, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
	],
}

export const NIGHTS = [night01, night02, night03, night04, night05, night06, night07]
