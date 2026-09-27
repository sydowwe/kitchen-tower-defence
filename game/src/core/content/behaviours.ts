/**
 * The whole behaviour vocabulary a tower composes itself from
 * (analytic-docs/ARCHITECTURE.md section 4).
 *
 * **A behaviour is data.** `attack({ damage: 8, ... })` returns
 * `{ kind: 'attack', damage: 8, ... }` and nothing else -- no closure, no captured tower, no
 * callback. A descriptor that carried a function could not be written into a save, diffed in a
 * balance report, or asserted on in a test, and it would be the first thing to break the replay
 * guarantee. `tests/behaviours.spec.ts` fails `type-check` the moment a function-typed field
 * appears on one.
 *
 * `attack` (step 6), `coneAttack` (step 9B) and `aura` (step 12B) have systems reading them. The
 * rest are descriptors without an interpreter: the type exists, is a member of the union, and is
 * schema-validated, so content can be authored against it before the step that owns the mechanic
 * arrives.
 *
 * Durations are tick counts. Ranges and radii are tiles. Speeds are tiles per tick.
 */

import type { DamageType, StatusKind, TileEffectKind } from '@/core/types.ts'

/**
 * Which half of the roster a behaviour can reach. Ground-only, air-only and both are the only
 * three the content tables use (analytic-docs/CONTENT.md section 1, "Targets").
 */
export type TargetClass = 'ground' | 'air' | 'both'

// --- status application ---------------------------------------------------------------------------

/**
 * One status a behaviour lands on what it hits. **Every field but `kind` is an override of the
 * `STATUS_DEFS` entry, and `null` means "whatever that def says".**
 *
 * The magnitude was the first of these, because analytic-docs/CONTENT.md section 1 authors a DoT
 * rate per tower -- the Spray Bottle's 2/s against section 4's status-wide 4/s -- so that number has
 * two sources and needs the per-application copy. Step 12B's tier 3s gave the other three the same
 * problem:
 *
 * - `durationTicks` -- the Ice Cube Tray authors a 1.5-second freeze against a status def that says
 *   4 seconds, and a 4-second freeze on every fourth hit of a tower that fires every 39 ticks is a
 *   permanent freeze. So the number matters, and it has two sources too.
 * - `stacks` -- how many go on per application. The Spray Bottle's tier 3 is "twice as fast" as two
 *   stacks a hit rather than a halved cooldown, so it reaches poison's cap of 5 in three sprays.
 * - `everyNthHit` -- land this one on every Nth shot of the behaviour only. Counted by
 *   `Tower.shotsFired` and filtered in `core/systems/combat.ts`, which is the only reader.
 */
export type StatusApplication = {
	kind: StatusKind
	/** Per tick, for this behaviour only. */
	magnitude: number | null
	/** How long one application runs. Never milliseconds. */
	durationTicks: number | null
	/** How many stacks one application puts on, against the def's stack cap. */
	stacks: number | null
	/** Land it only when `Tower.shotsFired % n === 0`. Null lands it on every hit, which is most. */
	everyNthHit: number | null
}

/** What a def *authors*. A bare kind is the common case and normalises to every override null. */
export type StatusApplicationParam =
	StatusKind | { kind: StatusKind; magnitude?: number; durationTicks?: number; stacks?: number; everyNthHit?: number }

/**
 * The one normaliser, shared by all four factories that carry `applies` and by the `replaceApplies`
 * delta in `core/content/upgrades.ts`. Five copies of it would be five places for `?? null` to
 * become `?? 0`, and a magnitude of 0 -- or a `stacks` of 0 -- is a status that applies and then
 * does nothing.
 */
export function toApplications(params: readonly StatusApplicationParam[] | undefined): StatusApplication[] {
	return (params ?? []).map(entry =>
		typeof entry === 'string'
			? { kind: entry, magnitude: null, durationTicks: null, stacks: null, everyNthHit: null }
			: {
					kind: entry.kind,
					magnitude: entry.magnitude ?? null,
					durationTicks: entry.durationTicks ?? null,
					stacks: entry.stacks ?? null,
					everyNthHit: entry.everyNthHit ?? null,
				},
	)
}

// --- attack -------------------------------------------------------------------------------------

/** The one behaviour with an interpreter: `core/systems/combat.ts`, step 6. */
export interface AttackBehaviour {
	kind: 'attack'
	damage: number
	damageType: DamageType
	/** Ticks between shots. A doc rate of 1.0/sec is 60, not 1000. */
	cooldownTicks: number
	rangeTiles: number
	targets: TargetClass
	/** Tiles per tick. 0 means the hit lands the same tick, with no `Projectile` entity at all. */
	projectileSpeed: number
	/** 0 for a single-target hit. Salt Shaker's T3 upgrade is what first makes this non-zero. */
	splashRadiusTiles: number
	/**
	 * Shots spawned per firing, at **distinct** targets in the tower's own targeting-mode order --
	 * `pickTargets` in `core/systems/targeting.ts`. 1 for everything but the Toaster's tier 3.
	 *
	 * Two projectiles means two targets and not two shots at one: the Toaster one-shots every flyer
	 * in v1, so a second grain at the same Fly is a 350-crumb upgrade the player cannot tell is
	 * working. With fewer than `projectilesPerShot` enemies in range the last target repeats, so the
	 * upgrade never fires *less*.
	 *
	 * Only the projectile path reads it: an instant hit and a cone both land the tick they fire, and
	 * "two of them at once" is the same number twice.
	 */
	projectilesPerShot: number
	/** Statuses landed on what this hits. Empty for a tower that only deals damage. */
	applies: StatusApplication[]
}

export interface AttackParams {
	damage: number
	damageType: DamageType
	cooldownTicks: number
	rangeTiles: number
	targets: TargetClass
	projectileSpeed?: number
	splashRadiusTiles?: number
	projectilesPerShot?: number
	applies?: readonly StatusApplicationParam[]
}

/**
 * Every field is written out rather than spread from `params`, here and in every factory below.
 * A spread would carry a typo'd extra key straight into the descriptor and into the save.
 */
export function attack(params: AttackParams): AttackBehaviour {
	return {
		kind: 'attack',
		damage: params.damage,
		damageType: params.damageType,
		cooldownTicks: params.cooldownTicks,
		rangeTiles: params.rangeTiles,
		targets: params.targets,
		projectileSpeed: params.projectileSpeed ?? 0,
		splashRadiusTiles: params.splashRadiusTiles ?? 0,
		projectilesPerShot: params.projectilesPerShot ?? 1,
		applies: toApplications(params.applies),
	}
}

// --- cone -----------------------------------------------------------------------------------------

/**
 * Spray Bottle. A wedge in front of the tower rather than a circle: one target chosen the ordinary
 * way, and then everything in the wedge takes the hit. `core/systems/combat.ts` interprets it, step
 * 9B.
 *
 * No `projectileSpeed`: a cone lands the tick it fires.
 */
export interface ConeAttackBehaviour {
	kind: 'coneAttack'
	damage: number
	damageType: DamageType
	cooldownTicks: number
	rangeTiles: number
	/** Half the opening angle, in degrees: the cone spans twice this either side of the facing. */
	coneHalfAngleDeg: number
	targets: TargetClass
	applies: StatusApplication[]
}

export interface ConeAttackParams {
	damage: number
	damageType: DamageType
	cooldownTicks: number
	rangeTiles: number
	coneHalfAngleDeg: number
	targets: TargetClass
	applies?: readonly StatusApplicationParam[]
}

export function coneAttack(params: ConeAttackParams): ConeAttackBehaviour {
	return {
		kind: 'coneAttack',
		damage: params.damage,
		damageType: params.damageType,
		cooldownTicks: params.cooldownTicks,
		rangeTiles: params.rangeTiles,
		coneHalfAngleDeg: params.coneHalfAngleDeg,
		targets: params.targets,
		applies: toApplications(params.applies),
	}
}

// --- descriptors without an interpreter -----------------------------------------------------------
// Each names the step that will read it. Adding the system is that step's work; adding the shape
// is this one's, so a tower def written in step 2D never has to be revisited to gain a field.

/**
 * Continuous damage to everything in radius, no shots and no targeting. `core/systems/aura.ts`
 * interprets it, step 12B -- the Nightlight's tier 3 is the first one -- and step 17's Candle is a
 * config object on top of it.
 */
export interface AuraBehaviour {
	kind: 'aura'
	radiusTiles: number
	/** Per tick, not per second. The Candle's 4/sec is 4/60 here. */
	damagePerTick: number
	damageType: DamageType
	targets: TargetClass
	applies: StatusApplication[]
}

export interface AuraParams {
	radiusTiles: number
	damagePerTick: number
	damageType: DamageType
	targets: TargetClass
	applies?: readonly StatusApplicationParam[]
}

export function aura(params: AuraParams): AuraBehaviour {
	return {
		kind: 'aura',
		radiusTiles: params.radiusTiles,
		damagePerTick: params.damagePerTick,
		damageType: params.damageType,
		targets: params.targets,
		applies: toApplications(params.applies),
	}
}

/**
 * Toaster Crumb Tray, Cookie Jar, Honey Pot. A payout every N ticks rather than a per-tick rate,
 * because a fractional per-tick trickle accumulates float error over a fourteen-wave night and the
 * wallet is an integer. Step 7.
 */
export interface IncomeBehaviour {
	kind: 'income'
	crumbsPerPayout: number
	payoutIntervalTicks: number
	/**
	 * Crumbs the *enemy side* is paid when this tower is destroyed, spent on extra spawns by
	 * `core/systems/spawn.ts`. 0 for a tower that owes nothing, which is every one but the Cookie
	 * Jar.
	 *
	 * A field rather than a thirteenth behaviour kind: analytic-docs/CONTENT.md section 1 puts the
	 * 200 in the *Economy rates* table beside the 9/sec, which is what it is a property of.
	 */
	enemyCrumbsOnDestroy: number
}

export interface IncomeParams {
	crumbsPerPayout: number
	payoutIntervalTicks: number
	enemyCrumbsOnDestroy?: number
}

export function income(params: IncomeParams): IncomeBehaviour {
	return {
		kind: 'income',
		crumbsPerPayout: params.crumbsPerPayout,
		payoutIntervalTicks: params.payoutIntervalTicks,
		enemyCrumbsOnDestroy: params.enemyCrumbsOnDestroy ?? 0,
	}
}

/**
 * Auto-collection of crumb piles in radius. The travel time is the mechanic -- collection is not
 * instant, which is what leaves crumbs on the board long enough to rot. Step 7.
 */
export interface CollectBehaviour {
	kind: 'collect'
	radiusTiles: number
	/** How long one pile takes to arrive. The Night Shift Dustpan installation shortens this. */
	travelTicks: number
}

export interface CollectParams {
	radiusTiles: number
	travelTicks: number
}

export function collect(params: CollectParams): CollectBehaviour {
	return {
		kind: 'collect',
		radiusTiles: params.radiusTiles,
		travelTicks: params.travelTicks,
	}
}

/**
 * Mousetrap, Sticky Tape, Fly Paper: a finite number of uses and a rearm timer between them. The
 * live counter is `TowerState` in `core/types.ts`; this is only how many and how long. Step 10.
 */
export interface ChargeBehaviour {
	kind: 'charge'
	charges: number
	/** 0 for a tower that never rearms -- Fly Paper self-removes when spent. */
	rearmTicks: number
	/**
	 * How many of this tower's `untilSourceSpent` statuses may be running at once. 1 is the Sticky
	 * Tape holding one enemy at a time; its tier 3 is 3, which is the same roll of tape laid across
	 * three of them.
	 *
	 * It gates *firing*, not retirement: a tape with three roots out and no charges left stays on the
	 * board until the last one ends (`core/systems/charges.ts`).
	 */
	maxOutstanding: number
}

export interface ChargeParams {
	charges: number
	rearmTicks: number
	maxOutstanding?: number
}

export function charge(params: ChargeParams): ChargeBehaviour {
	return {
		kind: 'charge',
		charges: params.charges,
		rearmTicks: params.rearmTicks,
		maxOutstanding: params.maxOutstanding ?? 1,
	}
}

/**
 * Cardboard Box. Enemies stop at it and attack it instead of walking past.
 *
 * How much it can absorb is still `TowerDef.maxHp`, like every other tower, and where it stands is
 * still `TowerDef.placement: 'path_only'` -- a second HP number here would be the one that drifts.
 * The two fields it does carry are what a chewing enemy gets back, which is a property of the wall
 * and of nothing else. Step 10, and the reflect is step 12B.
 */
export interface BarricadeBehaviour {
	kind: 'barricade'
	/**
	 * Damage dealt back to whatever is chewing, per tick. **Per tick**: the Cardboard Box's tier 3 is
	 * 8/sec in analytic-docs/CONTENT.md section 1, which is 0.133 here -- the same units as
	 * `EnemyDef.meleeDamagePerTick` it is paid against, and bounded the same way so a bare `8` is
	 * rejected at boot rather than by the balance sheet.
	 *
	 * 0 for a wall that only absorbs, which is every barricade before that tier.
	 */
	reflectDamagePerTick: number
	/** What the reflect resolves as through the tag matrix. Inert while the rate above is 0. */
	reflectDamageType: DamageType
}

export interface BarricadeParams {
	reflectDamagePerTick?: number
	reflectDamageType?: DamageType
}

export function barricade(params: BarricadeParams = {}): BarricadeBehaviour {
	return {
		kind: 'barricade',
		reflectDamagePerTick: params.reflectDamagePerTick ?? 0,
		reflectDamageType: params.reflectDamageType ?? 'physical',
	}
}

/** Honey Pot. Pulls ground enemies off their pace and holds them in a kill zone. Step 17. */
export interface BaitBehaviour {
	kind: 'bait'
	radiusTiles: number
	targets: TargetClass
}

export interface BaitParams {
	radiusTiles: number
	targets: TargetClass
}

export function bait(params: BaitParams): BaitBehaviour {
	return {
		kind: 'bait',
		radiusTiles: params.radiusTiles,
		targets: params.targets,
	}
}

/**
 * Bay Leaf: forces burrowed Weevils to surface inside its radius. A union rather than a boolean so a
 * later ability can be suppressed without a schema change -- but **one member until that ability
 * exists**: a member with no reader is a Bay Leaf variant that silently does nothing.
 */
export type SuppressKind = 'burrow'

/**
 * Interpreted as a query, not a system: `suppressionZones` in `core/systems/suppress.ts` answers
 * "what suppresses this ability", and `core/systems/burrow.ts` is its only caller.
 */
export interface SuppressBehaviour {
	kind: 'suppress'
	radiusTiles: number
	suppresses: SuppressKind
}

export interface SuppressParams {
	radiusTiles: number
	suppresses: SuppressKind
}

export function suppress(params: SuppressParams): SuppressBehaviour {
	return {
		kind: 'suppress',
		radiusTiles: params.radiusTiles,
		suppresses: params.suppresses,
	}
}

/**
 * Fan. Pushes enemies back along the track they came down -- a negative delta on `distance`, never
 * free movement off the polyline. Step 18.
 */
export interface PushbackBehaviour {
	kind: 'pushback'
	rangeTiles: number
	coneHalfAngleDeg: number
	/** Tiles per tick, subtracted from the enemy's path distance while it is in the cone. */
	pushTilesPerTick: number
	targets: TargetClass
	applies: StatusApplication[]
}

export interface PushbackParams {
	rangeTiles: number
	coneHalfAngleDeg: number
	pushTilesPerTick: number
	targets: TargetClass
	applies?: readonly StatusApplicationParam[]
}

export function pushback(params: PushbackParams): PushbackBehaviour {
	return {
		kind: 'pushback',
		rangeTiles: params.rangeTiles,
		coneHalfAngleDeg: params.coneHalfAngleDeg,
		pushTilesPerTick: params.pushTilesPerTick,
		targets: params.targets,
		applies: toApplications(params.applies),
	}
}

/**
 * Gas Stove Burner. Writes a `TileEffect` onto the board; the tile system reads it and everything
 * standing there is affected, whatever put it there. The shape is step 14's; `core/systems/tileEffect.ts`
 * interprets it, step 17A.
 *
 * **`magnitude` means what `TILE_EFFECT_DEFS[effect]` says it means**, so it is unbounded in the
 * schema: heat's is damage per tick, and a bare `14` burns at 840/sec with nothing to reject it.
 */
export interface TileEffectBehaviour {
	kind: 'tileEffect'
	effect: TileEffectKind
	/** 0 writes the tower's own tile only. */
	radiusTiles: number
	magnitude: number
	/** Negative is permanent, matching `TileEffect.remainingTicks` in `core/types.ts`. */
	durationTicks: number
	/** Ticks between refreshes of the written cells. */
	refreshIntervalTicks: number
}

export interface TileEffectParams {
	effect: TileEffectKind
	radiusTiles: number
	magnitude: number
	durationTicks: number
	refreshIntervalTicks: number
}

export function tileEffect(params: TileEffectParams): TileEffectBehaviour {
	return {
		kind: 'tileEffect',
		effect: params.effect,
		radiusTiles: params.radiusTiles,
		magnitude: params.magnitude,
		durationTicks: params.durationTicks,
		refreshIntervalTicks: params.refreshIntervalTicks,
	}
}

/**
 * Nightlight. Reveals `hidden` enemies inside its radius, and pulls `light-drawn` ones toward it --
 * the two halves of "reveal" that the one tower does at once. Read by `core/systems/light.ts`,
 * step 11B.
 *
 * `attractsLightDrawn` is a **boolean and not a second radius**, which is why the moth's reach is
 * `LIGHT_ATTRACTION_TILES` in that system: five tiles is a property of the moth's eyes, and
 * `radiusTiles` below is what this lamp reveals within. Step 17's Candle gains one of these beside
 * its aura and pulls from the same five tiles without authoring a third number.
 */
export interface RevealBehaviour {
	kind: 'reveal'
	radiusTiles: number
	/** Whether Moths deviate toward this tower. False for a light that only reveals. */
	attractsLightDrawn: boolean
}

export interface RevealParams {
	radiusTiles: number
	attractsLightDrawn: boolean
}

export function reveal(params: RevealParams): RevealBehaviour {
	return {
		kind: 'reveal',
		radiusTiles: params.radiusTiles,
		attractsLightDrawn: params.attractsLightDrawn,
	}
}

/**
 * Vinegar Spray, Baking Soda: takes tile effects *off* the board. `core/systems/cleanse.ts`
 * interprets it, step 15B.
 *
 * **Its own behaviour on its own clock, not a rider on a shot.** A tower fires only when something
 * is in range, and a Vinegar Spray beside a molded board whose mold is already dead is exactly the
 * moment it was bought for. `intervalTicks` authored equal to the tower's own firing rate gives the
 * same pace with none of that dependency.
 *
 * `clears` is an array a tier cannot rewrite -- a `StatDelta` writes numbers -- so no tier can
 * change *what* a tower scrubs, only how far and how much.
 */
export interface CleanseBehaviour {
	kind: 'cleanse'
	radiusTiles: number
	clears: TileEffectKind[]
	/** Cells one pulse removes it from, nearest the fridge first. 0 is every cell in radius. */
	maxTilesPerPulse: number
	/** Ticks between pulses. Authored to match the tower's own firing rate. */
	intervalTicks: number
}

export interface CleanseParams {
	radiusTiles: number
	clears: readonly TileEffectKind[]
	maxTilesPerPulse: number
	intervalTicks: number
}

export function cleanse(params: CleanseParams): CleanseBehaviour {
	return {
		kind: 'cleanse',
		radiusTiles: params.radiusTiles,
		clears: [...params.clears],
		maxTilesPerPulse: params.maxTilesPerPulse,
		intervalTicks: params.intervalTicks,
	}
}

// --- the union -----------------------------------------------------------------------------------

/**
 * The complete vocabulary. A tower is a list of these and nothing else.
 *
 * If a Tier 0-2 tower cannot be expressed as some combination of the members below, the
 * composition is wrong and the fix is a new member here -- not a class, not a branch in a system
 * file (analytic-docs/ARCHITECTURE.md section 4).
 */
export type Behaviour =
	| AttackBehaviour
	| ConeAttackBehaviour
	| AuraBehaviour
	| IncomeBehaviour
	| CollectBehaviour
	| ChargeBehaviour
	| BarricadeBehaviour
	| BaitBehaviour
	| SuppressBehaviour
	| PushbackBehaviour
	| TileEffectBehaviour
	| RevealBehaviour
	| CleanseBehaviour

export type BehaviourKind = Behaviour['kind']

/**
 * Every kind, as data, in the order the union declares them. Exported so a test can assert the
 * union and this list agree -- a member added to one and forgotten in the other is exactly the
 * drift that leaves a behaviour silently uninterpreted.
 */
export const BEHAVIOUR_KINDS = [
	'attack',
	'coneAttack',
	'aura',
	'income',
	'collect',
	'charge',
	'barricade',
	'bait',
	'suppress',
	'pushback',
	'tileEffect',
	'reveal',
	'cleanse',
] as const satisfies readonly BehaviourKind[]

/** Narrowing helper for the systems, so `combat.ts` never hand-writes `b.kind === 'attack'`. */
export function isAttack(behaviour: Behaviour): behaviour is AttackBehaviour {
	return behaviour.kind === 'attack'
}

/** The same, for the wedge. */
export function isConeAttack(behaviour: Behaviour): behaviour is ConeAttackBehaviour {
	return behaviour.kind === 'coneAttack'
}

/**
 * Everything that picks a target, spends a cooldown and fires. Both `targeting.ts` and `combat.ts`
 * ask for one, and they have to agree about what counts: a tower the targeting system serves and the
 * combat system does not is a tower that aims and never shoots.
 */
export type FiringBehaviour = AttackBehaviour | ConeAttackBehaviour

export function isFiring(behaviour: Behaviour): behaviour is FiringBehaviour {
	return isAttack(behaviour) || isConeAttack(behaviour)
}

/**
 * The same, for collection. Three readers want it -- the crumbs system, the renderer's travel
 * fraction and step 20's installation -- and hand-writing the check in each is how the third one
 * gets it wrong.
 */
export function isCollect(behaviour: Behaviour): behaviour is CollectBehaviour {
	return behaviour.kind === 'collect'
}

/** And for income: `destroyTower` reads the destroy penalty off one, `economySystem` the payout. */
export function isIncome(behaviour: Behaviour): behaviour is IncomeBehaviour {
	return behaviour.kind === 'income'
}

/** And for charges: `placeTower` seeds `Tower.state` from one, and the rearm reads the same. */
export function isCharge(behaviour: Behaviour): behaviour is ChargeBehaviour {
	return behaviour.kind === 'charge'
}

/** And for auras: `core/systems/aura.ts` is the one reader today, and step 17 adds three more. */
export function isAura(behaviour: Behaviour): behaviour is AuraBehaviour {
	return behaviour.kind === 'aura'
}

/**
 * And for walls. Named for the descriptor rather than for the question, because
 * `core/systems/barricades.ts` already exports an `isBarricade(def)` that answers "is this def a
 * wall" -- this is the one that hands back the reflect fields.
 */
export function isBarricadeBehaviour(behaviour: Behaviour): behaviour is BarricadeBehaviour {
	return behaviour.kind === 'barricade'
}

/**
 * And for lights. Two readers in `core/systems/light.ts` -- revelation and attraction -- and a third
 * in 11C's `reachOf`, which is one more than hand-writing `b.kind === 'reveal'` survives.
 */
export function isReveal(behaviour: Behaviour): behaviour is RevealBehaviour {
	return behaviour.kind === 'reveal'
}

/** And for suppression: `core/systems/suppress.ts`, and step 16B's card and `reachOf`. */
export function isSuppress(behaviour: Behaviour): behaviour is SuppressBehaviour {
	return behaviour.kind === 'suppress'
}

/** And for scrubbing: `core/systems/cleanse.ts`, the card in `ui/viewModel.ts`, and `reachOf`. */
export function isCleanse(behaviour: Behaviour): behaviour is CleanseBehaviour {
	return behaviour.kind === 'cleanse'
}

/** And for writing cells: `core/systems/tileEffect.ts`, and `projectedNoisePerSecond` in `noise.ts`. */
export function isTileEffect(behaviour: Behaviour): behaviour is TileEffectBehaviour {
	return behaviour.kind === 'tileEffect'
}
