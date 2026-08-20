# Step 3C — Debug overlay, and authoring the Counter

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §3,
`../../analytic-docs/CONTENT.md` §6 (the Counter's three nights).
**Prereq:** steps 3A and 3B.

## Goal

The instrument that lets you see whether the geometry is right, and then the map you use it to
author. This is the session that closes step 3, so it ends with the Counter looking like a kitchen
rather than a placeholder.

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/map.ts`, `core/path.ts` | `MapDef`, `TileFlags`, `canPlace`, `samplePath`, `totalLength` |
| `core/content/maps/counter.json` | 3A's structurally-correct draft. You are replacing its contents |
| `render/renderer.ts`, `render/layers/` | `setMap`, `drawFrame`, the baked terrain and track |
| `ui/components/DebugOverlay.vue` | step 1's **HUD stats panel** — fps, ticks, entity count |

That Vue component is not what this part builds and does not change. This overlay is drawn on the
canvas, in world space, because everything it shows is a coordinate.

## Decisions already made

1. **It lives in `src/dev/debug/`**, not `render/`. `dev/` is the directory that doesn't ship
   (`CLAUDE.md`, layering rule), and a debug drawing routine in `render/` ends up in the production
   bundle. `render/layers/overlay.ts` stays empty — that stub belongs to step 6's in-game range
   circles and placement ghost.
2. **Two files: `dev/debug/state.ts` and `dev/debug/overlay.ts`.** State owns the toggle, the marker
   distance and the hovered tile, plus the listeners that change them. Overlay is a pure draw taking
   state and the map. Same split as 3B's layers, for the same reason.
3. **The marker is not a command and not an entity.** Arrow keys move a plain `number` in dev state.
   Enqueueing a command or writing to `world` would put a debug tool inside the determinism
   guarantee — `(seed, mapId, nightId, commandLog)` has to reproduce a session, and a replay must
   not depend on whether someone had the overlay open.
4. **Wired in `GameView.vue` behind `import.meta.env.DEV`**, both the import and the draw call, so
   it tree-shakes out. Verify in the build output, the way step 4 verifies the editor.
5. **The map keeps its metrics inside step 4's validator thresholds** (track 20–60 tiles, ≥25% of
   tiles buildable, no segment longer than 6 tiles). The editor arrives next session and will lint
   every map against those numbers; a hand-authored map that fails its own validator on day one is
   a bad first data point.

## Build

### 1. `dev/debug/state.ts`

- `` ` `` toggles the overlay. Guard against the key firing while an input is focused — step 4's
  editor has text fields, and this state module is what it will reuse.
- Arrow keys move `markerDistance` along the active path; hold to accelerate, so walking 34 tiles
  doesn't take a minute. `[` and `]` switch active path for the multi-lane maps from night 10.
- Pointer position → tile coordinate. The canvas is CSS-scaled to the window
  (`GameView.vue`), so this is `getBoundingClientRect()` arithmetic, **not** `offsetX / tilePx`.
  Getting it wrong shows up as an offset that grows toward the edges of the board.

### 2. `dev/debug/overlay.ts`

Drawn last, per frame, only when toggled:

- tile flags as a translucent tint per flag, with a legend
- waypoint indices, and a direction arrow per segment
- each path's total length in tiles, and the active path highlighted
- the hovered tile's coordinates and its flags, at the cursor
- the marker: `samplePath(path, markerDistance)` as a glyph rotated to `angle`, with the distance
  printed

The marker rotated to `angle` is the point of the whole overlay — it is how you see a corner
stutter, and step 5's enemies will use the same call.

### 3. Author the Counter

Now use it. Replace `counter.json` with the real map: one path entering from a baseboard crack
bottom-left, wandering the counter, ending at the fridge top-right, 30–36 tiles long. Blocked tiles
where kitchen objects would be, decor glyphs for the objects themselves, and generous buildable
pockets on both sides of the track — the pockets are where the game gets played, and a track hugging
a wall makes half its length undefendable.

This is the only map authored by hand; step 4 builds the editor for the other five.

Re-run 3A's suite afterwards. The `TRACK`-contains-every-waypoint test asserts against
`counter.json`, so it is now checking the real map — that is deliberate, and if it fails, the map is
wrong and not the test.

## Tests

**None new.** 3A's suite is the regression net for the re-authored map. If you find yourself wanting
a test for the overlay, you're building a feature that belongs in step 4's editor instead.

## Acceptance

- [ ] The Counter looks like a place, not a debug grid, with the overlay **off**.
- [ ] The marker slides smoothly along the whole track including every corner, with no jump, no
      backwards step and no angle flip at a segment boundary.
- [ ] Track length is 30–36 tiles, at least 25% of tiles are buildable, no segment exceeds 6 tiles.
- [ ] The hovered-tile readout is exact at all four corners of the board and at any window size.
- [ ] The production bundle contains no `dev/debug` code — check the build output.
- [ ] Sitting and looking at the map, you can point at two or three spots and say "that's where I'd
      put a tower". If you can't, the pockets are in the wrong places — move them now, while it's a
      five-minute edit.

## Do not

Add tile painting, waypoint dragging, import/export or a validation panel — that is step 4's editor,
in a fortnight's worth of the plan, and every one of those features is cheaper there than here. Do
not author the other five maps. Do not let the overlay read or write anything on `world` beyond
reading it to draw.
