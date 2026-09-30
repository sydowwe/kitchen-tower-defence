/**
 * The night schedule -- nights 1 to 18 (analytic-docs/CONTENT.md section 6): 6, 7, 8, 8, 9, 9, 10, 10,
 * 10, 11, 11, 12, 12, 12, 13, 13, 14 and 14 waves, Ant from night 1, Roach from night 3, Beetle from
 * night 5, Fly from night 8, Moth from night 10, Mold from night 11, Weevil from night 13, Mouse from
 * night 14, Slug from night 15, Silverfish from night 17. Each night is on section 6's map -- 1-3 the
 * Counter, 4-6 the Sink, 7-9 the Pantry, 10-12 the Stove, 13-15 the Table, 16-18 the Floor -- and names
 * section 6's modifier on nights 6, 11, 15, 16 and 18.
 *
 * Difficulty scalars and a night's modifier are applied at runtime by `startWave` (`waveEntryCount`),
 * and are never baked in here.
 *
 * **What sets the pace is the spawn window against the crossing, not the wave count.** A wave that
 * spawns in three seconds and then waits twelve is a clump followed by a stare: the board's count
 * jumps, sits flat for ten seconds and jumps again. So every wave below spawns over roughly as long
 * as the gap that follows it, which turns the same enemies into a stream, and the ramp lives in the
 * spacing tightening and the counts growing. The crossing decides how much of that stream is on the
 * board at once, and it is the map's:
 *
 * | Map     | Lanes (tiles)                            | Ant | Roach | Beetle | Fly | Slug | Silverfish |
 * | ------- | ---------------------------------------- | --- | ----- | ------ | --- | ---- | ---------- |
 * | Counter | crack 31.1                               | 31s | 17s   | 44s    | 14s | --   | --         |
 * | Sink    | crack 45                                 | 45s | 25s   | 64s    | 20s | --   | --         |
 * | Pantry  | crack 49                                 | 49s | 27s   | 70s    | 22s | --   | --         |
 * | Stove   | crack 28, vent 28                        | 28s | 16s   | 40s    | 13s | --   | --         |
 * | Table   | crack 50                                 | 50s | 28s   | 71s    | 23s | 125s | --         |
 * | Floor   | crack 58, doorGap 26, underTheOven 28    | 58s | 32s   | 83s    | 26s | 145s | 97s        |
 *
 * (The Floor's row is its longest lane.) A lane's length changes none of the spawn windows below, so
 * moving a single-lane night from the Counter to a longer map changed its map and nothing else.
 *
 * **On a multi-lane map an entry names no lane**, and `startWave` deals its count round-robin over every
 * lane. Its `spacingTicks` is per lane, so it is authored at the lane count times what one lane would
 * have -- x2 on the Stove, x3 on the Floor -- which keeps the wave's spawn window and the stream's rate
 * what they were on one lane (step 21C). An entry names a lane only where the night means one: a mold
 * (it stands somewhere), a Mouse (one entry, one flight home), a new enemy's first appearance (watched
 * one at a time), and a slug-led run (the column has to walk the slug's road). A 1-count entry that
 * names no lane goes down lane 0 alone -- `dealRoundRobin(1, n)` is `[1]`.
 *
 * **Every night's note names its two answers**: two loadouts it is written to fall to
 * (analytic-docs/DECISIONS.md section 10). They are claims until step 22's `optimal` and `blind`
 * policies measure them.
 *
 * Two numbers that are not free:
 *
 * - **`waves[0].countdownTicks` does double duty** -- it is both the run-up before wave 1 and the gap
 *   after it (`waveSystem` reads the countdown off the wave that just finished spawning). It is short
 *   here because a night that opens on twelve seconds of empty counter opens on nothing happening.
 * - A wave's countdown starts when its **last enemy spawns**, not when the wave starts, so the gap
 *   between two waves arriving is `spawn window + countdown`.
 *
 * Step 5C tuned the first three against a night watched at 1x and 3x. The numbers are content, and no
 * spec asserts them: `tests/content.spec.ts` holds each night to its map, its modifier and lanes that
 * exist, and `tests/spawn.spec.ts` and `tests/night.spec.ts` build their own nights on purpose, so the
 * next tuning pass is an edit here and nothing else.
 */

import type { NightDef } from '@/core/content/schema.ts'

/** The opening. Long enough to read the board, short enough that the night starts. */
const OPENING_TICKS = 6 * 60

export const night01: NightDef = {
	id: 'night01',
	index: 1,
	mapId: 'counter',
	unlocksTowerIds: ['saltShaker', 'toasterCrumbTray'],
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
	unlocksTowerIds: ['stickyTape'],
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
	unlocksTowerIds: ['mousetrap'],
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
 * Nights 4 to 6 are **on the Sink**: one 45-tile lane in from the left wall, down past the basin, the
 * whole length of the bottom of the board and back up the right-hand side to the fridge. The Counter's
 * lane was 31, so an Ant is on the board for ~45 seconds here against ~31, a Roach ~25 against ~17 and a
 * Beetle ~64 against ~44. The spawn windows are the ones step 9C tuned on the Counter; more of each wave
 * is simply walking at once.
 *
 * Night 4 is the Cookie Jar's night: Roaches in every wave from the second, and the money to buy what
 * holds them.
 *
 * **Its two answers:** a Salt Shaker line paid for by a Cookie Jar and a Crumb Tray; or Mousetraps and
 * Sticky Tape at the bottom run's corners, with Salt Shakers and no jar.
 */
export const night04: NightDef = {
	id: 'night04',
	index: 4,
	mapId: 'sink',
	unlocksTowerIds: ['cookieJar'],
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
 * The Beetle arrives on the Sink in wave 3, the way night 3 introduced the Roach: two of them, released
 * well behind that wave's Ants and 5 seconds apart, so the first is watched crossing before the second
 * sets off. Two at 55 HP is 110 HP of one thing at a time, which is what the night is asking about. At
 * ~64 seconds a crossing, one released with a wave is still walking when the next arrives -- that
 * overlap is the point, and it is why the beetle counts climb by one at a time.
 *
 * **Its two answers:** Salt Shakers with a Mousetrap on each of the bottom run's corners for the
 * Beetles; or Salt Shakers and a Spray Bottle, whose poison is still ticking on a Beetle long after it
 * has left the cone.
 */
export const night05: NightDef = {
	id: 'night05',
	index: 5,
	mapId: 'sink',
	unlocksTowerIds: ['sprayBottle'],
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

/**
 * The Sink's last night, and the Beetle from wave 2 and in every wave after it: what was a visitor on
 * night 5 is the shape of the night here.
 *
 * **Dishes left out:** fifteen piles on the lane at tick 0. Left alone they rot, and fifteen Fruit Flies
 * hatch 35 seconds in -- about when wave 1's Beetle-free column is halfway round the basin.
 *
 * **Its two answers:** a Salt Shaker line with a Crumb Tray, and the fifteen piles collected in the
 * opening -- 75 crumbs of towers before the first wave lands; or Salt Shakers and a Spray Bottle, whose
 * `targets: 'both'` cone takes the hatched flies as they come down the lane.
 */
export const night06: NightDef = {
	id: 'night06',
	index: 6,
	mapId: 'sink',
	modifierId: 'dishesLeftOut',
	unlocksTowerIds: ['cardboardBox'],
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

/**
 * Nights 7 to 9 are **in the Pantry**: one 49-tile lane wound between the shelves -- along the bottom,
 * up into the middle bay, back left, up the left-hand wall and the whole width of the top shelf to the
 * fridge. The build space is three bays, not an open floor, so where a tower can stand is the night's
 * first question. Ten waves, all three enemies from the first one, and the last night before the Fly.
 *
 * **Its two answers:** Ice Cube Trays slowing the column into a Salt Shaker bay; or Mousetraps and a
 * Spray Bottle in the middle bay, which the lane passes twice.
 */
export const night07: NightDef = {
	id: 'night07',
	index: 7,
	mapId: 'pantry',
	unlocksTowerIds: ['iceCubeTray'],
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
 * The Fly is the new enemy, and it changes what a spawn window means. It crosses the Pantry's 49 tiles
 * in **~22 seconds** against an Ant's ~49, a Roach's ~27 and a Beetle's ~70 -- still the shortest window
 * any tower gets, and the reason a range-4 Toaster in the wrong bay is worth nothing. So the flies below
 * are released in short, tight runs rather than trickled: a fly that is spaced out is a fly that is
 * never in anyone's circle.
 *
 * **Wave 6 is nothing but flies**, called while wave 5's ants and beetles are still crossing (waves
 * overlap by design -- analytic-docs/DECISIONS.md section 5). A board of ground-only towers watches all
 * of it go past, which is the question the night is asking. It is deliberately not the wave with the
 * most ground pressure on it: `spawnDestroyPenalty` buys extra enemies from the *running wave's own
 * composition*, so a Cookie Jar lost during a flies-only wave buys flies at 6 crumbs each -- 33 of them
 * for the jar's 200. Wave 7 is mixed rather than a second pure one.
 *
 * **Its two answers:** a Toaster on the top shelf's run for the air over a Salt Shaker bay; or Spray
 * Bottles, whose `targets: 'both'` cone takes the flies and the ground column alike.
 */
export const night08: NightDef = {
	id: 'night08',
	index: 8,
	mapId: 'pantry',
	unlocksTowerIds: ['toaster'],
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
 * **Night 9 introduces no enemy.** Its one new thing is the Nightlight, a tower with nothing to reveal
 * until the Moth -- so the waves are night 8 with more of everything, which is the honest content for
 * a night whose job is to let the fly pressure settle before the Moth arrives on night 10.
 *
 * Flies are in every wave from the first one here, including a second pure-fly wave: what was a
 * question on night 8 is the shape of the night on night 9, the way the Beetle went from a visitor on
 * night 5 to the shape of night 6.
 *
 * **Its two answers:** Toasters over a Salt Shaker bay, as on night 8 with a second Toaster; or Spray
 * Bottles behind an Ice Cube Tray, which holds the ground column in the cone for longer.
 */
export const night09: NightDef = {
	id: 'night09',
	index: 9,
	mapId: 'pantry',
	unlocksTowerIds: ['nightlight'],
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
 * Nights 10 to 12 are **on the Stove**, and the Stove has the game's second spawn point: the `crack` in
 * from the bottom wall and the `vent` down from the top, 28 tiles each, meeting 10 tiles in and sharing
 * the last 18 -- along the front of the hob and up past the oven to the fridge. Every entry that names no
 * lane is dealt over both at twice its one-lane spacing (see the header).
 *
 * The Moth is the new enemy, and it is the only one whose arrival is about watching rather than about
 * pressure: it crosses a Stove lane in ~17.5 seconds, between the Roach's ~16 and the Ant's ~28, and
 * what makes it different is that it curves off the lane toward a light. So it arrives the way the
 * Roach did on night 3, the Beetle on night 5 and the Fly on night 8 -- **two of them in wave 3, both
 * down the `vent`**, released well behind that wave's ground column and 3 seconds apart. The vent
 * because it is the lane nobody has seen yet, and because a moth dropping out of the extractor hood is
 * the kitchen's own joke. A moth in a clump of flies is a moth nobody notices curving.
 *
 * **Its two answers:** a Candle on the shared stretch, whose aura burns what walks past and whose light
 * pulls the moths into it, with Salt Shakers and a Toaster; or a Nightlight pulling the moths across a
 * pair of Toasters, over Salt Shakers where the lanes meet.
 */
export const night10: NightDef = {
	id: 'night10',
	index: 10,
	mapId: 'stove',
	unlocksTowerIds: ['candle'],
	waves: [
		{
			entries: [
				{ enemyDefId: 'ant', count: 15, spacingTicks: 92, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 5, spacingTicks: 184, startDelayTicks: 320 },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 480, startDelayTicks: 440 },
				{ enemyDefId: 'fly', count: 4, spacingTicks: 210, startDelayTicks: 460 },
			],
			countdownTicks: OPENING_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 16, spacingTicks: 86, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 6, spacingTicks: 172, startDelayTicks: 300 },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 450, startDelayTicks: 420 },
				{ enemyDefId: 'fly', count: 5, spacingTicks: 190, startDelayTicks: 420 },
			],
			countdownTicks: 8 * 60,
		},
		{
			// The Moth arrives: two of them, both down the vent, 180 ticks apart and 9 seconds behind the
			// wave's opening column, so the first is watched crossing before the second sets off.
			entries: [
				{ enemyDefId: 'ant', count: 16, spacingTicks: 84, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 6, spacingTicks: 164, startDelayTicks: 280 },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 430, startDelayTicks: 400 },
				{ enemyDefId: 'fly', count: 5, spacingTicks: 180, startDelayTicks: 400 },
				{ enemyDefId: 'moth', count: 2, spacingTicks: 180, startDelayTicks: 540, pathId: 'vent' },
			],
			countdownTicks: 9 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 17, spacingTicks: 76, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 7, spacingTicks: 152, startDelayTicks: 260 },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 400, startDelayTicks: 380 },
				{ enemyDefId: 'fly', count: 6, spacingTicks: 170, startDelayTicks: 380 },
				{ enemyDefId: 'moth', count: 3, spacingTicks: 300, startDelayTicks: 480 },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 18, spacingTicks: 70, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 8, spacingTicks: 140, startDelayTicks: 240 },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 370, startDelayTicks: 360 },
				{ enemyDefId: 'fly', count: 6, spacingTicks: 160, startDelayTicks: 360 },
				{ enemyDefId: 'moth', count: 3, spacingTicks: 280, startDelayTicks: 440 },
			],
			countdownTicks: 8 * 60,
		},
		{
			// The night's flyers-only wave, and the first one with both kinds in it: the moths curve at
			// whatever light is on the board while the flies go straight past it.
			entries: [
				{ enemyDefId: 'fly', count: 12, spacingTicks: 100, startDelayTicks: 0 },
				{ enemyDefId: 'moth', count: 5, spacingTicks: 220, startDelayTicks: 120 },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 19, spacingTicks: 66, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 9, spacingTicks: 128, startDelayTicks: 220 },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 350, startDelayTicks: 340 },
				{ enemyDefId: 'fly', count: 7, spacingTicks: 148, startDelayTicks: 340 },
				{ enemyDefId: 'moth', count: 4, spacingTicks: 260, startDelayTicks: 420 },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 21, spacingTicks: 60, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 10, spacingTicks: 112, startDelayTicks: 200 },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 320, startDelayTicks: 320 },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 140, startDelayTicks: 320 },
				{ enemyDefId: 'moth', count: 4, spacingTicks: 240, startDelayTicks: 400 },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 22, spacingTicks: 56, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 12, spacingTicks: 100, startDelayTicks: 180 },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 300, startDelayTicks: 300 },
				{ enemyDefId: 'fly', count: 9, spacingTicks: 128, startDelayTicks: 300 },
				{ enemyDefId: 'moth', count: 5, spacingTicks: 220, startDelayTicks: 380 },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 24, spacingTicks: 52, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 13, spacingTicks: 92, startDelayTicks: 160 },
				{ enemyDefId: 'beetle', count: 7, spacingTicks: 260, startDelayTicks: 280 },
				{ enemyDefId: 'fly', count: 11, spacingTicks: 116, startDelayTicks: 280 },
				{ enemyDefId: 'moth', count: 6, spacingTicks: 200, startDelayTicks: 360 },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 26, spacingTicks: 48, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 14, spacingTicks: 84, startDelayTicks: 150 },
				{ enemyDefId: 'beetle', count: 8, spacingTicks: 240, startDelayTicks: 260 },
				{ enemyDefId: 'fly', count: 12, spacingTicks: 104, startDelayTicks: 260 },
				{ enemyDefId: 'moth', count: 8, spacingTicks: 180, startDelayTicks: 340 },
			],
			countdownTicks: 8 * 60,
		},
	],
}

/**
 * Night 11, on the Stove: the Mold, on a **damp night** -- it spreads half as fast again, a pulse every
 * 8 seconds rather than 12.
 *
 * The Mold arrives the way every other enemy has: **two of them in wave 3**, well behind the wave's
 * opening column and four seconds apart, one on each lane's own run so the new thing is seen on both.
 * What no other enemy needed is `startDistanceTiles` -- it does not walk, so where it appears is the
 * whole of where it is. Each is released at its own lane and distance, one per entry, and the later
 * waves put more of them in at *different* places -- the front of the hob, the vent's drop, the run up
 * past the oven -- so a Vinegar Spray parked on the first one does not answer the next.
 *
 * Where a mold sits is also where its enemy can be shot from. **Where its patch grows is not the
 * placement's to choose:** `spreadSystem` picks from the frontier of every molded cell on the board
 * and prefers track, so an ignored night eats the whole road first and then the build space either side
 * of it, everywhere at once. Every mold below stands on track with build space inside a range-3 tower's
 * circle (`tests/content.spec.ts` holds each one to that) -- a mold nobody can shoot is a night that
 * never ends, because `resolveSystem` only calls it won on an empty board.
 *
 * One entry per mold, never `count: 2`: nightmare's `enemyCountMult` of 1.25 rounds a 2 to a 3 and
 * leaves a 1 alone, and three molds on one distance is one patch growing three times as fast rather
 * than three problems. The flyers-only wave carries none, so a Cookie Jar lost in it buys flies and
 * moths rather than permanent board damage (`spawnDestroyPenalty` buys from the running wave's own
 * entries).
 *
 * **The mold counts are measured, not guessed.** The first draft had 16, 21 and 15 molds on nights 11,
 * 12 and 15, and run headless with every one of them ignored, each night molded the whole board. They
 * are 12, 11 and 5 entries now -- see the note on `mold` in `core/content/enemies.ts` for what an ignored
 * night costs.
 *
 * **Its two answers:** chemical -- Spray Bottles where the lanes meet and down the vent, Vinegar Sprays
 * on the molds, a Toaster and Salt Shakers behind them; or fire -- Candles where the lanes meet and on
 * the vent (swarm and fungal both take fire at 1.5), with the Vinegar Sprays. Either way the opener is
 * the cone or the aura: two Salt Shakers and a Toaster out of the night's 200 crumbs lose the first wave
 * outright, on the Stove and on the Counter it came from.
 */
export const night11: NightDef = {
	id: 'night11',
	index: 11,
	mapId: 'stove',
	modifierId: 'dampNight',
	unlocksTowerIds: ['vinegarSpray'],
	waves: [
		{
			entries: [
				{ enemyDefId: 'ant', count: 16, spacingTicks: 86, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 6, spacingTicks: 172, startDelayTicks: 300 },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 450, startDelayTicks: 420 },
				{ enemyDefId: 'fly', count: 5, spacingTicks: 190, startDelayTicks: 420 },
			],
			countdownTicks: OPENING_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 17, spacingTicks: 80, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 7, spacingTicks: 160, startDelayTicks: 280 },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 420, startDelayTicks: 400 },
				{ enemyDefId: 'fly', count: 5, spacingTicks: 180, startDelayTicks: 400 },
				{ enemyDefId: 'moth', count: 2, spacingTicks: 320, startDelayTicks: 480 },
			],
			countdownTicks: 8 * 60,
		},
		{
			// The Mold arrives: two of them, 10 and 14 seconds into the wave, one on the crack's run along
			// the front of the hob and one halfway down the vent. No moths, so the new thing on the board
			// is the only new thing.
			entries: [
				{ enemyDefId: 'ant', count: 17, spacingTicks: 80, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 7, spacingTicks: 156, startDelayTicks: 280 },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 410, startDelayTicks: 400 },
				{ enemyDefId: 'fly', count: 5, spacingTicks: 176, startDelayTicks: 400 },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 600,
					pathId: 'crack',
					startDistanceTiles: 6,
				},
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 840,
					pathId: 'vent',
					startDistanceTiles: 5,
				},
			],
			countdownTicks: 9 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 18, spacingTicks: 74, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 8, spacingTicks: 144, startDelayTicks: 260 },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 380, startDelayTicks: 380 },
				{ enemyDefId: 'fly', count: 6, spacingTicks: 164, startDelayTicks: 380 },
				{ enemyDefId: 'moth', count: 3, spacingTicks: 290, startDelayTicks: 460 },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 19, spacingTicks: 70, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 8, spacingTicks: 136, startDelayTicks: 240 },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 360, startDelayTicks: 360 },
				{ enemyDefId: 'fly', count: 6, spacingTicks: 156, startDelayTicks: 360 },
				{ enemyDefId: 'moth', count: 3, spacingTicks: 270, startDelayTicks: 440 },
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
			entries: [
				{ enemyDefId: 'fly', count: 13, spacingTicks: 96, startDelayTicks: 0 },
				{ enemyDefId: 'moth', count: 6, spacingTicks: 210, startDelayTicks: 120 },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 20, spacingTicks: 64, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 9, spacingTicks: 124, startDelayTicks: 220 },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 340, startDelayTicks: 340 },
				{ enemyDefId: 'fly', count: 7, spacingTicks: 144, startDelayTicks: 340 },
				{ enemyDefId: 'moth', count: 4, spacingTicks: 250, startDelayTicks: 420 },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 200,
					pathId: 'vent',
					startDistanceTiles: 2,
				},
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 700,
					pathId: 'crack',
					startDistanceTiles: 21,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 22, spacingTicks: 58, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 11, spacingTicks: 108, startDelayTicks: 200 },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 310, startDelayTicks: 320 },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 136, startDelayTicks: 320 },
				{ enemyDefId: 'moth', count: 4, spacingTicks: 230, startDelayTicks: 400 },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 23, spacingTicks: 54, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 12, spacingTicks: 98, startDelayTicks: 180 },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 290, startDelayTicks: 300 },
				{ enemyDefId: 'fly', count: 9, spacingTicks: 124, startDelayTicks: 300 },
				{ enemyDefId: 'moth', count: 5, spacingTicks: 216, startDelayTicks: 380 },
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
					pathId: 'vent',
					startDistanceTiles: 8,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 25, spacingTicks: 50, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 13, spacingTicks: 90, startDelayTicks: 160 },
				{ enemyDefId: 'beetle', count: 7, spacingTicks: 256, startDelayTicks: 280 },
				{ enemyDefId: 'fly', count: 11, spacingTicks: 112, startDelayTicks: 280 },
				{ enemyDefId: 'moth', count: 6, spacingTicks: 196, startDelayTicks: 360 },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 240,
					pathId: 'crack',
					startDistanceTiles: 9,
				},
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 520,
					pathId: 'crack',
					startDistanceTiles: 16,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 27, spacingTicks: 46, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 15, spacingTicks: 82, startDelayTicks: 150 },
				{ enemyDefId: 'beetle', count: 8, spacingTicks: 236, startDelayTicks: 260 },
				{ enemyDefId: 'fly', count: 12, spacingTicks: 100, startDelayTicks: 260 },
				{ enemyDefId: 'moth', count: 8, spacingTicks: 176, startDelayTicks: 340 },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 200,
					pathId: 'vent',
					startDistanceTiles: 3.5,
				},
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 360,
					pathId: 'crack',
					startDistanceTiles: 11,
				},
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 520,
					pathId: 'crack',
					startDistanceTiles: 19,
				},
			],
			countdownTicks: 8 * 60,
		},
	],
}

/**
 * Night 12, the Stove's last: the mold is the shape of the night, the way the Beetle was on night 6 --
 * one or more in ten of the twelve waves, from wave 1, on both lanes. The flyers-only wave carries none,
 * for the Cookie Jar reason above night 11, and neither does wave 9, so there is one breath in the back
 * half to go and clean up.
 *
 * Section 6 gives this night the Gas Stove Burner unlock. Step 17D ran it headless on the Counter with
 * the Burner and left every wave as it was: a Salt Shaker and Toaster line held it with or without one,
 * and what the Burner cost was the wakes it added on top of an already loud Toaster line, one to three,
 * which is the price it is meant to have. On the Stove it has somewhere better to stand: the shared
 * stretch, which every enemy on both lanes walks.
 *
 * **Its two answers:** a Gas Stove Burner on the shared stretch with a Vinegar Spray for the molds and a
 * Toaster for the air; or Candles where the lanes meet and a Vinegar Spray on each lane's own run --
 * night 11's fire answer with the night's extra mold.
 */
export const night12: NightDef = {
	id: 'night12',
	index: 12,
	mapId: 'stove',
	unlocksTowerIds: ['gasStoveBurner'],
	waves: [
		{
			entries: [
				{ enemyDefId: 'ant', count: 17, spacingTicks: 80, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 7, spacingTicks: 160, startDelayTicks: 280 },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 420, startDelayTicks: 400 },
				{ enemyDefId: 'fly', count: 5, spacingTicks: 180, startDelayTicks: 400 },
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
				{ enemyDefId: 'ant', count: 18, spacingTicks: 76, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 7, spacingTicks: 152, startDelayTicks: 260 },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 400, startDelayTicks: 380 },
				{ enemyDefId: 'fly', count: 6, spacingTicks: 172, startDelayTicks: 380 },
				{ enemyDefId: 'moth', count: 2, spacingTicks: 300, startDelayTicks: 460 },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 300,
					pathId: 'vent',
					startDistanceTiles: 5,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 18, spacingTicks: 74, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 8, spacingTicks: 144, startDelayTicks: 260 },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 380, startDelayTicks: 380 },
				{ enemyDefId: 'fly', count: 6, spacingTicks: 164, startDelayTicks: 380 },
				{ enemyDefId: 'moth', count: 3, spacingTicks: 280, startDelayTicks: 460 },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 240,
					pathId: 'crack',
					startDistanceTiles: 6,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 19, spacingTicks: 70, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 8, spacingTicks: 136, startDelayTicks: 240 },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 360, startDelayTicks: 360 },
				{ enemyDefId: 'fly', count: 6, spacingTicks: 156, startDelayTicks: 360 },
				{ enemyDefId: 'moth', count: 3, spacingTicks: 270, startDelayTicks: 440 },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 300,
					pathId: 'crack',
					startDistanceTiles: 21,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 20, spacingTicks: 66, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 9, spacingTicks: 128, startDelayTicks: 220 },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 340, startDelayTicks: 340 },
				{ enemyDefId: 'fly', count: 7, spacingTicks: 148, startDelayTicks: 340 },
				{ enemyDefId: 'moth', count: 4, spacingTicks: 250, startDelayTicks: 420 },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 200,
					pathId: 'vent',
					startDistanceTiles: 2,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'fly', count: 14, spacingTicks: 92, startDelayTicks: 0 },
				{ enemyDefId: 'moth', count: 7, spacingTicks: 200, startDelayTicks: 120 },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 21, spacingTicks: 62, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 10, spacingTicks: 116, startDelayTicks: 210 },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 320, startDelayTicks: 330 },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 140, startDelayTicks: 330 },
				{ enemyDefId: 'moth', count: 4, spacingTicks: 240, startDelayTicks: 400 },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 200,
					pathId: 'crack',
					startDistanceTiles: 9,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 22, spacingTicks: 58, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 11, spacingTicks: 108, startDelayTicks: 200 },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 300, startDelayTicks: 320 },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 132, startDelayTicks: 320 },
				{ enemyDefId: 'moth', count: 5, spacingTicks: 224, startDelayTicks: 390 },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 480,
					pathId: 'vent',
					startDistanceTiles: 8,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 24, spacingTicks: 54, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 12, spacingTicks: 100, startDelayTicks: 190 },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 280, startDelayTicks: 300 },
				{ enemyDefId: 'fly', count: 9, spacingTicks: 124, startDelayTicks: 300 },
				{ enemyDefId: 'moth', count: 5, spacingTicks: 212, startDelayTicks: 380 },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 25, spacingTicks: 50, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 13, spacingTicks: 92, startDelayTicks: 170 },
				{ enemyDefId: 'beetle', count: 7, spacingTicks: 260, startDelayTicks: 290 },
				{ enemyDefId: 'fly', count: 10, spacingTicks: 116, startDelayTicks: 290 },
				{ enemyDefId: 'moth', count: 6, spacingTicks: 200, startDelayTicks: 360 },
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
					startDelayTicks: 520,
					pathId: 'crack',
					startDistanceTiles: 19,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 27, spacingTicks: 46, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 14, spacingTicks: 84, startDelayTicks: 160 },
				{ enemyDefId: 'beetle', count: 8, spacingTicks: 240, startDelayTicks: 270 },
				{ enemyDefId: 'fly', count: 11, spacingTicks: 108, startDelayTicks: 270 },
				{ enemyDefId: 'moth', count: 7, spacingTicks: 184, startDelayTicks: 350 },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 200,
					pathId: 'vent',
					startDistanceTiles: 3.5,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 29, spacingTicks: 42, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 16, spacingTicks: 76, startDelayTicks: 150 },
				{ enemyDefId: 'beetle', count: 9, spacingTicks: 220, startDelayTicks: 260 },
				{ enemyDefId: 'fly', count: 13, spacingTicks: 96, startDelayTicks: 260 },
				{ enemyDefId: 'moth', count: 8, spacingTicks: 168, startDelayTicks: 340 },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 320,
					pathId: 'crack',
					startDistanceTiles: 16,
				},
			],
			countdownTicks: 8 * 60,
		},
	],
}

/**
 * Nights 13 to 15 are **on the Table**: one 50-tile lane that snakes up, down and up again between the
 * chairs -- in from the left, up the first run, down the second, along the bottom and up the third to
 * the fridge. Each pair of runs has a pocket between them, and a tower in a pocket covers both.
 *
 * Night 13: the Weevil, and the Bay Leaf unlocks beside it -- this night is what makes that tower a
 * decision. Two of them in wave 3, released after the wave's last Ant and five seconds apart, so each is
 * watched going under and coming back up on its own. After that they are folded into the ground column
 * in growing numbers, and never given a wave of their own: a Cookie Jar lost in a Weevil-only wave buys
 * twenty-odd of them, each with its own window (`spawnDestroyPenalty` buys from the running wave).
 *
 * What the night asks: with the Weevil's fractions its window runs from somewhere in the first third
 * of the lane to somewhere past the middle, so a line built entirely in the first pocket has it for a
 * few seconds before it is gone. No molds -- the Weevil is the only new question, and night 16 is where
 * the two meet.
 *
 * **Its two answers:** a Bay Leaf in the first pocket over a Salt Shaker line, so the Weevils surface
 * where the line is; or no Bay Leaf and the line in the second pocket and up the last run, past where
 * any Weevil's window ends, with a Toaster for the air.
 */
export const night13: NightDef = {
	id: 'night13',
	index: 13,
	mapId: 'table',
	unlocksTowerIds: ['bayLeaf'],
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
 * Night 14, on the Table: the Mouse, the Act II mini-boss, and the Fly Paper unlock. It introduces no
 * other enemy, so apart from the Mouse it is night 13 with more of everything.
 *
 * **Two Mice, in waves 7 and 12, one entry each** -- nightmare's `enemyCountMult` rounds a 2 to a 3. The
 * wave in front of each is what carries the `thiefWarning`, so neither is early: wave 6 is the night's
 * flyers-only wave, and it is the one that names the Mouse coming.
 *
 * **Each Mouse is the last thing its wave releases, and nothing spawns behind it.** It overtakes the
 * tail on the way in, and its flight home runs back down an emptying lane -- the whole snake of it, ~33
 * seconds each way on the Table -- so the grab and the run are both watched. Wave 7 is thin -- a ground
 * column and no flyers -- with a 12-second countdown behind it, so the next wave's head meets the fleeing
 * Mouse late rather than on the grab. Wave 12 puts it last on the night: the final seconds are a Mouse
 * running home with the food or dying on the way, all of it on screen.
 *
 * **A Cookie Jar lost in either Mouse wave buys two more Mice**, and that is accepted. Every entry ahead
 * of the Mouse is bought first each round, so a wave whose other entries cost 27 crumbs or more gets
 * two out of the jar's 200, and no composition gets fewer. That is ten more items at risk against the
 * shelf's 22 -- a lost jar on this night is the costliest one in the game, which it should be. Never a
 * Mouse-only wave: that is five.
 *
 * **Its two answers:** Mousetraps on the last run, where the Mouse passes twice -- in with the food and
 * back out with it -- over a Salt Shaker line (mammal takes physical at 1.5); or Sticky Tape rooting the
 * Mouse in the second pocket, with Salt Shakers and a Toaster, and Fly Paper for the flyers-only wave.
 */
export const night14: NightDef = {
	id: 'night14',
	index: 14,
	mapId: 'table',
	unlocksTowerIds: ['flyPaper'],
	waves: [
		{
			entries: [
				{ enemyDefId: 'ant', count: 19, spacingTicks: 37, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 7, spacingTicks: 74, startDelayTicks: 250, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 195, startDelayTicks: 370, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 6, spacingTicks: 82, startDelayTicks: 370, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 2, spacingTicks: 200, startDelayTicks: 600, pathId: 'crack' },
			],
			countdownTicks: OPENING_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 20, spacingTicks: 35, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 3, spacingTicks: 150, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 8, spacingTicks: 70, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 185, startDelayTicks: 360, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 7, spacingTicks: 78, startDelayTicks: 360, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 3, spacingTicks: 140, startDelayTicks: 440, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 21, spacingTicks: 33, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 4, spacingTicks: 130, startDelayTicks: 280, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 9, spacingTicks: 64, startDelayTicks: 230, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 170, startDelayTicks: 350, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 7, spacingTicks: 72, startDelayTicks: 350, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 3, spacingTicks: 125, startDelayTicks: 420, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 22, spacingTicks: 31, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 5, spacingTicks: 115, startDelayTicks: 260, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 9, spacingTicks: 60, startDelayTicks: 220, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 160, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 68, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 4, spacingTicks: 120, startDelayTicks: 410, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 23, spacingTicks: 30, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 6, spacingTicks: 100, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 10, spacingTicks: 56, startDelayTicks: 210, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 150, startDelayTicks: 330, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 64, startDelayTicks: 330, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 4, spacingTicks: 115, startDelayTicks: 400, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			// The flyers-only wave, and the one the Mouse is named in: the ground lane is quiet while the
			// warning is up.
			entries: [
				{ enemyDefId: 'fly', count: 15, spacingTicks: 44, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 7, spacingTicks: 96, startDelayTicks: 120, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			// The Mouse arrives: a thin ground column, then the Mouse 4 seconds behind the last Beetle.
			entries: [
				{ enemyDefId: 'ant', count: 16, spacingTicks: 34, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 6, spacingTicks: 70, startDelayTicks: 200, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 3, spacingTicks: 170, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 3, spacingTicks: 150, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'mouse', count: 1, spacingTicks: 60, startDelayTicks: 900, pathId: 'crack' },
			],
			countdownTicks: 12 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 24, spacingTicks: 28, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 7, spacingTicks: 90, startDelayTicks: 220, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 11, spacingTicks: 54, startDelayTicks: 200, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 145, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 9, spacingTicks: 62, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 5, spacingTicks: 108, startDelayTicks: 390, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 25, spacingTicks: 27, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 8, spacingTicks: 80, startDelayTicks: 200, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 12, spacingTicks: 50, startDelayTicks: 190, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 7, spacingTicks: 135, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 10, spacingTicks: 58, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 5, spacingTicks: 102, startDelayTicks: 380, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 26, spacingTicks: 25, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 9, spacingTicks: 72, startDelayTicks: 180, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 13, spacingTicks: 46, startDelayTicks: 170, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 7, spacingTicks: 126, startDelayTicks: 290, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 10, spacingTicks: 54, startDelayTicks: 290, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 6, spacingTicks: 96, startDelayTicks: 360, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 27, spacingTicks: 24, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 10, spacingTicks: 64, startDelayTicks: 160, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 14, spacingTicks: 43, startDelayTicks: 160, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 8, spacingTicks: 118, startDelayTicks: 270, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 11, spacingTicks: 50, startDelayTicks: 270, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 7, spacingTicks: 88, startDelayTicks: 350, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			// The last Mouse, released 6 seconds after the last Beetle: the night ends on its run.
			entries: [
				{ enemyDefId: 'ant', count: 29, spacingTicks: 22, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'weevil', count: 11, spacingTicks: 56, startDelayTicks: 150, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 16, spacingTicks: 39, startDelayTicks: 150, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 9, spacingTicks: 108, startDelayTicks: 260, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 13, spacingTicks: 46, startDelayTicks: 260, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 8, spacingTicks: 82, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'mouse', count: 1, spacingTicks: 60, startDelayTicks: 1480, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
	],
}

/**
 * Night 15, the Table's last: the Slug, **after a dinner party** -- double spawns and double crumbs. The
 * modifier doubles every entry's count at runtime (`waveEntryCount`), so the night is authored **plain**,
 * with counts and spacing in night 14's range: authoring the doubling in as well would make it four
 * times its size. The loudest night in v1 is what the modifier makes of this, not this.
 *
 * What the doubling does to the file's shapes:
 *
 * - **Every `count: 1` is two.** A slug entry of one is two slugs, one `spacingTicks` apart -- so the
 *   Slug's introduction in wave 3 is one entry of one, and arrives as two, ten seconds apart.
 * - **Every mold is a pair on one tile**: one patch growing twice as fast, and three at nightmare
 *   (`round(2.5)`). So there are five mold entries, not nine -- ten molds at runtime, against the nine
 *   the header above night 11 measured.
 *
 * After wave 3, **slugs lead roach runs**: a slug at the head of the wave and a tight roach column
 * released 20 to 25 seconds behind it. The reason is arithmetic. A Slug walks 0.4 tiles a second and a
 * Roach 1.8, so a column released 5 seconds behind catches the slug 2.6 tiles in -- on its trail for a
 * tile or two, nowhere near a tower. Twenty seconds' lead puts the slug 8 tiles in and the column meets
 * it about 10 tiles in, at the top of the Table's first run, beside the first pocket where the towers
 * are. That is the only place a speed-up is worth anything.
 *
 * Those waves spawn over ~20 seconds against an 8-second gap, against the file's pacing rule, and on
 * purpose: the lead *is* the mechanic. Wave 7 is the chaos wave -- flyers and ground at once, the
 * densest on the night -- and it carries neither molds nor slugs, so a Cookie Jar lost in it buys
 * nothing permanent.
 *
 * **Its two answers:** Baking Soda on the wet road (soft takes chemical at 2.0) with Salt Shakers, a
 * Vinegar Spray for the molds and a Toaster for the air; or Spray Bottles and a Vinegar Spray for
 * chemical and a Candle for fire, with the doubled crumbs spent on a second line in the second pocket.
 */
export const night15: NightDef = {
	id: 'night15',
	index: 15,
	mapId: 'table',
	modifierId: 'dinnerParty',
	unlocksTowerIds: ['bakingSoda'],
	waves: [
		{
			entries: [
				{ enemyDefId: 'ant', count: 19, spacingTicks: 37, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 7, spacingTicks: 74, startDelayTicks: 250, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 195, startDelayTicks: 370, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 6, spacingTicks: 82, startDelayTicks: 370, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 3, spacingTicks: 140, startDelayTicks: 440, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 300,
					pathId: 'crack',
					startDistanceTiles: 7,
				},
			],
			countdownTicks: OPENING_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 20, spacingTicks: 35, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 8, spacingTicks: 70, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 185, startDelayTicks: 360, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 7, spacingTicks: 78, startDelayTicks: 360, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 3, spacingTicks: 130, startDelayTicks: 440, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			// The Slug arrives: one entry, which the dinner party makes two, ten seconds apart and well
			// behind the column, so each is watched laying its road before anything much walks on it.
			entries: [
				{ enemyDefId: 'ant', count: 21, spacingTicks: 33, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 8, spacingTicks: 66, startDelayTicks: 230, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 4, spacingTicks: 175, startDelayTicks: 350, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 7, spacingTicks: 72, startDelayTicks: 350, pathId: 'crack' },
				{ enemyDefId: 'slug', count: 1, spacingTicks: 600, startDelayTicks: 480, pathId: 'crack' },
			],
			countdownTicks: 9 * 60,
		},
		{
			// The first slug-led run: the slugs alone at the head, the roaches 20 seconds behind them.
			entries: [
				{ enemyDefId: 'slug', count: 1, spacingTicks: 240, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 22, spacingTicks: 31, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 160, startDelayTicks: 360, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 7, spacingTicks: 68, startDelayTicks: 360, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 4, spacingTicks: 120, startDelayTicks: 440, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 10, spacingTicks: 20, startDelayTicks: 1200, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 22, spacingTicks: 30, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 9, spacingTicks: 60, startDelayTicks: 220, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 155, startDelayTicks: 330, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 64, startDelayTicks: 330, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 4, spacingTicks: 115, startDelayTicks: 400, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 240,
					pathId: 'crack',
					startDistanceTiles: 20,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'slug', count: 1, spacingTicks: 240, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 23, spacingTicks: 29, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 150, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 62, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 11, spacingTicks: 18, startDelayTicks: 1140, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			// The chaos wave: everything that flies and a ground rush under it, and nothing permanent.
			entries: [
				{ enemyDefId: 'fly', count: 14, spacingTicks: 44, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 7, spacingTicks: 90, startDelayTicks: 100, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 22, spacingTicks: 30, startDelayTicks: 200, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 10, spacingTicks: 50, startDelayTicks: 300, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 24, spacingTicks: 28, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 10, spacingTicks: 54, startDelayTicks: 200, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 145, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 9, spacingTicks: 60, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 5, spacingTicks: 108, startDelayTicks: 390, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 200,
					pathId: 'crack',
					startDistanceTiles: 12,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			// The longest lead on the night: 25 seconds, so the roaches meet the slugs at the top of the
			// first run, past the first pocket's corner.
			entries: [
				{ enemyDefId: 'slug', count: 1, spacingTicks: 240, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 24, spacingTicks: 28, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 140, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 9, spacingTicks: 58, startDelayTicks: 340, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 5, spacingTicks: 104, startDelayTicks: 400, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 12, spacingTicks: 17, startDelayTicks: 1500, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 25, spacingTicks: 27, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 11, spacingTicks: 50, startDelayTicks: 190, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 135, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 10, spacingTicks: 56, startDelayTicks: 300, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 5, spacingTicks: 102, startDelayTicks: 380, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'slug', count: 1, spacingTicks: 300, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 26, spacingTicks: 25, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 7, spacingTicks: 126, startDelayTicks: 330, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 10, spacingTicks: 54, startDelayTicks: 330, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 6, spacingTicks: 96, startDelayTicks: 390, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 13, spacingTicks: 16, startDelayTicks: 1200, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 27, spacingTicks: 24, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'roach', count: 12, spacingTicks: 46, startDelayTicks: 170, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 7, spacingTicks: 118, startDelayTicks: 290, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 11, spacingTicks: 50, startDelayTicks: 290, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 6, spacingTicks: 90, startDelayTicks: 350, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 360,
					pathId: 'crack',
					startDistanceTiles: 25,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'slug', count: 2, spacingTicks: 300, startDelayTicks: 0, pathId: 'crack' },
				{ enemyDefId: 'ant', count: 29, spacingTicks: 22, startDelayTicks: 240, pathId: 'crack' },
				{ enemyDefId: 'beetle', count: 8, spacingTicks: 108, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'fly', count: 12, spacingTicks: 48, startDelayTicks: 320, pathId: 'crack' },
				{ enemyDefId: 'moth', count: 7, spacingTicks: 84, startDelayTicks: 380, pathId: 'crack' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 240,
					pathId: 'crack',
					startDistanceTiles: 35,
				},
				{ enemyDefId: 'roach', count: 14, spacingTicks: 15, startDelayTicks: 1200, pathId: 'crack' },
			],
			countdownTicks: 8 * 60,
		},
	],
}

/**
 * Nights 16 to 18 are **on the Floor**, and the Floor has the third spawn point. The `crack` is 58
 * tiles in from the left wall, round the rug and along the bottom; the `doorGap` comes in under the door
 * at the bottom and joins it two tiles later; `underTheOven` drops 11 tiles from the top wall onto the
 * same bottom run. All three share its last 17 tiles, up the right-hand side to the fridge. Every entry
 * that names no lane is dealt over the three at three times its one-lane spacing (see the header), and
 * because the lanes are 58, 26 and 28 long, one entry arrives at the shared stretch in three runs half
 * a minute apart.
 *
 * **Slug-led runs walk the `doorGap`**, the slug and the column behind it both: the column has to walk
 * the slug's road, and the door gap puts that road on the shared stretch within two tiles, so a slug
 * 8 tiles in has wetted the bottom run every lane walks.
 *
 * Night 16 introduces nothing. It is the night that asks for everything from 11 to 15 at once: slug-led
 * runs with Weevils released behind the slug, so they surface onto a wet road, and molds on all three
 * lanes. And it is **moving day**: 30% of the build tiles are boxes, drawn from the seed. Every mold
 * below stands in reach of a tile the boxes left at seed 1234, which is the seed every campaign night is
 * played at (`GameView.vue`); `tests/content.spec.ts` measures it on the boxed map, not the authored
 * one.
 *
 * The flyers-only wave and the chaos wave carry nothing permanent, for the Cookie Jar reason above
 * night 11. Section 6 gives it the Honey Pot unlock. Step 17D ran it headless on the Counter with a pot
 * inside and outside a tower line and left every wave as it was: the pot changed no food lost either
 * way, because its feeders are held wherever it stands. What the night does decide is the pot's own life
 * (analytic-docs/OPEN-QUESTIONS.md, the Honey Pot).
 *
 * **Its two answers:** a Honey Pot on the shared stretch holding its feeders in a Candle's aura, with a
 * Bay Leaf over the wet road and a Vinegar Spray on each lane's molds; or no pot -- a Cookie Jar paying
 * for Candles and Baking Soda on the shared stretch, with the Bay Leaf and the Vinegar Sprays. Three
 * lanes' worth of the first wave reach the shared stretch inside half a minute, so whichever it is has
 * to be standing there, with its income, before the first Roach arrives.
 */
export const night16: NightDef = {
	id: 'night16',
	index: 16,
	mapId: 'floor',
	modifierId: 'movingDay',
	unlocksTowerIds: ['honeyPot'],
	waves: [
		{
			entries: [
				{ enemyDefId: 'ant', count: 22, spacingTicks: 96, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 9, spacingTicks: 180, startDelayTicks: 220 },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 495, startDelayTicks: 340 },
				{ enemyDefId: 'fly', count: 7, spacingTicks: 216, startDelayTicks: 340 },
				{ enemyDefId: 'weevil', count: 3, spacingTicks: 420, startDelayTicks: 300 },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 300,
					pathId: 'crack',
					startDistanceTiles: 12,
				},
			],
			countdownTicks: OPENING_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 23, spacingTicks: 90, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 10, spacingTicks: 168, startDelayTicks: 200 },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 465, startDelayTicks: 320 },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 204, startDelayTicks: 320 },
				{ enemyDefId: 'moth', count: 4, spacingTicks: 345, startDelayTicks: 400 },
				{ enemyDefId: 'weevil', count: 4, spacingTicks: 360, startDelayTicks: 260 },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 300,
					pathId: 'underTheOven',
					startDistanceTiles: 6,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			// The first slug-led run: Weevils 10 seconds behind the slug, going under onto its road.
			entries: [
				{ enemyDefId: 'slug', count: 1, spacingTicks: 60, startDelayTicks: 0, pathId: 'doorGap' },
				{ enemyDefId: 'ant', count: 24, spacingTicks: 84, startDelayTicks: 240 },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 450, startDelayTicks: 340 },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 192, startDelayTicks: 340 },
				{ enemyDefId: 'weevil', count: 5, spacingTicks: 100, startDelayTicks: 600, pathId: 'doorGap' },
				{ enemyDefId: 'roach', count: 12, spacingTicks: 20, startDelayTicks: 1200, pathId: 'doorGap' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 24, spacingTicks: 84, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 11, spacingTicks: 156, startDelayTicks: 200 },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 435, startDelayTicks: 300 },
				{ enemyDefId: 'fly', count: 9, spacingTicks: 186, startDelayTicks: 300 },
				{ enemyDefId: 'moth', count: 5, spacingTicks: 324, startDelayTicks: 380 },
				{ enemyDefId: 'weevil', count: 5, spacingTicks: 300, startDelayTicks: 240 },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 200,
					pathId: 'crack',
					startDistanceTiles: 18,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'fly', count: 16, spacingTicks: 120, startDelayTicks: 0 },
				{ enemyDefId: 'moth', count: 8, spacingTicks: 240, startDelayTicks: 100 },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'slug', count: 2, spacingTicks: 240, startDelayTicks: 0, pathId: 'doorGap' },
				{ enemyDefId: 'ant', count: 26, spacingTicks: 78, startDelayTicks: 240 },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 420, startDelayTicks: 340 },
				{ enemyDefId: 'fly', count: 9, spacingTicks: 180, startDelayTicks: 340 },
				{ enemyDefId: 'weevil', count: 6, spacingTicks: 90, startDelayTicks: 500, pathId: 'doorGap' },
				{ enemyDefId: 'roach', count: 14, spacingTicks: 18, startDelayTicks: 1140, pathId: 'doorGap' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 27, spacingTicks: 75, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 12, spacingTicks: 144, startDelayTicks: 190 },
				{ enemyDefId: 'beetle', count: 7, spacingTicks: 390, startDelayTicks: 300 },
				{ enemyDefId: 'fly', count: 10, spacingTicks: 174, startDelayTicks: 300 },
				{ enemyDefId: 'moth', count: 6, spacingTicks: 300, startDelayTicks: 360 },
				{ enemyDefId: 'weevil', count: 6, spacingTicks: 264, startDelayTicks: 220 },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 240,
					pathId: 'doorGap',
					startDistanceTiles: 5,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			// The chaos wave: everything that flies and a ground rush under it, and nothing permanent.
			entries: [
				{ enemyDefId: 'fly', count: 18, spacingTicks: 102, startDelayTicks: 0 },
				{ enemyDefId: 'moth', count: 9, spacingTicks: 210, startDelayTicks: 100 },
				{ enemyDefId: 'ant', count: 30, spacingTicks: 66, startDelayTicks: 200 },
				{ enemyDefId: 'roach', count: 14, spacingTicks: 120, startDelayTicks: 300 },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 28, spacingTicks: 72, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 13, spacingTicks: 138, startDelayTicks: 180 },
				{ enemyDefId: 'beetle', count: 7, spacingTicks: 375, startDelayTicks: 300 },
				{ enemyDefId: 'fly', count: 10, spacingTicks: 168, startDelayTicks: 300 },
				{ enemyDefId: 'moth', count: 6, spacingTicks: 288, startDelayTicks: 360 },
				{ enemyDefId: 'weevil', count: 7, spacingTicks: 240, startDelayTicks: 200 },
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
					pathId: 'underTheOven',
					startDistanceTiles: 3,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'slug', count: 1, spacingTicks: 60, startDelayTicks: 0, pathId: 'doorGap' },
				{ enemyDefId: 'ant', count: 30, spacingTicks: 69, startDelayTicks: 240 },
				{ enemyDefId: 'beetle', count: 8, spacingTicks: 360, startDelayTicks: 340 },
				{ enemyDefId: 'fly', count: 11, spacingTicks: 162, startDelayTicks: 340 },
				{ enemyDefId: 'weevil', count: 8, spacingTicks: 72, startDelayTicks: 600, pathId: 'doorGap' },
				{ enemyDefId: 'roach', count: 18, spacingTicks: 17, startDelayTicks: 1500, pathId: 'doorGap' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 31, spacingTicks: 66, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 14, spacingTicks: 126, startDelayTicks: 170 },
				{ enemyDefId: 'beetle', count: 8, spacingTicks: 354, startDelayTicks: 290 },
				{ enemyDefId: 'fly', count: 12, spacingTicks: 150, startDelayTicks: 290 },
				{ enemyDefId: 'moth', count: 7, spacingTicks: 270, startDelayTicks: 350 },
				{ enemyDefId: 'weevil', count: 8, spacingTicks: 210, startDelayTicks: 200 },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 360,
					pathId: 'crack',
					startDistanceTiles: 24,
				},
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 520,
					pathId: 'crack',
					startDistanceTiles: 31,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'slug', count: 2, spacingTicks: 300, startDelayTicks: 0, pathId: 'doorGap' },
				{ enemyDefId: 'ant', count: 32, spacingTicks: 63, startDelayTicks: 240 },
				{ enemyDefId: 'beetle', count: 9, spacingTicks: 336, startDelayTicks: 330 },
				{ enemyDefId: 'fly', count: 12, spacingTicks: 144, startDelayTicks: 330 },
				{ enemyDefId: 'moth', count: 7, spacingTicks: 258, startDelayTicks: 390 },
				{ enemyDefId: 'weevil', count: 9, spacingTicks: 64, startDelayTicks: 560, pathId: 'doorGap' },
				{ enemyDefId: 'roach', count: 20, spacingTicks: 16, startDelayTicks: 1200, pathId: 'doorGap' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'slug', count: 3, spacingTicks: 300, startDelayTicks: 0, pathId: 'doorGap' },
				{ enemyDefId: 'ant', count: 35, spacingTicks: 60, startDelayTicks: 240 },
				{ enemyDefId: 'beetle', count: 10, spacingTicks: 300, startDelayTicks: 320 },
				{ enemyDefId: 'fly', count: 14, spacingTicks: 132, startDelayTicks: 320 },
				{ enemyDefId: 'moth', count: 8, spacingTicks: 240, startDelayTicks: 380 },
				{ enemyDefId: 'weevil', count: 11, spacingTicks: 56, startDelayTicks: 500, pathId: 'doorGap' },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 240,
					pathId: 'crack',
					startDistanceTiles: 9,
				},
				{ enemyDefId: 'roach', count: 24, spacingTicks: 15, startDelayTicks: 1200, pathId: 'doorGap' },
			],
			countdownTicks: 8 * 60,
		},
	],
}

/**
 * Night 17, on the Floor: the Silverfish. Two in wave 3, both through the door gap, released after the
 * wave's last Ant and five seconds apart, then more of them in every ground wave, dealt over the three
 * lanes. At 0.6 tiles a second one takes ~43 seconds to cross from the door and ~97 from the crack, so a
 * wave's Silverfish are still walking when the next wave arrives -- the Beetle's overlap, by design.
 *
 * What the night asks (16C, decision 7): `armored` is x0.4 physical, so a line of Salt Shakers lands
 * ~20 on one per shaker per pass against its 110 HP. It is answered **non-physically** -- chemical at
 * 1.0 from a Spray Bottle, Vinegar Spray or Baking Soda, cold at 1.2 -- or with **a Lemon plus
 * physical**, since Armor Strip moves the 0.4 halfway to 1.0 for everything that hits after it.
 *
 * Never a Silverfish-only wave: a Cookie Jar lost in one buys eleven 110-HP walls. Two chaos-shaped
 * waves carry none at all.
 *
 * **One Mouse, in wave 10**, released last, the way night 14 releases both of its own, and **from under
 * the oven**: one entry, one lane, and the short drop onto the shared stretch that a mouse living under
 * the oven would take. It is here as a check on the answer this night teaches: `mammal` takes chemical
 * at x0.6, so the line the Silverfish pushed you into is the line the Mouse walks through. Wave 10
 * because it also carries a mold, whose 12 crumbs push the rest of the wave past what a lost Cookie Jar
 * can buy two Mice with -- it buys one.
 *
 * **Its two answers** (analytic-docs/DECISION-LOG.md, step 16): non-physical -- Spray Bottles, a
 * Vinegar Spray and Baking Soda on the shared stretch; or a Lemon plus physical -- a Lemon at the head of
 * the shared stretch stripping armour for the Salt Shakers and a Mousetrap behind it.
 */
export const night17: NightDef = {
	id: 'night17',
	index: 17,
	mapId: 'floor',
	unlocksTowerIds: ['lemon'],
	waves: [
		{
			entries: [
				{ enemyDefId: 'ant', count: 24, spacingTicks: 90, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 10, spacingTicks: 168, startDelayTicks: 200 },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 480, startDelayTicks: 330 },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 210, startDelayTicks: 330 },
				{ enemyDefId: 'weevil', count: 4, spacingTicks: 360, startDelayTicks: 260 },
			],
			countdownTicks: OPENING_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 25, spacingTicks: 87, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 10, spacingTicks: 162, startDelayTicks: 200 },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 450, startDelayTicks: 320 },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 198, startDelayTicks: 320 },
				{ enemyDefId: 'moth', count: 4, spacingTicks: 330, startDelayTicks: 400 },
				{ enemyDefId: 'weevil', count: 4, spacingTicks: 330, startDelayTicks: 240 },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 300,
					pathId: 'crack',
					startDistanceTiles: 12,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			// The Silverfish arrives: two, through the door gap, behind the last Ant and 300 ticks apart.
			entries: [
				{ enemyDefId: 'ant', count: 25, spacingTicks: 84, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 11, spacingTicks: 156, startDelayTicks: 200 },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 450, startDelayTicks: 320 },
				{ enemyDefId: 'fly', count: 8, spacingTicks: 192, startDelayTicks: 320 },
				{ enemyDefId: 'weevil', count: 4, spacingTicks: 330, startDelayTicks: 240 },
				{ enemyDefId: 'silverfish', count: 2, spacingTicks: 300, startDelayTicks: 780, pathId: 'doorGap' },
			],
			countdownTicks: 9 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 26, spacingTicks: 81, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 11, spacingTicks: 150, startDelayTicks: 190 },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 435, startDelayTicks: 310 },
				{ enemyDefId: 'fly', count: 9, spacingTicks: 186, startDelayTicks: 310 },
				{ enemyDefId: 'moth', count: 5, spacingTicks: 315, startDelayTicks: 380 },
				{ enemyDefId: 'weevil', count: 5, spacingTicks: 300, startDelayTicks: 230 },
				{ enemyDefId: 'silverfish', count: 2, spacingTicks: 780, startDelayTicks: 420 },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'slug', count: 1, spacingTicks: 60, startDelayTicks: 0, pathId: 'doorGap' },
				{ enemyDefId: 'ant', count: 27, spacingTicks: 78, startDelayTicks: 240 },
				{ enemyDefId: 'fly', count: 9, spacingTicks: 180, startDelayTicks: 340 },
				{ enemyDefId: 'silverfish', count: 3, spacingTicks: 660, startDelayTicks: 400 },
				{ enemyDefId: 'weevil', count: 5, spacingTicks: 285, startDelayTicks: 560 },
				{ enemyDefId: 'roach', count: 14, spacingTicks: 19, startDelayTicks: 1200, pathId: 'doorGap' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'fly', count: 17, spacingTicks: 114, startDelayTicks: 0 },
				{ enemyDefId: 'moth', count: 8, spacingTicks: 228, startDelayTicks: 100 },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 28, spacingTicks: 75, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 12, spacingTicks: 144, startDelayTicks: 180 },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 405, startDelayTicks: 300 },
				{ enemyDefId: 'fly', count: 10, spacingTicks: 174, startDelayTicks: 300 },
				{ enemyDefId: 'moth', count: 5, spacingTicks: 300, startDelayTicks: 360 },
				{ enemyDefId: 'weevil', count: 6, spacingTicks: 264, startDelayTicks: 220 },
				{ enemyDefId: 'silverfish', count: 3, spacingTicks: 600, startDelayTicks: 380 },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 300,
					pathId: 'underTheOven',
					startDistanceTiles: 6,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 29, spacingTicks: 72, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 13, spacingTicks: 138, startDelayTicks: 180 },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 390, startDelayTicks: 300 },
				{ enemyDefId: 'fly', count: 10, spacingTicks: 168, startDelayTicks: 300 },
				{ enemyDefId: 'moth', count: 6, spacingTicks: 288, startDelayTicks: 360 },
				{ enemyDefId: 'weevil', count: 6, spacingTicks: 252, startDelayTicks: 210 },
				{ enemyDefId: 'silverfish', count: 4, spacingTicks: 540, startDelayTicks: 360 },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'slug', count: 2, spacingTicks: 240, startDelayTicks: 0, pathId: 'doorGap' },
				{ enemyDefId: 'ant', count: 30, spacingTicks: 69, startDelayTicks: 240 },
				{ enemyDefId: 'fly', count: 11, spacingTicks: 162, startDelayTicks: 340 },
				{ enemyDefId: 'silverfish', count: 4, spacingTicks: 510, startDelayTicks: 360 },
				{ enemyDefId: 'weevil', count: 7, spacingTicks: 234, startDelayTicks: 520 },
				{ enemyDefId: 'roach', count: 16, spacingTicks: 17, startDelayTicks: 1140, pathId: 'doorGap' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 31, spacingTicks: 66, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 14, spacingTicks: 126, startDelayTicks: 170 },
				{ enemyDefId: 'beetle', count: 7, spacingTicks: 360, startDelayTicks: 290 },
				{ enemyDefId: 'fly', count: 11, spacingTicks: 156, startDelayTicks: 290 },
				{ enemyDefId: 'moth', count: 7, spacingTicks: 270, startDelayTicks: 350 },
				{ enemyDefId: 'weevil', count: 7, spacingTicks: 222, startDelayTicks: 200 },
				{ enemyDefId: 'silverfish', count: 5, spacingTicks: 450, startDelayTicks: 340 },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 240,
					pathId: 'crack',
					startDistanceTiles: 18,
				},
				// The Mouse's second night: last out of the wave, 2 seconds behind the last Beetle.
				{ enemyDefId: 'mouse', count: 1, spacingTicks: 60, startDelayTicks: 1130, pathId: 'underTheOven' },
			],
			countdownTicks: 8 * 60,
		},
		{
			// The chaos wave, and nothing permanent or armored in it.
			entries: [
				{ enemyDefId: 'fly', count: 19, spacingTicks: 96, startDelayTicks: 0 },
				{ enemyDefId: 'moth', count: 10, spacingTicks: 198, startDelayTicks: 100 },
				{ enemyDefId: 'ant', count: 32, spacingTicks: 63, startDelayTicks: 200 },
				{ enemyDefId: 'roach', count: 16, spacingTicks: 114, startDelayTicks: 300 },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 33, spacingTicks: 63, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 15, spacingTicks: 120, startDelayTicks: 160 },
				{ enemyDefId: 'beetle', count: 8, spacingTicks: 336, startDelayTicks: 280 },
				{ enemyDefId: 'fly', count: 12, spacingTicks: 144, startDelayTicks: 280 },
				{ enemyDefId: 'moth', count: 7, spacingTicks: 258, startDelayTicks: 340 },
				{ enemyDefId: 'weevil', count: 8, spacingTicks: 204, startDelayTicks: 190 },
				{ enemyDefId: 'silverfish', count: 6, spacingTicks: 390, startDelayTicks: 320 },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'slug', count: 2, spacingTicks: 300, startDelayTicks: 0, pathId: 'doorGap' },
				{ enemyDefId: 'ant', count: 35, spacingTicks: 60, startDelayTicks: 240 },
				{ enemyDefId: 'beetle', count: 8, spacingTicks: 324, startDelayTicks: 320 },
				{ enemyDefId: 'fly', count: 13, spacingTicks: 138, startDelayTicks: 320 },
				{ enemyDefId: 'silverfish', count: 7, spacingTicks: 360, startDelayTicks: 300 },
				{ enemyDefId: 'weevil', count: 9, spacingTicks: 186, startDelayTicks: 500 },
				{ enemyDefId: 'roach', count: 20, spacingTicks: 16, startDelayTicks: 1200, pathId: 'doorGap' },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'slug', count: 3, spacingTicks: 300, startDelayTicks: 0, pathId: 'doorGap' },
				{ enemyDefId: 'ant', count: 37, spacingTicks: 57, startDelayTicks: 240 },
				{ enemyDefId: 'beetle', count: 9, spacingTicks: 300, startDelayTicks: 320 },
				{ enemyDefId: 'fly', count: 14, spacingTicks: 132, startDelayTicks: 320 },
				{ enemyDefId: 'moth', count: 8, spacingTicks: 240, startDelayTicks: 380 },
				{ enemyDefId: 'silverfish', count: 8, spacingTicks: 300, startDelayTicks: 300 },
				{ enemyDefId: 'weevil', count: 10, spacingTicks: 168, startDelayTicks: 480 },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 240,
					pathId: 'doorGap',
					startDistanceTiles: 5,
				},
				{ enemyDefId: 'roach', count: 24, spacingTicks: 15, startDelayTicks: 1200, pathId: 'doorGap' },
			],
			countdownTicks: 8 * 60,
		},
	],
}

/**
 * Night 18, the v1 finale, on the Floor in a **heatwave**: fire damage x1.3 and cold x0.7, everywhere
 * it lands -- a Toaster shot, a burn tick, the Candle's aura. No new enemy, everything the roster has,
 * and the Fan's question.
 *
 * **Two doors.** Waves 3 and 8 end on a 4-second countdown, so the flyers-only wave behind each arrives
 * while the slug-led run is still crossing -- wave 4 a dense Fly swarm, wave 9 Flies and Moths. A line
 * with no air control leaks both. Two chaos waves (6 and 11) carry the same air over a ground rush, and
 * the last wave puts a swarm on top of everything.
 *
 * Night 17's rules hold: never a Silverfish-only wave, and nothing armored or permanent in the flyer
 * and chaos waves, so a Cookie Jar lost in one buys flies rather than walls or board damage.
 *
 * **Its two answers**, neither leaning on cold: fire -- Toasters and a Candle on the shared stretch,
 * both warmed by the heat, with a Fan pushing the swarms back into them and a Vinegar Spray for the
 * molds; or a Lemon plus physical under a Toaster -- Salt Shakers behind a Lemon for the armoured ground,
 * with the Toaster and Fly Paper for the doors.
 */
export const night18: NightDef = {
	id: 'night18',
	index: 18,
	mapId: 'floor',
	modifierId: 'heatwave',
	unlocksTowerIds: ['fan'],
	waves: [
		{
			entries: [
				{ enemyDefId: 'ant', count: 26, spacingTicks: 87, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 11, spacingTicks: 156, startDelayTicks: 200 },
				{ enemyDefId: 'beetle', count: 5, spacingTicks: 465, startDelayTicks: 320 },
				{ enemyDefId: 'fly', count: 10, spacingTicks: 180, startDelayTicks: 320 },
				{ enemyDefId: 'moth', count: 5, spacingTicks: 300, startDelayTicks: 380 },
				{ enemyDefId: 'weevil', count: 5, spacingTicks: 300, startDelayTicks: 240 },
			],
			countdownTicks: OPENING_TICKS,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 27, spacingTicks: 81, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 12, spacingTicks: 150, startDelayTicks: 190 },
				{ enemyDefId: 'beetle', count: 6, spacingTicks: 435, startDelayTicks: 310 },
				{ enemyDefId: 'fly', count: 11, spacingTicks: 168, startDelayTicks: 310 },
				{ enemyDefId: 'moth', count: 6, spacingTicks: 288, startDelayTicks: 370 },
				{ enemyDefId: 'weevil', count: 5, spacingTicks: 288, startDelayTicks: 230 },
				{ enemyDefId: 'silverfish', count: 2, spacingTicks: 780, startDelayTicks: 420 },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 300,
					pathId: 'crack',
					startDistanceTiles: 12,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			// A slug-led run, and the short countdown that opens the first door behind it.
			entries: [
				{ enemyDefId: 'slug', count: 1, spacingTicks: 60, startDelayTicks: 0, pathId: 'doorGap' },
				{ enemyDefId: 'ant', count: 28, spacingTicks: 78, startDelayTicks: 240 },
				{ enemyDefId: 'fly', count: 11, spacingTicks: 162, startDelayTicks: 340 },
				{ enemyDefId: 'moth', count: 6, spacingTicks: 288, startDelayTicks: 400 },
				{ enemyDefId: 'silverfish', count: 3, spacingTicks: 660, startDelayTicks: 400 },
				{ enemyDefId: 'weevil', count: 6, spacingTicks: 270, startDelayTicks: 560 },
				{ enemyDefId: 'roach', count: 15, spacingTicks: 18, startDelayTicks: 1200, pathId: 'doorGap' },
			],
			countdownTicks: 4 * 60,
		},
		{
			// The first door: Flies and nothing else, one every third of a second over the three lanes.
			entries: [{ enemyDefId: 'fly', count: 26, spacingTicks: 60, startDelayTicks: 0 }],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 29, spacingTicks: 75, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 13, spacingTicks: 144, startDelayTicks: 180 },
				{ enemyDefId: 'beetle', count: 7, spacingTicks: 405, startDelayTicks: 300 },
				{ enemyDefId: 'fly', count: 12, spacingTicks: 162, startDelayTicks: 300 },
				{ enemyDefId: 'moth', count: 6, spacingTicks: 288, startDelayTicks: 360 },
				{ enemyDefId: 'weevil', count: 6, spacingTicks: 258, startDelayTicks: 220 },
				{ enemyDefId: 'silverfish', count: 3, spacingTicks: 600, startDelayTicks: 380 },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 300,
					pathId: 'underTheOven',
					startDistanceTiles: 6,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			// The first chaos wave, and nothing permanent or armored in it.
			entries: [
				{ enemyDefId: 'fly', count: 20, spacingTicks: 90, startDelayTicks: 0 },
				{ enemyDefId: 'moth', count: 10, spacingTicks: 186, startDelayTicks: 100 },
				{ enemyDefId: 'ant', count: 32, spacingTicks: 63, startDelayTicks: 200 },
				{ enemyDefId: 'roach', count: 16, spacingTicks: 114, startDelayTicks: 300 },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 30, spacingTicks: 72, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 13, spacingTicks: 138, startDelayTicks: 180 },
				{ enemyDefId: 'beetle', count: 7, spacingTicks: 384, startDelayTicks: 300 },
				{ enemyDefId: 'fly', count: 13, spacingTicks: 150, startDelayTicks: 300 },
				{ enemyDefId: 'moth', count: 7, spacingTicks: 270, startDelayTicks: 360 },
				{ enemyDefId: 'weevil', count: 7, spacingTicks: 240, startDelayTicks: 210 },
				{ enemyDefId: 'silverfish', count: 4, spacingTicks: 540, startDelayTicks: 360 },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 240,
					pathId: 'crack',
					startDistanceTiles: 18,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			// The second slug-led run, and the second door behind it.
			entries: [
				{ enemyDefId: 'slug', count: 2, spacingTicks: 240, startDelayTicks: 0, pathId: 'doorGap' },
				{ enemyDefId: 'ant', count: 31, spacingTicks: 69, startDelayTicks: 240 },
				{ enemyDefId: 'fly', count: 13, spacingTicks: 150, startDelayTicks: 340 },
				{ enemyDefId: 'moth', count: 7, spacingTicks: 264, startDelayTicks: 400 },
				{ enemyDefId: 'silverfish', count: 4, spacingTicks: 510, startDelayTicks: 360 },
				{ enemyDefId: 'weevil', count: 7, spacingTicks: 228, startDelayTicks: 520 },
				{ enemyDefId: 'roach', count: 17, spacingTicks: 17, startDelayTicks: 1140, pathId: 'doorGap' },
			],
			countdownTicks: 4 * 60,
		},
		{
			// The second door: Flies again, with Moths curving at whatever light is on the board.
			entries: [
				{ enemyDefId: 'fly', count: 24, spacingTicks: 66, startDelayTicks: 0 },
				{ enemyDefId: 'moth', count: 12, spacingTicks: 150, startDelayTicks: 120 },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 32, spacingTicks: 66, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 15, spacingTicks: 126, startDelayTicks: 170 },
				{ enemyDefId: 'beetle', count: 8, spacingTicks: 354, startDelayTicks: 290 },
				{ enemyDefId: 'fly', count: 14, spacingTicks: 138, startDelayTicks: 290 },
				{ enemyDefId: 'moth', count: 8, spacingTicks: 252, startDelayTicks: 350 },
				{ enemyDefId: 'weevil', count: 8, spacingTicks: 210, startDelayTicks: 200 },
				{ enemyDefId: 'silverfish', count: 5, spacingTicks: 450, startDelayTicks: 340 },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 240,
					pathId: 'crack',
					startDistanceTiles: 4,
				},
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 520,
					pathId: 'doorGap',
					startDistanceTiles: 5,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			// The second chaos wave.
			entries: [
				{ enemyDefId: 'fly', count: 22, spacingTicks: 84, startDelayTicks: 0 },
				{ enemyDefId: 'moth', count: 12, spacingTicks: 174, startDelayTicks: 100 },
				{ enemyDefId: 'ant', count: 34, spacingTicks: 60, startDelayTicks: 200 },
				{ enemyDefId: 'roach', count: 17, spacingTicks: 108, startDelayTicks: 300 },
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'ant', count: 34, spacingTicks: 63, startDelayTicks: 0 },
				{ enemyDefId: 'roach', count: 16, spacingTicks: 120, startDelayTicks: 160 },
				{ enemyDefId: 'beetle', count: 8, spacingTicks: 330, startDelayTicks: 280 },
				{ enemyDefId: 'fly', count: 15, spacingTicks: 132, startDelayTicks: 280 },
				{ enemyDefId: 'moth', count: 8, spacingTicks: 240, startDelayTicks: 340 },
				{ enemyDefId: 'weevil', count: 8, spacingTicks: 198, startDelayTicks: 190 },
				{ enemyDefId: 'silverfish', count: 6, spacingTicks: 390, startDelayTicks: 320 },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 360,
					pathId: 'crack',
					startDistanceTiles: 24,
				},
			],
			countdownTicks: 8 * 60,
		},
		{
			entries: [
				{ enemyDefId: 'slug', count: 2, spacingTicks: 300, startDelayTicks: 0, pathId: 'doorGap' },
				{ enemyDefId: 'ant', count: 36, spacingTicks: 60, startDelayTicks: 240 },
				{ enemyDefId: 'beetle', count: 9, spacingTicks: 312, startDelayTicks: 320 },
				{ enemyDefId: 'fly', count: 15, spacingTicks: 126, startDelayTicks: 320 },
				{ enemyDefId: 'moth', count: 8, spacingTicks: 240, startDelayTicks: 380 },
				{ enemyDefId: 'silverfish', count: 7, spacingTicks: 360, startDelayTicks: 300 },
				{ enemyDefId: 'weevil', count: 9, spacingTicks: 180, startDelayTicks: 500 },
				{ enemyDefId: 'roach', count: 21, spacingTicks: 16, startDelayTicks: 1200, pathId: 'doorGap' },
			],
			countdownTicks: 8 * 60,
		},
		{
			// The last wave: everything, with a swarm on top of it.
			entries: [
				{ enemyDefId: 'slug', count: 3, spacingTicks: 300, startDelayTicks: 0, pathId: 'doorGap' },
				{ enemyDefId: 'ant', count: 38, spacingTicks: 57, startDelayTicks: 240 },
				{ enemyDefId: 'beetle', count: 10, spacingTicks: 294, startDelayTicks: 320 },
				{ enemyDefId: 'fly', count: 26, spacingTicks: 72, startDelayTicks: 320 },
				{ enemyDefId: 'moth', count: 10, spacingTicks: 210, startDelayTicks: 380 },
				{ enemyDefId: 'silverfish', count: 8, spacingTicks: 300, startDelayTicks: 300 },
				{ enemyDefId: 'weevil', count: 10, spacingTicks: 162, startDelayTicks: 480 },
				{
					enemyDefId: 'mold',
					count: 1,
					spacingTicks: 60,
					startDelayTicks: 240,
					pathId: 'crack',
					startDistanceTiles: 9,
				},
				{ enemyDefId: 'roach', count: 25, spacingTicks: 15, startDelayTicks: 1200, pathId: 'doorGap' },
			],
			countdownTicks: 8 * 60,
		},
	],
}

/**
 * Positional, and `GameView.vue` walks it by array position, so the order here is the order Continue
 * plays them in: a night added later goes in by its index, never appended.
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
	night14,
	night15,
	night16,
	night17,
	night18,
]
