# Step 6B — Range, targeting, combat, projectiles, death

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/CONTENT.md` §3 and §5,
`../../analytic-docs/ARCHITECTURE.md` §4 and §6.
**Prereq:** step 6A.

## Goal

The salt shaker kills ants, headless. Four systems that already have their slot in the tick order
stop being stubs: a range query, a target choice, a shot on a cooldown, and a projectile that lands
and resolves damage through the tag matrix. Nothing is drawn until 6C.

This part carries every combat test in the step. 6A carried the placement ones.

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/systems/targeting.ts`, `combat.ts`, `projectiles.ts` | one no-op export each, already wired into `SYSTEM_ORDER` in the slots `status → movement → targeting → combat → projectiles` |
| `core/systems/resolve.ts` | the leak loop, `takeFood`, `reindexEnemies`, the win/lose check. Runs **last**, returns early in terminal phases, and rebuilds `world.index.enemies` only when the array actually shrank |
| `core/content/matrix.ts` | `resolveDamage(base, damageType, target)` — the tag **product**, then the status multiplier. `DamageTarget` is the structural subset `{ tags, statuses }`, so nothing has to build a world to call it |
| `core/content/behaviours.ts` | `AttackBehaviour { damage, damageType, cooldownTicks, rangeTiles, targets, projectileSpeed, splashRadiusTiles }`, `TargetClass = 'ground' \| 'air' \| 'both'`, and `isAttack(b)` so no system hand-writes `b.kind === 'attack'` |
| `core/path.ts` | `samplePath(path, distance) → { x, y, angle }`, `totalLength(path)`, `remainingToFridge(path, distance)` — **along the track**, which is what §5 needs |
| `core/types.ts` | `Projectile` (`sourceTowerId, targetEnemyId, position, target, speed, damage, damageType, splashRadiusTiles` — **no `pierce`**), `Enemy.flags: Record<'hidden' \| 'untargetable' \| 'fleeing', boolean>`, `GameEvent` with **no `towerFired` and no `enemyDamaged`** |
| `core/content/towers.ts` | `saltShaker`'s `attack({ damage: 5, damageType: 'physical', cooldownTicks: perSecond(1.0), rangeTiles: 3, targets: 'ground' })` — **`projectileSpeed` defaults to 0**, see decision 1 |
| `core/rng.ts` | `bindRng(world.rng)` — a view over the world's generator, not a copy. `int(max)`, `pick(items)` |
| `tests/sim.spec.ts` | asserts `SYSTEM_ORDER` against a literal list, and "mutates nothing but `world.tick` while the night is over" |
| `tests/night.spec.ts` | "plays itself out with no input" asserts `enemyLeaked` count equals `food.length`. It places no towers, so it stays true — **do not add a tower to that spec** |
| 6A | `placeTower`, `canPlaceTower`, `towerAt`, and `Tower.targetEnemyId` already declared and initialised to `null` |

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **The Salt Shaker gets a projectile: `projectileSpeed` of 0.2 tiles per tick (12 tiles/sec).**
   `AttackBehaviour` documents `projectileSpeed: 0` as "the hit lands the same tick, with no
   `Projectile` entity at all", and the Salt Shaker is authored at 0 — so as the step was written,
   the projectile system would ship with no user. CONTENT.md §1 has no projectile-speed column, so
   this number is authored in `towers.ts` and asserted in `tests/content.spec.ts` alongside the
   others. **6C re-tunes it** after watching a shot cross the board; pick something structurally
   right and do not spend the session on it.
2. **Both paths stay real.** `projectileSpeed === 0` resolves the hit inside `combat.ts` on the same
   tick with no entity; `> 0` spawns one. Later towers want the instant version and the field
   already promises it.
3. **Range is measured in the space enemies already live in.** `samplePath` returns tile
   coordinates with integers on tile centres, and `Tower.tile` is the same space — so it is
   `hypot(at.x - tower.tile.x, at.y - tower.tile.y)` with **no `+ 0.5` anywhere in `core/`.** The
   `+ 0.5` in `render/layers/entities.ts` is a pixel-space convention and nothing else. Add it here
   and every tower's effective range shifts half a tile up and left: invisible on a range-3 circle,
   and it surfaces as "why did it not shoot that one".
4. **Compare squared distances** against `rangeTiles * rangeTiles`, behind
   `queryEnemiesInRange(world, center, radiusTiles, filter)` in `core/systems/spatial.ts`. It runs
   O(towers × enemies) every tick — 8k checks, which `ARCHITECTURE.md` §6 explicitly blesses — and
   the wrapper is what lets a uniform-grid hash drop in later without touching a caller. **Do not
   build the hash.**
5. **Targeting refreshes every tower's target every tick**, not only the ones off cooldown. The
   conditional version is an off-by-one waiting to happen: `targeting` runs *before* `combat`, so it
   would see last tick's cooldown value and skip the tower on exactly the tick it is about to fire.
   The unconditional version costs the 8k checks decision 4 already budgeted.
6. **Decrement the cooldown first, then fire, in the same tick.**
   `cooldownTicks = max(0, cooldownTicks - 1)`, then `if (cooldownTicks === 0 && target) { fire }`.
   Firing first and decrementing after gives a period of `cooldown + 1` — 61 ticks instead of 60, a
   silent 1.6% DPS loss that nothing but the no-drift test will ever notice.
7. **On fire, `cooldownTicks = attack.cooldownTicks`. Never `+=`.** A tower that sat with no target
   in range must not bank shots and then empty the bank when one walks in.
8. **`combat.ts` exports `dealDamage(world, enemy, base, damageType, sourceTowerId)`** and
   `projectiles.ts` imports it. It routes through `resolveDamage`, subtracts, emits `enemyDamaged`,
   and **never removes the enemy** — `resolveSystem` is the one place entities leave an array.
9. **`enemyKilled` does not gain a `reward` field.** The step's Build item said "position, def, and
   reward"; reward is `getEnemyDef(defId).reward`, and a second copy of a derived number is the one
   that drifts — the same reasoning `lengthTiles` and `nightClock` already follow. Step 7 looks it
   up.
10. **Two new `GameEvent` members:** `towerFired` carrying the tower's `noise` (step 13 consumes it;
    emit it now, ignore it now) and `enemyDamaged` carrying the **resolved** amount, the position
    (6C's damage numbers and hit flash) **and `sourceTowerId`**.

    That last field was added while building. `tsconfig` has `noUnusedParameters: true`, so decision
    8's `sourceTowerId` parameter does not compile unless something consumes it — and the event is
    where "who did it" belongs. Same shape as `towerFired.noise`: emitted now, consumed by a later
    step (7's crumb attribution, 10's tower kill credit).
11. **`pierce` goes on `Projectile` only**, default 1, decremented per hit, despawned at 0. It does
    **not** go on `AttackBehaviour`: that means editing `schema.ts` for a field no content sets, and
    step 12's Tier 3 upgrades own it. When a pierce survives a hit, **clear `targetEnemyId`** and let
    it fly on to `target` — a homing projectile that pierces re-hits the same enemy every tick.
12. **The projectile pool is a module-local free list in `projectiles.ts`, not on the world.**
    `world.projectiles` holds live ones only, or the array's length stops meaning anything and every
    replay carries dead entries. Every field is overwritten on acquire, so a pooled object carries
    nothing from its last life and determinism is untouched.
13. **One targetability predicate**, `isTargetable(enemy, targets)`, checking `flags.hidden`,
    `flags.untargetable` and the ground/air tag. Step 11's flyers and step 16's burrowing extend the
    predicate, not six call sites.
14. **`FIRST` and `LAST` compare `remainingToFridge(path, distance)`, never raw `distance`.** On a
    multi-path map raw distance makes a tower prefer whichever lane is longer.
15. **`RANDOM` draws through `bindRng(world.rng)`.** `Math.random` is lint-banned in `core/` and a
    replay has to reproduce which enemy was shot.
16. **All three systems return early in `'won'` and `'lost'`**, matching every other system and
    `tests/night.spec.ts`'s "runs no system once the night is over".

## Build

### 1. `core/systems/spatial.ts`

`queryEnemiesInRange(world, center, radiusTiles, filter)`. The filter is a predicate over `Enemy`,
so targeting passes `isTargetable` and later steps pass something narrower.

An enemy's position is `samplePath(path, enemy.distance)` and the path is
`world.map.paths.find(p => p.id === enemy.pathId)`. An enemy whose path is missing (a half-edited
map from the step 4 editor) is skipped, not thrown on.

### 2. `core/systems/targeting.ts`

`pickTarget(world, tower, attack): Enemy | null` plus the system that writes `tower.targetEnemyId`.

All six modes from `CONTENT.md` §5. `STRONGEST`/`WEAKEST` are max/min `hp`; `CLOSEST` is the
smallest squared distance to the tower; `RANDOM` is one `rng.int` over the in-range set.

Ties have to break deterministically — take the first match in `world.enemies` order and say so in a
comment. Iterating a `find`/`reduce` over an array is already stable; a `sort` is not, and the
symptom of an unstable one is a replay that diverges after ten minutes.

### 3. `core/systems/combat.ts`

Per tower: skip if it has no `attack` behaviour (`isAttack`), decrement, then fire at
`tower.targetEnemyId` if it is off cooldown. Nothing moves between `targeting` and `combat`, so
**do not re-run the range check** — and targeting refreshed the id this tick, so combat can never
read one pointing at an enemy `resolve` removed last tick.

On fire: push `towerFired` with `def.noise`, then either `dealDamage` (speed 0) or spawn a
projectile.

### 4. `core/systems/projectiles.ts`

Acquire from the pool, fill every field, push onto `world.projectiles`. Per tick: re-aim at the
target's *current* position if it is still alive, step `speed` tiles toward it, and resolve on
arrival.

- **Arrival is "within one tick's travel", not equality.** A projectile stepping 0.2 tiles per tick
  never lands exactly on a float position, and the symptom is projectiles orbiting an enemy for the
  rest of the night.
- **A projectile whose target died flies on to its last-known `target` and despawns there.**
  `Projectile.targetEnemyId` is already documented as nullable for exactly this. Without it the
  array only ever grows.
- **Release exactly once.** A double release puts one object in the free list twice, and the next two
  acquires hand out aliases of the same object — the symptom is two projectiles moving in perfect
  lockstep and one enemy taking both hits.
- Removing a projectile shifts every later index: rebuild `world.index.projectiles` for the array,
  per the note on `EntityIndex`.
- Carry `splashRadiusTiles` off the behaviour onto the projectile because the field exists and has to
  be filled, and resolve the hit against the one target. Step 12's Tier 3 is the first content with a
  non-zero radius and owns the splash query.

### 5. `core/systems/resolve.ts` — deaths

Extend the **existing single pass** over `world.enemies` rather than adding a second filter; a
second pass runs against an index the first one already invalidated.

**Check `hp <= 0` before the leak check.** An enemy killed on the tick it reaches the fridge must
emit `enemyKilled` and *not* `enemyLeaked`, and must take no food — otherwise a tower that kills an
ant standing on the fridge still costs you a slice of pizza.

`enemyKilled` carries `at` — `samplePath(path, enemy.distance)`, the position step 7 drops a crumb
at.

### 6. `core/types.ts` and `core/content/towers.ts`

`Projectile.pierce`, the two `GameEvent` members, the Salt Shaker's `projectileSpeed`, and the
assertion for it in `tests/content.spec.ts`.

## Tests

- **An Ant takes 1.5× from a chemical source through the full path.** Place a synthetic chemical
  tower beside the track, run until the projectile lands, and assert the HP delta is `base × 1.5`.
  Asserting it against `resolveDamage` in isolation is what `tests/matrix.spec.ts` already does; the
  point of this one is that the *tags* reach it.
- A tower with `cooldownTicks: 60` fires on ticks 0, 60, 120 … with **no drift over 600 ticks** —
  collect the `towerFired` ticks and assert every gap is exactly 60.
- A tower with nothing in range for 300 ticks fires exactly **once** on the tick an enemy enters
  range, not a banked burst.
- Three enemies at different distances on one path: `FIRST` picks the smallest
  `remainingToFridge`, `LAST` the largest, `STRONGEST` the highest `hp`, `WEAKEST` the lowest,
  `CLOSEST` the smallest euclidean distance to the tower.
- **On a two-path map whose lanes have different lengths, `FIRST` picks the enemy nearer the fridge
  even though *the other one's* raw `distance` is larger.** Build the two-lane map inline; the
  fixture has one lane and a spec pushes the second onto `world.map.paths`.

  The "its" in the original sentence was backwards and would not have caught anything: a `FIRST`
  that maximised raw `distance` picks the same enemy in that case. The winner has to be the one with
  the *smaller* raw distance.
- An enemy at exactly `rangeTiles` is in range and one at `rangeTiles + 0.001` is not.
- A `ground` attack does not hit an `air`-tagged enemy, an `air` attack does not hit a ground one,
  and `both` hits either. An enemy with `flags.hidden` or `flags.untargetable` is never picked.
- An enemy reduced to 0 HP emits exactly one `enemyKilled` with its def and position and is gone from
  both `world.enemies` and `world.index.enemies` in the same tick.
- An enemy that dies on the tick it reaches the fridge emits `enemyKilled`, not `enemyLeaked`, and
  `night.food` loses nothing.
- `RANDOM` on the same seed picks the same enemy on a second run.
- A world with live projectiles on it survives `JSON.parse(JSON.stringify(world))` deeply equal.

## Acceptance

- [x] Four Salt Shakers placed along the Counter clear wave 1 of night 1 with no leak, headless.
      Asserted in `tests/combat.spec.ts`, on tiles (3,12), (7,8), (13,4) and (15,3) — 200 crumbs,
      exactly the starting wallet.
- [x] Adding a second DPS tower to `core/content/towers.ts` requires **zero** changes to any file in
      `core/systems/`. Prove it: add one, run the suite, delete it. Done with a fire/`both`/range-4
      tower; 199 tests green, no file under `core/systems/` touched. (It needs one `ui/locales/en.ts`
      entry, which is `contentKeys.ts` doing its job, not a system.)
- [x] `core/` still imports nothing but itself and zod; no `Math.random`, no wall clock, no `dt`.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 6C

```
core/types.ts   Projectile.pierce: number                       // 1 by default
                GameEvent | { kind: 'towerFired'; towerId: EntityId; defId: DefId; noise: number }
                          | { kind: 'enemyDamaged'; enemyId: EntityId; sourceTowerId: EntityId
                                                     amount: number; at: Vec2 }

core/systems/spatial.ts    queryEnemiesInRange(world, center: Vec2, radiusTiles: number,
                                               filter?: (e: Enemy) => boolean): Enemy[]
core/systems/targeting.ts  pickTarget(world: World, tower: Tower, attack: AttackBehaviour): Enemy | null
                           isTargetable(enemy: Enemy, targets: TargetClass): boolean
core/systems/spatial.ts    enemyById(world, enemyId: EntityId): Enemy | null
                           enemyPosition(world, enemy: Enemy): Vec2 | null   // null: path missing
core/systems/projectiles.ts spawnProjectile(world, tower: Tower, attack: AttackBehaviour,
                                            target: Enemy): void
core/systems/combat.ts     dealDamage(world, enemy, base: number, damageType: DamageType,
                                      sourceTowerId: EntityId): number   // the resolved amount
```

`Projectile.position` and `enemyDamaged.at` are tile coordinates with integers on tile centres, like
everything else in `core/`. 6C multiplies by `tilePx` after a `+ 0.5`.

## Do not

Do not draw anything, add a key handler, or touch `render/`, `ui/` or `dev/` — 6C owns every pixel
of this step. Do not build cones, auras or status effects (steps 9 and 17), splash (step 12), tower
HP and barricades (step 10), the spatial hash (`ARCHITECTURE.md` §6 says when), the noise meter
(step 13) or crumbs (step 7). Do not add a `damage` system to `SYSTEM_ORDER`: `tests/sim.spec.ts`
asserts that list literally, and `dealDamage` is a helper on `combat.ts`, not a slot in the tick.
