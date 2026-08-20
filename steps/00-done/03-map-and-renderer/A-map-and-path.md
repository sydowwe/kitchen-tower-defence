# Step 3A — Map format and path maths

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../../CLAUDE.md`, `../../../analytic-docs/DECISIONS.md` §3,
`../../../analytic-docs/CONTENT.md` preamble (the grid line) and §6 (the map roster).
**Prereq:** step 2.

## Goal

The authored map format, the tile flags derived from it, and the maths that turns one float into a
position on the track. Entirely headless — nothing is drawn until 3B. Every test step 3 has lives
here, because this is the half of the step that can silently be wrong.

## Already in the repo

Step 2 shipped a placeholder map format. This part replaces it, so these are the files you edit
rather than create:

| File | What's there now |
| --- | --- |
| `core/types.ts` (~line 100) | `interface MapDef` with `buildable: boolean[]` |
| `core/content/schema.ts` (`// --- maps ---`) | the zod `map` schema, pinned with `satisfies z.ZodType<MapDef>` |
| `core/content/maps/index.ts` | a 6 × 4 placeholder `counter` as a TS module |
| `core/world.ts` | `cloneMapDef()` — the world gets its **own mutable copy** of the map |
| `tests/world.spec.ts`, `tests/schema.spec.ts` | assert against the placeholder; expect to update them |

`cloneMapDef`'s comment is load-bearing: night modifiers write to the world's map ("moving day"
consumes 30% of build tiles, mold corrupts them in step 15). Whatever you put on `MapDef` has to
survive being cloned per world, mutated mid-night, and JSON round-tripped.

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **Maps are JSON**, one file per map in `core/content/maps/`, imported and validated in
   `index.ts`. Step 4's editor exports JSON; a TS module would mean the editor emitting source code.
   ~~Needs `resolveJsonModule` in `../../../game/tsconfig.json`.~~ Step 1 already set it.
2. **The authored grid is `tiles: string[]`** — one string per row, `widthTiles` chars long. Legal
   chars are `.` buildable, `#` blocked, `~` decor. **`T` is not a legal char**: the schema rejects
   it. Track is derived from the polyline, which is the whole point — a hand-painted track can
   disagree with what's drawn and with `path_only` placement.
3. **Two shapes, one direction.** `MapSource` is the authored JSON (zod-validated).
   `loadMap(source): MapDef` derives the runtime shape. `MapDef` is what `World` holds and what
   everything else already reads, so its name doesn't change.
4. **`MapDef.flags: number[]` replaces `buildable: boolean[]`** — a row-major bitfield, with `TRACK`
   already OR'd in. Plain `number[]`, **not** `Uint8Array`: a typed array does not survive
   `JSON.parse(JSON.stringify(w))` deeply equal, and `tests/world.spec.ts` asserts exactly that.
   The char grid does not go on `MapDef` at all — flags are the single runtime truth for what is
   buildable, blocked and track, and night modifiers flip bits in them.
5. **Path arc-length tables never go on the world.** They're derived from waypoints that never
   change, so `core/path.ts` keeps a module-level `WeakMap<Path, PathTable>` built lazily on first
   sample. Keyed by the `Path` **object**, not its id, so each world's clone (and step 4's
   half-edited map) gets its own and no stale entry can survive.
6. **`lengthTiles` stays authored** and `loadMap` throws if it disagrees with the computed length by
   more than `0.01`. One truth (the waypoints) plus a tripwire, rather than a second silent truth.
7. **No `spawns[]` array.** A path's spawn point is `waypoints[0]`. Step 4 says the same thing.
8. **Field names stay `widthTiles` / `heightTiles`**, not `cols` / `rows` — the rest of the codebase
   is `rangeTiles`, `speedTilesPerTick`.
9. **Track width is `trackWidthTiles` on `MapSource`, default 1.** Authored per map, because a
   6-lane-wide kitchen floor and a narrow counter want different tracks.

## Build

### 1. `MapSource` schema and `MapDef` (`core/content/schema.ts`, `core/types.ts`)

`MapSource`: `{ id, widthTiles, heightTiles, tiles: string[], trackWidthTiles?, paths: [{ id,
waypoints: Vec2[], lengthTiles }], fridge: { tile: Vec2, glyph }, decor: [{ glyph, tile }] }`.

`MapDef`: `{ id, widthTiles, heightTiles, paths, flags: number[], fridge, decor }`.

`TileFlags` as a const bitfield (`BUILDABLE`, `BLOCKED`, `DECOR`, `TRACK`) plus a
`canPlace(map, tile, placement)` helper reading `'off_path' | 'path_only'` — the same union
`schema.ts` already validates on towers. Put the helper here, in `core/`, so step 6 and step 4's
editor can't each invent their own answer.

Both live in `core/map.ts` alongside `loadMap`, matching the handoff contract below — this line used
to say `canPlace(flags, …)`, but reading a row-major grid needs `widthTiles`, so the whole `MapDef`
goes in. The `Placement` union moves onto `core/types.ts` and `schema.ts` pins its enum to it, the
same way it pins every other vocabulary.

Schema-level invariants, each with the offending id in the message:

- every row is exactly `widthTiles` chars, and there are exactly `heightTiles` rows
- only `.`, `#`, `~` appear
- every waypoint is inside the board
- consecutive waypoints are at least `0.1` tiles apart — a zero-length segment produces a `NaN`
  angle and breaks the binary search's invariant, and it is exactly what a double-click in step 4's
  editor will produce
- every path's last waypoint is within 1 tile of `fridge.tile`

### 2. `core/map.ts` — `loadMap(source): MapDef`

Char grid → flags, then rasterise each path's polyline and OR in `TRACK`.

Gotcha: rasterising by stepping waypoint-to-waypoint misses tiles on long diagonals. Walk each
segment in steps of at most `0.25` tiles and mark the tile under each sample, expanded by
`trackWidthTiles / 2` — cheap, runs once at load, and impossible to get subtly wrong.

Then verify `lengthTiles` per decision 6.

### 3. `core/path.ts`

- `samplePath(path, distance): { x, y, angle }` — binary search the cumulative array, lerp within
  the segment. O(log n); it runs for every enemy every tick from step 5 on.
- `totalLength(path)`, `remainingToFridge(path, distance)` — *along the track*, not euclidean to the
  fridge. `CONTENT.md` §5 depends on this for `FIRST`/`LAST` on multi-path maps.
- Clamp at both ends. Negative distance clamps to 0 (step 18's pushback will hand you one).

Gotcha: at a distance that lands exactly on a waypoint, two segments are equally valid. Pick the
segment being **entered** and say so in a comment, or the angle flips back and forth at every corner
and the renderer will show a stutter that looks like a physics bug.

### 4. A rough `counter.json`

24 × 14, one path from a baseboard crack bottom-left to the fridge top-right, 30–36 tiles of track,
generous buildable pockets both sides. **Structurally correct, not pretty** — 3C re-authors it with
the debug overlay to look at. Getting it beautiful now means judging it by reading JSON.

### 5. Update the callers

`core/content/maps/index.ts` (import the JSON, validate in dev, `loadMap` at module load, export
`MAPS: MapDef[]` and `MAP_SOURCES: MapSource[]`), `core/world.ts` (`cloneMapDef` copies `flags`),
and the specs that assert on the old placeholder.

`core/content/index.ts` drops `maps` from its own `validateContentInDev` call: the map check has to
run *before* `loadMap` derives from it, and zod's message names the offending field where
`loadMap`'s can only name the map. So maps validate themselves in `maps/index.ts`, and
`Content.maps` is `MapSource[]`, not `MapDef[]`.

## Tests

- `samplePath(p, 0)` is the first waypoint; `samplePath(p, totalLength(p))` is the last.
- Sampling at the exact cumulative length of **every** waypoint returns that waypoint within epsilon
  — this is the one that catches an off-by-one in the binary search.
- Sampling monotonically increasing distances produces monotonically increasing arc positions, with
  no backwards step at a segment boundary.
- Sampling past either end clamps, and `samplePath(p, -5)` equals `samplePath(p, 0)`.
- The rasterised `TRACK` set contains the tile of every waypoint, asserted against `counter.json`
  itself, not a synthetic path.
- `loadMap` on a source whose `lengthTiles` is wrong by 0.5 throws with the path id in the message.
- A `tiles` grid containing `T`, a short row, or two coincident waypoints each throws with the map
  id in the message.
- `createWorld()` still survives a deep JSON round-trip — extend the existing assertion rather than
  writing a second one, so `flags` is covered by the test that already guards this.

## Acceptance

- [x] No `Uint8Array`, `Float64Array` or `Map` anywhere on `World`.
- [x] `core/` still imports nothing but itself and zod; `core/map.ts` and `core/path.ts` know
      nothing about pixels.
- [x] Deleting a waypoint from `counter.json` changes which tiles are `TRACK` — the derivation is
      live, not baked into the file.
- [ ] `npm run test`, `npm run lint` and `npm run type-check` are green, and the game still shows
      step 1's bouncing emoji. *(all four commands green including `build`; the emoji is a look.)*

## Hands to 3B and 3C

These exports are the contract the next two sessions build against. If you change a signature,
change it here too.

```
core/map.ts    loadMap(source: MapSource): MapDef
               TileFlags  // BUILDABLE | BLOCKED | DECOR | TRACK
               canPlace(map: MapDef, tile: Vec2, placement: Placement): boolean
               flagsAt(map: MapDef, tile: Vec2): number   // 0 off the board; what makes canPlace safe
core/path.ts   samplePath(path: Path, distance: number): { x: number; y: number; angle: number }
               totalLength(path: Path): number
               remainingToFridge(path: Path, distance: number): number
```

Waypoints and `fridge.tile` are **tile coordinates with integers on tile centres**, the same space
`Vec2` uses everywhere else. 3B maps that to pixels; nothing in `core/` does.

## Do not

Draw anything — 3B owns every pixel, and there is no reason for this part to touch `render/`. Do not
build the debug overlay (3C) or the editor (step 4). Do not add fields for mechanics that don't
exist yet: mold corruption is step 15's flag to add, tile effects are step 14's own array, and a
`blockedByBarricade` flag belongs to step 10.
