# Step 8C — Placement, hotkeys, night flow, and the end of the scaffolding

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/ARCHITECTURE.md` §3 (commands are the only
write path) and §6, `../../analytic-docs/DECISIONS.md` §5 (calling waves early, speed multipliers).
**Prereq:** steps 8A and 8B.

## Goal

Hands on the game. A ghost that follows the cursor with its range circle, tiles that tint green or
red, a toast that says *why* when a build is refused, every hotkey, retry and continue between
nights — and the deletion of `dev/placement.ts` and `dev/nightHud.ts`, which have been standing in
for all of it since step 6.

This is the session that closes the milestone, so it ends with you playing nights 1–3 at every speed
and answering the questions at the bottom honestly.

## Already in the repo

| File | What's there now |
| --- | --- |
| `dev/placement.ts` | **the file you are replacing.** `PlacementState` (selectedDefId, selectedTowerId, hoverTile, hoverPoint), `createPlacementController(canvas, queue, getWorld)` owning `pointermove` / `pointerleave` / `pointerdown` on the canvas and `keydown` on the window with its own `destroy()`, and `drawPlacementOverlay(ctx, world, state, tilePx, dpr)` — ghost at `GHOST_ALPHA`, range circle, tile tint, and a three-way cursor (`copy` / `not-allowed` / `pointer`) applied through a module-local `lastCursor` so a frame that changes nothing does not touch the DOM. `CRUMB_CLICK_FORGIVENESS_PX = 8`, named for step 20's Buy-a-Broom |
| `dev/nightHud.ts` | the always-on canvas status line and its `HINT` string. Deleted this session |
| `dev/tileCoords.ts` | **moved to `render/tileCoords.ts` this session** — see decision 13. `toGridPoint(canvas, event, widthTiles)` (integers on tile **corners**, via `getBoundingClientRect` — never `offsetX`), `toTile`, `gridToWaypoint` (`− 0.5`, into the space entity positions use), `isOnBoard`. The map editor and the debug overlay import it from `@/render/index.ts` now |
| `dev/debug/state.ts` | exports **`isTypingTarget`**, imported by `dev/placement.ts` and the step 4 editor. Owns the `` ` `` toggle, and is dynamically imported by `GameView.vue` behind `import.meta.env.DEV` |
| `render/layers/overlay.ts` | a genuinely empty 0-byte file. Step 3C decision 1 reserved it with the words "that stub belongs to step 6's in-game range circles and placement ghost" |
| `render/renderer.ts` | `drawFrame(world: World \| null)`, whose draw-order comment ends `… → particles → overlay` with the slot marked `// overlay: step 3C` |
| `render/layers/towers.ts` | `drawRangeCircle(ctx, tilePx, tile, rangeTiles, tone)`, `drawPlacementTile(ctx, tilePx, tile, tone)`, `towerGlyphSize(tilePx)`, `type PlacementTone = 'valid' \| 'invalid' \| 'neutral'` |
| `render/layers/crumbs.ts` | `pickCrumb(world, atTiles, tilePx, forgivenessPx): Crumb \| null` — the hit test, prefers the largest overlapping pile |
| `ui/views/GameView.vue` | `MAP_ID` / `NIGHT_ID` / `SEED` consts, `restart()`, the `frameEvents` buffer, the DEV `Promise.all` dynamic import of five dev modules, and `onKeyDown` handling `space`, `,` / `.`, and the dev-only `n` and `r` |
| `core/systems/placement.ts` | `canPlaceTower` — and its comment: *"Step 8 asks `canPlaceTower` **before** it lets the click happen and shows the reason as a toast"* |
| `core/systems/commands.ts` | executes `PlaceTower`, `SellTower`, `CollectCrumb`, `SetTargetingMode`, `CallWaveEarly`. **`SetSpeed` is deliberately not executed** — it travels through the queue so a replay records when speed changed, and nothing enqueues one today |
| `core/content/nights.ts` | `NIGHTS = [night01, night02, night03]`, all on the `counter` map |
| `ui/viewModel.ts`, `ui/selection.ts`, `ui/components/hud/*` | 8A's builders and 8B's six components with the emit contract in `B-hud-components.md` |

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **The ghost, the range circle and the tile tint move into `render/layers/overlay.ts`**, the stub
   3C reserved for them, and `drawFrame` gains a second parameter: `drawFrame(world, overlay)`. The
   layer takes a plain `OverlayView` it declares itself — never a Vue ref, never 8A's `Selection`
   object by import. `render/` reads core state and plain arguments; that is what has kept it
   one-way through eight steps, and it is what lets the editor call the same functions.
2. **The controller is `ui/interaction.ts`** — plain TypeScript, no `vue` import, created by
   `GameView.vue` with `(canvas, queue, selection, getWorld)`, owning its own listeners and its own
   `destroy()`, exactly the shape `dev/placement.ts` has. It is DOM plumbing, not markup: a component
   owning `window` listeners leaks them on a route change, and `onBeforeUnmount` in five components
   is five chances to forget one.
3. **`isTypingTarget` moves to `ui/keyboard.ts`**; `dev/debug/state.ts` and the editor import it from
   there. The hotkeys ship now, and a shipping path importing `dev/` is exactly what
   `GameView.vue`'s dynamic-import dance exists to avoid. Once it moves, `typingGuard` and its null
   checks come out of `GameView.vue` — that is a simplification, not scope creep.
4. **Hover state stays plain** (8A decision on `Selection`): `hoverTile`, `hoverPoint`, `tone` and
   `reason` are mutated on every pointermove and read by the draw call. Only the two selected ids are
   refs. Making hover reactive re-renders the HUD 60+ times a second, and the symptom is step 8's
   frame-time acceptance failing with Vue blamed in general rather than one field in particular.
5. **A plain click places and leaves placement mode; shift-click places and stays armed.** This
   deliberately changes shipped behaviour — `dev/placement.ts`'s `selectedDefId` "survives a
   placement, so four in a row is four clicks". Sticky-by-default buys a second tower every time the
   player clicks the board to deselect, and place-and-exit is the genre convention the step file
   asks for.
6. **While a def is armed the click places; the crumb branch only runs when nothing is armed.** Step
   7C decision 5 put the crumb first because there was no armed mode to speak of. Now there is a
   ghost under the cursor, and a green ghost that collects a crumb instead of building reads as the
   placement being broken.
7. **Validity is asked in one place and stored on the selection.** The tint, the cursor and
   the toast all read that one `canPlaceTower` answer, so they cannot disagree. On click, a refusal
   shows the toast and **does not enqueue**; the executor still re-validates, so a world that moved
   between the click and the tick boundary is a silent no-op, which is how every other command
   already behaves.
8. **Pause is `pause()` / `resume()`, never `setSpeed(0)`.** `loop.ts` has both and two ways to stop
   time means the pause button and the 1× / 2× / 3× buttons disagree about which one is lit.
   Selecting a speed while paused resumes.
9. **Every speed change also enqueues `{ kind: 'SetSpeed', speed }`.** The sim ignores it by design;
   the command log is the whole reason the command exists, and nothing has ever enqueued one.
10. **The hotkeys are `1`–`9` shop, `space` pause, `,` / `.` speed, `n` call wave, `x` sell,
    `Escape` / right-click cancel, `` ` `` debug.** The step file's "1/2/3 with a modifier for speed"
    is dropped: step 6C decision 1 settled the numbers as the shop and the commas as speed, and
    `GameView.vue` ships it that way with a comment saying step 8 inherits it.
11. **`` ` `` stays DEV-only and now toggles both debug overlays** — the canvas one and
    `DebugOverlay.vue`. An always-on fps panel over a real HUD is wrong, and one key for both is one
    thing to remember.
12. **Night flow is a local `nightId` in `GameView.vue`.** Retry rebuilds the same night; Continue
    builds the next entry of `NIGHTS` and is disabled after night 3. Campaign progress, unlocks,
    scoring and persistence are step 20's — this is the minimum that makes "nights 1–3 are playable"
    true, and it is three lines.

### Decided during the build

13. **`dev/tileCoords.ts` moved to `render/tileCoords.ts`.** The table above said it stays, and that
    was wrong: `ui/interaction.ts` ships, so a static import of it would root the map editor in the
    production bundle — breaking this step's own second acceptance line and contradicting decision 3,
    which moves `isTypingTarget` out of `dev/` for exactly that reason. It belongs in `render/`
    anyway: `core/systems/placement.ts` has said since step 6 that mapping a click to a tile is
    `render/`'s job, and the file already read `LOGICAL_WIDTH` from the renderer. Three dev importers
    were re-pointed at `@/render/index.ts`.
14. **`canPlaceTower` is asked once per *frame*, not once per pointermove** (softening decision 7).
    Per-move alone leaves a still pointer green over a tile that a shift-click just occupied, or red
    over a tower that has since become affordable — the world moves without the mouse, and the
    acceptance line about "a tile that just became occupied" is exactly that case. `refreshHover()`
    is the one caller, and `overlay()` runs it once a frame; the cursor write is still guarded, so
    nothing extra touches the DOM.
15. **`createInteraction` takes a fifth argument, an `InteractionHost`.** Pause, speed and the toast
    list are the three things the board cannot do for itself: the first two live in `loop.ts`, which
    `GameView.vue` owns, and the third has to reach a Vue ref from a file that may not import `vue`.
    Handing three functions in is what keeps the single `keydown` listener decision 10 asks for
    without this file reaching for the loop.
16. **`` ` `` stays on the debug controller** (implementing decision 11 rather than changing it).
    `dev/debug/state.ts` already owns that key; `DebugOverlay.vue` gained a `visible` prop and
    `GameView.vue` publishes `debug.state.enabled` into its dev snapshot. One key, both overlays, and
    no dev-only key handling in a file that ships.
17. **`NightSummary.vue` gained a `canContinue` prop**, passed through `HudLayer`. Decision 12 needs
    Continue disabled after night 3 and 8B left no way to say so. Disabled rather than hidden, so the
    button pair does not reflow on the one screen the player is reading rather than aiming.

## Build

### 1. `render/layers/overlay.ts`, `render/renderer.ts`, the barrels

Move the drawing half of `drawPlacementOverlay` across, with its `OverlayView` argument. Call it at
the `// overlay: step 3C` slot, delete that comment, and export from `render/layers/index.ts` and
`render/index.ts` (a direct cross-directory import trips the relative-path lint rule).

**The cursor does not come with it.** `canvas.style.cursor` is DOM state, not pixels; keep it in
`ui/interaction.ts`, driven off the same `tone` the layer draws. Keep the "only write when it
changed" guard — without it every frame touches the DOM.

### 2. `ui/keyboard.ts`

`isTypingTarget`, moved. Re-point `dev/debug/state.ts` and the editor's importers, and take the
dynamic import of it out of `GameView.vue`.

### 3. `ui/interaction.ts`

`createInteraction(canvas, queue, selection, getWorld, host): { overlay(): OverlayView | null; destroy(): void }`
— see decision 15 for the `host`, and decision 14 for where the toasts went.

- **`pointermove`**: `toGridPoint` → `toTile` → `hoverTile`, `gridToWaypoint` → `hoverPoint`, then
  one `canPlaceTower` call into `tone` / `reason`, then the cursor. Through `toGridPoint`, never
  `event.offsetX`: the canvas is CSS-scaled and `offsetX / tilePx` is wrong by the scale factor —
  invisible at the centre of the board and a full tile at the corners.
- **`pointerdown`, left button**, in order: armed def → place (or toast); else crumb under the
  pointer → `CollectCrumb`; else tower on the tile → select it; else clear the selection. Clicking
  empty floor with nothing armed deselects, which is the only way out of the inspector that is not
  a key.
- **`contextmenu`**: `preventDefault()` and cancel placement. Without the `preventDefault` the
  browser menu opens over the board and the cancel reads as having done nothing.
- **`keydown`** per decision 10, behind `isTypingTarget` — the editor route has text fields and this
  is the guard both tools share.
- **Toasts**: a small queue of `{ id, messageKey }` with a lifetime, drained on a timer, handed to
  `ToastStack`. Dedupe consecutive identical reasons — dragging a ghost across the track fires
  `onTrack` on every click and a stack of nine identical toasts is noise.

Everything here **enqueues a command and never writes to `world`**
(`../../analytic-docs/ARCHITECTURE.md` §3). The selection is UI state and may be written directly.

### 4. `ui/views/GameView.vue`

Bind 8B's events to the queue, publish both snapshots from `publish()`, and replace the dev placement
wiring with `createInteraction`. `restart(nightId)` takes the night now; `retry` and `continueNight`
both call it.

Two things `restart()` already does that must keep happening, and both bit an earlier session: the
renderer's four `preload*Glyphs` calls come **after** `setMap` (the cache key includes the size and
`tilePx` is 0 until a map is set), and `selection.clear()` has to run because a tower id from the
night that just ended points at nothing.

### 5. Delete `dev/placement.ts` and `dev/nightHud.ts`

Both files say in their headers that step 8 deletes them. Remove their imports from the DEV
`Promise.all` block, and check nothing else references `drawNightHud`, `drawPlacementOverlay` or
`CRUMB_CLICK_FORGIVENESS_PX` — the forgiveness constant moves into `ui/interaction.ts` with its
comment about step 20's Buy-a-Broom intact.

### 6. Play it, then revise the copy

8A wrote every string blind. Now you have three nights to read them against: fix the toast wording,
the shop labels and the summary lines in `ui/locales/en.ts`, and re-tune 8B's spacing and weight
against a busy board at 3×. Both files say this pass belongs here.

## Tests

**None.** This session is pointer and keyboard over a canvas; `vite.config.ts` runs
`environment: 'node'` with no jsdom, so none of it is reachable from a spec. The claims worth
asserting are already asserted elsewhere: `canPlaceTower`'s eight reasons in
`tests/placement.spec.ts`, what `CallWaveEarly` and `SellTower` actually do in
`tests/commands.spec.ts`, and the bonus and refund previews in 8A's `tests/viewModel.spec.ts`. Do not
add a spec for `ui/interaction.ts` to feel covered — if you want to assert something about a
placement, the assertion belongs in `core/`.

## Acceptance

- [ ] Nights 1–3 are playable start to finish with mouse and keyboard only: no dev keys, no console,
      no `r`.
- [x] `dev/placement.ts` and `dev/nightHud.ts` are gone and nothing imports them; `render/tileCoords.ts`
      and `dev/debug/` still work, and the production bundle still contains no `dev/` code (checked by
      grepping `dist/` for `markerDistance`, `activePathIndex`, `takePreviewMap`, `brushMode` — all 0).
- [x] A refused click says why, once, in words — "can't build on the track", not a silent no-op and
      not nine identical toasts.
- [ ] The tile tint, the cursor and the toast always agree, including on the tile under the fridge
      and on a tile that just became occupied. *(occupied case verified in the browser; the fridge
      tile still wants a look.)*
- [ ] Frame time is unchanged from step 7. Profile a busy wave with the HUD up; if Vue costs anything
      measurable, look first for a hover field that became a `ref`.
- [x] Shift-click builds four Salt Shakers in four clicks; a plain click builds one and disarms.
- [x] Speed and pause never disagree about which button is lit, at any order of pressing them.
- [ ] Someone who has never seen the code can be handed the keyboard and knows what to do within a
      minute. Actually try this on someone.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Stop here and play it

This is the checkpoint the whole plan is built around. Play nights 1–3 several times, at every speed,
and answer these honestly:

- Is placing a tower and watching it work **satisfying**?
- Does the crumb loop create a real pull between defending and cleaning, or is clicking crumbs just a
  chore?
- Is calling waves early a decision you actually think about?
- Do you want to play night 4?

If the answer to the last one is no, the problem is in the core loop and no amount of Act II content
will fix it. Change something here — crumb pacing, wave density, tower feel — before continuing. The
knobs are `core/content/nights.ts` (spacing and counts), `core/systems/crumbs.ts` (`ROT_TICKS`,
`HATCH_TICKS`) and `core/content/towers.ts` (cost, rate, collect radius) — and a change to any tower
number changes `tests/content.spec.ts` in the same edit. **Everything after this step assumes this
step is fun.**

## Do not

Build upgrades or a tier system (step 12 — the buttons stay disabled), make the noise meter
accumulate or do anything on filling (step 13), or write the Grocery Money breakdown, unlocks, save
files or a campaign map (step 20 — Continue steps through `NIGHTS` and stops). Do not add a tower, a
map or an enemy. Do not put dev-only state in `render/` or `ui/`; both ship. Do not write to `world`
from a pointer handler, a key handler or a draw call — enqueue a command.
