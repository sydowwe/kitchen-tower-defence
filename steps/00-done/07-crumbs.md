# Step 7 — Crumb economy

> This step is three sessions. Paste **one part file** into a fresh session, in order, and `/clear`
> between them. Do not paste this index — it exists to say what the parts are and how they fit.

**Prereq:** step 6.

## Goal

Mess is money, and money left lying around is a liability. Killing things litters the board; you
collect the litter by clicking it or by having built economy towers near where the killing happens;
litter you ignore rots and hatches flies. This is the game's signature mechanic
(`../../analytic-docs/DECISIONS.md` §4) and the whole risk is that it quietly collapses into "gold on
kill" — which is what the split below is arranged to prevent, by giving the rot half its own session
rather than making it the last item of a long one.

## Parts

Each part names its own `Read first:` sections, so a session only loads the docs it needs.

| Part | Session | Builds |
| --- | --- | --- |
| [A](07-crumbs/A-crumbs-and-collection.md) | Piles, merging, collection, income | `core/systems/crumbs.ts`, `economy.ts`, `commands.ts`, `resolve.ts`, `core/content/towers.ts` |
| [B](07-crumbs/B-rot-and-flies.md) | Rot, and the Fruit Fly that hatches from it | `core/path.ts`, `core/systems/spawn.ts`, the rot half of `crumbs.ts`, `core/content/enemies.ts` |
| [C](07-crumbs/C-crumbs-on-screen.md) | Crumbs, the click, the pop and the `+N` | `render/layers/crumbs.ts`, `effects.ts`, `dev/placement.ts`, `dev/nightHud.ts` |

Strictly in order. B ages what A creates; C draws what both produce and gives you a mouse to sweep
with.

**A and B both carry tests; C carries none.** A owns the merge, credit and ledger assertions, B owns
the rot-timing, hatch and path-projection assertions, and C is pixels —
`../../analytic-docs/ARCHITECTURE.md` §7, and vitest runs `environment: 'node'` so nothing in C is
reachable from a spec anyway. A part with no tests is not an under-tested part; do not invent
coverage for C.

Two things are **authored twice on purpose**, and both parts say so: A picks `collect(...)` radii and
a travel time from the doc with nothing on screen to judge them by, and C re-tunes the *feel* numbers
(hit-test forgiveness, the pop, the `+N` lifetime) after watching a night. The crumb glyph bands do
not exist until C — `core/` carries no glyph for a thing that has no def, so the band table is
written once, in the renderer.

## The seam that can't be split

**Every crumb leaves the board through exactly one of two doors — credited (A) or rotted away (B) —
and `night.crumbsDropped` counts every one that was ever created.** A owns the crumb's whole life
(created, merged, claimed, credited, removed) plus both counters; B adds two age thresholds and what
happens at the second one. Move the line — collection into B, or the hatch into A — and the ledger
gets written twice by two sessions and disagrees with itself. That ledger is the assertion that
catches double-credit, and it is what step 20's cleanliness score is computed from.

## Step acceptance

- [ ] Playing night 3 while ignoring the board floor produces visible fly problems by wave 6.
- [ ] A Crumb Tray placed in a kill zone measurably out-earns one placed in a corner. If it doesn't,
      the `collect` radius or the income rate is wrong.
- [ ] Collecting a big pile feels good.
- [ ] Night 1 played carelessly generates two or three fruit flies, not ten
      (`../../analytic-docs/OPEN-QUESTIONS.md`, *the fruit fly gap*). More than that and the rot
      timings or night 1's rewards are wrong.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Add the noise meter (step 13), tile state (step 14), the Vue HUD (step 8), or any new tower. Fruit
flies get no special AI beyond joining a path — the shadow-and-bob flyer rendering and everything
that can shoot them belong to step 11.

## Reconciled while splitting

Four things this step said that the repo has since made untrue. Each is fixed in the part that owns
it; they are listed here so the change is on the record rather than silently reinterpreted.

1. **"Towers with `collectRadius > 0`"** — there is no such field. `collect({ radiusTiles,
   travelTicks })` has been a member of the behaviour vocabulary since step 2B, and
   `ARCHITECTURE.md` §4's illustrative snippet showing `collectRadius: 0` on the tower object is
   older than the code. A adds the behaviour to the two economy towers; no new field.
2. **"a crumb becomes `collecting`"** — the shipped `Crumb` says it with
   `claimedByTowerId !== null` and `travelTicksRemaining`. No state string, no new field.
3. **Rot "raises a local `spawnPressure` value on its tile"** contradicts this step's own `Do not`,
   which forbids tile state. Nothing in v1 reads spawn pressure: the only consumer of rot is the 35s
   hatch. B builds the two thresholds and no tile writes; if a later step wants pressure as a tile
   effect, step 14 owns the substrate that would carry it.
4. **"`value = enemy.reward`"** — `difficulty.crumbIncomeMult` exists on the world, is what
   `CONTENT.md` §9 prices the tiers with, and step 7 is the first step with any income to apply it
   to. A applies it at drop and at payout, and says where.
