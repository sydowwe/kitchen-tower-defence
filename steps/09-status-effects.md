# Step 9 — Status effects, cones and AoE

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, `../analytic-docs/CONTENT.md` §1 (Act I), §4.
**Prereq:** step 8, and you have actually played the milestone.

## Goal

Two reusable systems — **timed modifiers on an enemy** and **non-single-target hitboxes** — that between them turn most of the remaining forty-odd towers into config entries. Build them properly here; half the roster depends on them.

## Build

1. **Wire up the status system.** Step 2 defined the effects and their stacking rules as pure functions; nothing applies them yet. Add:
   - `statusEffects` to the tick order (already stubbed in `sim.ts`) — ticks durations, applies per-tick damage for Burn and Poison, expires effects.
   - A `applyStatus` behaviour modifier that any attack can carry: `attack({ ..., applies: [{ status: 'slow', duration: 2.0 }] })`.
   - Per-tick DoT damage must route through `resolveDamage` with the *source's* damage type, so a burn from a fire tower is still fire damage against the tag matrix. This is the single most commonly-botched detail in this system.

2. **Hitbox shapes** (`core/systems/hitbox.ts`). Three query functions sharing the step 6 range-query seam:
   - `circle(center, radius)` — AoE
   - `cone(origin, direction, radius, halfAngleDeg)` — the tower aims at its chosen target, then hits everything inside the cone. Default half-angle 30°.
   - `line(from, to, width)` — unused in v1, but cheap now and several Act III towers want it.

3. **New behaviours**: `coneAttack` and `aoeAttack`, both composed from `attack` plus a shape. A tower definition should be able to say "cone, 3 tiles, chemical, applies poison" in one object.

4. **Towers** (`../analytic-docs/CONTENT.md` §1):
   - **Spray Bottle** — 120, cone 3 tiles, 3 impact + 2/s poison, chemical, both targets. The first real crowd answer.
   - **Ice Cube Tray** — 110, 2 damage, cold, applies Slow. Note the matrix: cold is *weak* against soft enemies (0.5×) and slightly strong against armored (1.2×) — it is a control tower, not a DPS tower, and the numbers should make that obvious in play.
   - **Sticky Tape** — 40, no damage, applies `Rooted` to one enemy at a time. **3 charges**; each root consumes one when the rooted enemy dies or breaks free; the tape self-removes when spent. Add a generic `charges` field to the tower model now — Fly Paper (step 17) and Diatomaceous Earth (post-v1) both reuse it.

5. **Enemies**: add **Roach** (night 3, fast) and **Beetle** (night 5, bruiser) — pure config, no new behaviour. Author nights 4–7 in `nights.ts`.

6. **Rendering.** Status indicators on enemies must be readable at a glance and at 3× speed: a blue tint plus frost specks for Slow, orange flicker for Burn, green bubbles for Poison, a white shimmer for Rooted. Small icons stacked above the HP bar for anything ambiguous. Cone towers show their cone, not a circle, in the placement ghost and the range preview.

## Tests

- Burn from a fire source against a `fungal` enemy deals per-tick damage multiplied by 1.5 — proving DoT routes through the matrix.
- Applying Slow twice refreshes duration and does not double the magnitude.
- Freeze applied over Slow overrides it; Slow applied under Freeze does not re-apply.
- Poison stacks to exactly 5 and the 6th application only refreshes duration.
- A cone at 30° half-angle hits an enemy 25° off-axis and misses one at 35°.
- Rooted enemies do not advance `distance` at all.

## Acceptance

- [ ] One Spray Bottle covering a corner meaningfully changes how night 5 plays.
- [ ] Adding a hypothetical fourth status-applying tower is a pure config change.
- [ ] At 3× speed you can still tell which enemies are slowed and which are burning.

## Do not

Add auras (persistent radius effects with no firing) — those come in step 17. Cones and instant AoE only.
