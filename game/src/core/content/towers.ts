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

import {
	attack,
	aura,
	bait,
	barricade,
	charge,
	cleanse,
	collect,
	coneAttack,
	income,
	reveal,
	suppress,
	tileEffect,
} from '@/core/content/behaviours.ts'
import { tier } from '@/core/content/upgrades.ts'
import type { TowerDef } from '@/core/content/schema.ts'
import type { DeltaTarget, TierParams, TowerUpgrade } from '@/core/content/upgrades.ts'

/** `core/` has no clock, so the conversion from the doc's per-second rates lives here as a factor. */
const TICKS_PER_SECOND = 60

/** A firing rate of `n` per second, as the tick gap between two shots. 1.0/sec is 60, not 1000. */
function perSecond(rate: number): number {
	return Math.round(TICKS_PER_SECOND / rate)
}

/** The doc's "~1.5s to travel in" for an auto-collected pile, in ticks. Shared by both collectors. */
const COLLECT_TRAVEL_TICKS = 90

// --- upgrade tiers --------------------------------------------------------------------------------
// Authored inline beside each def rather than in a second file keyed by tower id: `TowerDefOf<Id>`
// already derives every key from the id in this file, and a parallel table would be a second place a
// tower can be missing from with nothing to catch it.
//
// Every tier below is a delta against a field of the behaviour vocabulary. **No system file branches
// on a tower id or a tier number**, which is the acceptance criterion the whole of step 12 exists to
// prove: a second tower gaining any of these six tier-3 effects is an entry in this file and no code
// at all.
//
// **Tiers 1 and 2 are flat adds, re-tuned in 12C against the inspector's diff.** 12A authored them
// as one shared `x1.4` -- analytic-docs/CONTENT.md section 1's "roughly +40% to the defining stat" --
// with nothing on screen to read the result in. With the before -> after diff drawn, a multiplier is
// the wrong shape: it compounds into 9.8 damage, 117.6 damage, a 5.6-tile reveal radius and a
// 1.11/sec rate, and a diff row reading `9.8` is a number the player distrusts on sight. Each tower
// below now adds a round amount, sized at roughly the same +40% of its **base**, so both tiers land
// somewhere a person would have written down. The curve is shallower at tier 2 as a result, which is
// the honest trade: the second bump of a stat bought at 120% of the tower is not meant to be the
// best crumbs on the board.

/** The Mousetrap's T3 is "rearm time halved", and it halves two fields to mean it. */
const HALVED = 0.5

/** Salt Shaker T3, analytic-docs/CONTENT.md section 1: "gains splash (0.8 tile radius)". */
const SALT_SHAKER_SPLASH_TILES = 0.8

/**
 * The tier-3 rates of analytic-docs/CONTENT.md section 1, per **tick**, through the same divisor
 * every rate in this file uses. A bare 8 or 6 is sixty times the intended number and the schema
 * bounds on `reflectDamagePerTick` and `damagePerTick` are what reject one.
 */
const CARDBOARD_BOX_REFLECT_PER_TICK = 8 / TICKS_PER_SECOND
const NIGHTLIGHT_AURA_PER_TICK = 6 / TICKS_PER_SECOND

/**
 * What the Nightlight reveals within, and -- once its tier 3 lands -- what it burns within. One
 * constant because they are one number: the tower damages exactly what it attracts.
 */
const NIGHTLIGHT_RADIUS_TILES = 4

/**
 * What the Baking Soda splashes within **and** what it scrubs slime within. One constant for the
 * same reason `NIGHTLIGHT_RADIUS_TILES` is one: it clears exactly the circle it damages in. 1.2 makes
 * it the AOE its role says without covering its whole range-2 circle before tier 3.
 */
const BAKING_SODA_RADIUS_TILES = 1.2

/** Its tier 3 raises both halves of that radius together, to 2.0 -- the whole circle at once. */
const BAKING_SODA_T3_RADIUS_TILES = 0.8

/** One tier, minus the keys `upgradesFor` derives. */
type TierBody = Omit<TierParams, 'nameKey' | 'descriptionKey'>

/**
 * The three tiers of one tower, with every key derived from the tower's own id the way `nameKey`
 * already is: `tower.saltShaker.tier1.name`. `ui/locales/contentKeys.ts` requires an English entry
 * per tower per tier, so a key that drifts from its def fails `type-check` there.
 *
 * **Tiers 1 and 2 carry no description.** The inspector's before -> after diff says "5 -> 7", and a
 * sentence under it reading "more damage" is noise. Tier 3 changes what the tower *does*.
 */
function upgradesFor(id: string, one: TierBody, two: TierBody, three: TierBody): TowerUpgrade[] {
	return [
		tier({ ...one, nameKey: `tower.${id}.tier1.name` }),
		tier({ ...two, nameKey: `tower.${id}.tier2.name` }),
		tier({ ...three, nameKey: `tower.${id}.tier3.name`, descriptionKey: `tower.${id}.tier3.description` }),
	]
}

/**
 * A tier that adds `amount` to one field on one behaviour kind. Most of them.
 *
 * `amount` is negative for a cooldown, which is the one field a tower wants *less* of: there is no
 * `rate` field anywhere and inventing one would need a translation into `cooldownTicks / rate`,
 * which is where the rounding bug lives -- see the header of `core/content/upgrades.ts`. So a rate
 * bump is authored as the tick gap it lands on, and the gaps are picked to land on rates the card
 * can print: 75 ticks is 0.8/sec, 60 is 1.0 and 50 is 1.2.
 */
function raise(kind: DeltaTarget, field: string, amount: number): TierBody {
	return { add: [{ kind, fields: { [field]: amount } }] }
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
 * Splash stays 0 on the base def -- it is what the T3 upgrade adds, as a flat `add` of 0.8 tiles on
 * this same `attack`. Both paths for it already exist: instant AoE in `core/systems/combat.ts` and a
 * projectile's arrival in `core/systems/projectiles.ts`, and this tower takes the second because its
 * `projectileSpeed` is above 0.
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
	/** 5 -> 7 -> 9 damage, so the dps row reads 5, 7 and 9 and the baseline stays countable. */
	upgrades: upgradesFor('saltShaker', raise('attack', 'damage', 2), raise('attack', 'damage', 2), {
		add: [{ kind: 'attack', fields: { splashRadiusTiles: SALT_SHAKER_SPLASH_TILES } }],
	}),
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
	/**
	 * T3 is not in analytic-docs/CONTENT.md section 1 -- that list was written for the towers with
	 * interesting tiers -- so it is authored here and added to the doc: the collected piles arrive
	 * instantly. It removes the tower's one drawback, which is a real tier-3-shaped decision, and it
	 * is one number. `crumbPosition` in `render/layers/crumbs.ts` already guards `travelTicks <= 0`.
	 */
	upgrades: upgradesFor(
		'toasterCrumbTray',
		// 4 -> 6 -> 8 a second. A payout is a whole crumb -- the schema has `crumbsPerPayout` as an
		// integer -- so +2 is the smallest round step, and an income tower that compounds is the
		// reason to buy the tier at all.
		raise('income', 'crumbsPerPayout', 2),
		raise('income', 'crumbsPerPayout', 2),
		{ multiply: [{ kind: 'collect', fields: { travelTicks: 0 } }] },
	),
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
	/** T3, authored here and added to the doc for the same reason: the jar stops owing the 200. */
	upgrades: upgradesFor(
		'cookieJar',
		/** 9 -> 13 -> 17 a second. */
		raise('income', 'crumbsPerPayout', 4),
		raise('income', 'crumbsPerPayout', 4),
		{ multiply: [{ kind: 'income', fields: { enemyCrumbsOnDestroy: 0 } }] },
	),
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
	/**
	 * The rate and not the damage. This tower's output is the slow, and its 2 damage is explicitly
	 * not meant to matter (see above); the magnitude of `slow` is on the status def, which a tier
	 * cannot reach, so how *often* it lands is the defining stat.
	 *
	 * 75 -> 60 -> 50 ticks, which the card reads as 0.8/sec -> 1/sec -> 1.2/sec. 12A's `x1.4` on the
	 * cooldown gave 54 and 39 ticks -- 1.11/sec and 1.54/sec -- and a control tower's whole pitch is
	 * how often it lands, which is not a pitch you can make with 1.11.
	 *
	 * T3 is analytic-docs/CONTENT.md section 1's "slow becomes a 1.5s freeze on every 4th hit", and
	 * **the freeze being first in the list is load-bearing and free**: `STATUS_DEFS.slow.suppressedBy`
	 * is already `['freeze']`, so on the fourth hit the freeze lands and `applyStatus` turns the slow
	 * away by itself. "A freeze *instead of* a slow", with no branch anywhere. Reversed, the slow
	 * would land and the freeze overwrite it -- the same damage and a different story in the code.
	 *
	 * The 90 is the doc's 1.5 seconds and not the status def's 4: a 4-second freeze landing every
	 * fourth shot of a tower that fires every 50 ticks is a permanent freeze.
	 */
	upgrades: upgradesFor('iceCubeTray', raise('attack', 'cooldownTicks', -15), raise('attack', 'cooldownTicks', -10), {
		replaceApplies: [
			{
				kind: 'attack',
				applications: [{ kind: 'freeze', everyNthHit: 4, durationTicks: 90 }, 'slow'],
			},
		],
	}),
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
	/**
	 * Strips of tape, so the tiers `add` one rather than multiplying: 3 x 1.4 is 4.2 strips, and
	 * `TowerState.charges` is a counter `core/systems/charges.ts` spends down by one.
	 *
	 * T3 is analytic-docs/CONTENT.md section 1's "roots 3 enemies simultaneously": `maxOutstanding`
	 * 1 -> 3, which is the same roll of tape laid across three of them at once instead of one at a
	 * time. It is not more charges -- the tiers above already bought those.
	 */
	upgrades: upgradesFor('stickyTape', raise('charge', 'charges', 1), raise('charge', 'charges', 1), {
		add: [{ kind: 'charge', fields: { maxOutstanding: 2 } }],
	}),
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
	/**
	 * Against the `coneAttack`, because that is the behaviour this tower's damage is on.
	 *
	 * T3 is analytic-docs/CONTENT.md section 1's "the DoT goes on twice as fast", and it is **two
	 * stacks a hit and not a halved cooldown**: poison's cap is 5, so the tower reaches it in three
	 * sprays instead of five, which is the sentence the doc is describing. The magnitude is restated
	 * rather than inherited because `replaceApplies` rewrites the whole list -- see
	 * `ApplicationDelta` in `core/content/upgrades.ts` for why it cannot merge.
	 */
	/** 3 -> 4 -> 5 on the hit. The poison is the tower and the tiers only firm up what carries it. */
	upgrades: upgradesFor('sprayBottle', raise('coneAttack', 'damage', 1), raise('coneAttack', 'damage', 1), {
		replaceApplies: [
			{
				kind: 'coneAttack',
				applications: [{ kind: 'poison', magnitude: 2 / TICKS_PER_SECOND, stacks: 2 }],
			},
		],
	}),
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
	/**
	 * T3 is analytic-docs/CONTENT.md section 1's "rearm time halved", and it has to halve **both**
	 * numbers. `MOUSETRAP_TICKS` above is one value doing two jobs; halving only the rearm leaves the
	 * 396-tick cooldown gating every shot, the tower fires at exactly the rate it did before, and
	 * every test still passes.
	 */
	/** 60 -> 85 -> 110. One bar of the trap is one number, and 117.6 was never going to be it. */
	upgrades: upgradesFor('mousetrap', raise('attack', 'damage', 25), raise('attack', 'damage', 25), {
		multiply: [
			{ kind: 'attack', fields: { cooldownTicks: HALVED } },
			{ kind: 'charge', fields: { rearmTicks: HALVED } },
		],
	}),
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
 * `CLOSEST` is what the other behaviourless towers carry.
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
	/**
	 * `maxHp` is the whole tower, and it is on the def rather than on a behaviour -- which is why a
	 * delta may name `'def'` at all. Keep that to the two fields that are genuinely def-level,
	 * `maxHp` and `noise`; anything else a tier wants belongs on a behaviour, where a system reads it.
	 *
	 * T3 is analytic-docs/CONTENT.md section 1's "enemies chewing it take 8/s reflect damage", which
	 * is the one field the `barricade` descriptor grew. It resolves through the tag matrix like every
	 * other damage source, so an `armored` Roach gets a good deal less of it back than an Ant does.
	 */
	upgrades: upgradesFor('cardboardBox', raise('def', 'maxHp', 80), raise('def', 'maxHp', 80), {
		add: [{ kind: 'barricade', fields: { reflectDamagePerTick: CARDBOARD_BOX_REFLECT_PER_TICK } }],
	}),
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
 * "fires two projectiles" is 12B's, and it is not splash. `maxHp: 100` is every non-wall tower's
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
	/**
	 * T3 is analytic-docs/CONTENT.md section 1's "fires two projectiles", and **two projectiles means
	 * two targets** -- see `projectilesPerShot` on `AttackBehaviour`. 35 damage is 42 against `air`
	 * and the Fly has 14 HP, so a second grain at the same fly is a 350-crumb upgrade the player
	 * cannot tell is working.
	 */
	/** 35 -> 50 -> 65. Both bumps are wasted on a 14-HP Fly and bought for the Act III air. */
	upgrades: upgradesFor('toaster', raise('attack', 'damage', 15), raise('attack', 'damage', 15), {
		add: [{ kind: 'attack', fields: { projectilesPerShot: 1 } }],
	}),
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
 * precedent.
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
	behaviours: [reveal({ radiusTiles: NIGHTLIGHT_RADIUS_TILES, attractsLightDrawn: true })],
	/**
	 * What it reveals within is the whole tower, so that is what the tiers bump.
	 *
	 * T3 is analytic-docs/CONTENT.md section 1's "damages what it attracts (6/s)", as an `aura` this
	 * def gains. Two numbers on it are deliberate:
	 *
	 * - **the radius is the lamp's own** `NIGHTLIGHT_RADIUS_TILES`, not a third number. It damages
	 *   exactly what it reveals, so the two are the same constant. (Tiers 1 and 2 pull the *reveal*
	 *   ahead of it; the aura arrives at the base radius, which is the conservative end of it.)
	 * - **`fire` and not `physical`.** The matrix gives fire x1.2 against `air` and physical x0.5,
	 *   and a lamp whose whole job is moths should not carry the worst damage type against them.
	 */
	/**
	 * 4 -> 5 -> 6 tiles. A radius is the one stat where a multiplier lies about its own size: 12A's
	 * x1.4 gave 5.6 and 7.84, which is a third of the board lit for 160 crumbs, and a whole tile is
	 * already +56% of the area at the first step.
	 */
	upgrades: upgradesFor('nightlight', raise('reveal', 'radiusTiles', 1), raise('reveal', 'radiusTiles', 1), {
		addBehaviours: [
			aura({
				radiusTiles: NIGHTLIGHT_RADIUS_TILES,
				damagePerTick: NIGHTLIGHT_AURA_PER_TICK,
				damageType: 'fire',
				targets: 'both',
			}),
		],
	}),
}

/**
 * analytic-docs/CONTENT.md section 1, Act II: 145 crumbs, 4 damage + 4/s, 1.0/sec, range 3,
 * chemical, both, no noise, off the path. The board's answer to mold: it scrubs one molded cell a
 * second, nearest the fridge first, whether or not it has anything to shoot.
 *
 * **`applies: ['poison']` is bare, and that is not an oversight.** The Spray Bottle above overrides
 * the magnitude because its row gives a 2/s the status table disagrees with. This row's 4/s *is* the
 * table's number, so authoring `4 / TICKS_PER_SECOND` here would be a second copy of it that only
 * drifts.
 *
 * The cleanse radius is its own range and its interval its own rate, so the card can honestly say
 * "one patch a second". `projectileSpeed: 0.1` and `maxHp: 100` are every projectile tower's
 * precedent; section 5 gives `FIRST` to a DPS tower.
 */
export const vinegarSpray: TowerDefOf<'vinegarSpray'> = {
	id: 'vinegarSpray',
	nameKey: 'tower.vinegarSpray.name',
	descriptionKey: 'tower.vinegarSpray.description',
	glyph: '🧪',
	role: 'DOT',
	cost: 145,
	maxHp: 100,
	placement: 'off_path',
	noise: 0,
	defaultTargetingMode: 'FIRST',
	behaviours: [
		attack({
			damage: 4,
			damageType: 'chemical',
			cooldownTicks: perSecond(1.0),
			rangeTiles: 3,
			targets: 'both',
			projectileSpeed: 0.1,
			applies: ['poison'],
		}),
		cleanse({ radiusTiles: 3, clears: ['mold'], maxTilesPerPulse: 1, intervalTicks: perSecond(1.0) }),
	],
	/**
	 * 4 -> 6 -> 8 on the hit.
	 *
	 * T3 doubles the **scrubbing** radius and leaves the attack range at 3, which is the point: a base
	 * Vinegar Spray defends its own corner, and a tier-3 one reaches mold where its shots do not.
	 */
	upgrades: upgradesFor('vinegarSpray', raise('attack', 'damage', 2), raise('attack', 'damage', 2), {
		add: [{ kind: 'cleanse', fields: { radiusTiles: 3 } }],
	}),
}

/**
 * analytic-docs/CONTENT.md section 1, Act II: 80 crumbs, 6 damage, 0.6/sec, range 2, chemical,
 * ground, no noise, off the path. 🥣 and not the doc's original 🧂 -- that is the Salt Shaker's.
 *
 * **`projectileSpeed: 0` with a splash radius**, so it takes `combatSystem`'s instant-AoE branch --
 * a shaker of powder does not fly. It is the first tower in the game that does.
 *
 * Every pulse scrubs slime off every cell in `BAKING_SODA_RADIUS_TILES` of the tower, on the tower's
 * own 100-tick rate; section 5 gives `CLOSEST` to an area tower.
 */
export const bakingSoda: TowerDefOf<'bakingSoda'> = {
	id: 'bakingSoda',
	nameKey: 'tower.bakingSoda.name',
	descriptionKey: 'tower.bakingSoda.description',
	glyph: '🥣',
	role: 'AOE',
	cost: 80,
	maxHp: 100,
	placement: 'off_path',
	noise: 0,
	defaultTargetingMode: 'CLOSEST',
	behaviours: [
		attack({
			damage: 6,
			damageType: 'chemical',
			cooldownTicks: perSecond(0.6),
			rangeTiles: 2,
			targets: 'ground',
			projectileSpeed: 0,
			splashRadiusTiles: BAKING_SODA_RADIUS_TILES,
		}),
		cleanse({
			radiusTiles: BAKING_SODA_RADIUS_TILES,
			clears: ['slime'],
			maxTilesPerPulse: 0,
			intervalTicks: perSecond(0.6),
		}),
	],
	/**
	 * 6 -> 8 -> 10 on the hit.
	 *
	 * T3 raises the splash **and** the scrub radius together, the way the Mousetrap's halves two fields
	 * to mean one thing: a tower that scrubs further than it hits is a bug wearing a tier's clothes.
	 */
	upgrades: upgradesFor('bakingSoda', raise('attack', 'damage', 2), raise('attack', 'damage', 2), {
		add: [
			{ kind: 'attack', fields: { splashRadiusTiles: BAKING_SODA_T3_RADIUS_TILES } },
			{ kind: 'cleanse', fields: { radiusTiles: BAKING_SODA_T3_RADIUS_TILES } },
		],
	}),
}

/** What the Bay Leaf suppresses burrowing within, and what its tier-3 aura marks within. */
const BAY_LEAF_RADIUS_TILES = 3

/**
 * analytic-docs/CONTENT.md section 1, Act II: 160 crumbs, SUPPRESSION, no damage, no rate, range 3,
 * ground, no noise, off the path -- and the behaviour note, "suppresses burrowing inside its radius:
 * Weevils surface and become targetable".
 *
 * **One `suppress` descriptor and nothing else**, the Nightlight's shape: no attack, so targeting and
 * combat skip it. `CLOSEST` and `maxHp: 100` are that def's precedent too.
 */
export const bayLeaf: TowerDefOf<'bayLeaf'> = {
	id: 'bayLeaf',
	nameKey: 'tower.bayLeaf.name',
	descriptionKey: 'tower.bayLeaf.description',
	glyph: '🌿',
	role: 'SUPPRESSION',
	cost: 160,
	maxHp: 100,
	placement: 'off_path',
	noise: 0,
	defaultTargetingMode: 'CLOSEST',
	behaviours: [suppress({ radiusTiles: BAY_LEAF_RADIUS_TILES, suppresses: 'burrow' })],
	/**
	 * 3 -> 3.5 -> 4 tiles. Half a tile a tier and not a whole one: at 5 it would suppress half the
	 * Counter's lane and delete the mechanic.
	 *
	 * T3 marks what it holds up: an `aura` with no damage that applies `Marked`, at the **base** radius
	 * the way the Nightlight's aura sits at its own.
	 */
	upgrades: upgradesFor('bayLeaf', raise('suppress', 'radiusTiles', 0.5), raise('suppress', 'radiusTiles', 0.5), {
		addBehaviours: [
			aura({
				radiusTiles: BAY_LEAF_RADIUS_TILES,
				damagePerTick: 0,
				damageType: 'physical',
				targets: 'ground',
				applies: ['marked'],
			}),
		],
	}),
}

/**
 * analytic-docs/CONTENT.md section 1, Act II: 155 crumbs, 8 damage, 0.9/sec, range 3, chemical, both,
 * no noise, off the path. The answer to the Silverfish: every hit lands Armor Strip.
 *
 * **`applies: ['armorStrip']` is bare**, the Vinegar Spray's reason: the status table's 4s and
 * halfway-to-1.0 *are* the numbers, and authoring them here would be a second copy that drifts.
 * `projectileSpeed: 0.1` is every projectile tower's precedent.
 *
 * **Two fields are step 16C's, from running night 17 headless**, and neither is section 1's:
 *
 * - **A 0.6-tile splash at base.** 16A's single-target strip lands on one Silverfish at a time for 4
 *   seconds, and night 17 walks them in behind Ant columns. Two Lemons in a Salt Shaker line lost all
 *   23 items; four still lost 16-19, against a same-cost chemical line that lost none. Rate, damage and
 *   range each barely moved it; a 0.6 splash took the two-Lemon line to 1-3 items lost. T3's 1.0 is
 *   still the upgrade.
 * - **`STRONGEST`, not `FIRST`.** On `FIRST` the same line lost 14-16: the Lemon strips the Ant at the
 *   head of the column and the Silverfish behind it walks through whole. Its job is the strip, not the
 *   DPS, so it defaults the way section 5 defaults a tower that picks its target.
 */
export const lemon: TowerDefOf<'lemon'> = {
	id: 'lemon',
	nameKey: 'tower.lemon.name',
	descriptionKey: 'tower.lemon.description',
	glyph: '🍋',
	role: 'DOT',
	cost: 155,
	maxHp: 100,
	placement: 'off_path',
	noise: 0,
	defaultTargetingMode: 'STRONGEST',
	behaviours: [
		attack({
			damage: 8,
			damageType: 'chemical',
			cooldownTicks: perSecond(0.9),
			rangeTiles: 3,
			targets: 'both',
			projectileSpeed: 0.1,
			splashRadiusTiles: 0.6,
			applies: ['armorStrip'],
		}),
	],
	/**
	 * 8 -> 11 -> 14 on the hit.
	 *
	 * T3 widens the splash from 0.6 to 1 tile, so the strip lands on everything around the hit:
	 * `dealSplashDamage` applies the shot's statuses to each enemy it catches.
	 */
	upgrades: upgradesFor('lemon', raise('attack', 'damage', 3), raise('attack', 'damage', 3), {
		add: [{ kind: 'attack', fields: { splashRadiusTiles: 1.0 } }],
	}),
}

/**
 * What the Candle burns within **and** lights within. One constant, the Nightlight's reason: it burns
 * exactly the circle it lights.
 */
const CANDLE_RADIUS_TILES = 2

/**
 * analytic-docs/CONTENT.md section 1, Act II: 130 crumbs, DOT, a 4/sec aura, range 2, fire, both, no
 * noise, off the path -- and the behaviour note, "a light: Moths drift toward it".
 *
 * **`[aura, reveal]` and nothing else**, neither of them new: the aura is 12B's and the light is
 * 11B's registry, which a Moth reads from any tower carrying a `reveal`. It also reveals `hidden`
 * enemies within 2, which is right for a lit candle and inert in v1, where nothing is hidden.
 *
 * `CLOSEST` and `maxHp: 100` are every behaviourless tower's precedent.
 */
export const candle: TowerDefOf<'candle'> = {
	id: 'candle',
	nameKey: 'tower.candle.name',
	descriptionKey: 'tower.candle.description',
	glyph: '🕯️',
	role: 'DOT',
	cost: 130,
	maxHp: 100,
	placement: 'off_path',
	noise: 0,
	defaultTargetingMode: 'CLOSEST',
	behaviours: [
		aura({
			radiusTiles: CANDLE_RADIUS_TILES,
			damagePerTick: 4 / TICKS_PER_SECOND,
			damageType: 'fire',
			targets: 'both',
		}),
		reveal({ radiusTiles: CANDLE_RADIUS_TILES, attractsLightDrawn: true }),
	],
	/**
	 * 4 -> 5.5 -> 7 a second.
	 *
	 * T3 is analytic-docs/CONTENT.md section 1's "burn applied by the aura stacks to 3": the aura starts
	 * applying `burn`, whose cap of 3 is on the status def, so it reaches it in three pulses. At the
	 * status table's 5/sec a stack that is +15/sec on top of the aura, which is too much for one tier --
	 * so the application authors its own 2/sec a stack, +6/sec at the cap. A draft; 17D judges it.
	 */
	upgrades: upgradesFor(
		'candle',
		raise('aura', 'damagePerTick', 1.5 / TICKS_PER_SECOND),
		raise('aura', 'damagePerTick', 1.5 / TICKS_PER_SECOND),
		{ replaceApplies: [{ kind: 'aura', applications: [{ kind: 'burn', magnitude: 2 / TICKS_PER_SECOND }] }] },
	),
}

/**
 * The Burner's 14/sec, per **tick**. `TileEffectBehaviour.magnitude` is unbounded in the schema
 * because it means a different thing per kind, so a bare `14` would pass validation and burn at
 * 840/sec. `tests/content.spec.ts` pins this instead.
 */
const GAS_STOVE_BURNER_HEAT_PER_TICK = 14 / TICKS_PER_SECOND

/**
 * analytic-docs/CONTENT.md section 1, Act II: 200 crumbs, TILE_EFFECT, 14/sec, "1 tile", fire, ground,
 * noise 2, **path_only** -- and the behaviour note, "writes a persistent damaging tile onto the track".
 *
 * **One `tileEffect` and nothing else.** It is not a barricade: `barricadePositions` asks
 * `isBarricade`, so enemies walk straight over it, and the Cardboard Box competes with it for the
 * same track tiles.
 *
 * `durationTicks: 2, refreshIntervalTicks: 1` -- rewritten every tick, each write living two, so the
 * heat is gone the tick the Burner is sold. Not 1: a 1-tick write is aged out in `tiles` the same
 * tick it lands, and the renderer, which reads between ticks, would never see the tile it burns on
 * (steps/17-auras-and-zones/A-candle-burner-fly-paper.md, decision 2).
 *
 * The noise is paid once a second **while something on the floor is on the ring**, not constantly --
 * 2/sec beats the meter's 1.5/sec decay, and a Burner idling through the build phase would wake the
 * house on its own. `core/systems/tileEffect.ts` has the rule.
 */
export const gasStoveBurner: TowerDefOf<'gasStoveBurner'> = {
	id: 'gasStoveBurner',
	nameKey: 'tower.gasStoveBurner.name',
	descriptionKey: 'tower.gasStoveBurner.description',
	glyph: '♨️',
	role: 'TILE_EFFECT',
	cost: 200,
	maxHp: 100,
	placement: 'path_only',
	noise: 2,
	defaultTargetingMode: 'CLOSEST',
	behaviours: [
		tileEffect({
			effect: 'heat',
			radiusTiles: 0,
			magnitude: GAS_STOVE_BURNER_HEAT_PER_TICK,
			durationTicks: 2,
			refreshIntervalTicks: 1,
		}),
	],
	/**
	 * 14 -> 20 -> 26 a second.
	 *
	 * T3 adds a radius of 1: the flame reaches the tiles either side. Around a track tile that also
	 * lights the buildable tiles beside it, which nothing on the floor stands on today.
	 */
	upgrades: upgradesFor(
		'gasStoveBurner',
		raise('tileEffect', 'magnitude', 6 / TICKS_PER_SECOND),
		raise('tileEffect', 'magnitude', 6 / TICKS_PER_SECOND),
		raise('tileEffect', 'radiusTiles', 1),
	),
}

/**
 * analytic-docs/CONTENT.md section 1, Act II: 35 crumbs, CONTROL, 0 damage, no rate, range 2, **air
 * only**, no noise, off the path -- and the behaviour note, "2 charges, air-only root, self-removes
 * when spent". The Sticky Tape for flyers.
 *
 * **`maxOutstanding` equals the charges.** A panic button that holds one fly and waits for it to die
 * before catching the second is not one. "Self-removes when spent" means what it means for the tape:
 * it leaves the tick after its last stuck flyer dies, which `retireSpentTowers` already does.
 *
 * The doc's rate is a dash and an attack needs a cooldown: `perSecond(2)` is a draft. `physical`
 * against 0 damage is the tape's honest filler, and `projectileSpeed: 0` lands the root the tick it
 * fires.
 */
export const flyPaper: TowerDefOf<'flyPaper'> = {
	id: 'flyPaper',
	nameKey: 'tower.flyPaper.name',
	descriptionKey: 'tower.flyPaper.description',
	glyph: '🎗️',
	role: 'CONTROL',
	cost: 35,
	maxHp: 100,
	placement: 'off_path',
	noise: 0,
	defaultTargetingMode: 'CLOSEST',
	behaviours: [
		attack({
			damage: 0,
			damageType: 'physical',
			cooldownTicks: perSecond(2),
			rangeTiles: 2,
			targets: 'air',
			projectileSpeed: 0,
			applies: ['rooted'],
		}),
		charge({ charges: 2, rearmTicks: 0, maxOutstanding: 2 }),
	],
	/**
	 * 2 -> 3 -> 4 sheets, all of them sticky at once.
	 *
	 * T3 adds a rearm: a fresh sheet every ten seconds, and the paper stops leaving the board. That is
	 * a tier-3-shaped change for a disposable tower, and it is pure config -- `spendCharge` and
	 * `retireSpentTowers` already read `rearmTicks`.
	 */
	upgrades: upgradesFor(
		'flyPaper',
		{ add: [{ kind: 'charge', fields: { charges: 1, maxOutstanding: 1 } }] },
		{ add: [{ kind: 'charge', fields: { charges: 1, maxOutstanding: 1 } }] },
		raise('charge', 'rearmTicks', 10 * TICKS_PER_SECOND),
	),
}

/** How far off a lane the Honey Pot catches, and what its tier-3 honey spreads within. */
const HONEY_POT_RADIUS_TILES = 3

/**
 * analytic-docs/CONTENT.md section 1, Act II: 175 crumbs, ECONOMY, no damage, "3 bait", ground, no
 * noise, off the path, and 7/sec in *Economy rates*. What an enemy does at the pot is
 * `core/systems/bait.ts`'s.
 *
 * **`maxHp: 150` is a draft.** The doc gives the pot no HP, and the pot's HP *is* its risk: feeders
 * chew it at their own `meleeDamagePerTick`, so it is a number 17D judges on the board. No
 * `enemyCrumbsOnDestroy`: losing the pot is the cost, not a penalty wave.
 */
export const honeyPot: TowerDefOf<'honeyPot'> = {
	id: 'honeyPot',
	nameKey: 'tower.honeyPot.name',
	descriptionKey: 'tower.honeyPot.description',
	glyph: '🍯',
	role: 'ECONOMY',
	cost: 175,
	maxHp: 150,
	placement: 'off_path',
	noise: 0,
	defaultTargetingMode: 'CLOSEST',
	behaviours: [
		income({ crumbsPerPayout: 7, payoutIntervalTicks: TICKS_PER_SECOND }),
		bait({ radiusTiles: HONEY_POT_RADIUS_TILES, targets: 'ground', durationTicks: 3 * TICKS_PER_SECOND }),
	],
	/**
	 * 7 -> 9 -> 11 a second: the income is the bribe, so the income is what the tiers raise.
	 *
	 * T3, "the honey gets everywhere": a 0-damage aura at the bait radius that slows ground enemies --
	 * the Bay Leaf's tier-3 shape, so no system changes.
	 */
	upgrades: upgradesFor('honeyPot', raise('income', 'crumbsPerPayout', 2), raise('income', 'crumbsPerPayout', 2), {
		addBehaviours: [
			aura({
				radiusTiles: HONEY_POT_RADIUS_TILES,
				damagePerTick: 0,
				damageType: 'physical',
				targets: 'ground',
				applies: ['slow'],
			}),
		],
	}),
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
	vinegarSpray,
	bakingSoda,
	bayLeaf,
	lemon,
	candle,
	gasStoveBurner,
	flyPaper,
	honeyPot,
]

export type TowerId = (typeof TOWERS)[number]['id']
