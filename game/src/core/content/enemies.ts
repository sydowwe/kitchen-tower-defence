/**
 * The enemy roster (analytic-docs/CONTENT.md section 2). Two enemies waves can schedule, and the
 * Fruit Fly, which no night schedules at all.
 *
 * An enemy is stats plus tags. The tags are the only thing that decides how it takes damage: they
 * multiply through `resolveDamage` in `core/content/matrix.ts`, and nothing branches on an enemy id
 * anywhere in the simulation.
 */

import type { EnemyDef } from '@/core/content/schema.ts'

/** `core/` has no clock, so the conversion from the doc's tiles-per-second lives here as a factor. */
const TICKS_PER_SECOND = 60

/** The doc's speeds are tiles per second. Everything the simulation reads is per tick. */
function tilesPerSecond(speed: number): number {
	return speed / TICKS_PER_SECOND
}

/** The enemy counterpart of `TowerDefOf` -- see the note there on why the keys are derived. */
export interface EnemyDefOf<Id extends string> extends EnemyDef {
	id: Id
	nameKey: `enemy.${Id}.name`
	descriptionKey: `enemy.${Id}.description`
}

/**
 * analytic-docs/CONTENT.md section 2, night 1: 10 HP, 1.0 tiles/sec, 3 crumbs, steals 1,
 * `ground swarm bug`.
 *
 * `swarm` is the tag with a matrix row (x1.5 fire, x1.5 chemical); `ground` and `bug` are
 * descriptive and multiply by 1.0. `tests/content.spec.ts` asserts that product through
 * `resolveDamage`, which is the end-to-end check that this roster and the matrix agree.
 */
export const ant: EnemyDefOf<'ant'> = {
	id: 'ant',
	nameKey: 'enemy.ant.name',
	descriptionKey: 'enemy.ant.description',
	glyph: '🐜',
	hp: 10,
	speedTilesPerTick: tilesPerSecond(1.0),
	reward: 3,
	steals: 1,
	tags: ['ground', 'swarm', 'bug'],
}

/**
 * analytic-docs/CONTENT.md section 2, night 3: 18 HP, 1.8 tiles/sec, 5 crumbs, steals 1,
 * `ground fast bug`.
 *
 * None of its three tags has a matrix row, so it takes every damage type at 1.0 -- what makes it
 * dangerous is the speed, which halves the time a tower has it in range compared to an Ant.
 */
export const roach: EnemyDefOf<'roach'> = {
	id: 'roach',
	nameKey: 'enemy.roach.name',
	descriptionKey: 'enemy.roach.description',
	glyph: '🪳',
	hp: 18,
	speedTilesPerTick: tilesPerSecond(1.8),
	reward: 5,
	steals: 1,
	tags: ['ground', 'fast', 'bug'],
}

/**
 * analytic-docs/CONTENT.md section 2, last row: 8 HP, 2.0 tiles/sec, 2 crumbs, steals 1,
 * `air swarm self-spawning`.
 *
 * **No scheduled night in v1.** Nothing in `nights.ts` names it: it is a consequence of crumb rot
 * (analytic-docs/DECISIONS.md section 9, change 1), hatched by `crumbsSystem` at 35s. It becomes a
 * wave enemy at night 20, post-v1, and that is a wave-table edit and nothing else.
 *
 * Nothing in the game can target `air` until the Toaster at night 8, so on nights 1-7 a hatched fly
 * walks to the fridge and takes an item. That is the tutorial, not an oversight --
 * analytic-docs/OPEN-QUESTIONS.md, "The fruit fly gap".
 */
export const fruitFly: EnemyDefOf<'fruitFly'> = {
	id: 'fruitFly',
	nameKey: 'enemy.fruitFly.name',
	descriptionKey: 'enemy.fruitFly.description',
	glyph: '🦟',
	hp: 8,
	speedTilesPerTick: tilesPerSecond(2.0),
	reward: 2,
	steals: 1,
	tags: ['air', 'swarm', 'self-spawning'],
}

export const ENEMIES = [ant, roach, fruitFly]

export type EnemyId = (typeof ENEMIES)[number]['id']
