/**
 * The shape of every piece of authored content, as zod schemas, plus the boot-time check that
 * turns a typo into a startup crash instead of a tower that silently deals zero damage on night 11
 * (analytic-docs/ARCHITECTURE.md section 4).
 *
 * **The schemas are the declaration.** Every def type below is `z.infer`red, never hand-written as
 * an interface next to the schema -- two declarations of the same shape drift, and the one that
 * drifts is always the one without the runtime check behind it. `MapDef` in `core/types.ts` is not
 * a second declaration of `mapSource`: it is the *derived* runtime shape `loadMap` produces, and
 * nothing hand-writes one.
 *
 * **Everything here is dev-only at runtime.** The schemas are built *inside* `contentSchemas()`
 * rather than as module constants, so that a production build -- where `import.meta.env.DEV` is
 * statically `false` and the call in `validateContentInDev` is dropped -- tree-shakes this whole
 * file and zod with it. Built as top-level constants they would ship to every player instead, for
 * a check that can only tell them something the build already knew. The consequence for
 * `core/content/index.ts`: import `validateContentInDev` and the *types*, and never re-export a
 * schema, which would root it again.
 *
 * Three things this file is deliberately strict about:
 *
 * - **Names are i18n keys, never English.** `core/` imports nothing and so cannot translate; a raw
 *   string fails `I18N_KEY` at boot rather than shipping to a player (CLAUDE.md, "Strings").
 * - **Durations are tick counts, and every one of them is bounded.** A non-negative integer alone
 *   does not catch the `1500` that was meant to be milliseconds -- the upper bound is what does.
 * - **Ids are unique across their own kind.** Validating each entry in isolation cannot see a
 *   second tower quietly shadowing the first, so `validateContent` checks the collection.
 */

import { z } from 'zod'
import type { Behaviour } from '@/core/content/behaviours.ts'
import type {
	DamageType,
	DifficultyId,
	EnemyTag,
	Placement,
	StatusKind,
	TargetingMode,
	TileEffectKind,
} from '@/core/types.ts'

// --- primitives -----------------------------------------------------------------------------------

/** `saltShaker`, `night01`. camelCase so an id is usable as an object key and greppable. */
const DEF_ID = /^[a-z][a-zA-Z0-9]*$/

/**
 * `tower.saltShaker.name`. At least one dot and no spaces, which is what makes `'Salt Shaker'`
 * -- the mistake this pattern exists to catch -- fail rather than validate as a key.
 */
const I18N_KEY = /^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]+)+$/

/**
 * Upper bounds on tick counts. Every one of these is far above anything in
 * analytic-docs/CONTENT.md and far below the millisecond value the same duration would be written
 * as, which is the whole job: 6.6 seconds of rearm is 396 ticks and 6600 milliseconds, and only
 * one of those two numbers gets past the bound.
 */
const MAX_COOLDOWN_TICKS = 600
const MAX_REARM_TICKS = 1800
const MAX_TRAVEL_TICKS = 1800
const MAX_STATUS_TICKS = 600
const MAX_TILE_EFFECT_TICKS = 3600
const MAX_WAVE_DELAY_TICKS = 7200

/** The board is 24 x 14 tiles (analytic-docs/CONTENT.md section 1), so nothing reaches further. */
const MAX_TILES = 24

/** `.` buildable, `#` blocked, `~` decor. `T` is deliberately not here -- see the `mapSource` note. */
const LEGAL_TILE_CHARS = '.#~'

/** Below this, two waypoints are a double-click rather than a segment. */
const MIN_WAYPOINT_GAP_TILES = 0.1

/** How far a path's last waypoint may sit from the fridge tile. */
const MAX_FRIDGE_GAP_TILES = 1

function defId() {
	return z.string().regex(DEF_ID, 'not a def id: expected camelCase, e.g. saltShaker')
}

function i18nKey() {
	return z.string().regex(I18N_KEY, 'not an i18n key: expected e.g. tower.saltShaker.name')
}

/** A tick count: a non-negative integer with a bound tight enough to reject a millisecond value. */
function tickCount(max: number) {
	return z.number().int().min(0).max(max)
}

function tiles(max = MAX_TILES) {
	return z.number().min(0).max(max)
}

/** One emoji, occasionally with a variation selector. Entities are glyphs, never sprites. */
function glyph() {
	return z.string().min(1).max(8)
}

// --- vocabularies ---------------------------------------------------------------------------------
// The literal unions of core/types.ts, restated as values because zod needs them at runtime.
// tests/schema.spec.ts asserts each inferred union is *exactly* its counterpart, so a member added
// to one and forgotten here fails type-check rather than rejecting valid content at boot.

const DAMAGE_TYPES = ['physical', 'fire', 'cold', 'chemical', 'electric'] as const satisfies readonly DamageType[]

const ENEMY_TAGS = [
	'ground',
	'air',
	'soft',
	'armored',
	'swarm',
	'fast',
	'bug',
	'fungal',
	'mammal',
	'slime',
	'spreads',
	'burrows',
	'thief',
	'light-drawn',
	'self-spawning',
	'physical-immune',
	'douses-fire',
	'boss',
] as const satisfies readonly EnemyTag[]

const STATUS_KINDS = [
	'slow',
	'freeze',
	'burn',
	'poison',
	'armorStrip',
	'marked',
	'rooted',
] as const satisfies readonly StatusKind[]

const TARGETING_MODES = [
	'FIRST',
	'LAST',
	'STRONGEST',
	'WEAKEST',
	'CLOSEST',
	'RANDOM',
] as const satisfies readonly TargetingMode[]

const TILE_EFFECT_KINDS = ['heat', 'slime', 'mold', 'residue', 'scorch'] as const satisfies readonly TileEffectKind[]

const DIFFICULTY_IDS = ['cozy', 'normal', 'nightmare'] as const satisfies readonly DifficultyId[]

/** analytic-docs/CONTENT.md section 1. Descriptive only -- no system branches on a role. */
const TOWER_ROLES = [
	'BASIC_DPS',
	'BURST_DPS',
	'AOE',
	'DOT',
	'SLOW',
	'CONTROL',
	'WALL',
	'ECONOMY',
	'DETECTION',
	'SUPPRESSION',
	'TILE_EFFECT',
] as const

const TARGET_CLASSES = ['ground', 'air', 'both'] as const

/** A barricade goes *on* the track; everything else goes beside it. `core/map.ts` reads it. */
const PLACEMENTS = ['off_path', 'path_only'] as const satisfies readonly Placement[]

// --- the schemas ------------------------------------------------------------------------------

/**
 * Every schema, built on demand. Called once, by `validateContent`, inside a dev-only branch.
 *
 * The types below are inferred from the return value, which costs nothing at runtime: a type is
 * erased whether or not the function that produced it was ever called.
 */
export function contentSchemas() {
	const damageType = z.enum(DAMAGE_TYPES)
	const enemyTag = z.enum(ENEMY_TAGS)
	const statusKind = z.enum(STATUS_KINDS)
	const targetingMode = z.enum(TARGETING_MODES)
	const tileEffectKind = z.enum(TILE_EFFECT_KINDS)
	const difficultyId = z.enum(DIFFICULTY_IDS)
	const towerRole = z.enum(TOWER_ROLES)
	const targetClass = z.enum(TARGET_CLASSES)

	// --- behaviours ---------------------------------------------------------------------------
	// One schema per member of the `Behaviour` union in core/content/behaviours.ts. The two files
	// are built in one sitting because they have to agree: the `satisfies` below stops compiling
	// if a behaviour gains a field the schema does not know about, and tests/schema.spec.ts
	// asserts the inferred union is exactly `Behaviour` in the other direction too.

	const behaviour = z.discriminatedUnion('kind', [
		z.object({
			kind: z.literal('attack'),
			damage: z.number().min(0),
			damageType,
			cooldownTicks: tickCount(MAX_COOLDOWN_TICKS),
			rangeTiles: tiles(),
			targets: targetClass,
			projectileSpeed: z.number().min(0).max(MAX_TILES),
			splashRadiusTiles: tiles(),
		}),
		z.object({
			kind: z.literal('coneAttack'),
			damage: z.number().min(0),
			damageType,
			cooldownTicks: tickCount(MAX_COOLDOWN_TICKS),
			rangeTiles: tiles(),
			coneHalfAngleDeg: z.number().min(0).max(180),
			targets: targetClass,
		}),
		z.object({
			kind: z.literal('aura'),
			radiusTiles: tiles(),
			damagePerTick: z.number().min(0),
			damageType,
			targets: targetClass,
		}),
		z.object({
			kind: z.literal('income'),
			crumbsPerPayout: z.number().int().min(0),
			payoutIntervalTicks: z.number().int().min(1).max(MAX_COOLDOWN_TICKS),
		}),
		z.object({
			kind: z.literal('collect'),
			radiusTiles: tiles(),
			travelTicks: tickCount(MAX_TRAVEL_TICKS),
		}),
		z.object({
			kind: z.literal('charge'),
			charges: z.number().int().min(1).max(99),
			rearmTicks: tickCount(MAX_REARM_TICKS),
		}),
		z.object({ kind: z.literal('barricade') }),
		z.object({
			kind: z.literal('bait'),
			radiusTiles: tiles(),
			targets: targetClass,
		}),
		z.object({
			kind: z.literal('suppress'),
			radiusTiles: tiles(),
			suppresses: z.literal('burrow'),
		}),
		z.object({
			kind: z.literal('pushback'),
			rangeTiles: tiles(),
			coneHalfAngleDeg: z.number().min(0).max(180),
			pushTilesPerTick: z.number().min(0).max(1),
			targets: targetClass,
		}),
		z.object({
			kind: z.literal('tileEffect'),
			effect: tileEffectKind,
			radiusTiles: tiles(),
			magnitude: z.number(),
			// -1 is permanent, matching `TileEffect.remainingTicks`. Nothing else may be negative.
			durationTicks: z.number().int().min(-1).max(MAX_TILE_EFFECT_TICKS),
			refreshIntervalTicks: z.number().int().min(1).max(MAX_COOLDOWN_TICKS),
		}),
		z.object({
			kind: z.literal('reveal'),
			radiusTiles: tiles(),
			attractsLightDrawn: z.boolean(),
		}),
	]) satisfies z.ZodType<Behaviour>

	// --- towers -------------------------------------------------------------------------------
	// A tower is its numbers plus a list of behaviour descriptors. There is no `class`, no
	// `extends`, and no field naming a system: what the tower *does* is entirely in `behaviours`.
	//
	// Absent on purpose -- the step that adds the mechanic extends this schema: upgrade tiers
	// (step 12), loadout and unlock state (step 20).

	const tower = z.object({
		id: defId(),
		nameKey: i18nKey(),
		descriptionKey: i18nKey(),
		glyph: glyph(),
		role: towerRole,
		cost: z.number().int().min(1).max(10_000),
		maxHp: z.number().int().min(1).max(10_000),
		/** A barricade goes *on* the track; everything else goes beside it. */
		placement: z.enum(PLACEMENTS),
		/** Added to the noise meter per shot. 0 for everything that is not loud. */
		noise: z.number().min(0).max(20),
		defaultTargetingMode: targetingMode,
		behaviours: z.array(behaviour).min(1),
	})

	// --- enemies ------------------------------------------------------------------------------

	const enemy = z.object({
		id: defId(),
		nameKey: i18nKey(),
		descriptionKey: i18nKey(),
		glyph: glyph(),
		hp: z.number().int().min(1).max(100_000),
		/**
		 * Tiles per **tick**. The fastest thing in v1 is the Fly at 2.2 tiles/sec, which is 0.037
		 * here -- so the bound is what catches a tiles-per-second value pasted in from the doc.
		 */
		speedTilesPerTick: z.number().min(0).max(0.5),
		/** Crumbs dropped on death. */
		reward: z.number().int().min(0).max(1000),
		/** Food items taken at the fridge. */
		steals: z.number().int().min(0).max(20),
		tags: z.array(enemyTag).min(1),
	})

	// --- maps ---------------------------------------------------------------------------------
	// This validates the **authored** map -- the JSON in core/content/maps/. What `World` holds is
	// `MapDef`, which `loadMap` derives from it: the char grid becomes a flag bitfield and the
	// track is rasterised out of the polyline. So the schema is inferred like every other def here,
	// and `MapDef` stays hand-declared in core/types.ts because `World` holds one.

	const vec2 = z.object({ x: z.number(), y: z.number() })

	const path = z.object({
		id: defId(),
		waypoints: z.array(vec2).min(2),
		/** Authored, and cross-checked against the waypoints by `loadMap` (step 3A, decision 6). */
		lengthTiles: z.number().positive(),
	})

	/**
	 * One string per row, `widthTiles` chars long. **`T` is not a legal character**: track is
	 * derived from the polyline and never hand-painted, or the two can disagree with each other and
	 * with `path_only` placement (analytic-docs/DECISIONS.md section 3).
	 */
	const mapSource = z
		.object({
			id: defId(),
			widthTiles: z.number().int().min(1).max(64),
			heightTiles: z.number().int().min(1).max(64),
			/** `.` buildable, `#` blocked, `~` decor. */
			tiles: z.array(z.string()),
			/** Authored per map: a six-lane kitchen floor and a narrow counter want different tracks. */
			trackWidthTiles: z.number().min(0.1).max(8).optional(),
			paths: z.array(path).min(1),
			fridge: z.object({ tile: vec2, glyph: glyph() }),
			decor: z.array(z.object({ glyph: glyph(), tile: vec2 })).optional(),
		})
		// One superRefine rather than a chain of .refine calls, so a map with four problems reports
		// four lines instead of the first one and three restarts.
		.superRefine((value, ctx) => {
			function problem(message: string, path: (string | number)[]) {
				ctx.addIssue({ code: 'custom', message, path })
			}

			if (value.tiles.length !== value.heightTiles) {
				problem(`expected ${value.heightTiles} rows, got ${value.tiles.length}`, ['tiles'])
			}

			value.tiles.forEach((row, y) => {
				if (row.length !== value.widthTiles) {
					problem(`row ${y} is ${row.length} chars, expected ${value.widthTiles}`, ['tiles', y])
				}
				const illegal = [...row].filter(char => !LEGAL_TILE_CHARS.includes(char))
				if (illegal.length > 0) {
					problem(`row ${y} has illegal chars '${[...new Set(illegal)].join('')}'; expected . # ~`, [
						'tiles',
						y,
					])
				}
			})

			function inside(point: { x: number; y: number }): boolean {
				return (
					point.x >= 0 && point.x <= value.widthTiles - 1 && point.y >= 0 && point.y <= value.heightTiles - 1
				)
			}

			if (!inside(value.fridge.tile)) {
				problem('fridge is outside the map', ['fridge', 'tile'])
			}

			value.decor?.forEach((entry, index) => {
				if (!inside(entry.tile)) {
					problem('decor is outside the map', ['decor', index, 'tile'])
				}
			})

			value.paths.forEach((entry, index) => {
				entry.waypoints.forEach((waypoint, w) => {
					if (!inside(waypoint)) {
						problem(`path '${entry.id}' waypoint ${w} is outside the map`, ['paths', index, 'waypoints', w])
					}
					// A coincident pair produces a NaN angle and breaks the binary search's
					// invariant, and it is exactly what a double-click in step 4's editor makes.
					const previous = entry.waypoints[w - 1]
					if (
						previous !== undefined &&
						Math.hypot(waypoint.x - previous.x, waypoint.y - previous.y) < MIN_WAYPOINT_GAP_TILES
					) {
						problem(
							`path '${entry.id}' waypoints ${w - 1} and ${w} are less than ${MIN_WAYPOINT_GAP_TILES} tiles apart`,
							['paths', index, 'waypoints', w],
						)
					}
				})

				// Every lane ends at the fridge -- that is what makes it the health bar rather than
				// one of several places an enemy might stop.
				const last = entry.waypoints[entry.waypoints.length - 1]
				if (
					last !== undefined &&
					Math.hypot(last.x - value.fridge.tile.x, last.y - value.fridge.tile.y) > MAX_FRIDGE_GAP_TILES
				) {
					problem(`path '${entry.id}' does not end at the fridge`, ['paths', index, 'waypoints'])
				}
			})
		})

	// --- nights -------------------------------------------------------------------------------

	/** One entry of a wave's composition (analytic-docs/CONTENT.md section 6). */
	const waveEntry = z.object({
		enemyDefId: defId(),
		count: z.number().int().min(1).max(500),
		/** Ticks between two enemies of this entry. */
		spacingTicks: z.number().int().min(1).max(MAX_WAVE_DELAY_TICKS),
		/** Ticks after the wave starts before this entry spawns its first enemy. */
		startDelayTicks: tickCount(MAX_WAVE_DELAY_TICKS),
		pathId: defId(),
	})

	const wave = z.object({
		entries: z.array(waveEntry).min(1),
		/**
		 * Ticks the player gets before the next wave starts on its own. Calling early banks the
		 * remainder as bonus crumbs, which is why it is authored per wave rather than globally
		 * (analytic-docs/DECISIONS.md section 5).
		 */
		countdownTicks: tickCount(MAX_WAVE_DELAY_TICKS),
	})

	/** Difficulty scalars are applied at runtime, never baked into a night. */
	const night = z.object({
		id: defId(),
		/** 1-based, matching the night column of analytic-docs/CONTENT.md section 6. */
		index: z.number().int().min(1).max(100),
		mapId: defId(),
		waves: z.array(wave).min(1),
	})

	// --- statuses -----------------------------------------------------------------------------

	/**
	 * The stacking rule as **data on the def**, so adding an eighth status is an entry here rather
	 * than a branch inside `applyStatus`. Step 2C owns the runtime that reads it.
	 */
	const stacking = z.discriminatedUnion('mode', [
		/** A second application resets the timer and nothing else: slow, freeze, armorStrip, marked. */
		z.object({ mode: z.literal('refresh') }),
		/** Burn to 3, poison to 5. Past the cap, duration refreshes and the count does not move. */
		z.object({ mode: z.literal('stack'), maxStacks: z.number().int().min(2).max(20) }),
		/** Rooted: no timer at all, it ends when the tape that applied it is spent. */
		z.object({ mode: z.literal('untilSourceSpent') }),
	])

	const status = z
		.object({
			/** The id *is* the kind -- there is exactly one def per `StatusKind`. */
			id: statusKind,
			nameKey: i18nKey(),
			/** 0 only for `untilSourceSpent`, which has no timer. */
			durationTicks: tickCount(MAX_STATUS_TICKS),
			/** Read per kind: a speed delta for slow, damage per tick for burn. */
			magnitude: z.number(),
			stacking,
		})
		.refine(value => (value.stacking.mode === 'untilSourceSpent') === (value.durationTicks === 0), {
			error: 'a timed status needs durationTicks > 0, and only untilSourceSpent may be 0',
			path: ['durationTicks'],
		})

	// --- installations ------------------------------------------------------------------------

	/**
	 * A metagame purchase (analytic-docs/CONTENT.md section 8). What each one *does* is fourteen
	 * different one-off effects across as many systems; step 20 owns them and extends this schema
	 * with the effect field once there is something to interpret it.
	 */
	const installation = z.object({
		id: defId(),
		nameKey: i18nKey(),
		descriptionKey: i18nKey(),
		/** Grocery Money, not crumbs. The two currencies never convert. */
		cost: z.number().int().min(1).max(10_000),
	})

	return {
		damageType,
		enemyTag,
		statusKind,
		targetingMode,
		tileEffectKind,
		difficultyId,
		towerRole,
		targetClass,
		behaviour,
		tower,
		enemy,
		mapSource,
		night,
		status,
		installation,
	}
}

export type ContentSchemas = ReturnType<typeof contentSchemas>

export type TowerRole = z.infer<ContentSchemas['towerRole']>
export type TowerDef = z.infer<ContentSchemas['tower']>
export type EnemyDef = z.infer<ContentSchemas['enemy']>
/** The authored map. `loadMap` in `core/map.ts` turns one of these into the `MapDef` a world holds. */
export type MapSource = z.infer<ContentSchemas['mapSource']>
export type NightDef = z.infer<ContentSchemas['night']>
export type StatusDef = z.infer<ContentSchemas['status']>
export type InstallationDef = z.infer<ContentSchemas['installation']>

// --- validation ---------------------------------------------------------------------------------

/** What comes in: whatever `core/content/` exports, before anything has been checked. */
export interface RawContent {
	towers?: readonly unknown[]
	enemies?: readonly unknown[]
	maps?: readonly unknown[]
	nights?: readonly unknown[]
	statuses?: readonly unknown[]
	installations?: readonly unknown[]
}

/** What comes out: the same content, typed, once every entry and every collection has passed. */
export interface Content {
	towers: TowerDef[]
	enemies: EnemyDef[]
	maps: MapSource[]
	nights: NightDef[]
	statuses: StatusDef[]
	installations: InstallationDef[]
}

export class ContentValidationError extends Error {
	/** One line per problem, so a def with three bad fields reports all three at once. */
	readonly problems: readonly string[]

	constructor(problems: readonly string[]) {
		super(`content validation failed (${problems.length}):\n  ${problems.join('\n  ')}`)
		this.name = 'ContentValidationError'
		this.problems = problems
	}
}

/** `behaviours.0.damageType` -- the field path a human can go and look at. */
function formatPath(path: readonly PropertyKey[]): string {
	return path.length === 0 ? '<root>' : path.map(String).join('.')
}

/**
 * The id to blame in the message. Read straight off the raw entry rather than off the parsed one,
 * because the entry that failed is exactly the one that has no parsed form.
 */
function labelOf(kind: string, entry: unknown, index: number): string {
	const id = (entry as { id?: unknown } | null)?.id
	return typeof id === 'string' && id.length > 0 ? `${kind} '${id}'` : `${kind} #${index}`
}

function validateCollection<T extends { id: string }>(
	kind: string,
	schema: z.ZodType<T>,
	entries: readonly unknown[] | undefined,
	problems: string[],
): T[] {
	const valid: T[] = []
	const seen = new Map<string, number>()

	;(entries ?? []).forEach((entry, index) => {
		const label = labelOf(kind, entry, index)
		const result = schema.safeParse(entry)

		if (result.success) {
			valid.push(result.data)
		} else {
			for (const issue of result.error.issues) {
				problems.push(`${label}: ${formatPath(issue.path)}: ${issue.message}`)
			}
		}

		// The duplicate check reads the raw id, so two entries collide even when one of them also
		// failed its schema -- otherwise fixing a typo would surface a second, unrelated error.
		const id = (entry as { id?: unknown } | null)?.id
		if (typeof id === 'string') {
			const first = seen.get(id)
			if (first === undefined) {
				seen.set(id, index)
			} else {
				problems.push(`${label}: id: duplicate id, already used at index ${first}`)
			}
		}
	})

	return valid
}

/**
 * Validates every collection and throws once, with **every** problem it found. Failing on the
 * first would mean fourteen restarts to fix fourteen typos.
 */
export function validateContent(raw: RawContent): Content {
	const schemas = contentSchemas()
	const problems: string[] = []

	const content: Content = {
		towers: validateCollection('tower', schemas.tower, raw.towers, problems),
		enemies: validateCollection('enemy', schemas.enemy, raw.enemies, problems),
		maps: validateCollection('map', schemas.mapSource, raw.maps, problems),
		nights: validateCollection('night', schemas.night, raw.nights, problems),
		statuses: validateCollection('status', schemas.status, raw.statuses, problems),
		installations: validateCollection('installation', schemas.installation, raw.installations, problems),
	}

	if (problems.length > 0) {
		throw new ContentValidationError(problems)
	}

	return content
}

/**
 * The boot-time call. `core/content/index.ts` runs this at module load; in a production build
 * `import.meta.env.DEV` is statically `false`, so the branch, `validateContent`, every schema and
 * zod itself all fall out of the bundle.
 *
 * Validation is a development tool, not a runtime feature: content ships inside the bundle, so if
 * it was valid at build time there is nothing left for it to catch in a player's browser.
 */
export function validateContentInDev(raw: RawContent): void {
	if (import.meta.env.DEV) {
		validateContent(raw)
	}
}
