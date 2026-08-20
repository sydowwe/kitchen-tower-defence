/**
 * The tower roster. One entry today -- the Salt Shaker, the baseline every other tower in
 * analytic-docs/CONTENT.md section 1 is priced against.
 *
 * A tower is numbers plus a list of behaviour descriptors from `core/content/behaviours.ts`. There
 * is no class, no `extends`, and no field naming a system. The second tower arrives in step 6 and
 * is the proof that no system file has to change to add one.
 *
 * Rates in the doc are per second; the fields here are tick counts, converted through `perSecond`
 * so the doc's number stays legible next to it.
 */

import { attack } from '@/core/content/behaviours.ts'
import type { TowerDef } from '@/core/content/schema.ts'

/** `core/` has no clock, so the conversion from the doc's per-second rates lives here as a factor. */
const TICKS_PER_SECOND = 60

/** A firing rate of `n` per second, as the tick gap between two shots. 1.0/sec is 60, not 1000. */
function perSecond(rate: number): number {
	return Math.round(TICKS_PER_SECOND / rate)
}

/**
 * A def whose id is known statically, so `nameKey` and `descriptionKey` are *derived* from it
 * rather than typed out. Two consequences worth the extra type:
 *
 * - a key that does not match its own id is a compile error, not a raw key rendered on screen;
 * - the ids survive as literals into `(typeof TOWERS)[number]['id']`, which is what
 *   `ui/locales/contentKeys.ts` uses to require an English entry per tower.
 */
export interface TowerDefOf<Id extends string> extends TowerDef {
	id: Id
	nameKey: `tower.${Id}.name`
	descriptionKey: `tower.${Id}.description`
}

/**
 * analytic-docs/CONTENT.md section 1, Act I: 50 crumbs, 5 damage, 1.0/sec, range 3, physical,
 * ground, no noise, off the path. That row is the calibration baseline for the whole economy, so
 * `tests/content.spec.ts` asserts every number here literally -- changing one has to be a
 * deliberate edit in both places.
 *
 * `maxHp` is not in the table (only the Cardboard Box's 200 is); 100 is the value the worked
 * example in analytic-docs/ARCHITECTURE.md section 4 uses for a tower that is not a wall.
 *
 * Splash stays 0 -- it is what the T3 upgrade adds, and upgrades are step 12.
 */
export const saltShaker: TowerDefOf<'saltShaker'> = {
	id: 'saltShaker',
	nameKey: 'tower.saltShaker.name',
	descriptionKey: 'tower.saltShaker.description',
	glyph: '🧂',
	role: 'BASIC_DPS',
	cost: 50,
	maxHp: 100,
	placement: 'off_path',
	noise: 0,
	/** `FIRST` for DPS towers (analytic-docs/CONTENT.md section 5). */
	defaultTargetingMode: 'FIRST',
	behaviours: [
		attack({
			damage: 5,
			damageType: 'physical',
			cooldownTicks: perSecond(1.0),
			rangeTiles: 3,
			targets: 'ground',
		}),
	],
}

export const TOWERS = [saltShaker]

export type TowerId = (typeof TOWERS)[number]['id']
