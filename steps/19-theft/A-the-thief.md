# Step 19A — The thief, headless

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §6,
`../../analytic-docs/CONTENT.md` §2 (the **Mouse** row) and §7, and the system list in
`../../analytic-docs/ARCHITECTURE.md` §1 (`systems/`).
**Prereq:** step 18, all three parts.

## Goal

The whole theft mechanic, with nothing drawn. A thief walks to the fridge, stands there for a
second and a half, takes its items by name, and runs back down the lane. It's slowed by what's
stuck to it, stopped by boxes behind it, shot by everything, and pushed *toward* the fridge by a
pushback. If it gets out, the items are gone for the night. If it dies, they go back on the shelf for
now: B turns that into a drop. The Mouse exists and validates, and no night schedules it yet (D).
**This part carries most of the step's tests.**

## Already in the repo

Step 18 lands in several of these files after this part was written. Trust symbols over line numbers.

| File | What's there now |
| --- | --- |
| `core/systems/theft.ts` | **Empty** since step 1 |
| `core/types.ts` | `Enemy.stolenItems: EntityId[]` ("Food ids a thief is carrying"): the step's `carrying[]`, and it keeps its name. `FoodItem { id, defId, nameKey, heldBy, lost }`. `NightState.food`'s note says "the fridge is empty" is `every(item => item.lost)`. The `EnemyFlag` doc says "step 19 owns fleeing thieves": **false after decision 2**. `GameEvent` has `enemyLeaked { stolenItems }` |
| `core/systems/resolve.ts` | `takeFood(world, count)` takes the first **unlost** items. The leak branch removes anything at `distance >= totalLength`. A `fleeing && distance <= 0` branch removes silently and sits **before** the death branch (13A: a wake-fled enemy must not die at the skirting). The lose check is `every(item => item.lost)`. The header says step 19 owns thieves |
| `core/systems/movement.ts` | `FLEE_SPEED_MULT = 2`. The fleeing branch ignores statuses and tiles **on purpose** (13A, decision 12: the board has to empty) |
| `core/systems/barricades.ts` | Skips `flags.fleeing`. `nearestAhead` only looks forward (`position.distance > enemy.distance`). `previous` recomputes this tick's step "with the same two factors movement used". `barricadeHolding` / `barricadeAhead` are built on `nearestAhead`, and `render/layers/entities.ts` reads them for the chew animation |
| `core/systems/noise.ts` (`wake`) | Sets `fleeing` **and** `untargetable`. Its comment expects step 19's thief to reuse `fleeing` and be told apart by `untargetable`: **rewrite it per decision 2** |
| `core/systems/pushback.ts` (18A) | `pushEnemy(world, enemy, tiles, sourceTowerId): number`. A predicate above it returns false for `flags.fleeing`, and the clamp is `Math.max(0, Math.min(enemy.distance, …))`. 18A's decision 4 leaves the thief's sign to this step. Two comments there say step 19 "flips a thief to `fleeing`": **rewrite both per decision 2** |
| `core/systems/targeting.ts` (`remaining`) | `remainingToFridge(path, distance)`, which `FIRST` / `LAST` compare |
| `core/systems/bait.ts` (`catchFeeders`, `release`) | Skips and releases on `flags.fleeing` only. The catch window is direction-agnostic |
| `core/systems/spawn.ts` (`spawnEnemyAt`) | The one `Enemy` constructor |
| `core/content/schema.ts` (enemy) | `tileWriter` and `burrow`: optional fields, each "a field and not a tag", because a tag can't carry numbers |
| `core/content/enemies.ts` | `ENEMIES`, ten of them, with no Mouse. `mold.steals` is **0**. `damagePerSecond` and the `hp / 10` chew rule |
| `core/content/matrix.ts` | The `mammal` row is already there (1.5, 1.0, 0.8, 0.6, 1.2). Nothing to add |
| `core/world.ts` | `CreateWorldOptions.noise` is the 13A pattern for an installation resolved into numbers and folded in at construction. `stockFridge` is the one `FoodItem` constructor |
| `core/sim.ts` (`SYSTEMS`) | `… noise, economy, resolve, events`. `tests/sim.spec.ts` pins the order literally |
| `render/layers/fridge.ts` (`drawFridge`), `ui/viewModel.ts` (`foodView`, `buildNightSummary`) | Read `item.lost`. Mechanical, per decision 5 |
| `steps/20-metagame.md` item 4 | Names the modifier `stealsReduction`, and says steps 7, 13, 15 and **19** already read their modifiers from hooks |

**Specs that will break, by design:**

- **Every `Enemy` literal** gains `theft: null`. `grep -rn "stolenItems: \[\]" tests` finds them: 18
  in 17 files before step 18, plus whatever `tests/pushback.spec.ts` added. Update them mechanically,
  and don't make the field optional to dodge it (15A, 16A, 17B and 18A all paid the same).
- **`FoodItem` literals** in `tests/fixtures/world.ts` and the helper in `tests/viewModel.spec.ts`.
- **`.lost` reads** in `night.spec`, `combat.spec` and `viewModel.spec`. The `.lost` in
  `upgrades.spec.ts` is an unrelated local (`chewFor(...).lost`), so leave it alone.
- The literal order in `tests/sim.spec.ts`.

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **A thief is `EnemyDef.thief?: { grabTicks: number; fleeSpeedMult: number }`**, a field and not a
   behaviour. Behaviours are the tower vocabulary, and `burrow` / `tileWriter` set the precedent for
   an enemy mechanic that carries numbers. `grabTicks` is bounded like a status duration (`min(1)`),
   and `fleeSpeedMult` is `(0, 4]`. **The schema refines `thief !== undefined` ⇔
   `tags.includes('thief')`**, so the tooltip's tag and the mechanic can't disagree.
2. **`Enemy.theft: { phase: 'approaching' | 'grabbing' | 'fleeing'; grabEndsTick: number } | null`**,
   null for everything that isn't a thief. **The thief's flight is `theft.phase === 'fleeing'`, never
   `flags.fleeing`**, which stays the wake's. The two flights differ on every axis the systems care
   about: speed and statuses, boxes, targetability, and pushback sign. One flag told apart by an
   `untargetable` tiebreak in five files is the fragile version. `isRetreating(enemy)` (either one) is
   the single reader for "walking backwards". There is no `escaped` phase, because escaping is
   removal. `grabEndsTick` is meaningless outside `grabbing`, like `Crumb.travelTicksRemaining`.
3. **The wake wins.** Every system asks `flags.fleeing` first. `theftSystem` puts a woken thief in
   `fleeing`. It leaves at the wake's speed, untargetable, carrying whatever it had. A thief woken
   mid-grab leaves empty-handed.
4. **The slot is `theft`, between `economy` and `resolve`**, which is `ARCHITECTURE.md` §1's order.
   An approaching thief at `distance >= lengthTiles` is clamped to the length and enters `grabbing`
   with `grabEndsTick = world.tick + grabTicks`. The grab completes on the tick where `world.tick ===
   grabEndsTick`, so it lasts exactly `grabTicks`. Running last before `resolve` means a kill anywhere
   earlier in the completing tick costs nothing, **so skip `hp <= 0`**. `movement` doesn't move a
   grabbing thief: add one `continue`, after the wake branch.
5. **`FoodItem.lost: boolean` becomes `lostTo: 'eaten' | 'escaped' | 'floor' | null`, and the item
   gains `droppedAt: Vec2 | null`.** The summary has to name what *escaped*, and a boolean beside a
   reason is two truths. `droppedAt` is always null in this part, but B writes it, and settling the
   shape here means B and C don't migrate every literal again. `'floor'` is also B's. Replace
   `item.lost` everywhere with `isGone(item)`, and "on the shelf" with `isOnShelf(item)`.
6. **`core/systems/fridge.ts` (new) is the only writer of food state**: `heldBy`, `droppedAt`,
   `lostTo` and `Enemy.stolenItems`, always together. It exports `stealsFor`, **one take function
   that both the leak and the grab call** (the step's item 4), the escape, `returnToShelf`,
   `isOnShelf` and `isGone`. It never imports `resolve.ts`, which imports it.
7. **The Tupperware hook is `CreateWorldOptions.food?: { stealsReduction?: number }`**, folded into
   `NightState.stealsReduction` at construction. That's the 13A noise pattern, and the name is step
   20's. `stealsFor(world, def)` is `def.steals === 0 ? 0 : Math.max(1, def.steals - reduction)`. The
   zero guard is the Mold: "minimum 1" would otherwise give a steals-0 enemy one item. Don't author
   the installation. Step 20 does, and it has its own test.
8. **A thief's flight is `speed × fleeSpeedMult × speedMultiplier × tileSpeedMultiplier`, subtracted.**
   Unlike the wake's flight, statuses apply: a frozen or taped Mouse on its way out is the counterplay
   the flight exists for. Export the signed per-tick step from `movement.ts` as one function, and
   rebuild `barricades`' `previous` from it. Two copies of the formula is the tile-factor bug 15A
   already hit once.
9. **Boxes block in reverse.** "Ahead" means *in the direction of travel*. For a thief in `fleeing`,
   `nearestAhead` looks for the nearest box with a lower `distance`, holds at `box + HOLD_GAP_TILES`,
   and clamps **never forwards** (the mirror of the existing never-backwards clamp). It chews at
   `meleeDamagePerTick` like any enemy. `barricadeHolding` is built on the same function, so 10C's
   chew animation works for a Mouse chewing a box behind it for free. The wake's flight is still
   skipped.
10. **The order in `resolve`:** first the wake-fled enemy at `<= 0` leaves (the existing branch, still
    before death, for 13A's reason), and any items it carried become `'escaped'`. Then death. Then
    **a thief in `fleeing` at `<= 0` escapes, *after* death**, so a kill on the tick it reaches the
    crack is a kill. The step's first acceptance line is that moment. A thief never takes the leak
    branch.
11. **Death while carrying returns the items to the shelf. This is interim**, the simple version in
    `DECISIONS.md` §6. B replaces this one call with a drop. Leave a comment saying so, and don't
    polish it.
12. **The pushback sign.** In `pushEnemy`, after the wake's 0: a thief in `fleeing` moves
    `distance += moved`, clamped at the lane length, and the resistance works as usual. A grabbing
    thief moves 0, like a feeder. Nothing in v1 can reach this branch (the Fan is air-only, and Mint
    Pot is in `POST_V1_TOWERS`), so it's asserted through Mint Pot, the way 18A asserts its ground
    cases.
13. **`FIRST` / `LAST` for a thief:** `remaining()` in `targeting.ts` is 0 for one that's grabbing,
    and `distance` for one that's fleeing. That's tiles until something is lost for good, which is
    what `remainingToFridge` means for a walker. Without this, a fleeing Mouse near the crack has the
    whole lane "remaining", and every `FIRST` tower shoots the ants walking in instead. The step's
    picture of every tower firing at the Mouse fails, and nothing reports it.
14. **Two events:** `{ kind: 'thiefGrabbed'; enemyId; items: EntityId[] }` when a grab completes, and
    `{ kind: 'thiefEscaped'; enemyId; defId; items: EntityId[] }` when a thief leaves by either
    flight. `items` may be empty. C reads both. The drop and the return are B's events.
15. **The Mouse** is CONTENT.md §2's row: 🐭, `hp: 200`, `tilesPerSecond(1.5)`, `reward: 40`,
    `steals: 5`, `['ground', 'thief', 'mammal']`, and `meleeDamagePerTick: damagePerSecond(20)` (the
    file's `hp / 10`). Its thief field is `{ grabTicks: 90, fleeSpeedMult: 1.3 }`, both drafts that D
    re-tunes. Append it to `ENEMIES`. It isn't `boss` and it isn't `push-immune`. The English is a
    **first draft that C rewrites**.

## Build

### 1. The shapes: `types.ts`, `schema.ts`, `spawn.ts`, `world.ts`, the fixtures

Decisions 1, 2, 5, 7 and 14. `spawnEnemyAt` sets `theft` to `{ phase: 'approaching', grabEndsTick: 0
}` for a def with `thief`, and to `null` otherwise. `stockFridge` writes `droppedAt: null, lostTo:
null`. Rewrite the `EnemyFlag` doc, the `NightState.food` note, `noise.ts`'s wake comment and
`resolve.ts`'s header so none of them describes the old plan. Then do the fixtures.

### 2. `core/systems/fridge.ts`, and `resolve.ts` on top of it

Decisions 6, 7, 10 and 11. `takeFood` moves out of `resolve.ts` and becomes the shared take.

Gotchas, each of which fails quietly:

- **"The first unlost items" becomes "the first items on the shelf".** A carried item isn't lost.
  With the old predicate, a second Mouse is handed the items the first one is already holding, and
  the same pizza ends up on two sprites.
- **The lose check stays "every item gone".** A carried item isn't gone, so a Mouse holding the last
  five keeps the night alive until it escapes or dies. That's the design. An Ant arriving at an empty
  shelf takes nothing and leaves.
- **The wake's silent branch now has a thief case.** It still pays no crumb and counts no kill, but
  a thief's carried items become `'escaped'` and a `thiefEscaped` is pushed. Otherwise, a wake during
  the Mouse's getaway leaves five items held by an enemy that no longer exists.

### 3. `core/systems/theft.ts`, `movement.ts`, `barricades.ts`, `sim.ts`

Decisions 2, 3, 4, 8 and 9. Export `isRetreating`, `isGrabbing` and `grabProgress(world, enemy)`
(0..1, which C draws).

Gotchas:

- **Skip thieves in `resolve`'s leak branch explicitly**, not by relying on the slot order. If the
  slot ever moves after `resolve`, an arriving Mouse is eaten as an ordinary leak on its arrival tick.
- **The arrival overshoots by up to one step** before `theft` clamps it. `samplePath` clamps for
  anything that reads in between, and that's fine. Don't "fix" it by clamping in `movement`.
- **The wake's flight in `movement` stays exactly as it is.** The thief branch goes after it, and so
  does the grabbing `continue`.
- **A Honey Pot can catch a fleeing thief.** `catchFeeders` only skips `flags.fleeing`. The Mouse fed
  at every pot it passed on the way in (`fedAt`), so only a pot placed behind it can do this. That's
  allowed. Don't special-case it.

### 4. `pushback.ts` and `targeting.ts`

Decisions 12 and 13.

### 5. The Mouse: `enemies.ts`, `en.ts`

Decision 15. Draft `enemy.mouse.name` / `description` in `en.ts`, because `contentKeys` requires them.

## Tests

Most go in a new `tests/theft.spec.ts`. Assert against `grabTicks`, `fleeSpeedMult` and the defs'
fields, never the literals, so D's re-tune moves no assertion. Use a synthetic thief (steals 3) where
the Mouse's 200 HP gets in the way.

- A thief reaching the fridge enters `grabbing`. On the tick before `grabEndsTick`, the shelf is
  untouched. On that tick, the first `stealsFor` shelf items have `heldBy` equal to its id, the same
  ids are in `stolenItems`, and one `thiefGrabbed` names them. **Killed during the grab**, including
  by damage dealt earlier in the completing tick, it takes nothing: no item leaves the shelf.
- A fleeing thief's `distance` falls by exactly `speed × fleeSpeedMult` a tick on a bare floor, and by
  less under a slow. A box *behind* it holds it at `box + HOLD_GAP_TILES` and takes chew damage.
  `barricadeHolding` names that box. A box it has already passed on the way back doesn't hold it.
- Escaping at `distance <= 0` marks exactly its items `lostTo: 'escaped'`, removes the enemy, pays no
  crumb and counts no kill, and pushes `thiefEscaped` with those ids. Killed on the tick it would have
  escaped, it's a kill and the items are back on the shelf (A's interim; B updates this assertion).
- The wake: a thief woken mid-grab leaves with nothing. A thief woken while carrying leaves at
  `speed × FLEE_SPEED_MULT`, untargetable, and its items are `'escaped'` when it reaches 0.
- **Pushback, through Mint Pot** (register and splice it as 18A does): a fleeing thief in its radius
  **gains** `distance`, it never passes the lane length, and the `enemyPushed` tiles equal the gain. A
  grabbing thief is unmoved.
- `FIRST` picks a fleeing thief at `distance` 3 over an Ant with 5 tiles to the fridge, and a grabbing
  thief over both.
- The hook: a world built with `food: { stealsReduction: 1 }` has an Ant leak take 1 and a Beetle
  take 1, the Mouse grab 4, and `stealsFor` for the Mold stay 0. **The Ant and the Mouse go through
  the same function**, so assert both in one test.
- Invariant, after a mixed scenario: every id in any enemy's `stolenItems` has `heldBy` equal to that
  enemy's id, and every item with a non-null `heldBy` is in that enemy's list.
- The schema rejects a def with `thief` and no `thief` tag, and one with the tag and no field. The
  Mouse takes 1.5× physical and 0.6× chemical through `resolveDamage` (`tests/content.spec.ts`,
  beside the other roster rows).
- `createWorld()` with a grabbing thief and a carried item survives the JSON round trip (extend the
  existing assertion), and a whole grab-flee-escape leaves `world.rng` untouched.
- `tests/sim.spec.ts`: `theft` between `economy` and `resolve`.

## Acceptance

- [x] `grep -rn "'mouse'" src/core/systems` finds nothing. The Mouse is a config object.
- [x] `grep -rn "\.lostTo = \|\.heldBy = \|\.droppedAt = \|stolenItems = \|stolenItems.push" src/core`
      finds writers only in `core/systems/fridge.ts` (and `spawnEnemyAt` / `stockFridge`, which
      construct them).
- [x] `grep -rn "flags.fleeing = " src/core` finds only the wake.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 19B, 19C and 19D

```
core/types.ts            Enemy.theft: { phase: 'approaching' | 'grabbing' | 'fleeing'; grabEndsTick: number } | null
                         FoodItem.droppedAt: Vec2 | null     // B writes it
                         FoodItem.lostTo: 'eaten' | 'escaped' | 'floor' | null
                         NightState.stealsReduction: number
                         GameEvent 'thiefGrabbed' { enemyId, items }
                                   'thiefEscaped' { enemyId, defId, items }
core/content/schema.ts   EnemyDef.thief?: { grabTicks: number; fleeSpeedMult: number }
core/systems/fridge.ts   stealsFor(world, def): number
                         takeFood(world, enemy): EntityId[]   // the one take: eats for a walker, holds for a thief
                         escapeWith(world, enemy): EntityId[]   // marks the carried items 'escaped'
                         returnToShelf(world, ids: EntityId[]): void   // B's pickups call it too
                         isOnShelf(item: FoodItem): boolean
                         isGone(item: FoodItem): boolean
core/systems/theft.ts    theftSystem(world): void
                         isRetreating(enemy): boolean   // wake or thief flight: the renderer's mirror
                         isThiefFleeing(enemy): boolean   // the thief's own flight, false once woken
                         isGrabbing(enemy): boolean
                         grabProgress(world, enemy): number   // 0..1, C's ring
core/systems/movement.ts stepTiles(world, enemy): number   // signed step; barricades rebuilds `previous` from it
render/layers/fridge.ts  drawFridge skips !isOnShelf, so a carried item leaves the shelf with no carry drawn (C)
core/world.ts            CreateWorldOptions.food?: { stealsReduction?: number }
core/content/enemies.ts  mouse   // in ENEMIES, scheduled by no night until D
```

## Do not

Draw anything, or touch `ui/` and `render/` beyond the mechanical `isGone` / `isOnShelf` swaps that
`type-check` forces and the Mouse's draft English. The grab ring, the carry, the flight and the
mirrored glyph are C's. Don't drop food on the floor, add `CollectFood`, or touch `crumbs.ts` (B).
Don't schedule the Mouse in any night (D). Don't author Better Tupperware (step 20), and don't give
the Fan ground targets so the pushback sign becomes reachable.
