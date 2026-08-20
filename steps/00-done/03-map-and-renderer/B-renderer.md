# Step 3B — Board renderer

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../../CLAUDE.md`, `../../../analytic-docs/ARCHITECTURE.md` §6,
`../../../analytic-docs/DECISIONS.md` §1 (tone) and §2 *Art: emoji sprites*.
**Prereq:** step 3A.

## Goal

The Counter map on screen: a kitchen surface at 2am with a track across it, drawn once and blitted
every frame. The end of this session is the first time the project looks like a game rather than a
test harness.

## Already in the repo

| File | What's there now |
| --- | --- |
| `render/renderer.ts` | `createRenderer(canvas)`, `LOGICAL_WIDTH/HEIGHT` (1152 × 672), `resize()`, `clear()`, `drawGlyph()`, and a `BACKGROUND` const duplicated from `App.vue` |
| `render/glyphCache.ts` | `getGlyph(emoji, sizePx)` — rasterise once, `drawImage` forever |
| `render/layers/*.ts` | eight empty stub files |
| `core/map.ts`, `core/path.ts` | step 3A's `MapDef`, `TileFlags`, `samplePath` |
| `ui/views/GameView.vue`, `loop.ts` | the canvas, the single rAF, and step 1's bouncing-emoji demo (`dev/demo/bouncers.ts`) |

1152 × 672 over a 24 × 14 board is exactly 48px per tile, which is the grid `CONTENT.md` specifies.

## Decisions already made

1. **Tile size is derived, not a constant**: `tilePx = LOGICAL_WIDTH / map.widthTiles`. It comes out
   at 48 for every authored map, but step 4's editor will hand you half-finished maps of other
   sizes, and a hard-coded 48 turns that into a silent misalignment instead of a smaller board.
   Put the tile↔pixel conversions in `render/`, never in `core/` — `core/` works in tile units only.
2. **The bake is keyed by `(map, dpr)`, not by map.** The terrain canvas is backed at device
   resolution, so a window dragged to a second monitor with a different `devicePixelRatio` needs a
   re-bake or it blits blurry and mis-scaled. The acceptance criterion below counts bakes per
   `(map, dpr)` pair — a re-bake on DPR change is correct, a re-bake per frame is the bug.
3. **Layer functions are pure draws.** `drawTerrain(ctx, map, tilePx)` — arguments in, pixels out,
   no module state, no reads of anything mutable beyond what's passed. That is what keeps
   `render/ → core/` one-way, and it's what lets step 4's editor call the same functions.
4. **Palette lives in `render/palette.ts`.** Move `BACKGROUND` out of `renderer.ts` while you're
   here. `App.vue`'s `--kd-night` still duplicates it — a comment on each side pointing at the other
   is the accepted cost, since `render/` cannot read CSS variables.
5. **Draw order is a literal comment list** at the top of the frame function, the way `sim.ts`
   documents its system order:
   `terrain → track → tile effects → crumbs → towers → enemies → projectiles → particles → overlay`.
   Only the first three and `entities` exist this session; the rest are named stubs so a later step
   can't quietly insert itself in the wrong place.

## Build

### 1. `render/palette.ts`

The 2am kitchen, as named constants. Deep blue-grey base; buildable tiles a step lighter; blocked
tiles darker with a subtle inset edge; the track a warmer, lighter tone with a darker outline; lamp
light warm and low-saturation. Name them by role (`TILE_BUILDABLE`, `TRACK_FILL`), not by colour —
step 23 will retune all of them and you don't want to rename anything.

### 2. `render/layers/terrain.ts` and `render/layers/track.ts`

Both draw **into the offscreen bake**, not the live context.

- Terrain: flat fills per tile from `map.flags`, then two or three **soft radial gradients** as
  pools of lamp light, then decor glyphs from `map.decor`. The gradients are what stop it reading as
  a spreadsheet; keep them large, low-contrast and off-centre.

  **Two things the first version got wrong, found by looking at it:**

  - *Do not vary anything per tile.* A per-tile alpha jitter is the obvious way to stop flat fills
    reading as flat, and it does the exact opposite — varying brightness per tile draws every tile
    boundary in, and the board reads as a spreadsheet with extra steps. Texture has to be at a scale
    the grid does not share: soft blobs a couple of tiles across, positions from a seeded sequence
    so a re-bake lands them in the same place.
  - *Rim the blocked mass, not the blocked tile.* Stroking an inset edge per blocked tile turns a
    5 × 5 appliance into twenty-five outlined squares. Stroke only the sides whose neighbour is not
    blocked, treating off-board as blocked so the board border is not rimmed on its outer face.

  Both are the same mistake — per-tile decoration on a tile grid — and both look fine in the code
  and wrong on screen, which is why this step has no tests and an acceptance criterion that says
  "squint at it".
- Track: the polyline as one wide rounded stroke — `lineJoin` and `lineCap` both `'round'`, a darker
  outline pass underneath a lighter fill pass. Stroke width is `map.trackWidthTiles * tilePx`, so
  the drawn track and 3A's rasterised `TRACK` flags agree by construction. Then the fridge glyph at
  `map.fridge`, and a crack glyph at each path's `waypoints[0]`.

  **Reconciled while building:** 3A shipped `trackWidthTiles` as a local in `loadMap`, defaulted and
  then discarded — it is not on `MapDef`, so there was nothing for the renderer to read. It is now a
  derived field on `MapDef` (set by `loadMap`, copied by `cloneMapDef`, defaulted in the test
  fixture). Deriving it is what makes "agree by construction" true rather than aspirational; the
  alternative — `render/` reaching back into `MAP_SOURCES` for the authored number — is a second
  reader of the same value and would break step 4's editor, which only ever holds a `MapDef`.

  Waypoints name tiles, and `loadMap` marks the tile a waypoint names, so the drawn line runs
  through tile **centres**: `(waypoint.x + 0.5) * tilePx`. Off by half a tile and every acceptance
  check below still passes on a straight run and fails at the first corner.

Gotcha: the offscreen canvas is sized `LOGICAL_* × dpr`, so it needs its own
`setTransform(dpr, 0, 0, dpr, 0, 0)` before anything is drawn into it. `renderer.ts` scales the
*live* context, and that transform is not inherited by a canvas you just created — the symptom is
terrain drawn at quarter size in the top-left corner.

Second gotcha: `drawGlyph` in `renderer.ts` divides by the renderer's `dpr` to get logical units.
Drawing glyphs into the bake needs the same treatment against the bake's own dpr. Factor the glyph
blit so both call sites share it rather than copying the arithmetic.

### 3. `render/layers/entities.ts`

The per-frame layer, `drawImage` from the glyph cache, positions rounded to whole device pixels
(`ARCHITECTURE.md` §6). It has nothing to draw yet — that's step 5. Write it with the signature it
will keep and leave the body iterating an empty array, rather than leaving the file empty.

### 4. `render/renderer.ts`

Add `setMap(map)` (bakes) and `drawFrame(world)` (clear → blit bake → layers in the documented
order). Keep `createRenderer`'s existing shape; this is an addition, not a rewrite.

**Reconciled while building:** there is no `World` in `GameView.vue` yet — step 5 is what puts a
simulation behind the board — so the signature is `drawFrame(world: World | null)` and this session
passes `null`. `drawEntities` takes the same nullable world. Step 5 replaces the `null` at the call
site and fills in `entities.ts`'s `glyphFor`; neither signature changes.

### 5. `ui/views/GameView.vue`

Call `setMap` once with the Counter and `drawFrame` from the loop. Delete the bouncing-emoji demo
and `dev/demo/bouncers.ts` — it was step 1's proof that the loop runs, and the map replaces it.

## Tests

**None.** `ARCHITECTURE.md` §7: no tests over `render/`, the bugs there are visible. The bake
counter in the acceptance list is the only instrumentation, and it is a dev-only console line, not a
spec file.

## Acceptance

- [ ] The Counter renders and looks like a place, not a debug grid. Squint at it: you should read
      "counter at night", not "coloured squares".
- [x] A `console.count` on the bake fires exactly once per map load, and again only if the window
      moves to a display with a different `devicePixelRatio`.
- [x] The frame function contains no `fillText`, no `createRadialGradient`, and no per-tile loop —
      those all happen in the bake.
- [x] The track drawn on screen covers exactly the tiles 3A flagged `TRACK`; check by temporarily
      tinting flagged tiles, then remove the tint (3C makes it a proper toggle).
      *Checked as geometry rather than by eye — a throwaway spec sampled every tile 9×9 against the
      stroke's distance field: the touched set equals the flagged set, and no flagged tile is under
      half covered. Still worth a look under 3C's real toggle.*
- [x] 60fps with the frame budget untouched — the frame is one `drawImage` plus an empty loop.
      *126fps on a 120Hz display, i.e. capped by the refresh rate rather than by the frame.*

## Do not

Draw enemies, towers, crumbs, projectiles or range circles — steps 5 and 6 own those, and the layers
above only get their names this session. Do not add input handling of any kind, and do not build the
debug overlay: 3C owns the `` ` `` toggle, the tile-flag tint and the marker. Do not put anything
dev-only in `render/` — it ships.
