# Step 8A — The view model, and everything the HUD is allowed to know

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/ARCHITECTURE.md` §5 (the reactivity rule —
this whole session exists because of it), `../../analytic-docs/DECISIONS.md` §5 (calling waves early)
and §6 (the fridge is the health bar).
**Prereq:** step 7.

## Goal

The HUD's data, as one plain object built by hand and replaced wholesale — plus the English for every
label it will ever show. Entirely headless: nothing is drawn this session and no `.vue` file is
created. **Every test step 8 has lives here**, because this is the half of the step that can be
silently wrong: a bonus preview that disagrees with what the wallet does, an affordability flag off
by one crumb, a snapshot holding a live reference into the world.

## Already in the repo

| File | What's there now |
| --- | --- |
| `ui/viewModel.ts` | a genuinely empty 0-byte file, scaffolded in step 1 and never written. `ARCHITECTURE.md` §1 names this path |
| `ui/views/GameView.vue` | its own local `interface Snapshot` (fps, tickCount, simSeconds, entityCount, speed, paused) in a `shallowRef`, replaced wholesale from the loop's `publish()`. **It stays** — it feeds `DebugOverlay.vue` and is not what you are building |
| `loop.ts` | `publish()` fires every 4th frame (~15Hz); `Speed = 0 \| 1 \| 2 \| 3`; `paused` is a **separate** flag from speed 0. `tests/loop.spec.ts` asserts 15 publishes in 60 frames — do not touch the cadence |
| `core/systems/wave.ts` | `nightClock(waveIndex, waveCount): { hour, minute }` — a pure function of wave progress, denominator `waveCount - 1`. Nothing stores an hour |
| `core/systems/commands.ts` | `callWaveEarly` pays `floor(countdownTicks / 60) * 2` crumbs and only in `phase === 'countdown'`. Both numbers are **module-private consts** |
| `core/systems/placement.ts` | `canPlaceTower(world, def, tile): { ok: true } \| { ok: false; reason }`, the exported `PlacementRejection` union of **eight** reasons, `refundFor(world, tower)` (70%, **50% while `phase === 'wave'`**, `Math.floor`), `towerAt`, `towerById` |
| `core/systems/resolve.ts` | pushes `enemyKilled` per death, in one pass, before the leak check |
| `core/types.ts` | `NightState` (waveIndex, waveCount, phase, countdownTicks, food, ticksSkippedTotal, crumbsDropped, crumbsCollected, clearedThroughWaveIndex), `NoiseState` (level, cap, decayPerTick, hasFilled), `World.crumbs` / `.groceryMoney`, `FoodItem.nameKey` |
| `core/content/towers.ts` | `TOWERS` in the order `[saltShaker, toasterCrumbTray, cookieJar]` — the order `1`–`9` binds to. Each def carries `nameKey`, `descriptionKey`, `glyph`, `role`, `cost`, `noise`, `placement`, `defaultTargetingMode`, `behaviours` |
| `core/content/behaviours.ts` | `isAttack` / `isCollect` narrowing helpers; `AttackBehaviour` has `damage`, `cooldownTicks`, `rangeTiles`, `damageType`, `targets` |
| `ui/locales/en.ts` | `hud.*` (pause, resume, speed, crumbs, food, noise, wave, callWave, sell, upgrade), `debug.*`, `tower/enemy/food.*`, and **`night: {}` with a comment saying step 8 fills it** |
| `ui/locales/contentKeys.ts` | `TowerMessages` / `EnemyMessages` / `FoodMessages` as `Record<def id, Entry>` — the pattern that turns an untranslated def into a build error |
| `tests/fixtures/world.ts` | a hand-built `World` **literal**, deliberately spelled out so a new field on `NightState` fails `type-check` here rather than defaulting to `undefined` |
| `tests/editor.spec.ts` | the precedent that a headless module outside `core/` carries specs. `vite.config.ts` includes `tests/**/*.spec.ts`, `environment: 'node'` |

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **`ui/viewModel.ts` is pure functions and imports nothing from `vue`.** `GameView.vue` keeps
   owning the `shallowRef`. A builder that owned the ref would be a second place holding UI state,
   and it would stop being callable from a node-environment spec.
2. **The snapshot copies primitives and never holds a reference into the world.** Not
   `world.night.food`, not a filtered array of it, not a `Crumb`. The test below is the enforcement.
   A live array in the snapshot is how world state ends up behind a Vue proxy without anyone writing
   `ref(world)`.
3. **Two builders, not one.** `buildHudSnapshot` runs at 15Hz; `buildTowerInspector` runs on
   selection change. `ARCHITECTURE.md` §5's one exception is the selected tower's stats, and 15Hz
   reads as laggy for numbers the player is actively watching.
4. **Shop entries come from `TOWERS` in array order** — the same order the number keys bind to
   (`dev/placement.ts` established it, 8C inherits it). No sorting, no grouping by role.
5. **`unlocked` is `true` for all three towers today.** The field exists so step 20's unlock
   progression is a data change and not a component change. Say that in a comment, so the next
   session doesn't delete it as dead.
6. **Noise reads `world.noise.level` and `.cap`**, not a literal 0. The state is real and populated
   by `createWorld`; only `noiseSystem` is the stub. Step 13 then lights the meter with no edit here.
7. **The early-call bonus is one exported function in `core/`, not a formula the UI repeats.** Add
   `earlyCallBonus(world): number` to `core/systems/commands.ts`, have `callWaveEarly` pay exactly
   that, and have the view model preview exactly that. Same shape as `refundFor`, for the same
   reason. Symptom of getting this wrong: the button promises `+14`, the wallet gains `+12`, and it
   survives for months because nobody watches both at once.
8. **`night.enemiesKilled` is a new field on `NightState`**, incremented in `resolveSystem` where the
   `enemyKilled` event is pushed. The summary shows it and step 20's scoring assumes it is "already
   being tracked". A tally kept in the UI off `world.events` cannot be replayed, cannot be asserted
   in a spec and does not exist for the balance harness. Adding the field breaks
   `tests/fixtures/world.ts` — that is the fixture doing its job, not a problem.
9. **Rejection reasons get their English through the `contentKeys.ts` pattern**:
   `type RejectionMessages = Record<PlacementRejection, string>` satisfied by `en.ts`. When step 10
   adds a ninth reason for barricades, the build fails instead of a toast rendering `onTrack`.
10. **The view model carries keys, never English** — `nameKey` off the def, `item.nameKey` off the
    food, a rejection key derived from the vocabulary. `core/` cannot translate and `ui/` resolves;
    this is CLAUDE.md's *Strings* rule and the snapshot is exactly where it gets broken first.
11. **`fps`, `tickCount`, `simSeconds` and `entityCount` do not go in the HUD snapshot.**
    `GameView.vue`'s existing dev `Snapshot` keeps feeding `DebugOverlay.vue`. Two objects published
    from the same `publish()` call is cheaper than one shipping type carrying dev counters.
12. **Clock formatting lives in `ui/`**, built from `nightClock`'s `{ hour, minute }`. Never a second
    clock counting its own ticks, and never an hour stored on the world.
13. **`ui/selection.ts` is A's**, even though only B and C use it — three sessions meeting the same
    "where does the selected tower id live" question will answer it three ways. It imports `vue` for
    `ref`; decision 1's no-`vue` rule is about `viewModel.ts` alone.

## Build

### 1. `core/systems/commands.ts` — `earlyCallBonus`

Export it, and make `callWaveEarly` call it. Keep the two constants private behind it.

Two edge cases the preview has to share with the payer: it is **0 outside `phase === 'countdown'`**,
and it floors partial seconds (a 91-tick countdown is 1 second of bonus, not 1.51).

### 2. `core/types.ts`, `core/systems/resolve.ts` — `night.enemiesKilled`

One field, one `++`, one line in `createWorld`, one line in `tests/fixtures/world.ts`. Nothing else
reads it yet; the summary in 8B does.

### 3. `ui/viewModel.ts`

The types first — they are what 8B builds its props against and 8C fills.

```
HudSnapshot {
  clock: { hour, minute }            // formatted in ui/, not here
  wave: { index, count }             // index is 0-based; the HUD shows index + 1
  phase: NightPhase
  crumbs, groceryMoney
  crumbsOnBoard: { piles, value, rotting }
  food: { remaining, total, lostNameKeys, lastLostNameKey }
  noise: { level, cap }
  countdownTicks, earlyCallBonus
  speed, paused
  shop: ShopEntry[]
  inspector: TowerInspectorView | null
  summary: NightSummaryView | null   // non-null only in 'won' / 'lost'
}
```

- `ShopEntry { id, glyph, nameKey, descriptionKey, cost, affordable, unlocked, stats }`.
  **`affordable` is `world.crumbs >= cost`** — `>=`, not `>`. `canPlaceTower` rejects only on
  `crumbs < cost`, so a 50-crumb tower with exactly 50 crumbs is buildable; a shop that dims it is a
  shop that lies about the one purchase the player is waiting to make.
- `TowerStatsView` — the hover card: `damage`, `ratePerSecond`, `dps`, `rangeTiles`, `damageType`,
  `targets`, `noise`, and for an economy tower `crumbsPerSecond` and `collectRadiusTiles` instead.
  Derive from the def's behaviours through `isAttack` / `isCollect`; a tower with neither gets nulls
  rather than zeroes, because `0 damage` and `no attack` are different things on a card.

  Gotcha: rate is `60 / cooldownTicks`, and `perSecond()` in `towers.ts` **rounds** on the way in — a
  0.15/sec tower is 400 ticks and comes back out as `0.15`, but a 0.3/sec one is 200 and comes back
  `0.3` only because the rounding happened to be exact. Round the derived numbers to two decimals
  here, in the view model, or the card eventually prints `0.15000000000000002` and it looks like a
  simulation bug.
- `TowerInspectorView` — glyph, `nameKey`, `tier`, live `TowerStatsView`, `targetingMode`,
  `refund`, and `refundIsPenalised` (`phase === 'wave'`). Refund comes from `refundFor`, never a
  second 0.7 written here: the number under the sell button has to be the number the sale pays.
- `NightSummaryView` — `won`, `wavesSurvived`, `waveCount`, `foodLostNameKeys`, `foodRemaining`,
  `enemiesKilled`, `crumbsCollected`, `crumbsDropped`. `wavesSurvived` is `waveIndex + 1` on a win
  and `waveIndex` on a loss (you did not survive the one that emptied the fridge).

Then `buildHudSnapshot(world, view: { speed, paused }, inspector = null): HudSnapshot`,
`buildTowerInspector(world, towerId): TowerInspectorView | null` (null for an id that has been sold —
normal, not an error, exactly like `towerById`), and `buildNightSummary(world): NightSummaryView`.

`crumbsOnBoard` walks `world.crumbPiles` once for all three numbers, using `isRotting`. **Piles and
value are both needed** and neither substitutes: forty specks and one fat pile are the same count and
nothing like the same wallet (`dev/nightHud.ts` learned this and is about to be deleted; the lesson
isn't).

`lastLostNameKey` is the last `lost` item in `night.food` order. Theft takes from the front and
nothing is ever spliced, so "the most recently lost" is the highest lost index, not the last element.

### 4. `ui/locales/en.ts` and `ui/locales/contentKeys.ts`

Every string 8B and 8C will render. Write them now, in one pass, in the voice
`../../analytic-docs/DECISIONS.md` §1 sets — 8C revises this copy after playing, and both files say
so.

- `hud.*` — extend what is there: the shop, the stat-card labels (damage / rate / dps / range / type
  / targets / noise / income / collect), the inspector, the wave controls, the countdown, the
  early-call bonus, the crumbs-on-board readout.
- `hud.reject.*` — one per `PlacementRejection`, satisfied through `RejectionMessages`. Write them as
  the player's problem, not the validator's: "can't build on the track", not "TRACK flag set".
- `night.*` — the summary. `night.foodLost` is the line
  `../../analytic-docs/DECISIONS.md` §6 calls the emotional payload; give it a list separator and use
  `general.and` for the last item rather than inventing a second one.
- Nothing English is added to `core/`, and no `t()` call appears in `viewModel.ts`.

### 5. `ui/selection.ts`

```
interface Selection {
  selectedDefId: Ref<DefId | null>       // reactive: changes on a click or a number key
  selectedTowerId: Ref<EntityId | null>  // reactive: drives the inspector
  hoverTile: Vec2 | null                 // PLAIN. mutated on every pointermove
  hoverPoint: Vec2 | null                // PLAIN. fractional, waypoint space
  tone: PlacementTone | null             // PLAIN. one canPlaceTower answer per move
  reason: PlacementRejection | null      // PLAIN. what the toast says on a refused click
  clear(): void
}
```

**The hover fields are deliberately not refs.** A pointermove fires 60+ times a second and a `ref`
there re-renders the whole HUD on every one of them. The ghost is drawn on the canvas, which reads
plain state at draw time and needs no reactivity at all. Symptom if you make them refs: step 8's
frame-time acceptance fails, and it gets blamed on "Vue costs something" rather than on one field.

`clear()` drops both selections, which is what 8C calls on Escape and on a night restart.

## Tests

`tests/viewModel.spec.ts`, plus one extension to the night suite. These are the assertions that catch
silent drift; do not add one for "the snapshot has a crumbs field".

- **The bonus preview equals the payout.** Build a world in `'countdown'` with a countdown that is
  not a whole number of seconds (91 ticks), read `snapshot.earlyCallBonus`, then run `tick()` with a
  `CallWaveEarly` command and assert the wallet delta is exactly that number.
- Outside `'countdown'` the preview is 0 and the command pays nothing.
- **Affordability flips at exactly the cost.** With `crumbs === def.cost` the entry is `affordable`
  **and** `canPlaceTower` on a legal tile returns `ok: true`; with `cost - 1` both flip.
- **Refund preview equals `refundFor`** for a `totalInvested` that doesn't divide evenly: 70% floored
  during `'countdown'`, 50% floored during `'wave'`, on the same tower, in the same spec.
- `nightClock` through the snapshot: wave 0 of a 6-wave night is 2:00, wave 5 is 6:00, and a 1-wave
  night does not divide by zero.
- **Food:** `remaining` counts `!lost`; `lostNameKeys` is in stocked order; with every item lost,
  `remaining` is 0 and `total` is still `food.length` (the array is never spliced).
- **The snapshot is detached.** Build it, then mutate the world — spend crumbs, mark a food item
  lost, push an enemy, drop a crumb — and assert the snapshot is unchanged. Then assert
  `JSON.parse(JSON.stringify(snapshot))` deep-equals the snapshot, which catches a `Map`, a class
  instance or an accessor sneaking in.
- **`night.enemiesKilled` equals the number of `enemyKilled` events** emitted over a scripted night
  run in `tests/night.spec.ts`'s style — count the events across every tick, compare once at the end.

## Acceptance

- [x] `ui/viewModel.ts` imports nothing from `vue`, `render/` or `dev/`, and contains no English
      literal.
- [x] No entity array appears anywhere in `HudSnapshot` — searching the file for `Enemy[]`,
      `Tower[]`, `Crumb[]` or `FoodItem[]` finds nothing.
- [x] `en.ts` still satisfies its content types, and adding a fake ninth `PlacementRejection` to the
      union makes `type-check` fail. Try it, then take it out.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green, and the
      game still plays exactly as it did at the end of step 7 — this session changes nothing you can
      see.

## Hands to 8B and 8C

The contract the next two sessions build against. If you change a signature, change it here too.

**Changed while building:** `buildHudSnapshot` grew a third, defaulted parameter. Decision 3 says the
inspector is built on selection change and not at 15Hz, but `HudSnapshot` carries an `inspector`
slot — and a builder that derived it would quietly demote it to 15Hz, while one that hard-coded
`null` would have the caller merging a field back into an object it just replaced wholesale. So the
caller passes the inspector it already holds. Two-argument calls are unaffected.

```
ui/viewModel.ts   buildHudSnapshot(world: World, view: { speed: Speed; paused: boolean },
                                   inspector?: TowerInspectorView | null): HudSnapshot
                  buildTowerInspector(world: World, towerId: EntityId): TowerInspectorView | null
                  buildNightSummary(world: World): NightSummaryView
                  type HudSnapshot, ShopEntry, TowerStatsView, TowerInspectorView, NightSummaryView

ui/selection.ts   createSelection(): Selection      // refs for the two ids, plain fields for hover

core/systems/commands.ts   earlyCallBonus(world: World): number
core/types.ts              NightState.enemiesKilled: number
```

8B renders these and emits intents. 8C mutates `Selection` and enqueues commands. Neither of them
adds a field to the snapshot without adding it here.

## Do not

Write a `.vue` file, a component, a toast, a pointer handler or a key binding — B and C own those and
the whole point of this session is that they start with the data already settled. Do not delete
`dev/placement.ts` or `dev/nightHud.ts` (C does, after their replacements exist). Do not change
`loop.ts`'s publish cadence or its `Speed` type. Do not add `upgrades` to `TowerDef` (step 12), a
noise consumer (step 13), or a Grocery Money formula (step 20) — the summary shows the raw numbers
this step already tracks and nothing more.
