# Step 15C — Mold and slime on screen, and nights 11, 12 and 15

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §2 (*Art: emoji sprites*),
`../../analytic-docs/CONTENT.md` §6 (the night table — rows 11 to 15).
**Prereq:** steps 15A and 15B.

## Goal

The session that closes step 15. Mold creeping across the counter in steps you can watch and decide
whether to care about; a wet trail behind a slug that visibly dries up. Then the three nights that
make both of them a decision, and the pass that re-tunes the two numbers 15A authored blind.

This is the first time anyone sees any of it. 15A and 15B were both specs.

## Already in the repo

| File | What's there now |
| --- | --- |
| `render/layers/tileEffects.ts` | **step 14's file.** Drawn between terrain and crumbs, batched by state kind, with whatever treatments step 14 wrote for `heat` and `scorch`. You are adding two more, not rewriting it |
| `render/renderer.ts:146` | `drawFrame`'s documented draw order, and the `ensureBake()` / `drawImage` pair. 15A corrected the `// tile effects: step 15` attribution |
| `render/palette.ts` | colours named by **role** (`TILE_BUILDABLE`, `TRACK_FILL`), never by colour, because step 23 retunes all of them |
| `render/layers/terrain.ts` | the bake, and its two hard-won rules: **never vary anything per tile**, and **rim the blocked mass, not the blocked tile**. Both apply to a mold patch and both are written up in `steps/00-done/03-map-and-renderer/B-renderer.md` §2 |
| `render/layers/entities.ts` | `drawEntities` and `preloadEnemyGlyphs` — every enemy is a glyph blit at a rounded device pixel |
| `core/content/nights.ts:856` | `NIGHTS` — ten nights, all on the Counter, all single-lane. The header comment explains why nights 4–10 are not on the maps `CONTENT.md` §6 names, and it is the precedent you are following |
| `core/content/nights.ts:1` | the pacing rule the whole file was tuned to: **a wave spawns over roughly as long as the gap that follows it**, and `waves[0].countdownTicks` is both the run-up and the gap after wave 1 |
| `ui/views/GameView.vue:103,222` | `nightIndex` walks `NIGHTS` by **array position**; Continue steps to the next entry and stops at the last |
| `core/world.ts:107` | `createWorld` throws when a night's `mapId` is not the map it was handed. `GameView.vue` only ever passes `'counter'` |
| `core/content/maps/counter.json` | the `crack` lane, **31.1 tiles**. Every spacing number in `nights.ts` is arithmetic against it |

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **Nights 11, 12 and 15 are on the Counter, single-lane.** `CONTENT.md` §6 puts 11 and 12 on the
   Stove and 15 on the Table; neither map exists, step 21 authors all five, and `createWorld` throws
   on a mismatch. Exactly the note already at the top of `night04` and `night08` — extend it rather
   than writing a new one.
2. **`NIGHTS` gets a documented gap: 11, 12, then 15.** Night 13 is the Weevil's (step 16) and night
   14 is the Mouse's (step 19), and authoring either now means authoring a night that its own step
   rewrites. `GameView.vue` steps array positions, so Continue simply goes from 12 to 15 and nothing
   breaks; one sentence in the file's header is what stops the next reader treating it as a bug.
3. **No modifier machinery.** "Damp night" and "after a dinner party" are `CONTENT.md` §6's and
   **step 21's** — it owns `core/content/modifiers.ts` and names both by name. Night 15's chaos is
   authored into its wave counts and spacing here, in the composition, which is where every other
   night's difficulty lives. Do not add a `modifier` field to `NightDef`; step 5A already considered
   and dropped one.
4. **Re-tune 15A's two blind numbers here, in `core/content/enemies.ts`.** The mold's 360-tick spread
   interval and the slug's 480-tick slime were authored with nothing on screen, exactly as 6B
   authored `projectileSpeed: 0.2` and 6C halved it after watching a shot cross. Both parts say so.
   Changing them is expected, not a liberty — and any spec that pins them changes with them.
5. **Mold's stage comes from `TileEffect.magnitude`**, written at 1 by 15A and advanced by step 14's
   `tilesSystem`. Do not derive a stage from time in `render/` — the renderer has no clock that
   survives a replay and `world.tick` is not what "how long has this cell been here" means once a
   speed multiplier is running.
6. **Slime fades over a fixed final stretch, not as a fraction of its life.** `TileEffect` carries
   `remainingTicks` and nothing records what it counted down *from*, so a fraction is not available —
   and it is the wrong picture anyway. A `SLIME_FADE_TICKS` constant in `render/` of about 60, so the
   last second is the tell, is what makes "the trail is gone now" a thing you notice rather than an
   eight-second dimming nobody parses.

## Build

### 1. Mold in `render/layers/tileEffects.ts`

Three stages, and the whole requirement is that a player glancing at the board can see the patch
advanced since last time. Stage 1 is a faint speckle, stage 3 is a fuzzy opaque mass; the middle one
has to be unmistakably between them and not just "a bit more alpha".

**Read step 3B's two rules before you draw a cell.** They were learned on this exact shape:

- *Do not decorate per tile.* A mold patch drawn as a per-cell texture draws every cell boundary in
  and reads as a green spreadsheet. Texture belongs at a scale the grid does not share — blobs a
  couple of tiles across, positioned from a sequence seeded on the cell index so a redraw lands them
  in the same place.
- *Rim the mass, not the cell.* Outline only the edges whose neighbour has no mold. A 4 × 4 patch
  with a single outline reads as one growth; sixteen outlined squares reads as a tilemap.

That second rule is also what makes the spread legible: the frontier of the patch is where the thin
new stage-1 cells are, so the outline and the staging tell the same story.

Gotcha: mold is **permanent and static**, so it is a candidate for the terrain bake — step 14's build
item 6 says to cache it there. Whether it did is a thing to check and not to re-litigate. If it is
drawn live, count the cells: a bad night 11 ends with 60–100 molded cells and a per-cell radial
gradient on each of them is a real per-frame cost. Measure before optimising, and if it needs the
bake, the bake key is `(map, dpr)` and would have to gain a mold generation counter — which is step
14's file and step 14's decision.

### 2. Slime in the same file

A glossy wet sheen: a light, low-saturation highlight offset toward one corner so the cell reads as
*reflective* rather than tinted. Slime is a buff to the enemy and mold is a tax on the player, so the
two must not read as the same "bad green stuff on the floor" — the slime should look slick and almost
appealing, and that contrast is worth more than either treatment on its own.

Then the fade per decision 6, and one more thing the step plan asks for and is easy to miss: the
trail decays **from the back**, because the slug refreshed the front cells more recently. That is
already true in the data; make sure the fade is per cell and not per patch, or you lose it.

### 3. The two glyphs — `render/layers/entities.ts`

🟢 and 🐌, through `preloadEnemyGlyphs` like every other enemy. One thing to look at: Mold has
`speed: 0`, so whatever per-enemy motion `entities.ts` does will do nothing for it, and a mold
sitting perfectly still among walking ants may read as a piece of scenery rather than an enemy you
can shoot. If it does, that is a treatment to add here — and the honest fix is probably a slow pulse
rather than a health bar, since `render/hpBar.ts` already draws one on damage.

### 4. Nights 11, 12 and 15 — `core/content/nights.ts`

Draft them from arithmetic against night 10 and the `crack`'s 31.1 tiles, then play them. Every
spacing number in this file was drafted that way and then re-tuned by watching, and the header says
so.

**Night 11 — the Mold arrives.** Eleven waves, per §6. The roster introduces a new enemy the same way
five times already: *two of them, in wave 3, released well behind the wave's opening column and far
enough apart to be watched one at a time.* Do that, and then do the thing this enemy needs that none
of the others did — **place them with `startDistanceTiles`** (15A's field) somewhere the patch will
grow into the pockets the player has already built in, not at the baseboard crack where it eats
nothing. That placement is the whole night, and it is the one acceptance criterion no spec can check:
by the last wave, ignoring the mold has to have visibly cost board space.

The later waves put mold in at increasing counts and, crucially, at **different distances along the
lane**, so a player who solved the first one by parking a Vinegar Spray on it has to solve the second
somewhere else.

**Night 12 — mold is the shape of the night.** Twelve waves. Mold in most of them from wave 1, the
way night 6 was to night 5's Beetle. §6 gives night 12 the Gas Stove Burner unlock, which is step
17's tower and not a wave concern; if step 17 finds this night wants re-tuning once the Burner
exists, that is step 17's edit and this file should say so.

**Night 15 — the Slug, and the loudest night in v1.** Thirteen waves. Two slugs in wave 3 on the
usual pattern, then slugs leading roach runs: a slug 4–6 seconds ahead of a tight roach column is the
entire mechanic, and a slug released *with* the column is a slug nobody notices. Per decision 3 the
"double crumbs, double spawns" is authored into the composition — larger counts and tighter spacing
than night 12, not a multiplier — and this is the night that should feel like too much happening at
once.

Gotchas that will bite the authoring:

- **A wave is not cleared until its last enemy is gone, and a Mold never leaves.** `wave.ts:65` and
  `resolve.ts:124` both count live enemies, so a mold the player cannot or will not kill holds its
  wave open forever, holds the countdown to the next one, and makes the night unwinnable with nothing
  on screen explaining why. Every mold has to spawn where *some* buildable pocket can reach it. Check
  it by placing a mold and then deliberately ignoring it for the rest of the night.
- **The Cookie Jar's destroy penalty buys from the running wave's own composition**
  (`spawn.ts:208`). A jar lost during a mold-heavy wave buys molds at 12 crumbs each — sixteen of
  them for the jar's 200 — every one of which is permanent board damage and an enemy that must be
  killed for the night to end. Night 15's chaos wave is where this lands hardest; look at it
  deliberately rather than discovering it.
- **Nightmare's `enemyCountMult` is 1.25 and rounds up** (`spawn.ts:102`), so three molds in a wave
  become four. Sanity-check night 11 on nightmare, not only on normal.

### 5. Play it, then tune

`npm run dev`. Nights 11, 12 and 15, at 1× and at 3×. Then move numbers: the spread interval and the
slime duration in `core/content/enemies.ts` (decision 4), the counts and spacings you just drafted,
and the two towers' numbers in `core/content/towers.ts` if 15B's authored-blind radii are wrong on
screen. Change them here and in whatever spec pins them, and say in the commit which way each went
and why — a number moved without a reason is a number the next tuning pass moves back.

## Tests

**None.** `../../analytic-docs/ARCHITECTURE.md` §7: no tests over `render/`, and the bugs there are
visible by definition — a mold patch that reads as a spreadsheet is not something a spec can tell you.
The nights are content and no spec asserts one: `tests/spawn.spec.ts` and `tests/night.spec.ts` both
build their own nights on purpose, so the next tuning pass is an edit in `nights.ts` and nothing else.

15A's and 15B's suites are the regression net, and re-tuning the two enemy numbers per decision 4
will move whatever spec pins them — that is the test doing its job, and the number is what changes,
not the assertion.

## Acceptance

- [ ] Ignoring mold on night 11 costs you a visible chunk of the board by the final wave, and you can
      point at the pocket you lost.
- [ ] Watching one mold for a minute, you can see it advance and decide whether to care — the three
      stages are distinguishable at 3× speed without leaning in.
- [ ] A slug leading a roach wave is dramatically more dangerous than the same roaches alone, and you
      can see *why* — the roaches visibly speed up on the wet track.
- [ ] "The trail is gone now" is information you get without looking for it.
- [ ] Mold and slime read as different things: one is a tax you resent, one is a road you are scared
      of.
- [ ] No molded cell in any of the three nights is out of reach of every buildable pocket — verified
      by ignoring mold for a whole night and still being able to finish it.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

Leave every criterion above that is a judgement unticked unless you actually sat and looked. The
checkboxes are the ledger of what has been confirmed, and ticking a feel criterion destroys the only
list of what still needs a human.

## Do not

Author nights 13, 14, 16, 17 or 18 — 13 is step 16's, 14 is step 19's, and 16–18 belong to the steps
that add their enemies. Do not build the night-modifier system, the Pantry Shelf Liner, or any part of
the campaign wiring: step 21 owns modifiers and the full 1–18 schedule, step 20 owns installations and
unlocks. Do not change `core/systems/tiles.ts` or `core/systems/spread.ts` — if a treatment needs data
the tile carries and does not have, that is step 14's file and a note in the commit. Do not add a
codex, an enemy tooltip or a damage-number colour code: those are step 16's build item 5.
