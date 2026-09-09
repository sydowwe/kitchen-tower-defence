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

import { attack, barricade, charge, collect, coneAttack, income, reveal } from '@/core/content/behaviours.ts'
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
 *
 * **Both glyphs are the container, not its contents** -- a basket and a jar, where CONTENT.md
 * section 1 originally had the bread and the cookie. Those two are what a *crumb pile* is drawn with
 * (`render/layers/crumbs.ts`'s bands, and DECISIONS.md section 2 assigns the bread to crumbs), so a
 * Cookie Jar standing in its own collect radius was two sizes of the same emoji and the fat pile
 * worth clicking stopped being findable. A tower is furniture and a pile is litter; they cannot
 * share a silhouette. Step 7C, seen on screen.
 */
export const toasterCrumbTray: TowerDefOf<'toasterCrumbTray'> = {
	id: 'toasterCrumbTray',
	nameKey: 'tower.toasterCrumbTray.name',
	descriptionKey: 'tower.toasterCrumbTray.description',
	glyph: '🧺',
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
 * The jar's 200 is `enemyCrumbsOnDestroy` on its own `income`, spent on extra spawns by
 * `core/systems/spawn.ts` when the jar is destroyed. It is a field rather than a behaviour kind
 * because analytic-docs/CONTENT.md section 1's *Economy rates* table puts the 200 beside the 9/sec.
 */
export const cookieJar: TowerDefOf<'cookieJar'> = {
	id: 'cookieJar',
	nameKey: 'tower.cookieJar.name',
	descriptionKey: 'tower.cookieJar.description',
	glyph: '🫙',
	role: 'ECONOMY',
	cost: 150,
	maxHp: 100,
	placement: 'off_path',
	noise: 0,
	defaultTargetingMode: 'CLOSEST',
	behaviours: [
		income({ crumbsPerPayout: 9, payoutIntervalTicks: TICKS_PER_SECOND, enemyCrumbsOnDestroy: 200 }),
		collect({ radiusTiles: 3, travelTicks: COLLECT_TRAVEL_TICKS }),
	],
}

/**
 * The two status towers, and the proof that landing an effect is content: neither needed a line in
 * `core/systems/` beyond the one interpreter both share.
 *
 * Both author `applies` in its bare form and take the status table's own magnitude. The Spray Bottle
 * below is the one def that overrides it, because analytic-docs/CONTENT.md section 1 gives that
 * tower a DoT rate the status table disagrees with; nothing else in Act I has that problem.
 */

/**
 * analytic-docs/CONTENT.md section 1, Act I: 110 crumbs, 2 damage, 0.8/sec, range 3, cold, ground,
 * no noise, off the path. Section 4's Slow is -40% for 2 seconds, and this tower does not override
 * it.
 *
 * **The 2 damage is not meant to matter.** Cold is *weak* against `soft` (0.5x) and only slightly
 * strong against `armored` (1.2x) in section 3's matrix -- this is a control tower whose output is
 * the slow, and a version balanced around its damage would be the Salt Shaker at twice the price.
 *
 * `projectileSpeed` has no column in the doc, so it is authored here and pinned in
 * `tests/content.spec.ts` the way the Salt Shaker's is. 0.1 tiles/tick is that tower's, retuned in
 * 6C by watching a shot cross; there is no reason an ice cube should outrun a grain of salt.
 */
export const iceCubeTray: TowerDefOf<'iceCubeTray'> = {
	id: 'iceCubeTray',
	nameKey: 'tower.iceCubeTray.name',
	descriptionKey: 'tower.iceCubeTray.description',
	glyph: '🧊',
	role: 'SLOW',
	cost: 110,
	maxHp: 100,
	placement: 'off_path',
	noise: 0,
	/** Neither DPS nor burst, so section 5's default is `CLOSEST`. */
	defaultTargetingMode: 'CLOSEST',
	behaviours: [
		attack({
			damage: 2,
			damageType: 'cold',
			cooldownTicks: perSecond(0.8),
			rangeTiles: 3,
			targets: 'ground',
			projectileSpeed: 0.1,
			applies: ['slow'],
		}),
	],
}

/**
 * analytic-docs/CONTENT.md section 1, Act I: 40 crumbs, 0 damage, 0.5/sec, range 2, ground, no
 * noise, off the path -- and section 1's behaviour note, "applies `Rooted` to one enemy at a time,
 * until the tape is spent (3 charges) or the enemy dies".
 *
 * The damage column is 0 and the type column is a dash, but the schema requires a `damageType`:
 * `physical` against 0 damage is the honest filler, and `dealDamage` publishes no event for a
 * resolved 0 either way.
 *
 * `rearmTicks: 0` -- a tape does not rearm. It spends a charge per root and is removed when the
 * third one ends.
 */
export const stickyTape: TowerDefOf<'stickyTape'> = {
	id: 'stickyTape',
	nameKey: 'tower.stickyTape.name',
	descriptionKey: 'tower.stickyTape.description',
	glyph: '🧻',
	role: 'CONTROL',
	cost: 40,
	maxHp: 100,
	placement: 'off_path',
	noise: 0,
	defaultTargetingMode: 'CLOSEST',
	behaviours: [
		attack({
			damage: 0,
			damageType: 'physical',
			cooldownTicks: perSecond(0.5),
			rangeTiles: 2,
			targets: 'ground',
			applies: ['rooted'],
		}),
		charge({ charges: 3, rearmTicks: 0 }),
	],
}

/**
 * analytic-docs/CONTENT.md section 1, Act I: 120 crumbs, "3 + 2/s", 1.2/sec, range 3 cone, chemical,
 * both, no noise, off the path. The first cone in the game, and the first def to override a status
 * magnitude.
 *
 * **The 2/s is the row's own poison rate, not the status table's.** Section 4 gives Poison 4 dmg/s
 * and both numbers are right about different things: the table's default is what every other source
 * takes, and a tower may author its own. So the override is `2 / TICKS_PER_SECOND` -- a per-*tick*
 * magnitude, through the same divisor the rates above use. A bare `2` would be 120 damage a second,
 * and the schema's `[0, 1]` bound is what rejects it rather than the balance sheet finding out.
 *
 * `coneHalfAngleDeg: 30` -- a 60-degree spray, authored here because the doc's "3 cone" gives the
 * range and not the opening. `CLOSEST` is section 5's default for a cone.
 */
export const sprayBottle: TowerDefOf<'sprayBottle'> = {
	id: 'sprayBottle',
	nameKey: 'tower.sprayBottle.name',
	descriptionKey: 'tower.sprayBottle.description',
	glyph: '🧴',
	role: 'DOT',
	cost: 120,
	maxHp: 100,
	placement: 'off_path',
	noise: 0,
	defaultTargetingMode: 'CLOSEST',
	behaviours: [
		coneAttack({
			damage: 3,
			damageType: 'chemical',
			cooldownTicks: perSecond(1.2),
			rangeTiles: 3,
			coneHalfAngleDeg: 30,
			targets: 'both',
			applies: [{ kind: 'poison', magnitude: 2 / TICKS_PER_SECOND }],
		}),
	],
}

/**
 * analytic-docs/CONTENT.md section 1, Act I: 90 crumbs, 60 damage, 0.15/sec, range 1, physical,
 * ground, noise 2, off the path -- and section 1's behaviour note, "charge state machine: armed ->
 * fired -> rearming (6.6s) -> armed. Fires at the STRONGEST target in range by default."
 *
 * **One number, 396 ticks, for both the cooldown and the rearm.** The doc's 0.15/sec and its 6.6s
 * rearm are the same interval written twice, and `perSecond(0.15)` would be 400 -- four ticks
 * longer, which would make the rearm dead machinery (the cooldown would gate every shot) and the
 * balance sheet a lie. `round2(60 / 396)` is 0.15, so the shop card still shows the doc's rate.
 *
 * `projectileSpeed: 0` -- a trap snaps. The hit lands the tick it fires, with no `Projectile` entity
 * at all. `maxHp: 100` is every non-wall tower's precedent; the only HP in the table is the
 * Cardboard Box's 200.
 */
const MOUSETRAP_TICKS = 396

export const mousetrap: TowerDefOf<'mousetrap'> = {
	id: 'mousetrap',
	nameKey: 'tower.mousetrap.name',
	descriptionKey: 'tower.mousetrap.description',
	glyph: '🪤',
	role: 'BURST_DPS',
	cost: 90,
	maxHp: 100,
	placement: 'off_path',
	noise: 2,
	defaultTargetingMode: 'STRONGEST',
	behaviours: [
		attack({
			damage: 60,
			damageType: 'physical',
			cooldownTicks: MOUSETRAP_TICKS,
			rangeTiles: 1,
			targets: 'ground',
			projectileSpeed: 0,
		}),
		charge({ charges: 1, rearmTicks: MOUSETRAP_TICKS }),
	],
}

/**
 * analytic-docs/CONTENT.md section 1, Act I: 25 crumbs, 200 HP, no damage, no rate, no range, no
 * noise, **path_only** -- and section 1's behaviour note, "200 HP barricade placed *on* the track.
 * Enemies stop and attack it; it does not damage them."
 *
 * `[barricade()]` and nothing else. It has no attack, no income and no charge: what happens at it is
 * entirely `core/systems/barricades.ts` reading the descriptor, and the 200 is `maxHp` like every
 * other tower rather than a second number on the behaviour.
 *
 * `defaultTargetingMode` is required by the schema and inert for a tower with no targeting behaviour;
 * `CLOSEST` is what the other behaviourless towers carry. The T3 "enemies chewing it take 8/s reflect
 * damage" is step 12's, not this def's.
 */
export const cardboardBox: TowerDefOf<'cardboardBox'> = {
	id: 'cardboardBox',
	nameKey: 'tower.cardboardBox.name',
	descriptionKey: 'tower.cardboardBox.description',
	glyph: '📦',
	role: 'WALL',
	cost: 25,
	maxHp: 200,
	placement: 'path_only',
	noise: 0,
	defaultTargetingMode: 'CLOSEST',
	behaviours: [barricade()],
}

/**
 * analytic-docs/CONTENT.md section 1, Act I: 140 crumbs, 35 damage, 0.3/sec, range 4, fire,
 * **air only**, noise 3, off the path. The first tower that can touch a flyer, and the only one that
 * can touch nothing else.
 *
 * **`targets: 'air'` is the whole tower.** It needed no line in `core/systems/`: `isTargetable` in
 * `core/systems/targeting.ts` has read the class since 6B, and `Projectile.targets` carries it onto
 * the shot so a Toaster's projectile cannot land on an Ant after its tower is sold.
 *
 * 35 damage resolves to 42 against `air` (section 3's x1.2), which one-shots every flyer in v1. What
 * makes it scarce is the 0.3/sec -- 200 ticks between shots -- against a Fly that crosses the
 * Counter in ~14 seconds, the shortest window any tower has ever had.
 *
 * `noise: 3` is the highest in the game and nothing consumes it yet: `combatSystem` already
 * publishes `towerFired` with the def's noise on it, and step 13 is what reads it.
 *
 * `projectileSpeed: 0.12` is authored blind -- section 1 has no column for it -- and re-tuned in 11C
 * by watching a shot cross, the way 6C halved the Salt Shaker's. `splashRadiusTiles` stays 0: the T3
 * "fires two projectiles" is step 12's, not splash. `maxHp: 100` is every non-wall tower's
 * precedent. Section 1 gives the role, and section 5 gives `STRONGEST` to a burst tower.
 */
export const toaster: TowerDefOf<'toaster'> = {
	id: 'toaster',
	nameKey: 'tower.toaster.name',
	descriptionKey: 'tower.toaster.description',
	glyph: '🔥',
	role: 'BURST_DPS',
	cost: 140,
	maxHp: 100,
	placement: 'off_path',
	noise: 3,
	defaultTargetingMode: 'STRONGEST',
	behaviours: [
		attack({
			damage: 35,
			damageType: 'fire',
			cooldownTicks: perSecond(0.3),
			rangeTiles: 4,
			targets: 'air',
			projectileSpeed: 0.12,
		}),
	],
}

/**
 * analytic-docs/CONTENT.md section 1, Act II: 100 crumbs, DETECTION, no damage, no rate, range 4,
 * both, no noise, off the path -- and section 1's behaviour note, "reveals hidden enemies and pulls
 * light-drawn ones (Moth) into its radius".
 *
 * **One `reveal` descriptor and nothing else.** It has no attack, so `targetingSystem` and
 * `combatSystem` both skip it, and it needs no `cooldownTicks`, no `TowerState` and no plumbing
 * anywhere: adding it changed not one line in `core/systems/` outside the new light system, which is
 * the acceptance criterion this def exists to prove.
 *
 * The 4 is what it **reveals** within. The five tiles a Moth sees it from is
 * `LIGHT_ATTRACTION_TILES` in `core/systems/light.ts` -- see the note on `RevealBehaviour` for why
 * the moth's reach cannot live on the lamp.
 *
 * `defaultTargetingMode` is required by the schema and inert for a behaviourless tower; `CLOSEST` is
 * what the Cardboard Box and the two economy towers carry. `maxHp: 100` is every non-wall tower's
 * precedent. Section 1's "T3 upgrade adds damage (6/s)" is step 12's.
 */
export const nightlight: TowerDefOf<'nightlight'> = {
	id: 'nightlight',
	nameKey: 'tower.nightlight.name',
	descriptionKey: 'tower.nightlight.description',
	glyph: '💡',
	role: 'DETECTION',
	cost: 100,
	maxHp: 100,
	placement: 'off_path',
	noise: 0,
	defaultTargetingMode: 'CLOSEST',
	behaviours: [reveal({ radiusTiles: 4, attractsLightDrawn: true })],
}

/** Appended, never reordered: the shop renders this order and prints `index + 1` on each button. */
export const TOWERS = [
	saltShaker,
	toasterCrumbTray,
	cookieJar,
	iceCubeTray,
	stickyTape,
	sprayBottle,
	mousetrap,
	cardboardBox,
	toaster,
	nightlight,
]

export type TowerId = (typeof TOWERS)[number]['id']
