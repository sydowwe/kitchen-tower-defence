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
 * Only `attack` has a system reading it (step 6). The rest are descriptors without an interpreter:
 * the type exists, is a member of the union, and is schema-validated, so content can be authored
 * against it before the step that owns the mechanic arrives.
 *
 * Durations are tick counts. Ranges and radii are tiles. Speeds are tiles per tick.
 */

import type { DamageType, TileEffectKind } from '@/core/types.ts'

/**
 * Which half of the roster a behaviour can reach. Ground-only, air-only and both are the only
 * three the content tables use (analytic-docs/CONTENT.md section 1, "Targets").
 */
export type TargetClass = 'ground' | 'air' | 'both'

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
}

export interface AttackParams {
	damage: number
	damageType: DamageType
	cooldownTicks: number
	rangeTiles: number
	targets: TargetClass
	projectileSpeed?: number
	splashRadiusTiles?: number
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
	}
}

// --- descriptors without an interpreter -----------------------------------------------------------
// Each names the step that will read it. Adding the system is that step's work; adding the shape
// is this one's, so a tower def written in step 2D never has to be revisited to gain a field.

/** Spray Bottle, Fan. A wedge in front of the tower rather than a circle. Step 6. */
export interface ConeAttackBehaviour {
	kind: 'coneAttack'
	damage: number
	damageType: DamageType
	cooldownTicks: number
	rangeTiles: number
	/** Half the opening angle, in degrees: the cone spans twice this either side of the facing. */
	coneHalfAngleDeg: number
	targets: TargetClass
}

export interface ConeAttackParams {
	damage: number
	damageType: DamageType
	cooldownTicks: number
	rangeTiles: number
	coneHalfAngleDeg: number
	targets: TargetClass
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
	}
}

/** Candle. Continuous damage to everything in radius, no shots and no targeting. Step 17. */
export interface AuraBehaviour {
	kind: 'aura'
	radiusTiles: number
	/** Per tick, not per second. The Candle's 4/sec is 4/60 here. */
	damagePerTick: number
	damageType: DamageType
	targets: TargetClass
}

export interface AuraParams {
	radiusTiles: number
	damagePerTick: number
	damageType: DamageType
	targets: TargetClass
}

export function aura(params: AuraParams): AuraBehaviour {
	return {
		kind: 'aura',
		radiusTiles: params.radiusTiles,
		damagePerTick: params.damagePerTick,
		damageType: params.damageType,
		targets: params.targets,
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
}

export interface IncomeParams {
	crumbsPerPayout: number
	payoutIntervalTicks: number
}

export function income(params: IncomeParams): IncomeBehaviour {
	return {
		kind: 'income',
		crumbsPerPayout: params.crumbsPerPayout,
		payoutIntervalTicks: params.payoutIntervalTicks,
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
}

export interface ChargeParams {
	charges: number
	rearmTicks: number
}

export function charge(params: ChargeParams): ChargeBehaviour {
	return {
		kind: 'charge',
		charges: params.charges,
		rearmTicks: params.rearmTicks,
	}
}

/**
 * Cardboard Box. Enemies stop at it and attack it instead of walking past.
 *
 * It has no fields: how much it can absorb is `TowerDef.maxHp`, like every other tower, and where
 * it stands is `TowerDef.placement: 'path_only'`. A second HP number here would be the one that
 * drifts. Step 10.
 */
export interface BarricadeBehaviour {
	kind: 'barricade'
}

export function barricade(): BarricadeBehaviour {
	return { kind: 'barricade' }
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
 * Bay Leaf: forces burrowed Weevils to surface inside its radius. One member today, and a union
 * rather than a boolean so step 16 can add what else gets suppressed without a schema change.
 */
export type SuppressKind = 'burrow'

/** Step 16. */
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
}

export interface PushbackParams {
	rangeTiles: number
	coneHalfAngleDeg: number
	pushTilesPerTick: number
	targets: TargetClass
}

export function pushback(params: PushbackParams): PushbackBehaviour {
	return {
		kind: 'pushback',
		rangeTiles: params.rangeTiles,
		coneHalfAngleDeg: params.coneHalfAngleDeg,
		pushTilesPerTick: params.pushTilesPerTick,
		targets: params.targets,
	}
}

/**
 * Gas Stove Burner. Writes a `TileEffect` onto the board; the tile system reads it and everything
 * standing there is affected, whatever put it there. Step 14.
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
 * Nightlight. Clears the `hidden` flag inside its radius, and pulls `light-drawn` enemies toward
 * it -- the two halves of "reveal" that the one tower does at once. Step 16.
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
] as const satisfies readonly BehaviourKind[]

/** Narrowing helper for the systems, so `combat.ts` never hand-writes `b.kind === 'attack'`. */
export function isAttack(behaviour: Behaviour): behaviour is AttackBehaviour {
	return behaviour.kind === 'attack'
}
