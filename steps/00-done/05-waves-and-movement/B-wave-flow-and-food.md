# Step 5B — Wave flow, the fridge, win and loss

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../../CLAUDE.md`, `../../../analytic-docs/DECISIONS.md` §5 and §6, `../../../analytic-docs/CONTENT.md` §7 and §9.
**Prereq:** step 5A.

## Goal

The night as a structure: waves that start on a countdown or early on command, ants that reach the
fridge and take named food off the shelf, and a night that ends won or lost. Still headless — after
this session a night plays itself out correctly in a test and is invisible in the browser. 5C makes
it watchable.

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/systems/spawn.ts` | 5A's `startWave(world, night, waveIndex)` and `spawnSystem`. `startWave` sets `waveIndex`, `night.wave`, `phase = 'wave'`, and emits `waveStarted` |
| `core/types.ts` | `NightState { nightId, waveIndex, waveCount, phase, countdownTicks, wave, food }`, `NightPhase = 'building' \| 'wave' \| 'countdown' \| 'won' \| 'lost'`, `Wave { index, spawns, startedAtTick }` — **no `countdownTicks` on the runtime `Wave`**, `FoodItem { id, nameKey, heldBy, lost }`, `Enemy.spawnedInWaveIndex`, `GameEvent` |
| `core/systems/resolve.ts`, `events.ts` | no-op stubs. `resolve` runs 12th, `events` 13th and last |
| `core/systems/commands.ts` | no-op stub, `(_world, _commands)`; its header already says step 5 owns `CallWaveEarly` |
| `core/sim.ts` | `SYSTEMS` is the literal array of `{ name, run }`; the `SystemName` union is a second literal above it, and `SYSTEM_ORDER` is derived from `SYSTEMS` |
| `core/systems/index.ts` | one re-export per system file |
| `core/world.ts` | `createWorld` — `night.food: []` with a comment saying step 5 stocks it (**that comment is yours to update**), `waveCount = night.waves.length`, `phase: 'building'`, `countdownTicks: 0` |
| `core/path.ts` | `totalLength(path)`, `remainingToFridge(path, distance)` |
| `core/content/schema.ts` | `contentSchemas()` returning one schema per kind, `validateContent`, `RawContent`/`Content` — no `food` slot yet. `validateContent` calls `validateCollection` once per kind |
| `core/content/difficulty.ts` | `foodItemsMult` — cozy 1.3, normal 1, nightmare 0.75 |
| `ui/locales/contentKeys.ts` | `TowerMessages`/`EnemyMessages`, both `Record<id, Entry>` where `Entry` is `{ name, description }`; `en.hud.food` exists |
| `tests/fixtures/world.ts` | `createTestWorld()` — every `World` field spelled out, `nightId: 'test'`, `phase: 'building'`, `countdownTicks: 0`, one food item keyed `'food.cheese'` |

**Adding `wave` to the order is a three-file edit, by design.** `core/sim.ts` twice (the `SystemName`
union *and* the `SYSTEMS` array), `core/systems/index.ts` (the re-export — `tests/sim.spec.ts` asserts
`systems` has a `${name}System` property for every name in `SYSTEM_ORDER`), and the literal in
`tests/sim.spec.ts`. Put it **after `spawn`**, per decision 3.

**Specs that will break. Plan for them:**

- `tests/sim.spec.ts` — **three of its four tests call `tick()` on `createTestWorld()`**, whose
  `nightId` is `'test'` and which opens in `'building'` with `countdownTicks: 0`. The first tick will
  reach `getNightDef('test')` and throw `unknown night id 'test'`. Fix it **in the fixture**, not in
  the tests: set `night.phase = 'won'`. Terminal phases run nothing (decision 10), so all four tests
  keep asserting exactly what they were written to assert — including *"mutates nothing but
  world.tick"*, which stays literally true. Rename that test and its comment so it says "while the
  night is over" rather than "while every system is a stub". The fixture is the skeleton for
  tick-mechanics tests; a world that drives a night is what `night.spec.ts` builds on purpose.
- `tests/world.spec.ts` — *"differs from another seed only in its rng state"*. Once the fridge is
  stocked from `world.rng`, two seeds differ in `night.food` too. Widen the assertion and say so in
  its comment; do not stop using the rng to fix it.
- `tests/spawn.spec.ts` — **this one was missed when the step was written, and it breaks in two
  ways.** Its `worldOn()` is the fixture, so (a) the *"does nothing at all while night.wave is
  null"* test asserts `phase === 'building'`, which the fixture's new `'won'` contradicts — give
  that one test a `'building'` phase with a countdown longer than the run instead; and (b) the
  fixture's lane is **one tile long**, so the moment `resolve.ts` exists every ant it spawns walks
  off the end and is eaten at the fridge mid-assertion. Lengthen the fixture's map and path (40
  tiles is plenty) and the second lane `twoPathWorld()` pushes.

`tests/fixtures/world.ts` spells out every field on purpose, so a new field on `World` fails
type-check there. That is the fixture working, not the fixture breaking.

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **The fridge is `world.night.food`**, not `world.fridge.items` as the step plan said. There is no
   `world.fridge` and there should not be one — the food resets every night (`DECISIONS.md` §6) and
   the night state is exactly the thing that resets.
2. **A stolen item is marked `lost: true`, never spliced out.** `FoodItem.lost` exists for this. The
   night-end summary lists what you lost *by name* (`DECISIONS.md` §6), and a spliced array cannot
   answer that. Consequence to write down where someone will see it: **"the fridge is empty" is
   `food.every(item => item.lost)`, never `food.length === 0`**, which is never true.
3. **`FoodItem.defId: DefId` is a new field.** The glyph and the name live on the def; the item on
   the shelf is one instance of it, and 5C has to look up 🍕 from something. Deriving it back out of
   `nameKey` is the version that breaks when a key is renamed.
4. **Events: use the union that exists.** `enemyLeaked { enemyId, defId, stolenItems }` already names
   the items, so it is the theft event — the plan's `FoodStolen` would be a second event carrying the
   same payload. Likewise `nightEnded { won }` is `NightWon`/`NightLost`. Add no new `GameEvent`
   members this session.
5. **`world.events` is cleared at the top of `tick()` in `core/sim.ts`**, and `eventsSystem` keeps
   its slot but stops claiming to do it (fix its header comment). A system that runs *last* cannot
   both publish this tick's events and clear them — anything it clears, no consumer outside the tick
   ever sees. Clearing at the top means events survive from the end of one tick until the start of
   the next, which is exactly the window a consumer runs in.
   **Gotcha this creates for 5C, and the reason it is written here:** at 3× speed the loop runs three
   ticks between two frames, so a renderer reading `world.events` once per frame sees only the last
   tick's. The consumer has to accumulate after every `tick()` call. Say so in 5C's file if you touch
   the rule.
6. **`ticksSkippedTotal: number` on `NightState`, not `secondsSkippedTotal`.** Durations in `core/`
   are tick counts (`../../../CLAUDE.md`); step 20's grocery formula divides by 60 once, at the point it needs
   seconds. The award itself is `floor(countdownTicks / 60) * 2` crumbs — `DECISIONS.md` §5 says
   "proportional to the seconds you skipped" and names no rate, so 2/sec is this file's choice and
   step 22 is what re-prices it.
7. **`CallWaveEarly` is ignored outside `phase === 'countdown'`.** The countdown only starts once a
   wave's last enemy has *spawned* (`DECISIONS.md` §5), so there is never a moment where two waves
   are spawning at once, and `NightState.wave` staying a single `Wave | null` is correct — do not
   turn it into an array. Overlap is live enemies from the old wave, not two schedules.
8. **The clock is `2:00am + (waveIndex / (waveCount - 1)) × 4h`,** so the last wave of a 6-wave night
   reads 6:00am. The plan's `waveIndex / waveCount` gives 5:20am on that wave and only reaches 6:00am
   after the night is already over, which contradicts the step's own acceptance criterion.
   `DECISIONS.md` §5 says the clock is *a display mapping over* `waveIndex / waveCount`, which this
   is. Guard `waveCount === 1`.
9. **The clock is a pure function, not state.** `nightClock(waveIndex, waveCount)` in
   `core/systems/wave.ts`. Nothing stores an hour.
10. **The first wave is not free.** `createWorld` opens the night in `'building'` with
    `countdownTicks` set to wave 0's authored `countdownTicks`, so the night starts on its own after
    12s and calling early works from the first second. A `'building'` phase that waits forever is a
    night that never starts if 5C's key handler has a typo.
11. **`NightState.clearedThroughWaveIndex: number`, starting at `-1`.** "Emits `waveCleared` once"
    needs somewhere to remember that it did, and nothing on `Wave` or `NightState` carries it today.
    A high-water mark rather than a set, because waves always start in order and never un-clear. Each
    tick, while the wave at `clearedThroughWaveIndex + 1` has both finished spawning and no live
    enemy with that `spawnedInWaveIndex`, emit `waveCleared` for it and increment. Without this field
    the obvious implementation emits `waveCleared` every tick for the rest of the night, and nothing
    consumes the event until step 8 — so it is silent until the HUD flashes forever.

## Build

### 1. Food — `core/content/food.ts`, `schema.ts`, `contentKeys.ts`, `en.ts`

The twelve items of `CONTENT.md` §7 as defs: `{ id, nameKey: 'food.<id>.name', glyph }`. Add a `food`
schema to `contentSchemas()`, a `food` slot to `RawContent`/`Content` and a `validateCollection` line
to `validateContent`, then pass `FOODS` to `validateContentInDev` — all content is zod-validated at
boot (`../../../CLAUDE.md`), and a food id with no locale entry should fail at startup like a tower does.

Add `FoodMessages` to `contentKeys.ts` the way `EnemyMessages` is derived — but **`Record<id, { name:
string }>`, not the shared `Entry`.** A food item has a name and no description; reusing `Entry`
means inventing twelve flavour-text lines nothing renders. Then the `food:` block in `en.ts`.

### 2. Stocking the fridge — `core/world.ts`

`round(( 18 + floor(night.index / 3) ) * difficulty.foodItemsMult)` items, drawn from the pool
through `world.rng` (`bindRng` — never `Math.random`). Night 1 is 18 items on normal. Twelve defs and
eighteen items means duplicates; each is its own `FoodItem` with its own id from `nextEntityId`.
Update `tests/fixtures/world.ts` for the new fields, the `world.spec.ts` assertion above, and the now
out-of-date comment on `night.food` in `createWorld`.

### 3. `waveSystem` — `core/systems/wave.ts`, wired into `core/sim.ts` after `spawn`

The whole state machine, and the only place `phase` changes:

- `'building'` / `'countdown'`: `countdownTicks--`; at zero, `startWave(world, getNightDef(nightId),
  waveIndex + 1)` (or `0` from `'building'`).
- `'wave'`: once every `WaveSpawn` has `remaining === 0`, the wave has finished *spawning* — set
  `countdownTicks` and go to `'countdown'`. **The authored countdown is on the night def's wave, not
  on the runtime `Wave`** (`Wave` is `{ index, spawns, startedAtTick }`), so read it from
  `getNightDef(nightId).waves[waveIndex].countdownTicks`. If that was the last wave, do not start a
  countdown.
- A wave whose enemies are all gone emits `waveCleared` once, per decision 11. This has to work while
  the *next* wave is on the board, which is the one thing `spawnedInWaveIndex` is for.
- ~~Last wave spawned out, no enemies alive → `phase = 'won'`, `nightEnded { won: true }`.~~
  **Built in `resolve.ts` instead, next to the loss check.** As written this contradicted the Tests
  section: `wave` runs 3rd and `resolve` — the system that *removes* the enemy — runs 12th, so a win
  decided here is always reported the tick after the board emptied, and "ends `'won'` in the tick the
  last one is removed" is unreachable. `core/sim.ts`'s own order comment already reads
  *"resolve (deaths, leaks, win/lose)"*. `waveSystem` still owns the "last wave gets no countdown"
  half, and exports `hasFinishedSpawning(wave)` for `resolve.ts` to ask.
- Terminal phases run nothing: `spawn`, `wave`, `movement` and `resolve` all return early on `'won'`
  and `'lost'`, or the night keeps simulating behind the summary screen. Two of those files are 5A's;
  adding the guard to them is yours.

**Ordering gotcha worth knowing before you write the spec:** `commands` runs 1st, `spawn` 2nd, `wave`
3rd. So a wave started by `CallWaveEarly` has its first enemies spawned by `spawnSystem` *later in
the same tick*, while a wave started by the countdown expiring is started after `spawnSystem` has
already run and spawns on the following tick. One tick, deterministic either way — but an assertion
that pins an exact spawn tick will disagree with itself depending on which path started the wave.

### 4. `CallWaveEarly` — `core/systems/commands.ts`

Per decision 7: in `'countdown'` only, award `floor(countdownTicks / 60) * 2` crumbs, add
`countdownTicks` to `ticksSkippedTotal`, then start the next wave immediately. `crumbIncomeMult` does
**not** apply — it is an income multiplier, and this is a tempo reward the difficulty tier already
prices through everything else.

### 5. Leaks — `core/systems/resolve.ts`

An enemy with `distance >= totalLength(path)` takes `def.steals` items — the first `steals` items
with `lost === false`, so what leaves is deterministic — marks them `lost`, emits `enemyLeaked` with
their ids, and is removed. **Whoever removes an entity rebuilds `world.index.enemies`** (the note on
`EntityIndex` in `core/types.ts`); splicing without it silently re-points every later enemy.

Then the loss check, in the same system and the same tick: no unlost food → `phase = 'lost'`,
`nightEnded { won: false }`.

## Tests — `../../../game/tests/night.spec.ts`

Read authored numbers off the def or set the world field directly. **Never hard-code night 1's
tables** — 5C re-tunes them.

- A fridge of 3 items hit by **five Ants** ends with 3 lost items and emits `nightEnded { won: false }`
  **in the same tick**, and `world.night.food.length` is still 3. (Written as "one enemy with
  `steals: 5`", which nothing in the roster is — Ant and Roach both steal 1, and enemy defs are not
  injectable the way a `NightDef` is. Five enemies stealing one each puts the same five steals
  against the same three items, which is the assertion that mattered.)
- Calling a wave early with `countdownTicks = 7 * 60` awards exactly 14 crumbs and adds exactly 420
  to `ticksSkippedTotal`. With `countdownTicks = 0` it awards 0 and does not double-start a wave.
- `CallWaveEarly` during `'wave'` changes nothing at all — not crumbs, not `waveIndex`.
- `nightClock(0, 6)` is 2:00am and `nightClock(5, 6)` is 6:00am.
- A night whose last wave has spawned and whose enemies are all gone ends `'won'` in the tick the
  last one is removed, not the tick after.
- `waveCleared` for wave 0 is emitted **exactly once**, on a world where wave 1 is already spawning —
  drive it far enough to prove the event does not repeat on every subsequent tick.
- Two worlds from the same seed, **played out to `nightEnded`** with an identical command log, have
  identical `night.food` (ids, defIds and `lost` flags), an identical event log, and an identical
  `tick` at which they ended. (Written as "ticked 3000 times", which is short of the end — an
  unattended night 1 loses its eighteenth food item somewhere past tick 3800, so 3000 ticks would
  have compared two nights that had not ended and made "the tick at which they ended" vacuous.)

## Hands to the next part

```
core/systems/wave.ts      waveSystem(world: World): void
                          nightClock(waveIndex: number, waveCount: number): { hour: number; minute: number }
                          hasFinishedSpawning(wave: Wave): boolean
core/systems/resolve.ts   leaks, and both terminal transitions ('won' and 'lost')
core/content/food.ts      FOODS: FoodDef[]                        // { id, nameKey, glyph }
core/content/index.ts     getFoodDef(id: DefId): FoodDef          // beside the other four lookups,
                                                                  // sharing `lookup`
core/types.ts             FoodItem.defId: DefId
                          NightState.ticksSkippedTotal: number, NightState.clearedThroughWaveIndex: number
core/sim.ts               tick() clears world.events before the systems run
```

## Acceptance

- [x] A headless run of night 1 from `createWorld` to `nightEnded` needs no input and no renderer,
      and the event sequence is identical on two runs from the same seed.
- [x] Nothing outside `core/systems/wave.ts` writes `night.phase`, except the **win and loss checks**
      in `resolve.ts` — see the amended bullet in Build §3.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Do not draw anything, do not touch `render/` or `GameView.vue`, and do not add the on-screen wave
counter — 5C. Do not implement thieves that carry food off the map (`FoodItem.heldBy` and
`Enemy.stolenItems` stay unused: step 19), do not award grocery money at night end (step 20), and do
not add a night-end summary screen (step 8). Enemies are still invincible — no deaths, no rewards.
