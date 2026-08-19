# Step 5 — Waves, spawning, movement, food loss

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, `../analytic-docs/DECISIONS.md` §5–6, `../analytic-docs/CONTENT.md` §2, §6, §7.
**Prereq:** step 4.

## Goal

Ants march from the crack to the fridge and steal your food. No defences yet — this is the loop you're about to defend against.

## Build

1. **Night and wave definitions** (`core/content/nights.ts`). A night is:
   ```
   { id, mapId, waveCount, modifier?, unlocks: { towers[], enemies[] },
     waves: [ { entries: [{ enemyId, count, spacingTicks, startDelayTicks, pathId? }] } ] }
   ```
   Author nights 1–3 only. Difficulty scalars are applied at runtime by the spawn system, **never baked into the data**.

2. **Spawn system** (`core/systems/spawn.ts`). Walks the active wave's entries, spawning on schedule. When a wave has no entries left and no enemies from it remain alive, mark the wave complete. If `pathId` is omitted, distribute enemies across the map's paths round-robin.

3. **Wave flow** (`core/systems/wave.ts`), per `../analytic-docs/DECISIONS.md` §5:
   - After a wave's last enemy *spawns*, start an `interWaveCountdown` (default 12s).
   - The `CallWaveEarly` command starts the next wave immediately and grants **2 crumbs per second skipped** (`../analytic-docs/CONTENT.md` §8 uses the same accumulator for the end-of-night bonus, so track `secondsSkippedTotal` on the night state).
   - The clock display is `2:00am + (waveIndex / waveCount) × 4 hours`. It is a *derived value*, not a timer — do not give it its own state.
   - Waves may overlap: calling early while the previous wave is still on the board is legal and is the main tempo decision in the game.

4. **Movement system** (`core/systems/movement.ts`). For each enemy: `distance += speed × speedMultiplier(enemy) × TICK`, position from `samplePath`. Nothing else — no steering, no collision, no separation. Enemies overlap freely and that's correct for this genre.

5. **Food and leaks** (`core/systems/resolve.ts`).
   - At night start, draw `18 + floor(nightIndex/3)` named items (`../analytic-docs/CONTENT.md` §7) from the pool into `world.fridge.items`, scaled by difficulty.
   - An enemy reaching `totalLength` removes `steals` items **by name**, emits a `FoodStolen` event naming them, and is removed.
   - Fridge empty → `NightLost`. All waves complete and no enemies alive → `NightWon`.
   - Both emit events; nothing in `core/` handles presentation.

6. **Rendering.** Draw enemies as glyphs, facing along the path angle, with a small HP bar above any enemy below full health. Draw the fridge with its remaining items visible as a little shelf of glyphs — this is the health bar and it must be legible at a glance. Animate an item flying off the shelf on theft.

7. **Temporary dev controls** until step 8 exists: keyboard `n` calls the next wave, `r` restarts the night, on-screen text for wave number, clock, and food count.

## Tests

- A wave with `{count: 10, spacingTicks: 30}` spawns exactly 10 enemies at exactly 30-tick intervals.
- An ant with `speed: 1.0` covers exactly 1 tile of arc length per 60 ticks.
- Difficulty scalars change spawned counts and HP but never mutate the night definition object.
- Fridge with 3 items, hit by an enemy with `steals: 5`, ends at 0 and emits `NightLost` in the same tick.
- Calling a wave early with 7s remaining awards exactly 14 crumbs.

## Acceptance

- [ ] Night 1 plays out unattended: six waves of ants walk the Counter, eat all your food, and you lose.
- [ ] The clock reads 2:00am on wave 1 and 6:00am on the final wave.
- [ ] Same seed, same result, every time — run it twice and diff the event log.

## Do not

Build towers, targeting, or crumbs. Enemies are invincible this step.
