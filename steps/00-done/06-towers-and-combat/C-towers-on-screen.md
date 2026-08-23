# Step 6C — Towers, shots and hits on screen

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../../CLAUDE.md`, `../../../analytic-docs/ARCHITECTURE.md` §6.
**Prereq:** step 6B.

## Goal

You place a salt shaker with the mouse and watch it kill ants. Towers on their tiles, a range circle
where you are about to build, salt in flight, a flash and a number on every hit. This is the session
that decides whether combat *feels* like anything, and it is the last one before the real HUD.

## Already in the repo

| File | What's there now |
| --- | --- |
| `render/renderer.ts` | `drawFrame(world \| null)`, the `(map, dpr)` bake, and the draw-order comment `terrain → track → tile effects → crumbs → towers → fridge → enemies → projectiles → particles → overlay`. The **towers and projectiles slots are literally comments**. `tilePx` is 0 until `setMap` runs |
| `render/layers/towers.ts` | a genuinely empty 0-byte file, not exported from the barrel |
| `render/layers/effects.ts` | `pushEvents(events, world)`, `drawEffects(ctx, tilePx, dpr)`, `resetEffects()`, module-local `flights`, aged in **frames** not ticks, with a `MAX_FLIGHTS` cap and the reason it is the one layer with state |
| `render/layers/index.ts` | the barrel `renderer.ts` imports layers through — a direct import trips the relative-path lint rule |
| `render/glyphCache.ts` | `blitGlyph(ctx, dpr, emoji, sizePx, x, y, flipX?)`, `getGlyph`, `preload`, `glyphCacheSize()`. Key is **`emoji\|sizePx\|dpr`**; `rasterise` never sets `fillStyle`, so everything comes out in the default black |
| `render/palette.ts` | named by **role**, never by colour, because step 23 retunes every value |
| `ui/views/GameView.vue` | `let world`, the queue, the `frameEvents` buffer, `onKeyDown` with `space` / `1` `2` `3` / `n` / `r`, and the DEV-only `Promise.all` dynamic import of `dev/debug/state.ts`, `dev/debug/overlay.ts`, `dev/editor/preview.ts`, `dev/nightHud.ts` |
| `dev/debug/state.ts` | `createDebugController(canvas, getMap)` — owns `pointermove` on the canvas and `keydown` on the window, the `` ` `` toggle, `[` `]`, the arrows — and exports `isTypingTarget(target)` |
| `dev/tileCoords.ts` | `toGridPoint(canvas, event, widthTiles)`, `toTile`, `isOnBoard`. **`event.offsetX / tilePx` is wrong by the CSS scale factor** — invisible at the centre of the board and a full tile at the corners. This file exists so nobody writes it twice |
| `dev/nightHud.ts` | the status line and the `n next wave · r restart` hint |
| `ui/locales/en.ts` | `debug.hint: 'space pause · 1 2 3 speed'` |
| 6A / 6B | `canPlaceTower`, `towerAt`, `placeTower`; `towerFired` and `enemyDamaged` events; `Projectile` with `position` in tile space |

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **Number keys select a tower; speed moves to `,` and `.`.** Step 8's hotkey list already lands
   exactly there — "1–9 shop … `,`/`.` for speed" — so binding it now means step 8 inherits it
   instead of churning it. Update `en.ts`'s `debug.hint` and `dev/nightHud.ts`'s hint line in the
   same edit, or the on-screen help lies from this session on.
2. **The placement controls live in a new `dev/placement.ts`**, dynamically imported from
   `GameView.vue`'s existing DEV `Promise.all`. `render/` ships and this is scaffolding step 8
   deletes — exactly the argument that put `dev/nightHud.ts` where it is.
3. **It enqueues commands and never writes to `world`.** `ARCHITECTURE.md` §3. Hand it the
   `CommandQueue` and a `() => World | null`; it owns its own listeners and its own `destroy()`, the
   way `createDebugController` does.
4. **`render/layers/towers.ts` draws towers and knows nothing about selection.** It exports
   `drawTowers(ctx, world, tilePx, dpr)` and `drawRangeCircle(ctx, tilePx, centerTile, radiusTiles,
   tone)`; *who* is highlighted is the caller's business, because the caller is `dev/` today and
   step 8's Vue HUD tomorrow. `render/` reads core state and owns no UI state — `effects.ts` is the
   one exception and it holds animation, not selection.
   **The last parameter is a three-state `PlacementTone`, not the `valid` boolean this line first
   said.** Decision 9 asks for a plainly-drawn circle on a *selected placed tower*, and that is
   neither valid nor invalid — a boolean can only carry two of the three, and the third one ends up
   as a second function. Built as `'valid' | 'invalid' | 'neutral'`.
5. **Projectiles are drawn in `towers.ts` too.** There is no `render/layers/projectiles.ts` and a
   fourth file for six lines is worse than the shared one. It is the tower's shot.
6. **Hit flashes and damage numbers go in `effects.ts`, driven off `enemyDamaged`** — aged in
   frames, capped, cleared by `resetEffects()`. The file already exists for exactly this shape and
   already has the cap, the frame ageing and the reset hook.
7. **The hit flash is a short expanding ring at the hit position, not a tint on the enemy glyph.**
   `blitGlyph` blits a pre-rasterised bitmap and cannot tint one, and — the real reason — the hit
   that *killed* the enemy has no glyph left to tint: `entities.ts` will not draw it next frame.
8. **Damage numbers go through the glyph cache, not `fillText`.** `getGlyph` is keyed on the string
   and does not care that the string is digits, so a repeated "5" is rasterised once and `render/`
   keeps the no-`fillText` property step 5C's acceptance recorded. This needs one change to
   `glyphCache.ts`: fold an optional `color` into the key and set `fillStyle` before `fillText` in
   `rasterise`. Colour fonts ignore `fillStyle`, so every existing emoji call is unaffected, and
   step 7's floating `+N` needs the same thing.
   **Round the number before you use it as a key.** `Math.round(amount)` is both what the player
   should read and what keeps the key space finite — an unrounded `5.000000001` gives the cache a
   fresh entry per hit, and the symptom is memory climbing all night with nothing else wrong.
9. **The range circle is tinted by `canPlaceTower`'s result** (6A), for the tile under the cursor
   while a tower type is selected, and drawn plainly for a selected placed tower. One function
   decides validity for the tint and for the command.
10. **Re-tune the Salt Shaker's `projectileSpeed` here.** 6B authored 0.2 tiles/tick with nothing on
    screen to judge it by; this is the first session that can watch one cross. Same for the
    hit-flash and damage-number lifetimes — pick them by looking, at 1× and at 3×.
    **The number is pinned in `tests/content.spec.ts`** alongside every other Salt Shaker stat, and
    that file this line failed to name is where re-tuning actually goes red. Edit both. Landed at
    **0.1** (6 tiles/sec), picked at the board: 0.2 read as a tracer round, and at 3× the shot and
    the hit were the same frame.
11. **Preload the tower glyphs after `setMap`, at the size you blit them at.** The cache key
    includes `sizePx` and `tilePx` is 0 until `setMap` — preloading early rasterises entries nothing
    ever reads and still pays for the real ones on the first frame. `restart()` in `GameView.vue`
    already does this for enemies and food; add a line.

## Build

### 1. `render/layers/towers.ts`

`drawTowers`, `drawProjectiles`, `drawRangeCircle`, `preloadTowerGlyphs(tilePx)`. Two more turned up
in the building: `drawPlacementTile`, because two of the three towers in the roster have no attack
behaviour and therefore no ring — aiming a Toaster Crumb Tray otherwise shows no answer at all until
the click — and `towerGlyphSize`, so the overlay's ghost is the size the placed tower will be rather
than a second copy of the scale constant. Tower glyphs at
their tile centre — `(tile.x + 0.5) * tilePx` — slightly larger than an enemy so a tower reads as
furniture and an ant reads as traffic. Projectiles as small dots or a tiny glyph at
`(position.x + 0.5) * tilePx`.

Export from `render/layers/index.ts` **and** call them in `renderer.ts` at the two slots the
draw-order comment already reserves. Update that comment if you move anything — it is the record of
that order, and step 5C set the precedent of keeping it honest.

New colours go in `render/palette.ts`, named by role (`RANGE_CIRCLE_VALID`, `HIT_FLASH`, …). The
file's header says why.

### 2. `render/layers/effects.ts`

Add the hit flash and the damage number off `enemyDamaged`, alongside the existing theft flights.
Same discipline as `flights`: a fixed cap, oldest dropped first, aged in frames, compacted in place,
and reset by `resetEffects()`.

At 3× speed three ticks run between two frames, so `pushEvents` can be handed three ticks' worth of
`enemyDamaged` at once — that is already how the frame buffer in `GameView.vue` works, and it is why
the cap matters more here than it did for thefts.

### 3. `dev/placement.ts`

Selected tower def (or none), selected placed tower (or none), the hover tile, the listeners and a
`destroy()`.

- Pointer position goes through `toGridPoint` / `toTile` from `dev/tileCoords.ts`. Not `offsetX`.
- **One click, one rule:** if `towerAt(world, tile)` returns a tower, select it; otherwise, if a
  tower type is selected, enqueue `PlaceTower`. No modifier key, and say so in a comment so the next
  session does not invent one.
  **Note the double-click case**, because it looks like a bug and is not one: `PlaceTower` drains at
  the next tick boundary, ~16ms, so the second click of a double-click lands on a tile that really
  does have a tower on it now, and selects it. Placing four in a row with four single clicks keeps
  the type armed throughout.
- `x` enqueues `SellTower` for the selected tower and clears the selection. `Escape` clears both
  selections.
- **Selecting a placed tower unequips the armed tower type.** Inspecting and building are two modes;
  staying armed leaves a ghost trailing the pointer across a board you are trying to read.
- **The canvas cursor carries the same answer the tint does** — `copy` on a tile that will take the
  tower, `not-allowed` on one that will not, `pointer` wherever there is a tower to select. It comes
  from the same single `canPlaceTower` call as the tint, and the tower case is checked first, so the
  pointer never promises something different from what the click does. Written only when it changes,
  and handed back on `destroy()`: the canvas outlives this controller on a route change.
- Guard every key with `isTypingTarget` — it is exported from `dev/debug/state.ts` for exactly this
  reason, and the editor route has text inputs.
- Do not swallow `` ` ``, `[`, `]` or the arrows; the debug controller owns those and both sets of
  listeners are live at once.
- It draws a translucent ghost of the selected tower at the hover tile. That is the "ghost preview"
  `core/systems/placement.ts`'s header attributes to step 8; it is here because without it the
  selected tower type appears nowhere on screen, and the acceptance below asks for the tile under
  the cursor to be unambiguous *before* the click. Step 8 rebuilds it in Vue and deletes this.
- Export `drawPlacementOverlay(ctx, world, state, tilePx, dpr)` — `dpr` because the ghost blits a
  glyph — drawn after `drawFrame` the way
  `drawDebugOverlay` and `drawNightHud` already are. It calls `drawRangeCircle` and `canPlaceTower`;
  it is the one place dev selection state and `render/` meet.

### 4. `ui/views/GameView.vue`

Wire it into the existing DEV block: import it in the same `Promise.all`, hand it the queue, call
its draw after `drawFrame`, and `destroy()` it in `onBeforeUnmount` beside `debug?.destroy()`.
Rebind speed to `,` / `.` per decision 1 and let the number keys reach `dev/placement.ts`.

`restart()` must clear the placement selection as well — a selected tower id from the night that
just ended points at nothing.

### 5. `ui/locales/en.ts` and `dev/nightHud.ts`

The two hint strings. `dev/nightHud.ts`'s line becomes something like
`1-3 tower · click place · x sell · n next wave · r restart`.

## Tests

**None.** `ARCHITECTURE.md` §7: renderer bugs are visible, and vitest runs `environment: 'node'`, so
nothing in this session is reachable from a spec anyway. The acceptance list below is the
instrumentation. Do not add a spec for `dev/placement.ts` to feel covered.

## Acceptance

- [x] Four Salt Shakers placed by hand along the Counter clear wave 1 of night 1 with no leak.
- [x] `glyphCacheSize()` is flat after the first minute of a night — the damage-number key space is
      bounded (decision 8). Checked directly rather than by watching: 2000 `enemyDamaged` events at
      the float amounts the matrix produces (`5.000000001`, `7.499999998`, …) added **zero** entries
      beyond the four distinct rounded values.
- [x] `render/` still contains no `fillText` outside `glyphCache.ts`'s rasteriser, and nothing in
      `render/` reads dev state.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.
- [x] Range circles, hit flashes and damage numbers all read clearly at 3× speed.
- [x] A salt shot reads as thrown salt, not as a tracer round.
- [x] The tile under the cursor is unambiguously buildable or not, *before* the click.
- [x] A kill is legible: you can tell which ant died and roughly what killed it, on a busy board.

## Do not

Do not build the Vue HUD — the shop panel, the tower inspector, the sell button, the rejection toast
and the real speed controls are all step 8's, in Vue, over this canvas, and `dev/placement.ts` is
scaffolding step 8 deletes. Do not draw crumbs or a `+N` collection popup (step 7), a noise meter
(step 13), upgrade or targeting-mode controls (step 12), or tower health bars (step 10). Do not put
anything dev-only in `render/`; it ships. Do not write to `world` from a key handler, a pointer
handler or a draw call — enqueue a command.
