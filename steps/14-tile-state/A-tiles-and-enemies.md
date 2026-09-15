# Step 14A — The tile system

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../../CLAUDE.md`, `../../../analytic-docs/DECISIONS.md` §11 (the standing rule
about tiles — it is §11, not §10; §10 is Loadouts).
**Prereq:** step 13.

## Goal

The board holds state, ages it, and applies it to whatever is standing on it. Entirely headless —
nothing is drawn until 14B, and the only way to *see* any of this before then is a spec. Every test
step 14 has lives here, because this is the half that can silently be wrong.

## Already in the repo

Three steps have shipped pieces of this and left them inert. You are filling them in, not inventing
them.

| File | What's there now |
| --- | --- |
| `core/types.ts:336` | `TileState { tile: Vec2; effects: TileEffect[] }` and `TileEffect { kind; remainingTicks; magnitude }`. `remainingTicks` **negative means permanent** |
| `core/types.ts:78` | `TileEffectKind = 'heat' \| 'slime' \| 'mold' \| 'residue' \| 'scorch'` |
| `core/types.ts:576` | `World.tiles: TileState[]` — **sparse**: only the cells that have something |
| `core/systems/tiles.ts` | a one-line stub: `export function tilesSystem(_world: World): void {}` |
| `core/sim.ts:74` | `tiles` already has its slot in `SYSTEM_ORDER`, between `projectiles` and `crumbs` |
| `core/content/behaviours.ts:441` | `TileEffectBehaviour` + the `tileEffect()` factory, in `BEHAVIOUR_KINDS`, validated by `schema.ts:340`. **Nothing interprets it** — step 17 |
| `core/content/statuses.ts` | `STATUS_DEFS`, `applyStatuses`, `applyStatus`, `tickStatuses`, `speedMultiplier`. The table you are copying the shape of |
| `core/systems/combat.ts:37` | `applyDamage(_world, enemy, base, damageType)` — the no-event damage funnel every DoT and aura goes through. Its `_world` is unused and its comment says so |
| `core/systems/targeting.ts:51` | `isFlyer(enemy)`, whose docstring already names "step 14's tile effects" as a reader |
| `core/systems/spatial.ts:45` | `enemyPosition(world, enemy): Vec2 \| null` — "the hottest function in `core/`" |
| `core/systems/movement.ts:43` | `enemy.distance += enemy.speed * speedMultiplier(enemy)`, plus a `fleeing` branch above it that deliberately skips the multiplier |
| `core/systems/placement.ts:27` | `PlacementRejection`, eight members, and `canPlaceTower(world, def, tile)` |
| `tests/world.spec.ts:54` | asserts `world.tiles` is `[]` on a fresh world. Keep it passing |
| `tests/fixtures/world.ts` | `createTestWorld()`: a 40 × 1 board, tile 0 buildable-only, tiles 1–39 `BUILDABLE \| TRACK`, `night.phase: 'won'` |

**Three committed comments are wrong about this step and must be fixed in the same commit:**

- `core/systems/noise.ts:137` says the `tileEffect` interpreter "is step 14's". It is **step 17's**,
  with the Burner — see `steps/17-auras-and-zones.md` item 3. Change the comment; leave the code.
- `core/map.ts:26` says "step 15's mold sets its own bit here", i.e. in `MapDef.flags`. It does not:
  `DECISIONS.md` §11 says anything that touches a tile writes tile state, and mold is a
  `TileEffectKind`. Point the comment at `blocksPlacement` instead. (The rest of that sentence —
  "moving day" clearing `BUILDABLE` — is still true and stays.)
- `core/world.ts:58` says the world clones the map because "mold permanently corrupts" the build
  tiles. Same error, same fix — found while building, and named in step 15A's own table of wrong
  comments. "Moving day" is still a real reason for the clone and stays.

The test fixture's board is **one row tall**, so `neighbours` on it has at most two members. Any
spec about adjacency or radius needs its own map, not this fixture.

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **The model is the committed sparse `TileState[]`, not a flat `cols × rows` array.** The original
   step called for a flat row-major array plus a separately-maintained set of dirty indices. Those
   are two structures that can disagree, they put 336 `null`s into every save and every replay, and
   the sparse array already gives the property the dirty set was for: iterating it visits exactly the
   cells that have something. It is also already on `World` and already asserted by
   `tests/world.spec.ts`. Keep it.
2. **Lookup is a linear scan over `world.tiles`, with an early-out on `length === 0`.** `ARCHITECTURE.md`
   §6 budgets ~300 tile-state cells against ~200 enemies, and the same section says to add a spatial
   structure "when profiling says so, not before" — which is the standing ruling for
   `queryEnemiesInRange`'s O(towers × enemies) too. The empty case is the one the step's acceptance
   criterion measures, and the early-out answers it exactly. If a later step measures this hot, the
   sanctioned fix is a `Record<number, TileState>` keyed row-major, rebuilt at the top of the system
   every tick and **never stored on the world** — write it back into this file if you do it.
3. **Field names stay `magnitude` and `remainingTicks`.** The step file says `intensity` and
   `expiresAtTick`; the repo says otherwise, and so does every duration in the codebase
   (`cooldownTicks`, `rearmTicksRemaining`, `travelTicksRemaining`). `remainingTicks` also means the
   ageing rule can be *the same rule* as `tickStatuses`, which is decision 6.
4. **The kind is `residue`, not `chemical`.** `TileEffectKind` already says `residue`, `schema.ts`
   pins it, and `tests/schema.spec.ts` asserts the two agree. Beyond the cost of renaming: `chemical`
   is already a `DamageType`, and a `chemical` tile kind sitting next to a `chemical` damage type in
   the same expression is a wrong-field bug waiting for a tired evening.
5. **No `consumable` kind.** The step marks it post-v1 (Diatomaceous Earth) and it is not in the
   vocabulary. Adding a sixth kind nothing writes is a schema entry nothing fills in.
6. **What an effect *does* is a per-kind def table, `TILE_EFFECT_DEFS` in
   `core/content/tileEffects.ts`** — not per-cell fields. The step file put `damageType` and
   `sourceId` on the heat cell and `statusApplied` on the chemical cell; those are properties of the
   kind, not of the cell, and copying them into every cell means a save full of the same five values.
   Modelled on `STATUS_DEFS` exactly: every rule is a field on the def, so a sixth kind is a config
   entry and `tilesSystem` never grows a branch. It is **not** zod-validated and **not** in
   `validateContentInDev` — same reason `statuses` is absent from that call (see the comment at
   `core/content/index.ts:47`): it is a runtime table keyed by a vocabulary, which the type system
   already checks exhaustively.
7. **No `sourceId` on a cell.** Its only consumer would be kill attribution, which does not exist —
   and `applyDamage`, the funnel a continuous source already uses (`auraSystem` does exactly this),
   takes no source. *Built:* this costs one signature change — `applyStatuses`' `sourceId` parameter
   widens from `EntityId` to `EntityId | null`, which `ActiveStatus.sourceId` has always allowed. A
   null never matches `charges.ts`'s `status.sourceId === towerId`, which is the correct answer for a
   status nothing on the board is holding.
8. **Ageing is `tickStatuses`' rule, to the letter**: read first, decrement last, drop at `<= 0`,
   skip anything negative. Two ageing rules in one codebase is how a burn and a heated tile end up
   one tick out of step with nothing failing. Read `core/content/statuses.ts:302` and do that.
9. **Slime is a multiplier, and `TileEffectDef.magnitude` for a `speedMultiplier` effect is the
   multiplier itself (1.6), not a fraction removed.** Deliberately *not* `StatusDef`'s convention,
   where `magnitude` is the fraction of speed taken away: statuses only ever slow, tiles can speed
   up, and "a fraction removed of −0.6" is unreadable. Say so in the doc comment, because the two
   files sit next to each other.
10. **The model and the system are two files.** `core/tiles.ts` is the data and every pure read/write
    — a sibling of `core/map.ts` and `core/path.ts`, importing only types and the def table.
    `core/systems/tiles.ts` is the tick. This is not tidiness: `combat.ts` has to write scorch and
    `systems/tiles.ts` has to call `applyDamage`, and putting both in one file is an import cycle.
11. **A tile write is refresh-or-ignore, decided by the def (`onRewrite`).** `heat`, `slime` and
    `residue` refresh — same merge as `STACK_RULES.refresh`, because a Burner re-writing its own tile
    every `refreshIntervalTicks` must not expire on the first write's clock. `mold` and `scorch`
    ignore: both are permanent, `mold`'s `magnitude` is its growth stage, and a refresh would reset
    a fully-grown patch to stage 1 every time something wrote to it.
12. **Staging runs on the world clock** (`world.tick % stageTicks === 0`), like `AURA_INTERVAL_TICKS`
    and `economySystem`'s payouts. It needs no new field on `TileEffect`, nothing extra in the save,
    and a patch that appears mid-interval reaching stage 2 a fraction early is invisible against a
    two-second gap.
13. **Speed is read in `movementSystem`; damage and statuses are applied in `tilesSystem`.** The step
    file says movement reads tile state, but `movement` runs 5th and `tiles` runs 12th — so speed has
    to be read before the enemy moves and damage has to land where it ended up. Both go through the
    **one** `tileUnder(world, enemy)` helper, which is where the flyer check lives and therefore the
    only place it is written.
14. **Tiles do not touch flee speed.** A fleeing enemy is `speed * FLEE_SPEED_MULT` and nothing else,
    for the reason step 13A, decision 12 already gives: the rate at which the board empties is not
    negotiable. Heat and residue still apply to it — those are not speed.

## Build

### 1. `core/content/tileEffects.ts` — the def table

`TileEffectDef`, one entry per `TileEffectKind`, as a `Readonly<Record<TileEffectKind, TileEffectDef>>`
named `TILE_EFFECT_DEFS`. Fields, each with its reason in a doc comment:

```
kind              TileEffectKind
effect            'damageOverTime' | 'speedMultiplier' | 'none'   // how `magnitude` is read
damageType        DamageType | null        // what a damageOverTime tick resolves as
magnitude         number                   // the default a writer that names none gets
durationTicks     number                   // the default duration; negative is permanent
applies           readonly StatusApplication[]   // through `toApplications`, orthogonal to `effect`
blocksPlacement   boolean
stages            number                   // 1 never grows; mold's 3 is its visual progression
stageTicks        number                   // ignored when `stages === 1`
onRewrite         'refresh' | 'ignore'
```

The five entries. Every number here is a **default**, overridable at the write, and the numbers that
belong to a later step are transcribed rather than invented — say so on the line:

- `heat` — `damageOverTime`, `fire`, `14 / 60` per tick (the Burner's 14/s, `CONTENT.md` §1),
  duration ~2s, `refresh`.
- `slime` — `speedMultiplier`, magnitude `1.6`, duration `8 * 60` (step 15's numbers), `refresh`.
- `mold` — `none`, `blocksPlacement: true`, permanent, `stages: 3`, `onRewrite: 'ignore'`, magnitude
  `1` (stage 1).
- `residue` — `none`, `applies: toApplications(['poison'])`, duration ~6s, `refresh`.
- `scorch` — `none`, permanent, `onRewrite: 'ignore'`. Cosmetic: nothing in `core/` reads it back.

Add `export * from '@/core/content/tileEffects.ts'` to `core/content/index.ts`, next to the
`statuses` line. Do **not** add it to `validateContentInDev` — decision 6.

### 2. `core/tiles.ts` — the model and every read

Imports types and `TILE_EFFECT_DEFS`, and nothing else. This is what `combat.ts` and step 17's
interpreter get to import without pulling a system in behind it.

```
tileAt(position: Vec2): Vec2
neighbours(map: MapDef, tile: Vec2, includeDiagonals: boolean): Vec2[]
tilesInRadius(map: MapDef, centre: Vec2, radiusTiles: number): Vec2[]
tileStateAt(world, tile): TileState | null
effectAt(world, tile, kind): TileEffect | null
hasEffect(world, tile, kind): boolean
writeEffect(world, tile, kind, overrides?): TileEffect | null
clearEffect(world, tile, kind): boolean
forEachTileWithEffect(world, kind, fn): void
blocksPlacement(world, tile): boolean
```

**The gotcha that will cost you an afternoon if you miss it: `tileAt` is `Math.round`, not
`Math.floor`.** Entity positions in `core/` are the same space waypoints are in — *integers land on
tile centres* (`core/types.ts`, `Path.waypoints`), so tile `i` spans `[i - 0.5, i + 0.5)` and the
containing tile is the round. Flooring is the space `render/tileCoords.ts` works in, where integers
land on tile corners, and it is half a tile out here. The symptom is not an obvious break: enemies
take damage from the tile *behind* them about half the time, which reads as flaky rather than as an
off-by-one. Write the conversion once, here, and say in the comment why it is not `toTile`.

`neighbours` and `tilesInRadius` clamp to the board and never return an off-board tile — the same
guarantee `flagsAt` gives by answering 0.

`writeEffect` returns null off the board. On a cell that already carries the kind, it follows
`TILE_EFFECT_DEFS[kind].onRewrite`: `'ignore'` returns the existing effect untouched, `'refresh'`
takes `Math.max` of the remaining ticks and the last write's `magnitude` — `STACK_RULES.refresh`'s
rule, and for the same reason. *Built:* the max is `longerOf`, not a bare `Math.max`, because a
negative remaining is permanent and `Math.max(-1, 120)` would quietly put a clock on a permanent
effect. Permanent wins; everything else is the max.

Gotcha: `TileEffectBehaviour.durationTicks` is validated `min(-1)`, so **0 is a legal authored
value** and a write of 0 would be dropped by the very next ageing pass — an effect that exists for
no ticks at all. Treat a non-negative duration below 1 as 1 and note it, or step 17 authors a burner
that does nothing and the zod schema is perfectly happy.

`clearEffect` **releases the cell when its last effect goes** — splice the `TileState` out of
`world.tiles`, don't leave an empty `effects: []` behind. Two reasons, neither cosmetic: the empty
shells accumulate for the whole night and turn the linear scan into the grid sweep decision 2
promised it was not, and every one of them lands in the save.

`blocksPlacement` is `world.tiles`-driven, not mold-driven: it asks the def. That is the line that
makes step 15 a config entry.

### 3. `core/systems/tiles.ts` — the tick and the enemy pass

Replaces the stub. Runs in its existing `SYSTEM_ORDER` slot; do not move it.

```
tileUnder(world, enemy): TileState | null        // exported: movement.ts calls it too
tileSpeedMultiplier(world, enemy): number        // exported: movement.ts calls it
tilesSystem(world): void
```

- `tileUnder` is **the one flyer check in the codebase for this feature** — `isFlyer(enemy)` returns
  null before anything else happens. Its docstring in `targeting.ts:44` already predicts this caller.
  It then samples the position (`enemyPosition`) and rounds it (`tileAt`).
- `tilesSystem` returns early on a terminal phase, the way every other system does, and returns early
  on `world.tiles.length === 0` — that second one is the acceptance criterion about costing nothing.
  Then, in this order:
  1. For each enemy, `tileUnder`; apply `damageOverTime` effects through `applyDamage` (never
     `dealDamage` — a 0.23 heat tick would print a floating number over every enemy on the tile sixty
     times a second and blow `effects.ts`'s 32-number cap, exactly as `auraSystem` documents), and
     `applyStatuses` for whatever the def carries.
  2. Advance stages: for every effect whose def has `stages > 1`, on `world.tick % stageTicks === 0`,
     `magnitude = Math.min(magnitude + 1, stages)`.
  3. Age, last, after everything above has been read off: decrement every non-negative
     `remainingTicks`, drop at `<= 0`, and release any cell left with no effects.

  Gotcha on step 3: you are splicing out of two arrays while iterating them. Walk both backwards, the
  way `tickStatuses` does.

  Gotcha on step 1, found while building: `applyDamage` writes scorch onto the tile under whatever it
  damages, which for a heated cell is **the array the enemy pass is walking**. A `for...of` walks
  straight into the mark it just appended. Index against a length read once before the loop — it
  costs no allocation and leaves the new mark to the next tick.

  `damageType` for the DoT is the def's, and it goes through `applyDamage` → `resolveDamage`, so a
  `fungal` enemy standing in fire takes the matrix multiplier. That is the point of routing it here
  rather than subtracting from `hp`.

### 4. `core/systems/movement.ts` — slime

One factor on the existing line: `enemy.speed * speedMultiplier(enemy) * tileSpeedMultiplier(world, enemy)`.
`tileSpeedMultiplier` is exactly 1 when there is nothing under the enemy, when the enemy is a flyer,
and when the tile carries no `speedMultiplier` effect — so the common line is unchanged in value and
the early-out in `tileUnder` is what keeps it cheap. Several speed effects on one cell **multiply**,
matching the tag matrix's rule; there is only ever one today.

Leave the `fleeing` branch above it alone (decision 14), and put one line of comment there saying so
— it is the obvious place for a later session to "fix" by adding the factor.

### 5. `core/systems/placement.ts` — the mold gate

`canPlaceTower` asks `blocksPlacement(world, tile)` after `canPlace` and before the occupancy check,
and a new `PlacementRejection` member answers it. Name it **`fouled`**, not `molded`: the rejection
vocabulary is generic (`blocked`, `occupied`) and a reason named after one content entry is a
vocabulary that has to be renamed when the second one arrives.

**A ninth member breaks `type-check` until `ui/locales/en.ts` gains a line** — `RejectionMessages` in
`ui/locales/contentKeys.ts` is `Record<PlacementRejection, string>` precisely so it does. That is
working as designed; add the English under `hud.reject`, in the player's words like the other eight
("There is mould growing there." rather than "tile is fouled").

An **existing** tower on a tile that becomes molded is untouched — no destruction, no penalty, no
event. It is stranded, and deciding otherwise makes mold far too punishing. Nothing needs writing for
this; it needs a comment saying it was decided rather than forgotten.

### 6. `core/systems/combat.ts` — scorch, the proof the system is live

In `applyDamage`, a fire hit marks the tile under the enemy with `scorch`. That one line is the whole
of item 7's "so it isn't dead code this step": every burn tick since step 9 and every Toaster shot
since step 11 now leaves a permanent mark on the floor, from the night the step ships.

This is the call site that finally uses `applyDamage`'s `_world`, which the comment there has been
holding open since step 9. Rename the parameter.

Two gotchas, both about the hot path:

- **Test `damageType === 'fire'` before you compute anything.** `applyDamage` runs for every DoT tick
  of every enemy; `enemyPosition` is documented as the hottest function in `core/`, and calling it
  unconditionally puts a `samplePath` into every poison tick in the game.
- `writeEffect` on an already-scorched tile is an `onRewrite: 'ignore'` no-op, so a burning enemy
  standing still costs one scan and no allocation. It has to *stay* a no-op — if you later give
  scorch a duration, a burning ant becomes a per-tick allocator.

Import `writeEffect` from `@/core/tiles.ts`, never from `@/core/systems/tiles.ts` — the latter
imports `applyDamage` from this file and the cycle is why decision 10 splits them.

## Tests

`tests/tiles.spec.ts`, over `createTestWorld()` plus a purpose-built map where adjacency matters.

- An effect written with `remainingTicks: 3` is present and applied on exactly three ticks and absent
  on the fourth — asserted through a real consequence (hp lost / speed used), not by reading the
  field. This is the one that catches read-after-age.
- A permanent effect (`remainingTicks: -1`) is still there after 600 ticks and its `remainingTicks`
  has not moved.
- Two effects coexist on one cell and both apply: an enemy on a slimed, heated tile covers exactly
  `speed * 1.6` in the tick and loses the heat's per-tick damage **through the matrix** — assert a
  tagged enemy so a `resolveDamage` that got skipped shows up as the wrong number rather than as no
  number.
- A flyer crossing a heated tile takes zero damage, moves at its base speed over a slimed tile, and
  gains no statuses from a residue tile. One test, three assertions, because the flyer check is one
  branch and either all three hold or none do.
- Clearing the last effect on a cell removes the `TileState` from `world.tiles` entirely —
  `world.tiles` is `[]`, not `[{ effects: [] }]`.
- Writing and expiring effects on three cells over 600 ticks leaves `world.tiles.length` at most 3 at
  every point, and the world still survives a JSON round-trip deeply equal. This is what the step's
  "only dirty cells are visited" bullet is actually asking for: with a sparse array the visit count
  is true by construction, and the thing that can genuinely drift is the set growing.
- `tilesSystem` on a world with `tiles: []` leaves the world deeply equal to what it was, and a world
  with no tile state ticks 600 times without `world.tiles` ever becoming non-empty.
- A second `writeEffect` of `heat` onto a cell refreshes its duration to the longer of the two and
  takes the newer magnitude; a second `writeEffect` of `mold` onto a molded cell leaves its
  `magnitude` — its stage — where it was.
- `tileAt({ x: 3.4, y: 3.6 })` is `{ x: 3, y: 4 }`. A one-line test, and the one that fails loudly if
  somebody swaps in `Math.floor`.
- A molded tile refuses placement with reason `fouled`; a tower already standing there keeps its hp
  and stays in `world.towers` after the tile is molded.
- Fire damage resolved onto an enemy leaves `scorch` on the tile it was standing on; non-fire damage
  leaves nothing.

## Acceptance

- [x] `core/` still imports nothing but itself and zod; `core/tiles.ts` knows nothing about pixels,
      and nothing in `core/` imports `render/tileCoords.ts`.
- [x] `World` gained no field. Everything this step stores goes in the `tiles` array step 2 put there.
- [x] `tilesSystem` contains no branch on a `TileEffectKind` — every difference between the five kinds
      is a field on `TILE_EFFECT_DEFS`. If there is a `case 'mold':` anywhere, the table is missing a
      field; add the field.
- [x] A world ticked 600 times with no tile state is deeply equal to one that skipped the system.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 14B

These exports are the contract the next session builds against. If you change a signature, change it
here too.

```
core/tiles.ts             tileAt(position: Vec2): Vec2
                          neighbours(map: MapDef, tile: Vec2, includeDiagonals: boolean): Vec2[]
                          tilesInRadius(map: MapDef, centre: Vec2, radiusTiles: number): Vec2[]
                          tileStateAt(world: World, tile: Vec2): TileState | null
                          effectAt(world: World, tile: Vec2, kind: TileEffectKind): TileEffect | null
                          hasEffect(world: World, tile: Vec2, kind: TileEffectKind): boolean
                          writeEffect(world: World, tile: Vec2, kind: TileEffectKind,
                                      overrides?: { magnitude?: number; durationTicks?: number }): TileEffect | null
                          clearEffect(world: World, tile: Vec2, kind: TileEffectKind): boolean
                          forEachTileWithEffect(world: World, kind: TileEffectKind,
                                                fn: (state: TileState, effect: TileEffect) => void): void
                          blocksPlacement(world: World, tile: Vec2): boolean
core/content/tileEffects.ts
                          TILE_EFFECT_DEFS: Readonly<Record<TileEffectKind, TileEffectDef>>
core/systems/tiles.ts     tileUnder(world: World, enemy: Enemy): TileState | null
                          tileSpeedMultiplier(world: World, enemy: Enemy): number
```

14B reads `world.tiles` directly to draw it and calls `writeEffect` / `clearEffect` from the dev
brush. It adds nothing to `core/`.

## Do not

Draw anything — 14B owns every pixel, and there is no reason for this part to touch `render/` or
`dev/`. Do not interpret the `tileEffect` **behaviour**: that is step 17's, with the Gas Stove Burner
it exists for, and building it here means a loop over zero behaviours that step 17 then has to trust.
Do not author the Mold enemy, the Slug, or any tower — steps 15 and 17. Do not add a sixth
`TileEffectKind`. Do not give `scorch` a duration or a gameplay effect; it is a mark on the floor.
