# Step 9 — Status effects, cones and AoE

> This step is three sessions. Paste **one part file** into a fresh session, in order, and `/clear`
> between them. Do not paste this index — it exists to say what the parts are and how they fit.

**Prereq:** step 8, and you have actually played the milestone.

## Goal

Two reusable systems — **timed modifiers on an enemy** and **non-single-target hitboxes** — that
between them turn most of the remaining forty-odd towers into config entries. Build them properly
here; half the roster depends on them.

## Parts

Each part names its own `Read first:` sections, so a session only loads the docs it needs.

| Part | Session | Builds |
| --- | --- | --- |
| [A](09-status-effects/A-status-system.md) | Statuses that land, and the two towers that need no geometry | `core/systems/status.ts`, `applies` across the behaviour vocabulary, DoT through the matrix, charge consumption; Ice Cube Tray, Sticky Tape |
| [B](09-status-effects/B-hitboxes-and-cones.md) | Hitbox shapes and the cone interpreter | `core/systems/hitbox.ts`, cone targeting and firing, splash through `circle`; Spray Bottle, Beetle, nights 4–7 |
| [C](09-status-effects/C-statuses-on-screen.md) | What all of it looks like, and the tuning pass | `render/layers/entities.ts`, `drawRangeCone`, `ui/viewModel.ts`, `ui/locales/en.ts`, re-tuned nights |

Strictly in order. B interprets the field A adds; C draws what both of them made and is the part
that plays it.

**A and B carry every test in the step. C has none.** Both of the first two parts are headless core
work and each carries the assertions for its own system — A the status wiring, B the geometry. C is
`render/` plus copy plus content tuning: `../analytic-docs/ARCHITECTURE.md` §7 rules out specs over
the renderer, and the one headless thing C touches (`statsFor` in `ui/viewModel.ts`) extends an
assertion that already exists rather than earning a suite. A part with no tests is not an
under-tested part; do not invent coverage for C.

**Authored twice on purpose**, and both parts say so:

- **Nights 4–7.** B drafts them from arithmetic against the Counter's 31.1-tile crossing; C re-tunes
  them after watching them at 1× and 3×. This is the same split step 5C used on nights 1–3, and the
  reason is the same — wave pacing cannot be judged by reading a table.
- **The English strings.** A and B write `en.ts` entries for three towers and an enemy with nothing
  on screen; C revises that copy after seeing the cards in place, the way 8C revised 8A's.

## The seam that can't be split

**A owns how a status lands.** The `applies` list on all four behaviour schemas, and the one
function that turns that list into `applyStatus` calls carrying the *source's* damage type. B
interprets the cone and the splash circle, and calls that function; it does not grow a second
application path.

Move that line and the two paths drift silently: a burn from a shot routes through the tag matrix as
fire, a burn from a cone routes through it as nothing, and the only symptom is a damage number that
is wrong by 1.5× on one tower and right on the other.

## Dependency order

A → B → C, no overlap. A ships the vocabulary and the tick slot. B consumes both and adds geometry.
C reads what the world already holds and adds no simulation state at all.

## Step acceptance

- [ ] One Spray Bottle covering a corner meaningfully changes how night 5 plays.
- [ ] Adding a hypothetical fourth status-applying tower is a pure config change — a def in
      `core/content/towers.ts` and an entry in `en.ts`, and nothing in `core/systems/`.
- [ ] At 3× speed you can still tell which enemies are slowed and which are burning.
- [ ] Nights 4–7 are playable end to end from the night-end *Continue* button.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Auras — persistent radius effects with no firing — are step 17, along with the Candle, Fly Paper and
the Honey Pot. The charge *state machine* (`armed → firing → rearming`), tower HP and the barricade
are step 10. Pushback and the Fan are step 18. Tile effects are step 14. Cones and instant AoE only.

## Reconciled while splitting

Nine things the step said that the repo has since made untrue, or that contradicted a doc. Each is
resolved in the part that owns it; they are listed here so the change is on the record rather than
silently reinterpreted.

1. **"add Roach"** — the Roach shipped in step 5C. It is in `core/content/enemies.ts` with the doc's
   numbers and night 3 schedules it in five of its eight waves. Only the **Beetle** is new, in B.
2. **"Add a generic `charges` field to the tower model now"** — it exists. Step 2 shipped
   `charge({ charges, rearmTicks })` in `behaviours.ts` and `TowerState = { kind: 'charge', charges,
   rearmTicksRemaining }` in `core/types.ts`. What is missing is that nothing ever *fills it in*:
   `placeTower` builds every tower with `state: null`. A does the initialisation and the
   consumption, so step 17's "the field exists from step 9's Sticky Tape" stays true.
3. **"Author nights 4–7"** — `../analytic-docs/CONTENT.md` §6 puts nights 4–6 on the Sink and night 7
   in the Pantry, and neither map exists: step 21 authors the other five maps and wires nights 1–18
   in full. Meanwhile `createWorld` throws when a night's `mapId` is not the map it was handed, and
   `GameView.vue` hard-codes `MAP_ID = 'counter'`. So B authors nights 4–7 **on the Counter**, and
   step 21 re-maps them along with everything else.
4. **"`statusEffects` … already stubbed in `sim.ts`"** — the stub is `statusSystem` in
   `core/systems/status.ts`, and it is already fourth in `SYSTEM_ORDER`, which `tests/sim.spec.ts`
   pins against a literal list. No slot is added to the tick.
5. **Four of the six tests the step lists already exist.** `tests/statuses.spec.ts` asserts slow
   refreshing, freeze suppressing slow re-application, the stack cap and a root that never expires —
   over the pure functions, from step 2C. A's tests are about the **wiring** (a status that lands
   from a firing tower, DoT that routes through the matrix with its source's damage type) and do not
   restate them.
6. **Splash.** `core/systems/projectiles.ts` says "step 12's Tier 3 is the first content with a
   non-zero radius and owns the splash query"; this step says instant AoE resolves through `circle`
   now. B builds the query and fixes that comment. Step 12 still owns the first content that uses
   it, and no v1 tower has a non-zero `splashRadiusTiles`.
7. **The dead status schema.** `core/content/schema.ts` carries a zod `status` schema
   (`stacking: refresh | stack | untilSourceSpent`, `nameKey`, `durationTicks`) and exports a second
   type named `StatusDef` whose shape has already drifted from the runtime table in
   `core/content/statuses.ts` (`effect`, `StackRule`, `suppressedBy`). It validates a collection
   nothing passes — `core/content/index.ts` says why in a comment. **Left alone:** no part of step 9
   needs either shape changed, and deleting it takes two passing specs in `tests/schema.spec.ts`
   with it. `statuses.ts` stays the only truth; a later step that authors status content reconciles
   the two rather than adding a third.
8. **Ice Cube Tray's targets.** The step's line names only its damage and its status;
   `../analytic-docs/CONTENT.md` §1 says `ground`. A takes the doc.
9. **The Spray Bottle's glyph is already on the board.** `core/content/maps/counter.json` has 🧴 as
   decor at (18, 11). A tower and a piece of scenery cannot share a silhouette — the same mistake
   step 7C found with the Cookie Jar and the bread — so B changes the *decor* glyph, because
   CONTENT.md §1 fixes the tower's.
