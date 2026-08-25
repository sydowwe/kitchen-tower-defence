# Step 9C — Statuses on screen, the cone preview, and the tuning pass

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §2 *Art: emoji sprites* and §1
(tone, for the copy pass), `../../analytic-docs/ARCHITECTURE.md` §6 (the frame budget),
`../../analytic-docs/CONTENT.md` §4 (what each status is, and the two numbers you are here to
settle).
**Prereq:** 9A and 9B.

## Goal

Everything the first two sessions built is invisible: a slowed ant looks like an ant, a cone tower
previews as nothing at all, and the Spray Bottle's shop card is blank. This session makes the four
statuses readable at 3× speed, gives the cone a preview shaped like a cone, fills in the cards — and
then plays nights 4–7 and tunes them. It is the session that closes step 9.

## Already in the repo

| File | What's there today |
| --- | --- |
| `render/layers/entities.ts` | `drawEntities` — sample the path, blit a cached bitmap, draw an HP bar **only when damaged**. `ENEMY_SCALE` 0.7. The one layer that runs 60 times a second, doing exactly one thing per entity |
| `render/layers/effects.ts` | the precedent for everything you are about to write: module-local state, aged in **frames**, fixed caps, `ctx.globalAlpha` restored to 1 at the end of every pass. Its header says why a flying glyph is not simulation state |
| `render/layers/towers.ts` | `drawRangeCircle(ctx, tilePx, centerTile, radiusTiles, tone)`, `PlacementTone` (`valid` / `invalid` / `neutral`), `TOWER_SCALE`. **Nothing in the file knows what is selected** — it exports primitives and the caller decides who is highlighted |
| `render/layers/overlay.ts` | `OverlayView` = `{ selected, ghost }`, each carrying `rangeTiles: number \| null`. A plain view the caller declares, never a Vue ref |
| `render/palette.ts` | colours named by **role**, not by colour, because step 23 retunes all of them |
| `render/glyphCache.ts` | keyed `emoji\|sizePx\|dpr`; `blitGlyph` blits a pre-rasterised bitmap |
| `ui/interaction.ts` | builds `OverlayView` once per frame; `rangeOf(def)` finds a range through `isAttack` — so a cone tower gets **null**, and today draws only a placement square |
| `ui/viewModel.ts` | `statsFor(def)` derives the card through `isAttack` / `isCollect`; every field is null for a tower that does not have it, and it re-exports the vocabulary types so no `hud/` component imports `core/` |
| `ui/components/hud/StatCard.vue` | every row `v-if`'d on a **null**, never on a zero |
| `ui/locales/en.ts` | 9A's and 9B's three tower entries and the Beetle, written blind |
| `core/content/nights.ts` | 9B's draft of nights 4–7 |

## Decisions already made

Override one only if the code proves it wrong — and then edit this file, don't leave it lying.

1. **Status visuals age in frames, in module-local state, never in `world.tick`.** At 3× speed three
   ticks run between two frames, so a tick-aged flicker triples its rate and reads as a strobe —
   which fails the one acceptance criterion this part exists for. `effects.ts` established frames as
   the unit for anything animated and `render/` never writes to the world.
2. **The blue tint is not a tint of the glyph.** The cache hands out an opaque bitmap and
   `blitGlyph` cannot recolour one — `effects.ts` hit this in step 6C and drew a ring at the hit
   position instead. A slow is a translucent disc drawn **under** the glyph, plus specks around it.
3. **No facing field on `Tower`.** A placed cone tower aims at `targetEnemyId`'s position; with no
   target — and for the ghost, which has none by definition — it aims at the nearest point on the
   nearest lane, via `nearestPath` + `samplePath` in `core/path.ts`. A `facingAngle` on the world
   would need a system to write it, would go into every save and every replay, and would be a second
   answer to a question `targetingSystem` already answers every tick.
4. **`OverlaySelected` and `OverlayGhost` carry a `reach` union** — `{ kind: 'circle', radiusTiles }`
   or `{ kind: 'cone', radiusTiles, halfAngleDeg, facingRad }`, or null — replacing
   `rangeTiles: number | null`. The caller resolves it, exactly as it already resolves the
   `PlacementTone`, so `drawRangeCone` stays a pure draw like every other layer function.
5. **Status icons above the HP bar come last, and only where the treatment alone fails.** Ship the
   four treatments, play a night, then add an icon row for whatever you still cannot read. If you do
   add one, **anchor it to the glyph box and not to the HP bar** — the bar is only drawn once an
   enemy is damaged, and a row anchored to it jumps a few pixels the first time anything hits.
6. **`TowerStatsView` gains `applies: StatusKind[]` and `coneHalfAngleDeg: number | null`**, and
   `StatusKind` joins the vocabulary `ui/viewModel.ts` re-exports, so `StatCard.vue` still imports
   nothing from `core/`.
7. **Tune only the numbers the docs do not fix.** Cone half-angle, the Ice Cube Tray's projectile
   speed and the night tables are yours. Anything in `../../analytic-docs/CONTENT.md` §1–§4 moves
   only as an edit to that file in the same commit — which includes the one number the docs
   contradict themselves on, below.

## Build

### 1. The four status treatments (`render/layers/entities.ts`)

Read off `enemy.statuses` per enemy, after the glyph and the HP bar. The language, from step 9's
brief: **Slow** a blue tint plus frost specks, **Burn** an orange flicker, **Poison** green bubbles,
**Rooted** a white shimmer. Colours as role-named constants in `palette.ts`.

- This is the 60Hz layer, and `../../analytic-docs/ARCHITECTURE.md` §6 is explicit about it: no
  `fillText`, no gradients, **no allocation per entity per frame**. Batch by treatment the way
  `drawSpecks` does — one `beginPath`, many `arc`s, one `fill` — rather than a path per enemy.
- Restore `ctx.globalAlpha = 1` at the end of every pass. Leaving it set fades everything drawn
  after: projectiles, the theft animation, the whole overlay. It is one line and it is the most
  common bug in this file's neighbours.
- **Slow and Freeze both read as "cold and stopped"**, and `speedMultiplier` is a `min` over both.
  Nothing applies Freeze in v1 (Ice Cube Tray's T3 is step 12's), so give Slow the treatment and
  leave Freeze reusing it at full strength rather than inventing a fifth language.
- Test it against the thing it exists for before you tune it: forty ants at 3×, half of them
  burning. If you cannot sort them at a glance the answer is more *contrast*, not more effects — a
  board where every enemy is decorated is a board with no information on it.

### 2. `drawRangeCone` (`render/layers/towers.ts`)

Beside `drawRangeCircle`, taking the same `PlacementTone` and using the same fill and stroke, so a
cone and a circle read as one system. A wedge is `moveTo(center)`, `arc(center, radius, start, end)`,
`closePath` — with the same `+ 0.5` tile-centre convention every other function in the file uses.

### 3. The reach union, and who resolves it

`render/layers/overlay.ts` per decision 4, then `ui/interaction.ts`: `rangeOf` becomes `reachOf`,
finding the behaviour through `isAttack` **or** 9B's `isConeAttack`, and resolving the facing per
decision 3.

Gotcha: a tower standing on the point it is aiming at gives a zero-length vector and `atan2(0, 0)`
is 0 — a cone that always points right. It cannot happen with an `off_path` tower on a one-lane map
and it will happen the first time something is `path_only`, so guard it now.

### 4. The cards (`ui/viewModel.ts`, `StatCard.vue`, `en.ts`)

`statsFor` gains the cone branch — damage, rate, dps, range, type, targets, all from
`ConeAttackBehaviour` — plus `applies` and `coneHalfAngleDeg`, and `StatCard.vue` gains two rows,
still `v-if`'d on null and on an empty array. New keys: `hud.stat.cone`, `hud.stat.applies`, and
`hud.status.*` for the seven kinds, keyed by the literal so the row renders the union directly the
way `hud.mode` and `hud.damage` already do.

The DoT number a player wants on a Spray Bottle card is "3 on impact, then poison" — the poison rate
belongs to the status, not the tower, and printing a per-tower DoT rate here would be the second
copy of the number decision 7 is about.

### 5. Play nights 4–7, then tune

With `npm run dev` running, at 1× and at 3×, more than once. Then:

- **Re-tune the night tables** in `core/content/nights.ts` — counts, spacing, countdowns. 9B
  authored them from arithmetic; this is the pass that can see whether night 5 is a night. The file's
  header note is the thing to hold onto: the spawn window against the crossing is what sets the pace.
- **Settle the poison rate.** §1 gives the Spray Bottle "3 + 2/s"; §4 gives Poison 4 dmg/s, and 9B
  shipped the status table's number because nothing else applies poison yet. Decide it by playing
  night 5 — with `swarm`'s ×1.5 against chemical, one stack at 4/s kills an Ant in under two seconds
  and five stacks is 30/s. Whichever number wins, **edit `../../analytic-docs/CONTENT.md` so the two
  sections stop disagreeing**, and say which way it went in the commit.
- **Revise the English.** 9A and 9B wrote four entries with nothing on screen. Read them next to the
  cards: `../../analytic-docs/DECISIONS.md` §1 is understated and dry, and a description that reads
  as a joke on a card read forty times a night is the wrong length.
- Only then, the icon row from decision 5, if you still want it.

## Tests

**None new over `render/`.** `../../analytic-docs/ARCHITECTURE.md` §7: the bugs there are visible,
and the acceptance criteria below are the instrumentation. 9A and 9B carry every assertion in step 9.

The one exception is not a suite: if you extend `statsFor`, extend the existing stat-card assertion
in `tests/viewModel.spec.ts` with the cone tower — one more expectation in a test that already runs,
so a cone tower silently losing its card is caught. Do not write a component spec: `vite.config.ts`
runs `environment: 'node'` with no jsdom, so there is nothing to mount.

## Acceptance

- [ ] At 3× speed you can tell which enemies are slowed and which are burning, across a whole wave,
      without pausing.
- [ ] A Spray Bottle's ghost shows a wedge before you place it, and the wedge points where the tower
      will actually shoot.
- [ ] The shop card for every one of the six towers says something true, and the two new control
      towers are legibly different purchases from the Salt Shaker.
- [ ] One Spray Bottle covering a corner meaningfully changes how night 5 plays.
- [ ] A Beetle reads as a bruiser rather than as a big Roach — 🪲 and 🪳 at 0.7 of a tile are closer
      than they look in an editor. If they are not distinguishable, the fix is the enemy's scale or
      its glyph, and it is cheaper now than in step 23.
- [ ] Frame time is unchanged from step 8 with forty afflicted enemies on the board.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Draw an aura radius, a heated tile or a light source — steps 17, 14 and 11 own those and each brings
its own visual language. Add an upgrade button or a targeting row to anything (step 12 owns
upgrades; the targeting selector already exists). Add a status to a tower, a tower to the roster, or
a night past 7. Put animation state on the world, or read `world.tick` for anything that moves.
