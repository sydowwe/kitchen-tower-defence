# Step 7C — Crumbs, the click, the pop and the `+N`

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/ARCHITECTURE.md` §6,
`../../analytic-docs/DECISIONS.md` §4 (what the loop is meant to feel like) and §2 *Art: emoji
sprites*.
**Prereq:** steps 7A and 7B.

## Goal

Litter you can see and sweep. Piles on the floor sized by what they are worth, a rotting one that
tells you so before it costs you, a satisfying pop and a floating `+N` when you take it, and a mouse
that collects on click. **This is the most-repeated interaction in the game**, so this session is
mostly about how it feels rather than how much of it there is — and it is the session that decides
whether the crumb loop is a pull or a chore.

## Already in the repo

| File | What's there now |
| --- | --- |
| `render/layers/crumbs.ts` | a genuinely empty 0-byte file, not exported from the barrel |
| `render/renderer.ts` | `drawFrame(world \| null)`, and the draw-order comment `terrain → track → tile effects → **crumbs** → towers → fridge → enemies → projectiles → particles → overlay` with your slot **literally a `// crumbs: step 7` comment**. `tilePx` is 0 until `setMap` runs |
| `render/layers/effects.ts` | the one layer with state, on purpose: `pushEvents(events, world)`, `drawEffects(ctx, tilePx, dpr)`, `resetEffects()`. Theft flights, hit flashes and damage numbers, all aged in **frames** not ticks, each with a cap, compacted in place. Damage numbers already go through `blitGlyph`'s optional `color` |
| `render/glyphCache.ts` | `blitGlyph(ctx, dpr, emoji, sizePx, x, y, flipX?, color?)`. Key is **`emoji\|sizePx\|dpr\|color`** — a caller rasterising *text* has to keep that key space finite |
| `render/layers/index.ts`, `render/index.ts` | the two barrels; a direct cross-directory import trips the relative-path lint rule |
| `render/palette.ts` | named by **role**, never by colour, because step 23 retunes every value |
| `dev/placement.ts` | owns `pointerdown` / `pointermove` / `pointerleave` on the canvas and `keydown` on the window. Its `onPointerDown` is **"one click, one rule, and no modifier key"**: a tower on the tile selects it, else a selected tower type builds there. You are adding a third branch to that one handler |
| `dev/tileCoords.ts` | `toGridPoint(canvas, event, widthTiles)` → **fractional grid position, integers on tile corners**; `toTile` floors it; `gridToWaypoint(grid)` = `grid − 0.5`, which is the conversion into the space entity positions use |
| `dev/nightHud.ts` | the always-on status line and the `HINT` string, whose comment says it has to be edited in the same breath as any binding change. `ui/locales/en.ts`'s `debug.hint` is the other half |
| `ui/views/GameView.vue` | `restart()` calls `preloadEnemyGlyphs / preloadFoodGlyphs / preloadTowerGlyphs` **after** `setMap`, and `resetEffects()`; the DEV `Promise.all` dynamic import; the `frameEvents` buffer that accumulates every tick's events for one frame |
| 7A / 7B | `Crumb` piles on `world.crumbPiles`, `crumbCollected { crumbId, value, byTowerId }`, `isRotting(crumb)`, `isCollect(behaviour)`, `towerById(world, id)` |

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **The size bands live here and nowhere else.** A crumb has no def and `core/` carries no glyph for
   it (7A decision 8), so `glyphFor(value)` and `radiusTilesFor(value)` are pure functions of `value`
   in this file. Three bands is enough: a speck, a 🍞, a visible pile. Getting a fourth is one line
   later; getting a `size` field onto `Crumb` is a second truth forever.
2. **A claimed crumb's drawn position is interpolated here, and `core/` never moves it** (7A's
   handoff). Export **one** function, `crumbPosition(world, crumb): Vec2`, that returns
   `crumb.position` for an unclaimed pile and the lerp toward the claiming tower's tile for a claimed
   one, using `travelTicksRemaining` against the tower's `collect` behaviour's `travelTicks`. **Both
   the draw and the hit test call it**, which is what stops the click target sitting where the pile
   used to be while the pixels are somewhere else.
3. **The hit test lives in `render/layers/crumbs.ts` too**, as
   `pickCrumb(world, atTiles, tilePx, forgivenessPx): Crumb | null`. The forgiving radius is *the
   drawn radius plus a margin*, and the drawn radius is here — a hit test in `dev/` would be a second
   copy of the band table. `render/` reads core state and never writes it, so a pure query is legal;
   `drawRangeCircle` is the precedent for a primitive `dev/` composes.
4. **Prefer the largest crumb when several overlap**, ties by `world.crumbPiles` order. The player
   aimed at the pile they can see, which is the big one.
5. **In `dev/placement.ts`'s one handler, the crumb branch goes first.** Enemies die on the track and
   `off_path` towers stand beside it, so a crumb and a buildable tile almost never coincide — and a
   click that lands inside a crumb's forgiving radius was aimed at the crumb. Order: crumb → existing
   tower → selected def. No modifier key, and say so in a comment so the next session does not invent
   one.
6. **The pointer position goes into the hit test as `gridToWaypoint(toGridPoint(...))`, not as a
   floored tile.** `toGridPoint` puts integers on tile **corners** and `Crumb.position` puts them on
   tile **centres**; skipping the `− 0.5` makes every crumb feel like it has to be clicked half a
   tile up and to the left, which reads as unresponsive rather than as an offset.
7. **The pop and the `+N` go in `effects.ts`**, off `crumbCollected`, with the same discipline as the
   hit flash: a fixed cap, oldest dropped first, aged in frames, compacted in place, cleared by
   `resetEffects()`. The file exists for exactly this shape.
8. **The `+N` goes through `blitGlyph`'s `color`, not `fillText`.** Step 6C added the `color`
   parameter for the damage numbers *and named this popup as its second customer*. `render/` has no
   `fillText` outside `glyphCache.ts`'s rasteriser and step 5C's acceptance recorded that; keep it.
   The value is already an integer from `core/`, so the key space is bounded by the distinct values a
   night produces — do not format it with a decimal or a `+` per distinct amount beyond the one
   prefix.
9. **Crumbs are drawn under enemies**, at the slot the draw-order comment already reserves. A pile on
   the track will sometimes be walked over and that is correct: the litter is on the floor and the
   ants are on top of it.
10. **`dev/nightHud.ts` gets the HUD stub, not a Vue component.** Step 8 builds the real one and
    deletes this file; a component now is a component thrown away in a fortnight.
11. **Re-tune what 7A and 7B could only guess at.** The `collect` radii and `travelTicks: 90` in
    `core/content/towers.ts` were authored from the doc with nothing on screen; `ROT_TICKS` and
    `HATCH_TICKS` were authored from the doc with no night to watch. If any of them is wrong when you
    look at it, change it — and **change `tests/content.spec.ts` in the same edit**, which is where a
    re-tuned tower number actually goes red. Step 6C set this precedent with `projectileSpeed`.

## Build

### 1. `render/layers/crumbs.ts`

`drawCrumbs(ctx, world, tilePx, dpr)`, `crumbPosition`, `pickCrumb`, `preloadCrumbGlyphs(tilePx)`,
and the band table.

- Glyphs at `(position.x + 0.5) * tilePx`, sized by band, smaller than an enemy — litter is small.
- A **rotting** pile (`isRotting(crumb)`) reads as spoiled at a glance without reading a number: a
  faint green cast under the glyph, or a slow pulse, or a fly speck orbiting it. Pick one and look at
  it on a busy board; two of them together is noise. It has to be legible at 3× speed, because that
  is the speed at which the player stops noticing the floor.
- A **claimed** pile draws at `crumbPosition`, which is already moving toward its tower. Nothing else
  distinguishes it; the movement is the tell.
- `preloadCrumbGlyphs` rasterises the band glyphs at the sizes this layer blits them at. The cache
  key includes `sizePx` and `tilePx` is 0 until `setMap` — preloading early fills the cache with
  entries nothing reads and still pays for the real ones on the first frame.

New colours go in `render/palette.ts`, named by role (`CRUMB_ROT_TINT`, `CRUMB_POP`, …). The file's
header says why.

### 2. `render/renderer.ts` and the barrels

Call `drawCrumbs` at the `// crumbs: step 7` slot and delete the comment. Export from
`render/layers/index.ts` and `render/index.ts`. If you move anything in the draw order, update the
comment — it is the record of that order and step 5C set the precedent of keeping it honest.

### 3. `render/layers/effects.ts`

A collection pop and a floating `+N` off `crumbCollected`, at the crumb's last drawn position.

The event carries `byTowerId`, so a click and a tower delivery can read differently — a click is the
player's action and deserves the louder one. **The pop is the reward for the most-repeated
interaction in the game**; spend a little effort here and look at it before moving on.

At 3× speed three ticks arrive between two frames and a tower can deliver several piles at once, so
the cap matters the same way it does for the damage numbers. `resetEffects()` clears the new pools
too, or the next night opens with the last one's popups.

### 4. `dev/placement.ts`

The third branch in `onPointerDown` per decisions 5 and 6, enqueueing
`{ kind: 'CollectCrumb', crumbId }`. **It enqueues a command and never writes to `world`**
(`ARCHITECTURE.md` §3) — the crumb is credited at the next tick boundary, not in the handler.

Pick the forgiveness margin by clicking at it: the step file's ~6px is a starting guess made without
a cursor. Keep it a named constant so step 20's Buy-a-Broom sweep has something to widen.

### 5. `dev/nightHud.ts` and the two hint strings

Add crumbs on the board (a pile count and their total value) and a rot-warning count —
`world.crumbPiles.filter(isRotting).length` — to the status line. `world.crumbs` is already there.
Then update the `HINT` line and `en.ts`'s `debug.hint` to mention clicking a crumb, in the same edit,
or the on-screen help lies from this session on.

### 6. `ui/views/GameView.vue`

One line: `preloadCrumbGlyphs(renderer.tilePx)` in `restart()`, after `setMap`, beside the three
preloads already there.

## Tests

**None.** `ARCHITECTURE.md` §7: renderer bugs are visible, and vitest runs `environment: 'node'`, so
nothing in this session is reachable from a spec anyway. The acceptance list below is the
instrumentation. Do not add a spec for `pickCrumb` to feel covered — if you re-tune a number in
`core/content/towers.ts`, the existing `tests/content.spec.ts` assertion is the one that must change
with it.

## Acceptance

- [ ] Collecting a big pile feels good.
- [ ] You can tell a rotting pile from a fresh one at a glance, at 3× speed, without pausing.
- [ ] Clicking a crumb collects the crumb you were pointing at — including one in flight to a tower —
      at every window size and at all four corners of the board.
- [ ] Playing night 3 while ignoring the board floor produces visible fly problems by wave 6, and a
      careless night 1 produces two or three flies, not ten. If it is ten, `ROT_TICKS` /
      `HATCH_TICKS` are the knobs (decision 11).
- [ ] A Crumb Tray placed in a kill zone measurably out-earns one placed in a corner — check it by
      watching the wallet, not by reasoning about the radius.
- [ ] `render/` still contains no `fillText` outside `glyphCache.ts`'s rasteriser, and nothing in
      `render/` reads dev state or writes to `world`.
- [ ] `glyphCacheSize()` is flat after the first minute of a night — the `+N` key space is bounded.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Do not build the Vue HUD — the crumb counter, the night summary's collected-versus-dropped line and
the real pointer handling are step 8's, in Vue, over this canvas, and `dev/placement.ts` and
`dev/nightHud.ts` are both scaffolding step 8 deletes. Do not draw a noise meter (step 13), tile
effects (step 14), or a flyer's shadow and bob (step 11) — a hatched Fruit Fly draws exactly like
every other enemy this session. Do not put anything dev-only in `render/`; it ships. Do not write to
`world` from a pointer handler or a draw call — enqueue a command. Do not add a sweep radius or a
faster dustpan; both installations are step 20's, and the two parameters they need already exist.
