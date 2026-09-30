# Step 23A — The dark kitchen

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §1 (tone) and §2 *Art: emoji
sprites* (its last paragraph, on terrain), `../../analytic-docs/ARCHITECTURE.md` §6,
`../../analytic-docs/SPRITES.md` *Constraints from the renderer*.
**Prereq:** step 20aB. Steps 21 and 22 aren't needed. The index says why.

## Goal

The flat-tile placeholder from step 3 has carried the game this far. This part makes it intentional.
At the end of it the kitchen is dark, the towers you place make it less dark, the floor has a
surface, everything standing on it has a shadow, and the HUD chrome is quieter than the board. It
also builds the switch D's colour-blind setting turns. **No tests**: ARCHITECTURE.md §7, bugs here
are visible. B draws its effects over what this part draws.

## Already in the repo

Trust symbols over line numbers.

| File | What's there now |
| --- | --- |
| `render/palette.ts` | About eighty constants named by role. `BACKGROUND` is duplicated as `--kd-night`, `SPRITE_HALO` as `--kd-sprite-halo`, the three `DAMAGE_NUMBER*` as `--kd-hit-*`. Hard whites: `PROJECTILE_SHOT`, `TILE_MOTTLE`, `TILE_SLIME_GLINT` |
| `render/layers/terrain.ts` | Flat fills per flag, 52 mottle blobs from a seeded LCG, rims on the blocked mass, three fixed `LAMPS` placed as board fractions, decor glyphs. All of it goes into the bake |
| `render/layers/track.ts` | A two-pass stroke with round joins and caps (**rounded track edges are already done**), the crack glyph, and **the fridge**, drawn into the bake through `fridgeGlyph` |
| `render/renderer.ts` | `rebake` keyed by `(map, dpr)`, the draw-order comment at the top of `drawFrame(world \| null, overlay)`. `loadSprites().then(…)` drops the bake so the fridge's sprite gets baked in |
| `render/layers/towers.ts` | `drawLightPools`: one `TOWER_LIGHT_*` pool per `reveal` behaviour, from gradients cached at the origin (`lightPool`), drawn before the pads. `drawAuraRims` after it |
| `render/layers/entities.ts` | `drawFlyerShadows`: one path and one fill for the board, shrinking with `bobPhase`. Walking enemies have no shadow. `ENEMY_SCALE` |
| `render/layers/crumbs.ts`, `food.ts`, `fridge.ts` | Crumb piles, dropped food, the shelf. None of them has a shadow |
| `render/layers/tileEffects.ts` | Heat is drawn in `TILE_HEAT_*` ember, and `palette.ts` explains why it's never lamp amber |
| `ui/App.vue` | The `--kd-*` night roles and the `--kd-day-*` roles, headed "functional colour only until the art pass in step 23" |
| `dev/editor/EditorView.vue` | Calls `renderer.setMap(doc.map)` and `drawFrame(null)`. Whatever `drawFrame` does with a null world, the editor shows |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **Darkness is a layer, not a darker palette.** Each frame an offscreen light map is filled with
   the night, has lights cut out of it with `destination-out`, and is drawn once over the bake. It
   goes **between the bake and the tile effects**. It darkens the floor and the track. Everything
   standing on or written onto the floor draws over it at full strength: tile effects, crumbs,
   towers, enemies, particles. That's how "the kitchen looks dark" and "the board is the brightest
   thing on screen" can both be true, and it keeps the threats legible in the dark. The draw-order
   comment in `renderer.ts` gets the new slot.
2. **Light sources come from behaviours, never from ids.** A `reveal` is a lamp: a warm pool at its
   radius (the Nightlight, the Candle). A `tileEffect` of kind `heat` is a flame (the Burner). The
   fridge is the one fixed light. A future lamp tower is config, so it arrives already lit. Delete
   `drawLightPools` in `towers.ts` once the layer lands, or every reveal gets lit twice.
3. **A flame lifts the dark without the amber.** `palette.ts` keeps heat out of the lamp family
   (`TILE_HEAT_PULSE`'s comment: an amber heat glow reads as *lit*, not *lethal*). The Burner's hole
   in the dark is uncoloured. The ember in `tileEffects.ts` still draws on top of it.
4. **The surface is chosen per map, by map id, in a new `render/surfaces.ts`.** The default is
   `'counter'`, and `'tile'` and `'wood'` exist for step 21's maps. It isn't a `MapSource` field. That
   would mean a schema change, `loadMap` and `cloneMapDef` changes, four hand-built `MapDef` literals
   in `tests/`, and a change to `dev/editor/serialize.ts`'s hand-written `toJson`, which drops any key
   it doesn't name. `en.ts` already keys map names by `MapDef.id`, so that's the precedent. Step 21
   adds a line per map in both places. An editor map with an unknown id gets the default.
5. **Shadows go under what stands on the floor:** towers (under the pad), walking enemies, crumb
   piles, dropped food, the fridge. Not flyers, which already have a shadow that moves with the bob.
   Not a burrowed Weevil, because the mound is the enemy. Not the Mold, whose pulse is its footprint.
   Use one path and one fill per layer per frame, like `drawFlyerShadows`. A `fill` per enemy is 200
   fills.
6. **The colour-blind variant is a handful of constants, switched in place.** The hue-critical
   ones become `export let` in `palette.ts`, reassigned by `setPaletteVariant(variant)`: at least
   `RANGE_VALID`, `RANGE_INVALID` and their fills (green against red, the pair deuteranopia loses),
   plus `HP_BAR_FILL` and `HONEY_WARNING`. ES live bindings mean no import site changes, and there
   are thirteen. On the CSS side, `:root[data-palette='colourblind']` overrides the matching `--kd-*`
   in `App.vue`. D wires up the setting. This part only makes both switches exist and work.
7. **Constants keep their role names.** Retune the values and don't rename anything (palette.ts's
   header says so). Every `render/` ↔ CSS duplicate pair moves together.

## Build

### 1. The palette, both sides: `render/palette.ts`, `ui/App.vue`

A deep blue-grey 2am base, warm amber where light is, cold blue for anything threatening. No hard
whites anywhere: the three in the table above, and any `#fff` in the CSS. The HUD chrome
(`--kd-panel*`, `--kd-text*`) has lower contrast than the board. Decisions 6 and 7.

Gotcha: **a cached bitmap or gradient built from a switchable colour keeps the old colour.** The
glyph cache keys damage numbers by colour, so those are safe. `lightPools` and `auraRims` in
`towers.ts` key by radius and role only. Keep every switchable constant out of anything cached, or
key the cache by variant. Symptom: switching the variant changes the range ring and leaves half the
board in the old palette until a reload.

### 2. The light layer: `render/layers/light.ts`, `renderer.ts`, `towers.ts`

Decisions 1–3.

- The light map is a new offscreen canvas. It needs its own `setTransform(dpr, …)` and a rebuild
  when the dpr changes, which is 3B's bake gotcha again. Symptom: every pool at a quarter of its size
  in the top-left.
- Rebuild the map when its **source signature** changes, not every frame. The signature is each
  source's tile and *effective* radius (`effectiveDefOf(tower)`), plus the dpr. Keyed by tower id
  alone, an upgraded Nightlight keeps its old pool until something else is placed. If a Candle gets
  a flicker, that's a cheap per-frame pass on top, not a rebuild.
- **The empty board has to stay readable.** Night 1's first wave has no towers on the board. If the
  ambient dark hides the track, or the difference between buildable and blocked, the first thing a
  new player sees is a black rectangle with nowhere to build. Set the ambient level on that board,
  before any light is placed.
- **The fridge is in the bake,** so the dark goes over it. Its own pool has to clear its tile
  completely, or its glyph moves out of the bake into `layers/fridge.ts`, which already draws every
  frame. Symptom otherwise: "the warmest, most solid object on the board" (SPRITES.md) reads as a
  dark lump. If you move it, the `loadSprites().then(…)` rebake in `renderer.ts` only exists for the
  fridge, and it can go too.
- The editor calls `drawFrame(null)`. Draw the layer with a null world as well, lit by the fridge
  alone, so a map is authored under the light it will be played in.
- `terrain.ts`'s `LAMPS` are the old fixed pools. Remove them, or keep one as a window. The dark has
  to be the room's default, and your towers make it less so.

### 3. Surfaces: `render/surfaces.ts`, `render/layers/terrain.ts`

Decision 4. Counter grain, tile grout, wood: subtle and flat, at a scale that can sit beside a 48px
sprite without competing with it.

Gotcha: **a texture at the tile's scale draws the grid back in.** 3B found this twice, with per-tile
jitter and with per-tile rims (see `TILE_MOTTLE`'s comment). Grout is the one surface whose lines
*should* fall on a grid, so give it a pitch that isn't the tile's (a half-tile or three-quarter-tile
tile), or it reads as the debug grid. Wood grain runs along planks narrower or wider than a tile.
Judge each surface on the Counter by switching its line in `surfaces.ts` for a moment.

### 4. Shadows: `towers.ts`, `entities.ts`, `crumbs.ts`, `food.ts`, `fridge.ts`

Decision 5. Soft, offset a little down and to the right, away from the lamp at the upper left (the
sprites' rim light, SPRITES.md). Keep them in `FLYER_SHADOW`'s colour family, so a flyer's shadow and
a walker's read as cast by one light.

Gotcha: `SPRITE_FILL` in `glyphCache.ts` sizes the frame so that the *object* comes out at `sizePx`.
Size a shadow from the object (`tilePx * ENEMY_SCALE`), not from the rasterised bitmap's width, or
every shadow is 18% too wide.

## Tests

**None.** ARCHITECTURE.md §7: no tests over `render/`. This part doesn't touch `core/`.

## Acceptance

- [ ] The kitchen looks like a dark kitchen at 2am, not a grid with emoji on it. Squint at it.
- [ ] Placing a Nightlight, then a Candle, visibly makes the kitchen less dark around them. The
      Burner lifts the dark without looking like a lamp.
- [ ] Night 1, first wave, no towers: the track and the places you can build are obvious.
- [ ] No surface texture reads as a grid at 1×.
- [ ] Nothing on screen is pure white, and the HUD chrome is quieter than the board.
- [ ] With `setPaletteVariant('colourblind')` called at startup and `data-palette` set by hand, the
      range ring's yes and no are still separable under devtools' *Rendering → Emulate vision
      deficiencies → Deuteranopia*.
- [ ] Forty towers and two hundred enemies still hold the frame rate `DebugOverlay` showed before
      this part.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

Leave every judgement criterion unticked unless you actually sat and looked.

## Hands to the next part

```
render/palette.ts    type PaletteVariant = 'standard' | 'colourblind'
                     setPaletteVariant(variant: PaletteVariant): void
ui/App.vue           :root[data-palette='colourblind'] { … }   // D sets documentElement.dataset.palette
render/surfaces.ts   type Surface = 'counter' | 'tile' | 'wood'
                     surfaceOf(mapId: string): Surface          // step 21 adds a line per map
```

Re-export the two `render/` exports through `render/index.ts`. B draws its scuttle over these
shadows, and must leave them where they are.

## Do not

No juice: no poofs, no shake, no new animation (B). No settings UI for the variant (D). No emoji
font (H). Don't touch `core/` or add a field to the map format (decision 4). Don't author maps (step
21), and don't change any sprite's art.
