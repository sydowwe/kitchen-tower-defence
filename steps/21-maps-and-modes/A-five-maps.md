# Step 21A — The five maps

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §3,
`../../analytic-docs/CONTENT.md` preamble (the grid line) and §6 (the table, and the line under it on
spawn points).
**Prereq:** step 20a, both parts.

## Goal

The Sink, the Pantry, the Stove, the Table and the Floor, authored as JSON, registered, named, and held
by a spec to the rules the editor judges every map by. Each gets a genuinely different shape, not a
reskin:

- **Sink:** a long looping track around a basin, with a wet central region that's unbuildable. Rewards
  range.
- **Pantry:** narrow, corridor-like, very few buildable pockets. Punishes wide towers, rewards cones and
  auras.
- **Stove:** a short, fast track with a large open build area. High pressure, high freedom. Two lanes:
  the game's second spawn point, from night 10.
- **Table:** wide open, a long track, plenty of space. The most conventional map, and the right place for
  the Mouse. One lane.
- **Floor:** sprawling, three entry cracks, the longest track in the game. Three lanes: the third spawn
  point, from night 16.

Nothing plays on them yet. C moves the nights. **This part carries the step's two map tests.**

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/content/maps/counter.json` | The only map. 24 × 14, one lane `crack` (31.1 tiles), fridge at (22, 3). **Don't change it.** `content.spec` pins the Beetle's and the Fly's crossing times against its `crack` |
| `core/content/maps/index.ts` | `MAP_SOURCES = [counter] as MapSource[]`, validated in dev, then `MAPS = MAP_SOURCES.map(loadMap)`. The editor's export message says to drop the file here and add one line |
| `core/content/schema.ts` (`mapSource`) | zod: `heightTiles` rows of `widthTiles` chars, only `. # ~`, waypoints inside the board and at least 0.1 apart, each lane ending within 1 tile of the fridge |
| `core/map.ts` (`loadMap`) | Rasterises `TRACK` from the polyline. Throws when `lengthTiles` is off the measured length by more than 0.01 |
| `dev/editor/validate.ts` | `validateEditorMap(source, map)`. Errors are zod's rules plus a `#` under the track. Warnings: a lane under 20 or over 60 tiles, a segment over 6, under 25% of the board buildable. `convergenceOf(map)` gives each pair of lanes' shared final stretch, in centre-line tiles counted back from the fridge |
| `dev/editor/document.ts` (`recomputeLengths`) | Sets every `lengthTiles` from the waypoints. The editor's export calls it |
| `dev/editor/tools.ts` | `DECOR_PALETTE` and `FRIDGE_GLYPHS` |
| `tests/editor.spec.ts` | "reports nothing at all for counter.json", `problemsFor(source)`, the convergence specs on synthetic lanes |
| `tests/path.spec.ts` (`loadMap`) | "marks the tile of every waypoint of counter.json as TRACK". Extend it to every map. Don't write a second one |
| `ui/locales/en.ts` (`map`) | `counter: { name: 'The Counter' }`, under a comment saying the Counter is the only map until step 21 |
| `render/layers/track.ts` | Draws 🕳️ at every lane's `waypoints[0]`, and the fridge at `fridge.tile` |
| `render/layers/fridge.ts` (`shelfSlot`) | The shelf hangs off the fridge to the left and below: six items a row, 0.6 tiles apart, from `fridge.x − 2.1` to `fridge.x + 0.9`, and rows from `fridge.y + 1.2` down |
| `core/systems/spawn.ts` (`startWave`) | `crackSpawnMult` (Seal the Baseboard Crack) cuts the cursors on `world.map.paths[0]` and on no other lane |
| `core/content/nights.ts` | Every entry of every night names `pathId: 'crack'` |
| `render/surfaces.ts` | **Only if step 23A has landed.** `surfaceOf(mapId)`: `'counter' \| 'tile' \| 'wood'`, keyed by map id beside `en.ts`'s names, with the Counter as the default. Give each new map a line (23A, decision 4). If the file doesn't exist, 23A will add the lines when it runs |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and then
edit this file. Don't leave it lying.

1. **Lanes: Sink 1, Pantry 1, Stove 2, Table 1, Floor 3.** `CONTENT.md` §6 gives the second spawn point
   to night 10 (the Stove's first) and the third to night 16 (the Floor's first). The Table stays single
   because it's where the Weevil (13) and the Mouse (14) are introduced. One long lane is where a
   burrow window and a flight home are watched end to end.
2. **Every map's first lane is `crack`, and it enters at floor level from the board's edge.** Seal the
   Baseboard Crack cuts `paths[0]`, so the first lane has to be the crack the installation says it
   seals. And every entry in `nights.ts` names `crack`, so a night keeps loading on a new map until C
   spreads it. So does the editor's preview button, which plays tonight's night on the draft. Name the
   other lanes for what they are (`drain`, `vent`, `underTheOven`…): camelCase def ids.
3. **Ids `sink`, `pantry`, `stove`, `table`, `floor`, one `<id>.json` each.** `MAP_SOURCES` goes in
   campaign order: counter, sink, pantry, stove, table, floor. D's endless maps and G's map choice read
   that order.
4. **24 × 14, `trackWidthTiles` 1.** The camera is fixed (`OPEN-QUESTIONS.md` §2) and
   `tilePx = LOGICAL_WIDTH / widthTiles`, so another size draws at another tile size. Width stays 1
   because every night, measurement and barricade spec so far ran at 1, and a wider band is untested
   ground.
5. **Every map passes `validateEditorMap` with no problems at all**, errors and warnings both. That's
   the bar `counter.json` already clears in `editor.spec`. A map that needs a warning needs a reason,
   written here and in the spec, not a looser test.
6. **Multi-lane maps share at least 6 tiles of final stretch by `convergenceOf`, for every pair of
   lanes** (`DECISIONS.md` §3, "merge into a shared final stretch").
7. **Authored as JSON, checked by the editor's own functions, and looked at in the editor.** A session
   can't drag waypoints. It can write the file, set `lengthTiles` with `recomputeLengths`, run the spec,
   and then judge each map by eye: import it in the editor (`npm run dev`, `#/editor`, the registered
   list), and play a night on it with the editor's preview button. "In the editor" means the editor's
   rules and the editor's view.
8. **Names in `en.ts`'s `map` block, short like "The Counter":** The Sink, The Pantry, The Stove, The
   Table, The Floor. Drop the "only one until step 21" comment.

## Build

### 1. The five files: `core/content/maps/*.json`

To the briefs in the Goal. What goes wrong without a sound:

- **Merged lanes must share waypoints, not just pixels.** `convergenceOf` compares centre-line tile
  sequences counted back from the fridge. Two lanes that visibly run together on different waypoint
  lists share nothing by that count: one stepped and one diagonal, or a corner a tile apart. From the
  merge point on, copy the same waypoint list into every lane.
- **The shelf covers tiles to the left of the fridge and below it, and towers draw under it.** At its
  fullest the shelf holds 35 items: Cozy's ×1.3 on night 18's 24, plus a Bigger Fridge. That's six
  rows, and it covers x ∈ [fx − 2, fx + 1] and y ∈ [fy + 1, fy + 5]. So keep 2 ≤ `fridge.x` ≤ 22 and
  `fridge.y` ≤ 8. Make those tiles `#` or `~`, and bring the last stretch of track in from above or
  from the right. The Counter gets this wrong: nearly every tile in (20–22, 4–8) is buildable, and a
  tower there hides under the shelf. That's out of this step's scope, so leave it.
- **Every lane's first waypoint draws a 🕳️.** Start each lane at the board's edge or against a blocked
  mass, where a hole in the skirting makes sense. A lane starting mid-floor draws a hole in the floor.
- **Decor is matched to sprites by glyph** (`render/sprites.ts`). A 📦 on a map draws as the Cardboard
  Box, and 🍞 🍪 🍘 draw as crumb piles. Use `DECOR_PALETTE`, or any glyph no tower, enemy or crumb band
  uses.
- **The Pantry's "very few pockets" is few pockets, not few tiles.** It still has to clear 25%. Lay its
  buildable tiles in narrow strips that hug the corridor, where a cone or an aura covers track and a
  range-4 circle is mostly shelf.
- **The track never crosses a `#`.** That's an error, because the barricade slot on that tile silently
  disappears. The Sink's basin and the Pantry's shelving are `#` or `~`, and the lanes go round them.
- **The Stove is short, but every lane is at least 20 tiles.** The Floor is the longest, but no lane is
  over 60.
- **Set `lengthTiles` with `recomputeLengths`, never a hand sum.** `loadMap` throws past 0.01, and a
  looping Sink with diagonals is exactly where a hand sum drifts.

### 2. Register and name them: `maps/index.ts`, `en.ts`

Decisions 3 and 8. If step 23A has landed, give each map its surface in `render/surfaces.ts` too:
whichever of `'tile'` and `'wood'` the place is made of.

### 3. The spec: `tests/maps.spec.ts`, and `path.spec`'s waypoint assertion

## Tests

`tests/maps.spec.ts`, plus the one extension to `path.spec`.

- **Every map passes the editor's rules:** for every `MAP_SOURCES` entry,
  `validateEditorMap(source, loadMap(source))` is `[]`. It's 24 × 14, its first lane is `crack`, and
  every lane ends within 1 tile of the fridge. zod checks that at boot too, but the spec names it.
- **The lane counts are decision 1's:** `{ counter: 1, sink: 1, pantry: 1, stove: 2, table: 1, floor: 3 }`.
- **A shared final stretch of at least 6 tiles:** on every multi-lane map, `sharedTiles >= 6` for every
  pair `convergenceOf` reports.
- **Nothing buildable under the shelf:** on the five new maps, no tile in the rectangle from the gotcha
  above passes `canPlace(map, tile, 'off_path')`. Restate the rectangle in the spec with a comment
  pointing at `shelfSlot`. `render/` isn't imported into a spec.
- **`path.spec`:** "marks the tile of every waypoint as TRACK" runs over every map, not just the
  Counter.

## Acceptance

- [ ] Five maps that look like five places: the Sink reads as a sink and the Floor as a floor, with the
      overlay off.
- [ ] Sitting and looking at each map, you can point at two or three spots and say "that's where I'd
      put a tower". On the Pantry, those spots are beside the track.
- [ ] A night played on each through the editor's preview reaches the fridge with no throw.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 21B–21G

```
core/content/maps/index.ts   MAP_SOURCES / MAPS in order: counter, sink, pantry, stove, table, floor
lanes                        every map: paths[0].id === 'crack'
                             stove: crack + one more; floor: crack + two more (ids in the JSON)
ui/locales/en.ts             map.<id>.name for all six
```

## Do not

Move a night onto a new map (C). Add modifiers (B), an endless map list (D, G) or the map's shape on the
loadout preview (F). Don't change `counter.json`, and don't widen a track past 1.
