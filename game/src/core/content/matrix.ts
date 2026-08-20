/**
 * The damage-type x tag table, transcribed from analytic-docs/CONTENT.md section 3, and the one
 * function every damage source in the game routes through.
 *
 * Pure arithmetic: no world, no rng, no mutation of the enemy passed in. Dealing the resolved
 * number -- killing, emitting events, rolling crumbs -- is step 6's job, not this file's.
 *
 * The only sibling this imports is `statuses.ts`, and only for the two status-side numbers the
 * matrix cannot know on its own: how far armor strip has moved the `armored` row, and how much
 * `Marked` has raised incoming damage. Those numbers live on the status defs so there is exactly one
 * copy of each.
 */

import type { DamageType, EnemyTag } from '@/core/types.ts'
import type { StatusHolder } from '@/core/content/statuses.ts'
import { armorStripStrength, damageTakenMultiplier } from '@/core/content/statuses.ts'

/** One row of the table: a multiplier per damage type. */
export type MatrixRow = Record<DamageType, number>

/** The tags that have a row. Every other `EnemyTag` is descriptive and multiplies by 1.0. */
export type MatrixTag = Extract<
	EnemyTag,
	'soft' | 'armored' | 'swarm' | 'air' | 'fungal' | 'mammal' | 'slime' | 'physical-immune' | 'douses-fire' | 'boss'
>

/**
 * Positional, in the column order of the doc, so the table below can be diffed against
 * analytic-docs/CONTENT.md section 3 by eye.
 */
function row(physical: number, fire: number, cold: number, chemical: number, electric: number): MatrixRow {
	return { physical, fire, cold, chemical, electric }
}

/**
 * analytic-docs/CONTENT.md section 3, verbatim. The rows below `slime` have no v1 enemies; they ship
 * anyway because they cost nothing and Act III fills them in.
 *
 * Typed `Partial<Record<EnemyTag, ...>>` so a lookup for a tag with no row is a real
 * `MatrixRow | undefined` that `tagMultiplier` defaults to 1.0 -- rather than an `undefined` that
 * quietly turns a damage number into `NaN`. The `satisfies` is what still requires all ten rows and
 * rejects a mistyped key.
 */
export const DAMAGE_MATRIX: Readonly<Partial<Record<EnemyTag, MatrixRow>>> = {
	// row(physical, fire, cold, chemical, electric)
	soft: row(1.0, 1.5, 0.5, 2.0, 1.0),
	armored: row(0.4, 1.0, 1.2, 1.0, 1.0),
	swarm: row(1.0, 1.5, 1.0, 1.5, 1.0),
	air: row(0.5, 1.2, 1.0, 1.0, 2.0),
	fungal: row(0.2, 1.5, 0.3, 2.5, 0.5),
	mammal: row(1.5, 1.0, 0.8, 0.6, 1.2),
	slime: row(1.0, 1.3, 1.0, 1.5, 1.8),
	'physical-immune': row(0.0, 1.3, 1.0, 1.5, 1.0),
	'douses-fire': row(1.0, 0.2, 1.3, 1.0, 1.0),
	boss: row(1.0, 1.0, 1.0, 1.0, 1.0),
} satisfies Record<MatrixTag, MatrixRow>

/** Enough of an `Enemy` to take a hit. A structural subset so nothing has to build a world to test. */
export interface DamageTarget extends StatusHolder {
	tags: readonly EnemyTag[]
}

/**
 * Armor strip "moves the `armored` multiplier halfway to 1.0" (analytic-docs/CONTENT.md section 4):
 * physical 0.4 becomes 0.7, cold 1.2 becomes 1.1, and a row already at 1.0 does not move at all.
 * `strength` is the fraction of the remaining distance to close, and comes off the status def.
 */
function towardNeutral(multiplier: number, strength: number): number {
	return multiplier + (1 - multiplier) * strength
}

/**
 * The multiplier one tag contributes. A tag with no row contributes exactly 1.0.
 *
 * `armored` is the one tag a status can reach, because armor strip changes the *tag* multiplier
 * rather than the damage taken afterwards. That is the whole reason this file and `statuses.ts` were
 * built in one sitting; step 16 comes back to check the wiring.
 */
export function tagMultiplier(tag: EnemyTag, damageType: DamageType, target: DamageTarget): number {
	const multiplier = DAMAGE_MATRIX[tag]?.[damageType] ?? 1
	if (tag === 'armored') {
		return towardNeutral(multiplier, armorStripStrength(target))
	}
	return multiplier
}

/**
 * `base` damage of `damageType` against `target`, as the **product** of every tag's multiplier, then
 * the status-side damage-taken modifier.
 *
 * Multiple tags multiply -- not the average, not the max, not the first match. A Silverfish is
 * `armored` and `bug`; a Slug is `slime` and `soft`; the whole late-game difficulty curve is those
 * products. This is the single most likely number in the codebase to silently drift, which is why
 * tests/matrix.spec.ts writes the two factors out by hand.
 */
export function resolveDamage(base: number, damageType: DamageType, target: DamageTarget): number {
	let multiplier = 1
	for (const tag of target.tags) {
		multiplier *= tagMultiplier(tag, damageType, target)
	}
	return base * multiplier * damageTakenMultiplier(target)
}
