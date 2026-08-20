# Step 4A — The editor document, validation and JSON

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §3.
**Prereq:** step 3 (all three parts).

## Goal

Everything the map editor does to a map, with no canvas anywhere near it: a mutable authored
document with undo, the rules a map is judged against, and the JSON that has to survive `loadMap`
when it comes back. Entirely headless, and every test step 4 has lives here.

Nothing is drawn this session. 4B builds the tool that drives all of it.

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/content/schema.ts` | `contentSchemas()` (dev-only, built on demand), `validateContent(raw): Content` returning `problems: string[]` with field paths, `MapSource` |
| `core/map.ts` | `loadMap(source): MapDef`, `TileFlags`, `canPlace(map, tile, placement)`, `flagsAt` |
| `core/path.ts` | `totalLength(path)`, `samplePath`, `remainingToFridge`; a module-level `WeakMap<Path, PathTable>` keyed by the **object** |
| `core/content/maps/index.ts` | `MAP_SOURCES` (the authored JSON as it sits on disk) and `MAPS` (`MAP_SOURCES.map(loadMap)`) |
| `core/content/maps/counter.json` | the Counter, authored by hand in 3C. Your fixture |
| `tests/path.spec.ts` | step 3's suite, asserting against `counter.json`. Do not fold your tests into it |
| `game/vite.config.ts` | vitest `include` is `tests/**/*.spec.ts` and `src/core/**/*.spec.ts`, `environment: 'node'` |

Two consequences of that last row. Your spec goes in `game/tests/editor.spec.ts` — a spec next to
the code in `src/dev/` is not collected and will silently never run. And there is no DOM in the test
environment, so nothing in this part may touch `document`, `window` or a canvas. That is the whole
reason this half is separable.

`core/path.ts`'s table is keyed by the `Path` object, so a document that rebuilds its `MapDef` on
every edit gets a fresh table each time and cannot read a stale length. Keep it that way — mutating
a `Path`'s `waypoints` array in place would leave the cached table behind and every length readout
would be one edit out of date.

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **The document *is* a `MapSource`.** Not a third shape, not `MapDef`. `MapDef` is derived and
   `TRACK` is rasterised into it, so an editor that edited one could paint track — which is the
   contradiction step 3 exists to have already settled (`DECISIONS.md` §3).
2. **`lengthTiles` is recomputed by the document on every edit**, never carried. `loadMap` throws
   when the authored value disagrees with the waypoints by more than `0.01` tiles, so a document
   that let it go stale would be unloadable through the entire middle of a drag.
3. **Export rounds waypoints to 2 decimals and then recomputes `lengthTiles` from the rounded
   values.** Rounding thirty waypoints by up to 0.005 each accumulates well past `loadMap`'s 0.01
   tolerance, so an export that rounds coordinates and keeps the pre-round length produces a file
   that throws at boot. `lengthTiles` itself is written at full precision — the field is a tripwire,
   not something a human reads (`counter.json` currently carries `31.12310562561766`).
4. **Import validates through `core/content/schema.ts`'s `validateContent({ maps: [parsed] })`**
   rather than a second schema here. It already formats one line per problem with the field path,
   and a second definition of a valid map is exactly the drift the schema file's header warns about.
   Importing it from `dev/` is safe: the editor route is behind `import.meta.env.DEV`, so this
   import lives in a chunk a production build never emits.
5. **Two validators, deliberately.** zod is the hard gate at import and export; `validate.ts` is a
   live advisory list that a half-finished map is *allowed* to fail. A document mid-edit has one
   waypoint, or a path that stops in the middle of the counter, and neither may throw.
6. **Every map is 24 × 14.** `CONTENT.md` fixes the grid, and the renderer derives `tilePx` from
   width alone against a 1152 × 672 logical board — a map of another shape draws off the bottom
   edge. There is no resize tool; the schema's 64-tile ceiling is not an invitation.
7. **"Buildable" means `canPlace(map, tile, 'off_path')`**, not "the `.` character". It is the
   question the player actually asks, and `core/map.ts` already says that reading the bitfield twice
   is how the editor ends up permitting a map the game refuses to build on.
8. **The editor never writes to disk.** Export is clipboard plus download; a human drops the file in
   `core/content/maps/` and adds one line to `maps/index.ts`. A Vite plugin that writes into the
   repo is a build-time backdoor for a five-second manual step.

## Build

### 1. `dev/editor/document.ts`

`createDocument(source: MapSource): EditorDoc` — the authored map, its derived `MapDef`, its problem
list and a 20-step history. One `edit()` call is one undo entry.

```ts
edit(mutate: (draft: MapSource) => void): void
```

The draft is a `structuredClone` of the current source; on return, recompute every path's
`lengthTiles` (decision 2), re-run `loadMap` and re-run the validator, then push the previous source
onto the undo stack and drop the oldest entry past 20. Cloning per edit rather than diffing is the
right trade here: a `MapSource` is fourteen strings and a handful of waypoints, and the alternative
is an undo system with its own bugs.

`snapshot(): EditorSnapshot` returns a small **plain** object — revision counter, problems, per-path
`{ id, lengthTiles }`, buildable percentage, `canUndo` / `canRedo`. 4B publishes it into a
`shallowRef` and never puts `EditorDoc` itself into Vue's reactivity: `MapDef.flags` is 336 numbers
rebuilt on every brush stroke, and that is `ARCHITECTURE.md` §5's trap one level down from the world.

**Gotcha, and it is the one that will cost an hour:** the document has to tolerate maps that are
transiently nonsense, because that is what the middle of an edit looks like. A path down to one
waypoint, a path with no waypoints, a map with no paths at all. `loadMap` survives all three today
(`measurePolyline` returns 0 and decision 2 keeps the authored value equal to it) — keep it that
way, and never call `validateContent` on a live document. The symptom if you get this wrong is an
editor that throws when you delete the second-to-last waypoint and takes the unsaved map with it.

### 2. `dev/editor/validate.ts`

`validateEditorMap(source, map): Problem[]`, where a `Problem` carries a severity, a message, and
the path id or tile it points at so 4B can highlight it.

**Errors** — the map cannot ship, because zod or `loadMap` will reject it:

- a path's last waypoint further than 1 tile from `fridge.tile` (`MAX_FRIDGE_GAP_TILES`); step 4's
  original wording called this a warning, but the schema refuses to load such a map, and finding out
  at export is worse than finding out while you drag
- consecutive waypoints closer than `0.1` tiles (`MIN_WAYPOINT_GAP_TILES`) — the schema's comment
  names this editor's double-click as the way it happens
- a waypoint, the fridge or a decor entry outside the board
- fewer than two waypoints on a path, or no paths at all
- **a `#` tile under the track.** Not a zod rule, but `canPlace` refuses `path_only` on a blocked
  tile, so the barricade slot silently disappears while enemies keep walking through — and
  `tests/path.spec.ts` asserts no track tile is blocked

**Warnings** — the map loads, but it will not play well:

- track shorter than 20 tiles or longer than 60
- fewer than 25% of tiles buildable (decision 7)
- any single segment longer than 6 tiles: the polyline reads as a straight corridor

Also export a convergence report for multi-path maps: where the lanes meet and how many tiles of
shared final stretch they have. `DECISIONS.md` §3 wants them merged, and step 21 asserts the shared
stretch is at least 6 tiles — so return the number, not a boolean.

**Gotcha with a live example:** the Counter's longest segments are `(0,11)→(6,11)` and `(6,6)→(12,6)`,
both exactly 6.0 tiles. Write the check as `> 6` and the shipped map is clean; write `>= 6` and the
only authored map in the repo fails its own validator on day one, which is the exact outcome 3C's
map was kept inside these thresholds to avoid.

### 3. `dev/editor/serialize.ts`

`toJson(source): string` — tabs, one waypoint per line, decisions 2 and 3 applied. `fromJson(text)`
— `JSON.parse`, then `validateContent({ maps: [parsed] })`, mapping `ContentValidationError.problems`
onto `Problem[]` so a bad paste lands in the same panel as everything else.

Key order in the output should match `counter.json` (`id`, `widthTiles`, `heightTiles`,
`trackWidthTiles`, `tiles`, `paths`, `fridge`, `decor`), so a re-exported map produces a readable
diff instead of a whole-file rewrite. `decor` and `trackWidthTiles` are optional in the schema:
preserve their absence rather than materialising `"decor": []`.

Also export `emptyMap(id: string): MapSource` — 24 × 14, a `#` border, buildable inside, one
two-waypoint path and a fridge. It is what 4B's "new map" button starts from and what the
under-ten-minutes acceptance is measured from.

## Tests

`game/tests/editor.spec.ts`.

- `fromJson(toJson(counter))` produces a source whose `loadMap` output has the identical `flags`
  array and the identical `TRACK` tile set as `loadMap(counter)` — the mechanical form of "round-trip
  is semantically identical".
- Moving a waypoint to `x = 6.123456`, exporting, and re-importing does **not** throw: the recomputed
  `lengthTiles` matches the rounded waypoints. Assert the coordinate came back as `6.12`.
- After `edit()` deletes a waypoint, the document's `MapDef` is rebuilt without throwing, and the
  reported length changed — proving `lengthTiles` is recomputed and no stale `path.ts` table is read.
- A path of 61 tiles warns and one of 60 does not; 19 warns and 20 does not.
- A segment of exactly 6.0 tiles produces no warning; 6.01 does.
- Painting `#` on a tile the polyline crosses produces an **error**.
- Buildable percentage counts `canPlace(…, 'off_path')` only, so track and decor tiles do not: the
  Counter's 219 floor tiles less its 33 track tiles is 186 of 336, i.e. 55%. A map at exactly 25%
  does not warn.
- Two paths sharing their last 8 tiles report a shared stretch of ~8; two that never meet report 0.
- 25 edits then 21 undos leaves the document at the state after edit 5, and the 21st undo is a no-op.
- **`counter.json` itself reports zero errors and zero warnings.** This is the assertion that keeps
  the repo's one authored map honest, and it re-runs whenever the map changes.

## Acceptance

- [ ] `src/dev/editor/` imports nothing from `vue`, and touches no browser global — the suite runs
      under `environment: 'node'`, which is the proof.
- [ ] A document driven through a hundred random edits never throws, and `loadMap` accepts it at
      every step.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 4B

These exports are the contract the next session builds against. If you change a signature, change it
here too.

```
dev/editor/document.ts    createDocument(source: MapSource): EditorDoc
                          EditorDoc.source: MapSource            // read-only to callers
                          EditorDoc.map: MapDef                  // derived, rebuilt per edit
                          EditorDoc.problems: readonly Problem[]
                          EditorDoc.edit(mutate: (draft: MapSource) => void): void
                          EditorDoc.undo(): void   redo(): void
                          EditorDoc.snapshot(): EditorSnapshot    // plain, for a shallowRef
dev/editor/validate.ts    validateEditorMap(source: MapSource, map: MapDef): Problem[]
                          Problem { severity: 'error' | 'warn'; message: string;
                                    pathId?: string; waypointIndex?: number; tile?: Vec2 }
                          convergenceOf(map: MapDef): { mergeTile: Vec2; sharedTiles: number }[]
dev/editor/serialize.ts   toJson(source: MapSource): string
                          fromJson(text: string): { source: MapSource } | { problems: Problem[] }
                          emptyMap(id: string): MapSource
```

## Do not

Build any part of the tool — no Vue component, no canvas, no pointer handling, no clipboard, no
download. 4B owns all of it, and the `EditorView.vue` placeholder stays as it is this session. Do not
change `core/`: if a rule here wants something `core/map.ts` doesn't expose, that is a finding to
write into this file, not a two-line edit to a file the simulation depends on. Do not author maps.
