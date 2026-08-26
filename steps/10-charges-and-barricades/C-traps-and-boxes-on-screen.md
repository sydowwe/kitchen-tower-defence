# Step 10C — Traps and boxes on screen, and the night 6 pass

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §2 *Art: emoji sprites* and §1
(tone, for the copy pass), `../../analytic-docs/ARCHITECTURE.md` §6 (the frame budget),
`../../analytic-docs/CONTENT.md` §1 (the two rows you are writing cards for).
**Prereq:** 10A and 10B.

## Goal

Everything the first two sessions built is invisible. A rearming Mousetrap looks exactly like an
armed one, a box at 6 HP looks exactly like a box at 200, forty ants eating it look like forty ants
standing still, and the Cardboard Box's shop card is almost blank. This session makes all of it
readable at 3× speed, fills in the cards — and then plays night 6 and tunes the one number no doc
fixes. It is the session that closes step 10.

## Already in the repo

| File | What's there today |
| --- | --- |
| `render/layers/towers.ts` | `drawTowers` (a pad, then one `blitGlyph` at `TOWER_SCALE` 0.85), `drawProjectiles`, `drawRangeCircle`, 9C's `drawRangeCone`, `drawPlacementTile`, `PlacementTone`, `preloadTowerGlyphs`, `towerGlyphSize`. **Nothing in the file knows what is selected** |
| `render/layers/entities.ts` | 9C's shape: an `EnemyFrame` pool filled once per frame, then treatment passes batched one `beginPath` / many `arc`s / one `fill`. `drawHealthBar` takes an `EnemyFrame`. The closing comment about `globalAlpha` is load-bearing |
| `render/layers/effects.ts` | module-local state aged in **frames**, fixed caps, oldest-dropped-first; `pushEvents(events, world)` is the seam `GameView.vue` feeds. Its header says why a flying glyph is not simulation state |
| `render/palette.ts` | colours named by **role**. `HP_BAR_BACK` / `HP_BAR_FILL` already exist and are tuned for the enemy bar |
| `render/glyphCache.ts` | `blitGlyph(ctx, dpr, emoji, sizePx, x, y, flipX?, color?)` — an **opaque** pre-rasterised bitmap. It cannot be tinted, and it cannot be rotated (`dev/debug/overlay.ts` draws its own rotated glyph for exactly that reason) |
| `ui/viewModel.ts` | `statsFor(def)` derives the card through `isAttack` / `isCollect` / `income` and 9C's cone branch; every field is null for a tower that does not have it, and the file re-exports the vocabulary types so no `hud/` component imports `core/` |
| `ui/components/hud/StatCard.vue` | every row `v-if`'d on a **null**, never on a zero |
| `ui/locales/en.ts` | 10A's and 10B's two tower entries, written blind. **`debug.hint` was already `1-8 tower`** — 10A or 10B updated it in the same breath as the bindings, so build item 5's last paragraph was already done when this session opened |
| `core/systems/charges.ts` | 10A's `chargePhase(tower)` and `chargeAllowsFiring` |
| `core/systems/barricades.ts` | 10B's `barricadeHolding(world, enemy)` and `isBarricade(def)` |
| `core/types.ts` | the `towerDestroyed` event, carrying `towerId`, `defId` and `tile` |

## Decisions already made

Override one only if the code proves it wrong — and then edit this file, don't leave it lying.

1. **No second glyph on `TowerDef` for the rearming state**, whatever the step's "its visual must
   come from config" suggests. There is no flattened-mousetrap emoji, and a `glyphRearming` would be
   a field seven other towers leave empty. The state is a *treatment* over the one glyph: dimmed,
   with the rearm's progress readable on the pad it stands on.
2. **Dim with `ctx.globalAlpha` around the blit, and set it back to 1.** `blitGlyph` hands out an
   opaque bitmap and cannot recolour one — 9C hit the same wall with the slow tint and drew a disc
   under the glyph instead. Leaving the alpha set fades the projectiles, the theft animation and the
   whole overlay drawn after it; `entities.ts`'s closing comment is there because of exactly this.
3. **The HP bar is extracted, not copied**: one pure `drawHpBar(...)` in `render/hpBar.ts`, beside
   `tileCoords.ts` rather than in `layers/`, called by both `entities.ts` and `towers.ts`. Two bars
   in two files drift into two visual languages, and the enemy one is already tuned.
4. **A tower's bar is drawn only when damaged**, the same rule as the enemy's and for the same
   reason. In v1 that means it appears on exactly one tower — the box being eaten — which is the
   whole point.
5. **The box's damage states are drawn over the glyph, not swapped for another one.** Same reason as
   decision 1. Three states off `hp / maxHp`, with the thresholds named as constants: crisp, dented
   (a crack or two), collapsing (squashed with `ctx.scale` about its own centre, more cracks). A
   `save`/`restore` around the transform, or the next tower is drawn squashed too.
6. **The chew is a fifth treatment in `entities.ts`, not a new layer and not an event.** It reads
   `barricadeHolding(world, enemy) !== null` while the frame pool is being filled, into a
   `chewing: boolean` on `EnemyFrame`. An event per held enemy per tick is forty entries a tick in
   `world.events`, which is a per-tick array the HUD also drains — and events are for things a
   consumer must not miss, not for a state it can read.
7. **The card shows the def's numbers, never the live ones.** `buildTowerInspector` runs on
   *selection change*, not at 15Hz (`../../analytic-docs/ARCHITECTURE.md` §5 grants it that one
   exception deliberately narrowly), so a live rearm countdown in the panel would sit frozen at
   whatever it read when you clicked. The live state is read off the tower on the board, which is
   what decision 1's treatment is for.
8. **`TowerStatsView` gains `hitPoints`, `charges`, `rearmSeconds` — all `number | null` — and
   `blocksPath: boolean`**, resolved and already converted in `statsFor`, where every other derived
   number on that card is rounded. A component doing arithmetic on tick counts is a component that
   has to know what a tick is.
9. **`hitPoints` is null unless the tower can actually be destroyed** — in v1, unless it is a
   barricade. Every tower has a `maxHp`, but a HP row on seven towers nothing in the game can damage
   is a row that means nothing; step 13's noise penalty is what turns it on for the rest.
10. **Tune only the numbers no doc fixes.** `../../analytic-docs/CONTENT.md` §1 fixes the box (25,
    200 HP) and the Mousetrap (90, 60, 0.15/sec, range 1, noise 2) and §2 fixes every enemy stat —
    except `meleeDamagePerTick`, which has no column at all. That one is yours. Anything in §1–§2
    moves only as an edit to that file in the same commit.

## Build

### 1. `render/hpBar.ts`, and a bar on a damaged tower

Extract per decision 3, then call it from `drawTowers` under the same "only when damaged" rule.
A tower's bar sits above its pad, which is a different offset from the enemy's — pass the offset in
rather than branching inside the shared function.

### 2. The Mousetrap's two states (`render/layers/towers.ts`)

Off `chargePhase(tower)`. Armed is what is drawn today. Rearming is the dimmed glyph plus the rearm's
progress on the pad — a sweep, an arc, a filling edge; pick one and look at it. `'spent'` never
occurs for a rearming tower and `'none'` is every other tower in the game, so both take the current
path unchanged.

This is the criterion the whole session exists for: **at 3× speed, from across the room, armed and
rearming must not be confusable.** Test it against that and not against a screenshot at 1×. If the
answer is not obvious, the fix is more *contrast* — a state change you can see in peripheral vision —
not more decoration.

### 3. The box's damage states, and the destruction

Decision 5's three states. Then the destruction: `towerDestroyed` into `effects.ts`'s `pushEvents`
as a short puff at `event.tile` — cap it and age it in frames like everything else in that file.
A box that vanishes between two frames with no acknowledgement reads as a rendering bug.

### 4. The chew (`render/layers/entities.ts`)

Decision 6's flag, then a treatment: a small repeated lunge toward the box, or a bite mark, batched
the way the other four are. Forty ants eating one box is one of the game's best images —
`../../analytic-docs/ARCHITECTURE.md` §6 is explicit that this is the 60Hz layer, so no `fillText`,
no gradients, and no allocation per entity per frame.

Gotcha: an enemy is held at `boxDistance - 0.5`, so a whole queue sits at **the same arc distance**
and every glyph in it is drawn at the same point. That is correct simulation and an unreadable
picture — a stack of ants rendered as one ant. Decide what to do about it here, in `render/` only:
the enemies must not be moved apart in `core/`, because their positions are a pure function of
`distance` and there is no separation anywhere in this codebase (`DECISIONS.md` §3). A per-enemy
lateral offset derived from the enemy's own id is a render-side answer that stays deterministic.

### 5. The cards (`ui/viewModel.ts`, `StatCard.vue`, `en.ts`)

Decisions 7–9. `statsFor` gains the charge branch (`charges`, `rearmSeconds = rearmTicks / 60`,
rounded through the existing `round2`) and the barricade branch (`hitPoints`, `blocksPath`).
`StatCard.vue` gains the rows, still `v-if`'d on null and on false. New keys: `hud.stat.hitPoints`,
`hud.stat.charges`, `hud.stat.rearm`, `hud.stat.blocks` — **plus two this step did not foresee**:
`hud.stat.blocksGround`, because the card is a two-column list and `blocks` is a label that needs an
answer beside it, and `hud.stat.seconds`, because `perSecond`'s `{n}/sec` is the wrong shape for a
duration. Six keys, not four.

`debug.hint` needed nothing: it already read `1-8 tower`. See *Already in the repo*.

### 6. Play night 6, then tune

With `npm run dev` running, at 1× and at 3×, more than once. Night 6 is `night06` in
`core/content/nights.ts`, on the Counter, nine waves of ants, roaches and beetles.

- **The melee rates.** 10B authored `hp / 10` per second from arithmetic. Watch what it does: at
  1/sec an ant needs 200 seconds alone and ten of them need 20. Does a 25-crumb box buy a meaningful
  amount of time against night 6's opening, or is it either a formality or an unbreakable wall? If
  the number moves, it moves in `core/content/enemies.ts` and `tests/content.spec.ts` together, and
  `../../analytic-docs/CONTENT.md` §2 gains the column in the same commit.

  **It did not move.** Measured headlessly on night 6 (a throwaway spec driving `createWorld` +
  `tick`, deleted after): a box at 45% of the lane with two Salt Shakers beside it takes its first
  chewer at 12.5s and dies at 36.3s with a peak queue of ten — **~24 seconds of the opening stopped
  dead in front of two shakers**, for 25 crumbs. The same box with no shakers dies at 26.9s under a
  queue of eighteen; two or three shakers with no box hold nothing at all, because nothing stops.
  That is neither a formality nor a wall, so `hp / 10` stands and `CONTENT.md` §2 gains no column.
  The feel of it at 1× and 3× is still a human's call.
- **The box as a purchase.** A box plus two Salt Shakers should hold night 6's opening waves in a
  way neither does alone. If the box is strictly better than a third Salt Shaker, its 25 crumbs are
  mispriced against the doc and that is a finding for the doc, not a silent edit here.
- **The Mousetrap as a decision.** One enormous hit and a long anxious wait. If the wait reads as the
  tower being broken rather than as being spent, that is decision 1's treatment failing, not the
  balance.
- **Revise the English.** 10A and 10B wrote two entries with nothing on screen. Read them next to the
  cards; `../../analytic-docs/DECISIONS.md` §1 is understated and dry, and a description that reads
  as a joke on a card read forty times a night is the wrong length.

## Tests

**None new over `render/`.** `../../analytic-docs/ARCHITECTURE.md` §7: the bugs there are visible,
and the acceptance criteria below are the instrumentation. 10A and 10B carry every assertion in
step 10.

The one exception is not a suite: extend the existing stat-card assertion in
`tests/viewModel.spec.ts` with the Mousetrap and the Cardboard Box — one more expectation in a test
that already runs, so a barricade silently losing its card is caught. Do not write a component spec:
`vite.config.ts` runs `environment: 'node'` with no jsdom, so there is nothing to mount.

## Acceptance

- [ ] The Mousetrap's armed state is unambiguous at 3× speed from across the room.
- [ ] A box at 30 HP is obviously about to go, without reading the bar.
- [ ] A queue of ants eating a box reads as a queue of ants eating a box — you can count them, and
      you can tell they are attacking rather than stuck.
- [ ] A Cardboard Box plus two Salt Shakers holds night 6's opening waves in a way neither does
      alone.
- [ ] The shop card for all eight towers says something true, and the box's card says what a 25-crumb
      tower with no attack is for.
- [ ] Frame time is unchanged from step 9 with a full queue held at a box.
- [x] `render/` still writes nothing to the world, and no animation state reached `World`.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Add a repair button, a repair cost or a repair anything — repair is not a v1 feature and a destroyed
tower is rebuilt (`../../analytic-docs/CONTENT.md` §1 has no row for it). Do not draw a noise meter,
an aura radius, a heated tile or a light source — steps 13, 17, 14 and 11 own those and each brings
its own visual language. Do not add an upgrade button (step 12). Do not add a tower, an enemy, a
status or a night past 7. Do not put animation state on the world, and do not read `world.tick` for
anything that moves — frames, not ticks, or it strobes at 3×.
