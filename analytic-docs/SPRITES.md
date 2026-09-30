# Sprites — AI generation brief

A shopping list and prompt text for replacing the emoji entities with generated sprites: every v1
tower and enemy, with a tick against the ones already in the game. Stats and roles are in [CONTENT.md](CONTENT.md); this file only
says what each thing should *look* like.

Why sprites at all, given D4 chose emoji: DECISION-LOG D21. A sprite is live as soon as its file is
in place — `render/sprites.ts` matches it to a tower or enemy by name, and the emoji stays the
fallback for everything without one.

---

## Constraints from the renderer

- **Enemies are side-on, facing right.** The renderer mirrors an enemy heading left and never
  rotates one (`game/src/render/layers/entities.ts`, `game/src/render/glyphCache.ts` — step 5C,
  decision 3). A top-down bug will not work.
- **One static frame per sprite.** Bob, hop, chewing bite, stagger tilt, slow/freeze tints and
  shove afterimages are all drawn in code. No walk cycles.
- **Must read at ~48px**, the size step 23 audits the roster at. Generate at 1024×1024, downscale to
  128×128 (covers 2× DPR), and judge every sprite at 48px before accepting it.
- **No baked shadow.** Step 23's art pass adds soft shadows under every entity in code.
- **No baked light outer edge either.** The navy outline is close to the buildable tile colour
  (`game/src/render/palette.ts`), so on the board it all but disappears. The glyph cache adds a
  thin light halo when it rasterises the sprite (`SPRITE_HALO` in `palette.ts`, `HALO_PX` in
  `glyphCache.ts`). A halo baked into the art would double up with it.
- **The 85% fill is load-bearing.** The cache scales the frame so the object inside it comes out
  the size the emoji was, assuming it fills 85% of the frame's longest side. A sprite that fills
  less draws small.
- **Transparent background**, object centred, filling ~85% of the frame.
- **Deliver 128×128 PNG for the game plus the SVG master.** A 48px export is a preview only — the
  canvas draws at 2× device pixels, so it would blur.

## Where the files go

```
art/{tower,enemy,crumb}/<name>.svg                              masters, never bundled
game/src/assets/sprites/{tower,enemy,crumb}/<name>_128.png      what the game imports
```

`<name>` is the content id from `core/content/towers.ts` / `enemies.ts` in snake_case:
`toasterCrumbTray` → `toaster_crumb_tray`. For a crumb pile it is the band's `id` in
`render/crumbBands.ts`: `small`, `medium`, `large`. Not a shortened name (`box`), not a synonym (`housefly`),
no `_sprite` suffix — a file whose name matches no id is ignored, with a warning in the dev console.
The 1024 export is not kept; re-export from the SVG if a larger size is ever needed.

**State variants** add a suffix to the name: `<name>_<state>_128.png`. The default sprite has no
suffix (`mousetrap`, not `mousetrap_armed`). Two states exist, each read by `layers/towers.ts`:

| State | Drawn when | Used by |
|---|---|---|
| `sprung` | the tower is rearming a charge | Mousetrap (any tower with a rearm could have one) |
| `damaged` | a barricade is below its first HP threshold; replaces the drawn cracks | Cardboard Box |

A state with no file draws the default sprite. A new state is a line in `SpriteState`
(`render/sprites.ts`) plus the branch in `layers/towers.ts` that picks it.

**Every enemy draws at the same size**, and so does every tower (`ENEMY_SCALE`, `TOWER_SCALE`), with
the object filling 85% of its frame. Size differences drawn into the art disappear on the board —
tell look-alikes apart by shape and colour. A per-entity scale would be a renderer change.

The 85% is of the **longest side**, so a long, flat creature ends up thin: a Silverfish three times
wider than tall is about 10px high on the board. Keep bodies deep enough to read at that height —
especially anything meant to look tough.

## Workflow against style drift

1. Generate the whole starter set in one session with the same tool and model.
2. Accept one sprite first (the Salt Shaker), then pass it as a style/image reference for every
   prompt after it.
3. Put all accepted sprites side by side at 48px on a mid-grey background before calling a batch
   done. Not the board's dark blue: without the halo the outline vanishes there, and that is the
   halo's job to fix, not the sprite's. Reject anything whose outline weight, palette or view angle stands out.

## Shared style block

Prefix every prompt with this:

> Game sprite for a quiet, slightly tense kitchen tower defence set at 2am. Flat illustrated style,
> bold dark-navy outline (~4% of image width), 2–3 tone cel shading, warm rim light from the upper
> left as if from a single lamp, saturated but not neon. Single object, centred, filling ~85% of the
> frame, transparent background, no ground shadow, no text, no border, no scene. The navy outline
> is the outermost edge — no light halo, glow or sticker border outside it. Chunky, readable
> silhouette that still reads at 48 pixels.

Then add one of:

- **Towers:** "Three-quarter front view, sitting on a surface. An ordinary household object — no face,
  no eyes, no limbs." (README: *no googly eyes; the objects just quietly do their jobs.*)
- **Enemies:** "Strict side profile, facing right, legs visible, mid-stride. A real insect drawn
  stylised, not a cartoon mascot — no smile, no human expression."

---

## Towers

The whole v1 roster, in shop order. **File** is the `<name>` the PNG must carry, or the sprite is
ignored. Stats and roles: [CONTENT.md](CONTENT.md) §1. Generate in the order the nights introduce
things — the *Unlocks tower* and *New enemy* columns of CONTENT.md §6 — so the early nights are
fully drawn first.

A few pairs are easy to confuse, and each description says what keeps them apart: Sticky Tape /
Fly Paper, Spray Bottle / Vinegar Spray, Toaster / Gas Stove Burner, Cookie Jar / Honey Pot, Salt
Shaker / Baking Soda.

| Done | Tower | File | Glyph | Description |
|---|---|---|---|---|
| ✓ | Salt Shaker | `salt_shaker` | 🧂 | Classic glass salt shaker with a domed chrome cap and 5–6 visible holes. Frosted glass, white salt about two-thirds full. Tilted ~10° forward as if mid-shake. The baseline tower — keep it plain and iconic. |
| ✓ | Toaster Crumb Tray | `toaster_crumb_tray` | 🧺 | Small wicker bread basket lined with a red-and-white checkered cloth, a few golden crumbs on the cloth. Must read as a *container*. No whole bread loaf — crumb piles are drawn with 🍞 and the two must never share a silhouette (see the note on `toasterCrumbTray` in `core/content/towers.ts`). |
| ✓ | Cookie Jar | `cookie_jar` | 🫙 | Tall clear glass jar with a rounded glass lid and a knob on top, three or four round chocolate-chip cookies stacked inside, seen through the glass. Cool glass highlights. The cookies stay *inside* — loose cookies would read as a crumb pile. Tall and upright, against the Honey Pot's squat ceramic. |
| ✓ | Ice Cube Tray | `ice_cube_tray` | 🧊 | Short blue plastic ice cube tray (2×3 cups) holding frosty cubes, faint cold mist curling up, pale cyan highlights, small frost sparkles. Must not read as a single ice cube — that is what the freeze status looks like. |
| ✓ | Sticky Tape | `sticky_tape` | 🧻 | Roll of clear/amber packing tape with a loose strip curling off in an S-curve, glossy, a few specks stuck to it. Cardboard core visible. Lies on the surface, against the Fly Paper, which hangs. |
| ✓ | Spray Bottle | `spray_bottle` | 🧴 | Opaque plastic trigger-spray cleaning bottle, bright green body, white trigger head with the nozzle pointing right, a faint fine mist leaving the nozzle. A plain colour-block label with no text. Plastic and trigger — against the Vinegar Spray's glass and pump. |
| ✓ | Mousetrap | `mousetrap` | 🪤 | Classic wooden snap trap at 3/4: pale wood base, copper spring, snap bar pulled back and armed, small cheese wedge on the trigger. |
| ✓ | ↳ sprung | `mousetrap_sprung` | | The same trap, same angle, bar slammed down onto the base, cheese knocked askew. Drawn faded while the trap rearms. The current file only moves the bar, which is hard to see at 48px — the fade carries the state today; a bolder change (bar flat against the far edge, cheese gone) would let the sprite carry it too. |
| ✓ | Cardboard Box | `cardboard_box` | 📦 | Small, slightly squashed brown cardboard box, flaps half open, a strip of tape across the top, scuffed corners. Wide and chunky — it sits *on* the track and blocks it. |
| ✓ | ↳ damaged | `cardboard_box_damaged` | | The same box, same angle, with bite marks torn out of the flaps and a crushed corner. Replaces the drawn cracks once the box is below its first HP threshold; the renderer squashes it for the last one. |
| ✓ | Toaster | `toaster` | 🔥 | Chunky retro chrome two-slot toaster, one slice of toast popped halfway up, the slots glowing hot orange from inside, a thin heat shimmer above. Fire must read at 48px: the orange glow is the point, kept inside the outline. Orange and upright, against the Burner's flat blue ring. |
| ✓ | Nightlight | `nightlight` | 💡 | Small bedside table lamp: a pleated yellow shade glowing warm from inside, a round teal ceramic base, a pull chain. The glow stays *inside* the shade — the pool of light on the floor is drawn by the renderer. (The brief first asked for a plug-in night light; the lamp reads better at 48px and was kept.) |
| ✓ | Vinegar Spray | `vinegar_spray` | 🧪 | Clear glass bottle with a slim neck and a chrome fine-mist pump top, pale gold vinegar inside, a plain paper band around the middle with no text. Glass and pump, against the Spray Bottle's plastic and trigger. |
| ✓ | Baking Soda | `baking_soda` | 🥣 | Small round ceramic bowl heaped with white powder, a wooden spoon resting in it, a small puff of powder lifting off the heap. Low and wide, against the Salt Shaker's tall glass — both are white powder, so the silhouette has to carry it. |
| ✓ | Bay Leaf | `bay_leaf` | 🌿 | Bundle of four or five dried bay leaves tied at the stems with kitchen twine, leaning upright. Matte olive-sage green, slightly curled edges, visible central veins. No pot: potted herbs belong to the post-v1 Mint Pot. |
| ✓ | Lemon | `lemon` | 🍋 | Half a lemon, cut face turned toward the viewer: pale segments, white pith ring, bright yellow rind, one drop of juice at the edge. Cut open, so it reads as acid rather than as fruit. |
| ✓ | Candle | `candle` | 🕯️ | Short cream pillar candle in a small brass holder, lit, wax drips down one side, a teardrop flame with a blue base. The flame's glow stays inside the outline — the lit circle on the floor is the renderer's. |
| ✓ | Gas Stove Burner | `gas_stove_burner` | ♨️ | Round gas burner ring seen from a steep 3/4 above: black cast-iron burner cap, a ring of small **blue** flames around its rim, four grate arms. Flat and low — it sits *on* the track and enemies walk over it. Blue and flat, against the Toaster's orange and tall. |
| ✓ | Fly Paper | `fly_paper` | 🎗️ | Hanging strip of amber fly paper uncoiled in a loose spiral from a small cardboard tube at the top, glossy and sticky, two or three dark specks caught on it. Vertical and hanging — the one tower that does not sit on the surface, against the Sticky Tape's roll. |
| ✓ | Honey Pot | `honey_pot` | 🍯 | Squat round ceramic honey pot, glazed honey-amber, lid slightly ajar, a wooden honey dipper leaning out, honey dripping thickly over the rim. Warm, heavy, inviting — it is bait. Squat and opaque, against the Cookie Jar's tall glass. |
| ✓ | Fan | `fan` | 🌀 | Small desk fan at 3/4: round wire cage, pale blue plastic blades with a slight motion blur, round base with one dial. The cage has to read at 48px; draw fewer, thicker wires rather than many thin ones. |

**Not included:** the Mint Pot (🌱). It is post-v1 and not in `TOWERS`, so `render/sprites.ts` would
not match a `mint_pot` file and would warn about it.

## Enemies

The whole v1 roster. All side profile, facing right. Stats and tags: [CONTENT.md](CONTENT.md) §2.

**Four glyphs are stand-ins and the sprite should draw the real animal:** the Moth is 🦋, the Weevil
is 🐛, the Slug is 🐌, and the Silverfish is 🐟. Draw a moth, a weevil, a slug and a silverfish.

| Done | Enemy | File | Glyph | Description |
|---|---|---|---|---|
| ✓ | Ant | `ant` | 🐜 | Small black ant, three distinct body segments, bent antennae, six thin legs mid-step, glossy with a faint red-brown sheen. Smallest ground enemy and the one there are forty of at once — simplest silhouette in the set. |
| ✓ | Roach | `roach` | 🪳 | Flat, elongated reddish-brown cockroach, long whip antennae swept back past the body, low lean posture like it is sprinting, leathery wing covers. Must read as **flat and fast** beside the Beetle. |
| ✓ | Beetle | `beetle` | 🪲 | Round, domed, glossy black beetle with a dark green/blue iridescent shell, short stubby legs, short clubbed antennae. Heavy and armoured. **Round silhouette** — the opposite of the Roach. |
| ✓ | Fruit Fly | `fruit_fly` | 🦟 | Tan/honey-coloured fruit fly with **big red eyes**, translucent wings raised. Slender and fragile. Airborne: legs tucked, no ground contact. Hatches from rotting crumbs. |
| ✓ | Fly | `fly` | 🪰 | Housefly: grey-black bristly body, dark red compound eyes, translucent wings with faint blue-green iridescence and a hint of motion blur. Must not be confusable with the Fruit Fly — and both draw at the same size on the board, so colour carries it: **dark grey body against honey-tan**. The current pair holds up on that. |
| ✓ | Moth | `moth` | 🦋 | Pale dusty moth, grey-beige with soft brown banding, broad furry wings raised above the body, thick fuzzy body, feathery antennae. Muted and powdery — **not a butterfly**: no bright colours, no clubbed antennae. Airborne, legs tucked. It is drawn toward light, so the warm rim light can catch its wings a little more than the others. |
| ✓ | Mold | `mold` | 🟢 | A raised colony of mold, not a creature: a low round cushion of fuzzy blue-green and white growth with a few fine spore stalks standing up, darker at the base. No legs, no face, no facing. It never moves, and the molded *tiles* it spreads are drawn by the renderer — this is the source, so it has to look thicker and fuzzier than any tile. |
| ✓ | Slug | `slug` | 🐌 | Garden slug with **no shell**: long soft olive-brown body, a mantle hump behind the head, two long eyestalks and two short feelers, a glistening wet sheen and a thin slime line underneath. Low and slow. Its slime trail on the track is drawn by the renderer — don't draw a trail. |
| ✓ | Weevil | `weevil` | 🐛 | Small grey-brown weevil: an oval beetle body with a long curved snout, elbowed antennae coming off the snout, a dusting of dirt specks from burrowing. The snout is what separates it from the Beetle — make it obvious. |
| ✓ | Silverfish | `silverfish` | 🐟 | Silverfish: a carrot-shaped body tapering to the tail, silvery-grey overlapping scales with a metallic sheen, long antennae forward, three long bristles off the tail. It is the armoured enemy, so the scales should look plated and hard. Low to the ground, short legs. |
| ✓ | Mouse | `mouse` | 🐭 | Lean grey-brown house mouse, crouched low mid-sneak, large round ears, long thin tail, alert dark eye, whiskers forward. The thief mini-boss and the largest enemy, so it gets the most detail — but still a real mouse, no expression beyond alert. **Carrying nothing**: the food it steals is drawn by the renderer. |

## Crumb piles

Litter, not creatures: seen from a steep 3/4 above, no facing. Three bands by value; which value lands
in which band is `render/crumbBands.ts`. Each band draws at its own scale of a tile, so size
differences *do* show here, unlike towers and enemies.

| Done | Band | File | Glyph | Description |
|---|---|---|---|---|
| ✓ | Speck | `small` | 🍘 | Four or five loose dark-toasted crumbs, scattered. The one-kill leftover; drawn at barely a quarter of a tile. |
| ✓ | Crumb | `medium` | 🍞 | A loose heap of golden-brown crumbs with a few strays around it. |
| ✓ | Pile | `large` | 🍪 | A chunky heap with a broken cookie wedge on top, **brighter and more golden** than the other two. The one worth clicking, so it has to stand out from across the board. |

## Fridge

The goal every enemy walks to. It stands on one tile at the end of the track, drawn at 0.9 of a tile
— the same size as a tower. The food it holds is **not** drawn in it: the shelf of remaining items is
a separate panel the renderer draws beside it, and that shelf is the health bar.

| Done | What | File | Glyph | Description |
|---|---|---|---|---|
| ✓ | Fridge | `fridge/fridge` | 🗄️ (map-chosen) | A squat retro kitchen fridge, 3/4 front view: rounded corners, pale cream-mint enamel, chrome lever handle, one door, closed. **Wide rather than tall** — about 4:5, so it fills its tile instead of being a thin sliver after the 85% fit. A hairline of cold white light at the door seal is its one glow, kept inside the outline. It must read as *the thing being defended*: the warmest, most solid object on the board, and not a filing cabinet, which is what 🗄️ looks like. |

One fridge sprite for every map. The map's own fridge glyph (`MapDef.fridge.glyph`, picked in the
editor) is now only the fallback while the file loads — `fridgeGlyph` in `render/sprites.ts`. The
fridge is in the terrain bake, so the renderer bakes once more when the sprites have loaded.

**It stays closed.** Opening it to show the food would put eighteen items inside one tile at about
five pixels each; the shelf beside it is the only readable health bar, and it already shows every
item. If the door ever opens, it is as a state (`fridge_open`) for the moment something is being
taken — the one time the player should look at the fridge rather than the shelf.

## Where sprites appear

On the board, and in the HUD wherever a tower or enemy is shown: the shop, the tower inspector, the
enemy tooltip and the night preview (`ui/components/EntityGlyph.vue`, sized to the emoji it replaced).
The HUD's crumb currency (🍞 beside a price) is still the emoji.
The map editor's decor palette carries no tower or crumb glyph, so scenery never draws as either.

## Not yet sprited

`render/sprites.ts` only matches files to towers, enemies and crumb bands, so these would need a
small renderer change before a PNG for them does anything:

- The **food items** on the fridge's shelf. The Mouse carries them, so they must read at ~24px.
- **Projectiles** — salt grain, ice shard. Small enough that drawn shapes may do instead.
