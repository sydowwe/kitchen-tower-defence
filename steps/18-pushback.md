# Step 18 — Pushback

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, `../analytic-docs/DECISIONS.md` §3 (why Mint Pot became pushback).
**Prereq:** step 17.

## Goal

Move enemies *backwards* along the track. Small system, one v1 tower — but it's the redesign that saved Mint Pot from the fixed-path decision, and building it now means Mint Pot arrives post-v1 as pure config.

## Build

1. **`pushback` behaviour.** `distance -= pushDistance`, clamped to 0. Config: `pushDistance` (tiles), `rate`, `targets`, and an optional `applies` status list so a T3 upgrade can bolt `Marked` on.

   Handle these, all of which are real and all of which will otherwise produce a bug report from yourself in three weeks:
   - **Clamp at 0.** An enemy pushed to the spawn point stays at 0 and keeps trying to advance. It does not despawn and does not go negative.
   - **Barricades.** An enemy pushed backwards *past* a barricade it was previously blocked by must be re-evaluated against it, and should be blocked again when it returns.
   - **Bosses and stationary enemies** carry a `pushImmune` flag. Mold is stationary and must never be pushed.
   - **Diminishing returns.** Track `pushbackResistance` per enemy, rising with each push and decaying over ~4s. Without this, two Fans lock a lane permanently and the tower becomes the only strategy. Cap effective pushback at ~35% of nominal after four pushes in quick succession.
   - **Tile state re-entry.** An enemy pushed back onto a heated tile takes damage again — that's correct and it's a genuine combo. An enemy pushed back onto a slimed tile speeds up again — also correct, and a real reason not to push over a slug trail.

2. **Fan** (170, 1 damage, 1.5/sec, cone 4 tiles, **air only**, noise 1). Pushes flyers 1.2 tiles per hit. Unlocks night 18, the v1 finale, alongside the heatwave modifier. Against a fly wave a well-placed Fan should feel like holding a door shut.
   T3: pushback also applies `Marked` (+25% damage taken), turning the Fan from control into a damage amplifier for whatever is shooting into the same cone.

3. **Post-v1 readiness.** Add **Mint Pot** to `towers.ts` as a complete, schema-valid, ground-targeted pushback tower with `unlockNight: 21` — locked and unreachable in v1, but proving the behaviour is genuinely general. Do not build any UI for it.

4. **Rendering.** Pushback needs to read instantly or it looks like a bug: a visible gust cone on each pulse, enemies sliding backwards with motion blur or a trail, and a brief stagger before they resume. Pushed enemies should look shoved, not teleported.

## Tests

- An enemy at `distance = 5` pushed 1.2 lands at exactly 3.8; one at 0.5 lands at 0 and stays there.
- A `pushImmune` enemy and a mold entity are unaffected.
- Pushback resistance rises with repeated pushes and decays back to zero after ~4s of no pushes.
- An enemy pushed back past a barricade is blocked by it again on its return.
- An enemy pushed back onto a heated tile takes damage on re-entry.
- Two Fans covering the same lane do **not** produce a permanent lock — assert net forward progress over 600 ticks.

## Acceptance

- [ ] A Fan on a flyer lane visibly buys time and feels good to place.
- [ ] Fan spam does not trivialise night 18 — the resistance curve is doing its job.
- [ ] Mint Pot exists in the data and validates, without a single system file mentioning it by name.

## Do not

Build ground pushback UI, unlock Mint Pot, or add knockback to any other tower. One system, one shipped tower.
