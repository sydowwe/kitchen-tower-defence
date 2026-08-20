/**
 * The enemy roster. One entry today -- the Ant, night 1's whole bestiary
 * (analytic-docs/CONTENT.md section 2).
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

export const ENEMIES = [ant]

export type EnemyId = (typeof ENEMIES)[number]['id']
