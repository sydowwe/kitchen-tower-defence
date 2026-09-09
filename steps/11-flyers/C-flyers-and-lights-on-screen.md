# Step 11C — Flyers and lights on screen, and the night 8 pass

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §2 *Art: emoji sprites* and §1
(tone, for the copy pass), `../../analytic-docs/ARCHITECTURE.md` §6 (the frame budget) and §7 (why
this session writes no specs), `../../analytic-docs/CONTENT.md` §1 (the two rows you are writing
cards for) and §6 (nights 8–10).
**Prereq:** 11A and 11B.

## Goal

Everything the first two sessions built is invisible. A Fly looks exactly like an Ant, a Moth curving
three tiles off the track looks like a bug that has wandered, a Nightlight is a glyph with no radius
and an almost blank shop card, and the one line a player most needs before spending 140 crumbs —
*this tower shoots air and nothing else* — is the seventh row down. This session makes all of it
legible, and then plays night 8 and tunes what it finds.

## Already in the repo

| File | What's there now |
| --- | --- |
| `render/layers/entities.ts` | the `EnemyFrame` pool (`frames`, `liveCount`), `ageFrames`, the chew lunge and its four batched status passes. 11B moved the position onto `applyLateralOffset`. `preloadEnemyGlyphs` iterates `ENEMIES`, so the Fly's and the Moth's glyphs are already cached — nothing to add. |
| `render/layers/entities.ts:415` | the chew lunge, and the comment that says why it moves **the glyph and not the frame**: the bar and the treatments stay where the enemy is. That is the precedent the bob follows. |
| `render/layers/entities.ts:428` | `ctx.globalAlpha = 1` and the comment on why. |
| `render/layers/towers.ts` | `drawTowers`, `drawRangeCircle`, `drawRangeCone`, `drawPlacementTile`, `preloadTowerGlyphs` (iterates `TOWERS`). |
| `render/palette.ts` | every colour as a named-by-role constant. Step 3B's rule: name by role, not by colour. |
| `ui/interaction.ts:147` | `reachOf(def, world, tile, tower)` — `isAttack` → circle, `isConeAttack` → cone, **otherwise null**. The Nightlight falls into `null` and gets no ring at all. |
| `ui/interaction.ts:421` | `const index = Number(event.key) - 1`, guarded by `index >= TOWERS.length`. With 11A and 11B in, `TOWERS` is **ten** long and the shop badge prints `10` — and `Number('0') - 1` is `-1`, so the tenth tower has a badge and no key. |
| `ui/viewModel.ts:206` | `statsFor(def)` — one loop over `def.behaviours` through `isAttack` / `isConeAttack` / `isCollect` / `isCharge`, then `barricade` and `income` by kind. `reveal` falls through and contributes nothing. |
| `ui/components/hud/StatCard.vue` | the `dl`, in declaration order: damage, rate, dps, range, cone, type, **targets**, applies, hp, blocks, charges, rearm, income, collect, noise. |
| `ui/locales/en.ts` | `hud.stat.*`, `hud.targetClass.*` (Ground / Air / Ground and air), and the four def entries 11A and 11B wrote blind. |
| `tests/viewModel.spec.ts` | asserts `statsFor` per tower. Extend the existing block; do not start a suite. |

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **The bob and the shadow age in `ageFrames`, never in `world.tick`.** The file header is explicit:
   at 3× speed three ticks run between two frames, so anything aged in ticks triples its rate and
   reads as a strobe. A bobbing fly is the most obvious thing in this step to get that wrong on.
2. **The bob moves the glyph; the shadow, the HP bar and the status treatments stay on the ground.**
   Exactly the chew lunge's rule, for exactly its reason — a queue of bobbing flies whose bars bob
   with them is forty things wobbling, and the shadow is only readable as a shadow if it holds still
   while the thing above it does not.
3. **Air is read off `isFlyer` from `core/systems/targeting.ts`**, not from `tags.includes('air')`
   here. 11A made it one predicate for exactly this; `entities.ts` already imports from
   `core/systems/` (`barricadeHolding`, `isBarricade`).
4. **The `EnemyFrame` pool gains `flying: boolean` and it is written for every entry, every frame.**
   The pool is reused across frames and a field left unwritten is a stale one — the file's existing
   comment on `readStatuses` says so.
5. **The Nightlight's pool of light is one gradient, built once and cached module-locally, keyed by
   `tilePx`.** Step 3B's acceptance is that the per-frame path contains no `createRadialGradient`;
   one per lamp per frame is that rule broken at 60Hz. Drawn at the top of the tower pass, so it
   falls on the floor and the crumbs and under everything that moves.
6. **`reachOf` gains a `reveal` branch returning a circle of the behaviour's `radiusTiles`.** A
   100-crumb tower whose only stat is a radius, bought with no radius shown, is the placement
   decision made blind.
7. **`Targets` moves to the top of the stat card**, above damage — the step's item 7, and the one
   line that decides whether a purchase is useful at all. Everything else keeps its order.
8. **`TowerStatsView` gains `revealRadiusTiles: number | null` and nothing else.** No
   `attractsLightDrawn` row: it is true for every light in v1, and what it *means* belongs in the
   Nightlight's description, where a sentence can say it.
9. **The Nightlight's `targets` stays null.** §1's table says "both" and the table is describing what
   it *covers*, not what it shoots; `statsFor` derives `targets` from a firing behaviour and the
   Nightlight has none. A "Targets: ground and air" row on a tower that fires nothing is a lie the
   card tells about a tower whose whole point is that it does not fire.
10. **`'0'` binds to the tenth shop slot**, and its badge prints `0`. The alternative is a badge that
    names a key that does not exist. Update the "1-9 into the roster" comment above it.
11. **This session has no tests.** `../../analytic-docs/ARCHITECTURE.md` §7: no specs over `render/`,
    and the tuning below is content. The one headless change — `revealRadiusTiles` — extends the
    `statsFor` assertions that already exist in `tests/viewModel.spec.ts`. Do not invent coverage.

## Build

### 1. Flyers read as flying (`render/layers/entities.ts`, `render/palette.ts`)

A soft dark ellipse on the ground under every `air` enemy, and a slow vertical bob of the glyph above
it. Between them they have to answer "is this thing on the floor" from across the room with no
tooltip — that is the acceptance criterion, and neither half does it alone: a bob without a shadow is
a bug with a nervous walk, and a shadow without a bob is a smudge.

Batch the shadows the way `drawSlow` batches — one `beginPath`, many `arc`s, one `fill` — and draw
them **after** the slow discs and **before** the glyph loop, so a slowed fly still reads as cold.
Scale the shadow slightly with the bob (smaller and fainter at the top of the rise); that is the
cheapest thing that turns two shapes into height. Two palette constants, named by role.

Gotcha: `entry.mirrored` comes from the **path** angle, so a Moth curving hard toward a lamp still
faces down the track. That is consistent with every other enemy on the board and is almost certainly
right; look at one and decide, and if you change it, change it in the frame fill and say so here.

### 2. The Nightlight on the board (`render/layers/towers.ts`, `render/palette.ts`, `ui/interaction.ts`)

Decisions 5 and 6. A warm, low-saturation pool at the lamp's tile out to its `radiusTiles`, in the
same register as the terrain bake's lamp pools — this is the same kitchen light, and a Nightlight
that glows a different colour from the lighting already on the board reads as a status effect.

Then `reachOf`: `isReveal` (11B put it in `core/content/behaviours.ts`) → `{ kind: 'circle',
radiusTiles }`. Check the ghost as well as the selection — the ring under the cursor is what makes
"a Nightlight surrounded by Toasters is an obviously good idea" a thing a player can see before
paying for it.

### 3. The card (`ui/viewModel.ts`, `StatCard.vue`, `ui/locales/en.ts`, `tests/viewModel.spec.ts`)

Decisions 7, 8, 9. One new `hud.stat.*` key for the reveal row — say what it does, not what the
behaviour is called; "Lights" or "Reveals within" beats "Reveal radius". Extend the existing
`statsFor` assertions with the Nightlight's.

### 4. The tenth hotkey (`ui/interaction.ts`, `TowerShop.vue`)

Decision 10.

### 5. The copy pass (`ui/locales/en.ts`)

Four entries written blind by the earlier parts, revised now against the cards you can finally see —
the way 8C revised 8A's, 9C revised 9B's and 10C revised 10A's. The rule those passes settled: **a
description says the thing no row says.** The Toaster's card already prints `Damage 35`,
`Targets Air` and `Range 4 tiles`, so its sentence is free to be about what it *is*. The Nightlight's
card is nearly empty and its sentence has the most work to do of the four.

While you are here, look at the shop with both toasters in it — 🧺 Toaster Crumb Tray and 🔥 Toaster,
two rows apart. If they read as one tower listed twice, the fix is the English, not the roster.

### 6. The tuning pass

Four numbers, all authored blind by the earlier parts, all now judgeable. Change them where they are
authored, and update the assertion that pins them in the same commit:

- **Nights 8, 9 and 10** (`core/content/nights.ts`). Play each at 1× and 3×. Night 8 must be lost by
  a Salt-Shaker-only board and won by one that adds two Toasters — if a ground-only board survives
  it, the flies-only wave is too small or too late.
- **The Toaster's `projectileSpeed`** (`core/content/towers.ts`, pinned in `tests/content.spec.ts`).
  0.12 was arithmetic. Watch a shot cross four tiles at a Fly moving 2.2 tiles/sec: too slow and it
  chases and misses the feeling of a hit, too fast and there is nothing to see between the shot and
  the kill. 6C halved the Salt Shaker's for the second reason.
- **`LIGHT_DRIFT_TILES_PER_TICK`** (`core/systems/light.ts`). The first session that can see whether
  a moth *curves* or *snaps*. Slower is prettier; the 2-second return assertion in
  `tests/light.spec.ts` is the floor, so anything above ~0.025 keeps it green — if you go below that,
  move the assertion and say why in the same commit.
- **The fruit fly payoff** (`../../analytic-docs/OPEN-QUESTIONS.md`, "The fruit fly gap"). Let a night
  run with crumbs deliberately left to rot, then put one Toaster down. A single Toaster has to
  meaningfully clear the backlog. If it cannot, one of `HATCH_TICKS` in `core/systems/crumbs.ts` and
  the Toaster's rate is wrong — tune here, while both are in front of you, and write the answer back
  into that open question so it stops being open.

## Tests

**None.** `../../analytic-docs/ARCHITECTURE.md` §7: no specs over `render/`, and the bugs this
session can introduce are all bugs you are looking at. The `revealRadiusTiles` line extends the
`statsFor` assertions that already exist in `tests/viewModel.spec.ts` rather than earning a suite of
its own, and the tuning above is content — `tests/spawn.spec.ts` and `tests/night.spec.ts` build
their own nights on purpose so a tuning pass stays an edit in one file. A part with no tests is not
an under-tested part.

## Acceptance

- [ ] Flyers read as flying at a glance, at 3× speed, with no need to check a tooltip or a card.
- [ ] Moths visibly curve toward a Nightlight and visibly straighten out after it, and a Nightlight
      surrounded by Toasters is an obviously good idea before you have paid for it.
- [ ] Night 8 is genuinely lost by a player who built only Salt Shakers, and won by one who adds two
      Toasters.
- [ ] A single Toaster meaningfully cleans up a fruit-fly problem.
- [ ] The shop tells you a tower is air-only *before* you spend 140 crumbs on it.
- [ ] Every shop badge names a key that works, including the tenth.
- [ ] The per-frame path still contains no `createRadialGradient`, no `fillText` and no per-tile
      loop, and 60fps holds with a night's worth of flies on the board.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Add simulation state. The bob, the shadow and the light pool are all derived from what the world
already holds, and a `bobPhase` on `Enemy` would go into every save and every replay to make a
picture. Do not re-derive an enemy's position — 11B's `applyLateralOffset` is the one answer, and a
second one drawn from `samplePath` puts the moth back on the track. Do not build the Candle or any
aura (step 17), the noise meter (step 13 — the Toaster's `noise: 3` is authored and unread on
purpose), upgrades (step 12), tile effects (step 14) or burrowing (step 16). Do not author a night
past 10, and do not put a second lane on the Counter (step 21).
