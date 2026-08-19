# Step 4 — Map editor (dev route)

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, step 3's map format (`core/content/schema.ts`).
**Prereq:** step 3.

## Goal

Stop authoring maps by guessing coordinates. Half a day of work here turns each of the remaining five maps from an hour of blind JSON editing into ten minutes, and makes retuning a track after playtesting trivial instead of dreaded.

You are building this **early on purpose** — every map after `counter.json` gets made with it, and step 21 authors five maps in one sitting.

## Build

A dev-only route at `/editor`, tree-shaken out of production builds (`import.meta.env.DEV` guard on the route registration, editor code under `src/dev/editor/`).

1. **Canvas + grid.** Reuse the step 3 renderer for terrain and track so the editor shows exactly what the game will show. Overlay a tile grid with coordinate labels.

2. **Tile painting.** Brush tool with selectable flag (`buildable` / `blocked` / `decor`) and adjustable brush size. Click-drag paints. Right-click erases to buildable.

3. **Path editing.**
   - Click on empty canvas appends a waypoint to the active path.
   - Drag an existing waypoint to move it; right-click deletes it.
   - Insert a waypoint mid-path by clicking on a segment.
   - Multiple paths, each with its own colour, an active-path selector, and add/delete-path buttons.
   - Live readout of each path's total length in tiles — you'll balance against this number constantly.

4. **Spawns and fridge.** Place the fridge (one per map). Each path's start waypoint implicitly defines its spawn; show it with the crack glyph and let it be nudged.

5. **Decor.** Pick an emoji from a palette, click to place, right-click to remove.

6. **Validation panel**, live:
   - every path must terminate within 1 tile of the fridge — **warn** otherwise
   - warn on paths shorter than 20 tiles or longer than 60
   - warn if fewer than 25% of tiles are buildable
   - warn if any path segment is longer than 6 tiles (the polyline will read as a straight corridor)
   - on multi-path maps, report where paths converge and how much shared final stretch exists — `../analytic-docs/DECISIONS.md` §3 wants them to merge

7. **Import / export.** Load any existing map from `core/content/maps/` into the editor. Export writes formatted JSON to the clipboard **and** triggers a file download with the right filename. Round waypoint coordinates to 2 decimals on export so diffs stay readable.

8. **Playtest button.** Launches the current in-memory map in the real game at the current night, without saving. This is the feature that makes the editor worth building — iterate the track shape against actual play.

## Acceptance

- [ ] You can build a complete, valid, playable map from an empty grid in under ten minutes.
- [ ] Round-trip is lossless: import `counter.json`, export immediately, and the file is semantically identical.
- [ ] The production bundle contains no editor code — verify in the build output.

## Do not

Over-build this. No undo/redo stack beyond a simple 20-step history, no layers, no tile autotiling, no asset browser. It's a tool for one user.
