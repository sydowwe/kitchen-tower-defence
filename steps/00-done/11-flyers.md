# Step 11 — Flyers, light attraction, detection

> This step is three sessions. Paste **one part file** into a fresh session, in order, and `/clear`
> between them. Do not paste this index — it exists to say what the parts are and how they fit.

**Prereq:** step 10, all three parts.

## Goal

Enemies that ignore half your defences, and the first towers that answer them. This is where the
game stops being one-dimensional — and it retroactively fixes the fruit fly problem step 7 created.
It is also where an enemy leaves the polyline for the first and only time in v1, which is the one
thing in this step that can be architecturally wrong rather than merely mistuned.

## Parts

Each part names its own `Read first:` sections, so a session only loads the docs it needs.

| Part | Session | Builds |
| --- | --- | --- |
| [A](11-flyers/A-air-and-the-toaster.md) | Air as a real layer, and the tower that answers it | `isFlyer` promoted to one exported predicate, the air half of `isTargetable` asserted end to end; the Fly; the Toaster; nights 8 and 9 |
| [B](11-flyers/B-light-and-detection.md) | Light attraction, revelation, and the Nightlight | `Enemy.lateralOffsetTiles`, `applyLateralOffset` in `core/path.ts`, `enemyPosition`, `core/systems/light.ts` and its `SYSTEM_ORDER` slot, `EnemyFlag.revealed`; the Moth; the Nightlight; night 10 |
| [C](11-flyers/C-flyers-and-lights-on-screen.md) | What all of it looks like, and the night 8 pass | `render/layers/entities.ts`, `render/layers/towers.ts`, `reachOf` in `ui/interaction.ts`, `ui/viewModel.ts`, `StatCard.vue`, `ui/locales/en.ts`, the tenth hotkey, the tuning pass |

Strictly in order. B moves the one function that says where an enemy is, and C draws from it; a C
that ran first would draw every moth on the track.

**A and B carry every test in the step. C has none.** Both of the first two are headless core work
and each carries the assertions for the mechanic it introduces — A the two directions of the air
filter, B the offset's shape and the reveal's timing. C is `render/` plus copy plus content tuning:
`../../analytic-docs/ARCHITECTURE.md` §7 rules out specs over the renderer, and the one headless thing
C touches (`statsFor` in `ui/viewModel.ts`) extends an assertion that already exists rather than
earning a suite. A part with no tests is not an under-tested part; do not invent coverage for C.

**Authored twice on purpose**, and each part says so:

- **Nights 8, 9 and 10.** A and B author them from arithmetic against the Counter's 31.1-tile lane,
  the way nights 4–7 were drafted; C re-tunes them after watching one at 1× and 3×, the way 5C and
  9C did. In particular the step's "a single Toaster meaningfully cleans up a fly problem" cannot be
  judged before there is a fly on screen to watch it shoot.
- **The Toaster's `projectileSpeed`.** No column in `../../analytic-docs/CONTENT.md` §1 fixes it. A
  authors it blind and C re-tunes it by watching a shot cross, exactly as 6C re-tuned the Salt
  Shaker's 0.2 down to 0.1.
- **The drift rate.** B authors `LIGHT_DRIFT_TILES_PER_TICK` from arithmetic against the step's "back
  to 0 within 2s"; C is the first session that can see whether a moth curves or snaps.
- **The English.** A and B write four def entries with nothing on screen; C revises that copy after
  seeing the cards, the way 8C revised 8A's, 9C revised 9B's and 10C revised 10A's.

## The seam that can't be split

**`enemyPosition` in `core/systems/spatial.ts` is the single answer to "where is this enemy", and B
is the part that changes it.** Every range question in the simulation already goes through it —
targeting, the three hitbox shapes, splash, projectile aim, the death event's `at`, and the click
hit-test in `ui/interaction.ts`. B adds the moth's lateral offset there and nowhere else.

`render/layers/entities.ts` is the one place outside `core/` that calls `samplePath` on an enemy
directly (line 376), and B is what moves it onto the shared helper. Leave that line where it is and
the moth is **drawn on the track while every tower shoots it three tiles away**: no test fails, no
frame drops, and the bug reads as a targeting bug for as long as it takes someone to hold a
screenshot against the range circle.

The corollary for C: draw the bob and the shadow as offsets from the position B hands you. Do not
re-derive one.

## Dependency order

A → B → C, no overlap in what they own. A adds no tick slot and no field to the world; B adds the
one new slot (`light`, between `barricades` and `targeting`) and the one new field on `Enemy`; C
reads what the world already holds and adds no simulation state at all.

A and B both append to `core/content/towers.ts`, `enemies.ts`, `nights.ts` and `ui/locales/en.ts`,
and both fix `tests/content.spec.ts`'s night-count assertion as they add a night. Different symbols
in the same files; that is the same shape 10A and 10B had.

## Step acceptance

- [ ] Night 8 is genuinely lost by a player who built only Salt Shakers, and won by one who adds two
      Toasters.
- [ ] Moths visibly curve toward a Nightlight, and a Nightlight surrounded by Toasters is an
      obviously good idea.
- [ ] Flyers read as flying at a glance, with no need to check a tooltip or a stat card.
- [ ] A single Toaster meaningfully cleans up a fruit-fly problem. If it does not, one of the rot
      punishment and the Toaster is mistuned — `../../analytic-docs/OPEN-QUESTIONS.md`, "The fruit fly
      gap", is the note this closes.
- [ ] Adding a hypothetical second light source is a def in `core/content/towers.ts` plus an entry in
      `en.ts` — step 17's Candle gains `reveal({ attractsLightDrawn: true })` beside its aura and
      needs nothing in `core/systems/`.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Auras (step 17, and the Candle with them), the noise meter (step 13 — the Toaster's `noise: 3` is
emitted by `combatSystem` today and consumed then), upgrades (step 12), burrowing and the Booklouse
(step 16 and Act III — this step ships the `hidden` plumbing with no content that uses it),
pushback (step 18), tile effects (step 14). Do not author a night past 10, and do not add a second
lane to the Counter — `../../analytic-docs/CONTENT.md` §6 puts a second spawn point at night 10 and step
21 is what authors the map that has one.

## Reconciled while splitting

Nine things the step said that the repo has since made untrue, or that contradicted a doc or itself.
Each is resolved in the part that owns it; they are listed here so the change is on the record rather
than silently reinterpreted.

1. **"any tower with a `light` behaviour"** — there is no `light` behaviour and there is not going to
   be one. Step 2B shipped `reveal({ radiusTiles, attractsLightDrawn })` in
   `core/content/behaviours.ts`, it is in the `BEHAVIOUR_KINDS` list, it is schema-validated, and
   `../../CLAUDE.md` names `reveal` in the vocabulary. B uses it and adds no member to the union.

2. **`RevealBehaviour`'s doc comment says "Step 16".** It is this step's. Fixed in B.

3. **"radius 4" and "within 5 tiles" are two different radii, and both are right.**
   `../../analytic-docs/CONTENT.md` §1 gives the Nightlight range 4; §2 says a Moth deviates toward a
   light "within 5 tiles". B keeps both: 4 is the def's `radiusTiles` and is what reveals, 5 is
   `LIGHT_ATTRACTION_TILES`, a constant in the light system. The reason it is not the def's radius is
   that `attractsLightDrawn` is a **boolean** — the reach is a property of the moth's eyes, not of
   the lamp, and step 17's Candle (aura radius 2) has to pull from the same five tiles.

4. **"build the `hidden` / `revealed` flag plumbing now … and make `targetable` respect it"** — half
   of it already exists. `EnemyFlag` has carried `'hidden'` since step 2A and `isTargetable` in
   `core/systems/targeting.ts` has read it since 6B. What is missing is that **nothing ever sets or
   clears it**. B adds `'revealed'` to the union and the system that writes it, and changes the
   predicate from `flags.hidden` to `flags.hidden && !flags.revealed`. → B.

5. **"Flyers ignore tile effects — add the check now"** is not buildable.
   `core/systems/tiles.ts` is a four-line stub whose body is empty and whose comment says step 14
   owns it; a check added to it would be a check on nothing. What ships instead is one exported
   `isFlyer` predicate, so step 14's first line is `if (isFlyer(enemy)) continue` and step 17's aura
   and step 18's pushback ask the same function. The step file's bullet is corrected in A.

6. **`isFlyer` already exists** — privately, in `core/systems/barricades.ts:82`, with a comment
   explaining why it is `tags.includes('air')` and deliberately **not** `isTargetable`. A promotes
   the function and keeps the comment; losing it is how a burrowed Weevil walks through a Cardboard
   Box in step 16. → A.

7. **"Unlocks the same night flies arrive"** describes a system that does not exist. `ShopEntry`
   carries `unlocked` and `buildShop` hard-codes it to `true` for every tower, with a comment saying
   step 20's progression is what turns it on. Both new towers are buyable from night 1 in this step,
   and the doc's unlock column is `../../analytic-docs/CONTENT.md` §6's business, not this step's.

8. **Nights 8–10 are authored on the Counter**, not on the Pantry and the Stove. §6 names two maps
   that do not exist; `createWorld` throws on a night whose `mapId` is not the map it was handed and
   `GameView.vue` only ever passes `'counter'`. Same reconciliation nights 4–7 already carry, same
   comment. Night 10's second spawn point goes with the map, in step 21.

9. **"Toaster"** collides with **"Toaster Crumb Tray"**, which has been in the shop since step 7. Two
   different towers, two different ids (`toaster`, `toasterCrumbTray`), 🔥 and 🧺. A authors it and
   C is the session that can see whether the shop reads as having two toasters in it; if it does,
   `en.ts` is where that gets fixed, not the roster.
