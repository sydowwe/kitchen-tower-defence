/**
 * The night schedule -- nights 1 to 3, the Counter's three nights
 * (analytic-docs/CONTENT.md section 6): 6, 7 and 8 waves, Ant from night 1, Roach from night 3.
 *
 * Difficulty scalars are applied at runtime by `startWave` and are never baked in here.
 *
 * **What sets the pace is the countdown, not the schedule.** The Counter's `crack` is 31.1 tiles,
 * so an Ant is on the board for ~31 seconds and a Roach for ~17, while a wave finishes spawning in
 * a handful of them. Every wave below therefore gets the same `12 * 60` of build time and the ramp
 * lives entirely in the composition: more enemies, tighter spacing, and from night 3 a staggered
 * second entry so the fast thing arrives while the slow one is still walking.
 *
 * These tables are a first draft. Step 5C is the first session that can watch a night play out, and
 * it re-tunes them -- so the shape here is the deliverable, not the numbers.
 */

import type { NightDef } from '@/core/content/schema.ts'

/** Every wave on the Counter gives the same build time. See the header. */
const COUNTDOWN_TICKS = 12 * 60

export const night01: NightDef = {
	id: 'night01',
	index: 1,
	mapId: 'counter',
	waves: [
		{
			entries: [{ enemyDefId: 'ant', count: 4, spacingTicks: 60, startDelayTicks: 0, pathId: 'crack' }],
			countdownTicks: COUNTDOWN_TICKS,
		},
		{
			entries: [{ enemyDefId: 'ant', count: 6, spacingTicks: 50, startDelayTicks: 0, pathId: 'crack' }],
			countdownTicks: COUNTDOWN_TICKS,
		},
		{
			entries: [{ enemyDefId: 'ant', count: 8, spacingTicks: 45, startDelayTicks: 0, pathId: 'crack' }],
			countdownTicks: COUNTDOWN_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 6, spacingTicks: 40, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 4, spacingTicks: 40, startDelayTicks: 120, pathId: 'crack' },
			],
			countdownTicks: COUNTDOWN_TICKS,
		},
		{
			entries: [{ enemyDefId: 'ant', count: 12, spacingTicks: 35, startDelayTicks: 0, pathId: 'crack' }],
			countdownTicks: COUNTDOWN_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 10, spacingTicks: 30, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 6, spacingTicks: 30, startDelayTicks: 180, pathId: 'crack' },
			],
			countdownTicks: COUNTDOWN_TICKS,
		},
	],
}

export const night02: NightDef = {
	id: 'night02',
	index: 2,
	mapId: 'counter',
	waves: [
		{
			entries: [{ enemyDefId: 'ant', count: 6, spacingTicks: 50, startDelayTicks: 0, pathId: 'crack' }],
			countdownTicks: COUNTDOWN_TICKS,
		},
		{
			entries: [{ enemyDefId: 'ant', count: 8, spacingTicks: 45, startDelayTicks: 0, pathId: 'crack' }],
			countdownTicks: COUNTDOWN_TICKS,
		},
		{
			entries: [{ enemyDefId: 'ant', count: 10, spacingTicks: 40, startDelayTicks: 0, pathId: 'crack' }],
			countdownTicks: COUNTDOWN_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 8, spacingTicks: 35, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 6, spacingTicks: 35, startDelayTicks: 150, pathId: 'crack' },
			],
			countdownTicks: COUNTDOWN_TICKS,
		},
		{
			entries: [{ enemyDefId: 'ant', count: 14, spacingTicks: 32, startDelayTicks: 0, pathId: 'crack' }],
			countdownTicks: COUNTDOWN_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 12, spacingTicks: 30, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 8, spacingTicks: 30, startDelayTicks: 200, pathId: 'crack' },
			],
			countdownTicks: COUNTDOWN_TICKS,
		},
		{
			entries: [{ enemyDefId: 'ant', count: 18, spacingTicks: 26, startDelayTicks: 0, pathId: 'crack' }],
			countdownTicks: COUNTDOWN_TICKS,
		},
	],
}

/**
 * The Roach arrives in wave 3, two of them behind a wave of Ants -- late enough that the player has
 * a shooter up, few enough that the first one is a demonstration rather than a leak.
 */
export const night03: NightDef = {
	id: 'night03',
	index: 3,
	mapId: 'counter',
	waves: [
		{
			entries: [{ enemyDefId: 'ant', count: 8, spacingTicks: 45, startDelayTicks: 0, pathId: 'crack' }],
			countdownTicks: COUNTDOWN_TICKS,
		},
		{
			entries: [{ enemyDefId: 'ant', count: 10, spacingTicks: 40, startDelayTicks: 0, pathId: 'crack' }],
			countdownTicks: COUNTDOWN_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 10, spacingTicks: 40, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 2, spacingTicks: 90, startDelayTicks: 180, pathId: 'crack' },
			],
			countdownTicks: COUNTDOWN_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 12, spacingTicks: 35, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 3, spacingTicks: 75, startDelayTicks: 150, pathId: 'crack' },
			],
			countdownTicks: COUNTDOWN_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 12, spacingTicks: 32, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 5, spacingTicks: 60, startDelayTicks: 120, pathId: 'crack' },
			],
			countdownTicks: COUNTDOWN_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 16, spacingTicks: 30, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 5, spacingTicks: 60, startDelayTicks: 200, pathId: 'crack' },
			],
			countdownTicks: COUNTDOWN_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 14, spacingTicks: 26, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 8, spacingTicks: 45, startDelayTicks: 120, pathId: 'crack' },
			],
			countdownTicks: COUNTDOWN_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 20, spacingTicks: 24, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 10, spacingTicks: 40, startDelayTicks: 150, pathId: 'crack' },
			],
			countdownTicks: COUNTDOWN_TICKS,
		},
	],
}

export const NIGHTS = [night01, night02, night03]
