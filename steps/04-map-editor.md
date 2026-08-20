# Step 4 — Map editor (dev route)

> This step is two sessions. Paste **one part file** into a fresh session, in order, and `/clear`
> between them. Do not paste this index — it exists to say what the parts are and how they fit.

**Prereq:** step 3, all three parts.

## Goal

Stop authoring maps by guessing coordinates. Half a day of work here turns each of the remaining
five maps from an hour of blind JSON editing into ten minutes, and makes retuning a track after
playtesting trivial instead of dreaded.

You are building this **early on purpose** — every map after `counter.json` gets made with it, and
step 21 authors five maps in one sitting.

## Parts

Each part names its own `Read first:` sections, so a session only loads the docs it needs.

| Part | Session | Builds |
| --- | --- | --- |
| [A](04-map-editor/A-document-and-validation.md) | The document, validation and JSON | `dev/editor/document.ts`, `validate.ts`, `serialize.ts`, `tests/editor.spec.ts` |
| [B](04-map-editor/B-canvas-and-tools.md) | The tool | `dev/editor/EditorView.vue`, `overlay.ts`, `preview.ts`, `panels/`, `dev/tileCoords.ts` |

Strictly in order. B never mutates a map itself — it turns pointer events into calls on A's
document, and draws the problems A reports.

A carries **all** of the step's tests, because it holds the two things that can be silently wrong:
an export that `loadMap` will reject three days later, and the thresholds every map from step 21 on
is judged against. B has none, per `../analytic-docs/ARCHITECTURE.md` §7 — and because vitest runs
`environment: 'node'` (`game/vite.config.ts`), so nothing B builds is reachable from a spec anyway.
That constraint is also why the split falls where it does: everything testable is DOM-free, and
everything DOM-shaped is untestable.

## The seam that can't move

**The authored `MapSource` is the editor's document, and every mutation goes through A's
`EditorDoc`.** Move the line so that B keeps its own editable structure and you get two
implementations of undo, two answers to what `lengthTiles` is worth mid-drag, and a round-trip that
is lossless only by coincidence.

## Step acceptance

- [ ] You can build a complete, valid, playable map from an empty grid in under ten minutes.
- [ ] Round-trip is lossless: import `counter.json`, export immediately, and the file is
      semantically identical — same flags, same track tile set, same decor.
- [ ] The production bundle contains no editor code — verify in the build output.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Over-build this. No undo/redo beyond A's 20-step history, no layers, no tile autotiling, no asset
browser, no dev-server endpoint that writes files into the repo. It's a tool for one user.

Do not author the other five maps — step 21 owns Sink, Pantry, Stove, Table and Floor, and it wants
them made with the finished tool. Do not put a simulation behind the board: enemies are step 5 and
towers are step 6, so B's preview button shows the map, not a night.
