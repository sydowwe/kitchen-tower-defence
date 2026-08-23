# Step 5A — Nights 1–3, spawning, movement

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../../CLAUDE.md`, `../../../analytic-docs/CONTENT.md` §2 and §6, `../../../analytic-docs/DECISIONS.md` §3.
**Prereq:** step 4B.

## Goal

An enemy that exists and walks. A wave definition becomes a spawn schedule, the schedule puts ants on
the track at exact intervals, and every ant advances along its polyline once per tick. Entirely
headless — nothing is drawn this session, and nothing decides when a wave begins. 5B starts the
waves, 5C draws them.

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/types.ts` | `Enemy` (`pathId`, `distance`, `speed` — **tiles per tick**, `flags: Record<EnemyFlag, boolean>`), `Wave { index, spawns, startedAtTick }`, `WaveSpawn { enemyDefId, remaining, nextSpawnTick, pathId }`, `NightState { nightId, waveIndex, waveCount, phase, countdownTicks, wave, food }`, `EntityIndex` |
| `core/systems/spawn.ts`, `movement.ts` | no-op stubs, `(_world: World): void`, already exported from `core/systems/index.ts` |
| `core/sim.ts` | `SYSTEMS` as a literal array; `SYSTEM_ORDER` is derived from it. `commands` 1st, `spawn` 2nd, `status` 3rd, `movement` 4th — all already wired |
| `core/content/nights.ts` | `night01` — one wave, 5 ants, `spacingTicks: 45`, `pathId: 'crack'`, `countdownTicks: 12 * 60`. A placeholder from 2D; replace it |
| `core/content/schema.ts` | `waveEntry` (`enemyDefId`, `count`, `spacingTicks`, `startDelayTicks`, `pathId` — all required), `wave { entries, countdownTicks }`, `night { id, index, mapId, waves }`. `speedTilesPerTick` is bounded `max(0.5)` so a tiles-per-second value cannot get in |
| `core/content/enemies.ts` | `ant` only, `speedTilesPerTick: tilesPerSecond(1.0)`, plus the `tilesPerSecond` helper and `EnemyDefOf<Id>` (its `nameKey` is a template literal type, so the key writes itself) |
| `core/content/statuses.ts` | **`speedMultiplier(target): number`** already exists — 1 when nothing is running, 0 under Freeze. Takes any `{ statuses }`, so an `Enemy` is one |
| `core/content/index.ts` | `getEnemyDef`, `getNightDef`, `validateContentInDev({ towers, enemies, nights })` at module load |
| `core/content/maps/counter.json` | **one path, id `'crack'`, `lengthTiles` 31.12** — from `(0, 11)` to the fridge at `(22, 3)` |
| `core/path.ts` | `samplePath(path, distance)`, `totalLength(path)`, `remainingToFridge`. Its arc-length table is a `WeakMap` keyed by the `Path` object, so a cloned map builds its own |
| `ui/locales/contentKeys.ts` | `EnemyMessages = Record<(typeof ENEMIES)[number]['id'], Entry>` — **derived from the array**, so adding the Roach makes `en.ts`'s `satisfies EnemyMessages` fail `type-check` before `content.spec.ts` ever runs |
| `tests/fixtures/world.ts` | `createTestWorld()` — hand-built, 2 × 1 map, one path `'a'` of length 1 |
| `tests/content.spec.ts` | asserts every `ENEMIES` entry has an `en.enemy[id]` name and description |

No spec breaks this session. `createWorld` leaves `night.wave` null and nothing calls `startWave`, so
`world.spec.ts`'s hundred-tick determinism test still ticks over an empty board.

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **Movement is `enemy.distance += enemy.speed * speedMultiplier(enemy)`. No `TICK` factor.** The
   step plan said `speed × speedMultiplier × TICK`; that is wrong against this repo twice over —
   `Enemy.speed` is already tiles per tick (`enemies.ts` converts the doc's tiles/sec once, at
   authoring time), and `TICK` lives in `loop.ts` which `core/` may not import. Multiplying by 1/60 a
   second time would make an ant cover one tile per minute, which reads as "spawning is broken".
2. **`speedMultiplier` is imported from `core/content/statuses.ts`**, not re-derived. Nothing applies
   a status until step 9, so it returns 1 all session — wire it now anyway, because a movement system
   that ignores statuses is the bug step 9 spends its afternoon finding.
3. **`startWave(world, night, waveIndex)` is exported from `core/systems/spawn.ts`** and takes the
   `NightDef` as an argument rather than looking it up. It is what turns authored entries into
   `WaveSpawn[]`, and passing the def in means a test can drive a synthetic night without registering
   it in `NIGHTS`. 5B calls it; nothing calls it this session.
4. **Difficulty scalars are applied at runtime, to copies, never to the authored def.** `count =
   max(1, round(entry.count * enemyCountMult))` in `startWave` — `round`, not `floor`, or cozy's
   0.85 deletes a one-enemy entry; the `max(1)` is the belt to that braces. HP is `def.hp *
   enemyHpMult` **unrounded**: rounding it quantises the whole difficulty curve at low HP, and
   nothing downstream needs an integer. *(Built: the HP scale lands in `spawnEnemy`, not
   `startWave` — a `WaveSpawn` carries no HP field, so there is nowhere in the cursor to put it.
   Same scalar, same copy-not-mutate rule, one system later.)*
5. **Two new fields on `core/types.ts`.** `Enemy.spawnedInWaveIndex: number`, set here, read by 5B;
   and `WaveSpawn.spacingTicks: number`, because build item 5 advances the cursor by adding it and
   the committed `WaveSpawn` had no such field — `spawnSystem` only has the world, so it cannot
   reach back to the authored entry.

   On `spawnedInWaveIndex`: it is set here, read by 5B. Waves
   overlap (`DECISIONS.md` §5), so "wave 3 is cleared" has to be answerable while wave 4 is walking,
   and no other field carries that. Set it, don't read it.
6. **`waveCount` is derived, never authored.** `createWorld` already sets
   `night.waveCount = night.waves.length`. The plan's night shape also carried `modifier` and
   `unlocks`: leave both out. Nights 1–3 have no modifier, and unlocks are step 20's — an unread
   field in a validated schema is a field someone fills in wrong.
7. **`pathId` becomes optional on `waveEntry`**, and an entry without one is expanded at `startWave`
   into **one `WaveSpawn` per path on the map**, its count dealt out round-robin, each keeping the
   entry's `spacingTicks` and `startDelayTicks`. This spreads pressure across lanes without changing
   per-lane spacing. The Counter has one path, so this is only exercised by the fixture test — write
   it anyway, night 10 is the first map with two lanes and this is ten lines now versus a re-read of
   the spawn system then.
8. **An entry naming a path the map does not have throws**, with both ids in the message. The silent
   version spawns nothing, and the symptom is a night that simply never ends.
9. **Don't clear `world.events`.** `startWave` pushes `waveStarted` and `eventsSystem` is still a
   no-op, so events accumulate across a long test run this session. That is fine and it is not yours
   to fix: 5B moves the clear to the top of `tick()` and rewrites that stub's header comment.

## Build

### 1. The Roach — `core/content/enemies.ts`, `ui/locales/en.ts`

`CONTENT.md` §2, night 3: 18 HP, 1.8 tiles/sec through the existing `tilesPerSecond` helper, reward
5, steals 1, `ground fast bug`, 🪳. Plus its `en.enemy.roach` entry — `EnemyMessages` is derived from
`ENEMIES`, so without it `en.ts` fails `type-check`, not just `content.spec.ts`.

### 2. Nights 1–3 — `core/content/nights.ts`

`CONTENT.md` §6: Counter, 6 / 7 / 8 waves, Ant from night 1, Roach from night 3. Author the ramp
so total pressure rises smoothly across the night and across the three nights; a wave is one or two
entries, `startDelayTicks` staggering the second against the first. `countdownTicks` is `12 * 60` on
every wave unless you have a reason.

**The one number that stops this being guesswork:** the Counter's `crack` path is **31.12 tiles**
long, so an Ant at 1.0 tiles/sec is on the board for ~31 seconds and a Roach at 1.8 for ~17. A wave
of 5 ants at `spacingTicks: 45` finishes spawning in under 4 seconds and then walks alone for
another 28 — which is why the countdown, not the spawn schedule, is what sets a night's pace.

These tables are **drafted here and re-tuned in 5C**, which is the first session that can watch a
night play out. Get the shape right, don't polish the numbers.

### 3. `waveEntry.pathId` optional — `core/content/schema.ts`

One `.optional()`, per decision 7.

### 4. `startWave(world, night, waveIndex)` — `core/systems/spawn.ts`

Builds `world.night.wave` from `night.waves[waveIndex]`: one `WaveSpawn` per entry (or per path, per
decision 7) with `remaining` scaled by difficulty and `nextSpawnTick = world.tick + startDelayTicks`.
Sets `night.waveIndex`, `night.wave`, `wave.startedAtTick = world.tick`, `phase = 'wave'`, and pushes
a `waveStarted` event.

### 5. `spawnSystem(world)`

For each `WaveSpawn` with `remaining > 0` and `nextSpawnTick <= world.tick`: spawn one enemy,
`remaining--`, `nextSpawnTick += spacingTicks`. **`+=`, not `= world.tick + spacingTicks`** — they
agree today and stop agreeing the first time a tick is skipped, and the drift is one tick per wave.

A spawned enemy is `distance: 0`, `hp` and `maxHp` from decision 4, `speed` from
`def.speedTilesPerTick`, `tags` copied (not aliased — a shared array is a def one status system
mutates), `statuses: []`, `stolenItems: []`, all three `flags` false, `id` from
`world.nextEntityId++`, and **`world.index.enemies[id] = world.enemies.length - 1` after the push**
(see the `EntityIndex` note in `core/types.ts`).

Do nothing when `night.wave` is null. That is the whole of this system until 5B exists.

### 6. `movementSystem(world)`

Decision 1, for every enemy, and nothing else — no steering, no collision, no separation, no
clamping. Enemies overlap freely and that is correct for this genre; an enemy past `totalLength` is
5B's problem, and `samplePath` already clamps for the renderer.

**`spawn` runs 2nd and `movement` 4th, so an enemy spawned on tick T also moves on tick T.** That is
correct and the spec below depends on it: an ant spawned during the first `tick()` call has moved
once by the time that call returns, so after 60 calls it has made exactly 60 steps. If you "fix" this
by skipping movement for freshly spawned enemies you get 59 steps, the one-tile assertion fails by
1/60 of a tile, and the obvious-looking repair is to loosen the tolerance — which is the thing that
assertion exists to prevent.

## Tests — `../../../game/tests/spawn.spec.ts`

Build the night defs in the spec as literals. **Never assert against `night01`'s authored numbers** —
5C re-tunes them, and a spec that hard-codes them turns a tuning pass into a red suite.

- A single entry `{ count: 10, spacingTicks: 30, startDelayTicks: 0 }` spawns exactly 10 enemies, on
  ticks 0, 30, 60 … 270, and nothing on tick 300.
- `startDelayTicks: 45` puts the first spawn on tick 45, not tick 0.
- An ant with `speedTilesPerTick` from `tilesPerSecond(1.0)` covers 1 tile of arc length in exactly
  60 ticks — `toBeCloseTo(1, 9)`, because 60 additions of 1/60 is not 1 in binary floating point.
  This is the assertion that catches a units slip, so spell the tolerance out rather than rounding.
- `nightmare` (`enemyCountMult` 1.25, `enemyHpMult` 1.35) spawns 6 enemies for a `count: 5` entry at
  13.5 HP, and `structuredClone` of the night def taken before `startWave` deep-equals it after.
- `cozy` (0.85) still spawns 1 enemy for a `count: 1` entry. This is the `floor`-instead-of-`round`
  catch — `round(0.85)` is 1 and `floor(0.85)` is 0, and the symptom of the second is a wave entry
  that silently vanishes on the easiest difficulty only.
- An entry with no `pathId` on a two-path map deals its enemies round-robin: 5 enemies become 3 on
  the first path and 2 on the second. Extend `createTestWorld()` with a second path, or build the
  `MapDef` in the spec.
- An entry naming a path the map does not have throws with both ids in the message (decision 8).

## Hands to the next parts

```
core/systems/spawn.ts     startWave(world: World, night: NightDef, waveIndex: number): void
                          spawnSystem(world: World): void
core/systems/movement.ts  movementSystem(world: World): void
core/types.ts             Enemy.spawnedInWaveIndex: number
                          WaveSpawn.spacingTicks: number
core/content/nights.ts    night01, night02, night03, NIGHTS
core/content/enemies.ts   roach
```

## Acceptance

- [x] `startWave` + 300 ticks over a hand-built world puts the right number of ants at the right
      distances, asserted by the spec above.
- [x] Adding the Roach required no change to any system file — only `enemies.ts`, `en.ts` and a wave
      entry. If it didn't, the content-is-data rule has eroded; fix it here.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Do not start, end, count down or complete a wave, do not touch `world.night.phase` beyond the
`'wave'` that `startWave` sets, and do not remove an enemy that reaches the end of its path — all of
that is 5B, and a second opinion about when a wave is over is the one thing this split exists to
prevent. Do not draw anything, do not touch `GameView.vue` or `render/`, and do not implement
`eventsSystem` (5B owns the clearing rule).
