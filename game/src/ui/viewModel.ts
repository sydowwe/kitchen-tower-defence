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

import {
	isAttack,
	isAura,
	isBait,
	isCharge,
	isCleanse,
	isCollect,
	isConeAttack,
	isPushback,
	isReveal,
	isSuppress,
	isTileEffect,
} from '@/core/content/behaviours.ts'
import { effectivenessOf, resolveDamage } from '@/core/content/matrix.ts'
import { STATUS_DEFS } from '@/core/content/statuses.ts'
import { TILE_EFFECT_DEFS } from '@/core/content/tileEffects.ts'
import {
	NIGHTS,
	TOWERS,
	effectiveDef,
	effectiveDefOf,
	getEnemyDef,
	getTowerDef,
	unlockNightOf,
} from '@/core/content/index.ts'
import { upgradeCost } from '@/core/content/upgrades.ts'
import { earlyCallBonus } from '@/core/systems/commands.ts'
import { isRotting } from '@/core/systems/crumbs.ts'
import { isGone, isOnShelf } from '@/core/systems/fridge.ts'
import { projectedNoisePerSecond } from '@/core/systems/noise.ts'
import { refundFor, towerById } from '@/core/systems/placement.ts'
import { enemyById, enemyPosition } from '@/core/systems/spatial.ts'
import { nightClock } from '@/core/systems/wave.ts'
import type { StatusApplication, TargetClass } from '@/core/content/behaviours.ts'
import type { TowerDef } from '@/core/content/index.ts'
import type { Effectiveness } from '@/core/content/matrix.ts'
import type {
	DamageType,
	DefId,
	EntityId,
	GameEvent,
	GroceryMoneyBreakdown,
	NightPhase,
	StatusKind,
	TargetingMode,
	Tower,
	World,
} from '@/core/types.ts'
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
export type { Effectiveness } from '@/core/content/matrix.ts'
export type {
	DamageType,
	DefId,
	EntityId,
	GroceryMoneyBreakdown,
	NightPhase,
	StatusKind,
	TargetingMode,
} from '@/core/types.ts'
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
	/**
	 * **Per second of continuous fire, not the per-shot value.** `noise: 2` on a Mousetrap and
	 * `noise: 3` on a Toaster read as almost the same tower; 0.3/sec against 0.9/sec read as what they
	 * are, and the 1.5/sec the meter decays at is the number both are being compared against
	 * (step 13B, decision 6).
	 *
	 * Always a number, never null -- every tower has one and silence is genuinely 0. A tower that never
	 * fires is 0 whatever its `noise` says, which is why this is `projectedNoisePerSecond` and not
	 * arithmetic on `def.noise` here.
	 */
	noise: number
	/** Economy towers only. Null for everything that does not pay out. */
	crumbsPerSecond: number | null
	/** Economy towers only. The radius piles are drawn in from. */
	collectRadiusTiles: number | null
	/** Half the opening, in degrees, for a tower that sprays a wedge. Null for a circle. */
	coneHalfAngleDeg: number | null
	/**
	 * Tiles a hit shoves an enemy back down the track, **before its resistance** -- the def's number, the
	 * way every other row is. Null for everything without a `pushback`.
	 */
	pushTiles: number | null
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
	 * Every tower has one, and since step 13A every tower can lose it: a wake takes 20% of `maxHp`
	 * off everything standing. The row was a barricade's alone while nothing else in the game could
	 * be damaged (step 10C, decision 9).
	 */
	hitPoints: number
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
	/** How far a scrubber cleans the board, in tiles. Null for everything that has no `cleanse`. */
	cleanseRadiusTiles: number | null
	/**
	 * Patches cleaned per second, for a scrubber that takes a fixed number a pulse -- the Vinegar
	 * Spray's "one a second". **Null too for one that clears its whole circle each pulse**: the Baking
	 * Soda's count is however many cells happen to be slimed, and a rate row reading "0.6/sec" would be
	 * the card inventing a limit the tower does not have. Its firing rate row already says how often.
	 */
	cleansePerSecond: number | null
	/**
	 * How far a suppressor holds burrowers on the surface, in tiles. Null for everything without a
	 * `suppress`. The Bay Leaf's only row, the way `revealRadiusTiles` is the Nightlight's.
	 */
	suppressRadiusTiles: number | null
	/**
	 * How far a heat-writing tower's flame reaches beyond its own tile. Null for everything that writes
	 * no damaging tile. **0 is a real value** -- the Gas Stove Burner burns the tile it stands on -- and
	 * the card prints it as a word, the way noise 0 is "silent": "0 tiles" reads as a tower that burns
	 * nothing (step 17C, decision 3).
	 */
	heatRadiusTiles: number | null
	/** How far off a lane a pot catches that lane, in tiles. Null for everything that is not bait. */
	lureRadiusTiles: number | null
	/** How long one feed holds an enemy, already in seconds. Null for everything that is not bait. */
	holdSeconds: number | null
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
	 * The key that arms it -- `'1'`..`'9'`, then `'0'` -- or null. Off `hotkeyTowers`, the same list the
	 * keydown handler indexes, so the badge cannot name a key that arms a different tower. A loadout is
	 * at most eight, so null only on a night with no loadout at all.
	 */
	hotkey: string | null
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

/** One damage type against the hovered enemy, as it stands this publish. */
export interface EnemyDamageView {
	damageType: DamageType
	/** `resolveDamage(1, ...)`: every tag, armor strip and `Marked` included. Two decimals. */
	multiplier: number
	/** Off the unrounded multiplier, through the same `effectivenessOf` the damage numbers use. */
	band: Effectiveness
}

/**
 * The hovered enemy: what it is, how hurt it is, and what each damage type does to it right now.
 *
 * Positioned in **tiles**, with the board's size beside it, so the component places itself as a
 * percentage of the HUD layer. That layer is the board's exact size, so percentages line up at any
 * window size where pixels would be off by the CSS scale.
 */
export interface EnemyTooltipView {
	enemyId: EntityId
	glyph: string
	nameKey: string
	/** Both `Math.ceil`ed. `hp` is fractional by design, and a floor shows a living enemy at `0 / 41`. */
	hp: number
	maxHp: number
	/** Every tag, `hud.tag.<tag>`, in the def's order. A new array, never `enemy.tags`. */
	tagKeys: string[]
	/** All five, in `hud.damage` order. */
	damage: EnemyDamageView[]
	/** Nothing can reach it while this is true. The tooltip says so rather than going away. */
	burrowed: boolean
	/**
	 * Stopped at a Honey Pot. A boolean off `enemy.feeding !== null`, never the feeding record itself:
	 * that holds a tower id and a release tick, and neither belongs in the snapshot.
	 */
	feeding: boolean
	/**
	 * Where a thief is in its errand, off `enemy.theft.phase`; null for everything that is not a thief.
	 * The tooltip says what it is doing in words, because it is the one enemy whose job changes on the
	 * way -- and whose way home is the player's last chance.
	 */
	thiefPhase: 'approaching' | 'grabbing' | 'fleeing' | null
	/** Waypoint space: integers on tile centres, the space `enemyPosition` returns. */
	at: { x: number; y: number }
	widthTiles: number
	heightTiles: number
}

export interface NightSummaryView {
	won: boolean
	/** `waveIndex + 1` on a win; `waveIndex` on a loss -- you did not survive the one that emptied the fridge. */
	wavesSurvived: number
	waveCount: number
	/**
	 * What a thief got out of the kitchen with (`lostTo === 'escaped'`). Its own line, above the rest:
	 * this is the sequence the Mouse exists for, and folding it into "Lost" would lose that it was
	 * carried off rather than eaten (step 19C, decision 8).
	 */
	foodEscapedNameKeys: string[]
	/** Everything else gone: eaten at the fridge, or left on the floor when the night was won. */
	foodLostNameKeys: string[]
	foodRemaining: number
	enemiesKilled: number
	crumbsCollected: number
	crumbsDropped: number
	/**
	 * `night.pay`, copied field by field, or null while it is. **Never recomputed here**: a second
	 * formula is a total that disagrees with the balance the Kitchen shows (step 20E, decision 1).
	 */
	grocery: GroceryMoneyBreakdown | null
	/** `noise.peakLevel` against `noise.cap`, unrounded; the summary rounds it where it prints it. */
	peakNoise: { level: number; cap: number }
	wakeCount: number
	/** The Emergency Snack Stash fired tonight. The summary is the only place the player learns it did. */
	snackStashUsed: boolean
}

/**
 * What a wake cost, in the words the card reads it out in.
 *
 * **Deliberately not part of `HudSnapshot`.** The snapshot is rebuilt from the world at 15Hz and a
 * wake is a one-tick event carrying totals the world no longer has: by the time anyone reads it the
 * crumbs are off the board and the towers are out of `world.towers`. Putting it in the snapshot would
 * mean either parking it on the world or losing it between two publishes, so `GameView.vue` holds it
 * in a `shallowRef` and hands it to the HUD as a prop -- the way `ToastStack.vue` is already fed
 * (step 13B, decision 1).
 */
export interface WakeView {
	/**
	 * Bumped per wake. The card keys on it, so a second wake in one night **replaces** the first and
	 * replays its fade rather than stacking a second card under it.
	 */
	id: number
	/**
	 * The two forfeits as one number: the wave's unbanked income plus the value swept off the floor.
	 * They are different things to the simulation and the same sentence to the player, and a card
	 * itemising them stops being a sentence.
	 */
	crumbs: number
	/** One entry per *kind* of tower lost, in the order they were destroyed. */
	towers: { nameKey: string; count: number }[]
}

/**
 * The `humanWoke` event, resolved into keys `ui/` can translate.
 *
 * Here rather than in the component because `ui/components/hud/` imports nothing from `core/` -- a
 * `defId` becomes a `nameKey` at this seam, exactly as `ShopEntry` and `TowerInspectorView` do it.
 *
 * Duplicates are folded to a count rather than listed twice: a wake takes 20% of max HP off every
 * tower standing, so it destroys only what was already nearly dead and two of a kind is rare. When it
 * does happen, "a Salt Shaker and a Salt Shaker" is not a sentence anyone wrote on purpose.
 */
export function buildWakeView(id: number, event: Extract<GameEvent, { kind: 'humanWoke' }>): WakeView {
	const towers: { nameKey: string; count: number }[] = []

	for (const defId of event.towersDestroyed) {
		const nameKey = getTowerDef(defId).nameKey
		const seen = towers.find(entry => entry.nameKey === nameKey)
		if (seen === undefined) {
			towers.push({ nameKey, count: 1 })
		} else {
			seen.count++
		}
	}

	return { id, crumbs: event.crumbsForfeited + event.crumbsOnBoardForfeited, towers }
}

/**
 * The top bar's "what just went" line: one loss, by name.
 *
 * **From the event, not from the shelf.** The shelf cannot say which loss is the latest -- the highest
 * lost index was true while only walkers took, from the front, and stopped being true the first time a
 * Mouse got out with the front of the shelf after Ants had eaten further along it. So `GameView.vue`
 * builds one of these off `enemyLeaked` and `thiefEscaped` in its tick loop and passes it in, the way
 * `loudShots` is passed in.
 *
 * `id` is a running count of losses, and the line is keyed on it: two cheeses lost in a row are two
 * keys, where keying on the name would never replay the second.
 */
export interface LossView {
	id: number
	/** Every item this one loss took, in take order. */
	nameKeys: string[]
	/** The thief that got out with them, or null for something that ate at the fridge. */
	thiefNameKey: string | null
}

/**
 * One loss event resolved into keys. Null for a leak that took nothing -- an enemy arriving at an empty
 * shelf, or a thief escaping empty-handed after a wake -- which is no news.
 */
export function buildLossView(
	id: number,
	world: World,
	event: Extract<GameEvent, { kind: 'enemyLeaked' | 'thiefEscaped' }>,
): LossView | null {
	const ids = event.kind === 'enemyLeaked' ? event.stolenItems : event.items
	const nameKeys: string[] = []
	for (const foodId of ids) {
		const item = world.night.food.find(candidate => candidate.id === foodId)
		if (item !== undefined) {
			nameKeys.push(item.nameKey)
		}
	}
	if (nameKeys.length === 0) {
		return null
	}

	return {
		id,
		nameKeys,
		thiefNameKey: event.kind === 'thiefEscaped' ? getEnemyDef(event.defId).nameKey : null,
	}
}

/**
 * The first thief def in wave `waveIndex` of this night, or null.
 *
 * `NIGHTS.find` rather than `getNightDef`, which throws: the spec fixtures run on a synthetic night id,
 * and the snapshot is built for those worlds too. One walk of the night list and one of the wave's
 * entries -- never a walk of every night's every wave, which is what this runs at 15Hz for.
 */
function thiefInWave(nightId: DefId, waveIndex: number): { nameKey: string } | null {
	const wave = NIGHTS.find(night => night.id === nightId)?.waves[waveIndex]
	if (wave === undefined) {
		return null
	}
	for (const entry of wave.entries) {
		const def = getEnemyDef(entry.enemyDefId)
		if (def.thief !== undefined) {
			return { nameKey: def.nameKey }
		}
	}
	return null
}

/**
 * The next wave carries a thief. Derived off the night's def every publish, never stored: the wave to
 * look at is 0 while building and `waveIndex + 1` once a wave has run, which covers the wave before
 * and its countdown. Null during the thief's own wave, and once the night is over.
 */
function upcomingThief(world: World): { nameKey: string } | null {
	const night = world.night
	if (night.phase === 'won' || night.phase === 'lost') {
		return null
	}
	return thiefInWave(night.nightId, night.phase === 'building' ? 0 : night.waveIndex + 1)
}

/**
 * The Mouse's announcement, when the wave carrying it starts. A one-shot card in `WakeCard.vue`'s idiom,
 * built by `GameView.vue` off `waveStarted` and handed to the HUD as a prop -- the snapshot is rebuilt
 * at 15Hz and would have to remember that it had already said it. Step 23 owns the general wave-start
 * banner; this is the thief's alone.
 */
export interface ThiefBannerView {
	/** The wave it announces. The card keys on it, so a retry of the same wave says it again. */
	waveIndex: number
	nameKey: string
}

export function buildThiefBanner(world: World, waveIndex: number): ThiefBannerView | null {
	const thief = thiefInWave(world.night.nightId, waveIndex)
	return thief === null ? null : { waveIndex, nameKey: thief.nameKey }
}

export interface HudSnapshot {
	/** `{ hour, minute }` from `nightClock`. Formatted in `ui/`, never here and never on the world. */
	clock: { hour: number; minute: number }
	/** `index` is 0-based, the way the world holds it. The HUD shows `index + 1`. */
	wave: { index: number; count: number }
	phase: NightPhase
	crumbs: number
	/**
	 * The slice of `crumbs` a wake would take. Published beside the wallet rather than derived from
	 * it, because nothing in `ui/` can see the split otherwise (step 13A, decision 5).
	 */
	unbankedCrumbs: number
	/**
	 * Piles **and** value, because neither substitutes for the other: forty specks and one fat pile
	 * are the same count and nothing like the same wallet.
	 */
	crumbsOnBoard: { piles: number; value: number; rotting: number }
	/**
	 * `remaining` is what is **on the shelf**, so the meter drops the moment a Mouse takes something
	 * rather than when it gets out with it. `atRisk` is what is off the shelf and not yet gone -- carried,
	 * or on the floor -- and is the part a kill or a click can still bring back.
	 */
	food: { remaining: number; total: number; atRisk: number; lostNameKeys: string[]; lastLost: LossView | null }
	/** The next wave has a thief in it. See `upcomingThief`. */
	upcomingThief: { nameKey: string } | null
	/**
	 * `wakeCount` is what the no-wake bonus reads at 0.
	 *
	 * `loudShots` is a **running count**, not a boolean and not a tick number: `TopBar.vue` keys a
	 * ripple element on it, and a changed key is what replays the CSS animation. A boolean flips back
	 * and forth and plays the ripple on the way down too; a tick number changes every publish and the
	 * ripple never stops (step 13B, decision 5).
	 *
	 * Several loud shots can land between two publishes, so one ripple plays for the batch. That is
	 * deliberate -- at 3x speed with six Toasters, one ripple per shot is a strobe.
	 */
	noise: { level: number; cap: number; wakeCount: number; loudShots: number }
	countdownTicks: number
	earlyCallBonus: number
	speed: Speed
	paused: boolean
	shop: ShopEntry[]
	inspector: TowerInspectorView | null
	/** The enemy under the pointer. Passed in like `inspector`; see `buildEnemyTooltip`. */
	enemyTooltip: EnemyTooltipView | null
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
 * Derives a card from the def's behaviours through `isAttack` / `isConeAttack` / `isAura` /
 * `isPushback` / `isTileEffect` / `isBait` / `isCollect` / `isCharge` / `isReveal`, so a tower that gains a behaviour
 * gains a card line without this file learning its name.
 *
 * **The def's numbers, never the live ones.** `buildTowerInspector` runs on selection change rather
 * than at 15Hz, so a live rearm countdown here would sit frozen at whatever it read when the tower
 * was clicked. What the charge machine is doing right now is drawn on the board, by
 * `render/layers/towers.ts` (step 10C, decision 7).
 *
 * Exported for the loadout screen's roster, which shows the shop's card before the night exists.
 */
export function statsFor(def: TowerDef): TowerStatsView {
	const stats: TowerStatsView = {
		damage: null,
		ratePerSecond: null,
		dps: null,
		rangeTiles: null,
		damageType: null,
		targets: null,
		noise: round2(projectedNoisePerSecond(def)),
		crumbsPerSecond: null,
		collectRadiusTiles: null,
		coneHalfAngleDeg: null,
		pushTiles: null,
		applies: [],
		hitPoints: def.maxHp,
		charges: null,
		rearmSeconds: null,
		blocksPath: false,
		revealRadiusTiles: null,
		cleanseRadiusTiles: null,
		cleansePerSecond: null,
		suppressRadiusTiles: null,
		heatRadiusTiles: null,
		lureRadiusTiles: null,
		holdSeconds: null,
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
			// Appended, not assigned: an aura earlier in the list may already have landed its own.
			stats.applies = [...stats.applies, ...appliesOf(behaviour.applies)]
			// The one line the wedge has and the circle does not. Everything above is the same card.
			stats.coneHalfAngleDeg = isConeAttack(behaviour) ? behaviour.coneHalfAngleDeg : null
			continue
		}

		if (isAura(behaviour)) {
			// No `damage` or `ratePerSecond`: an aura has no hit to count, only a rate. And `??=`, so a
			// shot on the same tower keeps the rows -- the shot is the number the player aims with. A
			// 0-damage aura (the Bay Leaf's and the Honey Pot's tier 3) is its statuses and nothing else;
			// "Type: physical" on a leaf would be the card inventing a hit (step 17C, decision 1).
			if (behaviour.damagePerTick > 0) {
				stats.dps ??= round2(behaviour.damagePerTick * TICKS_PER_SECOND)
				stats.rangeTiles ??= behaviour.radiusTiles
				stats.damageType ??= behaviour.damageType
				stats.targets ??= behaviour.targets
			}
			stats.applies = [...stats.applies, ...appliesOf(behaviour.applies)]
			continue
		}

		if (isPushback(behaviour)) {
			// The rider's own statuses appended to the cone's, so the Fan's tier-3 Marked shows.
			stats.pushTiles = behaviour.pushTiles
			stats.applies = [...stats.applies, ...appliesOf(behaviour.applies)]
			continue
		}

		if (isTileEffect(behaviour)) {
			const tile = TILE_EFFECT_DEFS[behaviour.effect]
			if (tile.effect === 'damageOverTime') {
				stats.dps ??= round2(behaviour.magnitude * TICKS_PER_SECOND)
				stats.damageType ??= tile.damageType
				// Heat is read through the floor check, so nothing flying ever takes it.
				stats.targets ??= 'ground'
				stats.heatRadiusTiles = behaviour.radiusTiles
			}
			continue
		}

		if (isBait(behaviour)) {
			stats.lureRadiusTiles = behaviour.radiusTiles
			stats.holdSeconds = round2(behaviour.durationTicks / TICKS_PER_SECOND)
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

		if (isCleanse(behaviour)) {
			stats.cleanseRadiusTiles = behaviour.radiusTiles
			stats.cleansePerSecond =
				behaviour.maxTilesPerPulse === 0
					? null
					: round2((behaviour.maxTilesPerPulse * TICKS_PER_SECOND) / behaviour.intervalTicks)
			continue
		}

		if (isSuppress(behaviour)) {
			stats.suppressRadiusTiles = behaviour.radiusTiles
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
			stats.blocksPath = true
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

/**
 * The roster in the order it arrives: by `unlockNightOf`, ties by `TOWERS` position, and a tower no
 * night unlocks at the end. **The one order** -- `buildShop`, the number keys and the badges all follow
 * it, because three orders is how a badge reads 4 on the tower key 5 arms (step 20E, decision 5).
 *
 * Unlock order and not `TOWERS` order so that tonight's new tower lands *after* everything the player
 * already has, and a key learned on night 3 still arms the same tower on night 9.
 *
 * Not memoised: nineteen entries, and the specs push synthetic towers and nights onto both lists.
 */
export function shopOrder(): TowerDef[] {
	const night = new Map(TOWERS.map(def => [def.id, unlockNightOf(def.id) ?? Infinity]))
	const position = new Map(TOWERS.map((def, index) => [def.id, index]))
	return [...TOWERS].sort(
		(a, b) =>
			(night.get(a.id) ?? Infinity) - (night.get(b.id) ?? Infinity) ||
			(position.get(a.id) ?? 0) - (position.get(b.id) ?? 0),
	)
}

/** `NightState.loadout`'s own reading: null is every tower. */
export function inLoadout(loadout: readonly DefId[] | null, id: DefId): boolean {
	return loadout === null || loadout.includes(id)
}

/** Keys `1`..`9` and then `0`: ten, and the tenth badge reads `0` because that is the key. */
const HOTKEY_COUNT = 10

/** The towers the number keys arm, in key order: the first ten of `shopOrder` that tonight brought. */
export function hotkeyTowers(loadout: readonly DefId[] | null): TowerDef[] {
	return shopOrder()
		.filter(def => inLoadout(loadout, def.id))
		.slice(0, HOTKEY_COUNT)
}

/** The key for position `index` of `hotkeyTowers`: `'1'`..`'9'`, then `'0'` for the tenth. */
function hotkeyLabel(index: number): string {
	return String((index + 1) % HOTKEY_COUNT)
}

/**
 * What was set out on the counter, and nothing else: a tower left upstairs is not greyed out, it is
 * not there. **In `shopOrder`, not the loadout's selection order**, so the badges and the keydown read
 * the one list (step 20aB, decision 7).
 */
function buildShop(world: World): ShopEntry[] {
	const loadout = world.night.loadout
	const keyed = hotkeyTowers(loadout)

	return shopOrder()
		.filter(def => inLoadout(loadout, def.id))
		.map(def => {
			const keyIndex = keyed.indexOf(def)
			return {
				id: def.id,
				glyph: def.glyph,
				nameKey: def.nameKey,
				descriptionKey: def.descriptionKey,
				cost: def.cost,
				affordable: world.crumbs >= def.cost,
				hotkey: keyIndex === -1 ? null : hotkeyLabel(keyIndex),
				stats: statsFor(def),
			}
		})
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
 * Every item is exactly one of on the shelf, at risk, or gone, so the three always add up to `total`.
 * `lastLost` is the caller's; see `LossView` on why the shelf cannot answer it.
 */
function foodView(world: World, lastLost: LossView | null): HudSnapshot['food'] {
	const food = world.night.food
	const lostNameKeys: string[] = []
	let remaining = 0
	let atRisk = 0

	for (const item of food) {
		if (isGone(item)) {
			lostNameKeys.push(item.nameKey)
		} else if (isOnShelf(item)) {
			remaining++
		} else {
			atRisk++
		}
	}

	return { remaining, total: food.length, atRisk, lostNameKeys, lastLost }
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
	{ labelKey: 'hud.stat.pushes', read: s => measured('hud.stat.tiles', s.pushTiles) },
	// A word at 0, like noise: the Burner burns the tile it stands on, and "0 tiles" reads as nothing.
	{
		labelKey: 'hud.stat.burns',
		read: s => (s.heatRadiusTiles === 0 ? word('hud.stat.ownTile') : measured('hud.stat.tiles', s.heatRadiusTiles)),
	},
	{ labelKey: 'hud.stat.damageType', read: s => word(s.damageType === null ? null : `hud.damage.${s.damageType}`) },
	{ labelKey: 'hud.stat.hitPoints', read: s => plain(s.hitPoints) },
	{ labelKey: 'hud.stat.charges', read: s => plain(s.charges) },
	{ labelKey: 'hud.stat.rearm', read: s => measured('hud.stat.seconds', s.rearmSeconds) },
	{ labelKey: 'hud.stat.income', read: s => measured('hud.stat.perSecond', s.crumbsPerSecond) },
	{ labelKey: 'hud.stat.lures', read: s => measured('hud.stat.tiles', s.lureRadiusTiles) },
	{ labelKey: 'hud.stat.holds', read: s => measured('hud.stat.seconds', s.holdSeconds) },
	{ labelKey: 'hud.stat.collect', read: s => measured('hud.stat.tiles', s.collectRadiusTiles) },
	{ labelKey: 'hud.stat.lights', read: s => measured('hud.stat.tiles', s.revealRadiusTiles) },
	{ labelKey: 'hud.stat.cleans', read: s => measured('hud.stat.tiles', s.cleanseRadiusTiles) },
	{ labelKey: 'hud.stat.cleanRate', read: s => measured('hud.stat.perSecond', s.cleansePerSecond) },
	{ labelKey: 'hud.stat.bringsUp', read: s => measured('hud.stat.tiles', s.suppressRadiusTiles) },
	// The one row the card always draws, and the one that reads as a word at zero. Per second since
	// 13B, so a tier that halves a cooldown shows up here as the tower getting louder -- which is
	// exactly what the Mousetrap's third tier does, and what no other row on the card would say.
	{
		labelKey: 'hud.stat.noise',
		read: s => (s.noise === 0 ? word('hud.stat.silent') : measured('hud.stat.perSecond', s.noise)),
	},
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

/** The order `hud.damage` lists them in, which is the order the tooltip's rows read. */
const DAMAGE_TYPES: readonly DamageType[] = ['physical', 'fire', 'cold', 'chemical', 'electric']

/**
 * The hovered enemy, rebuilt on **every** publish because its HP and statuses move. Built by the
 * caller and passed into `buildHudSnapshot`, the way the inspector is: the hovered id lives on
 * `ui/selection.ts`, which this file does not import.
 *
 * Null for an id that is gone, like `towerById` -- and for one on a path the map does not have, which
 * has no position to anchor to.
 */
export function buildEnemyTooltip(world: World, enemyId: EntityId): EnemyTooltipView | null {
	const enemy = enemyById(world, enemyId)
	const at = enemy === null ? null : enemyPosition(world, enemy)
	if (enemy === null || at === null) {
		return null
	}

	const def = getEnemyDef(enemy.defId)

	return {
		enemyId: enemy.id,
		glyph: def.glyph,
		nameKey: def.nameKey,
		hp: Math.ceil(enemy.hp),
		maxHp: Math.ceil(enemy.maxHp),
		tagKeys: enemy.tags.map(tag => `hud.tag.${tag}`),
		damage: DAMAGE_TYPES.map(damageType => {
			const multiplier = resolveDamage(1, damageType, enemy)
			return { damageType, multiplier: round2(multiplier), band: effectivenessOf(multiplier) }
		}),
		burrowed: enemy.flags.burrowed,
		feeding: enemy.feeding !== null,
		thiefPhase: enemy.theft?.phase ?? null,
		at: { x: at.x, y: at.y },
		widthTiles: world.map.widthTiles,
		heightTiles: world.map.heightTiles,
	}
}

/** Field by field, so a nested field added to the breakdown later is a type error here, not a live reference. */
function copyPay(pay: GroceryMoneyBreakdown): GroceryMoneyBreakdown {
	return {
		base: pay.base,
		foodSaved: pay.foodSaved,
		kills: pay.kills,
		cleanliness: pay.cleanliness,
		noWake: pay.noWake,
		earlyCall: pay.earlyCall,
		subtotal: pay.subtotal,
		difficultyMult: pay.difficultyMult,
		lossMult: pay.lossMult,
		total: pay.total,
		itemsRemaining: pay.itemsRemaining,
		enemiesKilled: pay.enemiesKilled,
		cleanlinessRatio: pay.cleanlinessRatio,
		secondsSkipped: pay.secondsSkipped,
		woke: pay.woke,
	}
}

/**
 * The night-end screen. Read whatever the phase, and shown only in `'won'` and `'lost'`.
 *
 * Touches no content: the spec fixture's night is `'test'`, which is no night, and it is `'won'` with
 * `pay: null` -- so every snapshot built from it builds a summary.
 */
export function buildNightSummary(world: World): NightSummaryView {
	const night = world.night
	const won = night.phase === 'won'

	return {
		won,
		wavesSurvived: won ? night.waveIndex + 1 : night.waveIndex,
		waveCount: night.waveCount,
		foodEscapedNameKeys: night.food.filter(item => item.lostTo === 'escaped').map(item => item.nameKey),
		foodLostNameKeys: night.food
			.filter(item => isGone(item) && item.lostTo !== 'escaped')
			.map(item => item.nameKey),
		foodRemaining: night.food.filter(item => !isGone(item)).length,
		enemiesKilled: night.enemiesKilled,
		crumbsCollected: night.crumbsCollected,
		crumbsDropped: night.crumbsDropped,
		grocery: night.pay === null ? null : copyPay(night.pay),
		peakNoise: { level: world.noise.peakLevel, cap: world.noise.cap },
		wakeCount: world.noise.wakeCount,
		snackStashUsed: night.snackStashUsed,
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
 * silently downgrade the exception ARCHITECTURE.md section 5 grants it. `enemyTooltip` is passed in
 * for a plainer reason: the hovered id is UI state this file cannot see.
 */
export function buildHudSnapshot(
	world: World,
	view: { speed: Speed; paused: boolean; loudShots?: number; lastLost?: LossView | null },
	inspector: TowerInspectorView | null = null,
	enemyTooltip: EnemyTooltipView | null = null,
): HudSnapshot {
	const night = world.night
	const over = night.phase === 'won' || night.phase === 'lost'

	return {
		clock: nightClock(night.waveIndex, night.waveCount),
		wave: { index: night.waveIndex, count: night.waveCount },
		phase: night.phase,
		crumbs: world.crumbs,
		unbankedCrumbs: world.unbankedCrumbs,
		crumbsOnBoard: crumbsOnBoard(world),
		// Passed in like `loudShots`, and for the same reason: it is read off events, not the world.
		food: foodView(world, view.lastLost ?? null),
		upcomingThief: upcomingThief(world),
		noise: {
			level: world.noise.level,
			cap: world.noise.cap,
			wakeCount: world.noise.wakeCount,
			// Counted by the caller and passed in, like `inspector`: `towerFired` lives on
			// `world.events` for one tick, and this is rebuilt from the world at 15Hz.
			loudShots: view.loudShots ?? 0,
		},
		countdownTicks: night.countdownTicks,
		earlyCallBonus: earlyCallBonus(world),
		speed: view.speed,
		paused: view.paused,
		shop: buildShop(world),
		inspector,
		enemyTooltip,
		summary: over ? buildNightSummary(world) : null,
	}
}
