# Step 17D — On the board, and the tuning pass

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../../CLAUDE.md`, `../../../analytic-docs/DECISIONS.md` §2 (*Art: emoji sprites*),
`../../../analytic-docs/ARCHITECTURE.md` §6 (the performance budget), `../../../analytic-docs/CONTENT.md`
§6 (the night table, rows 10, 12 and 16), and the Honey Pot line of
`../../../analytic-docs/OPEN-QUESTIONS.md`.
**Prereq:** steps 17A, 17B and 17C.

## Goal

This session closes step 17. Several auras on the board stay readable and cost nothing. The
Burner's tile looks like it hurts. A Honey Pot has ants visibly clustered on it and an HP state you
can't miss, because a player who doesn't notice it's dying will be angry rather than instructed.
Stuck flyers read as stuck. Then comes the pass that re-tunes every number A and B authored blind,
and nights 10, 12 and 16 checked against the towers they unlock.

## Already in the repo

| File | What's there now |
| --- | --- |
| `render/renderer.ts:172` | the draw order: `drawTileEffects` → crumbs → `drawTowers` → fridge → `drawEntities`. **Heat is drawn under the tower that makes it**: the Burner's pad and glyph sit on its own heated tile, and `drawHeat` (`tileEffects.ts:472`) is a ring of at most 0.48 tiles, which the pad covers |
| `render/layers/towers.ts:360` | `drawLightPools`: its own pass before the first pad, with gradients cached by `tilePx` and radius (`:337`). **The Candle already gets an amber pool at radius 2** through its `reveal`. No `aura` has a fill: not the Candle's, not the Nightlight's tier 3, not the Bay Leaf's, not the Honey Pot's |
| `render/layers/towers.ts` | `drawBox`: a Cardboard Box collapses with its HP fraction. It's the precedent for a tower whose HP *is* its state. `drawHpBar` draws only once a tower is hurt |
| `render/layers/entities.ts:728` | every enemy is drawn at `applyLateralOffset`, so **feeders already lean onto the pot** with no render code. `EnemyFrame` (`:193`) is a pool, and **every field is written every frame**: an unwritten field on a reused entry is stale |
| `render/layers/entities.ts:528` | `drawRooted`, a batched ring at the feet. Stuck flyers already get it |
| `render/palette.ts` | colours by **role**. `TILE_HEAT_PULSE` is deliberately ember red, not lamp amber, and says why |
| `core/systems/bait.ts` | B's `BAIT_CATCH_WINDOW_TILES`, `BAIT_LEAN_GAP_TILES` and `BAIT_LEAN_TILES_PER_TICK`: **values** you may re-tune by eye |
| `core/content/towers.ts` | A's and B's blind numbers: the Candle's tiers and tier-3 burn magnitude, the Burner's heat and tiers, the Fly Paper's cooldown and tiers, and the Honey Pot's `maxHp`, bait radius and duration, and income tiers |
| `core/content/nights.ts` | nights 10 (`:741`), 12 (`:1110`) and 16 (`:1716`). The notes on 12 and 16 say "step 17 may re-tune this night once the Burner / Honey Pot exists". `tests/content.spec.ts:379` pins every night's wave count |
| `ui/views/GameView.vue` | `SEED = 1234`, so a retry replays the same night. Continue walks `NIGHTS` by position. If a dev night picker (`dev/night/NightPanel.vue`) is in the tree, use it to jump |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **One aura pass, beside `drawLightPools` and before the pads**, over every `isAura` behaviour of
   every tower's effective def, with its gradients cached the same way. Keying by `tilePx` and radius
   **and** role is what "cost nothing measurable" rests on: a `createRadialGradient` per aura per
   frame is 3B's acceptance broken again.
2. **Two roles, not one per tower**: a damaging aura (the Candle, the Nightlight's tier 3) and a
   0-damage one that only applies a status (the Bay Leaf's tier 3, the Honey Pot's). Colour them by
   role in `palette.ts`. Low contrast, and overlapping fills must still read as circles rather than
   a stain. **The Candle wears both a lamp pool and an aura fill at the same radius.** Look at it
   and decide whether the pair reads as one lit, burning circle or as mud. If it's mud, draw the
   aura as a rim or an edge instead, not a second disc.

   *Built as the rim from the start (17D), without the disc being tried on screen: a pool that is
   brightest at the centre plus a disc at the same radius can only add up to a brighter pool, and two
   overlapping discs are the stain this decision warns about. The rim is clear to 55% of the radius
   and rises to the role colour at the edge, with a 1px edge stroke. Whether it reads is still the
   acceptance's call.*
3. **The Burner's danger is drawn above its pad.** Either a flame treatment drawn after the tower
   glyph, reading `hasEffect(world, tile, 'heat')`, or the heat of a cell under a tower moved into
   a pass after `drawTowers`. The existing ring stays for T3's neighbouring tiles, which have no
   tower on them. Ember, not amber: the palette note is right.
4. **The pot's HP state is the pot, not only the bar.** Follow `drawBox`: the honey drains, or the
   jar cracks, with `hp / maxHp`, and the bar stays. The cluster comes from B's lean. Tune
   `BAIT_LEAN_GAP_TILES` until the feeders ring the jar without covering its glyph.

   *The code proved half of this wrong (17D): the lean alone cannot make a ring. Every feeder of one
   lane leans to the **same** offset and is caught within half a tile of the others, so they stack
   on one spot beside the jar. The ring is drawn: `entities.ts` fans each pot's feeders round the
   jar's centre, the chew queue's answer to the same problem, and the gap went 0.5 → 0.7 so that ring
   clears the jar. Both the honey draining and the cracks are drawn, plus a red pulse on the pad
   under a third.*
5. **The nights are checked and not rewritten.** Play 10 for the Candle against the Moth, 12 with a
   Burner, and 16 with a Honey Pot. Re-tune only what play shows. Either way, **rewrite the two
   "step 17 may re-tune" sentences** to say what happened, because a note inviting an edit that's
   already been judged is a note that lies.

## Build

### 1. Aura fills: `render/layers/towers.ts`, `render/palette.ts`

Decisions 1 and 2. Then put six auras and a Nightlight on one board, run at 3×, and look at the
frame time in the browser's performance panel before and after.

### 2. The Burner: `render/layers/towers.ts` or `render/layers/tileEffects.ts`

Decision 3. It has to read from across the room at 3×, and it mustn't read as a lamp.

### 3. The Honey Pot and its feeders: `render/layers/towers.ts`, `render/layers/entities.ts`

Decision 4. If the feeders want their own treatment (a bob while eating, say), it's a new
`EnemyFrame` field off `enemy.feeding !== null`, written every frame. The death is already
`towerDestroyed` → `drawPuffs`.

### 4. Stuck flyers: `render/layers/entities.ts`

The rooted ring is already there. Look at a Fly Paper holding two flies at 3× and decide whether
that's enough to say *stuck to the paper*. If it isn't, a strand from the paper to each flyer it
holds (the fly's `rooted` status carries `sourceId`) is one batched line pass.

*17D built the strand without a look at the ring alone: a ring says "stuck" and nothing about "to
what", and the paper is the thing the player has to find to know it will retire. Flyers only; a tape's
root is already standing on the tape.*

### 5. Play it, then tune: `core/content/towers.ts`, `core/systems/bait.ts` (values), `nights.ts`

Nights 10, 12 and 16, at 1× and 3×. A throwaway headless harness is fine for comparing layouts, as
16C did; **don't commit it**. Then re-tune A's and B's numbers. Say in the commit which way each
went and why. Their specs mostly assert against the defs' own fields, so moving a number moves no
assertion — *except the Candle's base burn, which 17D found pinned as a literal 4 in
`tests/content.spec.ts` (the section-1 number) and in `tests/candle.spec.ts` (4 × 1.5). Moving it
moves both.* Then re-read C's copy against the board.

Gotchas that will bite the tuning:

- **The Candle's reward is the moth pull, and it's geometric.** A Moth is pulled to the nearest
  light within 5 tiles, but only by the perpendicular component, capped at 3 tiles. A Candle more
  than ~2 tiles off the lane pulls moths *toward* its radius and not into it. Tune the combo by
  where you'd actually place a Candle beside a Nightlight, and make sure that spot is findable.

  *What 17D found, headless:* **a tier-0 Nightlight adds nothing to a Candle.** The pull's reach is
  the moth's 5 tiles for every light and the nearest light wins, so a Nightlight beside a Candle
  pulls the moth exactly where the Candle already would. Candle + Nightlight killed the same moths as
  the Candle alone at every burn rate tried. The combination that works is a Candle beside the lane
  plus anything that lands one more hit (a Toaster, a second Candle, the Nightlight's tier-3 aura).
  Making the Nightlight itself matter would be a `light.ts` change, which is outside this step.
- **The Burner is loud while it burns** (A, decision 3). Two Burners on a busy lane outrun the
  meter's 1.5/s decay by 2.5/s. Watch the meter on night 12 before calling the Burner balanced;
  the noise is its price.
- **The Candle's tier-3 burn** at the status table's 5/s is +15/s in its whole radius, plus three
  seconds after. A authored an override. Judge it against the Nightlight's tier-3 6/s.
- **The Honey Pot's HP decides the whole gamble.** A Silverfish chews at 11/s and an Ant at 1/s.
  Play it defended and undefended on night 16, on two seeds (change `SEED` locally and **don't
  commit it**). It should pay when watched and be lost when not. `OPEN-QUESTIONS.md` asks exactly
  this, so answer it there if you played both.
- **A Mold is never lured** (B), so a pot beside a mold patch catches nothing from it. That's
  correct, not a bug to tune around.

## Tests

**None.** `../../../analytic-docs/ARCHITECTURE.md` §7 excludes `render/`, and an aura that reads as a
stain isn't something a spec catches. Keep `tests/content.spec.ts` true: if a night's wave count
changes, change its literal in the same commit. A's, B's and C's suites are the regression net for
everything you re-tune.

## Acceptance

- [ ] A Candle plus a Nightlight is a discoverable and satisfying anti-moth combination.
- [ ] The Honey Pot is a real gamble: profitable when defended, a disaster when it isn't. Leave this
      unticked unless you played both.
- [ ] Several auras on screen at once remain readable and cost nothing measurable in frame time.
- [ ] The Burner's tile reads as dangerous at 3×, and a dying Honey Pot is noticed before it's gone.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

Leave every judgement criterion unticked unless you actually sat and looked. The checkboxes are the
ledger of what has been confirmed.

## Do not

Change logic in `core/systems/`. The `BAIT_*` values and the defs' numbers are yours to move, and
nothing else is. If a treatment needs data the world doesn't carry, that's A's or B's file and a
note in the commit. Don't build the step 23 lighting layer: warm pools as real lighting are that
step's, and these fills are functional. Don't author night 14 or 18, night modifiers or "moving
day" (step 21), or unlocks (step 20).
