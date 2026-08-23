# Step 5C — Enemies, the shelf, and the night on screen

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, `../../analytic-docs/ARCHITECTURE.md` §5 and §6, `../../analytic-docs/DECISIONS.md` §6.
**Prereq:** step 5B.

## Goal

The first playable night. Ants walk out of the crack, the fridge's shelf empties one named item at a
time, and the night ends by itself. This is the session that finally puts a `World` behind
`GameView.vue` — every frame before this one has been drawing a picture.

## Already in the repo

| File | What's there now |
| --- | --- |
| `render/renderer.ts` | `drawFrame(world: World \| null)`, the `(map, dpr)` bake, and the draw-order comment: `terrain → track → tile effects → crumbs → towers → enemies → projectiles → particles → overlay` |
| `render/layers/entities.ts` | the loop, the tile→pixel conversion, and `glyphFor(enemy)` **returning null** — 3B left it as the seam for this session |
| `render/layers/track.ts` | draws the fridge glyph and a crack glyph per path start **into the bake** |
| `render/layers/effects.ts`, `crumbs.ts`, `towers.ts`, `overlay.ts` | empty stub files |
| `render/glyphCache.ts` | `blitGlyph(ctx, dpr, emoji, sizePx, x, y)` — rasterise once, snap to device pixels; `preload(glyphs)`; `EMOJI_FONT` for the one rotated glyph `blitGlyph` cannot express |
| `ui/views/GameView.vue` | the canvas, the loop with an **empty `tick()`**, `drawFrame(null)`, a `Snapshot` of six numbers published at ~15Hz, `space`/`1`/`2`/`3` key handling, and the dev-only dynamic imports of `dev/debug/*` and the editor preview slot |
| `dev/debug/state.ts` | `createDebugController(canvas, getMap)`, the `` ` `` toggle, and `isTypingTarget(target)` — reuse that guard |
| `dev/debug/overlay.ts` | the tile-flag tint, the path marker, canvas text drawing you can copy from |
| `core/` | 5A and 5B: `createWorld`, `tick(world, queue)`, `createCommandQueue()`, `nightClock`, `getFoodDef`, `getEnemyDef` |

No tests this session — `ARCHITECTURE.md` §7, and vitest runs `environment: 'node'` so nothing here
is reachable from a spec anyway.

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **`GameView.vue` owns the world.** A plain `let world`, never a `ref`, never a store — deep
   reactivity over hundreds of entities mutated 60 times a second is the trap the whole layout exists
   to avoid (`ARCHITECTURE.md` §5). The snapshot stays a `shallowRef` of numbers.
2. **Events are accumulated per tick, not per frame.** `tick()` clears `world.events` at the top
   (5B, decision 5), so at 3× speed three ticks run between two frames and a renderer reading
   `world.events` in `draw()` sees only the last one's. The loop's `tick` callback appends to a
   frame-local array; `draw()` hands that array to the effects layer and empties it. Anything else
   silently drops two thirds of your thefts at 3×.
3. **Enemies flip, they do not rotate.** Take the heading from `samplePath().angle` and mirror the
   glyph horizontally when it points left. A rotated 🐜 on the Counter's vertical runs reads as a
   dead ant, and every enemy in the roster is drawn side-on. Add an optional `flipX` to `blitGlyph`
   rather than a second copy of its device-pixel rounding.
4. **The shelf is drawn per frame, in a new `render/layers/fridge.ts`.** The fridge *glyph* stays in
   the bake where 3B put it; the items on it change every time one is stolen and cannot be baked.
   Draw order gains one entry — `… towers → fridge → enemies → …` — so an ant at the fridge is drawn
   over the shelf it is robbing. Update the comment in `renderer.ts`; it is the record of that order.
5. **The theft animation lives in `render/layers/effects.ts` as module-local state**, fed only from
   drained events, aged in frames. `render/` reads core state and never writes it, and a flying
   glyph is not simulation — it must not exist in `World`, or a replay would carry animation frames.
   Export a `resetEffects()` and call it on restart, or items keep flying out of the previous night.
6. **The dev text goes in `dev/nightHud.ts`, not `render/`.** `render/` ships; this is scaffolding
   that step 8 deletes. Draw it from the same `import.meta.env.DEV` dynamic-import block
   `GameView.vue` already uses for the debug overlay, and keep it always-on rather than behind the
   `` ` `` toggle — this step's acceptance is watching a night unattended.
7. **`n` and `r` are dev keys on the existing `onKeyDown`,** guarded by `isTypingTarget`. `n`
   enqueues `CallWaveEarly` — **a command, never a direct call into the wave system**
   (`ARCHITECTURE.md` §3). `r` rebuilds the world.
8. **Restart is `createWorld` again**, plus `renderer.setMap(world.map)` and `resetEffects()`. The
   world holds its own clone of the map, so the new world's map is a different object and the bake
   re-fires exactly once — which is correct, not the per-frame bake 3B's counter watches for.

## Build

### 1. `render/layers/entities.ts`

Fill in `glyphFor` from `getEnemyDef(enemy.defId).glyph`, flip per decision 3, and add an HP bar
above any enemy with `hp < maxHp`: a thin two-tone bar a little wider than the glyph, no text.

Nothing damages an enemy until step 6, so **the bar is unexercised this session** — write it, check
it once by hand-editing an enemy's `hp` in the console, and do not spend the session tuning it.

### 2. `render/layers/fridge.ts`

The remaining items as a row (or two short rows) of glyphs beside `map.fridge.tile`, at maybe 0.5
tiles each. This is the health bar and it has to be readable at a glance: count-at-a-glance beats
neat, so keep the items in a stable order and let the row shorten from one end rather than
re-flowing every time one goes.

`preload()` the food and enemy glyphs when the world is created, so the first frame of a night is
not the one paying to rasterise twenty emoji.

### 3. `render/layers/effects.ts`

`pushEvents(events)`, `drawEffects(ctx, …)`, `resetEffects()`. On `enemyLeaked`, one flying glyph per
stolen id — `getFoodDef(item.defId).glyph`, arcing from the shelf off the top of the board over
~0.6s, fading. Cap the live list so a 40-item leak cannot stall a frame.

Look up the `FoodItem` by id in `world.night.food` at the moment the event arrives, not later: it is
still there (5B marks `lost`, never splices), and holding a reference into world state across frames
is how a renderer ends up pinning a dead entity.

### 4. `ui/views/GameView.vue`

The world, the queue, and the wiring:

- `createWorld({ seed, mapId: 'counter', nightId: 'night01', difficulty: 'normal' })` with a fixed
  dev seed, then `renderer.setMap(world.map)` — **the world's clone**, not `getMapDef('counter')`,
  or step 15's mold will corrupt one copy and draw the other.
- `tick()`: `tick(world, queue)` then append `world.events` to the frame buffer (decision 2).
- `draw()`: `drawFrame(world)`, then drain the buffer into the effects layer.
- `publish()`: `entityCount` becomes `world.enemies.length`.
- Keys `n` and `r` per decision 7.

**The editor preview slot** (`takePreviewMap()`, step 4B) currently replaces the drawn map. A world
cannot be created from an unregistered map, so assign the preview onto `world.map` after
`createWorld` and before the first tick. A preview map whose paths were renamed then has no `'crack'`
and 5A's `startWave` throws with both ids in the message — which is the right failure for a dev-only
route, and worth a line in the editor panel if it annoys you.

### 5. `dev/nightHud.ts`

One line of canvas text, always on in dev: `Wave 2/6 · 2:48am · Food 14/18 · Crumbs 200`, plus
`n next wave · r restart` and the phase when it is `won` or `lost`. The clock comes from `nightClock`
(5B) — never from a timer of its own.

### 6. Re-tune nights 1–3 — `core/content/nights.ts`

5A drafted the wave tables blind. This is the first session that can watch one. Play night 1 at 1×
and at 3×, then fix the ramp: waves that arrive as a readable stream rather than a clump, a night 1
that walks the whole Counter without the board ever looking empty for ten seconds, and a night 3 that
introduces the Roach as a visible change of pace rather than a faster ant nobody notices. Re-tune the
numbers, not the shape — 5A's spec does not assert them, by design.

## Tests

**None.** `ARCHITECTURE.md` §7: renderer bugs are visible, and the acceptance list below is the
instrumentation. Do not add a spec for `dev/nightHud.ts` to feel covered.

## Acceptance

- [ ] Night 1 plays out unattended from a fresh load: six waves of ants walk the Counter, empty the
      fridge, and the night ends `lost` with no input at all.
- [ ] `r` restarts to an identical opening — same ants, same food, same order — and the terrain bake
      counter goes up by exactly one.
- [ ] The clock reads 2:00am on wave 1 and 6:00am on the final wave.
- [ ] Same seed, same result: run it twice, log the events, diff them.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.
- [ ] The frame at 3× with ~60 ants on the board holds 60fps, and `drawFrame` still contains no
      `fillText` outside the dev HUD.
- [ ] A queue of ants on the track stays countable — you can see there are six, not "some".
- [ ] Losing an item reads as a *theft*: you see which item left, and you can name it afterwards.
- [ ] Night 1's ramp feels like a ramp, at 1× and at 3×.

## Do not

Do not build the real HUD — the wave counter, the clock, the food display and the call-wave button
are step 8's, in Vue, over this canvas; `dev/nightHud.ts` is scaffolding step 8 deletes. Do not add
tower placement, click-to-select, hover highlighting or range circles (step 6), and do not draw
crumbs (step 7). Do not put anything dev-only in `render/` — it ships. Do not write to `world` from a
key handler or a draw call: enqueue a command.
