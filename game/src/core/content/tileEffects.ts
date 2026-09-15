/**
 * What each of the five `TileEffectKind`s *does*, as a def table.
 *
 * **Every rule is a field here, never a field on the cell and never a branch in the system.** The
 * cell carries only what differs between two cells of the same kind -- how long it has left and how
 * strong it is -- and everything that is true of the kind lives below. A sixth kind is a config
 * entry, and `core/systems/tiles.ts` does not grow a `case`.
 *
 * Modelled on `core/content/statuses.ts` deliberately, down to the `seconds()` helper, so the two
 * tables read the same. One thing is **not** shared, and it is the trap: `StatusDef.magnitude` for a
 * `speed` effect is the fraction of speed *removed*, while `TileEffectDef.magnitude` for a
 * `speedMultiplier` effect is the multiplier itself. Slime is `1.6` and means 1.6x, not "-0.6 of
 * speed removed". Statuses only ever slow; a tile can speed you up, and a negative fraction removed
 * is unreadable.
 *
 * Not zod-validated and not in `validateContentInDev`, for the reason `statuses` is absent from that
 * call (see the comment in `core/content/index.ts`): this is a runtime table keyed by a vocabulary,
 * and `Record<TileEffectKind, TileEffectDef>` is already exhaustive at the type level.
 */

import { toApplications } from '@/core/content/behaviours.ts'
import type { StatusApplication } from '@/core/content/behaviours.ts'
import type { DamageType, TileEffectKind } from '@/core/types.ts'

/** `core/` has no clock, so the conversion from the doc's seconds lives here as a plain factor. */
const TICKS_PER_SECOND = 60

function seconds(count: number): number {
	return count * TICKS_PER_SECOND
}

/** Negative is permanent, matching `TileEffect.remainingTicks`. Never decremented. */
const PERMANENT = -1

/**
 * How `TileEffect.magnitude` is read for this kind. Declared rather than inferred from the kind, so
 * the per-tick reads filter on a field instead of listing kinds they have to be kept in sync with.
 *
 * - `damageOverTime` -- damage per tick, resolved through the matrix as `damageType`.
 * - `speedMultiplier` -- what the enemy's speed is multiplied by. See the header: it is the
 *   multiplier, not a fraction removed.
 * - `none` -- nothing reads it, except `stages > 1`, where it is the growth stage.
 */
export type TileEffectMode = 'damageOverTime' | 'speedMultiplier' | 'none'

/**
 * What a second write onto a cell that already carries this kind does.
 *
 * - `refresh` -- the same merge as `STACK_RULES.refresh` in `statuses.ts`, and for the same reason:
 *   a Gas Stove Burner re-writing its own tile every `refreshIntervalTicks` must not expire on the
 *   first write's clock.
 * - `ignore` -- the existing effect is returned untouched. Both permanent kinds use it, and mold
 *   needs it: its `magnitude` is the growth stage, so a refresh would knock a fully-grown patch back
 *   to stage 1 every time anything wrote to it.
 */
export type TileRewriteRule = 'refresh' | 'ignore'

export interface TileEffectDef {
	kind: TileEffectKind
	effect: TileEffectMode
	/** What a `damageOverTime` tick resolves as. Null for the four kinds that deal no damage. */
	damageType: DamageType | null
	/** The default a writer that names none gets. */
	magnitude: number
	/** The default duration in ticks, never milliseconds. Negative is permanent. */
	durationTicks: number
	/**
	 * Statuses landed on whatever is standing here, once per tick. Orthogonal to `effect`: a kind may
	 * damage *and* apply, or neither.
	 */
	applies: readonly StatusApplication[]
	/** Whether a tower may be placed on a cell carrying this. Read by `blocksPlacement`. */
	blocksPlacement: boolean
	/** 1 never grows. Mold's 3 is its visual progression, carried in `magnitude`. */
	stages: number
	/** Ticks between two stage advances. Ignored when `stages === 1`. */
	stageTicks: number
	onRewrite: TileRewriteRule
}

/**
 * The five kinds. Every number is a **default**, overridable at the write, and the ones that belong
 * to a later step are transcribed from that step rather than invented here.
 */
export const TILE_EFFECT_DEFS: Readonly<Record<TileEffectKind, TileEffectDef>> = {
	heat: {
		kind: 'heat',
		effect: 'damageOverTime',
		damageType: 'fire',
		/** The Gas Stove Burner's 14/s (analytic-docs/CONTENT.md section 1) over 60. Step 17 authors it. */
		magnitude: 14 / TICKS_PER_SECOND,
		durationTicks: seconds(2),
		applies: [],
		blocksPlacement: false,
		stages: 1,
		stageTicks: 0,
		onRewrite: 'refresh',
	},
	slime: {
		kind: 'slime',
		effect: 'speedMultiplier',
		damageType: null,
		/** 1.6x. The multiplier itself -- see the header. Step 15's number. */
		magnitude: 1.6,
		durationTicks: seconds(8),
		applies: [],
		blocksPlacement: false,
		stages: 1,
		stageTicks: 0,
		onRewrite: 'refresh',
	},
	mold: {
		kind: 'mold',
		effect: 'none',
		damageType: null,
		/** Stage 1. `magnitude` is the growth stage for this kind, and nothing else reads it. */
		magnitude: 1,
		durationTicks: PERMANENT,
		applies: [],
		/** The line that makes step 15's placement gate a config entry rather than a mold check. */
		blocksPlacement: true,
		stages: 3,
		stageTicks: seconds(2),
		onRewrite: 'ignore',
	},
	residue: {
		kind: 'residue',
		effect: 'none',
		damageType: null,
		/** Unread: `effect` is `none` and `stages` is 1. Present because every def carries one. */
		magnitude: 1,
		durationTicks: seconds(6),
		applies: toApplications(['poison']),
		blocksPlacement: false,
		stages: 1,
		stageTicks: 0,
		onRewrite: 'refresh',
	},
	scorch: {
		kind: 'scorch',
		effect: 'none',
		damageType: null,
		magnitude: 1,
		/**
		 * Cosmetic and permanent: nothing in `core/` reads it back. Giving it a duration would turn a
		 * burning enemy standing still into a per-tick allocator -- see `applyDamage`.
		 */
		durationTicks: PERMANENT,
		applies: [],
		blocksPlacement: false,
		stages: 1,
		stageTicks: 0,
		onRewrite: 'ignore',
	},
}
