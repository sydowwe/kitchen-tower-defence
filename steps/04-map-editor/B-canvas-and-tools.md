# Step 4B — The editor: canvas, tools and preview

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §3.
**Prereq:** step 4A.

## Goal

The tool itself: a dev route where you paint tiles, drag waypoints, watch the validation panel go
quiet, and press a button to see the map in the real game view. At the end of this session the
remaining five maps are ten minutes of work each instead of an hour of blind JSON.

Every change you make to a map goes through 4A's document. This session builds the surface.

## Already in the repo

| File | What's there now |
| --- | --- |
| `dev/editor/EditorView.vue` | step 1's placeholder — "Built in step 4". You are replacing it |
| `router.ts` | the `/editor` route, already behind `import.meta.env.DEV` with a dynamic import. Nothing to change |
| `dev/editor/document.ts`, `validate.ts`, `serialize.ts` | 4A. Read its *Hands to 4B* block for the signatures |
| `render/renderer.ts` | `createRenderer(canvas)`, `setMap(map)`, `drawFrame(world)`, `resize()`, `ctx`, `tilePx`, `dpr`; `LOGICAL_WIDTH/HEIGHT` = 1152 × 672 |
| `render/layers/` | `drawTerrain(ctx, map, tilePx, dpr)`, `drawTrack(…)`, `drawEntities(…)` — pure draws, safe to call directly |
| `dev/debug/state.ts` | 3C's `createDebugController(canvas, getMap)`: the `` ` `` toggle, `isTypingTarget`, and the pointer→tile arithmetic |
| `dev/debug/overlay.ts` | 3C's `drawDebugOverlay(ctx, map, state, tilePx)` — a read-only inspector drawn on the live context |
| `ui/views/GameView.vue` | the canvas, its CSS scaling, and the DEV-only dynamic import of `dev/debug/` |
| `ui/App.vue` | `--kd-night`, `--kd-night-soft`, `--kd-lamp`, `--kd-text`, `--kd-text-dim` |

`GameView.vue` is the working reference for two things you need: a canvas at logical 1152 × 672
CSS-scaled to the window with `aspect-ratio`, and a dev module imported dynamically inside an
`import.meta.env.DEV` branch so it never reaches the bundle.

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **The document changes once per gesture, not once per pointer event.** A drag draws its ghost in
   the editor's overlay and calls `doc.edit()` exactly once, on pointerup. Two reasons, and the
   second one bites: 60 undo entries per waypoint drag makes the 20-step history useless, and
   `renderer.ts` keys its terrain bake on `bakedMap === map` **object identity**, so every committed
   edit re-bakes 336 fills, 52 mottle blobs and three lamp gradients. Per stroke that is
   imperceptible; per pointermove the brush lags and `console.count('[render] terrain bake')` scrolls.
2. **No animation loop.** `loop.ts` owns the single rAF and nothing in an editor moves on its own, so
   redraw on demand: set a pending flag, schedule one `requestAnimationFrame`, draw, clear. A second
   persistent loop here is how you end up with two of them after navigating `/editor → / → /editor`.
3. **The editor's own overlay draws on the live context after `drawFrame`**, exactly like
   `dev/debug/overlay.ts`. Nothing the editor draws goes into the bake — grid lines and coordinate
   labels baked into the terrain do not come back off, and the symptom is stale labels ghosting under
   the new ones after a resize.
4. **The pointer→tile arithmetic gets extracted, not copied.** 3C wrote it inline in
   `dev/debug/state.ts`'s `onPointerMove`; move it to `dev/tileCoords.ts` and have both call it. It
   is `getBoundingClientRect()` scaling and not `offsetX / tilePx`, because the canvas is CSS-scaled
   — the failure mode is an offset that is invisible at the centre of the board and a full tile at
   the corners, and one copy of that bug is enough. The editor needs the **fractional** tile position
   for waypoints; flooring belongs at the brush, not in the helper.
5. **`dev/` is exempt from the i18n rule.** `CLAUDE.md`'s no-user-facing-literal rule exists so forty
   towers and thirty enemies don't need retrofitting; the editor ships to nobody and has one user.
   Plain English strings in the panels, no keys, no catalogue entries.
6. **Preview hands the map over through `dev/editor/preview.ts`**, a one-shot `sessionStorage` slot
   holding the exported JSON that `GameView.vue` *takes* (reads and clears) inside its existing DEV
   branch. Keeping it in `dev/` is what stops `ui/` acquiring a second, ad-hoc save path next to the
   one `data/` owns, and a one-shot read means a stale preview can't hijack the game route tomorrow.
7. **Nothing in `render/` changes.** The layer functions are already pure draws taking a `MapDef`
   (`terrain.ts`'s header says so), so the editor calls the real renderer and sees exactly what the
   game will. If you find yourself wanting a flag on `Renderer` for the editor, draw it in the
   editor's overlay instead — `render/` ships and `dev/` does not.

## Build

### 1. `dev/editor/EditorView.vue` — the shell

Canvas plus a side panel. Owns the `EditorDoc`, a `shallowRef<EditorSnapshot>` republished after
every commit, and the active tool. Split the panel into components under `dev/editor/panels/` —
tools, paths, decor palette, validation — rather than growing one file.

The document itself never enters Vue's reactivity (4A, `snapshot()`).

### 2. `dev/editor/overlay.ts` — what the editor adds on top

A pure draw, same shape as `dev/debug/overlay.ts`: tile grid, coordinate labels on the axes,
waypoint handles numbered per path, the active path highlighted in its own colour, the hovered tile,
the in-flight drag ghost, and a marker on any tile a `Problem` points at.

Do not refactor `dev/debug/overlay.ts` into shared helpers. The two draw different things for
different reasons and the overlap is four lines of `fillRect`; decision 4 names the one piece that
is genuinely shared.

### 3. Tile painting

Brush with a selectable char (`.` buildable, `#` blocked, `~` decor) and an adjustable size.
Click-drag paints, right-click erases to `.`. One `doc.edit()` per stroke (decision 1): accumulate
the tiles the stroke touched, apply them to the draft in one pass.

Track is not paintable and there is no brush for it — it is derived from the polyline, and the
schema rejects a `T` in the grid outright.

**Gotcha:** the canvas needs `contextmenu` `preventDefault`ed or the browser menu swallows every
right-click erase. Same for the right-click waypoint delete below.

### 4. Path editing

- Click on empty canvas appends a waypoint to the active path.
- Drag an existing waypoint to move it; right-click deletes it.
- Click on a segment inserts a waypoint there. The hit test is what separates this from "append", so
  give both a named threshold in tiles rather than a magic pixel number — the board is CSS-scaled, so
  a pixel radius means something different at every window size.
- Multiple paths, each with its own colour, an active-path selector, add and delete buttons.
- Live length readout per path, from `totalLength`. You will balance against this number constantly.

**Gotcha:** a click that lands on an existing waypoint must not also append a new one, and a
double-click must not produce two coincident waypoints — 4A reports that as an error (the schema's
`MIN_WAYPOINT_GAP_TILES` comment names this editor as how it happens), but the better fix is to
reject the second click at the source.

### 5. Fridge, spawns and decor

The fridge is placed once per map and dragged after that. Each path's `waypoints[0]` **is** its
spawn — there is no `spawns` array — so show it with the crack glyph `render/layers/track.ts` draws
and let it be nudged like any other waypoint.

Decor is an emoji palette: pick, click to place, right-click to remove. Note that a decor *glyph*
(`MapSource.decor`) and a decor *tile* (`~` in the grid) are two different things — the glyph is
scenery drawn on top, the char makes the tile unbuildable. The palette places the glyph; painting
`~` is the brush's job. Getting these confused produces maps where the plant pot is standing on a
tile you can build a salt shaker into.

### 6. Validation panel

4A's `Problem[]`, live, errors above warnings, each row clickable to centre on what it names. Show
the convergence report for multi-path maps — step 21 needs a shared final stretch of at least 6
tiles, so print the number.

### 7. Import / export

Import from a dropdown of `MAP_SOURCES` (`core/content/maps/index.ts` already documents itself as
what the editor round-trips), plus a paste-JSON box for anything not registered yet. Export writes
`toJson` to the clipboard **and** triggers a download named `<id>.json`.

**Gotcha:** `navigator.clipboard.writeText` needs a user gesture and a secure context — `localhost`
counts, so it works in `npm run dev` and there is nothing to work around, but do the write inside the
click handler and not after an `await` on something else, or the gesture has expired by the time you
call it. For the download, revoke the object URL after the click or every export leaks a blob.

The last step of the pipeline is manual and stays that way: drop the file in `core/content/maps/`,
add one line to `maps/index.ts`. Say so in the export confirmation, because it is the step that is
easy to forget and the symptom is a map that exists on disk and nowhere in the game.

### 8. Preview button

`setPreviewMap(toJson(source))` then navigate to `/`. `GameView.vue`'s DEV branch takes the slot and,
if it is non-empty, renders that map instead of `getMapDef('counter')`.

**Reconcile while you build:** the original step called this "playtest — launches the current map in
the real game at the current night". There is no night. Step 5 spawns the first enemy and step 6
places the first tower, so today this shows the map on the real renderer with 3C's debug overlay
available — which is still the fastest way to judge a track's shape. Leave a comment at the take
site naming step 5 as the one that makes it a playtest, and fix the wording in this file if you
implement it differently.

## Tests

**None.** `ARCHITECTURE.md` §7 — renderer and tool bugs are visible — and vitest runs
`environment: 'node'` with `include: ['tests/**/*.spec.ts', 'src/core/**/*.spec.ts']`, so nothing
this session builds is even collected. Every assertion step 4 has is 4A's. If you want a test for
something here, it is probably a rule that belongs in `validate.ts`.

## Acceptance

- [ ] You can build a complete, valid, playable map from `emptyMap()` in under ten minutes.
- [ ] Import `counter.json`, export immediately: the file is semantically identical.
- [ ] The hovered-tile readout and every hit test are exact at all four corners of the board and at
      any window size.
- [ ] Painting a stroke fires exactly one terrain bake, and one undo reverses the whole stroke.
- [ ] The production bundle contains no editor code: `npm run build`, then search `dist/assets/*.js`
      for a string only the editor has (`validateEditorMap` survives minification as a property name
      — pick something that does) and find nothing.
- [ ] Dragging the track around while watching the validation panel *feels* like tuning rather than
      guessing. If you find yourself exporting to check something, that thing belongs in the panel.

## Do not

Add tower placement, enemy previews, wave simulation or a night runner — steps 5 and 6, and the
preview button is deliberately just the board. No undo beyond 4A's 20 steps, no layers, no
autotiling, no asset browser, no dev-server endpoint that writes into `core/content/maps/`. Do not
author the five maps: step 21 does that with this tool, and doing it now means authoring them with a
tool you finished ten minutes ago. Do not touch `render/` or `core/`.
