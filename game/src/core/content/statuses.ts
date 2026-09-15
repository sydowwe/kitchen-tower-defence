/**
 * The seven status effects of analytic-docs/CONTENT.md section 4: their defs, their stacking rules
 * and the pure reads over them.
 *
 * **Every rule is data on the def.** How a second application merges, what refuses to apply while
 * something else is running, and how `magnitude` is read are all fields on `StatusDef`, not branches
 * in `applyStatus`. An eighth status is a config entry below; at worst it is also one new member of
 * `StackRule` and one entry in `STACK_RULES`, and `applyStatus` still does not change.
 *
 * This file owns the bookkeeping only. Burn does not deal its damage here -- `damageOverTime` is a
 * label `core/systems/status.ts` filters on, and that system is what routes the per-tick number
 * through the matrix.
 */

import type { StatusApplication } from '@/core/content/behaviours.ts'
import type { ActiveStatus, DamageType, EntityId, StatusKind } from '@/core/types.ts'

/** `core/` has no clock, so the conversion from the doc's seconds lives here as a plain factor. */
const TICKS_PER_SECOND = 60

function seconds(count: number): number {
	return count * TICKS_PER_SECOND
}

/** `Rooted` lasts "until the source is spent", which is not a duration. Never decremented. */
const UNTIL_SOURCE_SPENT = -1

// --- stacking rules -------------------------------------------------------------------------------

/**
 * How a second application of the same kind merges into the one already running.
 *
 * `stackTo` is what the doc's "Yes, max 3" means: stacks accumulate to the cap and the duration is
 * refreshed either way, so a fourth burn re-lights an enemy that is already at 3 stacks without
 * adding a fourth.
 */
export type StackRule = { kind: 'refresh' } | { kind: 'stackTo'; max: number }

export type StackRuleKind = StackRule['kind']

type RuleOf<K extends StackRuleKind> = Extract<StackRule, { kind: K }>

type MergeFn<K extends StackRuleKind> = (existing: ActiveStatus, incoming: ActiveStatus, rule: RuleOf<K>) => void

/**
 * One entry per rule. Both entries refresh the duration -- an effect re-applied by a still-firing
 * tower must not expire on the first application's clock.
 *
 * **Last application wins** for `magnitude`, `sourceId` and `damageType`, and all three move
 * together. A `Math.max` on the magnitude would leave a sold tower's stronger number running on an
 * enemy with nothing on the board to explain it, and a `damageType` left behind would have a fire
 * tower's burn still resolving as the electric one that first lit it.
 */
const STACK_RULES: { [K in StackRuleKind]: MergeFn<K> } = {
	refresh(existing, incoming) {
		existing.remainingTicks = Math.max(existing.remainingTicks, incoming.remainingTicks)
		existing.magnitude = incoming.magnitude
		existing.sourceId = incoming.sourceId
		existing.damageType = incoming.damageType
	},
	stackTo(existing, incoming, rule) {
		existing.stacks = Math.min(existing.stacks + incoming.stacks, rule.max)
		existing.remainingTicks = Math.max(existing.remainingTicks, incoming.remainingTicks)
		existing.magnitude = incoming.magnitude
		existing.sourceId = incoming.sourceId
		existing.damageType = incoming.damageType
	},
}

function applyStackRule(existing: ActiveStatus, incoming: ActiveStatus, rule: StackRule): void {
	// The table is keyed by rule kind, so this lookup is exhaustive by construction. TypeScript
	// cannot correlate the key with the parameter type across a union index, hence the one
	// assertion -- keeping it here is what keeps `applyStatus` free of a per-rule branch.
	const merge = STACK_RULES[rule.kind] as MergeFn<StackRuleKind>
	merge(existing, incoming, rule)
}

// --- the defs -------------------------------------------------------------------------------------

/**
 * What `ActiveStatus.magnitude` means for this kind. Declared rather than inferred from the kind, so
 * the reads below filter on a field instead of listing kinds they have to be kept in sync with.
 *
 * - `speed` -- the fraction of speed removed. Freeze and Rooted are 1.0, so they stop the enemy.
 * - `damageTaken` -- the fraction added to incoming damage, per stack.
 * - `armorStrip` -- how far the `armored` tag multiplier moves toward 1.0. Read by `matrix.ts`.
 * - `damageOverTime` -- damage per tick, per stack. Delivered by the combat system in step 9.
 */
export type StatusEffect = 'speed' | 'damageTaken' | 'armorStrip' | 'damageOverTime'

export interface StatusDef {
	kind: StatusKind
	/** `UNTIL_SOURCE_SPENT` for Rooted; a tick count for everything else. Never milliseconds. */
	durationTicks: number
	/** Default for `ActiveStatus.magnitude`. An upgraded tower may apply a stronger one. */
	magnitude: number
	effect: StatusEffect
	/**
	 * What a `damageOverTime` tick resolves as when the source had no damage type of its own. Null
	 * for the five that deal no damage. An application carries the applying behaviour's type instead
	 * whenever it has one -- this is only the floor under it.
	 */
	damageType: DamageType | null
	stack: StackRule
	/**
	 * Kinds that refuse this one while they are active. Freeze suppresses Slow *re-application*
	 * (analytic-docs/CONTENT.md section 4) -- the rule is about what `applyStatus` turns away, not
	 * about what `speedMultiplier` returns, and a Slow already running keeps ticking down.
	 */
	suppressedBy: readonly StatusKind[]
}

/** analytic-docs/CONTENT.md section 4, transcribed. Per-tick rates are the doc's per-second over 60. */
export const STATUS_DEFS: Readonly<Record<StatusKind, StatusDef>> = {
	slow: {
		kind: 'slow',
		durationTicks: seconds(2),
		magnitude: 0.4,
		effect: 'speed',
		damageType: null,
		stack: { kind: 'refresh' },
		suppressedBy: ['freeze'],
	},
	freeze: {
		kind: 'freeze',
		durationTicks: seconds(4),
		magnitude: 1,
		effect: 'speed',
		damageType: null,
		stack: { kind: 'refresh' },
		suppressedBy: [],
	},
	burn: {
		kind: 'burn',
		durationTicks: seconds(3),
		magnitude: 5 / TICKS_PER_SECOND,
		effect: 'damageOverTime',
		damageType: 'fire',
		stack: { kind: 'stackTo', max: 3 },
		suppressedBy: [],
	},
	poison: {
		kind: 'poison',
		durationTicks: seconds(5),
		magnitude: 4 / TICKS_PER_SECOND,
		effect: 'damageOverTime',
		damageType: 'chemical',
		stack: { kind: 'stackTo', max: 5 },
		suppressedBy: [],
	},
	armorStrip: {
		kind: 'armorStrip',
		durationTicks: seconds(4),
		/** Halfway to 1.0: the `armored` physical 0.4 becomes 0.7. */
		magnitude: 0.5,
		effect: 'armorStrip',
		damageType: null,
		stack: { kind: 'refresh' },
		suppressedBy: [],
	},
	marked: {
		kind: 'marked',
		durationTicks: seconds(3),
		magnitude: 0.25,
		effect: 'damageTaken',
		damageType: null,
		stack: { kind: 'refresh' },
		suppressedBy: [],
	},
	rooted: {
		kind: 'rooted',
		durationTicks: UNTIL_SOURCE_SPENT,
		magnitude: 1,
		effect: 'speed',
		damageType: null,
		stack: { kind: 'refresh' },
		suppressedBy: [],
	},
}

// --- application and bookkeeping --------------------------------------------------------------------

/** Enough of an `Enemy` to carry statuses. A structural subset, so nothing builds a world to test. */
export interface StatusHolder {
	statuses: ActiveStatus[]
}

/**
 * What one application may say about itself beyond its kind. Every field falls back to the def, and
 * the three that are not the source are exactly `StatusApplication`'s overrides.
 */
export interface StatusOverrides {
	sourceId?: EntityId | null
	damageType?: DamageType | null
	/** Per tick. */
	magnitude?: number | null
	/** Ticks, never milliseconds. */
	durationTicks?: number | null
	/** How many stacks this one application puts on, against the def's cap. */
	stacks?: number | null
}

/**
 * One application of `kind`, at its default strength, duration and stack count unless told
 * otherwise.
 *
 * **An options object and no longer three positionals.** Step 12B's tier 3s made it five, and
 * `createStatus('freeze', 7, 'cold', null, 90)` is a line nobody can read -- two nulls holding the
 * place of the fields it does *not* override. Each override falls back to the def, which is what
 * gets them to `speedMultiplier`, `damageTakenMultiplier` and `armorStripStrength` for free: all
 * three read the live field and none of them knows an override exists.
 *
 * `sourceId` stays inside the object rather than beside `kind`, so there is one shape to read and
 * `createStatus('rooted', { sourceId: 7 })` says which 7 it is.
 */
export function createStatus(kind: StatusKind, overrides: StatusOverrides = {}): ActiveStatus {
	const def = STATUS_DEFS[kind]
	return {
		kind: def.kind,
		remainingTicks: overrides.durationTicks ?? def.durationTicks,
		stacks: overrides.stacks ?? 1,
		magnitude: overrides.magnitude ?? def.magnitude,
		sourceId: overrides.sourceId ?? null,
		damageType: overrides.damageType ?? null,
	}
}

/**
 * The one seam every source lands statuses through: an instant hit, a projectile on arrival, and
 * 9B's cone all call this. It needs no world, so it lives with the vocabulary rather than in a
 * system -- and two call sites each assembling their own `createStatus` is exactly how the damage
 * type ends up set on one path and null on the other.
 *
 * **`sourceId` is nullable because a tile has none.** A chemical residue applies poison and there is
 * nothing to attribute it to; `ActiveStatus.sourceId` has always allowed null, and a null one simply
 * never matches the charge bookkeeping's `status.sourceId === towerId`.
 */
export function applyStatuses(
	target: StatusHolder,
	applications: readonly StatusApplication[],
	sourceId: EntityId | null,
	damageType: DamageType | null,
): void {
	for (const application of applications) {
		applyStatus(
			target,
			createStatus(application.kind, {
				sourceId,
				damageType,
				magnitude: application.magnitude,
				durationTicks: application.durationTicks,
				stacks: application.stacks,
			}),
		)
	}
}

/**
 * Whether this status ends when whatever applied it is spent, rather than on a timer. True for
 * Rooted and nothing else today. Read by the charge bookkeeping, which is what "spent" means -- so
 * that scan filters on a property of the def instead of naming a kind.
 */
export function endsWithItsSource(status: ActiveStatus): boolean {
	return STATUS_DEFS[status.kind].durationTicks === UNTIL_SOURCE_SPENT
}

export function findStatus(target: StatusHolder, kind: StatusKind): ActiveStatus | undefined {
	return target.statuses.find(status => status.kind === kind)
}

export function hasStatus(target: StatusHolder, kind: StatusKind): boolean {
	return findStatus(target, kind) !== undefined
}

/**
 * Applies `status` to `target`, merging into any application of the same kind under that kind's
 * stacking rule. Returns whether it landed -- false means a suppressing status turned it away.
 *
 * The status is copied in rather than stored by reference: a source that fires every tick would
 * otherwise be handing out aliases of one object to every enemy it hits.
 */
export function applyStatus(target: StatusHolder, status: ActiveStatus): boolean {
	const def = STATUS_DEFS[status.kind]
	if (def.suppressedBy.some(kind => hasStatus(target, kind))) {
		return false
	}

	const existing = findStatus(target, status.kind)
	if (existing === undefined) {
		target.statuses.push({ ...status })
		return true
	}

	applyStackRule(existing, status, def.stack)
	return true
}

/**
 * Ages every status by one tick and drops the ones that run out.
 *
 * Runs at the *end* of a tick's status processing, after anything per-tick has been read off: a
 * status with 1 tick left is present for this tick, delivers this tick, and is gone from the next
 * one. Decrementing first and dropping at 0 is what stops an effect applied and expiring in the same
 * tick from delivering a phantom extra tick.
 */
export function tickStatuses(target: StatusHolder): void {
	for (let i = target.statuses.length - 1; i >= 0; i--) {
		const status = target.statuses[i]
		if (status === undefined || status.remainingTicks < 0) {
			continue
		}
		status.remainingTicks--
		if (status.remainingTicks <= 0) {
			target.statuses.splice(i, 1)
		}
	}
}

// --- the pure reads ---------------------------------------------------------------------------------
// Recomputed from `statuses` on every call. There is deliberately no cached `currentSpeed` field on
// the enemy for a system to forget to refresh.

/**
 * What to multiply the enemy's base speed by. Exactly `1` when nothing is running -- the strongest
 * effect wins rather than several multiplying, so this is a `min` and never accumulates float error.
 *
 * Freeze overriding Slow falls out of that: Freeze removes 100% of speed, so it is already the
 * minimum whatever Slow is doing.
 */
export function speedMultiplier(target: StatusHolder): number {
	let multiplier = 1
	for (const status of target.statuses) {
		if (STATUS_DEFS[status.kind].effect !== 'speed') {
			continue
		}
		multiplier = Math.min(multiplier, Math.max(0, 1 - status.magnitude))
	}
	return multiplier
}

/** What to multiply incoming damage by, after the tag product. Exactly `1` when nothing is running. */
export function damageTakenMultiplier(target: StatusHolder): number {
	let multiplier = 1
	for (const status of target.statuses) {
		if (STATUS_DEFS[status.kind].effect !== 'damageTaken') {
			continue
		}
		multiplier *= 1 + status.magnitude * status.stacks
	}
	return multiplier
}

/**
 * How far the `armored` tag multiplier has been moved toward 1.0, as a fraction. 0 when nothing is
 * stripping. Read by `resolveDamage` in `matrix.ts` -- armor strip is a *tag*-side modifier, not a
 * damage-taken one, which is the distinction step 16 comes back to check.
 */
export function armorStripStrength(target: StatusHolder): number {
	let strength = 0
	for (const status of target.statuses) {
		if (STATUS_DEFS[status.kind].effect !== 'armorStrip') {
			continue
		}
		strength = Math.max(strength, status.magnitude)
	}
	return strength
}
