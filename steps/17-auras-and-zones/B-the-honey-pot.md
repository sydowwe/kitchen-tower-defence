# Step 17B — The Honey Pot and the `bait` behaviour

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/CONTENT.md` §1 (the **Honey Pot** row, its
behaviour note, and *Economy rates*), `../../analytic-docs/DECISIONS.md` §3 (the fixed track) and
the last line of §4, and the Moth lateral-offset row of `../../analytic-docs/DECISION-LOG.md`.
**Prereq:** step 17A.

## Goal

The interesting one, headless. Ground enemies near a Honey Pot stop walking, lean in and feed for
three seconds, chewing on the pot while they do. It pays 7 crumbs a second, it makes a kill zone
for free, and if nobody defends it, it dies. One new system, `bait.ts`, and one config object.
Nothing is drawn. C owns the card and D the ants. **This part carries the step's bait tests.**

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/content/behaviours.ts:358` | `BaitBehaviour { radiusTiles, targets }`, in the union, `BEHAVIOUR_KINDS`, `DELTA_TARGETS` and the schema (`schema.ts:323`). **No duration field**, and no interpreter or `isBait` |
| `tests/behaviours.spec.ts:85` | builds `bait({ radiusTiles: 3, targets: 'ground' })`, which breaks when the field is added |
| `core/systems/barricades.ts` | the precedent to copy, not reuse. `barricadePositions` (`:69`) projects each tower onto each lane with `nearestOnPath` and an offset test, rebuilt every tick and never stored. The chew is `damageTower` with the enemy def's `meleeDamagePerTick`, then `destroyTower`, looking towers up by id because `destroyTower` splices (`:189`). It skips `fleeing` enemies (`:161`). `:175` says "nothing between the two systems touches a status or a tile", and this part puts a slot between them |
| `core/systems/light.ts:108` | `targetOffsetFor`: the signed perpendicular offset of a point from the lane, via the normal `(-sin θ, cos θ)`. `nearestOnPath` (`path.ts:151`) returns the offset **unsigned** |
| `core/systems/light.ts:150` | writes `lateralOffsetTiles` for `light-drawn` enemies only, which in v1 means Moths (air) |
| `core/types.ts:200` | `lateralOffsetTiles`: "0 for everything but a Moth". Also `spawn.ts:186` and `light.ts`'s header ("the one enemy that leaves the polyline") say the same. All three become false |
| `core/systems/movement.ts:44` | a `fleeing` enemy walks backwards at `speed × 2` and ignores every speed factor, so the board always empties (13A) |
| `core/systems/spawn.ts:170` | `spawnEnemyAt`, the one `Enemy` constructor. The literal and its flags are at `:199` |
| `core/content/enemies.ts` | `meleeDamagePerTick` on every def: Ant 1/s, Roach 1.8, Beetle 5.5, Weevil 3, Slug 4.5, Silverfish 11. **The Mold's `speedTilesPerTick` is 0**: it never walks |
| `tests/world.spec.ts` | the JSON round-trip assertion that 16A extended for `burrowWindow` |

**Specs that will break, by design:** every fixture that builds an `Enemy` literal. That's 14
literals in 13 files: `barricades`, `burrow`, `charges`, `combat`, `crumbs`, `hitbox`, `light`,
`night`, `noise`, `status`, `tiles`, `upgrades` (two) and `viewModel`. Update them mechanically;
don't make the new fields optional to dodge it (15A and 16A paid the same). Plus
`tests/sim.spec.ts`'s order literal, `tests/behaviours.spec.ts:85`, and the tower count.

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **`BaitBehaviour` gains `durationTicks`** (the step's "`baitDurationTicks`"), bounded in the
   schema like any other duration so a millisecond value fails. It goes on the behaviour, not in a
   constant: a tier can then lengthen the hold, and it's the vocabulary growing rather than a
   special case.
2. **A pot holds where it projects onto the lane.** For each lane, `nearestOnPath(path, pot.tile)`.
   If `offsetTiles <= radiusTiles`, that arc distance is a *hold*: barricade-shaped, rebuilt every
   tick, never stored. An enemy is **caught** when `hold <= distance < hold +
   BAIT_CATCH_WINDOW_TILES`, and it freezes **where it stands**, never pulled back to the hold.
   Why the projection and not "on entering the radius": the offset is perpendicular only, so an
   enemy caught 3 tiles *before* the pot could lean sideways but never reach it. The step's "ants
   clustered on it" would be ants in an arc three tiles short. The window is what keeps a pot
   placed behind an enemy from freezing it ten tiles further on.
3. **The pull is the lean.** Each hold carries a signed lean target: the pot's perpendicular offset
   from the lane at the hold (use `light.ts:108`'s maths, not a second copy of the sign
   convention), shortened by `BAIT_LEAN_GAP_TILES` so the enemy stops at the pot's edge and not on
   its glyph. A feeder drifts toward it at `BAIT_LEAN_TILES_PER_TICK`. Everything else on the floor
   drifts toward 0, so a released enemy walks back onto its lane. **`bait.ts` writes
   `lateralOffsetTiles` for every `!isFlyer` enemy, and `light.ts` keeps flyers**: that's the
   index's unsplittable seam. Say it in both files' headers.
4. **State: `Enemy.feeding: { towerId: EntityId; distance: number; releaseTick: number } | null`
   and `Enemy.fedAt: EntityId[]`**, both required. `distance` is stored because the slot runs after
   `movement`, and resetting to a stored value is exact. Recomputing last tick's step backwards is
   what `barricades.ts:175` has to warn itself about. `fedAt` is there because a released enemy is
   still inside the window, and without it the pot catches it again on the next tick, forever. A
   list rather than the last pot, so two pots on one lane each get their feed.
5. **A new slot, `bait`, between `movement` and `burrow`.** It's the barricade's rule ("the clamp
   happens after the move, never inside it"): `movement` stays the one place `distance` grows.
   Before `burrow`, so a burrow window is judged at the frozen distance. **"Frozen for exactly the
   duration" means this:** caught on tick `T` at distance `d`, `releaseTick = T + durationTicks`.
   The distance is `d` at the end of every tick from `T` to `releaseTick - 1`. On `releaseTick` the
   enemy is let go before the clamp, so that tick ends at `d` plus one ordinary step, with no jump.
6. **Inside the system, in this order**, every pass in `world.enemies` order:
   1. **Release** a feeder whose pot is gone (sold this tick, or destroyed), which is `fleeing`,
      which is no longer `isOnFloor`, or whose `releaseTick` has come.
   2. **Chew**: each remaining feeder takes its def's `meleeDamagePerTick` off its pot through
      `damageTower`. Then `destroyTower` every pot at 0 and release **all** of its feeders.
   3. **Catch**, which needs all of: no current feed, `isOnFloor`, not `fleeing`, `speed > 0`, the
      behaviour's `targets` class, a live hold on its lane whose window it's in, and that pot not in
      `fedAt`. The first matching pot in `world.towers` order wins. Record the pot in `fedAt`.
   4. **Clamp** every feeder to its stored `distance`.
   5. **Lean**, per decision 3.

   A newly caught enemy starts chewing next tick. The order is what makes "at 0 it's destroyed and
   every baited enemy releases in the same tick" true for the feeders *after* the killing bite in
   the array, not just the ones before it.
7. **The pot's chew is `meleeDamagePerTick`**, the number a Cardboard Box already takes, in the
   same units. So a Silverfish at the pot is eleven times an Ant, with no new field. It dies through
   `destroyTower`: the `towerDestroyed` event and D's puff come for free, and `income`'s
   `enemyCrumbsOnDestroy` stays 0. Losing the pot is the cost, not a penalty wave.
8. **`honeyPot` is `TOWERS[17]`**: 🍯, `ECONOMY`, 175, noise 0, `off_path`, `CLOSEST`, `maxHp: 150`
   (a draft: the doc has no HP, and the pot's HP *is* its risk). It has `income({ crumbsPerPayout:
   7, payoutIntervalTicks: 60 })` and `bait({ radiusTiles: 3, targets: 'ground', durationTicks:
   180 })`. Tiers are drafts, added to `CONTENT.md` §1 *Upgrades*: income +2 twice (7 → 9 → 11),
   because the income is the bribe. Tier 3 `addBehaviours` a 0-damage `aura` at the bait radius
   that applies `slow` to ground enemies ("the honey gets everywhere"): the Bay Leaf's tier-3 shape,
   so no system changes. Take a better one if you find it, and write it back.

## Build

### 1. The shape: `types.ts`, `behaviours.ts`, `schema.ts`, `spawn.ts`

Decisions 1 and 4. Add `isBait` beside `isCleanse`. `spawnEnemyAt`'s literal gains `feeding: null,
fedAt: []`, and then come the 14 fixtures. Rewrite the three stale "only a Moth" comments, and the
`bait` docstring, which says "off their pace".

### 2. `core/systems/bait.ts`, `sim.ts`, `systems/index.ts`

Decisions 2, 3, 5 and 6. Export the three `BAIT_*` constants: D re-tunes their **values** by
eye. Skip terminal phases. Early out when no tower has a `bait` **and** no floor enemy has a
non-zero offset, because this runs for every enemy every tick. Update `tests/sim.spec.ts`, the order
string in `tick()`'s docstring, and `barricades.ts:175`'s sentence in the same commit.

Gotchas, each of which fails quietly:

- **Release a fleeing feeder before anything clamps it.** `movement` has just walked it backwards,
  and a clamp would put it back every tick. The symptom is a wake after which the board never
  empties, which is exactly what 13A built `FLEE_SPEED_MULT` to prevent.
- **Exclude `speed === 0`.** A Mold in a window would be "caught", then dragged two tiles sideways
  off the cell its patch grows from, so the drawn mold and the spreading one part company.
- **A caught Weevil that dives lets go next tick** (release on `!isOnFloor`), because `burrow` runs
  after this slot. Don't special-case it.
- **A feeder inside a Cardboard Box's hold gap** (a box placed after the catch) ends each tick one
  step behind its stored distance, because `barricadesSystem` recomputes `previous` from speed.
  That's stable, with no drift, and it chews both. Accept it and don't special-case it.
- **Look pots up by id every pass.** `destroyTower` splices `world.towers` and rebuilds the index,
  so a cached `Tower` or position is a stale one.

### 3. The def: `core/content/towers.ts`, `en.ts`, `CONTENT.md`

Decision 8. The English (name, description, tier names, tier-3 sentence) is a **first draft that C
rewrites**. Add the tier-3 line and the three-second hold to the Honey Pot's behaviour note in §1.

## Tests

Assert against `bait.durationTicks` and the `BAIT_*` constants, never the literals, so D's re-tune
moves no assertion.

- **A baited enemy's `distance` is frozen for exactly `durationTicks`**, per decision 5 to the tick,
  then resumes from that same distance plus exactly one step.
- While feeding, its offset moves toward the pot's side and never past the lean target. After
  release it returns to exactly 0.
- **Feeders reduce the pot's HP** by the sum of their `meleeDamagePerTick` each tick. At 0 the pot is
  gone, one `towerDestroyed` is published, and **every** feeder has `feeding === null` at the end of
  that same tick. Put one feeder before the killing bite in `world.enemies` and one after.
- **Selling the pot** releases every feeder the same tick.
- **Flyers are unaffected by bait**: a Fly crossing the window keeps `feeding === null` and an
  offset of 0 throughout.
- A released enemy is never caught by the same pot again. A second pot further along the lane
  catches it once.
- **After a wake**, a feeder has `feeding === null` and a smaller `distance` one tick later. This is
  the tripwire for the first gotcha.
- A Mold spawned inside a window is never caught.
- `createWorld()` with a feeding enemy survives the JSON round trip. Extend the existing assertion.
  `world.rng` is untouched by a whole feed.
- `tests/content.spec.ts`: the Honey Pot against its doc row, `TOWERS[17]`, `toHaveLength(18)`.

## Acceptance

- [ ] The Honey Pot is a config object. The only new system file is `bait.ts`, and no existing
      system gained a branch on bait. `barricades.ts` changed by one comment.
- [ ] `grep -n "lateralOffsetTiles =" src/core` finds exactly two writers, `light.ts` and
      `bait.ts`.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 17C and 17D

```
core/types.ts               Enemy.feeding: { towerId: EntityId; distance: number; releaseTick: number } | null
                            Enemy.fedAt: EntityId[]
core/content/behaviours.ts  BaitBehaviour.durationTicks: number
                            isBait(behaviour: Behaviour): behaviour is BaitBehaviour
core/systems/bait.ts        baitSystem(world: World): void                  // slot 'bait', after 'movement'
                            BAIT_CATCH_WINDOW_TILES, BAIT_LEAN_GAP_TILES, BAIT_LEAN_TILES_PER_TICK
core/content/towers.ts      honeyPot                                        // TOWERS[17]
```

**Everything downstream reads `enemy.feeding`** and never re-derives feeding from a distance and a
pot position (see the index, *The seam that can't be split*).

## Do not

Draw anything, or touch `ui/` beyond the `en.ts` entries `type-check` demands. Don't give `bait` a
status, a new `StatusKind`, or free movement off the polyline. Don't touch A's three towers. Don't
author or re-tune a night. Don't tune the pot's HP or the lean from what the specs suggest; D has
the board.
