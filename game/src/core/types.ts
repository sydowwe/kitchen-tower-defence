/**
 * Every noun in the game, as plain data.
 *
 * No classes, no methods, no function-typed fields anywhere below. `Serialisable<World>` at the
 * bottom of this file is the mechanical enforcement of that, and `tests/types.spec.ts` fails
 * `type-check` the moment it stops holding.
 *
 * Durations are **tick counts** and every field name says so. A field called `duration` gets filled
 * with milliseconds eventually; a field called `cooldownTicks` does not.
 */

import type { StatusApplication, TargetClass } from '@/core/content/behaviours.ts'
import type { RngState } from '@/core/rng.ts'

// --- identity ---------------------------------------------------------------------------------

/**
 * Unique across every entity array in the world, not per-array. `World.nextEntityId` is the only
 * source of new ones.
 */
export type EntityId = number

/** Points at a `TowerDef`, `EnemyDef`, `MapDef` or `NightDef` in `core/content/`. */
export type DefId = string

// --- vocabularies -----------------------------------------------------------------------------
// String-literal unions rather than `string`, so a typo is a type error rather than a tower that
// silently deals zero damage.

/** analytic-docs/CONTENT.md section 3, the columns of the matrix. */
export type DamageType = 'physical' | 'fire' | 'cold' | 'chemical' | 'electric'

/**
 * analytic-docs/CONTENT.md section 3, the rows of the matrix, plus the descriptive tags enemies
 * carry in section 2. Multiple tags **multiply** through `resolveDamage` (step 2C).
 */
export type EnemyTag =
	| 'ground'
	| 'air'
	| 'soft'
	| 'armored'
	| 'swarm'
	| 'fast'
	| 'bug'
	| 'fungal'
	| 'mammal'
	| 'slime'
	| 'spreads'
	| 'burrows'
	| 'thief'
	| 'light-drawn'
	| 'self-spawning'
	| 'physical-immune'
	| 'douses-fire'
	| 'boss'

/**
 * Runtime state an enemy is *in*, as opposed to what it *is*. Later steps extend this union --
 * step 16 owns burrowing, step 19 owns fleeing thieves.
 *
 * `hidden` and `revealed` are two different questions and both are needed: `hidden` is what the
 * enemy *is*, and `revealed` is what a light is doing to it **right now**. `core/systems/light.ts`
 * rewrites `revealed` from scratch every tick, so selling the lamp re-hides whatever it was lighting
 * on the same tick with no field to clear anywhere.
 */
export type EnemyFlag = 'hidden' | 'untargetable' | 'fleeing' | 'revealed'

/** analytic-docs/CONTENT.md section 4. */
export type StatusKind = 'slow' | 'freeze' | 'burn' | 'poison' | 'armorStrip' | 'marked' | 'rooted'

/** analytic-docs/CONTENT.md section 5. Player-switchable per tower in the inspector. */
export type TargetingMode = 'FIRST' | 'LAST' | 'STRONGEST' | 'WEAKEST' | 'CLOSEST' | 'RANDOM'

/**
 * Everything that writes to a tile writes one of these (analytic-docs/DECISIONS.md section 11) --
 * never a bespoke per-tower structure. Step 14 owns the system that reads them.
 */
export type TileEffectKind = 'heat' | 'slime' | 'mold' | 'residue' | 'scorch'

/** analytic-docs/CONTENT.md section 9. Global scalars; there is no per-tier content. */
export type DifficultyId = 'cozy' | 'normal' | 'nightmare'

// --- geometry ---------------------------------------------------------------------------------

/** Tile coordinates in most places, tile-space floats for entity positions. Never pixels. */
export interface Vec2 {
	x: number
	y: number
}

/**
 * An authored polyline. An enemy is `{ pathId, distance }` and its position is a sample along this
 * -- there is no pathfinding anywhere in the codebase (analytic-docs/DECISIONS.md section 3).
 *
 * Waypoints are **tile coordinates, integers landing on tile centres** -- the same space `Vec2`
 * uses everywhere else. `waypoints[0]` is the spawn point; there is no separate `spawns` array.
 */
export interface Path {
	id: string
	waypoints: Vec2[]
	/**
	 * Total length in tiles. Cached because sampling needs it every tick for every enemy, and
	 * cross-checked against the waypoints by `loadMap` so the two truths cannot drift apart.
	 */
	lengthTiles: number
}

/** Where a tower may stand. A barricade goes *on* the track; everything else goes beside it. */
export type Placement = 'off_path' | 'path_only'

/** The fridge: where leaked enemies arrive, and the only authored glyph that is not an entity. */
export interface MapFridge {
	tile: Vec2
	glyph: string
}

/** Scenery. Drawn by step 3B, read by nothing in the simulation. */
export interface MapDecor {
	glyph: string
	tile: Vec2
}

/**
 * The runtime map -- what `World` holds, derived by `loadMap` from the authored JSON in
 * `core/content/maps/`. The authored shape is `MapSource` in `core/content/schema.ts`; this one is
 * never written by hand.
 */
export interface MapDef {
	id: DefId
	widthTiles: number
	heightTiles: number
	/** Two or three from night 10 onward, authored to merge before the fridge. */
	paths: Path[]
	/**
	 * Authored width of every path on this map, defaulted at load. Derived here rather than left in
	 * the JSON because it is the one number the rasterised `TRACK` flags and the drawn track both
	 * read: a renderer that took its stroke width from anywhere else could draw a track that does
	 * not sit on the tiles the simulation calls track.
	 */
	trackWidthTiles: number
	/**
	 * Row-major, `widthTiles * heightTiles` long, one `TileFlags` bitfield per tile with `TRACK`
	 * already rasterised in. The single runtime truth for what is buildable, blocked and track --
	 * the authored char grid does not survive into `MapDef` at all.
	 *
	 * Plain `number[]` and not a typed array on purpose: a `Uint8Array` does not survive
	 * `JSON.parse(JSON.stringify(world))` deeply equal, and `tests/world.spec.ts` asserts it does.
	 */
	flags: number[]
	fridge: MapFridge
	decor: MapDecor[]
}

// --- entities ---------------------------------------------------------------------------------

/** One timed modifier on an enemy. Step 2C owns the stacking rules; this is only the shape. */
export interface ActiveStatus {
	kind: StatusKind
	/** Decremented by 1 per tick and dropped at 0. */
	remainingTicks: number
	/** 1 for non-stacking effects. Capped per status def (burn 3, poison 5). */
	stacks: number
	/** Interpreted per kind: a speed delta for slow, damage per tick for burn. */
	magnitude: number
	/** Rooted lasts "until the source is spent", so it has to know its source. Null otherwise. */
	sourceId: EntityId | null
	/**
	 * The damage type per-tick damage is dealt as, taken from the behaviour that applied it -- so a
	 * burn lit by an electric tower burns electric. Null when the source had none, and
	 * `StatusDef.damageType` is the fallback. Meaningless for a status that deals no damage.
	 */
	damageType: DamageType | null
}

export interface Enemy {
	id: EntityId
	defId: DefId
	/** Which of `MapDef.paths` this enemy walks. */
	pathId: string
	/** Tiles travelled along `pathId`. Position is `samplePath(pathId, distance)`. */
	distance: number
	/**
	 * How far this enemy is standing to the side of its lane, in tiles, **signed**: positive is the
	 * `(-sin θ, cos θ)` side of it, and `applyLateralOffset` in `core/path.ts` is where that sign is
	 * fixed once for every reader. 0 for everything but a
	 * Moth being pulled toward a light, and `enemyPosition` returns early on that 0.
	 *
	 * **`distance` is never touched by it.** The offset is perpendicular to the arc, so `FIRST`/`LAST`,
	 * `remainingToFridge`, the barricade projection and the leak check all keep reading the same float
	 * they always did -- which is the whole reason the one enemy that leaves the polyline does not
	 * need free movement (analytic-docs/DECISIONS.md section 3).
	 *
	 * State on the world rather than a derivation: the drift back is hysteretic -- it keeps going for
	 * two seconds after the light is gone -- and no function of `distance` alone can answer that.
	 */
	lateralOffsetTiles: number
	hp: number
	maxHp: number
	statuses: ActiveStatus[]
	tags: EnemyTag[]
	/** Tiles per tick, before status modifiers. Never tiles per second. */
	speed: number
	/**
	 * The wave this enemy was spawned by. Waves overlap (analytic-docs/DECISIONS.md section 5), so
	 * "wave 3 is cleared" has to be answerable while wave 4 is already walking, and no other field
	 * carries that. Set by the spawn system; step 5B is what reads it.
	 *
	 * **-1 for an enemy no wave spawned** -- a Fruit Fly hatched out of a rotting crumb. -1 matches no
	 * index, so waves clear on their own enemies and a fly blocks nothing. Attributing it to the
	 * current wave would make `emitClearedWaves` inconsistent: sometimes the fly holds that wave open
	 * until it leaks, sometimes the wave is already past the high-water mark and it does nothing.
	 */
	spawnedInWaveIndex: number
	/** Food ids a thief is carrying. Returned to the fridge if it dies before it leaves the map. */
	stolenItems: EntityId[]
	flags: Record<EnemyFlag, boolean>
}

/**
 * The charge machine's slot on a tower. Null for the towers that don't have a state machine, which
 * is most of them.
 *
 * Still one member after step 10A -- that step filled the machine in and did **not** add to the
 * union, and it stays a union of one so a second kind of state costs no call site. There is
 * deliberately no `phase` field: `chargePhase` in `core/systems/charges.ts` derives armed, rearming
 * and spent from the two numbers below, because a stored phase is a second truth that goes into
 * every save and every replay and can disagree with the counter it describes.
 */
export type TowerState = {
	kind: 'charge'
	/** Sticky Tape has 3, Fly Paper 2, Mousetrap 1. */
	charges: number
	/** 0 when nothing is rearming. A tower at 0 charges and 0 here can never fire again. */
	rearmTicksRemaining: number
}

export interface Tower {
	id: EntityId
	defId: DefId
	/** Tile coordinates. A tower occupies exactly one tile. */
	tile: Vec2
	hp: number
	maxHp: number
	/** 0 for a freshly placed tower, up to 3 (analytic-docs/CONTENT.md section 1, Upgrades). */
	tier: number
	targetingMode: TargetingMode
	/**
	 * The enemy this tower is currently shooting at, under its `targetingMode`. Null on placement and
	 * whenever nothing is in range. `targetingSystem` writes it and `combatSystem` reads it (step 6B);
	 * it is declared here because `placeTower` is what constructs a `Tower`.
	 */
	targetEnemyId: EntityId | null
	/** Ticks until this tower may fire again. */
	cooldownTicks: number
	/**
	 * How many times this tower has fired, ever. Counted in `core/systems/combat.ts` beside the
	 * cooldown, so a cone counts too, and read only by the `everyNthHit` filter on a status
	 * application -- the Ice Cube Tray's tier 3 freezes on every fourth hit.
	 *
	 * **An integer on `Tower` and not a second `TowerState` member.** `TowerState` is a union and a
	 * tower has one of them, so a shot count there would be mutually exclusive with the magazine it
	 * has to coexist with: the Mousetrap needs both.
	 */
	shotsFired: number
	state: TowerState | null
	/** Base plus every upgrade paid for. The sell refund is a percentage of this. */
	totalInvested: number
}

export interface Projectile {
	id: EntityId
	sourceTowerId: EntityId
	/** Null once the target is gone; the projectile flies on to where it was aimed. */
	targetEnemyId: EntityId | null
	/** Tile-space position, updated per tick. */
	position: Vec2
	/** Where it is headed, in tile space. */
	target: Vec2
	/** Tiles per tick. */
	speed: number
	damage: number
	damageType: DamageType
	/** 0 for a single-target hit. Above 0, the arrival resolves through `dealSplashDamage`. */
	splashRadiusTiles: number
	/**
	 * Which half of the roster the splash may catch, carried off the firing behaviour.
	 *
	 * It is on the projectile and not looked up from the tower on arrival, because a projectile
	 * routinely outlives the tower that fired it -- and the symptom of looking it up would be a
	 * ground-only splash silently hitting flyers.
	 */
	targets: TargetClass
	/**
	 * The statuses to land on arrival -- a slow lands when the ice cube gets there, not when it was
	 * fired, and the tower may have been sold in between.
	 *
	 * **Assigned by reference off the firing behaviour and never written through.** A behaviour
	 * descriptor is immutable content that outlives every world, and mutating this array would edit
	 * the tower def for the rest of the session.
	 */
	applies: readonly StatusApplication[]
	/**
	 * Hits left before it despawns, decremented per hit. 1 for every shot in the game today.
	 *
	 * It lives here and **not** on `AttackBehaviour`: no content sets it, and step 12's Tier 3
	 * upgrades are what own it. A field on the behaviour would mean a `schema.ts` entry nothing
	 * fills in.
	 */
	pierce: number
}

/**
 * A physical object on the board, not a number in a wallet -- the signature mechanic
 * (analytic-docs/DECISIONS.md section 4). Piles within ~0.7 tiles merge into one bigger pile.
 */
export interface Crumb {
	id: EntityId
	position: Vec2
	value: number
	/**
	 * A pile older than 20s is rotting (`isRotting`); at 35s it is consumed and hatches a Fruit Fly.
	 * Nothing raises spawn pressure: analytic-docs/DECISIONS.md section 4 says rot does, but v1 has no
	 * reader for such a value and tile state is step 14's.
	 */
	ageTicks: number
	/** The tower currently drawing this pile in, if any. Auto-collection takes travel time. */
	claimedByTowerId: EntityId | null
	/** Ticks left on that trip. Meaningless while `claimedByTowerId` is null. */
	travelTicksRemaining: number
}

/**
 * One cell that has something on it. Sparse: the world carries only the cells with live effects,
 * not the whole 24x14 grid.
 */
export interface TileState {
	tile: Vec2
	effects: TileEffect[]
}

export interface TileEffect {
	kind: TileEffectKind
	/** Negative means permanent -- mold corruption never expires. */
	remainingTicks: number
	magnitude: number
}

/**
 * One named item on a fridge shelf. The sting is specificity: the night-end summary lists what was
 * lost by name (analytic-docs/DECISIONS.md section 6), so this is never collapsed into a counter.
 */
export interface FoodItem {
	id: EntityId
	/**
	 * Which of `core/content/food.ts` this item is an instance of. Carried rather than derived back
	 * out of `nameKey`, because the glyph lives on the def and the renderer has to find 🍕 from
	 * something that survives a key being renamed.
	 */
	defId: DefId
	/** i18n key, never English. `core/` stores keys and `ui/` resolves them. */
	nameKey: string
	/** The thief carrying it. Null while it is safe on the shelf or already off the map. */
	heldBy: EntityId | null
	/** True once it has left the map with a thief or been eaten at the fridge. */
	lost: boolean
}

// --- night ------------------------------------------------------------------------------------

/** Spawn progress for one entry of a wave's composition. */
export interface WaveSpawn {
	enemyDefId: DefId
	/** Enemies of this entry still to spawn. */
	remaining: number
	/** The tick this entry spawns its next enemy on. */
	nextSpawnTick: number
	/**
	 * Ticks between two enemies of this entry, copied off the authored entry. Carried here because
	 * the spawn system advances `nextSpawnTick` by adding it, and the authored wave is not in reach
	 * of a system that only has the world.
	 */
	spacingTicks: number
	pathId: string
}

/** The runtime half of a wave. The composition it was built from lives in `core/content/nights.ts`. */
export interface Wave {
	index: number
	spawns: WaveSpawn[]
	startedAtTick: number
}

/**
 * Waves are player-triggered: after the last enemy of a wave spawns, `countdownTicks` runs and
 * calling early banks the remainder as bonus crumbs (analytic-docs/DECISIONS.md section 5).
 */
export type NightPhase = 'building' | 'wave' | 'countdown' | 'won' | 'lost'

export interface NightState {
	nightId: DefId
	waveIndex: number
	waveCount: number
	phase: NightPhase
	/** Ticks until the next wave starts on its own. Zero outside `countdown`. */
	countdownTicks: number
	wave: Wave | null
	/**
	 * Reset every night. This is the health bar (analytic-docs/DECISIONS.md section 6).
	 *
	 * A stolen item is marked `lost`, **never spliced out** -- the night-end summary lists what you
	 * lost by name, and a spliced array cannot answer that. So "the fridge is empty" is
	 * `food.every(item => item.lost)` and never `food.length === 0`, which is never true.
	 */
	food: FoodItem[]
	/**
	 * Ticks of countdown the player skipped by calling waves early, summed over the night. Step 20's
	 * grocery award reads it and divides by 60 once, at the point it needs seconds.
	 */
	ticksSkippedTotal: number
	/**
	 * Crumb **value** dropped on the floor tonight, summed -- never a count of piles. Merging changes
	 * how many piles there are and not how much they are worth, so a ratio of pile counts would
	 * measure nothing. Tower income is not counted here: cleanliness measures litter left on the
	 * floor, and a payout was never on the floor.
	 *
	 * analytic-docs/CONTENT.md section 8's `cleanliness = 40 x (crumbsCollected / crumbsDropped)` is
	 * the consumer, and step 20 is what reads it.
	 */
	crumbsDropped: number
	/** The same currency as `crumbsDropped`: summed value, through either collection door. */
	crumbsCollected: number
	/**
	 * Enemies killed tonight, incremented where `resolveSystem` pushes `enemyKilled`. The night-end
	 * summary shows it and step 20's scoring reads it.
	 *
	 * A tally kept in the UI off `world.events` would count nothing on a replay, could not be
	 * asserted in a spec, and would not exist for the balance harness at all.
	 */
	enemiesKilled: number
	/**
	 * High-water mark for `waveCleared`: every wave up to and including this index has had the event
	 * emitted. Starts at -1. A mark rather than a set, because waves always start in order and a
	 * cleared wave never un-clears -- and without it the obvious implementation emits `waveCleared`
	 * every tick for the rest of the night.
	 */
	clearedThroughWaveIndex: number
}

/**
 * analytic-docs/DECISIONS.md section 8. Live from night 1 with a generous cap so the mechanic
 * teaches itself before anything dangerous is unlocked.
 */
export interface NoiseState {
	level: number
	cap: number
	/** 1.5/sec by default, stored per tick. Never per second -- see the header of this file. */
	decayPerTick: number
	/** Whether the meter has filled at any point tonight. The no-wake bonus reads this. */
	hasFilled: boolean
}

/**
 * The tier's id **and its resolved multipliers**, so a replay is not at the mercy of a later
 * balance patch changing what 'nightmare' means (analytic-docs/CONTENT.md section 9).
 */
export interface Difficulty {
	id: DifficultyId
	enemyHpMult: number
	enemyCountMult: number
	crumbIncomeMult: number
	startingCrumbs: number
	foodItemsMult: number
	noiseCap: number
	groceryMoneyMult: number
}

// --- events -----------------------------------------------------------------------------------

/**
 * What happened during the tick that just ran. This is not a log, it is one tick's worth.
 *
 * **Cleared at the *top* of `tick()`**, before any system runs, so the events a tick produced
 * survive until the start of the next one -- which is exactly the window a consumer runs in. A
 * system running last could not both publish this tick's events and clear them.
 *
 * The consequence for a consumer: at 2x or 3x speed the loop runs several ticks between two frames,
 * so it has to accumulate after every `tick()` call rather than read `world.events` once a frame.
 *
 * Later steps add members.
 */
export type GameEvent =
	| { kind: 'enemyKilled'; enemyId: EntityId; defId: DefId; at: Vec2 }
	| { kind: 'enemyLeaked'; enemyId: EntityId; defId: DefId; stolenItems: EntityId[] }
	/** `noise` is step 13's meter. Emitted from step 6B, consumed then. */
	| { kind: 'towerFired'; towerId: EntityId; defId: DefId; noise: number }
	/**
	 * `amount` is the **resolved** damage -- already through the tag matrix and the status
	 * multipliers -- because that is what 6C's damage numbers show and what a balance report adds
	 * up. `at` is tile coordinates like everything else in `core/`.
	 */
	| { kind: 'enemyDamaged'; enemyId: EntityId; sourceTowerId: EntityId; amount: number; at: Vec2 }
	| { kind: 'towerPlaced'; towerId: EntityId; defId: DefId; tile: Vec2 }
	| { kind: 'towerSold'; towerId: EntityId; refund: number }
	/**
	 * A tower killed rather than sold or spent. It carries the `tile` because 10C draws the puff
	 * where the tower stood, and the `defId` because that puff needs the glyph -- by the time anyone
	 * reads the event the tower is out of `world.towers` and neither can be looked up.
	 *
	 * There is no `towerDamaged`: nothing consumes one, the HP bar reads `tower.hp`, and a member
	 * here is added by the step that reads it.
	 */
	| { kind: 'towerDestroyed'; towerId: EntityId; defId: DefId; tile: Vec2 }
	| { kind: 'crumbCollected'; crumbId: EntityId; value: number; byTowerId: EntityId | null }
	| { kind: 'waveStarted'; waveIndex: number }
	| { kind: 'waveCleared'; waveIndex: number }
	| { kind: 'noiseFilled' }
	| { kind: 'nightEnded'; won: boolean }

// --- world ------------------------------------------------------------------------------------

/**
 * A lookup cache over the entity arrays: entity id to its index in the matching array.
 *
 * It is a cache, which means it is wrong the instant an array changes shape. **Whoever removes an
 * entity rebuilds the map for that array** -- splicing an element shifts every index after it, and
 * a stale index here reads out as the wrong enemy rather than as a crash. Steps 5, 6 and 7 all
 * remove entities.
 */
export interface EntityIndex {
	enemies: Record<EntityId, number>
	towers: Record<EntityId, number>
	projectiles: Record<EntityId, number>
	crumbPiles: Record<EntityId, number>
}

/**
 * The entire simulation. Plain and serialisable end to end: `(seed, mapId, nightId, commandLog)`
 * reproduces any session, and that only works if the world survives a JSON round-trip unchanged.
 *
 * Never wrap this in `ref()` or put it in a Pinia store. Deep reactivity over hundreds of entities
 * mutated 60 times a second destroys the frame budget (analytic-docs/ARCHITECTURE.md section 5).
 */
export interface World {
	/** Completed ticks. Integer, and the only clock `core/` has. Starts at 0. */
	tick: number
	/** The seed the world was built from, kept so a bug report can carry it. */
	seed: number
	/** Plain state, not a bound `Rng`. Systems call `bindRng(world.rng)` to use it. */
	rng: RngState

	enemies: Enemy[]
	towers: Tower[]
	projectiles: Projectile[]
	crumbPiles: Crumb[]
	/** Sparse -- only the cells with live effects. */
	tiles: TileState[]
	index: EntityIndex
	/** Monotonic. Never reused, even after an entity is removed. */
	nextEntityId: EntityId

	/** The in-night wallet. `crumbPiles` are the things on the board; this is what they pay into. */
	crumbs: number
	/** The metagame currency. Earned at night end from performance, never converted from crumbs. */
	groceryMoney: number
	noise: NoiseState

	map: MapDef
	night: NightState
	difficulty: Difficulty

	/** One tick's worth, not a log. See `GameEvent`. */
	events: GameEvent[]
}

// --- the serialisability guard ------------------------------------------------------------------

/**
 * Maps a type onto itself, except that any function-typed member becomes `never`. Applied to
 * `World` in `tests/types.spec.ts`: the assertion there stops compiling the moment a method, a
 * getter returning a callback, or a `Map`/`Set` sneaks onto any entity.
 *
 * The function check comes first because a function is also an object.
 */
export type Serialisable<T> = T extends (...args: never[]) => unknown
	? never
	: T extends object
		? { [K in keyof T]: Serialisable<T[K]> }
		: T
