# Step 18B — The Fan on screen: the gust, the shove, the card

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/ARCHITECTURE.md` §5 (the snapshot and the
reactivity trap) and §6 (the performance budget), `../../analytic-docs/DECISIONS.md` §1 (tone) and
§2 (*Art: emoji sprites*), and `../../analytic-docs/CONTENT.md` §1 (the **Fan** row and its
behaviour note).
**Prereq:** step 18A.

## Goal

Pushback has to read instantly, or it looks like a bug. Each pulse is a visible gust. A pushed flyer
looks shoved, not teleported, and it staggers for a beat before it comes on again. The Fan's card
says what it does without its description. A rewrites nothing here: its events say what happened,
and this part draws them.

## Already in the repo

17D landed in these files after this part was written. Read them, and trust symbols over line
numbers.

| File | What's there now |
| --- | --- |
| `core/types.ts` (`GameEvent`) | A's `pushbackFired { towerId, tile, facingRad, rangeTiles, halfAngleDeg }`, once per Fan shot, and `enemyPushed { enemyId, sourceTowerId, tiles }` per enemy that moved, with `tiles` being the distance **actually** moved. Nothing reads either yet |
| `core/systems/pushback.ts` | `pushbackResistanceOf` and the three constants. **Draw what `enemyPushed.tiles` says moved. Don't recompute it from resistance** (the index's seam) |
| `render/renderer.ts` (`drawFrame`) | the documented order: tile effects → crumbs → towers → fridge → `drawEntities` → projectiles → `drawEffects` → overlay → wake |
| `render/layers/effects.ts` | **the one layer with state.** It's fed by `pushEvents` from `GameView.vue` before each frame, aged in **frames**, with oldest-first caps (`MAX_FLASHES`, `MAX_NUMBERS`). `drawEffects(ctx, tilePx, dpr)` has no world |
| `render/layers/entities.ts` (`drawEntities`, `EnemyFrame`) | samples each enemy once into a pooled frame, positioned through `applyLateralOffset` (a Moth's offset). **Every field is written every frame:** an unwritten field on a reused entry is stale |
| `render/layers/towers.ts` (`drawRangeCone`) | the placement wedge, used by the overlay for a `coneAttack`. The Fan gets a placement wedge for free. That's a preview, not a gust |
| `render/palette.ts` | colours by **role** |
| `ui/viewModel.ts` (`statsFor`, `TowerStatsView`, `DIFF_ROWS`) | the cone branch already fills the Fan's damage, rate, dps, range, cone, `physical` and `air`, and appends the cone's `applies`. **There's no `pushback` branch.** Nulls, not zeroes, for rows a tower doesn't have |
| `ui/components/hud/StatCard.vue` | one `<template v-if>` per nullable row |
| `ui/locales/en.ts` | A's **first-draft** Fan English and `hud.tag['push-immune']`, which this part rewrites |
| `ui/components/hud/TowerShop.vue` | 19 towers now. 17C looked at it with 18 |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **The gust is an effect**, in `effects.ts`, from `pushbackFired`, aged in frames and capped
   oldest-first like the flashes. The event carries its own shape because the Fan may be sold by the
   time the frame reads it. It must not look like the placement wedge: it's moving air (streaks
   running outward along the facing, fading within ~12 frames), not a filled region. It gets a
   palette role of its own. Only a pushback tower emits the event, so the Spray Bottle stays
   silent, as the step's `Do not` requires.
2. **The shove state lives in `effects.ts` too**, keyed by enemy id and fed by `enemyPushed`, with a
   read that `entities.ts` calls while it fills the pool. `effects.ts` is the one stateful layer,
   and `drawEntities` is the only place with the world and the sampled position. Records **age out
   by frames whether or not the enemy still exists**. Otherwise an enemy killed mid-slide leaves an
   entry behind for the rest of the session.
3. **The stagger is visual only.** The simulation never pauses a pushed enemy. A pause would multiply
   the lock power A's resistance floor is sized against. On screen it's a short tilt, squash or
   wobble of the glyph after a push, off a new `EnemyFrame` field, written every frame.
4. **Recommended: draw the enemy where it is, and put the shove behind it.** That's a short streak or
   two or three fading afterimages along the track, from where it was (`distance + tiles`) to where
   it is, sampled through `samplePath` and `applyLateralOffset` like the glyph. The alternative,
   easing the drawn position back over several frames, looks more like sliding. But for those frames
   the glyph disagrees with everything that reads the simulation: the hit flash and damage number
   (at the pre-push `at`), projectiles homing on the real position, and the Fly Paper's strand. If
   you ease, keep it to ~6 frames and look at it at 3×. Either way, **judge it on the board**.
5. **The card gets one row, `pushTiles: number | null` ("Pushes back", `hud.stat.tiles`)**, and the
   pushback's `applies` appended to the card's, so tier 3's Marked shows. It goes in `DIFF_ROWS`
   after the cone row. Mint Pot never reaches a card (`POST_V1_TOWERS`), and nothing here names it.
   Leave "Damage type: physical" on the Fan: the Sticky Tape set that precedent for a "—" type. If
   it reads as noise beside a 0.5 chip, say so in the commit and leave it for C.

## Build

### 1. The gust: `render/layers/effects.ts`, `render/palette.ts`

Decision 1. At 3× a Fan fires every ~13 frames, so a gust that lives longer than that never goes
out, and the wedge reads as permanently filled. Keep the life under the 3× period. The cap is for a
row of Fans, not for one (13B's lesson with ripples: a pulse per shot at 3× becomes a strobe).

### 2. The shove and the stagger: `render/layers/effects.ts`, `render/layers/entities.ts`

Decisions 2 to 4.

Gotchas:

- **`pushEvents` runs before `drawFrame`, and at 3× it hands you three ticks' worth.** Two Fans in
  step push one fly twice on the same tick. Accumulate into the enemy's one record (sum the tiles,
  restart the age). Don't start two slides from two different places.
- **A push that moved 0** (immune, held, feeding, or clamped at the crack) publishes no
  `enemyPushed`, so it gets no shove. The gust still shows. That's the honest picture of a Fan
  blowing on a fly stuck to the paper.
- **A Moth's shove has to follow its offset.** A Moth drifting toward a Candle is drawn off the
  polyline. A streak sampled along the bare track would start a tile away from the glyph, so sample
  every point through `applyLateralOffset`, the way the glyph is.

### 3. The card: `ui/viewModel.ts`, `StatCard.vue`

Decision 5, through `isPushback`, never a hand-written `kind ===`.

### 4. The copy: `ui/locales/en.ts`

Rewrite A's drafts in DECISIONS.md §1's voice: understated, situational, no jokes told to the
player. The Fan's sentence is about the flyers that stop getting closer, not its damage. The tier-3
sentence is about what else is shooting into the gust. `push-immune` is a tag label: a few words
the Mold's tooltip can carry. Add the row label. Then look at the shop with nineteen towers.

## Tests

Assert against the def's own fields, never the numbers, so C's re-tune moves nothing here.

- The Fan's `statsFor` has `pushTiles` equal to its pushback's, `coneHalfAngleDeg` and `rangeTiles`
  off its cone, `targets` `air`. Every other tower in `TOWERS` has `pushTiles` null.
- The Fan's tier-1 diff has the range row. Its tier-3 card's `applies` contains `marked`.

Nothing over `render/`, per `../../analytic-docs/ARCHITECTURE.md` §7.

## Acceptance

- [ ] A pushed fly reads as shoved at 1× and at 3×, never as teleported, and a pulse with nothing to
      push still reads as a gust.
- [ ] Two Fans on a fly wave stay readable and cost nothing measurable in frame time. Check the
      performance panel before and after.
- [ ] The Fan's card says what it does without its description.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

Leave every judgement criterion unticked unless you actually sat and looked.

## Hands to 18C

```
ui/viewModel.ts   TowerStatsView.pushTiles: number | null
render/palette.ts the gust's and the shove's roles    // C may retune values, not roles
```

## Do not

Change anything in `core/`. A's numbers and constants are C's to move, and a treatment that needs
data the world doesn't carry means A's file and a note in the commit. Don't give the Spray Bottle or
any other cone a gust. Don't draw anything for Mint Pot, or add a ground-pushback treatment. Don't
author night 18 (C), and don't build the step 23 lighting layer.
