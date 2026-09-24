/**
 * The enemy roster (analytic-docs/CONTENT.md section 2). The enemies waves can schedule, and the
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

/**
 * The same conversion for a chew rate. Every enemy below chews a barricade at `hp / 10` per second,
 * which is the one rule that ties the number to something -- an enemy that is twice as hard to kill
 * takes half as long to get through a Cardboard Box.
 *
 * There is no column for this in analytic-docs/CONTENT.md section 2, on purpose: step 10C watches a
 * queue eat a box and adds one only if the rate settles somewhere other than `hp / 10`.
 */
function damagePerSecond(rate: number): number {
	return rate / TICKS_PER_SECOND
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
	meleeDamagePerTick: damagePerSecond(1.0),
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
	meleeDamagePerTick: damagePerSecond(1.8),
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
	/** Never read -- it flies, and a barricade holds nothing that is off the floor. Authored anyway. */
	meleeDamagePerTick: damagePerSecond(0.8),
	reward: 2,
	steals: 1,
	tags: ['air', 'swarm', 'self-spawning'],
}

/**
 * analytic-docs/CONTENT.md section 2, night 5: 55 HP, 0.7 tiles/sec, 10 crumbs, steals 2,
 * `ground bug`.
 *
 * Neither tag has a matrix row, so it takes every damage type at 1.0. What makes it a bruiser is
 * 5.5 Ants' worth of HP crossing the Counter in ~44 seconds -- long enough that one released with a
 * wave is still walking when the next arrives -- and it is the first enemy that costs two items when
 * it lands.
 */
export const beetle: EnemyDefOf<'beetle'> = {
	id: 'beetle',
	nameKey: 'enemy.beetle.name',
	descriptionKey: 'enemy.beetle.description',
	glyph: '🪲',
	hp: 55,
	speedTilesPerTick: tilesPerSecond(0.7),
	meleeDamagePerTick: damagePerSecond(5.5),
	reward: 10,
	steals: 2,
	tags: ['ground', 'bug'],
}

/**
 * analytic-docs/CONTENT.md section 2, night 8: 14 HP, 2.2 tiles/sec, 6 crumbs, steals 1, `air bug`.
 *
 * **`air` and not `swarm`.** The Fruit Fly above has both and the Fly has only the first, and that
 * is the whole difference in how the two take a Toaster shot: section 3's matrix gives `air` x1.2 to
 * fire, and `swarm` multiplies another x1.5 on top of it.
 *
 * The number that makes night 8 work: a Toaster shot resolves to 35 x 1.2 = 42 against `air`, which
 * one-shots a Fly, a Moth and a Fruit Fly alike. The Toaster's scarcity is its 0.3/sec rate and its
 * range-4 circle, never its damage.
 *
 * 2.2 tiles/sec is the fastest thing in v1 -- ~14 seconds to cross the Counter's `crack` against an
 * Ant's ~31 -- which is what the schema's `max(0.5)` on `speedTilesPerTick` exists to keep in ticks.
 */
export const fly: EnemyDefOf<'fly'> = {
	id: 'fly',
	nameKey: 'enemy.fly.name',
	descriptionKey: 'enemy.fly.description',
	glyph: '🪰',
	hp: 14,
	speedTilesPerTick: tilesPerSecond(2.2),
	/** Never read -- it flies, and a barricade holds nothing that is off the floor. Authored anyway. */
	meleeDamagePerTick: damagePerSecond(1.4),
	reward: 6,
	steals: 1,
	tags: ['air', 'bug'],
}

/**
 * analytic-docs/CONTENT.md section 2, night 10: 25 HP, 1.6 tiles/sec, 8 crumbs, steals 1,
 * `air light-drawn`.
 *
 * **`light-drawn` is the only tag in the roster that a system reads by name.**
 * `core/systems/light.ts` pulls one of these sideways off its lane toward a Nightlight; every other
 * tag either has a matrix row or is descriptive. Neither of these two has a row, so a Moth takes
 * every damage type at 1.0 except through `air`'s x1.2 to fire -- 35 x 1.2 = 42 from a Toaster, which
 * one-shots its 25 HP the way it one-shots a Fly.
 *
 * It is the one enemy in v1 that leaves the polyline, and it does not: `distance` advances at the
 * ordinary rate throughout, and what curves is `Enemy.lateralOffsetTiles`
 * (analytic-docs/DECISIONS.md section 3).
 */
export const moth: EnemyDefOf<'moth'> = {
	id: 'moth',
	nameKey: 'enemy.moth.name',
	descriptionKey: 'enemy.moth.description',
	glyph: '🦋',
	hp: 25,
	speedTilesPerTick: tilesPerSecond(1.6),
	/** Never read -- it flies, and a barricade holds nothing that is off the floor. Authored anyway. */
	meleeDamagePerTick: damagePerSecond(2.5),
	reward: 8,
	steals: 1,
	tags: ['air', 'light-drawn'],
}

/**
 * analytic-docs/CONTENT.md section 2, night 11: 40 HP, 12 crumbs, steals nothing,
 * `ground spreads fungal`.
 *
 * **Speed 0, not the table's 0.15.** The paragraph under that table says mold does not walk, and the
 * paragraph wins: `movementSystem` adds `0 * multiplier`, the leak check never fires, and a wake's
 * flee at `speed * 2` is 0 too. It wins by eating the map instead -- its writer molds the tile it
 * landed on, then one orthogonal neighbour every 12 seconds, permanently, and a molded tile refuses a
 * tower.
 *
 * **12 seconds, not 15A's blind 6.** Step 15C ran nights 11, 12 and 15 headless with every mold left
 * alive: at 6 seconds nights 12 and 15 molded every one of the Counter's 223 open cells and night 11
 * ~190 of them, which leaves nowhere to build the answer. At 12, a fully ignored night 11 ends at ~100
 * -- the road and a strip either side of it gone, and the rest still there to fight back from. Night 11's "damp night" (step 21) is
 * 50% faster than this, so this is the dry rate.
 *
 * `fungal` is **x0.2 physical and x2.5 chemical**: a board of Salt Shakers finds it close to
 * immovable. `ground` and `spreads` are descriptive.
 *
 * `meleeDamagePerTick` is the file's `hp / 10` and is only ever read if a Cardboard Box is placed
 * inside the hold gap in front of a mold that cannot walk to it.
 */
export const mold: EnemyDefOf<'mold'> = {
	id: 'mold',
	nameKey: 'enemy.mold.name',
	descriptionKey: 'enemy.mold.description',
	glyph: '🟢',
	hp: 40,
	speedTilesPerTick: 0,
	meleeDamagePerTick: damagePerSecond(4),
	reward: 12,
	steals: 0,
	tags: ['ground', 'spreads', 'fungal'],
	/** `magnitude` is mold's growth stage, and 1 is where every patch starts. */
	tileWriter: { effect: 'mold', mode: 'spread', magnitude: 1, durationTicks: -1, intervalTicks: 720 },
}

/**
 * analytic-docs/CONTENT.md section 2, night 15: 45 HP, 0.4 tiles/sec, 11 crumbs, steals 2,
 * `ground slime soft`.
 *
 * Slow on its own, and it paves a road: every tile it crosses carries slime for 8 seconds, and
 * anything walking on slime moves at 1.6x. **Not the Slug itself** -- a tile never applies to the
 * enemy whose def writes that kind, so the authored 0.4 is the speed it actually walks, and two Slugs
 * do not speed each other up. The trail is a gift to whatever is behind it.
 *
 * `slime` and `soft` both have matrix rows and **multiply**: chemical is 1.5 x 2.0 = 3.0, fire
 * 1.3 x 1.5 = 1.95, electric 1.8. Cold is 1.0 x 0.5 = 0.5 -- **freezing a slug is a mistake**: a
 * cold tower spent on one does half damage to the enemy that most deserves chemical.
 */
export const slug: EnemyDefOf<'slug'> = {
	id: 'slug',
	nameKey: 'enemy.slug.name',
	descriptionKey: 'enemy.slug.description',
	glyph: '🐌',
	hp: 45,
	speedTilesPerTick: tilesPerSecond(0.4),
	meleeDamagePerTick: damagePerSecond(4.5),
	reward: 11,
	steals: 2,
	tags: ['ground', 'slime', 'soft'],
	/**
	 * `magnitude` is the speed multiplier itself for slime (see core/content/tileEffects.ts), so it
	 * is 1.6 here and not the 1 a stage would be. Written every tick: a repeat write refreshes the
	 * cell's 8 seconds rather than stacking, which is what makes the trail decay from the back.
	 */
	tileWriter: { effect: 'slime', mode: 'trail', magnitude: 1.6, durationTicks: 480, intervalTicks: 1 },
}

/**
 * analytic-docs/CONTENT.md section 2, night 13: 30 HP, 1.0 tiles/sec, 9 crumbs, steals 1,
 * `ground burrows bug`.
 *
 * It goes under the floor for a stretch of its lane rolled at spawn, and while under it cannot be
 * shot, is not stopped by a box and takes nothing from the floor. A Bay Leaf's radius brings it up.
 * **`burrow` does that, not the `burrows` tag**, which is descriptive and multiplies by 1.0.
 *
 * The window starts in the first third of the lane and lasts 25-40% of it -- a blind draft that
 * step 16C re-tunes on the board.
 */
export const weevil: EnemyDefOf<'weevil'> = {
	id: 'weevil',
	nameKey: 'enemy.weevil.name',
	descriptionKey: 'enemy.weevil.description',
	glyph: '🐛',
	hp: 30,
	speedTilesPerTick: tilesPerSecond(1.0),
	meleeDamagePerTick: damagePerSecond(3),
	reward: 9,
	steals: 1,
	tags: ['ground', 'burrows', 'bug'],
	burrow: { startMaxFraction: 1 / 3, lengthMinFraction: 0.25, lengthMaxFraction: 0.4 },
}

/**
 * analytic-docs/CONTENT.md section 2, night 17: 110 HP, 0.6 tiles/sec, 18 crumbs, steals 2,
 * `ground armored bug`.
 *
 * **No field and no system line.** `armored` is x0.4 physical, x1.2 cold, and the Lemon's Armor Strip
 * moves it halfway to 1.0 inside the matrix product -- all of which the tag already does.
 */
export const silverfish: EnemyDefOf<'silverfish'> = {
	id: 'silverfish',
	nameKey: 'enemy.silverfish.name',
	descriptionKey: 'enemy.silverfish.description',
	glyph: '🐟',
	hp: 110,
	speedTilesPerTick: tilesPerSecond(0.6),
	meleeDamagePerTick: damagePerSecond(11),
	reward: 18,
	steals: 2,
	tags: ['ground', 'armored', 'bug'],
}

export const ENEMIES = [ant, roach, beetle, fruitFly, fly, moth, mold, slug, weevil, silverfish]

export type EnemyId = (typeof ENEMIES)[number]['id']
