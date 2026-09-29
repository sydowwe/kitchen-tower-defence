# Step 20E — The night summary, and the shop

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §1 (tone) and §6 (food: the
specificity paragraph), `../../analytic-docs/CONTENT.md` §8 (the formula only),
`../../analytic-docs/ARCHITECTURE.md` §5 (the snapshot).
**Prereq:** step 20D.

## Goal

The night summary becomes something worth reading. It gives the Grocery Money line by line so the
player learns what's rewarded, the food lost **by name**, the waves survived, how loud it got and
whether anyone woke. It's the screen that makes you want to play the night again, better. The shop
shows what's coming: locked towers greyed with the night they unlock, in the order they arrive, so the
number keys don't shift under your fingers when a new tower lands. And the broom you bought shows up
under the cursor. **This part carries a few view-model tests, over `ui/viewModel.ts`.**

## Already in the repo

Trust symbols over line numbers. 19C reshaped the summary and the food view after this was written.

| File | What's there now |
| --- | --- |
| `ui/viewModel.ts` (`buildNightSummary`, `NightSummaryView`) | `won`, `wavesSurvived`, `waveCount`, `foodLostNameKeys`, 19C's `foodEscapedNameKeys`, `foodRemaining`, `enemiesKilled`, and crumbs collected and dropped |
| `ui/viewModel.ts` (`buildShop`, `ShopEntry`) | `TOWERS` in array order, `unlocked: true` for all, and a note saying the field exists for step 20. `HudSnapshot.groceryMoney` reads `night.pay?.total ?? 0` (20B) |
| `ui/components/hud/NightSummary.vue` | 19C's split lost-food sentences, a `tally` list, a **stub** Grocery Money line fixed at 0, and D's save-state actions |
| `ui/components/hud/TowerShop.vue` | A locked entry is `disabled` with a `lock` icon. `keyFor(index)` badges 1–9 and 0 by **position**. Its note says the order is `TOWERS` order because that's what the keys bind to |
| `ui/interaction.ts` (keydown, `armedDef`) | Number keys index `TOWERS` directly. `armedDef` finds the armed id in `TOWERS`. Neither knows about availability |
| `ui/components/hud/TopBar.vue` | A Grocery Money chip from `groceryMoney`: 0 all night, then the award for the one frame before the summary covers it |
| `core/systems/scoring.ts`, `core/types.ts` (20B) | `NightState.pay: GroceryMoneyBreakdown \| null`, set on the terminal tick. Terms, subtotal, `difficultyMult`, `lossMult`, total, and the inputs (`itemsRemaining`, `enemiesKilled`, `cleanlinessRatio`, `secondsSkipped`, `woke`) |
| `core/types.ts` (20A, 20B) | `NoiseState.peakLevel`, `NightState.snackStashUsed`, `NightState.availableTowerIds` (`null` = all), `World.modifiers.sweepRadiusTiles` |
| `core/content/index.ts` (20B) | `unlockNightOf(towerId)` |
| `tests/fixtures/world.ts` | Already `'won'`, with `pay: null`. `tests/viewModel.spec.ts`'s summary specs build from it |
| `ui/locales/en.ts` (`night`) | Stub strings, including `groceryMoney` and `continueUnavailable` ("That is as far as the kitchen goes for now"), which is dead after D |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **The breakdown is `night.pay` copied field by field into `NightSummaryView.grocery`, or `null`
   when `pay` is.** It's never recomputed here: a second formula is a total that disagrees with the
   balance the Kitchen shows. The lines are base, food saved (with the count), enemies (with the
   count), cleanliness (with the percentage, `round(ratio × 100)`), no-wake (or a line saying you
   woke someone, worth 0, since a missing line teaches nothing), early calls (with the seconds),
   then the subtotal, the difficulty multiplier when it isn't 1, "a lost night pays 40%" when
   `lossMult` isn't 1, and the total.
2. **Food lost stays names in sentences.** 19C's escaped line comes first, then the eaten and floor
   ones, and never a count. Two cheeses lost are two names. That's DECISIONS.md §6, and the step
   calls it the emotional payload of the game.
3. **Noise is "peaked at 84 of 100"**, from `peakLevel` and `cap`, plus the wake count as a sentence.
   A night that never woke anyone says so, because that's worth 50.
4. **The shop is in unlock order:** by `unlockNightOf`, ties broken by `TOWERS` position. A tower that
   unlocks tonight is appended rather than inserted, so a key you learned on night 3 still arms the
   same tower on night 9. `ShopEntry` gains `unlockNight: number | null`, and `unlocked` becomes
   `availableTowerIds === null || availableTowerIds.includes(id)`. **Keys bind to the first ten
   unlocked entries** in that order. A locked entry gets no badge, can't be armed by key or click, and
   shows "Night N" where the price would be. 20a replaces this by hiding everything outside the
   loadout.
5. **One order, exported:** `shopOrder()` in `viewModel.ts` is what `buildShop`, the keydown binding
   and `TowerShop`'s badges all follow. Three orders are how a badge ends up reading 4 on the tower
   key 5 arms.
6. **The TopBar's Grocery Money chip goes.** Tonight's pay is the summary's, and the balance is the
   Kitchen's. A chip reading 0 for twelve waves teaches the player the currency doesn't move. Delete
   `HudSnapshot.groceryMoney` with it.
7. **The broom's ring:** while a crumb pile is hovered and `world.modifiers.sweepRadiusTiles > 0`,
   the overlay draws the sweep radius round **that pile's floor `position`**, which is what `core/`
   measures from, in the overlay's existing ring idiom. A purchase you can't see in play is one you
   forget you made. `OverlayView` gains `sweep: { at: Vec2; radiusTiles: number } | null`, drawn with
   `drawRangeCircle`. A crumb's `position` is in waypoint space, like a tower's `tile`, so it needs no
   conversion. Don't measure from `crumbPosition`, which is the *drawn* position and slides toward a
   collecting tower.
8. **The snack stash line:** when `snackStashUsed`, one sentence in the summary. It's the only place
   the player learns it fired.
9. **Copy:** DECISIONS.md §1's voice. Understated, situational, never a joke told to the player. The
   money lines name what the player *did* ("swept up 75% of the crumbs"), not the formula.

## Build

### 1. The view model: `ui/viewModel.ts`

Decisions 1, 3–6 and 8.

Gotcha: **the fixture world is `'won'` with `pay: null`**, so most specs that call
`buildHudSnapshot(createTestWorld(), …)` get a summary. A `grocery: null` summary has to build
without touching content. Run the whole `viewModel.spec` before and after.

### 2. The summary: `NightSummary.vue` and a component or two beside it

Decisions 1–3, 8 and 9. Keep D's actions and save state exactly as they are. Split the breakdown into
its own component if the file passes about 200 lines. Delete `continueUnavailable` and the stub line.

Gotcha: **the summary is the one HUD wrapper that takes pointer events**, and it's over the board.
Taller content needs to scroll inside the panel, not push the buttons off a 672-pixel-tall board.
Check at the smallest window you'd play in.

### 3. The shop and the keys: `TowerShop.vue`, `ui/interaction.ts`

Decisions 4 and 5. `armedDef` must refuse a locked id too. Arming a locked tower by a stale selection
and then clicking the board would get as far as 20B's `'locked'` refusal toast, which is correct
but shouldn't be reachable.

### 4. The TopBar and the broom: `TopBar.vue`, `HudLayer.vue`, `ui/interaction.ts` (`overlay`), `render/layers/overlay.ts`

Decisions 6 and 7.

## Tests

Extend `tests/viewModel.spec.ts`:

- A world driven to a win has `summary.grocery` field-for-field equal to `world.night.pay`, and its
  lines sum to its subtotal. A lost one carries `lossMult` 0.4. The fixture's summary has
  `grocery: null` and builds without throwing.
- `summary.peakNoise` is `peakLevel` and `cap`, and a woken night's wake count matches
  `noise.wakeCount`.
- The shop is in unlock order: the Salt Shaker and the Crumb Tray first, the Fan last, and the Cookie
  Jar after the Mousetrap. With `availableTowerIds` of night 3's unlocks, exactly four entries are
  unlocked and every locked one carries its unlock night. With `null`, all nineteen are unlocked.

## Acceptance

- [ ] The night summary makes you want to play the night better. You can say which line you'd
      improve.
- [ ] A lost night's summary still lists what was lost by name, and the 40% line reads as an
      encouragement rather than a fine.
- [ ] Number keys arm the same tower on night 3 and on night 9.
- [ ] With the broom owned, hovering a pile shows the sweep, and clicking takes everything inside it.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

Leave every judgement criterion unticked unless you actually sat and looked.

## Do not

Change `core/`. If the summary needs a number the world doesn't carry, that's 20B's file and a note
in the commit. Don't recompute Grocery Money, hide towers outside a loadout (20a),
add statistics across nights or a codex (step 23), or add a "next night" preview to the summary (the
Kitchen has it).
