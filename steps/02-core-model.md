# Step 2 — Core data model and content pipeline

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, `../analytic-docs/ARCHITECTURE.md` §3–4, `../analytic-docs/CONTENT.md` §1, §3, §4.
**Prereq:** step 1.

## Goal

The shape of the entire game, with one tower and one enemy as proof. Nothing moves yet. Get this right and the next fifteen steps are mostly filling in config.

## Build

1. **`core/rng.ts`** — mulberry32. `createRng(seed)` returning `{ next(): number, int(max): number, pick<T>(arr): T, chance(p): boolean, fork(): Rng }`. Serialisable state so a world can be snapshotted.

2. **`core/types.ts`** — the entity model. Plain objects, no classes, no methods:
   - `Enemy`: `id, defId, pathId, distance, hp, maxHp, statuses[], tags[], speed, stolenItems[], flags`
   - `Tower`: `id, defId, tile, hp, maxHp, tier, targetingMode, cooldown, state (for charge machines), totalInvested`
   - `Projectile`, `Crumb`, `TileState`, `FoodItem`, `Wave`, `NightState`
   - `World`: entities in arrays plus an `id → index` map, `tick`, `rng`, `crumbs`, `groceryMoney`, `noise`, `map`, `night`, `difficulty`, `events[]`

   `World` must be a plain serialisable object. No functions stored on it.

3. **`core/commands.ts`** — a discriminated union of player intents: `PlaceTower`, `SellTower`, `UpgradeTower`, `SetTargetingMode`, `CollectCrumb`, `CallWaveEarly`, `SetSpeed`. Plus a queue with `enqueue`/`drain`. **The UI's only write path.**

4. **`core/sim.ts`** — `tick(world, commands)`. Drains commands, then runs systems in a **fixed, documented order**. Write the order out as a comment now, since ordering bugs here are miserable later:
   `commands → spawn → status → movement → targeting → combat → projectiles → tiles → crumbs → noise → economy → resolve (deaths, leaks, win/lose) → events`
   Stub every system as a no-op function in `core/systems/` with the right signature.

5. **`core/content/schema.ts`** — zod schemas for `TowerDef`, `EnemyDef`, `MapDef`, `NightDef`, `StatusDef`, `InstallationDef`. Validate all content at module load in dev; throw loudly with the offending id.

6. **Behaviour composition** (`core/content/behaviours.ts`). Define the vocabulary from `../analytic-docs/ARCHITECTURE.md` §4 as typed factory functions returning discriminated-union behaviour descriptors — **data, not closures**, so towers stay serialisable and testable. Implement only `attack` now; the rest are typed stubs.

7. **`core/content/matrix.ts`** — the full damage-type × tag table from `../analytic-docs/CONTENT.md` §3, and `resolveDamage(base, damageType, enemy): number` applying **multiplicative** tag stacking then status modifiers. Pure function.

8. **`core/content/statuses.ts`** — all seven effects from `../analytic-docs/CONTENT.md` §4 with their stacking rules, plus `applyStatus`, `tickStatuses`, `speedMultiplier(enemy)`, `damageTakenMultiplier(enemy)`.

9. **Content**: `towers.ts` with **Salt Shaker only**, `enemies.ts` with **Ant only**, both full and schema-valid.

10. **`core/world.ts`** — `createWorld({ seed, mapId, nightId, difficulty })`.

## Tests (these matter — write them properly)

- RNG: same seed → identical 1000-number sequence; `fork()` doesn't disturb the parent.
- Damage matrix: a swarm+bug ant takes 1.5× chemical; a hypothetical armored+slime enemy takes `0.4 × 1.0` physical and `1.0 × 1.5` chemical — **assert the multiplication explicitly**, it's the thing most likely to silently become an average or a max later.
- Statuses: burn stacks to exactly 3 and no further; slow refreshes rather than stacking; freeze suppresses slow re-application; armor strip moves `armored` physical from 0.4 to 0.7.
- Commands: enqueued during a tick are drained at the *next* tick boundary, never mid-tick.

## Acceptance

- [ ] `createWorld()` returns a fully-typed world that survives `JSON.parse(JSON.stringify(w))` unchanged.
- [ ] All content validates at boot; a deliberately broken tower def throws with its id in the message.
- [ ] Tests pass. The game still shows step 1's bouncing emoji — nothing visual changed.

## Do not

Implement movement, rendering of entities, or any system beyond stubs. This step is types, data, and pure functions.
