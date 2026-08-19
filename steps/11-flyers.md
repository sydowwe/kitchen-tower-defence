# Step 11 — Flyers, light attraction, detection

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, `../analytic-docs/CONTENT.md` §1–2.
**Prereq:** step 10.

## Goal

Enemies that ignore half your defences, and the first towers that answer them. This is where the game stops being one-dimensional — and it retroactively fixes the fruit fly problem you created in step 7.

## Build

1. **Flying enemies.** The `air` tag already exists and targeting filters already read it, so the mechanical work is small — verify it end to end:
   - Ground-only towers must never target `air`, and the reverse for air-only towers.
   - Flyers ignore barricades entirely (step 10 handled this).
   - Flyers ignore tile effects when those arrive in step 14 — add the check now while you're thinking about it.
   - Air enemies render with a small shadow beneath and a slight vertical bob so their layer is obvious without reading the tag.

2. **Enemies**: **Fly** (night 8, 14 HP, speed 2.2) and **Moth** (night 10, 25 HP, speed 1.6, `light-drawn`).

3. **Light attraction** — the one enemy in v1 that leaves the polyline.
   - Maintain a registry of active light sources: any tower with a `light` behaviour (Nightlight, and Candle in step 17), each with a radius.
   - A `light-drawn` enemy within 5 tiles of a light source deviates toward it. **Implement this as a lateral offset from the sampled path point**, interpolated toward the light and decaying back to 0 when out of range — *not* as free movement off the path. The enemy's `distance` continues to advance normally the whole time. This keeps every distance-based system (targeting, barricades, pushback) working unchanged, and it's the difference between a two-hour feature and a two-day one.
   - Cap the offset at ~3 tiles so a moth never ends up somewhere visually absurd.

4. **Towers**:
   - **Toaster** (140, 35 damage, 0.3/sec, range 4, fire, **air only**, noise 3). Launches upward. Unlocks the same night flies arrive.
   - **Nightlight** (100, no damage, radius 4, noise 0). Two jobs: it's a light source that pulls moths into its radius, and it **reveals hidden enemies** — build the `hidden` / `revealed` flag plumbing now (the Booklouse in Act III is its real customer) and make `targetable` in step 6's targeting respect it.

5. **The fruit fly payoff.** From night 8 the player finally has an answer to the flies that step 7's rot mechanic has been generating. Make sure a single Toaster meaningfully cleans up a fly problem — if it doesn't, the rot punishment is overtuned or the Toaster is undertuned. Tune here, while both are fresh.

6. **Wave authoring**: nights 8–10 in `nights.ts`. Night 8 should introduce flies in a way that *punishes* an all-ground build — a wave that is nothing but flies, arriving while ground pressure continues.

7. **HUD**: shop stat cards must show `Targets: ground / air / both` prominently. This is the information a player most needs before buying, and it's the easiest to bury.

## Tests

- A ground-only tower with a flyer in range fires zero times over 600 ticks.
- A moth entering a Nightlight's radius reaches a non-zero lateral offset, and returns to 0 within 2s of leaving.
- A moth's `distance` advances at its normal rate throughout the deviation — assert this explicitly.
- A hidden enemy is skipped by `targetable` until a Nightlight covers it, then becomes targetable in the same tick.
- Offset is clamped to the configured maximum.

## Acceptance

- [ ] Night 8 is genuinely lost by a player who built only Salt Shakers, and won by one who adds two Toasters.
- [ ] Moths visibly curve toward a Nightlight, and a Nightlight surrounded by Toasters is an obviously good idea.
- [ ] Flyers read as flying at a glance, with no need to check a tooltip.

## Do not

Build auras, the Candle, or the noise meter. Nightlight is the only light source this step.
