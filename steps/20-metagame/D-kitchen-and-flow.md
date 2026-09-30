# Step 20D — The Kitchen, and the way through it

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §1 (tone) and §7,
`../../analytic-docs/CONTENT.md` §8 (the *Installations* table) and §6 (the night table, for the
preview), `../../analytic-docs/PERSISTENCE.md` §2 (*Rule 2*) and §4.
**Prereq:** step 20C.

## Goal

The campaign as a place you move through: title → kitchen → night → summary → kitchen. The Kitchen
is the game's second location. It's the same room in daylight, quiet, with what you've bought
standing in it (the sealed crack, the fixed screen, the broom by the door), a card per installation,
your Grocery Money, and what tomorrow night brings. A night is built from your progress, and its
result is saved before you can leave the summary. Everything waits on a store that can be slow or
fail, and says so. E rewrites the summary's contents. This part only makes its buttons go somewhere
safely. **This part carries a few view-model tests, over `ui/kitchenView.ts`.**

## Already in the repo

Trust symbols over line numbers. 19C changes `viewModel.ts`, `NightSummary.vue` and `TopBar.vue`
after this was written.

| File | What's there now |
| --- | --- |
| `router.ts` | `/` is `GameView`, named `'game'`, and the catch-all redirects to `'game'`. The editor route sits in the `import.meta.env.DEV` branch |
| `dev/editor/EditorView.vue` (`onPreview`) | `setPreviewMap(json)`, then `router.push('/')`. **Once `/` is the title, a preview lands there instead**, and its map hijacks the next night anyone plays |
| `ui/views/GameView.vue` | `nightIndex` walking `NIGHTS` by position, `canContinue`, `continueNight`, `retry`, `SEED = 1234`, `MAP_ID`, `difficulty: 'normal'`, 20A's `devModifiers`, and the `onBeforeUnmount` cleanup list. It may also carry the dev `NightPanel` (`dev/night/`) |
| `ui/components/hud/HudLayer.vue` → `NightSummary.vue` | Props `canContinue`, emits `retry` / `continueNight`. The summary is the one HUD wrapper that takes pointer events |
| `ui/components/hud/*` | The component rule: **nothing under `components/` imports `core/`**. `ui/viewModel.ts` is the seam, and a component gets keys and numbers |
| `ui/App.vue` | The night palette as `--kd-*` roles, named by what they're for. There are no daylight roles |
| `ui/stores/progress.ts`, `settings.ts`, `ui/composables/useSync.ts`, `data/index.ts` (20C) | Pessimistic `progress` with `status` / `error` / `retry()`. Optimistic, debounced `settings.speed`. `useSync()` returns `'local'`. `setMockFailureRate` |
| `core/campaign.ts` (20B) | `worldOptionsFor`, `nightResultOf`, `currentNight`, `unlockedTowerIds` |
| `core/content/installations.ts` (20A) | Eleven defs, each with a `glyph` and one `effect` |
| `ui/locales/en.ts` (`installation`) | 20A's **first-draft** installation English, which this part rewrites |
| `ui/components/hud/ToastStack.vue` | Refusals from `interaction.ts`. **Not** for save errors, since it only exists inside a night |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **Routes:** `'title'` at `/`, `'kitchen'` at `/kitchen`, and `'night'` at `/night` (`GameView`).
   The catch-all goes to `'title'`. The editor's preview pushes `{ name: 'night' }`.
2. **No router guard.** Each view calls `ensureLoaded()` and renders its own loading and error
   states. A guard has nowhere to put an error, and mock mode fails one call in twenty.
3. **`ui/kitchenView.ts`, pure: `buildKitchenView(progress): KitchenView`**, the Kitchen's
   equivalent of `viewModel.ts`. Components import it and never `core/`. It's rebuilt in a `computed`
   when the store changes, not at 15 Hz. There's no loop running on this screen.
4. **An installation's effect line is `{ textKey, params }`** (the `StatValueView` idiom), built by an
   exhaustive `switch` on `effect.kind`, with the numbers read off the def **in its authored units**:
   "+25 noise cap", "sweeps 1.5 tiles", "collection in 0.7s". The English never carries a number.
   That's the note already above the `installation` block in `en.ts`.
5. **The preview is `currentNight(progress)`:** the night number, `map.<id>.name` (add a `map` block
   to `en.ts`; every night is the Counter until step 21), the wave count, the towers it unlocks (its
   `unlocksTowerIds`), and the enemies it introduces (every def in its waves that appears in no
   lower-indexed night). The Mouse is introduced on 14, not again on 17. The full composition is 20a's.
   A finished campaign has no preview and no start button, just a line saying the kitchen made it.
6. **The scene is Vue and CSS, not the canvas.** The loop and the renderer belong to the night, and
   `loop.ts` owns the one rAF. The room is a daylight backdrop with each owned installation's glyph
   placed by a `Record<InstallationId, { x: number; y: number }>` in the scene component, typed so a
   twelfth installation fails `type-check` until it has a spot. Daylight colours are new `--kd-day-*`
   roles in `App.vue`, named by role.
7. **`GameView` builds its world from `worldOptionsFor(progress, SEED)`.** No progress loaded yet
   means a loading state. `nightId === null` sends you to the Kitchen. `SEED` stays fixed, so a retry
   is the same night.
8. **The result is recorded in the loop's `tick()`, where `nightEnded` is seen, once per world.** A
   flag is set there and reset in `restart`, and `recordNightResult(nightResultOf(world))` is called.
   It's not recorded on a button: Retry or closing the tab would skip it, and a second click would
   double it. **A world built with any dev override doesn't record**: an editor preview, a `NightPanel`
   pick, or `devModifiers`. None of them is the campaign's night.
9. **The summary's buttons wait on that save.** Continue goes to the Kitchen, Retry calls
   `restart()`, and both are disabled while `status === 'saving'`. On `'error'` the summary
   shows one line and a "try saving again" button that calls `retry()`. Leaving before the save lands
   is how a night's money disappears. *(Reconciled while building: **Retry is shown on a lost night
   only.** `restart()` builds from progress, and a recorded win has already moved `nightId` on, so
   "the same night" after a win would be the next one. Replaying a won night instead would contradict
   `applyNightResult`, where a won night isn't replayed. Continue stays enabled on `'error'`. The
   unsaved result is the store's `pending`, and the Kitchen shows the same failure with the same retry.)*
10. **Speed:** `restart` applies `settings.speed`. The speed buttons still call `applySpeed`, which now
    also calls `settings.update({ speed })` for a non-zero speed. C debounces it.
11. **Reset progress** is a Kitchen button that opens an inline confirmation (not `window.confirm`,
    which blocks the tab and can't be styled), then `resetProgress()`, with its own saving and error
    state.
12. **The sync indicator** sits in a corner of the Kitchen and reads `useSync().status`. It says
    "saved on this device" in v1, and that's the whole feature.
13. **The title** is the game's name, one button into the Kitchen, and the load's loading and error
    states. Auth and progress both load here first, and in mock mode either can fail.
14. **Dev failure toggle:** a small `dev/data/DataPanel.vue` on the Kitchen, imported dynamically
    under `import.meta.env.DEV` the way `GameView` imports `NoisePanel`, calling `setMockFailureRate`
    (0.05 or 1). It ships nothing. *(Reconciled while building: it's on the title too. The title's
    load runs before the Kitchen is reachable, so its failure is only seen with
    `VITE_MOCK_FAILURE_RATE=1`, and its retry needs the toggle there to turn the rate back down.)*
15. **Author the installation English twice, on purpose.** Rewrite 20A's draft here, with the cards
    and the scene in front of you, in DECISIONS.md §1's voice: what changed in the kitchen, never a
    number, never a joke told to the player. E writes the summary's copy.

## Build

### 1. Routes and the title: `router.ts`, `ui/views/TitleView.vue`, `EditorView.vue`

Decisions 1, 2 and 13.

### 2. The Kitchen: `ui/kitchenView.ts`, `ui/views/KitchenView.vue`, `ui/components/kitchen/*`

Decisions 3–6, 11, 12 and 14. Split it into components: the scene, an installation card, the
preview, the sync indicator and the reset confirmation. A card shows the glyph, name, description,
effect line and cost, and then owned, affordable or unaffordable. Its button shows the purchase in
flight, and every card's button is disabled while any save is in flight.

Gotchas:

- **`status` belongs to the store, not the card.** A card holding its own `buying` flag ends up
  showing a spinner after a failure the store has already moved past. Read `status` from the store.
- **The balance and the owned state change only on success.** A pessimistic store means the card
  must not pre-fill as owned. If it looks instant on `local`, try it on `mock` before calling it done.

### 3. The night: `GameView.vue`, `HudLayer.vue`, `NightSummary.vue` (actions only)

Decisions 7–10. Delete `nightIndex`'s campaign role, `canContinue` and `continueNight`. The dev
`NightPanel`, if it's in the tree, keeps working as an override and passes `availableTowerIds: null`.
Add the save state to the summary's props, next to the buttons, and leave the body for E.

Gotchas:

- **`recordNightResult` is async and the loop isn't.** Call it as `void store.recordNightResult(…)`
  and let the summary read the store's `status`. The store returns `'failed'` rather than rejecting,
  so there's nothing to catch here.
- **The "recorded" flag must be reset in `restart`.** A flag that's set once and never cleared means
  the first night records and every retry after it silently doesn't. The balance just stops moving,
  and nothing errors.

### 4. The installation copy: `ui/locales/en.ts`

Decision 15, plus the Kitchen, title, preview and save-state strings.

## Tests

`tests/kitchenView.spec.ts`, over the builder only:

- Fresh progress: all eleven cards unowned, with affordability matching the balance exactly (`>=`,
  like the shop). The preview is night 1, unlocking the Salt Shaker and the Toaster Crumb Tray and
  introducing the Ant.
- Every installation gets an effect line with a non-empty key, one per effect kind. That catches a
  `switch` that fell through to a default.
- Progress at night 17 introduces the Silverfish and not the Mouse. Finished progress has a null
  preview.

## Acceptance

- [ ] Title → Kitchen → night → summary → Kitchen works, and a reload at any point comes back to the
      Kitchen with the balance and installations intact.
- [x] Losing a night returns to the Kitchen with the night still next, installations intact and 40%
      paid.
- [ ] With `VITE_DATA_MODE=mock`, every screen shows a loading state. With the dev toggle at 100%,
      the title, a purchase, the night-end save and a reset each show an error with a retry that
      works once the toggle is back at 5%.
- [ ] The kitchen visibly changes as you buy things. *Look at it.*
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green, and the
      production bundle contains no `dev/data`.

## Hands to 20E

```
router.ts                  route names 'title' | 'kitchen' | 'night'
NightSummary.vue           props: summary, saveState: 'saving' | 'saved' | 'failed'; emits retry, continueNight, retrySave
                           (Retry is rendered on a lost night only -- decision 9)
ui/kitchenView.ts          buildKitchenView(progress): KitchenView
```

## Do not

Rewrite the summary's contents, the shop, number keys or the TopBar (E). Don't add a difficulty
selector (step 21), a loadout screen (20a), a codex or settings screen (step 23), or a night picker
in the shipped Kitchen. Don't draw the Kitchen on the canvas.
