/**
 * The tower roster. It opens with the Salt Shaker, the baseline every other tower in
 * analytic-docs/CONTENT.md section 1 is priced against.
 *
 * A tower is numbers plus a list of behaviour descriptors from `core/content/behaviours.ts`. There
 * is no class, no `extends`, and no field naming a system: the two economy towers below were added
 * without a line changing in `core/systems/`.
 *
 * Rates in the doc are per second; the fields here are tick counts, converted through `perSecond`
 * so the doc's number stays legible next to it.
 */

import { attack, collect, income } from '@/core/content/behaviours.ts'
import type { TowerDef } from '@/core/content/schema.ts'

/** `core/` has no clock, so the conversion from the doc's per-second rates lives here as a factor. */
const TICKS_PER_SECOND = 60

/** A firing rate of `n` per second, as the tick gap between two shots. 1.0/sec is 60, not 1000. */
function perSecond(rate: number): number {
	return Math.round(TICKS_PER_SECOND / rate)
}

/** The doc's "~1.5s to travel in" for an auto-collected pile, in ticks. Shared by both collectors. */
const COLLECT_TRAVEL_TICKS = 90

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
			/**
			 * 6 tiles/sec, so a shot crosses the range-3 circle in half a second. There is no
			 * projectile-speed column in analytic-docs/CONTENT.md section 1, so the number is
			 * authored here and asserted in `tests/content.spec.ts` alongside the rest.
			 *
			 * 6B authored 0.2 with nothing on screen to judge it by. Step 6C put shots on the board
			 * and 0.2 read as a tracer round: at 12 tiles/sec the grains are gone before the eye
			 * finds them, and at 3x speed the shot and the hit are the same frame. 0.1 is the value
			 * a person picked while watching one cross.
			 */
			projectileSpeed: 0.1,
		}),
	],
}

/**
 * The two economy towers, and the proof that adding a tower is a config object: neither one has ever
 * needed a file in `core/systems/` written for it alone.
 *
 * Both pay out and both draw piles in. The radii are analytic-docs/CONTENT.md section 1's "2.5
 * collect" and "3 collect"; the 1.5 seconds that section gives for a trip is 90 ticks, not 1500.
 *
 * `travelTicks` was authored in step 7A with nothing on screen to judge it by. 7C watches a night
 * and may re-tune it -- in this file and in `tests/content.spec.ts`, the way 6C re-tuned
 * `projectileSpeed`.
 *
 * `maxHp: 100` matches the Salt Shaker's precedent -- the only HP in the table is the Cardboard
 * Box's 200. `defaultTargetingMode` is required and inert for a tower with no targeting behaviour;
 * section 5 gives `CLOSEST` to everything that is neither DPS nor burst.
 */
export const toasterCrumbTray: TowerDefOf<'toasterCrumbTray'> = {
	id: 'toasterCrumbTray',
	nameKey: 'tower.toasterCrumbTray.name',
	descriptionKey: 'tower.toasterCrumbTray.description',
	glyph: '🍞',
	role: 'ECONOMY',
	cost: 75,
	maxHp: 100,
	placement: 'off_path',
	noise: 0,
	defaultTargetingMode: 'CLOSEST',
	/** The doc's 4/sec, as a payout every 60 ticks -- see the note on `IncomeBehaviour`. */
	behaviours: [
		income({ crumbsPerPayout: 4, payoutIntervalTicks: TICKS_PER_SECOND }),
		collect({ radiusTiles: 2.5, travelTicks: COLLECT_TRAVEL_TICKS }),
	],
}

/**
 * TODO(step 10): drops 200 crumbs to the enemy side if destroyed (CONTENT.md section 1, *Economy
 * rates*). That needs tower HP to be damageable, which is step 10's, so it is not half-built here.
 */
export const cookieJar: TowerDefOf<'cookieJar'> = {
	id: 'cookieJar',
	nameKey: 'tower.cookieJar.name',
	descriptionKey: 'tower.cookieJar.description',
	glyph: '🍪',
	role: 'ECONOMY',
	cost: 150,
	maxHp: 100,
	placement: 'off_path',
	noise: 0,
	defaultTargetingMode: 'CLOSEST',
	behaviours: [
		income({ crumbsPerPayout: 9, payoutIntervalTicks: TICKS_PER_SECOND }),
		collect({ radiusTiles: 3, travelTicks: COLLECT_TRAVEL_TICKS }),
	],
}

export const TOWERS = [saltShaker, toasterCrumbTray, cookieJar]

export type TowerId = (typeof TOWERS)[number]['id']
