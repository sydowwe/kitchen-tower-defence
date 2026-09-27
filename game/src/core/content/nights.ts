/**
 * The night schedule -- nights 1 to 13, then 15 to 17 (analytic-docs/CONTENT.md section 6): 6, 7, 8,
 * 8, 9, 9, 10, 10, 10, 11, 11, 12, 12, 13, 13 and 14 waves, Ant from night 1, Roach from night 3,
 * Beetle from night 5, Fly from night 8, Moth from night 10, Mold from night 11, Weevil from night 13,
 * Slug from night 15, Silverfish from night 17. **14 and 18 are missing on purpose** -- see the note
 * above `NIGHTS`. All of them are on the Counter; see the note above `night04` for why every night
 * from 4 on is not on the map section 6 names.
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

/**
 * Nights 8 and 9 are authored **on the Counter**, for the same reason nights 4-7 are: section 6 puts
 * both in the Pantry, the Pantry does not exist, and `createWorld` throws on a night whose `mapId` is
 * not the map it was handed. Wave counts are section 6's: 10 and 10.
 *
 * The Fly is the new enemy, and it changes what a spawn window means. It crosses the `crack`'s 31.1
 * tiles in **~14 seconds** against an Ant's ~31, a Roach's ~17 and a Beetle's ~44 -- the shortest
 * window any tower has ever had, and the reason a range-4 Toaster on the wrong side of the board is
 * worth nothing. So the flies below are released in short, tight runs rather than trickled: a fly
 * that is spaced out is a fly that is never in anyone's circle.
 *
 * **Wave 6 of night 8 is nothing but flies**, called while wave 5's ants and beetles are still
 * crossing (waves overlap by design -- analytic-docs/DECISIONS.md section 5). A board of ground-only
 * towers watches all of it go past, which is the question the night is asking. It is deliberately not
 * the wave with the most ground pressure on it: `spawnDestroyPenalty` buys extra enemies from the
 * *running wave's own composition*, so a Cookie Jar lost during a flies-only wave buys flies at 6
 * crumbs each -- 33 of them for the jar's 200. Wave 7 is mixed rather than a second pure one.
 *
 * These are a draft, from arithmetic. Step 11C watches a night at 1x and 3x and re-tunes them, the
 * way 5C tuned nights 1-3 and 9C tuned 4-7.
 */
export const night08: NightDef = {
	id: 'night08',
	index: 8,
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
			// The Fly arrives the way the Roach and the Beetle did: two of them, well behind the wave's
			// opening column and far enough apart to be watched one at a time.
			entries: [
				{ enemyDefId: 'ant', count: 15, spacingTicks: 44, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 5, spacingTicks: 86, startDelayTicks: 280, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 220, startDelayTicks: 410, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 2, spacingTicks: 150, startDelayTicks: 480, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 16, spacingTicks: 40, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 6, spacingTicks: 78, startDelayTicks: 260, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 205, startDelayTicks: 390, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 3, spacingTicks: 120, startDelayTicks: 420, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 17, spacingTicks: 37, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 7, spacingTicks: 72, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 190, startDelayTicks: 370, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 4, spacingTicks: 100, startDelayTicks: 400, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			// Flies and nothing else, over 8 seconds, on top of everything wave 5 still has walking.
			entries: [{ enemyDefId: 'fly', count: 10, spacingTicks: 55, startDelayTicks: 0, pathId: 'crack' }],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 18, spacingTicks: 34, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 8, spacingTicks: 66, startDelayTicks: 220, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 175, startDelayTicks: 350, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 4, spacingTicks: 95, startDelayTicks: 380, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 20, spacingTicks: 30, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 10, spacingTicks: 55, startDelayTicks: 190, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 150, startDelayTicks: 310, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 5, spacingTicks: 85, startDelayTicks: 360, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 21, spacingTicks: 28, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 11, spacingTicks: 50, startDelayTicks: 170, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 140, startDelayTicks: 290, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 6, spacingTicks: 75, startDelayTicks: 340, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 22, spacingTicks: 26, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 12, spacingTicks: 45, startDelayTicks: 150, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 130, startDelayTicks: 270, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 65, startDelayTicks: 320, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
	],
}

/**
 * **Night 9 introduces nothing.** Section 6 gives it the Nightlight unlock and no new enemy, and
 * unlocks are step 20's -- so it is night 8 with more of everything, which is the honest content for
 * a night whose job is to let the fly pressure settle before the Moth arrives on night 10.
 *
 * Flies are in every wave from the first one here, including a second pure-fly wave: what was a
 * question on night 8 is the shape of the night on night 9, the way the Beetle went from a visitor on
 * night 5 to the shape of night 6.
 */
export const night09: NightDef = {
	id: 'night09',
	index: 9,
	mapId: 'counter',
	waves: [
		{
			entries: [
				{ enemyDefId: 'ant', count: 14, spacingTicks: 48, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 5, spacingTicks: 95, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 2, spacingTicks: 250, startDelayTicks: 440, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 3, spacingTicks: 110, startDelayTicks: 460, pathId: 'crack' },
			],
			countdownTicks: OPENING_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 15, spacingTicks: 44, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 6, spacingTicks: 88, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 230, startDelayTicks: 420, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 4, spacingTicks: 100, startDelayTicks: 420, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 16, spacingTicks: 42, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 6, spacingTicks: 82, startDelayTicks: 280, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 215, startDelayTicks: 400, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 5, spacingTicks: 90, startDelayTicks: 400, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 17, spacingTicks: 38, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 7, spacingTicks: 76, startDelayTicks: 260, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 200, startDelayTicks: 380, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 5, spacingTicks: 85, startDelayTicks: 380, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			// The second flies-only wave in the campaign, and the first one a player has seen coming.
			entries: [{ enemyDefId: 'fly', count: 12, spacingTicks: 50, startDelayTicks: 0, pathId: 'crack' }],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 18, spacingTicks: 35, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 8, spacingTicks: 70, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 185, startDelayTicks: 360, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 6, spacingTicks: 80, startDelayTicks: 360, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 19, spacingTicks: 32, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 9, spacingTicks: 62, startDelayTicks: 220, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 170, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 7, spacingTicks: 72, startDelayTicks: 340, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 21, spacingTicks: 29, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 10, spacingTicks: 54, startDelayTicks: 200, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 155, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 68, startDelayTicks: 320, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 22, spacingTicks: 27, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 12, spacingTicks: 48, startDelayTicks: 180, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 145, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 9, spacingTicks: 62, startDelayTicks: 300, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 24, spacingTicks: 25, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 13, spacingTicks: 44, startDelayTicks: 160, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 7, spacingTicks: 125, startDelayTicks: 280, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 11, spacingTicks: 55, startDelayTicks: 280, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
	],
}

/**
 * Night 10 is authored **on the Counter, single-lane**, for the same reason nights 4-9 are: section 6
 * puts it on the Stove and gives it the game's second spawn point, neither the map nor the lane
 * exists, and step 21 is what authors both. `createWorld` throws on a night whose `mapId` is not the
 * map it was handed. Wave count is section 6's: 11.
 *
 * The Moth is the new enemy, and it is the only one whose arrival is about watching rather than
 * about pressure: it crosses the `crack`'s 31.1 tiles in ~19 seconds, between the Roach's ~17 and the
 * Ant's ~31, and what makes it different is that it curves off the lane toward a Nightlight. So it
 * arrives the way the Roach did on night 3, the Beetle on night 5 and the Fly on night 8 -- **two of
 * them in wave 3**, released well behind that wave's ground column and 3 seconds apart. A moth in a
 * clump of flies is a moth nobody notices curving, and there is no other way to see what the mechanic
 * does.
 *
 * A draft, from arithmetic against night 9. Step 11C watches it at 1x and 3x and re-tunes it.
 */
export const night10: NightDef = {
	id: 'night10',
	index: 10,
	mapId: 'counter',
	waves: [
		{
			entries: [
				{ enemyDefId: 'ant', count: 15, spacingTicks: 46, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 5, spacingTicks: 92, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 240, startDelayTicks: 440, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 4, spacingTicks: 105, startDelayTicks: 460, pathId: 'crack' },
			],
			countdownTicks: OPENING_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 16, spacingTicks: 43, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 6, spacingTicks: 86, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 225, startDelayTicks: 420, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 5, spacingTicks: 95, startDelayTicks: 420, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			// The Moth arrives: two of them, 180 ticks apart and 9 seconds behind the wave's opening
			// column, so the first is watched crossing before the second sets off.
			entries: [
				{ enemyDefId: 'ant', count: 16, spacingTicks: 42, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 6, spacingTicks: 82, startDelayTicks: 280, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 215, startDelayTicks: 400, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 5, spacingTicks: 90, startDelayTicks: 400, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 2, spacingTicks: 180, startDelayTicks: 540, pathId: 'crack' },
			],
			countdownTicks: 9 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 17, spacingTicks: 38, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 7, spacingTicks: 76, startDelayTicks: 260, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 200, startDelayTicks: 380, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 6, spacingTicks: 85, startDelayTicks: 380, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 3, spacingTicks: 150, startDelayTicks: 480, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 18, spacingTicks: 35, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 8, spacingTicks: 70, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 185, startDelayTicks: 360, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 6, spacingTicks: 80, startDelayTicks: 360, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 3, spacingTicks: 140, startDelayTicks: 440, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			// The night's flyers-only wave, and the first one with both kinds in it: the moths curve at
			// whatever light is on the board while the flies go straight past it.
			entries: [
				{ enemyDefId: 'fly', count: 12, spacingTicks: 50, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 5, spacingTicks: 110, startDelayTicks: 120, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 19, spacingTicks: 33, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 9, spacingTicks: 64, startDelayTicks: 220, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 175, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 7, spacingTicks: 74, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 4, spacingTicks: 130, startDelayTicks: 420, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 21, spacingTicks: 30, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 10, spacingTicks: 56, startDelayTicks: 200, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 160, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 70, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 4, spacingTicks: 120, startDelayTicks: 400, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 22, spacingTicks: 28, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 12, spacingTicks: 50, startDelayTicks: 180, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 150, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 9, spacingTicks: 64, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 5, spacingTicks: 110, startDelayTicks: 380, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 24, spacingTicks: 26, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 13, spacingTicks: 46, startDelayTicks: 160, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 7, spacingTicks: 130, startDelayTicks: 280, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 11, spacingTicks: 58, startDelayTicks: 280, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 6, spacingTicks: 100, startDelayTicks: 360, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 26, spacingTicks: 24, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 14, spacingTicks: 42, startDelayTicks: 150, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 8, spacingTicks: 120, startDelayTicks: 260, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 12, spacingTicks: 52, startDelayTicks: 260, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 8, spacingTicks: 90, startDelayTicks: 340, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
	],
}

/**
 * Nights 11, 12, 13, 15, 16 and 17 are authored **on the Counter, single-lane**, for the same reason
 * nights 4-10 are: section 6 puts 11 and 12 on the Stove, 13 and 15 on the Table and 16 and 17 on the
 * Floor -- with a third spawn point from 16 -- none of those maps exists, and step 21 authors them.
 * Wave counts are section 6's: 11, 12, 12, 13, 13 and 14. Nights 14 and 18 are missing on purpose --
 * see the note above `NIGHTS`.
 *
 * The Mold is the new enemy on night 11, and it arrives the way every other one has: **two of them in
 * wave 3**, well behind the wave's opening column and four seconds apart. What no other enemy needed
 * is `startDistanceTiles` -- it does not walk, so where it appears is the whole of where it is. Each
 * is released at its own distance, one per entry, and the later waves put more of them in at
 * *different* distances, so a Vinegar Spray parked on the first one does not answer the next.
 *
 * Where a mold sits is also where its enemy can be shot from. **Where its patch grows is not the
 * placement's to choose:** `spreadSystem` picks from the frontier of every molded cell on the board
 * and prefers track, so an ignored night eats the whole road first and then the build space either side
 * of it, everywhere at once. Every distance below is chosen so the mold stands in reach of a pocket --
 * a mold nobody can shoot is a night that never ends, because `resolveSystem` only calls it won on an
 * empty board.
 *
 * One entry per mold, never `count: 2`: nightmare's `enemyCountMult` of 1.25 rounds a 2 to a 3 and
 * leaves a 1 alone, and three molds on one distance is one patch growing three times as fast rather
 * than three problems. The flyers-only wave carries none, so a Cookie Jar lost in it buys flies and
 * moths rather than permanent board damage (`spawnDestroyPenalty` buys from the running wave's own
 * entries).
 *
 * **The mold counts are measured, not guessed.** The first draft had 16, 21 and 15 molds on nights 11,
 * 12 and 15, and run headless with every one of them ignored, each night molded the whole board. They
 * are 12, 11 and 9 now, against the mold's 12-second pulse -- see the note on `mold` in
 * `core/content/enemies.ts` for what an ignored night costs at that rate.
 *
 * Everything else is a draft from arithmetic against night 10. Nobody has watched these yet.
 */
export const night11: NightDef = {
	id: 'night11',
	index: 11,
	mapId: 'counter',
	waves: [
		{
			entries: [
				{ enemyDefId: 'ant', count: 16, spacingTicks: 43, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 6, spacingTicks: 86, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 225, startDelayTicks: 420, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 5, spacingTicks: 95, startDelayTicks: 420, pathId: 'crack' },
			],
			countdownTicks: OPENING_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 17, spacingTicks: 40, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 7, spacingTicks: 80, startDelayTicks: 280, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 210, startDelayTicks: 400, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 5, spacingTicks: 90, startDelayTicks: 400, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 2, spacingTicks: 160, startDelayTicks: 480, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			// The Mold arrives: two of them, 10 and 14 seconds into the wave, one in the middle pocket
			// and one on the top run. No moths, so the new thing on the board is the only new thing.
			entries: [
				{ enemyDefId: 'ant', count: 17, spacingTicks: 40, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 7, spacingTicks: 78, startDelayTicks: 280, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 205, startDelayTicks: 400, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 5, spacingTicks: 88, startDelayTicks: 400, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 600,
					pathId: 'crack',
					startDistanceTiles: 13,
				},
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 840,
					pathId: 'crack',
					startDistanceTiles: 24,
				},
			],
			countdownTicks: 9 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 18, spacingTicks: 37, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 8, spacingTicks: 72, startDelayTicks: 260, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 190, startDelayTicks: 380, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 6, spacingTicks: 82, startDelayTicks: 380, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 3, spacingTicks: 145, startDelayTicks: 460, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 19, spacingTicks: 35, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 8, spacingTicks: 68, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 180, startDelayTicks: 360, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 6, spacingTicks: 78, startDelayTicks: 360, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 3, spacingTicks: 135, startDelayTicks: 440, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 300,
					pathId: 'crack',
					startDistanceTiles: 8.5,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'fly', count: 13, spacingTicks: 48, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 6, spacingTicks: 105, startDelayTicks: 120, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 20, spacingTicks: 32, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 9, spacingTicks: 62, startDelayTicks: 220, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 170, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 7, spacingTicks: 72, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 4, spacingTicks: 125, startDelayTicks: 420, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 200,
					pathId: 'crack',
					startDistanceTiles: 4,
				},
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 700,
					pathId: 'crack',
					startDistanceTiles: 26.5,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 22, spacingTicks: 29, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 11, spacingTicks: 54, startDelayTicks: 200, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 155, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 68, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 4, spacingTicks: 115, startDelayTicks: 400, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 23, spacingTicks: 27, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 12, spacingTicks: 49, startDelayTicks: 180, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 145, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 9, spacingTicks: 62, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 5, spacingTicks: 108, startDelayTicks: 380, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 200,
					pathId: 'crack',
					startDistanceTiles: 11,
				},
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 640,
					pathId: 'crack',
					startDistanceTiles: 28.5,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 25, spacingTicks: 25, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 13, spacingTicks: 45, startDelayTicks: 160, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 7, spacingTicks: 128, startDelayTicks: 280, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 11, spacingTicks: 56, startDelayTicks: 280, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 6, spacingTicks: 98, startDelayTicks: 360, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 240,
					pathId: 'crack',
					startDistanceTiles: 6.5,
				},
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 520,
					pathId: 'crack',
					startDistanceTiles: 17.5,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 27, spacingTicks: 23, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 15, spacingTicks: 41, startDelayTicks: 150, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 8, spacingTicks: 118, startDelayTicks: 260, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 12, spacingTicks: 50, startDelayTicks: 260, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 8, spacingTicks: 88, startDelayTicks: 340, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 200,
					pathId: 'crack',
					startDistanceTiles: 9,
				},
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 360,
					pathId: 'crack',
					startDistanceTiles: 14,
				},
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 520,
					pathId: 'crack',
					startDistanceTiles: 22.5,
				},
			],
			countdownTicks: 8 * 60,
		},
	],
}

/**
 * Night 12: the mold is the shape of the night, the way the Beetle was on night 6 -- one or more in
 * ten of the twelve waves, from wave 1. The flyers-only wave carries none, for the Cookie Jar reason
 * above night 11, and neither does wave 9, so there is one breath in the back half to go and clean up.
 *
 * Section 6 gives this night the Gas Stove Burner unlock. Step 17D ran it headless with the Burner and
 * left every wave as it was: a Salt Shaker and Toaster line held it with or without one, and a Burner
 * on the lane barely moved the meter on its own (7 at most, two of them) -- what it cost was the wakes
 * it added on top of an already loud Toaster line, one to three, which is the price it is meant to have.
 */
export const night12: NightDef = {
	id: 'night12',
	index: 12,
	mapId: 'counter',
	waves: [
		{
			entries: [
				{ enemyDefId: 'ant', count: 17, spacingTicks: 40, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 7, spacingTicks: 80, startDelayTicks: 280, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 210, startDelayTicks: 400, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 5, spacingTicks: 90, startDelayTicks: 400, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 360,
					pathId: 'crack',
					startDistanceTiles: 13,
				},
			],
			countdownTicks: OPENING_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 18, spacingTicks: 38, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 7, spacingTicks: 76, startDelayTicks: 260, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 200, startDelayTicks: 380, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 6, spacingTicks: 86, startDelayTicks: 380, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 2, spacingTicks: 150, startDelayTicks: 460, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 300,
					pathId: 'crack',
					startDistanceTiles: 24,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 18, spacingTicks: 37, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 8, spacingTicks: 72, startDelayTicks: 260, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 190, startDelayTicks: 380, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 6, spacingTicks: 82, startDelayTicks: 380, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 3, spacingTicks: 140, startDelayTicks: 460, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 240,
					pathId: 'crack',
					startDistanceTiles: 8.5,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 19, spacingTicks: 35, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 8, spacingTicks: 68, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 180, startDelayTicks: 360, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 6, spacingTicks: 78, startDelayTicks: 360, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 3, spacingTicks: 135, startDelayTicks: 440, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 300,
					pathId: 'crack',
					startDistanceTiles: 28.5,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 20, spacingTicks: 33, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 9, spacingTicks: 64, startDelayTicks: 220, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 170, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 7, spacingTicks: 74, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 4, spacingTicks: 125, startDelayTicks: 420, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 200,
					pathId: 'crack',
					startDistanceTiles: 4,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'fly', count: 14, spacingTicks: 46, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 7, spacingTicks: 100, startDelayTicks: 120, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 21, spacingTicks: 31, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 10, spacingTicks: 58, startDelayTicks: 210, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 160, startDelayTicks: 330, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 70, startDelayTicks: 330, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 4, spacingTicks: 120, startDelayTicks: 400, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 200,
					pathId: 'crack',
					startDistanceTiles: 11,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 22, spacingTicks: 29, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 11, spacingTicks: 54, startDelayTicks: 200, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 150, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 66, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 5, spacingTicks: 112, startDelayTicks: 390, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 480,
					pathId: 'crack',
					startDistanceTiles: 17.5,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 24, spacingTicks: 27, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 12, spacingTicks: 50, startDelayTicks: 190, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 140, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 9, spacingTicks: 62, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 5, spacingTicks: 106, startDelayTicks: 380, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 25, spacingTicks: 25, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 13, spacingTicks: 46, startDelayTicks: 170, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 7, spacingTicks: 130, startDelayTicks: 290, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 10, spacingTicks: 58, startDelayTicks: 290, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 6, spacingTicks: 100, startDelayTicks: 360, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 200,
					pathId: 'crack',
					startDistanceTiles: 9,
				},
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 520,
					pathId: 'crack',
					startDistanceTiles: 22.5,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 27, spacingTicks: 23, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 14, spacingTicks: 42, startDelayTicks: 160, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 8, spacingTicks: 120, startDelayTicks: 270, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 11, spacingTicks: 54, startDelayTicks: 270, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 7, spacingTicks: 92, startDelayTicks: 350, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 200,
					pathId: 'crack',
					startDistanceTiles: 3,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 29, spacingTicks: 21, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 16, spacingTicks: 38, startDelayTicks: 150, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 9, spacingTicks: 110, startDelayTicks: 260, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 13, spacingTicks: 48, startDelayTicks: 260, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 8, spacingTicks: 84, startDelayTicks: 340, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 320,
					pathId: 'crack',
					startDistanceTiles: 13,
				},
			],
			countdownTicks: 8 * 60,
		},
	],
}

/**
 * Night 13: the Weevil. Section 6 gives it the Bay Leaf unlock too, which is step 20's -- the tower
 * already exists, and this night is what makes it a decision.
 *
 * Two of them in wave 3, released after the wave's last Ant and five seconds apart, so each is watched
 * going under and coming back up on its own. After that they are folded into the ground column in
 * growing numbers, and never given a wave of their own: a Cookie Jar lost in a Weevil-only wave buys
 * twenty-odd of them, each with its own window (`spawnDestroyPenalty` buys from the running wave).
 *
 * What the night asks: with the Weevil's fractions its window runs from somewhere in the first third
 * of the `crack` to somewhere past the middle, so a line built entirely at the start of the track has
 * it for a few seconds before it is gone. No molds -- the Weevil is the only new question, and night
 * 16 is where the two meet.
 */
export const night13: NightDef = {
	id: 'night13',
	index: 13,
	mapId: 'counter',
	waves: [
		{
			entries: [
				{ enemyDefId: 'ant', count: 18, spacingTicks: 38, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 7, spacingTicks: 76, startDelayTicks: 260, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 200, startDelayTicks: 380, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 6, spacingTicks: 84, startDelayTicks: 380, pathId: 'crack' },
			],
			countdownTicks: OPENING_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 19, spacingTicks: 36, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 8, spacingTicks: 72, startDelayTicks: 250, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 190, startDelayTicks: 370, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 6, spacingTicks: 80, startDelayTicks: 370, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 2, spacingTicks: 150, startDelayTicks: 450, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			// The Weevil arrives: two, behind the last Ant and 300 ticks apart.
			entries: [
				{ enemyDefId: 'ant', count: 19, spacingTicks: 35, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 8, spacingTicks: 70, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 185, startDelayTicks: 360, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 6, spacingTicks: 78, startDelayTicks: 360, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 2, spacingTicks: 300, startDelayTicks: 780, pathId: 'crack' },
			],
			countdownTicks: 9 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 20, spacingTicks: 33, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 3, spacingTicks: 160, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 8, spacingTicks: 66, startDelayTicks: 230, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 175, startDelayTicks: 350, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 7, spacingTicks: 74, startDelayTicks: 350, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 3, spacingTicks: 135, startDelayTicks: 430, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 21, spacingTicks: 31, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 4, spacingTicks: 130, startDelayTicks: 260, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 9, spacingTicks: 62, startDelayTicks: 220, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 165, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 7, spacingTicks: 70, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 3, spacingTicks: 125, startDelayTicks: 420, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'fly', count: 14, spacingTicks: 46, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 7, spacingTicks: 100, startDelayTicks: 120, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 22, spacingTicks: 30, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 5, spacingTicks: 110, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 10, spacingTicks: 58, startDelayTicks: 210, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 160, startDelayTicks: 330, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 68, startDelayTicks: 330, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 4, spacingTicks: 120, startDelayTicks: 400, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 23, spacingTicks: 28, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 6, spacingTicks: 95, startDelayTicks: 220, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 11, spacingTicks: 54, startDelayTicks: 200, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 150, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 64, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 5, spacingTicks: 112, startDelayTicks: 390, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 24, spacingTicks: 27, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 7, spacingTicks: 85, startDelayTicks: 200, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 12, spacingTicks: 50, startDelayTicks: 190, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 140, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 9, spacingTicks: 60, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 5, spacingTicks: 106, startDelayTicks: 380, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 25, spacingTicks: 25, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 8, spacingTicks: 75, startDelayTicks: 180, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 13, spacingTicks: 46, startDelayTicks: 170, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 7, spacingTicks: 130, startDelayTicks: 290, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 10, spacingTicks: 56, startDelayTicks: 290, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 6, spacingTicks: 100, startDelayTicks: 360, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 26, spacingTicks: 24, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 9, spacingTicks: 68, startDelayTicks: 160, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 14, spacingTicks: 43, startDelayTicks: 160, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 8, spacingTicks: 122, startDelayTicks: 270, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 11, spacingTicks: 52, startDelayTicks: 270, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 7, spacingTicks: 92, startDelayTicks: 350, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 28, spacingTicks: 22, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 11, spacingTicks: 58, startDelayTicks: 150, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 15, spacingTicks: 40, startDelayTicks: 150, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 9, spacingTicks: 112, startDelayTicks: 260, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 12, spacingTicks: 48, startDelayTicks: 260, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 8, spacingTicks: 84, startDelayTicks: 340, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
	],
}

/**
 * Night 15: the Slug, and the loudest night in v1. Section 6 calls it "after a dinner party -- double
 * crumbs, double spawns"; that modifier is step 21's, so here it is authored into the composition
 * instead -- counts above night 12's and spacing tighter -- and nothing multiplies anything.
 *
 * Two slugs in wave 3, ten seconds apart, released behind the wave's column on the usual pattern.
 * After that, **slugs lead roach runs**: a slug at the head of the wave and a tight roach column
 * released 15 to 25 seconds behind it. Not the 4-6 seconds step 15C first asked for, and the reason is
 * arithmetic. A Slug walks 0.4 tiles a second and a Roach ~1.83, so a column released 5 seconds
 * behind catches the slug 2.6 tiles out of the crack -- on its trail for a tile or two, nowhere near a
 * tower. Twenty seconds' lead puts the slug ~8 tiles in, so the column hits the wet road in the
 * middle pocket, where the towers are, and that is the only place a speed-up is worth anything.
 *
 * Those waves spawn over ~20 seconds against an 8-second gap, against the file's pacing rule, and on
 * purpose: the lead *is* the mechanic. Wave 7 is the chaos wave -- flyers and ground at once, the
 * densest on the night -- and it carries neither molds nor slugs, so a Cookie Jar lost in it buys
 * nothing permanent.
 */
export const night15: NightDef = {
	id: 'night15',
	index: 15,
	mapId: 'counter',
	waves: [
		{
			entries: [
				{ enemyDefId: 'ant', count: 22, spacingTicks: 32, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 9, spacingTicks: 60, startDelayTicks: 220, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 165, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 7, spacingTicks: 72, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 4, spacingTicks: 120, startDelayTicks: 420, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 300,
					pathId: 'crack',
					startDistanceTiles: 13,
				},
			],
			countdownTicks: OPENING_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 24, spacingTicks: 30, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 10, spacingTicks: 56, startDelayTicks: 200, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 155, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 68, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 4, spacingTicks: 115, startDelayTicks: 400, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 300,
					pathId: 'crack',
					startDistanceTiles: 24,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			// The Slug arrives: two of them, ten seconds apart and well behind the column, so each is
			// watched laying its road before anything much walks on it.
			entries: [
				{ enemyDefId: 'ant', count: 24, spacingTicks: 30, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 10, spacingTicks: 56, startDelayTicks: 200, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 150, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 66, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'slug', count: 2, spacingTicks: 600, startDelayTicks: 480, pathId: 'crack' },
			],
			countdownTicks: 9 * 60,
		},
		{
			// The first slug-led run: the slug alone at the head, the roaches 20 seconds behind it.
			entries: [
				{ enemyDefId: 'slug', count: 1, spacingTicks: 60, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 26, spacingTicks: 28, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 150, startDelayTicks: 360, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 64, startDelayTicks: 360, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 5, spacingTicks: 110, startDelayTicks: 440, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 14, spacingTicks: 20, startDelayTicks: 1200, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 27, spacingTicks: 27, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 11, spacingTicks: 50, startDelayTicks: 200, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 145, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 9, spacingTicks: 62, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 5, spacingTicks: 108, startDelayTicks: 380, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 240,
					pathId: 'crack',
					startDistanceTiles: 8.5,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'slug', count: 2, spacingTicks: 240, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 28, spacingTicks: 26, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 140, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 9, spacingTicks: 60, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 16, spacingTicks: 18, startDelayTicks: 1140, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			// The chaos wave: everything that flies and a ground rush under it, and nothing permanent.
			entries: [
				{ enemyDefId: 'fly', count: 18, spacingTicks: 34, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 9, spacingTicks: 70, startDelayTicks: 100, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 30, spacingTicks: 22, startDelayTicks: 200, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 14, spacingTicks: 40, startDelayTicks: 300, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 30, spacingTicks: 24, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 13, spacingTicks: 46, startDelayTicks: 180, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 7, spacingTicks: 130, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 10, spacingTicks: 56, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 6, spacingTicks: 100, startDelayTicks: 360, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 200,
					pathId: 'crack',
					startDistanceTiles: 4,
				},
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 640,
					pathId: 'crack',
					startDistanceTiles: 26.5,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			// The longest lead on the night: 25 seconds, so the roaches meet the slug past the middle
			// pocket's first corner.
			entries: [
				{ enemyDefId: 'slug', count: 1, spacingTicks: 60, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 31, spacingTicks: 23, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 7, spacingTicks: 125, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 11, spacingTicks: 54, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 6, spacingTicks: 96, startDelayTicks: 400, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 18, spacingTicks: 17, startDelayTicks: 1500, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 32, spacingTicks: 22, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 15, spacingTicks: 42, startDelayTicks: 170, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 8, spacingTicks: 120, startDelayTicks: 290, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 12, spacingTicks: 50, startDelayTicks: 290, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 7, spacingTicks: 90, startDelayTicks: 350, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 200,
					pathId: 'crack',
					startDistanceTiles: 11,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'slug', count: 2, spacingTicks: 300, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 33, spacingTicks: 21, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 8, spacingTicks: 115, startDelayTicks: 330, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 12, spacingTicks: 48, startDelayTicks: 330, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 7, spacingTicks: 86, startDelayTicks: 390, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 20, spacingTicks: 16, startDelayTicks: 1200, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 35, spacingTicks: 20, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 17, spacingTicks: 38, startDelayTicks: 160, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 9, spacingTicks: 108, startDelayTicks: 270, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 13, spacingTicks: 46, startDelayTicks: 270, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 8, spacingTicks: 82, startDelayTicks: 340, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 360,
					pathId: 'crack',
					startDistanceTiles: 14,
				},
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 520,
					pathId: 'crack',
					startDistanceTiles: 22.5,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'slug', count: 3, spacingTicks: 300, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 38, spacingTicks: 19, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 10, spacingTicks: 100, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 15, spacingTicks: 42, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 9, spacingTicks: 78, startDelayTicks: 380, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 240,
					pathId: 'crack',
					startDistanceTiles: 9,
				},
				{ enemyDefId: 'roach', count: 24, spacingTicks: 15, startDelayTicks: 1200, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
	],
}

/**
 * Night 16 introduces nothing. It is the night that asks for everything from 11 to 15 at once: slug-led
 * runs with Weevils released behind the slug, so they surface onto a wet road, and molds dropped at
 * 8.5, 11 and 13 tiles -- the middle pocket's corner, which is where a Bay Leaf covering the Weevil's
 * window wants to stand. Every mold distance is one 15C already placed in reach of a pocket.
 *
 * The flyers-only wave and the chaos wave carry nothing permanent, for the Cookie Jar reason above
 * night 11. Section 6 gives it the Honey Pot unlock. Step 17D ran it headless with a pot inside and
 * outside a tower line and left every wave as it was: the pot changed no food lost either way, because
 * its feeders are held wherever it stands. What the night does decide is the pot's own life
 * (analytic-docs/OPEN-QUESTIONS.md, the Honey Pot).
 */
export const night16: NightDef = {
	id: 'night16',
	index: 16,
	mapId: 'counter',
	waves: [
		{
			entries: [
				{ enemyDefId: 'ant', count: 22, spacingTicks: 32, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 9, spacingTicks: 60, startDelayTicks: 220, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 165, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 7, spacingTicks: 72, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 3, spacingTicks: 140, startDelayTicks: 300, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 300,
					pathId: 'crack',
					startDistanceTiles: 13,
				},
			],
			countdownTicks: OPENING_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 23, spacingTicks: 30, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 10, spacingTicks: 56, startDelayTicks: 200, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 155, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 68, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 4, spacingTicks: 115, startDelayTicks: 400, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 4, spacingTicks: 120, startDelayTicks: 260, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 300,
					pathId: 'crack',
					startDistanceTiles: 24,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			// The first slug-led run: Weevils 10 seconds behind the slug, going under onto its road.
			entries: [
				{ enemyDefId: 'slug', count: 1, spacingTicks: 60, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 24, spacingTicks: 28, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 150, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 64, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 5, spacingTicks: 100, startDelayTicks: 600, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 12, spacingTicks: 20, startDelayTicks: 1200, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 24, spacingTicks: 28, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 11, spacingTicks: 52, startDelayTicks: 200, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 145, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 9, spacingTicks: 62, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 5, spacingTicks: 108, startDelayTicks: 380, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 5, spacingTicks: 100, startDelayTicks: 240, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 200,
					pathId: 'crack',
					startDistanceTiles: 11,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'fly', count: 16, spacingTicks: 40, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 8, spacingTicks: 80, startDelayTicks: 100, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'slug', count: 2, spacingTicks: 240, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 26, spacingTicks: 26, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 140, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 9, spacingTicks: 60, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 6, spacingTicks: 90, startDelayTicks: 500, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 14, spacingTicks: 18, startDelayTicks: 1140, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 27, spacingTicks: 25, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 12, spacingTicks: 48, startDelayTicks: 190, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 7, spacingTicks: 130, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 10, spacingTicks: 58, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 6, spacingTicks: 100, startDelayTicks: 360, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 6, spacingTicks: 88, startDelayTicks: 220, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 240,
					pathId: 'crack',
					startDistanceTiles: 8.5,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			// The chaos wave: everything that flies and a ground rush under it, and nothing permanent.
			entries: [
				{ enemyDefId: 'fly', count: 18, spacingTicks: 34, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 9, spacingTicks: 70, startDelayTicks: 100, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 30, spacingTicks: 22, startDelayTicks: 200, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 14, spacingTicks: 40, startDelayTicks: 300, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 28, spacingTicks: 24, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 13, spacingTicks: 46, startDelayTicks: 180, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 7, spacingTicks: 125, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 10, spacingTicks: 56, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 6, spacingTicks: 96, startDelayTicks: 360, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 7, spacingTicks: 80, startDelayTicks: 200, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 200,
					pathId: 'crack',
					startDistanceTiles: 4,
				},
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 640,
					pathId: 'crack',
					startDistanceTiles: 26.5,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'slug', count: 1, spacingTicks: 60, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 30, spacingTicks: 23, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 8, spacingTicks: 120, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 11, spacingTicks: 54, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 8, spacingTicks: 72, startDelayTicks: 600, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 18, spacingTicks: 17, startDelayTicks: 1500, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 31, spacingTicks: 22, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 14, spacingTicks: 42, startDelayTicks: 170, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 8, spacingTicks: 118, startDelayTicks: 290, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 12, spacingTicks: 50, startDelayTicks: 290, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 7, spacingTicks: 90, startDelayTicks: 350, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 8, spacingTicks: 70, startDelayTicks: 200, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 360,
					pathId: 'crack',
					startDistanceTiles: 13,
				},
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 520,
					pathId: 'crack',
					startDistanceTiles: 22.5,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'slug', count: 2, spacingTicks: 300, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 32, spacingTicks: 21, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 9, spacingTicks: 112, startDelayTicks: 330, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 12, spacingTicks: 48, startDelayTicks: 330, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 7, spacingTicks: 86, startDelayTicks: 390, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 9, spacingTicks: 64, startDelayTicks: 560, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 20, spacingTicks: 16, startDelayTicks: 1200, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'slug', count: 3, spacingTicks: 300, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 35, spacingTicks: 20, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 10, spacingTicks: 100, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 14, spacingTicks: 44, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 8, spacingTicks: 80, startDelayTicks: 380, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 11, spacingTicks: 56, startDelayTicks: 500, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 240,
					pathId: 'crack',
					startDistanceTiles: 9,
				},
				{ enemyDefId: 'roach', count: 24, spacingTicks: 15, startDelayTicks: 1200, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
	],
}

/**
 * Night 17: the Silverfish. Two in wave 3, released after the wave's last Ant and five seconds apart,
 * then more of them in every ground wave. At 0.6 tiles a second one takes ~52 seconds to cross, so a
 * wave's Silverfish are still walking when the next wave arrives -- the Beetle's overlap, by design.
 *
 * What the night asks (16C, decision 7): `armored` is x0.4 physical, so a line of Salt Shakers lands
 * ~20 on one per shaker per pass against its 110 HP. It is answered **non-physically** -- chemical at
 * 1.0 from a Spray Bottle, Vinegar Spray or Baking Soda, cold at 1.2 -- or with **a Lemon plus
 * physical**, since Armor Strip moves the 0.4 halfway to 1.0 for everything that hits after it.
 *
 * Never a Silverfish-only wave: a Cookie Jar lost in one buys eleven 110-HP walls. Two chaos-shaped
 * waves carry none at all.
 */
export const night17: NightDef = {
	id: 'night17',
	index: 17,
	mapId: 'counter',
	waves: [
		{
			entries: [
				{ enemyDefId: 'ant', count: 24, spacingTicks: 30, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 10, spacingTicks: 56, startDelayTicks: 200, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 160, startDelayTicks: 330, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 70, startDelayTicks: 330, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 4, spacingTicks: 120, startDelayTicks: 260, pathId: 'crack' },
			],
			countdownTicks: OPENING_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 25, spacingTicks: 29, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 10, spacingTicks: 54, startDelayTicks: 200, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 150, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 66, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 4, spacingTicks: 110, startDelayTicks: 400, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 4, spacingTicks: 110, startDelayTicks: 240, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 300,
					pathId: 'crack',
					startDistanceTiles: 13,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			// The Silverfish arrives: two, behind the last Ant and 300 ticks apart.
			entries: [
				{ enemyDefId: 'ant', count: 25, spacingTicks: 28, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 11, spacingTicks: 52, startDelayTicks: 200, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 150, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 64, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 4, spacingTicks: 110, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'silverfish', count: 2, spacingTicks: 300, startDelayTicks: 780, pathId: 'crack' },
			],
			countdownTicks: 9 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 26, spacingTicks: 27, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 11, spacingTicks: 50, startDelayTicks: 190, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 145, startDelayTicks: 310, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 9, spacingTicks: 62, startDelayTicks: 310, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 5, spacingTicks: 105, startDelayTicks: 380, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 5, spacingTicks: 100, startDelayTicks: 230, pathId: 'crack' },
				{ enemyDefId: 'silverfish', count: 2, spacingTicks: 260, startDelayTicks: 420, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'slug', count: 1, spacingTicks: 60, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 27, spacingTicks: 26, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 9, spacingTicks: 60, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'silverfish', count: 3, spacingTicks: 220, startDelayTicks: 400, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 5, spacingTicks: 95, startDelayTicks: 560, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 14, spacingTicks: 19, startDelayTicks: 1200, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'fly', count: 17, spacingTicks: 38, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 8, spacingTicks: 76, startDelayTicks: 100, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 28, spacingTicks: 25, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 12, spacingTicks: 48, startDelayTicks: 180, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 135, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 10, spacingTicks: 58, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 5, spacingTicks: 100, startDelayTicks: 360, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 6, spacingTicks: 88, startDelayTicks: 220, pathId: 'crack' },
				{ enemyDefId: 'silverfish', count: 3, spacingTicks: 200, startDelayTicks: 380, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 300,
					pathId: 'crack',
					startDistanceTiles: 24,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 29, spacingTicks: 24, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 13, spacingTicks: 46, startDelayTicks: 180, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 130, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 10, spacingTicks: 56, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 6, spacingTicks: 96, startDelayTicks: 360, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 6, spacingTicks: 84, startDelayTicks: 210, pathId: 'crack' },
				{ enemyDefId: 'silverfish', count: 4, spacingTicks: 180, startDelayTicks: 360, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'slug', count: 2, spacingTicks: 240, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 30, spacingTicks: 23, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 11, spacingTicks: 54, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'silverfish', count: 4, spacingTicks: 170, startDelayTicks: 360, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 7, spacingTicks: 78, startDelayTicks: 520, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 16, spacingTicks: 17, startDelayTicks: 1140, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 31, spacingTicks: 22, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 14, spacingTicks: 42, startDelayTicks: 170, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 7, spacingTicks: 120, startDelayTicks: 290, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 11, spacingTicks: 52, startDelayTicks: 290, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 7, spacingTicks: 90, startDelayTicks: 350, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 7, spacingTicks: 74, startDelayTicks: 200, pathId: 'crack' },
				{ enemyDefId: 'silverfish', count: 5, spacingTicks: 150, startDelayTicks: 340, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 240,
					pathId: 'crack',
					startDistanceTiles: 8.5,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			// The chaos wave, and nothing permanent or armored in it.
			entries: [
				{ enemyDefId: 'fly', count: 19, spacingTicks: 32, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 10, spacingTicks: 66, startDelayTicks: 100, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 32, spacingTicks: 21, startDelayTicks: 200, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 16, spacingTicks: 38, startDelayTicks: 300, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 33, spacingTicks: 21, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 15, spacingTicks: 40, startDelayTicks: 160, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 8, spacingTicks: 112, startDelayTicks: 280, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 12, spacingTicks: 48, startDelayTicks: 280, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 7, spacingTicks: 86, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 8, spacingTicks: 68, startDelayTicks: 190, pathId: 'crack' },
				{ enemyDefId: 'silverfish', count: 6, spacingTicks: 130, startDelayTicks: 320, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'slug', count: 2, spacingTicks: 300, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 35, spacingTicks: 20, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 8, spacingTicks: 108, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 13, spacingTicks: 46, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'silverfish', count: 7, spacingTicks: 120, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 9, spacingTicks: 62, startDelayTicks: 500, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 20, spacingTicks: 16, startDelayTicks: 1200, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'slug', count: 3, spacingTicks: 300, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 37, spacingTicks: 19, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 9, spacingTicks: 100, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 14, spacingTicks: 44, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 8, spacingTicks: 80, startDelayTicks: 380, pathId: 'crack' },
				{ enemyDefId: 'silverfish', count: 8, spacingTicks: 100, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 10, spacingTicks: 56, startDelayTicks: 480, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 240,
					pathId: 'crack',
					startDistanceTiles: 11,
				},
				{ enemyDefId: 'roach', count: 24, spacingTicks: 15, startDelayTicks: 1200, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
	],
}

/**
 * Positional, and `GameView.vue` walks it by array position -- so the two gaps are not bugs, and 13
 * sits between 12 and 15 rather than appended, or Continue would play it after 15. Night 14 is the
 * Mouse's (step 19) and 18 the Fan's (step 18), and authoring either now would be authoring a night its
 * own step rewrites. Continue goes 13, 15, 16, 17.
 */
export const NIGHTS = [
	night01,
	night02,
	night03,
	night04,
	night05,
	night06,
	night07,
	night08,
	night09,
	night10,
	night11,
	night12,
	night13,
	night15,
	night16,
	night17,
]
