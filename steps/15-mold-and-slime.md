# Step 15 — Mold and slime — enemies that rewrite the board

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, `../analytic-docs/CONTENT.md` §2–3 (note the `fungal` and `slime` matrix rows), step 14's tile API.
**Prereq:** step 14.

## Goal

The first two enemies that don't play by the "walk to the fridge" rule. Mold doesn't walk at all; the Slug makes everything behind it faster. Both are pure consumers of step 14's tile system — if either needs new grid code, step 14 was under-built.

## Build

1. **Mold** (night 11, 40 HP, `ground, spreads, fungal`).
   - Spawns on a track tile and **never moves**. It cannot reach the fridge and cannot steal.
   - Every `spreadIntervalTicks` (base 6s, ×1.5 on the "damp night" modifier, ×0.6 with the Pantry Shelf Liner installation), it writes `mold` to one random adjacent tile that doesn't have it, preferring track tiles.
   - Each molded tile is **permanent for the night** and blocks tower placement. Mold wins by eating your board space.
   - Killing the mold entity stops the spread but does **not** clean existing tiles — only Vinegar does, and only Bleach (post-v1) removes it permanently.
   - Check the matrix: `fungal` takes **0.2× physical** and **2.5× chemical**. A player who has only built salt shakers should find mold almost immovable, and that lesson should arrive the same night Vinegar unlocks.

2. **Vinegar Spray** (145, 4 impact + 4/s poison, 1.0/sec, range 3, chemical, both). Additionally **cleans one `mold` tile per shot** within range, prioritising the tile nearest the fridge. Make the cleaning visible — a tile going from fuzzy green back to clean counter is the tower's whole appeal.

3. **Slug** (night 15, 45 HP, speed 0.4, `ground, slime, soft`).
   - Writes `slime` to every tile it crosses, intensity 1.0, expiring after 8s.
   - Slimed tiles multiply enemy speed by **1.6×**. The Slug is slow and tanky and its purpose is to be a road for the wave behind it — the danger is never the slug.
   - `soft` takes 2.0× chemical and 0.5× cold — freezing a slug is a mistake, and it should be a *legible* mistake.

4. **Baking Soda** (80, 6 damage, 0.6/sec, range 2, chemical, ground, AoE). Additionally **clears `slime`** from every tile in its radius on each shot. Cheap, unglamorous, and the correct answer to night 15.

5. **Wave authoring**: nights 11–12 and 15. Night 11 should present mold in a spot where ignoring it visibly costs build space by the end of the night. Night 15's "after a dinner party" modifier (double crumbs, double spawns) plus slug trails should be the most chaotic night in v1.

6. **Rendering.** Mold spread must be legible turn by turn — stage the visual across 3 steps so the player can see it advancing and choose whether to care. Slime trails need a wet gloss and a clear expiry fade, so "the trail is gone now" is visible information.

## Tests

- Mold spreads to exactly one adjacent tile per interval and never to an already-molded tile.
- Mold spread is deterministic under a fixed seed.
- Killing a mold entity stops spread; existing molded tiles persist.
- A molded tile rejects tower placement; a tower already there survives.
- Physical damage against mold is 0.2×; chemical is 2.5× — assert through the full projectile path.
- An enemy on a slimed tile moves at exactly 1.6× base speed; the tile expires at exactly 8s and speed returns to base.
- Baking Soda clears every slimed tile in radius in one shot; Vinegar cleans exactly one mold tile per shot.

## Acceptance

- [ ] Ignoring mold on night 11 costs you a visible chunk of the board by the final wave.
- [ ] A slug leading a roach wave is dramatically more dangerous than the same roaches alone.
- [ ] Neither enemy required a change to `core/systems/tiles.ts`.

## Do not

Add Bleach (Act III) or any other tile-writing tower. Two enemies, two answers.
