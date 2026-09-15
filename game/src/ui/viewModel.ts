/**
 * Everything the HUD is allowed to know, as one plain object built by hand.
 *
 * This file is the whole of analytic-docs/ARCHITECTURE.md section 5 in code: the renderer reads the
 * world raw at 60Hz, and the UI reads *this* -- a few dozen primitives, published into a
 * `shallowRef` at ~15Hz and replaced wholesale. So two rules hold everywhere below:
 *
 * - **nothing here imports `vue`.** `GameView.vue` owns the ref. A builder that owned it would be a
 *   second place holding UI state, and it would stop being callable from a node-environment spec.
 * - **nothing here holds a reference into the world.** Not `world.night.food`, not a filtered array
 *   of it, not a `Crumb`. Every field is a copied primitive, and `tests/viewModel.spec.ts` mutates a
 *   world after building a snapshot to prove it. A live array in the snapshot is how world state
 *   ends up behind a Vue proxy without anyone ever writing `ref(world)`.
 *
 * And one rule from CLAUDE.md, "Strings": the view model carries **keys, never English**. `core/`
 * cannot translate, `ui/` resolves, and a snapshot is exactly where that gets broken first.
 */

import { isAttack, isCharge, isCollect, isConeAttack, isReveal } from '@/core/content/behaviours.ts'
import { STATUS_DEFS } from '@/core/content/statuses.ts'
import { TOWERS, effectiveDef, effectiveDefOf, getTowerDef } from '@/core/content/index.ts'
import { upgradeCost } from '@/core/content/upgrades.ts'
import { earlyCallBonus } from '@/core/systems/commands.ts'
import { isRotting } from '@/core/systems/crumbs.ts'
import { refundFor, towerById } from '@/core/systems/placement.ts'
import { nightClock } from '@/core/systems/wave.ts'
import type { StatusApplication, TargetClass } from '@/core/content/behaviours.ts'
import type { TowerDef } from '@/core/content/index.ts'
import type { DamageType, DefId, EntityId, NightPhase, StatusKind, TargetingMode, Tower, World } from '@/core/types.ts'
import type { Speed } from '@/loop.ts'

/**
 * The vocabulary the HUD's emit contract is written in, re-exported so a component never names
 * `core/` itself.
 *
 * A `hud/` component that imported `@/core/types.ts` for `TargetingMode` would be one refactor away
 * from importing a system for "just one helper", and the import graph is the only thing that catches
 * it. This file already depends on `core/`; it is the seam. Type-only, and erased at build.
 */
export type { TargetClass } from '@/core/content/behaviours.ts'
export type { DamageType, DefId, EntityId, NightPhase, StatusKind, TargetingMode } from '@/core/types.ts'
export type { Speed } from '@/loop.ts'

/** `core/` durations are tick counts; a card shows rates per second. The one conversion factor. */
const TICKS_PER_SECOND = 60

/**
 * Two decimals, on every derived number.
 *
 * `perSecond()` in `core/content/towers.ts` rounds a rate on the way in, so 1/60 comes back out
 * exactly and 0.15/sec (400 ticks) does not. Without this the card eventually prints
 * `0.15000000000000002` and it reads as a simulation bug.
 */
function round2(value: number): number {
	return Math.round(value * 100) / 100
}

/**
 * The hover card and the inspector's live numbers.
 *
 * A tower with no attack gets **nulls, not zeroes**: `0 damage` and `no attack` are different things
 * on a card, and a Cookie Jar showing "0 dps" reads as broken rather than as an economy tower.
 * `noise` is always a number -- every tower has one, and silence is genuinely 0.
 */
export interface TowerStatsView {
	damage: number | null
	ratePerSecond: number | null
	dps: number | null
	rangeTiles: number | null
	damageType: DamageType | null
	targets: TargetClass | null
	noise: number
	/** Economy towers only. Null for everything that does not pay out. */
	crumbsPerSecond: number | null
	/** Economy towers only. The radius piles are drawn in from. */
	collectRadiusTiles: number | null
	/** Half the opening, in degrees, for a tower that sprays a wedge. Null for a circle. */
	coneHalfAngleDeg: number | null
	/**
	 * What this tower lands on what it hits, **already resolved and already converted**: the
	 * application's own magnitude where it has one, the status table's otherwise, times 60.
	 *
	 * `perSecond` is null for the statuses that deal no damage -- a slow has a magnitude too, and it is
	 * a fraction of speed rather than a rate. A component doing that arithmetic would be a component
	 * that has to know what a magnitude means per kind (step 9C, decision 6). Empty, never null, for a
	 * tower that applies nothing.
	 */
	applies: { kind: StatusKind; perSecond: number | null }[]
	/**
	 * Null unless this tower can actually be destroyed -- in v1, unless it is a barricade.
	 *
	 * Every tower has a `maxHp`, and a HP row on the seven nothing in the game can damage is a row
	 * that means nothing. Step 13's noise penalty is what turns it on for the rest (step 10C,
	 * decision 9).
	 */
	hitPoints: number | null
	/** Magazine size, for a tower with a charge behaviour. Null for the rest. */
	charges: number | null
	/**
	 * Seconds between one charge coming back and the next, already converted. Null both for a tower
	 * with no magazine and for one that never rearms -- the Sticky Tape is spent when it is spent, and
	 * "rearms in 0s" is worse than no row.
	 */
	rearmSeconds: number | null
	/** True for a tower enemies stop at instead of walking past. */
	blocksPath: boolean
	/**
	 * How far a lamp lights, in tiles. Null for everything that is not one.
	 *
	 * The only row the Nightlight has, which is the reason it exists: a 100-crumb tower whose card
	 * would otherwise read `Noise: silent` and nothing else. There is deliberately **no**
	 * `attractsLightDrawn` row beside it -- it is true for every light in v1, so it would be a row that
	 * never varies, and what it *means* is a sentence rather than a value (step 11C, decision 8).
	 */
	revealRadiusTiles: number | null
}

/**
 * One number as the card prints it: the key that formats it, and what it formats.
 *
 * **Not a formatted string.** "3 tiles" in this file would be English in the view model, which
 * CLAUDE.md's *Strings* rule and this file's own header both forbid -- the catalogue owns the words
 * and `ui/` resolves them. What this file owns is the *choice* of key, which is the part that needs
 * to know a range is tiles and a cooldown is a rate. A component holding that knowledge is a
 * component that has to be edited every time a behaviour gains a field (step 12C, decision 1).
 *
 * `hud.stat.plain` is the pass-through key, `'{n}'`, so a bare number and a word are the same shape
 * and the renderer is one `t()` call with no branch.
 */
export interface StatValueView {
	textKey: string
	params: Record<string, number>
}

/**
 * One line of an upgrade's before -> after.
 *
 * Null on either side means the tower does not have that stat at that tier -- a genuinely added row,
 * not a zero, exactly as `TowerStatsView` treats a missing stat.
 */
export interface UpgradeDiffRow {
	labelKey: string
	from: StatValueView | null
	to: StatValueView | null
}

/**
 * One of the three tiers, whether or not it can be bought yet.
 *
 * All three are built for every tower on every rebuild, which is what lets the panel show tier 3's
 * sentence while the player is still standing on tier 0 -- that sentence is the reason to save 250%
 * of a tower's cost, and a slot that appeared only once it was affordable would hide it (step 12C,
 * decision 2).
 */
export interface UpgradeSlotView {
	/** 1, 2 or 3. `Tower.tier` is 0-based and this is the tier the slot *buys*. */
	tier: number
	cost: number
	/**
	 * `world.crumbs >= cost`, with `>=` and not `>`, for `ShopEntry.affordable`'s reason: a 30-crumb
	 * upgrade with exactly 30 crumbs is buyable, and a panel that dims it is lying about the one
	 * purchase the player has been saving for.
	 */
	affordable: boolean
	state: 'owned' | 'next' | 'locked'
	nameKey: string
	/** Tier 3 only. Tiers 1 and 2 have the diff, and a sentence reading "more damage" is noise. */
	descriptionKey: string | null
	diff: UpgradeDiffRow[]
}

export interface ShopEntry {
	id: DefId
	glyph: string
	nameKey: string
	descriptionKey: string
	cost: number
	/**
	 * `world.crumbs >= cost`, with `>=` and not `>`. `canPlaceTower` rejects only on `crumbs < cost`,
	 * so a 50-crumb tower with exactly 50 crumbs is buildable -- and a shop that dims it is a shop
	 * lying about the one purchase the player has been waiting for.
	 */
	affordable: boolean
	/**
	 * True for all three towers today. The field exists so step 20's unlock progression is a data
	 * change and not a component change -- it is not dead, it is early.
	 */
	unlocked: boolean
	stats: TowerStatsView
}

export interface TowerInspectorView {
	towerId: EntityId
	defId: DefId
	glyph: string
	nameKey: string
	tier: number
	stats: TowerStatsView
	/** Always three, in tier order, whatever tier the tower is standing on. */
	upgrades: UpgradeSlotView[]
	targetingMode: TargetingMode
	/** From `refundFor`, never a second 0.7: the number under the button is what the sale pays. */
	refund: number
	/** `phase === 'wave'`, which is when the rate drops to 50%. */
	refundIsPenalised: boolean
}

export interface NightSummaryView {
	won: boolean
	/** `waveIndex + 1` on a win; `waveIndex` on a loss -- you did not survive the one that emptied the fridge. */
	wavesSurvived: number
	waveCount: number
	foodLostNameKeys: string[]
	foodRemaining: number
	enemiesKilled: number
	crumbsCollected: number
	crumbsDropped: number
}

export interface HudSnapshot {
	/** `{ hour, minute }` from `nightClock`. Formatted in `ui/`, never here and never on the world. */
	clock: { hour: number; minute: number }
	/** `index` is 0-based, the way the world holds it. The HUD shows `index + 1`. */
	wave: { index: number; count: number }
	phase: NightPhase
	crumbs: number
	groceryMoney: number
	/**
	 * Piles **and** value, because neither substitutes for the other: forty specks and one fat pile
	 * are the same count and nothing like the same wallet.
	 */
	crumbsOnBoard: { piles: number; value: number; rotting: number }
	food: { remaining: number; total: number; lostNameKeys: string[]; lastLostNameKey: string | null }
	noise: { level: number; cap: number }
	countdownTicks: number
	earlyCallBonus: number
	speed: Speed
	paused: boolean
	shop: ShopEntry[]
	inspector: TowerInspectorView | null
	/** Non-null only in `'won'` and `'lost'`. */
	summary: NightSummaryView | null
}

/**
 * The statuses a firing behaviour lands, as the card reads them.
 *
 * Resolved the way the simulation resolves them -- the application's `magnitude` if it has one, the
 * status table's otherwise -- so the Spray Bottle's per-application 2/s override shows as 2/sec
 * without `en.ts` carrying a second copy of the number.
 */
function appliesOf(applications: readonly StatusApplication[]): TowerStatsView['applies'] {
	return applications.map(application => {
		const def = STATUS_DEFS[application.kind]
		const magnitude = application.magnitude ?? def.magnitude
		return {
			kind: application.kind,
			perSecond: def.effect === 'damageOverTime' ? round2(magnitude * TICKS_PER_SECOND) : null,
		}
	})
}

/**
 * Derives a card from the def's behaviours through `isAttack` / `isConeAttack` / `isCollect` /
 * `isCharge` / `isReveal`, so a tower that gains a behaviour gains a card line without this file
 * learning its name.
 *
 * **The def's numbers, never the live ones.** `buildTowerInspector` runs on selection change rather
 * than at 15Hz, so a live rearm countdown here would sit frozen at whatever it read when the tower
 * was clicked. What the charge machine is doing right now is drawn on the board, by
 * `render/layers/towers.ts` (step 10C, decision 7).
 */
function statsFor(def: TowerDef): TowerStatsView {
	const stats: TowerStatsView = {
		damage: null,
		ratePerSecond: null,
		dps: null,
		rangeTiles: null,
		damageType: null,
		targets: null,
		noise: def.noise,
		crumbsPerSecond: null,
		collectRadiusTiles: null,
		coneHalfAngleDeg: null,
		applies: [],
		hitPoints: null,
		charges: null,
		rearmSeconds: null,
		blocksPath: false,
		revealRadiusTiles: null,
	}

	for (const behaviour of def.behaviours) {
		if (isAttack(behaviour) || isConeAttack(behaviour)) {
			const ratePerSecond = round2(TICKS_PER_SECOND / behaviour.cooldownTicks)
			stats.damage = behaviour.damage
			stats.ratePerSecond = ratePerSecond
			stats.dps = round2(behaviour.damage * ratePerSecond)
			stats.rangeTiles = behaviour.rangeTiles
			stats.damageType = behaviour.damageType
			stats.targets = behaviour.targets
			stats.applies = appliesOf(behaviour.applies)
			// The one line the wedge has and the circle does not. Everything above is the same card.
			stats.coneHalfAngleDeg = isConeAttack(behaviour) ? behaviour.coneHalfAngleDeg : null
			continue
		}

		if (isCollect(behaviour)) {
			stats.collectRadiusTiles = behaviour.radiusTiles
			continue
		}

		if (isReveal(behaviour)) {
			// `targets` is deliberately left null. CONTENT.md section 1 says "both", and that column is
			// describing what a lamp *covers*; every other line on this card comes off a firing behaviour
			// and the Nightlight has none, so a "Targets: ground and air" row would be the card claiming
			// it shoots (step 11C, decision 9).
			stats.revealRadiusTiles = behaviour.radiusTiles
			continue
		}

		if (isCharge(behaviour)) {
			stats.charges = behaviour.charges
			// Converted here, where every other derived number on this card is rounded. A component
			// doing arithmetic on tick counts is a component that has to know what a tick is.
			stats.rearmSeconds = behaviour.rearmTicks > 0 ? round2(behaviour.rearmTicks / TICKS_PER_SECOND) : null
			continue
		}

		if (behaviour.kind === 'barricade') {
			// The only place `maxHp` reaches a card. See the field's note: it is on every def and it
			// means something on exactly this one.
			stats.blocksPath = true
			stats.hitPoints = def.maxHp
			continue
		}

		if (behaviour.kind === 'income') {
			stats.crumbsPerSecond = round2(
				(behaviour.crumbsPerPayout * TICKS_PER_SECOND) / behaviour.payoutIntervalTicks,
			)
		}
	}

	return stats
}

/** `TOWERS` in array order -- the same order the number keys bind to. No sorting, no grouping. */
function buildShop(world: World): ShopEntry[] {
	return TOWERS.map(def => ({
		id: def.id,
		glyph: def.glyph,
		nameKey: def.nameKey,
		descriptionKey: def.descriptionKey,
		cost: def.cost,
		affordable: world.crumbs >= def.cost,
		unlocked: true,
		stats: statsFor(def),
	}))
}

/** One walk of `world.crumbPiles` for all three numbers. */
function crumbsOnBoard(world: World): { piles: number; value: number; rotting: number } {
	let value = 0
	let rotting = 0

	for (const crumb of world.crumbPiles) {
		value += crumb.value
		if (isRotting(crumb)) {
			rotting++
		}
	}

	return { piles: world.crumbPiles.length, value, rotting }
}

/**
 * `total` is `food.length` and never a count of survivors: the shelf is never spliced, so the number
 * the fridge started the night with is still there to divide by.
 *
 * `lastLostNameKey` is the **highest lost index**, not the last element. Theft takes from the front,
 * so the most recently lost item is the last one in stocked order that is marked lost.
 */
function foodView(world: World): HudSnapshot['food'] {
	const food = world.night.food
	const lostNameKeys: string[] = []
	let remaining = 0

	for (const item of food) {
		if (item.lost) {
			lostNameKeys.push(item.nameKey)
		} else {
			remaining++
		}
	}

	return {
		remaining,
		total: food.length,
		lostNameKeys,
		lastLostNameKey: lostNameKeys[lostNameKeys.length - 1] ?? null,
	}
}

/** A number the card prints bare, the way `StatCard.vue` prints damage and hit points. */
function plain(value: number | null): StatValueView | null {
	return value === null ? null : { textKey: 'hud.stat.plain', params: { n: value } }
}

/** A number with a unit on it: `'{n} tiles'`, `'{n}/sec'`, `'{n}s'`, `'±{n}°'`. */
function measured(textKey: string, value: number | null): StatValueView | null {
	return value === null ? null : { textKey, params: { n: value } }
}

/** A row whose value is a word out of the catalogue -- a damage type, a target class. */
function word(textKey: string | null): StatValueView | null {
	return textKey === null ? null : { textKey, params: {} }
}

/**
 * Every row of `TowerStatsView` a tier can move, paired with the label `StatCard.vue` gives it, in
 * the order that card lists them.
 *
 * **One table, read by both sides of the diff**, which is the whole of decision 1: the alternative is
 * a second list of which stats exist, and it drifts from the card the first time a behaviour gains a
 * row. `applies` and `blocksPath` are deliberately absent -- see `diffStats`.
 */
const DIFF_ROWS: readonly { labelKey: string; read: (stats: TowerStatsView) => StatValueView | null }[] = [
	{ labelKey: 'hud.stat.targets', read: s => word(s.targets === null ? null : `hud.targetClass.${s.targets}`) },
	{ labelKey: 'hud.stat.damage', read: s => plain(s.damage) },
	{ labelKey: 'hud.stat.rate', read: s => measured('hud.stat.perSecond', s.ratePerSecond) },
	{ labelKey: 'hud.stat.dps', read: s => plain(s.dps) },
	{ labelKey: 'hud.stat.range', read: s => measured('hud.stat.tiles', s.rangeTiles) },
	{ labelKey: 'hud.stat.cone', read: s => measured('hud.stat.degrees', s.coneHalfAngleDeg) },
	{ labelKey: 'hud.stat.damageType', read: s => word(s.damageType === null ? null : `hud.damage.${s.damageType}`) },
	{ labelKey: 'hud.stat.hitPoints', read: s => plain(s.hitPoints) },
	{ labelKey: 'hud.stat.charges', read: s => plain(s.charges) },
	{ labelKey: 'hud.stat.rearm', read: s => measured('hud.stat.seconds', s.rearmSeconds) },
	{ labelKey: 'hud.stat.income', read: s => measured('hud.stat.perSecond', s.crumbsPerSecond) },
	{ labelKey: 'hud.stat.collect', read: s => measured('hud.stat.tiles', s.collectRadiusTiles) },
	{ labelKey: 'hud.stat.lights', read: s => measured('hud.stat.tiles', s.revealRadiusTiles) },
	// The one row the card always draws, and the one that reads as a word at zero.
	{ labelKey: 'hud.stat.noise', read: s => (s.noise === 0 ? word('hud.stat.silent') : plain(s.noise)) },
]

function sameValue(before: StatValueView | null, after: StatValueView | null): boolean {
	if (before === null || after === null) {
		return before === after
	}
	if (before.textKey !== after.textKey) {
		return false
	}

	const names = Object.keys(before.params)
	return names.length === Object.keys(after.params).length && names.every(n => before.params[n] === after.params[n])
}

/**
 * The rows that **changed**, and only those.
 *
 * A diff that emitted every row is the failure mode worth the test: it is not visibly wrong, it is
 * just eleven lines of unchanged numbers with the one that moved buried in them.
 *
 * `applies` and `blocksPath` have no row here. `applies` is a list, so a row for it would need a
 * multi-valued `StatValueView` for the one tier in the roster that rewrites one -- and that tier is
 * the Ice Cube Tray's third, whose own sentence says it better than "Slow -> Freeze, Slow" would.
 * `blocksPath` is a yes-or-no about the tower that no tier moves.
 */
function diffStats(before: TowerStatsView, after: TowerStatsView): UpgradeDiffRow[] {
	const rows: UpgradeDiffRow[] = []

	for (const row of DIFF_ROWS) {
		const from = row.read(before)
		const to = row.read(after)
		if (!sameValue(from, to)) {
			rows.push({ labelKey: row.labelKey, from, to })
		}
	}

	return rows
}

/**
 * All three tiers, every time, whatever the tower is standing on.
 *
 * Six `statsFor` calls over `effectiveDef`'s memo, which is a `Map` lookup after the first tower of
 * a type is inspected. Cheap enough to do from `publish()`, which is where `GameView.vue` rebuilds
 * the inspector from -- but it has to stay a pure read: an allocation the fold does not already make
 * would be one per tier per publish, forever.
 *
 * Priced with `upgradeCost`, the same function `upgradeCostFor` calls, and never a 60/120/250 of its
 * own: a panel with its own copy of the curve is a button promising 30 while the wallet loses 31.
 */
function buildUpgradeSlots(world: World, tower: Tower): UpgradeSlotView[] {
	const base = getTowerDef(tower.defId)

	return base.upgrades.map((upgrade, index) => {
		const tier = index + 1
		const cost = upgradeCost(base, tier)

		return {
			tier,
			cost,
			affordable: world.crumbs >= cost,
			state: tier <= tower.tier ? 'owned' : tier === tower.tier + 1 ? 'next' : 'locked',
			nameKey: upgrade.nameKey,
			descriptionKey: upgrade.descriptionKey,
			diff: diffStats(statsFor(effectiveDef(tower.defId, tier - 1)), statsFor(effectiveDef(tower.defId, tier))),
		}
	})
}

/**
 * The selected tower's live numbers.
 *
 * Built on **selection change** as well as on every publish, which is the exception
 * ARCHITECTURE.md section 5 carves out: a number the player is actively watching reads as laggy when
 * it only moves at a fifteenth of a second, and the click has to feel instant. `GameView.vue` owns
 * both calls.
 *
 * Null for an id that has been sold -- normal, not an error, exactly like `towerById`.
 */
export function buildTowerInspector(world: World, towerId: EntityId): TowerInspectorView | null {
	const tower = towerById(world, towerId)
	if (tower === null) {
		return null
	}

	const def = effectiveDefOf(tower)

	return {
		towerId: tower.id,
		defId: tower.defId,
		glyph: def.glyph,
		nameKey: def.nameKey,
		tier: tower.tier,
		stats: statsFor(def),
		upgrades: buildUpgradeSlots(world, tower),
		targetingMode: tower.targetingMode,
		refund: refundFor(world, tower),
		refundIsPenalised: world.night.phase === 'wave',
	}
}

/** The night-end screen. Read whatever the phase, and shown only in `'won'` and `'lost'`. */
export function buildNightSummary(world: World): NightSummaryView {
	const night = world.night
	const won = night.phase === 'won'

	return {
		won,
		wavesSurvived: won ? night.waveIndex + 1 : night.waveIndex,
		waveCount: night.waveCount,
		foodLostNameKeys: night.food.filter(item => item.lost).map(item => item.nameKey),
		foodRemaining: night.food.filter(item => !item.lost).length,
		enemiesKilled: night.enemiesKilled,
		crumbsCollected: night.crumbsCollected,
		crumbsDropped: night.crumbsDropped,
	}
}

/**
 * The ~15Hz snapshot. Everything the HUD chrome shows and nothing else -- `fps`, `tickCount`,
 * `simSeconds` and `entityCount` stay on `GameView.vue`'s own dev snapshot, which feeds
 * `DebugOverlay.vue`. Two objects out of one `publish()` is cheaper than one shipping type carrying
 * dev counters.
 *
 * `inspector` is passed **in** rather than derived: it is built on selection change (see
 * `buildTowerInspector`) and the caller holds the one it built, so republishing at 15Hz does not
 * silently downgrade the exception ARCHITECTURE.md section 5 grants it.
 */
export function buildHudSnapshot(
	world: World,
	view: { speed: Speed; paused: boolean },
	inspector: TowerInspectorView | null = null,
): HudSnapshot {
	const night = world.night
	const over = night.phase === 'won' || night.phase === 'lost'

	return {
		clock: nightClock(night.waveIndex, night.waveCount),
		wave: { index: night.waveIndex, count: night.waveCount },
		phase: night.phase,
		crumbs: world.crumbs,
		groceryMoney: world.groceryMoney,
		crumbsOnBoard: crumbsOnBoard(world),
		food: foodView(world),
		noise: { level: world.noise.level, cap: world.noise.cap },
		countdownTicks: night.countdownTicks,
		earlyCallBonus: earlyCallBonus(world),
		speed: view.speed,
		paused: view.paused,
		shop: buildShop(world),
		inspector,
		summary: over ? buildNightSummary(world) : null,
	}
}
