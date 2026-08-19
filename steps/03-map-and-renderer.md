# Step 3 — Map format, path sampling, board renderer

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, `../analytic-docs/DECISIONS.md` §3, `../analytic-docs/ARCHITECTURE.md` §6.
**Prereq:** step 2.

## Goal

A kitchen you can look at, with a track drawn on it, and the maths that lets an enemy walk that track from a single float.

## Build

1. **Map format** (`core/content/schema.ts` + `core/content/maps/`). JSON:
   ```
   { id, name, cols: 24, rows: 14,
     tiles: string[]        // row-major char grid: '.' buildable, '#' blocked, '~' decor, 'T' track
     paths: [ { id, waypoints: [{x, y}, ...] } ]   // tile coords, floats allowed
     spawns: [ { pathId, tile } ]
     fridge: { tile }
     decor: [ { glyph, tile } ] }
   ```
   Tile flags are derived from the char grid at load into a typed `TileFlags` array. Track tiles are **derived from the path polyline**, not hand-painted — rasterise the polyline at load with a configurable width (default 1 tile) and mark those tiles `TRACK`. This guarantees `path_only` / `off_path_only` placement can never disagree with what's drawn.

2. **Path sampling** (`core/path.ts`). At load, precompute per-segment length and cumulative arc length. Then:
   - `samplePath(path, distance): { x, y, angle }` — binary search the cumulative array, lerp within the segment. Must be O(log n), called for every enemy every tick.
   - `totalLength(path)`, `remainingToFridge(path, distance)`.
   - Clamp at both ends; negative distance (pushback in step 18) clamps to 0.

3. **Renderer** (`render/renderer.ts` + `render/layers/`).
   - **Terrain layer**: drawn **once** at map load into an offscreen canvas, then blitted each frame. Flat tiles in the 2am palette — deep blue-grey base, buildable tiles slightly lighter, blocked tiles darker with a subtle inset, warm lamp-light pools as soft radial gradients. Decor glyphs from the glyph cache.
   - **Track layer**: also baked into the terrain canvas. Draw the polyline as a wide rounded stroke (`lineJoin`/`lineCap: 'round'`), a lighter warm tone, with a slightly darker outline. Draw the fridge and each spawn point as decor glyphs.
   - **Entity layer**: per-frame, `drawImage` from the glyph cache, positions rounded to whole device pixels. Empty for now.
   - Draw order: terrain → track → tile effects → crumbs → towers → enemies → projectiles → particles → overlay.

4. **Debug overlay** (toggle with `` ` ``): tile flag colours, waypoint indices and direction arrows, path length, tile coordinates under the cursor, and a marker you can drive along the path with the arrow keys to eyeball `samplePath`.

5. **Author map `counter.json` by hand** — one path, entering from a baseboard crack bottom-left, wandering the counter, ending at the fridge top-right. Aim for a track length around 30–36 tiles. Leave generous buildable pockets on both sides. This is the only map you'll hand-author; step 4 builds the editor for the rest.

## Tests

- `samplePath(p, 0)` is the first waypoint; `samplePath(p, totalLength)` is the last.
- Sampling at the exact cumulative length of every waypoint returns that waypoint (within epsilon) — catches off-by-one in the binary search.
- Sampling monotonically increasing distances produces monotonically increasing arc positions.
- The rasterised `TRACK` tile set contains every waypoint's tile.

## Acceptance

- [ ] The Counter map renders and looks like a place, not a debug grid.
- [ ] The debug marker slides smoothly along the whole track including corners, with no jump at segment boundaries.
- [ ] Terrain is drawn once — confirm with a counter that the terrain draw call fires exactly once per map load.

## Do not

Add enemies, towers, spawning, or interactivity. This is geometry and pixels.
