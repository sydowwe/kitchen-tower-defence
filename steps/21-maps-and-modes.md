# Step 21 — Maps, night modifiers, difficulty tiers, endless

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, `../analytic-docs/CONTENT.md` §6, §9, and the step 4 map editor.
**Prereq:** step 20.

## Goal

Turn one map into eighteen distinct nights. Five new maps in the editor you built at step 4, a modifier system so each map plays three different ways, three difficulty tiers, and an endless mode.

## Build

1. **Five maps** in the editor: **Sink, Pantry, Stove, Table, Floor**. Give each a genuinely different shape rather than a reskin:
   - **Sink** — a long looping track around a basin, with a wet central region that's unbuildable. Rewards range.
   - **Pantry** — narrow, corridor-like, very few buildable pockets. Punishes wide towers, rewards cones and auras.
   - **Stove** — a short, fast track with a large open build area. High pressure, high freedom. Introduces the **second spawn point** (night 10+).
   - **Table** — wide open, long track, plenty of space. The most conventional, and the right place for the Mouse.
   - **Floor** — sprawling, two or three entry cracks, longest track in the game. Introduces the **third spawn point** (night 16+).

   Multi-path maps must **merge into a shared final stretch** before the fridge (`../analytic-docs/DECISIONS.md` §3). Use the editor's convergence readout to confirm it.

2. **Night modifiers** (`core/content/modifiers.ts`). A modifier is a named patch applied at night start, and it must be a *general* system — this is your content lever for every future update:
   - `dishes left out` (night 6) — 15 crumbs pre-scattered along the track at night start. Free money that is also free spawn pressure.
   - `damp night` (11) — mold spread interval ×1.5.
   - `after a dinner party` (15) — spawn counts ×2, crumb values ×2. The chaos night.
   - `moving day` (16) — 30% of buildable tiles are covered by cardboard boxes at night start, chosen deterministically from the seed.
   - `heatwave` (18) — fire damage ×1.3, cold damage ×0.7.

   Each modifier declares which world/enemy/tower fields it patches; none of them may require a system-file edit. Surface the active modifier prominently on the kitchen screen and in a banner at night start — a modifier the player doesn't notice is wasted content.

3. **Difficulty tiers.** The scalars in `../analytic-docs/CONTENT.md` §9, applied at world creation and at spawn time. Global scalars only — no bespoke content per tier. Selected on the title screen, stored per-profile, shown in the HUD. Beating the campaign on one tier unlocks the next.

4. **Endless mode.** Unlocked by completing night 18. One map (player's choice from those beaten), waves generated procedurally from a difficulty curve that keeps rising:
   - Wave `n` draws from the unlocked enemy pool with weights shifting toward tougher enemies as `n` grows.
   - Enemy HP and count scale smoothly; income scales more slowly, so the run ends eventually. That's the point.
   - Score is waves survived; persist a per-map best in the save.
   - Reuse the night pipeline entirely — endless is a `NightDef` produced by a generator function, not a separate mode with its own code path. If it needs its own path, the night model is too rigid.

5. **Wire up nights 1–18 in full** per the `../analytic-docs/CONTENT.md` §6 table: map, wave count, unlocks, modifier. This is the first time the whole campaign exists as data.

   **Loadout constraint (step 20a):** every night must be winnable by **more than one loadout**. A night whose enemy mix admits exactly one valid answer is a lockout, not a puzzle. Design each night so at least two distinct counters exist — night 17's Silverfish, for instance, should fall to either a cold build or a Lemon-plus-physical build. Step 22's `blind` loadout policy is what verifies this.

## Tests

- Every authored map passes the editor's validation rules; every path terminates at the fridge.
- Multi-path maps have a shared final stretch of at least 6 tiles.
- Each modifier changes exactly the documented fields and nothing else — snapshot the world config before and after.
- `moving day`'s box placement is deterministic under a fixed seed.
- Difficulty scalars apply at spawn and never mutate the night definition.
- An endless run produces valid waves for at least 100 waves without a crash or a degenerate composition (e.g. all-flyers forever).

## Acceptance

- [ ] The six maps genuinely require different builds — a strategy that wins on Table should struggle in the Pantry.
- [ ] The three nights on each map feel distinct because of their modifier and wave composition.
- [ ] Nightmare is hard in a way that feels like a different game, not just a bigger HP bar. If it doesn't, the scalars need step 22's data.

## Do not

Add Act III content or new towers. Existing systems, new arrangements.
