# Step 10 — Charge states, tower HP, barricades

> This step is three sessions. Paste **one part file** into a fresh session, in order, and `/clear`
> between them. Do not paste this index — it exists to say what the parts are and how they fit.

**Prereq:** step 9, all three parts.

## Goal

Two towers that aren't turrets: one that must be re-armed, and one that enemies attack instead of
walking past. Both introduce state machines later content reuses heavily — and between them they
turn `Tower.hp` from a field nothing reads into the rail step 13's noise penalty and Act III's wasps
plug into without a refactor.

## Parts

Each part names its own `Read first:` sections, so a session only loads the docs it needs.

| Part | Session | Builds |
| --- | --- | --- |
| [A](10-charges-and-barricades/A-charges-and-tower-hp.md) | The charge machine, tower HP, and the Mousetrap | `core/systems/charges.ts`, `damageTower` / `destroyTower` in `placement.ts`, the `towerDestroyed` event, the Cookie Jar's destroy penalty; the Mousetrap |
| [B](10-charges-and-barricades/B-barricades.md) | The Cardboard Box and the queue that chews it | `core/systems/barricades.ts` and its slot in `SYSTEM_ORDER`, `EnemyDef.meleeDamagePerTick`; the Cardboard Box |
| [C](10-charges-and-barricades/C-traps-and-boxes-on-screen.md) | What all of it looks like, and the night 6 pass | `render/hpBar.ts`, `render/layers/towers.ts`, `render/layers/entities.ts`, `ui/viewModel.ts`, `ui/locales/en.ts`, the melee rates |

Strictly in order. B damages towers through the one path A builds; C draws what both of them made and
is the part that plays it.

**A and B carry every test in the step. C has none.** Both of the first two are headless core work
and each carries the assertions for its own machine — A the charge cycle and the destruction path, B
the geometry of being stopped. C is `render/` plus copy plus content tuning:
`../../analytic-docs/ARCHITECTURE.md` §7 rules out specs over the renderer, and the one headless thing
C touches (`statsFor` in `ui/viewModel.ts`) extends an assertion that already exists rather than
earning a suite. A part with no tests is not an under-tested part; do not invent coverage for C.

**Authored twice on purpose**, and both parts say so:

- **The Mousetrap's armed state.** A ships the state machine and whatever the existing tower layer
  already draws; C makes armed and rearming unmistakable at 3× speed. The one acceptance criterion
  that matters here cannot be judged from a spec.
- **The melee rates.** B authors `meleeDamagePerTick` from the step's `hp / 10` per second, which no
  doc column fixes; C re-tunes it after watching a queue actually eat a box on night 6.
- **The English.** A and B write two tower entries with nothing on screen; C revises that copy after
  seeing the cards, the way 8C revised 8A's and 9C revised 9B's.

## The seam that can't be split

**A owns how a tower takes damage and how it leaves the board.** One path:
`damageTower → destroyTower → the `towerDestroyed` event → the destroy penalty`. B calls it and grows
no second one, and step 13's noise penalty will call the same one.

Move that line and the two paths drift silently: a Cookie Jar chewed apart pays the enemy side its
200 crumbs, a Cookie Jar killed by the noise meter three steps later pays nothing, the HUD's ledger
sees one `towerDestroyed` out of two, and the only symptom is a penalty that fires for one cause of
death and not the other.

## Dependency order

A → B → C, no overlap. A ships the charge cycle and the destruction path and adds no new tick slot.
B adds the one new slot and the only thing in v1 that damages a tower. C reads what the world
already holds and adds no simulation state at all.

## Step acceptance

- [ ] A Cardboard Box plus two Salt Shakers holds night 6's opening waves in a way neither does
      alone.
- [ ] The Mousetrap's armed state is unambiguous at 3× speed from across the room.
- [ ] Placing and selling barricades under load produces no stuck or teleporting enemies.
- [ ] Adding a hypothetical second barricade tower, or a second charge tower, is a def in
      `core/content/towers.ts` plus an entry in `en.ts` and nothing in `core/systems/`.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Tower repair (not a v1 feature at all — a destroyed tower is gone and you rebuild it), the noise
meter (step 13, which is the second consumer of A's damage path), tower-attacking enemies (Act III),
upgrades (step 12), flyers as a system (step 11 — the Fruit Fly's `air` tag is all B needs). Do not
author a night past 7.

## Reconciled while splitting

Twelve things the step said that the repo has since made untrue, or that contradicted a doc or
itself. Each is resolved in the part that owns it; they are listed here so the change is on the
record rather than silently reinterpreted.

1. **"A `charge` behaviour with an explicit state field"** — both exist. Step 2 shipped
   `charge({ charges, rearmTicks })` in `behaviours.ts` and `TowerState = { kind: 'charge', charges,
   rearmTicksRemaining }` in `core/types.ts`; step 9A seeds the counter in `placeTower` and spends it
   in `combatSystem`. What is missing is that **nothing ever refills it** — `rearmTicksRemaining` is
   written once, as 0, and never read. A builds the rearm half only.

2. **`armed → firing → rearming` is not a stored field.** It is derived from the two numbers already
   on `TowerState`; `firing` lasts zero ticks. A stored phase is a second truth that can disagree
   with the counter and goes into every save. A exports `chargePhase()` so `render/` and `ui/` cannot
   each invent the predicate. → A.

3. **"its visual must come from config"** — no second glyph on `TowerDef`. There is no
   flattened-mousetrap emoji, and a `glyphRearming` would be a field every other tower leaves empty.
   The rearming state is a *treatment* over the one glyph. → C.

4. **`TowerDestroyed` → `towerDestroyed`.** Every other member of `GameEvent` is a camelCase kind
   (`towerPlaced`, `towerSold`). → A.

5. **"Towers in `rearming` are skipped by targeting entirely"** is a Mousetrap sentence. The generic
   rule is `charges > 0`, shared by `targetingSystem` and `combatSystem` through one exported
   predicate; for a one-charge tower the two sentences are the same. A three-charge tower with a
   rearm running keeps firing, which is what step 17's Fly Paper needs. → A.

6. **`core/types.ts` says step 10 "adds to the union"** on `TowerState`. It does not — the union
   stays one member. The comment is fixed in A.

7. **`ui/locales/contentKeys.ts` predicts "step 10 adds a ninth reason for barricades"** to
   `PlacementRejection`. It does not: `canPlace` has answered `path_only` since step 3A and
   `offTrack` has had an English line since 8A. The comment is fixed in B, which is the part that
   puts a `path_only` tower in the shop.

8. **The Mousetrap's rate and its rearm are the same interval, written twice.**
   `../../analytic-docs/CONTENT.md` §1 gives 0.15/sec and §1's behaviour note gives 6.6s. Two different
   tick counts means one of them is dead machinery; A authors **one** number, 396, for both
   `cooldownTicks` and `rearmTicks`. `round2(60 / 396)` is 0.15, so the card still shows the doc's
   rate. → A.

9. **The Cookie Jar penalty is unreachable in play in v1.** Nothing damages a Cookie Jar: the only
   thing in the game that damages a tower after step 10 is an enemy chewing a barricade, and step 13
   is what makes the noise meter a second cause. So it ships as a *tested rail* — asserted by calling
   `destroyTower` directly — and C does not try to judge it by playing. → A.

10. **"an immediate wave-strength boost **or** a burst of extra spawns"** — A picks the burst,
    delivered as extra `WaveSpawn` cursors on the running wave so it reuses the spawn machinery
    whole, and writes the rule into `../../analytic-docs/DECISIONS.md` §4 as the step asks.

11. **`meleeDamage` has no column in `../../analytic-docs/CONTENT.md` §2.** The step's `hp / 10` per
    second is the only authority, so B authors it as `meleeDamagePerTick` — the unit every other
    rate field in the codebase carries — and C tunes it. If the number moves off `hp / 10`, §2 gains
    the column in the same commit.

12. **Step 9C was mid-flight while this split was being written** and landed before it was committed,
    so every part below is written against the repo at `acde88b` — the status treatments and the
    frame pool in `render/layers/entities.ts`, `drawRangeCone`, the `reach` union on `OverlayView`,
    and `statsFor`'s cone branch. 10C edits all four of those files again. If a pre-flight finds them
    other than as described, that is drift to reconcile and not a misreading.
