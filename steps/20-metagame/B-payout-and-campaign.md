# Step 20B — The night's pay and the campaign's rules, headless

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §7, `../../analytic-docs/CONTENT.md`
§8 (the formula, above the installations table) and §6 (the table's *Unlocks tower* column only).
**Prereq:** step 20A.

## Goal

A night that pays out, and the rules of a campaign as pure functions. At the end of a night the
world knows exactly what Grocery Money it earned and why, term by term. Towers unlock night by night,
and a world refuses a tower that isn't unlocked. `core/campaign.ts` says how one night's result, or
one purchase, turns a player's progress into the next progress. All of it is headless, so step 22's
harness can play a campaign with the same rules the game uses. Nothing is saved (C) or drawn (D, E).
**This part carries the scoring, unlock and campaign tests.**

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/types.ts` (`NightState`) | `ticksSkippedTotal`, `crumbsDropped`, `crumbsCollected` (both summed **value**) and `enemiesKilled`, each documented as "step 20's scoring reads it". `World.groceryMoney` exists and **nothing writes it**. Its only reader is `HudSnapshot.groceryMoney` in `ui/viewModel.ts`, which feeds a TopBar chip showing 0 all night. `Difficulty.groceryMoneyMult` |
| `core/types.ts` (`NoiseState`) | `level`, `cap`, `decayPerTick`, `wakeCount`. **No peak.** 13A kept it off because nothing read it |
| `core/systems/noise.ts` (`noiseSystem`) | Accumulates shots, decays and clamps to `cap`, and on `>= cap` wakes and sets `level = 0` **in the same call** |
| `core/systems/resolve.ts` (end of `resolveSystem`) | The lost branch sets `'lost'` and then pushes `nightEnded`. The won branch sets `'won'`, calls `forfeitDroppedFood` and then pushes `nightEnded` |
| `core/content/schema.ts` | `night` is `{ id, index, mapId, waves }`. The tower block's comment reserves "unlock state (step 20)". `checkUpgradeTiers` / `checkPushbackRiders` are the cross-collection check pattern |
| `core/content/nights.ts` | `NIGHTS`, positional, 1–18 once 19D lands night 14. The notes above `night09` and `night13` say their unlocks are step 20's |
| `core/content/towers.ts` | `TOWERS` is **not** in unlock order. `POST_V1_TOWERS = [mintPot]` carries a comment saying step 20 might move it into the shop. That's stale: Mint Pot unlocks at night 21, post-v1 |
| `core/systems/placement.ts` | `canPlaceTower` and the `PlacementRejection` union. `ui/locales/contentKeys.ts` demands a `hud.reject.*` string per member |
| `core/content/installations.ts` (20A) | `INSTALLATIONS`, `resolveModifiers(ids)` |
| `tests/fixtures/world.ts` | A literal world whose `nightId` is `'test'`, which **isn't a night**, and whose phase is **already `'won'`**. `tests/viewModel.spec.ts` builds HUD snapshots, and so summaries, from it |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **Each term is rounded to a whole dollar where it's computed.** Then `subtotal` is their sum and
   `total = round(subtotal × difficulty.groceryMoneyMult × (won ? 1 : GROCERY_LOSS_RATE))`. E's
   summary lists the terms, and they have to add up to the line under them.
2. **`GROCERY_LOSS_RATE = 0.4`**, exactly. DECISION-LOG's table settles the step's "say 40%".
3. **Cleanliness is `min(1, collected / dropped)`, and 1 when nothing was dropped.** 0/0 is `NaN`, and
   a floor nothing fell on is clean. The clamp is for step 21's pre-scattered crumbs, which can be
   collected without ever being dropped.
4. **`earlyCall = 2 × floor(ticksSkippedTotal / 60)`**, one division, where seconds are needed
   (the field's own docstring says so).
5. **`foodSaved` counts `!isGone`** at the terminal tick. On a win, `forfeitDroppedFood` has already
   run and the board is empty, so nothing is carried. On a loss everything is gone, which makes the
   term 0.
6. **`resolve` stores the whole breakdown: `world.night.pay = groceryMoneyFor(world)`**, in both
   terminal branches, immediately before `nightEnded`, and after `forfeitDroppedFood` on a win. It's
   `null` until then. `World.groceryMoney` is **deleted**: it would be a second copy of `pay.total`.
   `HudSnapshot.groceryMoney` reads `world.night.pay?.total ?? 0` for now (E removes the chip).
   Stored rather than recomputed by each reader for three reasons. `nightResultOf`, E's summary and
   step 22's harness all read the one computation. The summary doesn't redo a night lookup at 15 Hz.
   And the fixture world, already `'won'` with a `nightId` of `'test'`, gets `pay: null` instead of
   making every `buildHudSnapshot` spec throw inside `getNightDef('test')`.
   *As built:* one more spec file met this. `theft.spec`'s `makeWorld` makes the fixture live and three
   of its specs play the night to an end, so `resolve` scored `'test'` and threw. That helper now sets
   `nightId: 'night01'`, and the fixture's doc comment says why. The fixture itself stays `'test'`.
7. **`NoiseState.peakLevel`, written in `noiseSystem` after the clamp and before the wake's
   `level = 0`.** A reader outside the tick never sees the cap on a wake tick, because the level is
   already 0 by then. The summary is its reader, which is what 13A said it lacked. Step 22's
   `peakNoise` line was updated in the split's commit to read it.
8. **Unlocks are authored on the night: `NightDef.unlocksTowerIds?: DefId[]`**, following §6's own
   column. The unlocked set is the union over every night whose index is `<=` the current night's.
   It's **derived, never persisted**: one truth, and moving a tower's unlock night reaches old saves.
   Optional in the schema, so the synthetic nights in `spawn.spec`, `charges.spec` and `spread.spec`
   don't change. A cross-check in `validateContent` rejects an unlock naming a tower that doesn't
   exist, and one named twice. `unlockNightOf(towerId): number | null` goes in
   `core/content/index.ts`.
9. **Mint Pot stays in `POST_V1_TOWERS`.** Its unlock night is 21. Rewrite the stale comment.
10. **`NightState.availableTowerIds: DefId[] | null`, from `CreateWorldOptions.availableTowerIds`,
    where `null` means unrestricted.** That's the default, and it's what `createTestWorld` uses.
    **Not "every `TOWERS` id at creation":** a dozen specs push a synthetic tower into `TOWERS`
    *after* building their world, and a snapshot list would refuse every one of them with `locked`.
    `canPlaceTower` rejects `'locked'` right after `nightOver`, so the refusal names the real reason
    and not a price. 20a narrows this field to the loadout.
11. **`core/campaign.ts` is pure and returns new objects.** It never mutates its input: C's store
    applies a reducer, saves the result and assigns it only on success, and that only works if the
    old state is untouched.
12. **`Progress` is `{ nightId: DefId | null; groceryMoney; installations: DefId[];
    nightResults: Record<DefId, NightRecord>; difficulty: DifficultyId }`**, where `nightId` is the
    next night to play and `null` means the campaign is done. `NightRecord` is
    `{ attempts, wins, bestGroceryMoney }` and no more, since statistics screens are step 23.
13. **`difficulty` is `'normal'` in `newProgress()`.** Step 21 builds the selector. Loadouts aren't on
    `Progress` (20a).
14. **`applyNightResult` always pays and advances only on a win of the current night.** A loss keeps
    `nightId`, so the next night's unlock isn't granted: that's "does not consume the unlock". The
    campaign is linear and a won night isn't replayable, so Grocery Money can't be farmed on night 1.
    A result for any other night pays and records but doesn't move `nightId` (D's dev night picker
    never records, but the rule should hold anyway).
15. **`worldOptionsFor(progress, seed): CreateWorldOptions`** is the one translation from progress to
    a world: map, night, difficulty, `resolveModifiers(installations)` and the unlocked set. `GameView`
    (D) and step 22's harness both call it, so they can't build different nights from the same save.

## Build

### 1. `core/systems/scoring.ts` and the award

`groceryMoneyFor(world): GroceryMoneyBreakdown`. It returns every term (`base`, `foodSaved`, `kills`,
`cleanliness`, `noWake`, `earlyCall`), `subtotal`, `difficultyMult`, `lossMult` and `total`, plus the
inputs E prints beside them: `itemsRemaining`, `enemiesKilled`, `cleanlinessRatio`,
`secondsSkipped`, `woke`. Decisions 1–6. `base` uses `getNightDef(nightId).index`, 1-based.

Gotcha: **`Math.round` after a float multiply can land on the wrong side of .5.** `275 × 0.7` is
`192.49999999999997`. Don't "fix" it with an epsilon nobody will remember. Pick test fixtures whose
products aren't on a half, and say why in the spec. The one exception is the nightmare total below.
`275 × 1.5` is `412.5`, a half, but 1.5 and 412.5 are both exact in binary, so it is a true half
and rounds up to 413 everywhere. No cozy total is asserted.

### 2. Peak noise

Decision 7, `NoiseState.peakLevel`, 0 in `createWorld` and in the fixture.

### 3. Unlocks: `schema.ts`, `nights.ts`, `index.ts`, `placement.ts`

Decisions 8–10. The eighteen nights' `unlocksTowerIds` from §6, with night 14's Fly Paper included.
Rewrite the notes above `night09`, `night13` and `night14`. Night 14's also said its unlock was
"step 20's". The notes above nights 12 and 16 name their unlocks without deferring them, so they stay. Add a `'locked'` member to `PlacementRejection` and
its English in `en.ts` in the `hud.reject` idiom. `contentKeys.ts` will insist.

### 4. `core/campaign.ts`

Decisions 11–15. `newProgress()`, `currentNight(progress)`, `unlockedTowerIds(progress)`,
`nightResultOf(world)` (which reads `night.pay` and throws while it's `null`), `applyNightResult`,
`buyInstallation` (an unknown id throws, like every lookup, and it returns a typed refusal for
`'owned'` / `'tooExpensive'`) and `worldOptionsFor`. `core/index.ts` re-exports it.

## Tests

`tests/scoring.spec.ts` and `tests/campaign.spec.ts`, plus extensions to `content.spec`,
`noise.spec` and `placement.spec`.

**Build scoring fixtures from `createWorld` on a real night**, then set the counters by hand. The
fixture world's `nightId` is `'test'`, and `getNightDef('test')` throws.

- **The fixture night, every term separately:** night 5, 14 items left, 37 kills, 90 of 120 crumbs
  collected, no wake and 750 ticks skipped. That's `base 50`, `foodSaved 112`, `kills 9`,
  `cleanliness 30`, `noWake 50`, `earlyCall 24`, `subtotal 275`, a total of 275 on normal and 413 on
  nightmare.
- **A loss pays exactly 40%:** the same night with every item gone and `phase: 'lost'` has `foodSaved`
  0, `subtotal` 163, `lossMult` 0.4 and `total` 65.
- Nothing dropped scores `cleanliness` 40, never `NaN`.
- A night driven to its end through `resolveSystem` has `night.pay` deep-equal to
  `groceryMoneyFor(world)` on the tick `nightEnded` is pushed, for a win and for a loss. It's `null`
  on every tick before.
- On a wake tick, `peakLevel === cap` while `level === 0`.
- **The unlock table is §6's:** a literal map of night index to tower ids. Every `TOWERS` id appears
  exactly once, and no `POST_V1_TOWERS` id appears at all.
- A world with `availableTowerIds: ['saltShaker']` refuses a Mousetrap with `'locked'` and places a
  Salt Shaker. `null` places anything.
- **A loss doesn't consume the unlock:** `applyNightResult` with a lost night-3 result adds the award,
  keeps `nightId` at night 3, leaves `unlockedTowerIds` unchanged and bumps `attempts` but not
  `wins`. A win moves to night 4 and adds the Cookie Jar. A win of night 18 sets `nightId` to `null`
  and unlocks all nineteen.
- `buyInstallation` deducts exactly the cost, refuses an owned one and an unaffordable one, and never
  goes negative.
- **Purity:** every reducer run on a deep-frozen `Progress` returns a new one and throws nothing.
- `worldOptionsFor` on a progress owning the broom builds a world whose `modifiers.sweepRadiusTiles`
  is the broom's, and whose `availableTowerIds` is `unlockedTowerIds(progress)`.

## Acceptance

- [x] `groceryMoneyFor` is the only function in `src/` that computes Grocery Money. Only `resolve`
      calls it, everything else reads `night.pay`, and nothing else multiplies by a difficulty's
      `groceryMoneyMult`.
- [x] Nothing in `core/campaign.ts` mutates an argument.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 20C

```
core/campaign.ts         interface Progress { nightId: DefId | null; groceryMoney: number; installations: DefId[];
                                              nightResults: Record<DefId, NightRecord>; difficulty: DifficultyId }
                         interface NightRecord { attempts: number; wins: number; bestGroceryMoney: number }
                         interface NightResult { nightId: DefId; won: boolean; groceryMoney: number }
                         newProgress(): Progress
                         currentNight(progress): NightDef | null
                         unlockedTowerIds(progress): DefId[]
                         nightResultOf(world): NightResult
                         applyNightResult(progress, result): Progress
                         buyInstallation(progress, id): { ok: true; progress: Progress }
                                                      | { ok: false; reason: 'owned' | 'tooExpensive' }
                         worldOptionsFor(progress, seed): CreateWorldOptions
core/systems/scoring.ts  groceryMoneyFor(world): GroceryMoneyBreakdown;  GROCERY_LOSS_RATE
core/content/index.ts    unlockNightOf(towerId): number | null;  getInstallationDef(id)   // throws on an unknown id
core/types.ts            NoiseState.peakLevel;  NightState.availableTowerIds: DefId[] | null
                         NightState.pay: GroceryMoneyBreakdown | null     // World.groceryMoney is gone
```

## Do not

Save anything, or touch `data/`, `ui/stores/` or `ui/composables/` (C). Don't change the summary
screen, the shop or the HUD (E), beyond the one `HudSnapshot.groceryMoney` line decision 6 needs. Don't add loadouts (20a), a difficulty selector (step 21) or night
statistics beyond `NightRecord` (step 23).
