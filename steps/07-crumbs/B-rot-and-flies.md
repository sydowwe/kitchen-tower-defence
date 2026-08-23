# Step 7B — Rot, and the Fruit Fly that hatches from it

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §4 (the *Rot* bullet) and §9
(change 1, *Fruit flies exist from night 1*), `../../analytic-docs/CONTENT.md` §2 (the Fruit Fly row
and the note under the table), `../../analytic-docs/OPEN-QUESTIONS.md` (*Crumb rot timings* and *The
fruit fly gap*).
**Prereq:** step 7A.

## Goal

The second door out of a crumb's life, and the one that costs you. A pile older than 20s is rotting;
at 35s it is consumed and a Fruit Fly hatches on the spot, joining the nearest track **mid-board**,
past most of your defences. Still headless — 7C is what puts any of it on screen. This part carries
the rot-timing, hatch and path-projection assertions.

Nothing in the game can target `air` until step 11, so on nights 1–7 a hatched fly is effectively
unkillable and walks to the fridge with one item. **That is intentional and it is the tutorial**: it
teaches the player to sweep before it teaches them to shoot.

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/systems/crumbs.ts` | 7A's `dropCrumb`, `collectCrumb`, `crumbById`, `crumbsSystem` — which already ages every crumb by a tick and **deliberately does nothing at any threshold**. `night.crumbsDropped` / `crumbsCollected` are 7A's ledger and you are the second writer to it |
| `core/types.ts` | `Crumb.ageTicks` with the comment "Rot starts raising spawn pressure at 20s and hatches a Fruit Fly at 35s". `Enemy.spawnedInWaveIndex` — "The wave this enemy was spawned by", read by `emitClearedWaves` |
| `core/path.ts` | `samplePath(path, distance)`, `totalLength(path)`, `remainingToFridge(path, distance)`, and a module-level `WeakMap<Path, PathTable>` holding the cumulative arc-length array. **The table is already built and cached — reuse `tableFor`, do not walk the polyline again** |
| `core/systems/spawn.ts` | `startWave(world, night, waveIndex)` and `spawnSystem(world)`. `spawnEnemy(world, spawn, waveIndex)` is **module-private**: it sets `distance: 0`, applies `world.difficulty.enemyHpMult`, copies `def.tags` (never aliases them), and indexes the enemy |
| `core/systems/wave.ts` | `emitClearedWaves` — `world.enemies.some(e => e.spawnedInWaveIndex === index)` blocks the `waveCleared` event, and `clearedThroughWaveIndex` is a high-water mark that never goes back |
| `core/systems/resolve.ts` | wins the night on `lastWaveIsOut && world.enemies.length === 0`, and leaks an enemy at `distance >= totalLength(path)`, taking `getEnemyDef(defId).steals` items |
| `core/systems/targeting.ts` | `isTargetable(enemy, targets)` already excludes `air` for a `targets: 'ground'` attack, and the Salt Shaker is ground-only. **The fly is already unkillable; you do not have to arrange it** |
| `core/content/enemies.ts` | `ant`, `roach`, `tilesPerSecond(speed)`, the `EnemyDefOf<Id>` key-deriving type, `ENEMIES` |
| `core/content/schema.ts` | `speedTilesPerTick` is capped at **0.5** — the bound exists to catch a tiles-per-second value pasted from the doc. 2.0 tiles/sec is `0.0333`, well under it |
| `ui/locales/contentKeys.ts` | `EnemyMessages = Record<(typeof ENEMIES)[number]['id'], Entry>` — **a new enemy with no `en.ts` entry fails `npm run type-check`**, not a test |
| `tests/content.spec.ts` | loops `ENEMIES` requiring an English name *and* description per id; asserts the Ant's numbers literally |
| `tests/path.spec.ts` | the existing sampler suite; your projection tests belong beside it |

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **`rotting` is derived, never stored.** `ageTicks >= ROT_TICKS` is the whole of it. A boolean field
   would be a second truth that can disagree with the age it was computed from, and it would have to
   survive the JSON round-trip for nothing. Export `isRotting(crumb): boolean` from `crumbs.ts` —
   7C's tint and the HUD's warning count are the readers.
2. **20s and 35s are `ROT_TICKS = 1200` and `HATCH_TICKS = 2100`**, named constants in `crumbs.ts`.
   `OPEN-QUESTIONS.md` flags both as tuning targets, so they are one edit each and nothing computes
   them from the other.
3. **No tile writes, and no `spawnPressure`.** `DECISIONS.md` §4 says rotting "starts raising local
   spawn pressure", but nothing in v1 reads such a value — the only consumer of rot is the hatch —
   and this step's `Do not` forbids tile state, which is the substrate a pressure field would live
   in (step 14). Build the two thresholds; leave the pressure to whichever step first has a reader
   for it. **Fix `Crumb.ageTicks`'s doc comment in `core/types.ts` while you are there**, so the type
   stops describing a mechanic the code does not have.
4. **A hatch is `spawnedInWaveIndex: -1`, and the field's doc comment gains "−1 for an enemy no wave
   spawned".** Attributing the fly to `night.waveIndex` makes `emitClearedWaves` behave
   inconsistently: sometimes the fly blocks that wave's `waveCleared` until it leaks, and sometimes
   the wave is already past the high-water mark and it does nothing at all. −1 matches no index, so
   waves clear on their own enemies and the fly is what it is — a consequence, not a wave member.
5. **The hatch still counts as a leak's worth of punishment, and the night can still be won.** A fly
   walks to the fridge, takes one item and is removed by `resolveSystem` like anything else — so
   `world.enemies.length === 0` is reachable even with nothing able to shoot it. A fly hatching after
   the last wave is out delays the win until it reaches the fridge and costs a named item. That is
   the sting; do not give the fly a lifespan or a despawn to soften it.
6. **The projection is `nearestOnPath(path, point)` in `core/path.ts`**, next to the sampler that
   already owns the arc-length table, plus `nearestPath(paths, point)` picking the closest of several.
   It goes in `core/` and not in `crumbs.ts` because it is path maths, and step 11's moth deviation
   and step 18's pushback will both want the same projection rather than a second copy.
7. **Project onto each *segment* with `t` clamped to `[0, 1]`, never onto the infinite line.** A
   crumb sitting inside the elbow of a corner projects onto the *extension* of both segments if you
   forget, and the fly hatches at an arc distance the track does not reach there — it appears several
   tiles from the pile it came out of. Tie-break by segment order, then by `map.paths` order, so a
   crumb exactly between two lanes joins the same one on a replay.
8. **`spawnEnemyAt(world, def, pathId, distance, spawnedInWaveIndex)` is exported from `spawn.ts`
   and the existing `spawnEnemy` is rewritten to call it** with `distance: 0`. One constructor for an
   `Enemy`, so the fly gets `enemyHpMult`, the copied `tags` array and the index entry without any of
   it being written a second time. The symptom of a second constructor is a fly that aliases
   `def.tags` and a status system that later edits the roster.
9. **No new `GameEvent` member for the hatch.** Nothing consumes one — the fly appearing mid-board is
   its own signal — and members are added by the step that consumes them. If 7C decides the moment
   needs a puff of particles, 7C adds the event and says so in its own file.
10. **The rot door writes no `crumbsCollected`.** A rotted crumb was dropped and not collected, which
    is exactly what makes the cleanliness ratio mean something. Extend 7A's ledger test rather than
    writing a second one.
11. **Rot is deterministic and touches no rng** (7A decision 7). The hatch is a threshold, not a roll.

## Build

### 1. `core/path.ts`

```
nearestOnPath(path: Path, point: Vec2): { distance: number; offsetTiles: number }
nearestPath(paths: readonly Path[], point: Vec2): { pathId: string; distance: number } | null
```

`distance` is the arc length along the polyline of the closest point; `offsetTiles` is how far the
query point sits off the track, which is what `nearestPath` compares. Null for an empty `paths` array
— a half-edited map out of step 4's editor, which every other caller in `core/` also tolerates rather
than throwing on.

Read `tableFor(path)`'s `cumulative` array for the per-segment start offsets rather than re-measuring;
that table exists and is already warm from every enemy on the board.

### 2. `core/systems/crumbs.ts` — the two thresholds

In the ageing loop 7A wrote:

- `ageTicks >= ROT_TICKS`: nothing to do but be true. `isRotting` is the read.
- `ageTicks >= HATCH_TICKS`: remove the crumb — **without** crediting anything and **without**
  touching `night.crumbsCollected` — and spawn a Fruit Fly at `crumb.position`.

Two things to get right:

- **Removal here has to reindex `world.index.crumbPiles` exactly the way `collectCrumb` does.** If
  you find yourself writing the splice twice, factor a private `removeCrumb(world, crumb)` that both
  doors call, and let `collectCrumb` do the crediting on top of it. Two splices means two reindexes,
  and the one that gets forgotten reads out the wrong crumb silently.
- **A claimed crumb must not hatch.** It is in flight and its value is spoken for; a hatch would
  strand the tower's timer and pay nothing. Skip claimed crumbs at both thresholds — which means a
  tower with a big enough radius genuinely protects its patch of floor, and that is the point of
  buying one.

Removing crumbs while iterating `world.crumbPiles` is the same shape as `resolveSystem`'s survivor
pass: build the survivors, assign once, reindex once. Splicing inside a `for…of` over the same array
skips the element after each removal, and the symptom is every second overdue crumb surviving a tick
longer than the one before it.

### 3. `core/systems/spawn.ts`

Extract `spawnEnemyAt` per decision 8. Nothing about `startWave` or `spawnSystem` changes.

### 4. `core/content/enemies.ts` and `ui/locales/en.ts`

`fruitFly`: 🦟, 8 HP, `tilesPerSecond(2.0)`, reward 2, steals 1, tags `['air', 'swarm',
'self-spawning']` — `CONTENT.md` §2's last row. Add it to `ENEMIES`, then add its English name and
description to `en.ts` or `contentKeys.ts` fails `type-check`. Note in a comment that it has **no
scheduled night in v1**: it is a rot consequence and becomes a wave enemy at night 20.

Extend `tests/content.spec.ts` with its numbers, literally, the way the Ant's block does.

## Tests

Extend `tests/path.spec.ts` and 7A's `tests/crumbs.spec.ts`.

- `nearestOnPath` on a straight segment returns the perpendicular foot, and a point beyond either end
  clamps to that end's arc distance rather than running off the line.
- A point inside a right-angled corner projects to the **corner waypoint**, not past it — the test
  that catches an unclamped `t`. Assert `samplePath(path, result.distance)` is within an epsilon of
  the projected point, which checks the two functions against each other rather than against a number
  you worked out by hand.
- `nearestPath` over two lanes picks the nearer one, and picks the earlier of the two for a point
  exactly between them.
- A crumb at `ageTicks` 1199 is not rotting and at 1200 is; at 2099 it is still on the board and at
  2100 it is gone and **exactly one** enemy has appeared.
- The hatched enemy is a `fruitFly` with `spawnedInWaveIndex === -1`, its `distance` equals
  `nearestOnPath(...)` for the crumb's position, and `enemyPosition` puts it within an epsilon of the
  crumb it came from.
- A crumb claimed by a tower does not hatch: run it past 2100 ticks with the claim held and assert it
  is still there.
- A wave whose own enemies are all gone emits `waveCleared` **while a hatched fly is still on the
  board** — the assertion that pins decision 4.
- **The ledger, extended**: over a headless night, `night.crumbsDropped` equals
  `night.crumbsCollected` + the value still on the board + the value that rotted away. Track the
  third term in the test, not on the world.
- A night played twice from the same seed with the same command log produces the same enemies at the
  same ticks, flies included — extend `tests/night.spec.ts`'s determinism case rather than writing a
  third one.

## Acceptance

- [ ] `core/` still imports nothing but itself and zod, and `path.ts` knows nothing about crumbs.
- [ ] Adding the Fruit Fly touched `core/content/enemies.ts`, `ui/locales/en.ts` and
      `tests/content.spec.ts` — and no file in `core/systems/` except the one line that names it.
- [ ] A headless night with no towers still ends: nothing dies, so nothing rots, so no fly is ever
      hatched, and `tests/night.spec.ts` is unchanged in behaviour.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.
- [ ] Night 1 played carelessly generates two or three flies, not ten. *Cannot be judged this
      session* — there is nothing on screen and no way to play carelessly headlessly. 7C and step 8
      are where this is looked at; if it is wrong, `ROT_TICKS` / `HATCH_TICKS` and night 1's rewards
      are the two knobs, and `OPEN-QUESTIONS.md` already says so.

## Hands to 7C

```
core/systems/crumbs.ts    isRotting(crumb: Crumb): boolean
                          ROT_TICKS = 1200        // 20s
                          HATCH_TICKS = 2100      // 35s

core/path.ts              nearestOnPath(path: Path, point: Vec2): { distance: number; offsetTiles: number }
                          nearestPath(paths: readonly Path[], point: Vec2): { pathId: string; distance: number } | null

core/systems/spawn.ts     spawnEnemyAt(world: World, def: EnemyDef, pathId: string,
                                       distance: number, spawnedInWaveIndex: number): Enemy

core/content/enemies.ts   fruitFly                // ENEMIES now has three entries
```

## Do not

Do not draw the rotting tint, the fly-speck particle, the hatch, or anything else — 7C owns every
pixel this step has, and the flyer's shadow and bob belong to step 11. Do not build tile state or a
spawn-pressure value (step 14). Do not give the Fruit Fly any AI beyond joining a path: no swarming,
no seeking a crumb, no lifespan. Do not add a tower or a status that can hit `air` — that is step
11's payoff and taking it early removes the lesson this step exists to teach. Do not re-tune night
1–3's wave tables; step 5C tuned them by watching, and this session cannot watch.
