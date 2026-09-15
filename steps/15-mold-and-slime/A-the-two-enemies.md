# Step 15A — The two enemies, and what they write on the board

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/CONTENT.md` §2 (the Mold and Slug rows, and
the two paragraphs under the table) and §3 (the `fungal`, `slime` and `soft` rows only),
`../../analytic-docs/DECISIONS.md` §11.
**Prereq:** step 14.

## Goal

Mold, which never walks and permanently eats your build space, and the Slug, which paves a 1.6× road
for whatever is behind it. Both are config objects plus one general system that reads one new def
field. Entirely headless — nothing looks any different until 15C, and you will be reading specs
rather than a board. Every assertion about *writing* a tile lives here; 15B owns taking one off
again.

## Before anything else: check what step 14 actually shipped

This part was written against step 14's step file rather than against its code. Fifteen minutes, up
front, so you build against the real thing:

1. **The cell state and the calls.** `getTile`, `setState`, `clearState`, `hasState`,
   `forEachTileWithState(kind, fn)`, `neighbours(index, includeDiagonals)` — real names, real
   signatures, and whether a cell's payload is `{ intensity, expiresAtTick }`-shaped or the
   `TileEffect { kind, remainingTicks, magnitude }` that `core/types.ts:341` declares. **Use what is
   there.** Everything below names the second shape because that is what is committed today; if step
   14 changed it, use its names and correct this file in the same commit.
2. **`worldToTile`.** Step 14's build item 4 names it. If it exists, use it. If it does not, add it
   to `core/map.ts` (which already owns `flagsAt` and the row-major index) — **not** to
   `core/systems/tiles.ts`, which this step may not change.
3. **Does `movementSystem` already read `slime`?** Step 14's build item 4 says it does. If it does,
   build item 5 below is only the magnitude and the one exemption. If it does not, you are writing it.
4. **Does `tilesSystem` advance a staged effect?** Step 14's build item 3 says it advances mold's
   stage. 15C draws the three stages off it. If it does not, add it to step 14's file and note it.

If any of those four is missing rather than renamed, that is step 14 under-built. Fix it there, in
step 14's files, and say so in this session's closing notes — do not grow a second grid in
`core/systems/spread.ts`.

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/types.ts:78` | `TileEffectKind = 'heat' \| 'slime' \| 'mold' \| 'residue' \| 'scorch'` — declared step 2A, **written by nothing** |
| `core/types.ts:336` | `TileState { tile, effects: TileEffect[] }`, `TileEffect { kind, remainingTicks, magnitude }`, and `World.tiles: TileState[]`, sparse. `remainingTicks` negative is permanent |
| `core/types.ts:37` | `EnemyTag` already has `'spreads'`, `'fungal'`, `'slime'`, `'soft'` — no tag work to do |
| `core/content/matrix.ts:50,46,52` | `fungal`, `soft` and `slime` rows already transcribed. **Nothing to add to the matrix** |
| `core/systems/spawn.ts:128` | `spawnEnemyAt(world, def, pathId, distance, waveIndex)` — the one `Enemy` constructor. `spawnEnemy` calls it with `distance: 0` |
| `core/systems/spawn.ts:44` | `cursorsFor(world, entry, count)` — round-robins an entry with no `pathId` over every lane, throws for a lane the map lacks |
| `core/systems/movement.ts:43` | `enemy.distance += enemy.speed * speedMultiplier(enemy)`. No tile read today unless step 14 added one |
| `core/systems/placement.ts:27` | `PlacementRejection` — **nine** literals since step 14A, including `'fouled'`, and `canPlaceTower` already refuses a cell whose tile state blocks placement. It reads `world.map` (its own clone) rather than `getMapDef` |
| `core/systems/resolve.ts:124` | the night is won on `lastWaveIsOut && world.enemies.length === 0`, and a wave clears on `world.enemies.some(e => e.spawnedInWaveIndex === index)` in `wave.ts:65` |
| `core/sim.ts:28` | `SystemName` and `SYSTEMS`; `tiles` is 12th, after `projectiles` and before `crumbs`. `tests/sim.spec.ts` asserts the order against a literal list |
| `core/map.ts:26`, `core/world.ts:58` | ~~wrong comments saying mold sets a `TileFlags` bit~~ — **both corrected in step 14A**. They now point at `world.tiles` and `blocksPlacement`. Decision 1 below still holds; there is nothing left to fix |
| `render/renderer.ts:168` | `// tile effects: step 15` — the layer is step 14's. Correct the attribution while you are in the file; draw nothing |

**The specs that will break.** Decision 4 adds a field to `Enemy`, and **eleven spec files hand-build
one**: `barricades:50`, `charges:75`, `combat:61`, `crumbs:~46`, `hitbox:55`, `light:76`, `night:37`,
`noise:47`, `status:48`, `upgrades:76` and `:103`, `viewModel:~435`. Each is one line. Adding the
field to `spawnEnemyAt` and then discovering twelve `type-check` failures mid-build is the thing this
row exists to prevent — do them first, in one pass, then start.

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **Mold and slime live in `world.tiles`, never in `MapDef.flags`.** `../../analytic-docs/DECISIONS.md`
   §11 is explicit, `TileEffectKind` has carried `'mold'` since step 2A, and the whole point of step
   14 is that there is one place. A flag bit would be a second truth that `canPlaceTower` and the
   renderer could disagree about, and it could not carry the 8-second expiry slime needs. The two
   comments in `core/map.ts` and `core/world.ts` that say otherwise predate step 14 and are wrong;
   correct them both, naming tile state.
2. **A tile writer is a field on the def, not a branch on a tag.** `core/systems/light.ts` reads
   `light-drawn` by name and `core/content/enemies.ts:160` calls that out as *the* exception; a
   second one starts a pattern. And a tag could not carry the interval, the magnitude or the
   duration, so a tag-driven version needs a numbers table somewhere anyway.
3. **One writer field with two modes, not two mechanics.** `trail` (write the tile under the enemy)
   and `spread` (grow the region by one neighbour) are the same three numbers with a different
   candidate rule, and step 17's Burner plus Act III's Snail both want one of the two. Two bespoke
   implementations would be two places for "refresh the expiry" to be got wrong.
4. **The schedule is `Enemy.nextTileWriteTick`, and it advances by `+= intervalTicks`** — never
   `world.tick + intervalTicks`. Exactly `WaveSpawn.nextSpawnTick`'s rule in
   `core/systems/spawn.ts:189`, for exactly its reason: the two agree until a pulse is missed, and
   then the second drifts for the rest of the night. The alternative — `world.tick % interval` and no
   field — costs nothing to write and makes every mold on the board pulse on the same frame, and
   gives a mold spawned at tick 350 a first pulse ten ticks later.
5. **Spread is orthogonal only.** Four neighbours, never eight. A blob that grows on the diagonal
   reads as scattered noise at 48px per tile; one that grows orthogonally reads as creeping, which is
   the entire legibility requirement in 15C. If step 14's `neighbours` takes an `includeDiagonals`
   flag, pass `false`.
6. **One `rng.int()` per pulse, over a candidate set that was filtered first.** Never "roll a
   neighbour, re-roll if it is already molded or blocked" — the number of draws would then depend on
   the board, every other consumer of `world.rng` for the rest of the night would shift, and
   `(seed, mapId, nightId, commandLog)` would stop reproducing a session while every spec still
   passed. Build the array, then draw once.
7. **Mold's `speedTilesPerTick` is 0, and `core/systems/movement.ts` is not touched for it.**
   `enemy.distance += 0 * multiplier` is already "never moves", the leak check at
   `core/systems/resolve.ts:100` is already "never reaches the fridge", and `FLEE_SPEED_MULT` on a
   wake is already 0. `../../analytic-docs/CONTENT.md` §2 lists a speed of 0.15 for it *and* says in
   the paragraph below that it does not walk; the paragraph wins, and the 0.15 is a leftover.
8. **A tile effect never applies to an enemy whose own def writes that kind.** Otherwise the Slug
   slimes the tile it is standing on and speeds *itself* up by 60%, and the authored 0.4 tiles/sec
   that `CONTENT.md` §2 and the balance sheet both carry becomes 0.64 in practice — a silent
   mismatch nobody would think to look for. Keyed off `def.tileWriter.effect`, not off an id or a
   tag, so it is one predicate and Act III inherits it. Consequence worth knowing: two Slugs do not
   speed each other up either, which is correct — the trail is a gift to the wave *behind*.
9. **A wave entry may author where along the lane its enemies appear:
   `WaveEntry.startDistanceTiles`, default 0.** Without it every Mold in the game spawns at
   `distance: 0`, which is the baseboard crack, which is the far end of the board from anything worth
   taxing — and every mold of a wave lands on the same tile. Optional and defaulted, so no existing
   night changes and no existing spec moves.
10. ~~**`PlacementRejection` gains `'molded'`**, a ninth literal.~~ **Already shipped, and named
    `fouled`.** Step 14A added the ninth literal, the `blocksPlacement` check in `canPlaceTower` and
    the English under `hud.reject`. It is `fouled` rather than `molded` because the rest of that
    vocabulary is generic and a reason named after one content entry has to be renamed when the second
    one arrives (step 14A, build item 5). The reasoning below still holds — it is not folded into
    `notBuildable`, because the player has to be able to tell "you can't build there" from "you let
    that happen". Nothing to do here but read the reason as `'fouled'` wherever this file says
    `'molded'`.
11. **Two new `SYSTEM_ORDER` slots, both added here: `spread` and `cleanse`**, in that order,
    immediately before `tiles`. Everything that writes or erases a cell runs before the system that
    ages them, which reads in one direction. **`core/systems/cleanse.ts` ships as a stub this
    session** — an empty body and a comment naming 15B — exactly as `tiles.ts` and `noise.ts` were
    stubbed before their steps. Adding both slots in one sitting means `core/sim.ts` and
    `tests/sim.spec.ts` are edited once rather than twice a week apart.
12. **The mold's 6-second interval and the slug's 8-second slime are drafts.** Author them, don't
    tune them: 15C watches a night and re-tunes both, in this file's defs and in whatever spec pins
    them. Judging a creep rate with no renderer is judging it by reading JSON.

## Build

### 1. `EnemyDef.tileWriter` — `core/content/schema.ts`

Optional, on the enemy schema beside `tags`:

```
tileWriter?: {
  effect: TileEffectKind
  mode: 'trail' | 'spread'
  magnitude: number
  durationTicks: number      // -1 permanent, matching TileEffect.remainingTicks
  intervalTicks: number      // >= 1
}
```

Bound every number the way this file bounds every other one (`core/content/schema.ts:55` has the
reasoning): `durationTicks` as `int().min(-1).max(MAX_TILE_EFFECT_TICKS)` — the same pair the
`tileEffect` behaviour already uses at `schema.ts:346`, so a millisecond value is rejected in both
places by the same bound — and `intervalTicks` as `int().min(1).max(MAX_TILE_EFFECT_TICKS)`.

`EnemyDef` is `z.infer`red, so there is no second declaration to keep in step. Nothing needs adding
to `core/types.ts` except decision 4's field.

### 2. `core/systems/spread.ts`

One loop over `world.enemies`, skipping the ones whose def has no writer and returning early in the
terminal phases the way every other system does (`movement.ts:31`). Bind the rng once, not per enemy.

For a due enemy (`world.tick >= enemy.nextTileWriteTick`), pick the cell:

- **`trail`** — the tile under the enemy, `worldToTile(enemyPosition(world, enemy))`. Write
  unconditionally; a repeat write on a cell that already has the effect **refreshes its expiry**
  rather than appending a second one, which is what makes the trail decay from the back.
- **`spread`** — if the enemy's own tile has no `mold`, that tile is the *only* candidate. Otherwise
  candidates are every on-board, non-`BLOCKED`, not-already-`mold` orthogonal neighbour of every cell
  that has `mold`. If any candidate is `TRACK`, the candidate set becomes only those. Then one
  `rng.int(candidates.length)`.

Then `enemy.nextTileWriteTick += writer.intervalTicks`.

Gotchas, in the order they will bite:

- **The tile under a position is `Math.round`, not `Math.floor`.** Waypoints are tile coordinates
  with integers on **tile centres** (`core/types.ts:96`), so `(3.0, 4.0)` is the middle of tile 3,4.
  `render/tileCoords.ts:49` floors because it works in grid space, where integers are corners — do
  not copy it. The symptom of flooring is a slime trail offset half a tile up and left of the slug
  that laid it, which looks like a rendering bug and is not one.
- **The own-tile case has to win.** Without it, the second Mold of the night takes root next to the
  *first* mold's patch instead of where it landed, because every molded cell is in the candidate set.
  With it, "spawns on a track tile" is true for every mold and the region is never empty.
- **Candidate order must be stable.** Walk cells in row-major index order and neighbours in a fixed
  order, dedupe, then draw. A set built by iterating a `Map` or a sparse array in insertion order
  will reproduce today and stop reproducing the first time a cell is cleared and re-written — which
  is exactly what 15B's Vinegar Spray does.
- **Killing the entity stops the spread, and nothing cleans up after it.** That is the mechanic, and
  it is free: `resolveSystem` removes the enemy and the cells are permanent. There is no code to
  write here; there is a test.

### 3. The two defs — `core/content/enemies.ts`

Both from `../../analytic-docs/CONTENT.md` §2, through this file's existing `tilesPerSecond` and
`damagePerSecond` helpers, and both appended to `ENEMIES` (never reordered).

**Mold** — 🟢, 40 HP, speed **0**, reward 12, steals **0**, `['ground', 'spreads', 'fungal']`.
`meleeDamagePerTick: damagePerSecond(4)`, this file's `hp / 10` convention: it is required by the
schema and, being motionless, mold only ever reaches a Cardboard Box if one is placed inside the hold
gap in front of it. Writer: `{ effect: 'mold', mode: 'spread', magnitude: 1, durationTicks: -1,
intervalTicks: 360 }`. The `magnitude: 1` is the **stage** 15C draws — see the pre-flight check.

**Slug** — 🐌, 45 HP, `tilesPerSecond(0.4)`, reward 11, steals 2,
`['ground', 'slime', 'soft']`, `meleeDamagePerTick: damagePerSecond(4.5)`. Writer:
`{ effect: 'slime', mode: 'trail', magnitude: 1, durationTicks: 480, intervalTicks: 1 }`.

Write the comment that says what the tags cost, the way every def in this file does. Mold is
`fungal`: **0.2× physical and 2.5× chemical**, and a player who has only built Salt Shakers should
find it close to immovable. The Slug is `slime` **and** `soft`, and the product is what matters —
chemical is `1.5 × 2.0 = 3.0`, cold is `1.0 × 0.5 = 0.5`. Freezing a slug is a mistake and the
comment should say so; 15B and 16 are where that becomes assertable end to end.

### 4. `WaveEntry.startDistanceTiles` — `core/content/schema.ts`, `core/systems/spawn.ts`

Optional, `min(0)`, defaulted to 0 in `cursorsFor`, carried onto `WaveSpawn` and passed through to
`spawnEnemyAt`'s existing `distance` argument. Four lines. No night authors one yet — 15C does.

Gotcha: it has to be clamped to the lane's `totalLength`, or a typo puts an enemy past the fridge and
`resolveSystem` eats it on the tick it spawns. Throw with the night id rather than clamping silently,
the way `cursorsFor` already throws for a lane the map does not have.

### 5. `movementSystem` reads `slime` — `core/systems/movement.ts`

If step 14 built this, you are authoring the multiplier and decision 8's exemption only.

**1.6×, multiplied onto `enemy.speed * speedMultiplier(enemy)`** — a separate factor from the status
multiplier, not folded into it: `speedMultiplier` is the status stack and `core/systems/barricades.ts:174`
recomputes this tick's step from it to find where an enemy stood before. If the tile factor is not
applied identically in both places, an enemy on slime snaps backwards at a Cardboard Box. Look at
that line while you write this one.

Two things it must not do: apply to a flyer (step 14's one check, in one place), and apply to an
enemy whose own `tileWriter.effect` is `slime` (decision 8).

### 6. ~~`canPlaceTower` refuses a molded tile~~ — **done in step 14A, nothing to build**

The check after `canPlace` and before `towerAt` is already there, as
`if (blocksPlacement(world, tile)) return rejected('fouled')`, with the ninth `PlacementRejection`
literal and its English under `hud.reject`. It is driven by `TileEffectDef.blocksPlacement` rather
than by mold, which is what makes this item a config entry — mold's def already says `true`. It
applies to `path_only` too, because the check is before the placement branch: a molded track tile
takes no Cardboard Box either.

What remains for this session is only to **confirm it**: `tests/tiles.spec.ts` asserts `fouled` and
the stranded tower already, so a duplicate spec here is coverage of the same branch twice.

Gotcha, still worth knowing: a tower **already standing** on a tile that becomes molded survives —
there is no code to write, because nothing re-validates placement. The consequence the player meets
is selling that tower and then being unable to rebuild on the same tile, which is the board-space tax
working.

### 7. Two new slots, and three wrong comments

`core/sim.ts` gains `spread` and `cleanse` before `tiles`, in `SystemName`, in `SYSTEMS`, and in the
order comment above `tick()`; `tests/sim.spec.ts`'s literal list gains both. `core/systems/index.ts`
exports both. `core/systems/cleanse.ts` is a stub with an empty body and a comment saying 15B owns it.

Then fix `core/map.ts:26`, `core/world.ts:58` and `render/renderer.ts:168` per decision 1 and the
index's note. A step file that lies is worse than one that is out of date, and so is a comment.

## Tests

- A Mold's first pulse molds **its own tile** and nothing else, even with another mold's patch
  already on the board.
- A subsequent pulse molds exactly one tile, always orthogonally adjacent to a cell that already has
  mold, never one that already has it, never a `BLOCKED` one, never off the board.
- Given a choice between a `TRACK` candidate and a non-track one, it takes the track one.
- Two worlds from the same seed spread to the same cells in the same order over 40 pulses. Then: a
  world in which a molded cell is cleared and re-written mid-run still matches a replay of its own
  command log — the assertion that catches decision 6's "re-roll until valid".
- Removing the mold entity stops the spread; the cells it already wrote are still there 600 ticks
  later.
- `canPlaceTower` on a molded tile is `{ ok: false, reason: 'fouled' }` for both `off_path` and
  `path_only`; a tower placed before the tile was molded is still in `world.towers` afterwards.
- A Slug writes `slime` to each tile it crosses; a tile it crosses twice has one effect with a
  refreshed expiry, not two.
- An enemy on a slimed tile advances at exactly `speed * 1.6` — the Slug that wrote it does not, and
  a flyer over it does not.
- The cell expires on **exactly** tick `written + 480`, and the enemy's step on that tick is back to
  `speed`. Not one tick either side.
- Mold at `speed: 0` is still at `distance: 0` after 3600 ticks and has emitted no `enemyLeaked`.

The fixture at `tests/fixtures/world.ts` is **40 × 1 tiles** — a board with no vertical neighbours,
on which every spread assertion is degenerate. Build the spread specs their own map rather than
widening the shared fixture, which eleven other suites are calibrated against.

## Acceptance

- [ ] `core/systems/tiles.ts` is unchanged by this session. If it isn't, say in the commit message
      what was missing from it and why the fix belonged there.
- [ ] Adding either enemy required no branch on an enemy id anywhere in `core/systems/`.
- [ ] `core/` still imports nothing but itself and zod.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 15B and 15C

These are the contract the next two sessions build against. If you change a signature, change it here
too.

```
core/content/schema.ts   EnemyDef.tileWriter?: { effect, mode: 'trail' | 'spread',
                                                 magnitude, durationTicks, intervalTicks }
                         WaveEntry.startDistanceTiles?: number   // default 0
core/content/enemies.ts  mold: EnemyDefOf<'mold'>
                         slug: EnemyDefOf<'slug'>
core/types.ts            Enemy.nextTileWriteTick: number
core/map.ts              worldToTile(at: Vec2): Vec2   // Math.round, tile centres — if step 14 has
                                                       // no such export
core/systems/cleanse.ts  cleanseSystem(world: World): void   // a stub; 15B fills it in
core/sim.ts              SystemName gains 'spread' and 'cleanse', both before 'tiles'
core/systems/placement.ts  PlacementRejection gained 'fouled' in step 14A — nothing to add
```

A mold cell carries its **stage in `TileEffect.magnitude`**, written at 1 and advanced by step 14's
`tilesSystem`. 15C draws three visible steps off it. A slime cell carries `magnitude: 1` and a
counting-down `remainingTicks`; there is nowhere that records what it counted down *from*, which is
15C's problem and is why that part fades over a fixed number of final ticks rather than a fraction.

## Do not

Author a night — 15C owns nights 11, 12 and 15, and a mold entry written here would be re-tuned
there anyway. Do not build the Vinegar Spray, the Baking Soda or the `cleanse` behaviour: 15B owns
all three, and this session ships the empty system file and nothing else of them. Do not draw
anything; `render/` gets one comment corrected and no pixels. Do not implement "damp night" or the
Pantry Shelf Liner — the first is step 21's modifier system and the second is step 20's
installations, and the 360-tick interval authored here is the number both of them will later patch.
