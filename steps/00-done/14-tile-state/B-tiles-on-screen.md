# Step 14B — Tile state on screen, and the brush

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../../CLAUDE.md`, `../../../analytic-docs/ARCHITECTURE.md` §6,
`../../../analytic-docs/DECISIONS.md` §2 *Art: emoji sprites*.
**Prereq:** step 14A.

## Goal

A heated tile that looks dangerous, a slimed one that looks wet, mold you can watch creep, and a
brush that puts any of them anywhere in under a second. 14A's system has been running since it
shipped and nothing in the game can write to it yet — this session is both the eyes and the hands.

Build the brush **first**. It is twenty minutes, and it is what lets you look at a slime sheen thirty
times in two minutes instead of reasoning about alpha values in your head.

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/tiles.ts`, `core/systems/tiles.ts` | 14A's model, `writeEffect`, `clearEffect`, `tileStateAt`, `forEachTileWithEffect`, `TILE_EFFECT_DEFS` |
| `core/types.ts:336` | `TileState { tile: Vec2; effects: TileEffect[] }`, `TileEffect { kind; remainingTicks; magnitude }`. `magnitude` is mold's **stage**, 1–3 |
| `render/renderer.ts:146` | `drawFrame`, the documented draw order, and a stale `// tile effects: step 15` comment at the slot you are filling |
| `render/renderer.ts:130` | `ensureBake` — the terrain/track bake, keyed by `(map, dpr)`, with a `console.count` that is step 3B's acceptance criterion |
| `render/layers/effects.ts` | **not this layer.** It is the particle layer — theft flights, hit flashes, damage numbers, the wake wash. It is also the precedent you are following for module state and frame ageing; read its header |
| `render/layers/index.ts` | the barrel every layer is exported through, which `render/index.ts` re-exports |
| `render/palette.ts` | named by role, never by colour. `STATUS_SLOW_DISC` and friends at line 162 are the closest sibling to what you are adding |
| `dev/debug/state.ts` | `createDebugController(canvas, getMap)`, `` ` `` toggle, `hoverTile` tracked on `pointermove`, `[`/`]`/arrows, `isTypingTarget` guard |
| `dev/debug/overlay.ts` | `drawDebugOverlay(ctx, map, state, tilePx)` — a pure draw, `FLAG_TINTS` and its legend |
| `ui/views/GameView.vue:346` | the `import.meta.env.DEV` block that dynamically imports `dev/`, and `debug = createDebugController(canvasEl, currentMap)` |
| `ui/views/GameView.vue:334` | `onDevWakeNow` — a dev affordance writing straight to world state. Your precedent |
| `ui/interaction.ts:390` | `onKeyDown` on `window`. **Digits 1–0 are the tower shop's hotkeys**; Space, `,`, `.`, `n`, `x`, `u` and `Escape` are also taken |

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **The brush writes the world directly, through `core/tiles.ts`.** Not a command. A `PaintTile`
   member of the `Command` union would ship in every production build and sit in every command log,
   and the tool exists precisely to produce board states no command log would ever contain.
   `onDevWakeNow` in `GameView.vue` has written `world.noise.level` from a dev panel since step 13B
   for the same reason. Step 3C's decision 3 — the debug marker is not a command and not an entity —
   is not being overturned: that rule is about a tool that does **not** change the world pretending it
   might; this one changes the world on purpose and is `dev/`-only by construction.
2. **The brush is keyboard-on-hover, never a click.** `ui/interaction.ts` owns the canvas
   `pointerdown` for placement, selection and crumb collection, and both listeners would fire — so a
   click-brush paints a tile *and* builds a tower on it. `dev/debug/state.ts` already tracks
   `hoverTile` on `pointermove`, so holding a key while the pointer moves is a drag-brush for free.
3. **Not the digit keys.** `ui/interaction.ts:445` maps `1`–`0` onto `TOWERS`, on a `window`
   listener, so a digit brush arms a tower every time you paint. Use `h` heat, `s` slime, `m` mold,
   `r` residue, `c` scorch, `Backspace` clears the hovered tile. Check those five against that file's
   `onKeyDown` before you bind them; the list above is what is taken today.
4. **Nothing is baked.** The original step said to cache the permanent states (mold, scorch) into the
   terrain layer. The bake is keyed by `(map, dpr)` and redraws the whole board at device resolution,
   and both of those states change *during* a night — so caching them means invalidating the bake
   every time mold spreads, which fires step 3B's "bakes exactly once per map load" criterion several
   times a night to save a few dozen `fillRect`s. Draw everything in the live layer.
5. **Animation ages in frames, in a module-local counter**, exactly like `render/layers/effects.ts`.
   Not off `world.tick`: at 3× speed three ticks run between two frames and a tick-driven pulse runs
   three times as fast — step 13B, decision 2, settled this for the wake wash. This makes
   `tileEffects.ts` the second layer in `render/` with module state; document why in its header the
   way `effects.ts` does, or the next reader will move it. No reset export is needed: a free-running
   phase has no per-night meaning.
6. **The four treatments are told apart by shape as well as colour**, the way the status treatments
   at `palette.ts:162` are. Several kinds sit on one tile routinely — slimed *and* on fire is the
   canonical case in the design doc — and two coloured washes over one 48px square are one muddy
   square.
7. **`drawTileEffects(ctx, world, tilePx)`**, matching `drawProjectiles`. It takes `World | null`
   like every other layer, and returns early on null and on an empty `world.tiles`. Add `dpr` only if
   you end up blitting a glyph.

## Build

### 1. The brush — `dev/debug/state.ts`

- `brush: TileEffectKind | null` on `DebugState`. A letter key arms its kind; the same key again
  disarms; `Escape` is taken, so don't reach for it.
- `createDebugController(canvas, getMap, getWorld)` — a **getter**, never the world, matching
  `createInteraction(canvasEl, queue, selection, () => world, …)`. `restart()` replaces `world`
  wholesale on every retry, so a captured reference paints into the previous night.
- Painting happens in `update()`, which already runs once per drawn frame: if the overlay is on, a
  brush is armed, the brush key is still held and `hoverTile` is non-null, `writeEffect` at that
  tile. `writeEffect` refreshes rather than stacking, so once per frame is the right rate and a held
  key drag-paints.
- `Backspace` clears **every** effect on the hovered tile — a `clearEffect` per kind, not a splice of
  `world.tiles`. Going around the API is how the released-cell invariant 14A tests for stops holding.
- Everything behind `state.enabled` and the existing `isTypingTarget` guard, like the `` ` `` toggle.
  `preventDefault` on `Backspace`, or the browser navigates back and the session ends.

### 2. The readout — `dev/debug/overlay.ts`

Still a pure draw — which is why the effects readout costs it a parameter: `drawDebugOverlay` gains a
trailing `world: World | null` rather than `dev/debug/state.ts` caching a cell on `DebugState`. Add:

- the armed brush next to the flag legend, so "why is nothing painting" is answerable by looking.
- the hovered tile's effects on the existing hover label: kind, `remainingTicks` (`∞` for a negative
  one), and `magnitude`. That readout is what tells a wrong expiry from a wrong draw, and it is the
  only place in the session where you can see 14A's numbers at all.

### 3. `render/layers/tileEffects.ts`

Iterate `world.tiles`; per cell, draw its effects in a fixed order so a stack reads the same way
every time: **scorch, mold, slime, heat, residue** — the marks in the floor underneath, the wet and
the hot over them, the mist on top.

- **scorch** — a dark, irregular stain. It is permanent and it accumulates all night, so it has to be
  quiet: this is the one that turns the board into soot if you give it any contrast.
- **mold** — a fuzzy patch that grows with `effect.magnitude` (1, 2, 3). The three stages have to be
  distinguishable at a glance from across the board, because step 15's whole lesson is "you could
  have dealt with this two stages ago". Fuzz at a scale the grid does not share — `terrain.ts` learned
  this the hard way and `palette.ts:26` records it: anything that varies per tile draws the tile
  boundaries in, and a board of outlined squares is what you get.
- **slime** — a glossy sheen with a visible expiry fade, so "the trail is gone now" is information
  rather than a surprise. Fade off `remainingTicks` against the def's duration.
- **heat** — a warm pulse on the frame counter. It must read as *dangerous* rather than as lamp
  light: `LAMP_CORE` and `TOWER_LIGHT_CORE` are both warm amber already, and a heat glow in the same
  family is a tile that looks lit rather than lethal.
- **residue** — a faint coloured mist, the same green family as `STATUS_POISON_BUBBLE`, since what it
  does is apply poison.

Palette entries in `render/palette.ts`, named by role. No `createRadialGradient` per cell per frame —
`palette.ts:142` records why the crumb rot halo is two flat stops instead: with 300 cells in the
budget that allocation is on the 60Hz path.

Gotcha: a tile-space cell draws at `x * tilePx`, with **no `+ 0.5`**. The half-tile offset belongs to
things positioned at tile *centres* — entities, waypoints, the flash rings in `effects.ts`. A cell is
the square itself. Half a tile out looks almost right on a fill and obviously wrong the moment mold
sits next to the tower standing on it.

### 4. Wiring

`render/layers/index.ts` exports it; `renderer.ts` calls it at its documented slot, between the bake
blit and `drawCrumbs`, and **fix the `// tile effects: step 15` comment to say 14** while you are on
that line.

`GameView.vue` passes the world getter into `createDebugController`. Both the import and the call
stay inside the existing `import.meta.env.DEV` branch, so none of this reaches the production bundle
— verify in the build output, the way step 3C did.

## Tests

**None.** `ARCHITECTURE.md` §7: no tests over `render/`, and the bugs here are visible by
construction — that is the entire argument for building the brush first. 14A's suite is the
regression net for anything the brush exposes in `core/`; if the brush makes one of those specs fail,
the spec is right and the brush found a real bug.

If you find yourself wanting a test for the brush, you are building a feature that belongs in step
4's editor instead.

## Acceptance

- [ ] Painting heat, slime and mold from the brush produces the right visuals **and** the right enemy
      behaviour: an ant crossing a slimed tile visibly speeds up, one crossing a heated tile visibly
      loses health, and a molded tile refuses a tower with the right toast.
- [ ] A slimed and heated tile reads as both at once. If you can only see one of them, decision 6
      failed and the fix is shape, not alpha.
- [ ] Mold's three stages are tellable apart at a glance without moving closer to the screen.
- [ ] Play a night with a Toaster. The scorch marks left across the board tell the story of where the
      fighting happened, and they never accumulate into an unreadable smear.
- [ ] The frame budget is untouched with 300 cells painted — paint a block of them and watch the fps
      readout.
- [ ] The terrain bake still fires exactly once per map load with mold on the board (the
      `console.count` from step 3B), and the production bundle contains no `dev/debug` code.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Add the Mold enemy, the Slug, the Gas Stove Burner or any tower — steps 15 and 17, and every one of
them is cheaper there. Do not interpret the `tileEffect` behaviour (step 17). Do not add a field to
`World` or to `TileState`: everything this session needs is already stored, and a render concern that
needs simulation state is a render concern that is wrong. Do not put anything dev-only in `render/` —
it ships.
