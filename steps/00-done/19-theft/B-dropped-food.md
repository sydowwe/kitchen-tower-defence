# Step 19B — Dropped food, headless

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../../CLAUDE.md`, `../../../analytic-docs/DECISIONS.md` §4 (crumbs: the click and the
collect radius this copies) and §6, `../../../analytic-docs/CONTENT.md` §7.
**Prereq:** step 19A.

## Goal

A thief killed while it's carrying doesn't hand the food back. It drops it where it died, and the
food lies on the track until someone fetches it. The player can click it, or a tower with a `collect`
radius picks it up, and either way it goes back on its shelf. Whatever is still on the floor when
the night is won is lost. After A this is a small change in one place, but it's a second mechanic
with its own reading list (the crumb doors, the command queue). Nothing is drawn, because C owns the
glow, the click target and the flight home. **This part carries the step's dropped-food tests.**

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/systems/fridge.ts` (19A) | The only writer of food state. `returnToShelf(world, ids)`, `isOnShelf`, `isGone`. **Every write you add goes here**: the index's seam |
| `core/systems/resolve.ts` (death branch) | Calls 19A's **interim** `returnToShelf` for a carrying enemy, commented as such. This part replaces that call. The same branch computes `at` with `enemyPosition` and hands it to `enemyKilled` and `dropCrumb` |
| `core/systems/resolve.ts` (win branch) | `night.phase = 'won'`, then `nightEnded { won: true }` |
| `core/types.ts` | `FoodItem.droppedAt: Vec2 | null` (always null so far) and `lostTo: 'eaten' | 'escaped' | 'floor' | null` (`'floor'` unused so far) |
| `core/systems/crumbs.ts` | The interpreter of the `collect` behaviour: `claimCrumbs` (array order, radius from `tower.tile`), `deliverCrumbs`, `collectCrumb` (the paying door). `forfeitCrumbPiles` is the wake's sweep |
| `core/commands.ts`, `core/systems/commands.ts` | `CollectCrumb { crumbId }` and `collect()`: a silent no-op for a pile that has already gone |
| `core/content/towers.ts` | `collect` on the Toaster Crumb Tray (2.5) and the Cookie Jar (3) |
| `tests/theft.spec.ts` (19A) | The "killed while carrying → back on the shelf" assertion, which **this part rewrites** into a drop |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **The drop is `dropCarried(world, enemy, at)` in `fridge.ts`**, and it replaces 19A's interim call.
   Each carried item gets `heldBy: null` and `droppedAt: { x: at.x, y: at.y }` (a copy, never the
   event's object), and `enemy.stolenItems` becomes `[]`. `at` is the same position `enemyKilled` and
   the crumb use, so the food lands under the crumb.
2. **In `core/`, every item a thief drops sits at one exact point.** Fanning them apart so three
   glyphs don't stack is C's job, and C's click hit-test shares that fan. The step's test says
   "exactly 3 pickups at the death position", and that's asserted here without an offset.
3. **The click is `CollectFood { kind: 'CollectFood'; foodId: EntityId }`, one per item.** C's
   interaction enqueues one for each item under the pointer. It's a silent no-op for an item that
   isn't on the floor, for `CollectCrumb`'s reason: frames pass between the click and the tick, and a
   tower may have fetched it in between.
4. **A tower's `collect` radius returns food on the tick the food is in reach, with no travel.** The
   food goes back to the *fridge*, not to the tower. A claim and a flight state on `FoodItem` would be
   a second copy of the crumb machinery for a flight C draws from the event anyway. Run it as a pass
   in `crumbsSystem` after `deliverCrumbs` (that system is `collect`'s interpreter), in
   `world.towers` order, measuring from `tower.tile` exactly as `claimCrumbs` does. `Night Shift
   Dustpan`'s travel modifier (step 20) doesn't touch it, and that's correct.
5. **One event per return:** `{ kind: 'foodReturned'; items: EntityId[]; from: Vec2; byTowerId:
   EntityId | null }`, where `null` means a click. The drop is `{ kind: 'foodDropped'; enemyId; items:
   EntityId[]; at: Vec2 }`. C reads both, and `from` is what lets a flight start where the food was
   after `droppedAt` has been cleared.
6. **On a win, every floor item becomes `lostTo: 'floor'`** with `droppedAt: null`, in `fridge.ts`,
   called from `resolve`'s win branch **before** `nightEnded` is pushed, so the summary built off that
   tick already sees it. A loss can't have floor food (a loss is every item gone), so assert that
   rather than handling it.
7. **The wake doesn't touch food on the floor.** It forfeits crumbs because crumbs are litter.
   Forfeiting the food too would be a second, invisible theft on top of everything the wake already
   costs. Returning it would make a wake a free pickup.
8. **Nothing else picks it up.** An Ant walking over it does nothing, and a second Mouse can't
   re-steal it: the grab takes from the shelf only (19A). Floor items aren't gone, so they hold off
   the lose check the way carried ones do.

## Build

### 1. `core/systems/fridge.ts`, `resolve.ts`

Decisions 1, 2, 5 and 6.

Gotcha: **the death branch runs for every dying enemy**, and most carry nothing. `dropCarried` with
an empty list pushes no `foodDropped`. Otherwise every Ant death is an event C has to filter, and at
3× that's forty a frame.

### 2. `CollectFood`: `core/commands.ts`, `core/systems/commands.ts`, `fridge.ts`

Decision 3. `collectFood(world, foodId, byTowerId)` in `fridge.ts` is the one door both the click
and the tower go through, the way `collectCrumb` is for piles. It calls `returnToShelf` and pushes
`foodReturned` with `from` read **before** it clears `droppedAt`.

Gotcha: **two `CollectFood`s for one item in one batch** (a double-click inside one frame) must
return it once. The second finds it on the shelf and does nothing. That falls out of checking
`droppedAt !== null` first, and it's what the test pins.

### 3. The tower pass: `crumbs.ts`

Decision 4. `crumbs.ts` may import `fridge.ts`. `fridge.ts` must never import `crumbs.ts`, since
`resolve.ts` imports both, and that cycle surfaces as an `undefined` at module load.

## Tests

Extend `tests/theft.spec.ts`, using the synthetic three-item thief 19A registers.

- Killed while carrying 3: exactly those 3 ids have `droppedAt` equal to the `enemyKilled` event's
  `at`, `heldBy` null, and they're neither on the shelf nor gone. The enemy's `stolenItems` is empty.
  One `foodDropped` names them. (This replaces 19A's interim assertion.)
- A `CollectFood` for each returns exactly those ids to the shelf, with the same `defId` and `nameKey`
  as before the theft, and pushes `foodReturned` with `byTowerId: null` and `from` equal to the drop
  point. A second `CollectFood` for the same id in the same batch is a no-op.
- A Toaster Crumb Tray whose radius covers the drop point returns the items on the next tick, with
  its id as `byTowerId`. One whose radius doesn't cover it leaves them where they are.
- A night won with an item on the floor ends with it `lostTo: 'floor'` on the tick `nightEnded` is
  pushed, and `droppedAt` null.
- A wake leaves floor items exactly where they were.
- An Ant death pushes no `foodDropped`. A `CollectFood` naming a shelf item, a carried item or an
  unknown id changes nothing.
- `createWorld()` with an item on the floor survives the JSON round trip (extend the existing
  assertion).

## Acceptance

- [x] 19A's writer grep still holds: `droppedAt` is written only in `fridge.ts` (and `stockFridge`).
- [x] `crumbs.ts` gained a pass, not a branch inside `claimCrumbs`, and `fridge.ts` imports neither
      `crumbs.ts` nor `resolve.ts`.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 19C

```
core/commands.ts         CollectFood { kind: 'CollectFood'; foodId: EntityId }
core/types.ts            GameEvent 'foodDropped'  { enemyId, items, at: Vec2 }
                                   'foodReturned' { items, from: Vec2, byTowerId: EntityId | null }
core/systems/fridge.ts   dropCarried(world, enemy, at): void
                         collectFood(world, foodId, byTowerId: EntityId | null): void
                         isDropped(item: FoodItem): boolean   // droppedAt !== null
```

`isDropped` and not `isOnFloor`: `core/systems/targeting.ts` already exports `isOnFloor(enemy)`, and
two functions with that name answering different questions will be auto-imported wrong.

## Do not

Draw anything, add the click target, or touch `ui/` (C). Don't give food a travel time, a claim, or
rot. Don't let an enemy pick it up or re-steal it. Don't touch the wake's crumb forfeit or
`forfeitCrumbPiles`. Don't author nights (D) or installations (step 20).
