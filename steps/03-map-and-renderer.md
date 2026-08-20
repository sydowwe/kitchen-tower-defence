# Step 3 — Map format, path sampling, board renderer

> This step is three sessions. Paste **one part file** into a fresh session, in order, and `/clear`
> between them. Do not paste this index — it exists to say what the parts are and how they fit.

**Prereq:** step 2.

## Goal

A kitchen you can look at, with a track drawn on it, and the maths that lets an enemy walk that
track from a single float.

## Parts

Each part names its own `Read first:` sections, so a session only loads the docs it needs.

| Part | Session | Builds |
| --- | --- | --- |
| [A](03-map-and-renderer/A-map-and-path.md) | Map format and path maths | `core/map.ts`, `core/path.ts`, the map schema, a rough `counter.json` |
| [B](03-map-and-renderer/B-renderer.md) | Board renderer | `render/palette.ts`, `render/layers/terrain.ts`, `track.ts`, `entities.ts`, `render/renderer.ts` |
| [C](03-map-and-renderer/C-overlay-and-counter.md) | Debug overlay, and authoring the Counter | `dev/debug/`, then the real `counter.json` |

Strictly in order. B draws what A derives; C is the tool you author the final map with, so the map
is only finished at the end of C.

A carries **all four of the step's tests** — the format and the sampler share the assertion that a
rasterised `TRACK` tile set contains every waypoint's tile, and splitting them costs you that test.
B and C have no tests at all, by `../analytic-docs/ARCHITECTURE.md` §7.

The map is authored twice on purpose: A ships a structurally-correct 24 × 14 draft so B has
something real to draw, and C replaces it with the version that looks like a kitchen. Trying to make
it pretty in A means judging it with no renderer.

## Step acceptance

- [ ] The Counter map renders and looks like a place, not a debug grid.
- [ ] The debug marker slides smoothly along the whole track including corners, with no jump at
      segment boundaries.
- [ ] Terrain is drawn once — confirm with a counter that the terrain bake fires exactly once per
      map load.
- [ ] `npm run test`, `npm run lint` and `npm run type-check` are green.

## Do not

Add enemies, towers, spawning, or interactivity. This step is geometry and pixels.
