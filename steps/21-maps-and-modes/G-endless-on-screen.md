# Step 21G — Endless on screen

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §1 (tone), §9 (the *Modes* line)
and §10 (*What this changes*, the fourth bullet: Retry).
**Prereq:** steps 21A–21F.

## Goal

The way into an endless night, and the night itself. Once the kitchen has been beaten, the Kitchen
offers a run on any of its six maps, each with the best this tier has managed on it. A run's counter is
chosen once, on the loadout screen, and locked for the run. The run plays in the ordinary night view,
counting waves instead of hours. It ends when the fridge is empty, with the waves survived beside the
best. Retry goes back to the same map's counter. This is also the first session that can play a run,
so it re-tunes 21D's drafted curve. **This part carries view-model tests only**, over
`ui/loadoutView.ts`, `ui/kitchenView.ts` and `ui/viewModel.ts`.

## Already in the repo

Trust symbols over line numbers.

| File | What's there now |
| --- | --- |
| `core/campaign.ts` (21E) | `endlessUnlocked`, `endlessMapIds`, `endlessTowerIds`, `endlessLoadout`, `setEndlessLoadout`, `endlessBest`, `worldOptionsForEndless`, `endlessResultOf`, `wavesSurvivedOf`. `applyNightResult` **throws** on an endless night |
| `ui/stores/progress.ts` (21E) | `chooseEndlessLoadout(mapId, ids)`, `recordEndlessResult(result)` |
| `core/content/endless.ts`, `content/index.ts` (21D) | `endlessNightId(mapId)`, `ENDLESS_WAVE_COUNT` (~200), `findNightDef`. The curve's constants, drafted from arithmetic |
| `ui/kitchenView.ts`, `ui/components/MapShape.vue` (21F) | `buildMapShape(mapId)`, `buildPreview(…)` with the tier, the SVG shape |
| `router.ts` | `'title'`, `'kitchen'`, `'loadout'` (`/kitchen/loadout`), `'night'` (`/night`), the dev editor, a catch-all. No guard (20D, decision 2) |
| `ui/loadoutView.ts` | Campaign-only. `selectionFor` keeps a draft only when `draft.nightId === progress.nightId`. `buildLoadoutView` reads `currentNight`, `unlockedTowerIds`, `previousLoadout` and tonight's unlocks for `isNew`, and returns null on a finished campaign |
| `ui/views/LoadoutView.vue` | `setOut` keys the draft by `progress.nightId`. A `watch` **replaces to the Kitchen when `nightId === null`**. Start calls `chooseLoadout`, then pushes `'night'` |
| `ui/views/GameView.vue` | `optionsFor` returns the campaign's `worldOptionsFor` or a dev override. `records` is false under any override. The tick loop records `nightResultOf(world)` on `nightEnded`. `retryNight` pushes `'loadout'` when `records`, or calls `restart()` otherwise |
| `ui/viewModel.ts` (`thiefInWave`, `buildHudSnapshot`, `buildNightSummary`) | `thiefInWave` uses **`NIGHTS.find`**. The snapshot's `clock` is `nightClock(waveIndex, waveCount)`, and its `wave` is `{ index, count }` |
| `ui/components/hud/TopBar.vue`, `NightSummary.vue` | "wave n of m" and the clock. The summary's Grocery Money breakdown. Retry on a lost night only |
| `ui/views/KitchenView.vue`, `NightPreview.vue` | A finished campaign's preview is null, and `NightPreview` prints `kitchen.preview.finished` |
| `dev/night/NightPanel.vue` | Lists `NIGHTS` |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and then
edit this file. Don't leave it lying.

1. **The Kitchen offers an endless night once `endlessUnlocked`:** the six maps in `endlessMapIds()`
   order, each as a `MapShape` with its name and this tier's `endlessBest` (or none yet). Picking one
   opens that map's counter. It sits below tomorrow's preview while there is one, and takes its place
   when the campaign is finished. `kitchen.preview.finished` keeps one line above it. Built in
   `kitchenView.ts` as `endless: EndlessEntryView[] | null`.
2. **Two routes, and the map is the only thing either carries:** `'endlessLoadout'` at
   `/kitchen/endless/:mapId` (the loadout view in run mode) and `'endless'` at `/endless/:mapId` (the
   night view in run mode). The loadout comes from progress, where Start saved it, so a reload mid-run
   and a Retry rebuild from progress. That's 20a's seam, one field over. A `mapId` not in
   `endlessMapIds()`, or a locked endless, replaces to the Kitchen.
3. **The loadout screen's run mode** is built by `buildRunLoadoutView(progress, mapId, selection)` beside
   the night's builder, with `runSelectionFor` and a toggle to match. Roster: every `endlessTowerIds()`
   tower in `shopOrder`, with no "new" marks. Slots and blocked spaces as tonight's. No "last night's"
   preset, because `endlessLoadout` already defaults to night 18's counter. The composition lists the
   pool, each enemy with the wave it first comes in and its tags, and **no counts**: summed over two
   hundred generated waves they run into the thousands and mean nothing. The draft is keyed by
   `endlessNightId(mapId)`. Start calls `chooseEndlessLoadout`, then pushes `'endless'`.
4. **The night view's run mode** builds with `worldOptionsForEndless(progress, mapId, SEED)`, and
   records with `recordEndlessResult(endlessResultOf(world))`, never `recordNightResult` (E throws on
   that, on purpose). Retry pushes `'endlessLoadout'` for the map, and Continue goes to the Kitchen. Dev
   overrides don't apply in run mode.
5. **In a run, the HUD counts waves and the summary counts them against the best.** "Wave 7", no "of
   200", and no clock: a 2am→6am clock spread over two hundred waves stands still. The summary shows
   the waves survived, this tier's best before this run, and "a new best" when it's beaten. Food lost
   by name stays: it's the whole emotional payload (`DECISIONS.md` §6). **No Grocery Money lines.** A
   run pays none (E, decision 4), even though `night.pay` is computed. Retry shows however the run
   ended.
6. **`thiefInWave` reads `findNightDef`**, so a Mouse in a run is announced a wave ahead, like on night
   14.
7. **Re-tune the curve by playing it**, which is the author-twice half 21D left you. Play runs on two
   maps at 3× with a good late-campaign counter. Move `endless.ts`'s constants until a counter that
   won night 18 comfortably ends somewhere in the 20s to 40s, and the first ten waves feel like an Act I
   night, not a wall. Put where it ended, and why, in the commit. 21D's tests pin properties, so none of
   them should move. If one does, the constant broke a property, not the test.
8. **English, in `DECISIONS.md` §1's voice.** The Kitchen's offer, the run's counter, the HUD's wave,
   the summary's lines. It's a long night in the same kitchen, not a "mode".

## Build

### 1. The builders: `ui/kitchenView.ts`, `ui/loadoutView.ts`, `ui/viewModel.ts`

Decisions 1, 3, 5 and 6.

### 2. The routes and the screens: `router.ts`, `KitchenView.vue`, `LoadoutView.vue`, `GameView.vue`, `TopBar.vue`, `NightSummary.vue`

Decisions 2–5.

Gotchas:

- **`LoadoutView`'s `watch` replaces to the Kitchen when `nightId === null`.** A finished campaign is
  exactly when a player sets out a run's counter. Guard it by mode, or the run's screen bounces
  straight back to the Kitchen.
- **`selectionFor` keeps a draft only for `progress.nightId`.** In run mode, compare against
  `endlessNightId(mapId)`. Otherwise every click's draft is thrown away on the next render, and the
  counter snaps back to the default.
- **`records` is the dev-override flag.** A run isn't an override, so give it its own. Reusing
  `records` either records nothing or calls `recordNightResult` on an endless world. E makes the second
  one throw rather than corrupt the save on the next reload.
- **Read this tier's best before `recordEndlessResult` lands.** Read after, it equals the run just
  played, and "a new best" never shows.
- **Summary buttons wait on `saveState`, as they do for a night** (20D). Leaving before a run's best is
  saved loses it.
- A reload mid-run starts the run again from wave 1. Nights aren't resumable (`ARCHITECTURE.md` §8),
  and a run is a night.
- **If step 23B has landed, its `WaveBanner` counts "of m" and flourishes the last wave.** In a run
  there's no m worth printing, and no last wave anyone reaches. Give it the run's wording, not a
  second banner.

### 3. The curve: `core/content/endless.ts`

Decision 7. The one `core/` file this part edits.

### 4. The copy: `en.ts`

Decision 8. Add the endless nights to the dev `NightPanel` too if it helps you play them. It ships
nothing.

## Tests

Extensions to `loadoutView.spec`, `kitchenView.spec` and `viewModel.spec`.

- **The Kitchen's offer:** null before a clear. After one, six entries in `MAP_SOURCES` order, each with
  its shape and this tier's best, null where nothing's been played. Still there after `startCampaign`
  on another tier, with that tier's (empty) bests.
- **The run's counter:** the roster is every endless tower in shop order, with no `isNew`. With nothing
  owned the counter holds five, and with all three counter-space installations it holds eight. A draft
  keyed by the run's night id is kept, and one keyed by another map's is ignored. The composition names
  every enemy in the pool once, and has no counts.
- **A run's HUD and summary:** a world on an endless night publishes a wave with no count, and a summary
  with the waves survived and no Grocery Money.
- **The Mouse is announced in a run:** an endless world whose next wave carries a Mouse has
  `upcomingThief` set.

## Acceptance

- [ ] From a finished campaign: pick the Pantry, set out the counter, and play until the fridge
      empties. The summary says how far you got and whether it beat the best, and Retry lands on the
      Pantry's counter with what you brought.
- [ ] A reload mid-run rebuilds the run on the same map with the same counter.
- [ ] A run ends, and you want to start another.
- [ ] With `VITE_DATA_MODE=mock` and the dev toggle at 100%, a run's Start and its best both show the
      failure, and their retries work once the toggle is back down.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

Leave every judgement criterion unticked unless you actually sat and looked.

## Do not

Change what a run is played with or what it records (E's rules). If the screen needs a rule E didn't
write, that's E's file and a note in the commit. No leaderboard, no endless Codex, no run history beyond
the best. Don't pay a run in Grocery Money, and don't let a run's loadout change once it has started.
