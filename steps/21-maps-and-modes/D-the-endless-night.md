# Step 21D — The endless night, headless

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/CONTENT.md` §2 (the enemy table) and §6 (the
wave-composition line under the table), `../../analytic-docs/DECISIONS.md` §9 (the *Modes* line).
**Prereq:** steps 21A–21C. This part uses A's maps and B's `waveEntryCount`, and nothing of C's.

## Goal

An endless run is a night. It isn't a mode with its own code path: it's a `NightDef` produced by a
generator, one per map, resolved by `getNightDef` like any other, so every system that already plays a
night plays this one. Wave `n` draws from every enemy the campaign sends, weighted toward the tougher
ones as `n` grows. HP and count rise smoothly, and income rises more slowly, so the run ends. That's the
point. At the end of this part the generated nights exist and validate, and a world can be built on one.
Nothing records a score yet (E), and there's no way to start a run from the game (G). **This part carries
the step's endless test and its difficulty-at-spawn test.**

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/content/index.ts` (`getNightDef`, `validateContentInDev`) | `getNightDef` is `lookup('night', NIGHTS, id)` and throws on an unknown id. The boot check validates `NIGHTS` |
| Runtime readers of the night def | `wave.ts` (twice: the next wave, and the countdown), `systems/commands.ts` (`CallWaveEarly`), `scoring.ts` (the night's `index`), and `spawn.ts`'s `spawnDestroyPenalty`. **All five go through `getNightDef(world.night.nightId)`.** That's the pipeline to reuse |
| `core/systems/spawn.ts` | `cursorsFor` and `cursor()` carry `startDistanceTiles` only when the entry authors it. `spawnEnemyAt(world, def, pathId, distance, waveIndex)` sets HP to `def.hp × difficulty.enemyHpMult`. It's also the Fruit Fly hatch's constructor (`crumbs.ts`). `waveEntryCount` (21B) is the count |
| `core/types.ts` (`WaveSpawn`) | `startDistanceTiles?` is the precedent for an optional field copied off the entry |
| `core/content/schema.ts` (`waveEntry`, `night`) | Count 1–500, spacing and delay ≤ 7200 ticks, `index` 1–100. No HP field anywhere on a night |
| `core/content/nights.ts` | The rules its notes set. At most one Mouse per wave, one entry of count 1, released after everything else, never alone. One mold per entry, and a mold where a tower can reach it. Never a Silverfish-only wave. *Corrected while building:* `content.spec` checked only the Mouse's and the mold's reach. One mold per entry and no Silverfish-only wave were in the notes alone. All four now live in `tests/fixtures/nightRules.ts`, and both specs run them |
| `core/content/maps/index.ts` (21A) | `MAPS`: counter, sink, pantry, stove, table, floor. Lane 0 is `crack` on each |
| `core/rng.ts` | `createRng(seed)`, `bindRng`, `int`, `pick`, `chance` |
| `core/map.ts`, `core/path.ts` | `canPlace`, `samplePath` |
| `tests/charges.spec.ts` | The trick of pushing a synthetic night into `NIGHTS` so `getNightDef` finds it |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and then
edit this file. Don't leave it lying.

1. **`core/content/endless.ts` builds `ENDLESS_NIGHTS` at module load, one per map in `MAPS` order**,
   with id `endlessNightId(mapId)`: `endlessCounter`, `endlessSink`, and so on (camelCase def ids).
   Export `isEndlessNightId` too. **They're not in `NIGHTS`.** The campaign walks `NIGHTS` by position:
   Continue, `unlockedTowerIds`, `previousLoadout`. An endless night in that array would become night 19.
2. **`getNightDef` resolves both arrays.** `findNightDef(id): NightDef | null` is its non-throwing twin,
   for G's readers that run on the spec fixture's `'test'` night. No system learns what endless is.
   That's the whole of "reuse the night pipeline".
3. **Deterministic in the map alone.** The generator's rng is opened from a hash of the map id. Every
   run on a map meets the same waves, so a best on that map compares like with like, and a replay needs
   no extra seed. The world's seed still decides the shelf and every roll made during the night.
4. **`ENDLESS_WAVE_COUNT` is finite, around 200**, far past where a run ends. Surviving all of them is a
   win. `index: 19`, the night after the campaign: `createWorld` stocks `18 + floor(19 / 3)` items, and
   `scoring.ts` computes a pay that E never pays out. No `unlocksTowerIds`, no `modifierId`. **Validate
   them at boot** like every night, by passing `[...NIGHTS, ...ENDLESS_NIGHTS]` to the check.
5. **`WaveEntry.hpMult?: number`**, optional and absent on every campaign night. It's copied onto the
   cursor the way `startDistanceTiles` is (present only when authored), and applied in `spawnEnemyAt`:
   `def.hp × difficulty.enemyHpMult × hpMult`, as a new last parameter defaulting to 1. HP could not
   scale per wave through a `NightDef` at all. This is the widening the step's own rule asks for ("if it
   needs its own path, the night model is too rigid"). The destroy penalty's cursors carry it, because
   they're bought from the running wave's own entries.
6. **The pool is every enemy some campaign night sends.** Derive it from `NIGHTS` and don't list it, so
   the Fruit Fly (never scheduled) is out, and an enemy step 24 schedules is in. Weights shift toward
   the higher-HP defs as `n` grows.
   *As built:* the pool is split by what a def does, not by name. A def with speed 0 is placed like the
   mold, a def with `thief` is released last like the Mouse, and the rest stream down every lane.
7. **The campaign's rules hold in endless too.** At most one Mouse per wave: count 1, released after
   every other entry's last spawn, never alone, and not in the first waves. One mold per entry, at a
   distance where a tower on *this* map can reach it (decision 8). Never a Silverfish-only wave, and
   every wave has a ground walker. Walkers and flyers name no lane (round-robin, 21C's decision 3).
   A mold and a Mouse name theirs.
8. **Mold spots are computed, not authored.** Sample each lane and keep the distances where some tile
   within a short reach passes `canPlace(map, tile, 'off_path')`. Choose the reach and give the reason
   in the file. A mold nobody can shoot eats the board for the rest of the run.
9. **The curve is a draft.** HP multiplier and counts rise, and spacing tightens. Write the constants
   from arithmetic and say so in the file. G re-tunes them after playing runs. **The tests pin
   properties, never a constant**, so G can move any number without editing a spec.
10. **The difficulty-at-spawn test lives here**, because this part is what edits spawn's HP line.

## Build

### 1. `hpMult`: `schema.ts`, `types.ts`, `spawn.ts`

Decision 5.

### 2. The generator: `core/content/endless.ts`

Decisions 1, 3, 4 and 6–9.

Gotchas:

- **Import the leaves, never `core/content/index.ts`.** Import `MAPS` from `core/content/maps/index.ts`,
  `ENEMIES` from `enemies.ts` and `NIGHTS` from `nights.ts`. `content/index.ts` imports `endless.ts`,
  and the cycle makes `ENDLESS_NIGHTS` `undefined` while `index.ts` evaluates. Then
  `getNightDef('endlessSink')` throws from some entry points (the app) and not others (a spec that
  imports `endless.ts` first).
- **The boot check runs zod over every generated wave in dev.** A count past 500, a spacing past 7200
  or an `hpMult` past its bound is a dev crash of the whole app at module load, not a failing spec.
  Clamp inside the generator to the schema's bounds, and bound `hpMult` in the schema above the largest
  value the curve reaches at the last wave.
- **`waves[0].countdownTicks` is both the run-up and the gap after wave 1** (the `nights.ts` header). A
  countdown's clock starts when a wave's last enemy spawns, not when the wave starts.
- **"Released last" is arithmetic, not order in the array:** the Mouse's `startDelayTicks` has to be
  more than every other entry's `startDelayTicks + (count − 1) × spacingTicks`. That's the sum
  `content.spec` checks.
- **Tiers still scale an endless wave.** `startWave` runs every generated count through
  `waveEntryCount`. At nightmare, a count near the cap goes past 500 at runtime, which is fine: only the
  authored number is bounded.
- The Fruit Fly hatch calls `spawnEnemyAt` without the new parameter. That's why it defaults to 1.

### 3. Resolution and validation: `content/index.ts`

Decisions 2 and 4.

## Tests

`tests/endless.spec.ts`, plus the difficulty test in `spawn.spec`.

- **An endless run produces valid waves for at least 100 waves, on every map.** Build
  `createWorld({ seed: 1234, mapId, nightId: endlessNightId(mapId), difficulty: 'normal' })`. For the
  first 100 wave indices: `startWave`, then spawn it out by advancing `world.tick` and calling
  `spawnSystem`, then clear the board. No throw, every enemy in the pool, every count at least 1.
- **Not degenerate:** every wave has a ground walker, no wave is all flyers or all molds, and every
  window of 10 waves holds at least 3 kinds of enemy. The mean HP of waves 90–99 is above that of waves
  0–9 (the weights shifted). Threat (Σ count × hp × hpMult) grows faster than income
  (Σ count × reward): their ratio at wave 100 is above their ratio at wave 10.
- **The campaign's rules hold on every generated wave:** the Mouse arithmetic above, one mold per
  entry, and no Silverfish-only wave. Reuse `content.spec`'s checks as helpers rather than copying them.
  *As built:* the helpers are `tests/fixtures/nightRules.ts` (`mouseBreaks`, `compositionBreaks`,
  `moldReachableTiles`). `content.spec` now calls them too, and gained the campaign test it lacked:
  one mold per entry, never a Silverfish-only wave.
- **Deterministic:** generating twice is deep-equal, and two maps' nights differ.
- **Resolution:** `getNightDef` resolves every endless id and still throws on an unknown one.
  `findNightDef` returns null. `NIGHTS` has 18 entries.
- **Difficulty scalars apply at spawn and never mutate the night definition:** deep-freeze a night
  (a synthetic one pushed into `NIGHTS`) with an `hpMult` entry, build it at nightmare, start and spawn
  its wave. The count is `waveEntryCount`'s, each HP is `def.hp × 1.35 × hpMult`, nothing threw writing
  to the frozen def, and it still deep-equals a fresh copy.

## Acceptance

- [x] No file under `core/systems/` names endless or imports `endless.ts`.
- [x] `createWorld` on an endless night id builds, ticks a thousand times and survives a JSON
      round-trip.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 21E and 21G

```
core/content/endless.ts    ENDLESS_NIGHTS: NightDef[]              // one per MAPS entry, same order
                           ENDLESS_WAVE_COUNT: number
                           endlessNightId(mapId: DefId): DefId      // 'endlessSink'
                           isEndlessNightId(id: DefId): boolean
core/content/index.ts      getNightDef(id)                          // campaign or endless; throws otherwise
                           findNightDef(id): NightDef | null
core/content/schema.ts     WaveEntry.hpMult?: number
```

## Do not

Record a score, a best or an unlock (E). Build a route, a screen or a banner (G). Give endless its own
wave system, its own `startWave` or a branch on the night id anywhere in `core/systems/`. Tune the curve
by feel: that's G's, after it can be played.
