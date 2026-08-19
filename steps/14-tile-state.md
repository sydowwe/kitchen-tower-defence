# Step 14 — Tile state system

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, `../analytic-docs/DECISIONS.md` §10 (the standing rule about tiles).
**Prereq:** step 13.

## Goal

One place where the board itself holds state. Nothing in Act II works without it, and — as the original roadmap warned — retrofitting this into a finished game is genuinely painful. Build it now, build it general, and accept that it looks over-engineered for the two things that use it this step.

## Build

1. **The model** (`core/systems/tiles.ts`). A parallel grid, `cols × rows`, each cell holding a small set of typed states rather than a single enum — tiles routinely carry more than one at once (slimed *and* on fire):

   ```
   TileState = {
     heat?:      { intensity, expiresAtTick, damageType, sourceId }
     slime?:     { intensity, expiresAtTick }
     mold?:      { stage, permanent: true }
     chemical?:  { intensity, expiresAtTick, statusApplied }
     scorch?:    { permanent: true }        // cosmetic
     consumable?:{ usesRemaining }          // Diatomaceous Earth, post-v1
   }
   ```

   Use a flat array indexed `y * cols + x`, not a 2D array of objects, and only allocate a state object for cells that have one — most cells are empty on most nights.

2. **The API.** Everything that touches a tile goes through this, per `../analytic-docs/DECISIONS.md` §10:
   `getTile`, `setState`, `clearState`, `hasState`, `forEachTileWithState(type, fn)`, `neighbours(index, includeDiagonals)`.

3. **The tick.** Expire timed states, advance staged states (mold), decrement consumables. Iterate only an **active set** of dirty indices — never sweep all 336 cells every tick, because Act III adds far more tile writers than v1 has.

4. **Enemy interaction** (`core/systems/movement.ts` reads tile state):
   - The tile under an enemy is `worldToTile(samplePath(...))`.
   - `heat` deals damage per second of its type through `resolveDamage`.
   - `slime` multiplies speed (a *buff* to the enemy — this is the Slug's gift to everything behind it).
   - `chemical` applies its status on contact.
   - `mold` blocks tower placement but does not affect movement.
   - **Flying enemies ignore every tile state.** One check, in one place.

5. **Tower interaction.** Towers on a molded tile cannot be placed; existing towers on a tile that becomes molded are **not** destroyed (they're just stranded — deciding otherwise makes mold far too punishing).

6. **Rendering** (`render/layers/tileEffects.ts`). Drawn between terrain and crumbs. Heat as a warm animated glow, slime as a glossy wet sheen, mold as creeping fuzzy patches with visible stage progression, chemical as a faint coloured mist. Batch by state type to keep the draw-call count down, and cache anything static (mold, scorch) into the terrain layer, redrawing only when it changes.

7. **Proof of the system**, so it isn't dead code this step: implement **scorch** as a purely cosmetic permanent mark left by fire damage, and add a dev tool in the debug overlay to paint arbitrary tile states for testing.

## Tests

- A state with `expiresAtTick` is gone on exactly that tick, not one before or after.
- Two states coexist on one tile and both apply — an enemy on a slimed, heated tile moves fast *and* burns.
- A flyer crossing a heated tile takes zero damage.
- Only dirty cells are visited: assert the per-tick visit count equals the number of cells with state, not the grid size.
- Clearing the last state on a cell releases its object rather than leaving an empty shell.

## Acceptance

- [ ] Painting heat, slime and mold from the debug tool produces the right visuals and the right enemy behaviour.
- [ ] With no tile states active, the tile system costs effectively nothing per tick — measure it.
- [ ] The API is general enough that step 15's mold and step 17's burner are pure consumers, adding no new grid code.

## Do not

Add mold, slime, or the burner themselves. This step is the substrate only.
