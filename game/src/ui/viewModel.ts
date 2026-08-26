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

import { isAttack, isCharge, isCollect, isConeAttack } from '@/core/content/behaviours.ts'
import { STATUS_DEFS } from '@/core/content/statuses.ts'
import { TOWERS, getTowerDef } from '@/core/content/index.ts'
import { earlyCallBonus } from '@/core/systems/commands.ts'
import { isRotting } from '@/core/systems/crumbs.ts'
import { refundFor, towerById } from '@/core/systems/placement.ts'
import { nightClock } from '@/core/systems/wave.ts'
import type { StatusApplication, TargetClass } from '@/core/content/behaviours.ts'
import type { TowerDef } from '@/core/content/index.ts'
import type { DamageType, DefId, EntityId, NightPhase, StatusKind, TargetingMode, World } from '@/core/types.ts'
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
 * `isCharge`, so a tower that gains a behaviour gains a card line without this file learning its name.
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

/**
 * The selected tower's live numbers, built on **selection change** rather than at 15Hz: the one
 * exception ARCHITECTURE.md section 5 carves out, because a number the player is actively watching
 * reads as laggy at a fifteenth of a second.
 *
 * Null for an id that has been sold -- normal, not an error, exactly like `towerById`.
 */
export function buildTowerInspector(world: World, towerId: EntityId): TowerInspectorView | null {
	const tower = towerById(world, towerId)
	if (tower === null) {
		return null
	}

	const def = getTowerDef(tower.defId)

	return {
		towerId: tower.id,
		defId: tower.defId,
		glyph: def.glyph,
		nameKey: def.nameKey,
		tier: tower.tier,
		stats: statsFor(def),
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
