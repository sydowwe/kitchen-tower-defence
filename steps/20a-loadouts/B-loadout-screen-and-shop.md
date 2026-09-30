# Step 20aB — The loadout screen, and the shop that follows it

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §1 (tone) and §10,
`../../analytic-docs/CONTENT.md` §1 (the *Roles* line only) and §8 (*Loadout slots* only).
**Prereq:** step 20aA.

## Goal

What you set out on the counter before bed. A screen between the Kitchen and the night, showing
tomorrow night's whole composition with every enemy's tags, beside a counter with room for five
things, filling as you choose, and the towers you own that you could put on it. The drying rack, the
toaster and the missing shelf sit where the sixth, seventh and eighth would go. Losing a night brings
you back here with what you brought still on the counter. In the night, the shop is your shop: the
towers you left upstairs aren't greyed out, they aren't there. **This part carries view-model tests
only**, over `ui/loadoutView.ts`, `ui/kitchenView.ts` and the shop in `ui/viewModel.ts`. A carried the
headless ones.

## Already in the repo

Trust symbols over line numbers.

| File | What's there now |
| --- | --- |
| `core/loadout.ts`, `core/campaign.ts` (20aA) | `addToLoadout`, `removeFromLoadout`, `checkLoadout`, `LoadoutProblem`. `loadoutSlots`, `tonightsLoadout`, `previousLoadout`, `setLoadout`, `unlockedTowerIds`, `Progress.loadouts` |
| `ui/stores/progress.ts` (20aA) | `chooseLoadout(ids)`, pessimistic, building on a pending failed save. The store owns the one `status` |
| `ui/stores/session.ts` | **Empty.** 20C reserved it for this part's draft |
| `router.ts` | `'title'` `/`, `'kitchen'` `/kitchen`, `'night'` `/night`, a dev-only editor, and a catch-all to `'title'`. No guard (20D, decision 2) |
| `ui/views/KitchenView.vue`, `ui/components/kitchen/NightPreview.vue` | The preview's `start` emit goes straight to `'night'`. Its button reads `kitchen.preview.start`, "Wait for 2am" |
| `ui/kitchenView.ts` (`buildPreview`, `NightPreviewView`) | Night number, `mapNameKey`, wave count, tonight's `unlocks`, and the enemies it `introduces`. `buildPreview` isn't exported. 20D decision 5 left the full composition to this part |
| `ui/views/GameView.vue` | `@retry="restart"` from the summary. `records` is false under any dev override (a picked night, the noise panel, an editor preview) |
| `ui/components/hud/NightSummary.vue` | Retry is shown on a lost night only and emits `retry`. Both buttons wait on `saveState === 'saving'`. **Retry stays enabled on `'failed'`** |
| `ui/viewModel.ts` (`shopOrder`, `inLoadout`, `hotkeyTowers`, `buildShop`, `ShopEntry`) | Every tower in unlock order, `unlocked: inLoadout(…)`, `unlockNight`, and a `hotkey` off `hotkeyTowers`. `statsFor(def)` builds a `TowerStatsView` and **isn't exported** |
| `ui/components/hud/TowerShop.vue` | A not-`unlocked` entry is `disabled`, with "Night N" or a `lock` icon where the price goes. `en.ts` has `hud.locked` and `hud.unlocksOnNight` for it |
| `ui/components/hud/StatCard.vue` | The shop's hover card: `stats` and `descriptionKey`. Styled on the **night** roles (`--kd-panel`, …) |
| `ui/interaction.ts` (`armedDef`, the keydown) | Already reads `inLoadout` / `hotkeyTowers(world.night.loadout)` after A. No change needed |
| `ui/locales/en.ts` | `hud.tag.*` for every `EnemyTag`. **No English for tower roles.** A's first-draft copy for the three new installations, and `kitchen.effect.loadoutSlots` |
| `ui/components/kitchen/KitchenScene.vue` (`SPOTS`) | A's placeholder spots for the three new installations |
| `ui/components/EntityGlyph.vue` | *If it's in the tree* (it was uncommitted sprite work at split time): a tower's or enemy's sprite, else its emoji. **Towers and enemies only.** An installation's glyph can collide with a tower's |
| `tests/viewModel.spec.ts` (`describe('the shop order')`) | 20E's specs on greyed entries and "the same key on night 3 and night 9". This part rewrites them |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **A route: `'loadout'` at `/kitchen/loadout`, `ui/views/LoadoutView.vue`**, in the daylight
   `--kd-day-*` roles. It's not a panel inside the Kitchen page. Retry lands on it directly, a reload
   keeps you on it, and the Kitchen page already holds the scene, the preview and fourteen cards. The
   path sits under `/kitchen` because it's part of the hub.
2. **`ui/loadoutView.ts`, pure**, the loadout's `kitchenView.ts`. Components import it and never
   `core/`. It exports:
   - `buildLoadoutView(progress, selection): LoadoutView`.
   - `selectionFor(progress, draft)`: the draft if it's for tonight and passes `checkLoadout`,
     otherwise `tonightsLoadout(progress)`.
   - `toggleTower(progress, selection, id)`: removes the tower if it's chosen, otherwise
     `addToLoadout` at `loadoutSlots(progress)`.

   The view carries:
   - the preview;
   - `slots`;
   - `counter`, the chosen towers in selection order;
   - `blocked` (decision 6);
   - `roster`, every unlocked tower in `shopOrder`, each with glyph, keys, `role`, `stats`, `chosen`
     and `isNew`, where new means tonight unlocks it;
   - `roles`, the roles present among the unlocked;
   - `lastNight`, the preset;
   - `problem`, `checkLoadout`'s answer.
3. **The full composition goes on `NightPreviewView` as `enemies`**:
   `{ id, glyph, nameKey, tagKeys, count, firstWave }` per enemy in tonight's waves, ordered by first
   appearance. `tagKeys` are the existing `hud.tag.*`. `count` is the **authored** counts summed
   across every wave, and `firstWave` is 1-based. There's one builder, in `kitchenView.ts`. Export
   `buildPreview` for `loadoutView.ts`. The Kitchen keeps its short preview, and this screen shows the
   whole list.
   - **Authored counts, not scaled.** A world-exact count would copy `startWave`'s per-cursor rounding,
     the crack's cut and the window screen's shift into `ui/`. Until step 21's difficulty selector,
     every campaign is normal, where the authored count is exact apart from those two installations.
   - The map is its name. Its shape and the night modifier arrive with step 21, which now says so.
   - Fruit flies that hatch from rot aren't a wave and aren't listed.
4. **The draft lives in `useSessionStore()`**: `loadoutDraft: { nightId: DefId; towerIds: DefId[] }
   | null`, written on every click and cleared when Start's save lands. It's a store and not a
   component `ref` so the draft survives a trip to the Kitchen to buy the Drying Rack, and step 23's
   Codex link. It's never persisted: the chosen loadout is, by Start (A's seam).
5. **The way through.**
   - The Kitchen's preview button goes to `'loadout'`, and its copy changes from "Wait for 2am".
   - The loadout screen's Start carries "Wait for 2am". It calls `chooseLoadout(selection)`, and on
     `'ok'` clears the draft and pushes `'night'`. It's disabled while the store is busy or `problem`
     isn't null.
   - On `'failed'` (and on any store `'error'`, including a night save that failed before you got
     here), the screen shows one line and the store's retry, 20D's Kitchen idiom.
   - A finished campaign `replace`s to the Kitchen, and there's a way back to the Kitchen.
   - **The summary's Retry on a campaign night pushes `'loadout'`.** Under a dev override (`records`
     false) it still calls `restart()`, because the loadout screen builds tonight from progress and
     would silently drop the picked night.
6. **The counter shows all eight spaces.** The first `slots` hold the chosen towers left to right in
   selection order, then empty ones. The rest are **occupied by the installation that would clear
   them**: one space per unowned `loadoutSlots` installation, in `INSTALLATIONS` order, with its glyph
   dimmed and its name on hover. That's the fiction (the drying rack is on the counter), and it's how a
   player finds out the three installations exist. `LOADOUT_MAX_SLOTS` minus `slots` equals the number
   of those spaces, and the builder should throw if the two ever disagree. Clicking a chosen tower on
   the counter takes it back off.
7. **The in-night shop is `shopOrder()` filtered by `inLoadout`.** Drop `ShopEntry.unlocked` and
   `unlockNight`, `TowerShop`'s disabled branch, `hud.locked` and `hud.unlocksOnNight`. Drop `faLock`
   from `icons.ts` if nothing else uses it, and check `UpgradeSlot.vue` first. **The order stays
   `shopOrder`, not the loadout's selection order:** 20E decision 5's one order, so the badges and the
   keydown can't disagree. With at most eight towers every one has a key. **Print no key badges on the
   loadout screen**, because its counter is in selection order and a badge there would name the wrong
   tower.
8. **Roles get English:** `loadout.role.<ROLE>` in `en.ts`, typed as `RoleMessages =
   Record<TowerRole, string>` in `contentKeys.ts`, the `TagMessages` trick. The filter is "all" plus
   each role in `roles`. It's component state, not the draft. A chosen tower hidden by the filter
   stays chosen and stays on the counter.
9. **Stats on hover reuse `StatCard`** with `statsFor(def)`, now exported. On focus as well as hover,
   the shop's idiom. It's styled for the night, so look at it on the daylight screen before deciding
   whether it needs a day variant.
10. **The new tower is marked on the roster**, and it stays marked while it isn't on the counter. A
    deliberately never swaps it in by default. This mark is what hands the player that first cut.
11. **Glyphs:** `EntityGlyph` for towers and enemies if it's in the tree, plain text for the blocked
    installations. **Author the three installations' English and scene spots again** (A drafted them),
    in DECISIONS.md §1's voice: what changed in the kitchen, never a number. Write the loadout
    screen's copy in the same voice. It's what you set out before bed, not a "loadout".

## Build

### 1. The builders: `ui/kitchenView.ts`, `ui/loadoutView.ts`, `ui/viewModel.ts`

Decisions 2, 3, 6, 7 and 10.

Gotcha: **the "last night's" preset compares as a set.** `lastNight` is null when `previousLoadout`
is null *or* when it holds the same towers as the selection in any order. Taking a tower off and
putting it back moves it to the end of the list. An order-sensitive check then shows a preset button
that does nothing when you click it.

### 2. The route, the store and the screen: `router.ts`, `ui/stores/session.ts`, `ui/views/LoadoutView.vue`, `ui/components/loadout/*`

Decisions 1, 4–6 and 8–11. Split it into components: the counter, the roster with its filter, and
the night's composition.

Gotchas:

- **Read `status` from the store, never a local `starting` flag.** 20D's card gotcha, same symptom:
  a spinner that outlives a failure the store has already moved past.
- **`selectionFor` runs when progress arrives, not at setup.** The view mounts before
  `ensureLoaded()` resolves on `mock`, and a selection computed from `null` progress stays empty. The
  screen then opens on an empty counter with Start disabled, and only on the slow adapter.
- **Selecting past capacity must be seen.** The oldest tower leaves the counter as the new one lands.
  If it just vanishes, the swap reads as a bug.

### 3. The way through, and the shop: `KitchenView.vue`, `NightPreview.vue`, `GameView.vue`, `NightSummary.vue` (comment only), `TowerShop.vue`

Decisions 5 and 7.

### 4. The copy: `ui/locales/en.ts`, `contentKeys.ts`, `KitchenScene.vue`

Decisions 8 and 11.

## Tests

`tests/loadoutView.spec.ts`, plus extensions to `kitchenView.spec` and a rewrite of `viewModel.spec`'s
`describe('the shop order')`.

- **Night 5, nothing owned:** six roster entries in shop order and five on the counter, equal to
  `tonightsLoadout`. The Spray Bottle is `isNew` and not chosen. `slots` is 5, and `blocked` is the
  Drying Rack, the Toaster and the Second Shelf, in that order.
- **Owning the Drying Rack:** `slots` is 6, `blocked` is the other two, and the Spray Bottle is on the
  counter by default.
- **`toggleTower`:** a sixth tower at five slots drops the oldest. A chosen one comes off. Taking
  every one off leaves `problem` as `'empty'`.
- **`selectionFor`:** a legal draft for tonight wins. A draft for another night, or one naming a
  tower not yet unlocked, is ignored for `tonightsLoadout`.
- **`lastNight`:** null with no previous night stored, null when it's the same set as the selection
  in a different order, and present when it differs.
- **The composition:** each enemy in a night's waves appears once, in order of first appearance. The
  counts sum to the night's summed authored counts. `tagKeys` are the def's tags as `hud.tag.*`.
  Night 14 lists the Mouse with the wave it first appears in.
- **The shop contains exactly the loadout:** with `loadout: ['mousetrap', 'saltShaker']` the shop is
  the Salt Shaker then the Mousetrap (shop order, not the loadout's), keyed `'1'` and `'2'`. An
  eight-tower loadout keys all eight. `null` is all nineteen with ten keys. No entry carries
  `unlocked`.

## Acceptance

- [ ] Nights 1–4: everything unlocked is already on the counter, and starting is one click.
- [ ] Night 5 without the Drying Rack: the Spray Bottle is visibly new and visibly not on the counter,
      and putting it there visibly takes the oldest one off.
- [ ] Losing a night: Retry lands here with what you brought on the counter. Change it, start, and
      the shop in the night is the new loadout.
- [ ] A reload during the night rebuilds it with the loadout you chose.
- [ ] With `VITE_DATA_MODE=mock` and the dev toggle at 100%, Start shows the failure, and its retry
      works once the toggle is back at 5%.
- [ ] The night preview gives you enough to choose with. Try night 17 and pick its counters from the
      preview alone.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

Leave every judgement criterion unticked unless you actually sat and looked.

## Do not

Change `core/` or `data/`. If the screen needs a rule A didn't write, that's A's file and a note in
the commit. Don't add a Codex link (step 23), the map's shape or the night modifier on the preview
(step 21), endless mode (step 21), presets beyond "last night's", or a loadout choice anywhere inside
a night. Don't draw this screen on the canvas.
