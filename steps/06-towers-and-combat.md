# Step 6 — Tower placement, targeting, projectiles, damage

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, `../analytic-docs/ARCHITECTURE.md` §4, §6, `../analytic-docs/CONTENT.md` §1, §3, §5.
**Prereq:** step 5.

## Goal

The salt shaker kills ants. This is the heart of the game and every combat tower for the rest of the project is a variation on what you build here — so build it as a general system, not as a salt shaker.

## Build

1. **Placement** (`core/systems/placement.ts`, driven by the `PlaceTower` command).
   - Validity: tile in bounds, not `BLOCKED`, unoccupied, satisfies the def's `placement` flag (`off_path` / `path_only` / `edge_only`), and affordable.
   - Deduct cost, record `totalInvested`.
   - `SellTower` refunds 70% of `totalInvested`, or 50% if a wave is currently in progress (`../analytic-docs/DECISIONS.md` §5).
   - Return a typed rejection reason on failure so the UI can explain itself.

2. **Range queries** (`core/systems/spatial.ts`). Start naive — iterate all enemies, compare squared distance. Wrap it behind `queryEnemiesInRange(world, center, radius, filter)` so a uniform-grid spatial hash can be dropped in later without touching a single caller. Do not build the hash yet.

3. **Targeting** (`core/systems/targeting.ts`). All six modes from `../analytic-docs/CONTENT.md` §5. Filters: `ground` / `air` / `both`, plus a `targetable` predicate (step 16's burrowing and step 11's hidden enemies will hook in here — leave the seam).

   **`FIRST` and `LAST` compare `remainingToFridge`, not raw `distance`.** On multi-path maps, raw distance makes towers prefer whichever lane is longer, which is a subtle and infuriating bug to find later.

4. **Attack behaviour** (`core/systems/combat.ts`). Consume the `attack` behaviour descriptor from step 2. Cooldown in ticks, derived from `rate`. On fire: pick a target, spawn a projectile, emit a `TowerFired` event carrying the tower's `noise` value (step 13 consumes it — emit it now, ignore it now).

5. **Projectiles** (`core/systems/projectiles.ts`). Object-pooled. Travel toward the target's *current* position each tick (homing — simplest and reads well at this scale). On arrival, apply damage via `resolveDamage` from step 2 and despawn. Add a `pierce` field, default 1, since several later towers want it.

6. **Death** (`core/systems/resolve.ts`). HP ≤ 0 → emit `EnemyKilled` with position, def, and reward, then remove. Step 7 turns that event into a crumb.

7. **Content**: add **Toaster Crumb Tray** and **Cookie Jar** as `income` behaviour towers (flat crumbs per second, `../analytic-docs/CONTENT.md` §1). Cookie Jar's "drops 200 crumbs to the enemy side if destroyed" needs tower HP, which arrives in step 10 — leave a `TODO` referencing step 10, don't half-build it.

8. **Rendering.** Towers as glyphs on their tile. Range circle for the hovered or selected tower. Projectiles as small glyphs or dots. A brief hit flash and a damage-number popup on each hit — cheap now, and it's most of what makes the game feel responsive at step 8.

9. **Dev controls**: number keys select a tower type, click places, click a placed tower to select, `x` sells.

## Tests

- `resolveDamage` is actually being called with the enemy's tags — assert an ant takes 1.5× from a chemical source through the full projectile path, not just in isolation.
- A tower with `rate: 1.0` fires exactly 60 ticks apart, with no drift over 600 ticks.
- Targeting: with three enemies at different path distances, `FIRST` picks the one closest to the fridge and `LAST` the furthest; on a two-path map, `FIRST` compares remaining distance correctly.
- Selling mid-wave refunds 50%, selling between waves 70%.
- Placement rejects: occupied tile, blocked tile, `off_path` tower on a track tile, `path_only` tower off-track, insufficient crumbs.

## Acceptance

- [ ] Four salt shakers placed along the Counter track clear wave 1 of night 1 without a leak.
- [ ] Range circles, hit flashes, and damage numbers all read clearly at 3× speed.
- [ ] Adding a second DPS tower to `towers.ts` requires **zero** changes to any system file. If it doesn't, the behaviour composition is wrong — fix it now, not in step 9.

## Do not

Build status effects, cones, auras, or upgrades. One behaviour (`attack`) plus `income`, done properly.
