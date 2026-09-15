/**
 * What a tier *is*, and the fold that turns `(def, tier)` into the def a tower at that tier
 * actually has.
 *
 * **Everything here is pure and takes a def rather than looking one up.** The lookup half --
 * `effectiveDef` with its memo, and `effectiveDefOf` -- lives in `core/content/index.ts` beside
 * `getTowerDef`. Putting the fold where it could call `getTowerDef` would make
 * `towers.ts -> upgrades.ts -> index.ts -> towers.ts` a cycle, and a content cycle surfaces as
 * `TOWERS` being `undefined` at module load from a stack trace that names neither file.
 *
 * **A tier is a delta, never a replacement.** There is no `replaceBehaviours`: every tier in the
 * roster is either a field delta, an added behaviour or a rewritten `applies` list, and a whole
 * behaviour replaced is how a fold stops being a fold -- the second application cannot see what the
 * first did. `replaceApplies` is the narrow exception and stays narrow for exactly that reason: it
 * swaps one array and leaves every folded number on the behaviour where it was.
 *
 * **Deltas name real behaviour fields, never a second stat vocabulary.** There is no `rate` field
 * anywhere, so a `statDeltas: { rate: 1.4 }` would need something to translate it into
 * `cooldownTicks / 1.4`, and that translation is where the rounding bug lives. A rate bump is
 * authored as `multiply: { cooldownTicks: 1 / 1.4 }` against a named behaviour `kind`.
 */

import { toApplications } from '@/core/content/behaviours.ts'
import type { Behaviour, BehaviourKind, StatusApplication, StatusApplicationParam } from '@/core/content/behaviours.ts'
import type { TowerDef } from '@/core/content/schema.ts'

/**
 * Three tiers per tower, from analytic-docs/CONTENT.md section 1. `Tower.tier` is 0 for a freshly
 * placed tower and `MAX_TIER` at the top, so `def.upgrades[tower.tier]` is the *next* one to buy.
 */
export const MAX_TIER = 3

/**
 * 60% / 120% / 250% of the base cost, as a formula and not thirty transcribed numbers: that list
 * would be thirty chances to drift from analytic-docs/CONTENT.md section 1, and step 22 re-pricing
 * the curve would touch thirty lines instead of these three.
 */
const UPGRADE_COST_RATES = [0.6, 1.2, 2.5] as const

/**
 * What a delta points at: one behaviour kind, or `'def'` for a field that is genuinely on the def
 * rather than on a behaviour.
 *
 * `'def'` reaches exactly two fields -- `maxHp` (the Cardboard Box's defining stat) and `noise`.
 * Anything else a tier wants to change belongs on a behaviour, because a system reads it there.
 */
export type DeltaTarget = BehaviourKind | 'def'

/** One delta: some numeric fields on every object of one kind that the def carries. */
export interface StatDelta {
	kind: DeltaTarget
	fields: Record<string, number>
}

/**
 * The `applies` list of every behaviour of one kind, rewritten wholesale.
 *
 * **Why this and not a `StatDelta`.** A delta writes numbers onto a behaviour object; what the Ice
 * Cube Tray's tier 3 and the Spray Bottle's tier 3 change is a field *inside an entry of an array*
 * -- `everyNthHit` on a freeze, `stacks` on a poison -- which a `Record<string, number>` cannot
 * name. The two other routes were worse: `addBehaviours` would append a second `attack` that
 * `behaviours.find(isFiring)` never reaches, and a whole-behaviour replace would discard the
 * `cooldownTicks` that tiers 1 and 2 folded onto the one it replaced.
 *
 * **Wholesale and not a merge**, because the *order* of the list is load-bearing: the Ice Cube Tray
 * puts its freeze before its slow so `STATUS_DEFS.slow.suppressedBy` turns the slow away by itself,
 * and an append could only ever add to the end.
 */
export interface ApplicationDelta {
	kind: DeltaTarget
	applications: StatusApplication[]
}

/** What a tier *authors*, through the same normaliser every behaviour factory uses. */
export interface ApplicationDeltaParam {
	kind: DeltaTarget
	applications: readonly StatusApplicationParam[]
}

/**
 * One tier. Six fields and nothing else -- no `cost` (it is derived from the base cost by
 * `upgradeCost`), no `glyph` (the tier treatment is a badge drawn over the one glyph, because
 * `preloadTowerGlyphs` rasterises `TOWERS.map(def => def.glyph)` at exactly one size).
 *
 * `descriptionKey` is null for tiers 1 and 2: the inspector's before -> after diff says "5 -> 7",
 * and a sentence under it reading "more damage" is noise.
 */
export interface TowerUpgrade {
	multiply: StatDelta[]
	add: StatDelta[]
	replaceApplies: ApplicationDelta[]
	addBehaviours: Behaviour[]
	nameKey: string
	descriptionKey: string | null
}

export interface TierParams {
	multiply?: readonly StatDelta[]
	add?: readonly StatDelta[]
	replaceApplies?: readonly ApplicationDeltaParam[]
	addBehaviours?: readonly Behaviour[]
	nameKey: string
	descriptionKey?: string | null
}

/**
 * Every field is written out rather than spread from `params`, exactly the way every factory in
 * `core/content/behaviours.ts` does and for the same reason: a spread would carry a typo'd extra key
 * straight into the tier and into the save.
 */
export function tier(params: TierParams): TowerUpgrade {
	return {
		multiply: [...(params.multiply ?? [])],
		add: [...(params.add ?? [])],
		replaceApplies: (params.replaceApplies ?? []).map(delta => ({
			kind: delta.kind,
			applications: toApplications(delta.applications),
		})),
		addBehaviours: [...(params.addBehaviours ?? [])],
		nameKey: params.nameKey,
		descriptionKey: params.descriptionKey ?? null,
	}
}

// --- the fold -------------------------------------------------------------------------------------

/** Any field whose name ends in this is an integer in every schema that declares one. */
const TICK_SUFFIX = 'Ticks'

/** Six decimal places. Far finer than anything authored, and coarse enough to erase float dust. */
const DUST_SCALE = 1e6

/**
 * What a folded number is stored as.
 *
 * **A `Ticks` field is rounded to an integer**, because `cooldownTicks` and friends are
 * `z.number().int()` in `core/content/schema.ts` -- an unrounded multiply produces a def that would
 * fail its own validation. A name-suffix rule rather than a list, because the list is what goes
 * stale the moment a tier folds a field nobody thought of.
 *
 * **Everything else is rounded to six places**, which is a different job. `5 * 1.4 * 1.4` is
 * `9.799999999999999` and `ui/viewModel.ts` puts `damage` on the inspector raw, so without this the
 * card reads as a simulation bug -- the same symptom the rate `0.15000000000000002` would be. It
 * costs no expressiveness: a deliberately fractional stat survives it untouched.
 */
function stored(name: string, value: number): number {
	return name.endsWith(TICK_SUFFIX) ? Math.round(value) : Math.round(value * DUST_SCALE) / DUST_SCALE
}

/**
 * The objects a delta writes to. `Record<string, unknown>` is the one cast in this file: a delta
 * names its field in a string, which is what makes a tier data rather than code, and the throw in
 * `applyDelta` is what turns a name that does not exist into a loud failure instead of a no-op.
 */
type Writable = Record<string, unknown>

function deltaTargets(def: TowerDef, kind: DeltaTarget): Writable[] {
	if (kind === 'def') {
		return [def as unknown as Writable]
	}
	return def.behaviours.filter(behaviour => behaviour.kind === kind) as unknown as Writable[]
}

/**
 * A delta naming a `kind` the def does not have, or a field that is not a number there, is a silent
 * no-op today and a typo tomorrow -- so it throws with the def id and the name in the message, the
 * way `loadMap` throws on a bad `lengthTiles`.
 */
function applyDelta(def: TowerDef, delta: StatDelta, combine: (current: number, value: number) => number): void {
	const targets = deltaTargets(def, delta.kind)
	if (targets.length === 0) {
		throw new Error(`tower '${def.id}': an upgrade names '${delta.kind}', which this tower has no behaviour of`)
	}

	for (const [name, value] of Object.entries(delta.fields)) {
		for (const target of targets) {
			const current = target[name]
			if (typeof current !== 'number') {
				throw new Error(
					`tower '${def.id}': an upgrade names '${delta.kind}.${name}', which is not a number there`,
				)
			}
			target[name] = stored(name, combine(current, value))
		}
	}
}

/**
 * Shallow on purpose. `applies` is documented on `Projectile` as immutable content held **by
 * reference** off the behaviour and never written through, so sharing the array is what keeps that
 * true; a tier that needs a different one gets a **new** array from `applyApplicationDelta` below
 * rather than writing into the shared one.
 */
function cloneBehaviour(behaviour: Behaviour): Behaviour {
	return { ...behaviour }
}

/** The subset of a behaviour a `replaceApplies` may point at: the four that carry statuses. */
type Applier = { applies: StatusApplication[] }

function hasApplies(target: Writable): target is Writable & Applier {
	return Array.isArray(target.applies)
}

/**
 * Swaps the whole `applies` array for a new one. A **new array**, never a write into the existing
 * one: the old array is the base def's and every projectile in flight is holding it by reference.
 */
function applyApplicationDelta(def: TowerDef, delta: ApplicationDelta): void {
	const targets = deltaTargets(def, delta.kind)
	if (targets.length === 0) {
		throw new Error(`tower '${def.id}': an upgrade names '${delta.kind}', which this tower has no behaviour of`)
	}

	for (const target of targets) {
		if (!hasApplies(target)) {
			throw new Error(`tower '${def.id}': an upgrade replaces the applies of '${delta.kind}', which has none`)
		}
		target.applies = delta.applications.map(application => ({ ...application }))
	}
}

function applyTier(def: TowerDef, upgrade: TowerUpgrade): TowerDef {
	const next: TowerDef = { ...def, behaviours: def.behaviours.map(cloneBehaviour) }

	// **`multiply` runs before `add`, within one tier.** The multiplier describes the tower as it
	// stands and the flat add is a bonus on top of it; the reverse silently multiplies a flat +2 by
	// whatever the same tier's multiplier is. `tests/upgrades.spec.ts` asserts this order, and this
	// comment is what stops someone "simplifying" it.
	for (const delta of upgrade.multiply) {
		applyDelta(next, delta, (current, value) => current * value)
	}
	for (const delta of upgrade.add) {
		applyDelta(next, delta, (current, value) => current + value)
	}

	// After both, and before the behaviours this tier adds: a `replaceApplies` is authored against
	// the tower as it stood, and letting it reach a behaviour the same tier appended would make the
	// authored list depend on which of the two lines came first in the entry.
	for (const delta of upgrade.replaceApplies) {
		applyApplicationDelta(next, delta)
	}

	// Appended after the deltas ran, so a tier's deltas describe the tower as it stood rather than
	// the behaviour the same tier is adding.
	if (upgrade.addBehaviours.length > 0) {
		next.behaviours = [...next.behaviours, ...upgrade.addBehaviours.map(cloneBehaviour)]
	}

	return next
}

/**
 * The def a tower at `tier` has, folded 1 -> 2 -> 3 in order. Returns a **new** `TowerDef` with new
 * behaviour objects; the base def is never touched.
 *
 * `structuredClone` is the obvious way to get that and it is wrong here -- see `cloneBehaviour`.
 *
 * Tier 0 returns the base def itself, because tier 0 *is* the base def: that is what
 * `PlaceTower` builds from, and there is nothing to copy.
 */
export function foldUpgrades(def: TowerDef, tier: number): TowerDef {
	if (tier <= 0) {
		return def
	}
	if (tier > def.upgrades.length) {
		throw new Error(`tower '${def.id}': asked for tier ${tier}, and it has ${def.upgrades.length}`)
	}

	let folded = def
	for (let n = 1; n <= tier; n++) {
		const upgrade = def.upgrades[n - 1]
		if (upgrade === undefined) {
			throw new Error(`tower '${def.id}': tier ${n} is missing`)
		}
		folded = applyTier(folded, upgrade)
	}

	return folded
}

/**
 * What buying tier `tier` costs, off the **base** cost and never a folded one -- no delta touches
 * `cost`, and pricing an upgrade against an upgraded price is how the third tier ends up at 250% of
 * 250%.
 *
 * **`tier` is 1-based here and `Tower.tier` is 0-based.** A freshly placed tower is tier 0 and the
 * next one it can buy is `upgradeCost(def, tower.tier + 1)`. The off-by-one is free to make and
 * costs a whole session's confidence in the prices.
 */
export function upgradeCost(def: TowerDef, tier: number): number {
	const rate = UPGRADE_COST_RATES[tier - 1]
	if (rate === undefined) {
		throw new Error(`tower '${def.id}': there is no tier ${tier} to price; tiers are 1 to ${MAX_TIER}`)
	}

	return Math.round(def.cost * rate)
}
