# Step 10B — The Cardboard Box, and the queue that chews it

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §3 (the fixed track, and the
Cardboard Box redesign table), `../../analytic-docs/CONTENT.md` §1 (the Act I row and the *Behaviour
notes* line for the box) and §2 (the enemy table).
**Prereq:** step 10A.

## Goal

Enemies that stop and eat something instead of walking past it — the first collision in a codebase
that has deliberately never had any — and the tower that makes them. Headless: 10C draws the chew.
Every test step 10 has left lives here, because being stopped is the half that can silently be wrong.

## Already in the repo

| File | What's there today |
| --- | --- |
| `core/systems/movement.ts` | eight lines: `enemy.distance += enemy.speed * speedMultiplier(enemy)`. Its header commits to "no steering, no collision, no separation" — read it before deciding where your code goes |
| `core/path.ts` | `nearestOnPath(path, point): { distance, offsetTiles }` — the projection you need, clamped per segment, ties to the earlier segment. Also `samplePath`, `totalLength`, `remainingToFridge` |
| `core/map.ts` | `TileFlags`, `canPlace(map, tile, placement)` — `path_only` is already `TRACK && !BLOCKED`. `MapDef.trackWidthTiles` is a derived field on the runtime map |
| `core/systems/placement.ts` | 10A's `damageTower` / `destroyTower`, plus `canPlaceTower`, `towerAt`, `sellTower`, `removeTower` |
| `core/content/behaviours.ts` | `barricade()` — **no fields**, and its comment says why: the HP is `TowerDef.maxHp` and the position is `placement: 'path_only'` |
| `core/content/enemies.ts` | `ant`, `roach`, `beetle`, `fruitFly`, with a `tilesPerSecond()` helper. The Fruit Fly is tagged `air` and is the flyer you can test against today |
| `core/content/schema.ts` | the `enemy` object, whose `speedTilesPerTick` bound (`max(0.5)`) is the pattern for the field you are adding |
| `core/sim.ts` | `SystemName`, `SYSTEMS`, `SYSTEM_ORDER` |
| `tests/sim.spec.ts` (~line 66) | asserts `SYSTEM_ORDER` against a **literal list**, so a new slot is a deliberate two-file edit. It also asserts `core/systems/index.ts` exports `${name}System` for every name |
| `tests/content.spec.ts` | pins every enemy number literally, and asserts `validateContent` accepts the whole roster |
| `ui/locales/contentKeys.ts` (~line 34) | a comment predicting "step 10 adds a ninth reason for barricades" to `PlacementRejection`. It is wrong — fix it |

`counter.json` has one lane, `crack`, seven waypoints, 31.12 tiles, all runs axis-aligned. Nights 1–7
are all on it. A two-lane map does not exist until step 21, so the lane test below needs a synthetic
map — `tests/fixtures/world.ts` and `tests/spawn.spec.ts` already build them.

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **A new system, `core/systems/barricades.ts`, in a new slot between `movement` and `targeting`.**
   `movementSystem`'s header is an explicit promise that it does nothing but walk, and a barricade is
   collision. One file, one name, one line in `SYSTEM_ORDER` and one in `tests/sim.spec.ts` — which
   is exactly the deliberate edit that test exists to force.
2. **Clamp *after* the move, never inside it.** `movement` advances everyone; `barricades` pulls back
   whoever overshot. That keeps `movement` the one place `distance` grows, and step 18's pushback
   will subtract from the same field without either of them knowing about the other.
3. **Blocking is stateless and recomputed every tick.** No `blockedByTowerId` on `Enemy`, no flag.
   Every edge case in this step falls out of asking "is there a barricade ahead of me right now": a
   box placed behind an enemy is never ahead of it, a box sold or destroyed stops being ahead of
   anyone the same tick, and no field has to be cleared in four places. A remembered id is a second
   truth, and the one clear that gets missed leaves an enemy standing forever on a box that is gone.
4. **The hold gap is 0.5 tiles before the box's arc position**, so the queue piles at the box's edge
   rather than inside it. Name the constant.
5. **The clamp never moves an enemy backwards**: `distance = min(next, max(distance, holdAt))`.
   **This is the edge case the step warns about, and the naive clamp is the one that trips it:** an
   enemy standing at `boxDistance - 0.1` when the box goes down is *already inside the gap*, and a
   plain `min(next, holdAt)` shoves it 0.4 tiles back up the track. On screen that is an ant
   teleporting backwards the instant you place a box, which is the exact symptom the step names.
6. **A barricade belongs to a lane only if it stands on that lane.** For each path, take
   `nearestOnPath(path, tower.tile)` and accept it only when
   `offsetTiles <= map.trackWidthTiles / 2`. **Without the offset test, `nearestOnPath` always
   returns a distance**, so from night 10 on a box dropped on lane A silently stops lane B as well —
   and on a one-lane map it looks perfect right up until it ships.
7. **A lane that crosses the same tile twice is blocked at the nearer crossing only.**
   `nearestOnPath` returns one projection and that is accepted for v1; no authored map self-crosses.
   Say so in a comment so a later map author finds out from the code rather than from a bug.
8. **Melee damage is flat.** It does not route through `resolveDamage`: that function is damage-type
   × *enemy tag*, and a tower has no tags. `damageTower` takes a final number for the same reason.
9. **`meleeDamagePerTick` on `EnemyDef`**, authored through a `perSecond`-style helper beside
   `tilesPerSecond`, from the step's `hp / 10` per second. `speedTilesPerTick`'s naming and its
   bounded schema entry are the pattern: `z.number().min(0).max(0.5)`, which is what rejects a
   per-second number pasted straight in. It is **required, not optional** — a default of 0 is an
   enemy that stands at a box forever and never gets through it, which is a night that never ends.
10. **Flyers are `enemy.tags.includes('air')`, not `isTargetable`.** That predicate answers what a
    tower may shoot at, and reusing it here would make a `hidden` Weevil walk through a box in step
    16.
11. **A held enemy is otherwise completely normal.** Statuses tick, towers shoot it, it drops crumbs
    where it stands. The only thing that changes is that `distance` stops growing — including for a
    rooted or slowed enemy, which still chews at its full rate.
12. **One exported query, two readers.** `barricadeAhead(world, enemy)` finds the nearest box
    strictly ahead on the enemy's lane; `barricadeHolding(world, enemy)` is the "is it chewing right
    now" predicate built on it. The system uses both, and 10C's chew animation uses the second — so
    the animation cannot disagree with the simulation about who is eating.
13. **Append to `TOWERS`, never reorder it.** The shop renders `TOWERS` order and prints
    `index + 1` on each button; reordering silently rebinds every hotkey the player has learned.

## Build

### 1. `EnemyDef.meleeDamagePerTick` (`core/content/schema.ts`, `core/content/enemies.ts`)

The field, its bound, and a value on all four enemies at `hp / 10` per second — ant 1.0/s, roach
1.8/s, beetle 5.5/s, fruitFly 0.8/s. The Fruit Fly's is never read (it flies) and is authored anyway,
because an optional field is decision 9's failure mode.

Pin them in `tests/content.spec.ts` the way the speeds are pinned: `× 60` back to the doc's units, so
a per-second value pasted in fails the assertion as well as the schema.

`../../analytic-docs/CONTENT.md` §2 has **no column for this**. Leave the doc alone for now — 10C
tunes the number after watching a queue eat a box, and adds the column only if it settles somewhere
other than `hp / 10`.

### 2. `core/systems/barricades.ts`

Per tick, in this order:

1. Build the barricade positions **once** — one pass over `world.towers`, keeping those whose def has
   a `barricade` behaviour, and for each the `{ towerId, pathId, distance }` triples decision 6
   accepts. Bounded by the number of boxes on the board; do not recompute it per enemy.
2. For each ground enemy, `barricadeAhead`; clamp per decisions 4 and 5.
3. Every enemy the clamp actually held deals `getEnemyDef(enemy.defId).meleeDamagePerTick` to that
   box through 10A's `damageTower`, and `destroyTower` runs the moment a box reaches 0 hp.

Gotcha: `destroyTower` splices `world.towers` and rebuilds `world.index.towers`. If the box dies
partway through the enemy loop, the **positions array you built in step 1 is now stale** — the
towerId in it points at nothing. Look the tower up by id each time you damage it and treat a missing
one as "deals no damage" rather than caching the `Tower` object.

Built: the clamp runs *before* that lookup, so the rest of the queue holds its ground for the
remainder of the destroy tick and walks from the next one — which is what the fifth test below
asserts. Releasing them mid-loop instead would move them on the very tick the box died.

Then the slot: `SystemName`, `SYSTEMS` and the order comment on `tick()` in `core/sim.ts`, the export
in `core/systems/index.ts`, and the literal list in `tests/sim.spec.ts`.

### 3. The Cardboard Box (`core/content/towers.ts`, `ui/locales/en.ts`)

`../../analytic-docs/CONTENT.md` §1, Act I: 25 crumbs, **200 HP**, `path_only`, role `WALL`, noise 0,
glyph 📦, and §1's note — "enemies stop and attack it; it does not damage them". `behaviours:
[barricade()]` and nothing else: it has no attack, no income, no charge.

`defaultTargetingMode` is required by the schema and inert for a tower with no targeting behaviour;
`CLOSEST` is what the other behaviourless towers carry. Write the `en.ts` entry now — 10C revises it
after seeing the card, and until then the card will be nearly empty, which is 10C's job to fix and
not yours.

Then fix the `contentKeys.ts` comment: `canPlace` has answered `path_only` since step 3A and
`hud.reject.offTrack` — "This one goes on the track itself." — has been the English for it since 8A.
No ninth `PlacementRejection` is needed.

## Tests

`tests/barricades.spec.ts`. Built on `tests/fixtures/world.ts`'s lane `a` rather than the Counter's
`crack` — it is the straight 40-tile lane every other system spec uses, and on it a tile's arc
distance is its `x`, which is what lets the numbers below be written out. A two-lane synthetic map
for the lane test, in the style `tests/spawn.spec.ts` already builds one.

- An enemy at `boxDistance - 0.1` ends the tick at the distance it started at — not pushed back, not
  advanced — and the box's hp fell by exactly that enemy's `meleeDamagePerTick`. (Built: to twelve
  decimal places, not `toBe`. The clamp recovers the pre-move distance by subtracting the step
  `movement` just added, and `(9.9 + 1/60) - 1/60` is 9.899999999999999. The assertion still
  separates it from both the 0.5 push-back and one tick of advance by seven orders of magnitude.)
- An enemy at `boxDistance + 0.1` advances by its full `speed * speedMultiplier` and the box takes
  nothing.
- An enemy walking into a box from well behind it comes to rest at `boxDistance - 0.5` and stays
  there, tick after tick, never overshooting and never oscillating.
- Three ants held behind one box drop its hp by exactly `3 × meleeDamagePerTick` per tick.
- The tick a box is destroyed: exactly one `towerDestroyed`, every held enemy's `distance` unchanged,
  and on the **following** tick each advances by its full per-tick speed — no jump, no catch-up.
- `sellTower` on a box mid-chew releases the queue the same way and emits `towerSold`, not
  `towerDestroyed`.
- A Fruit Fly crosses `boxDistance` unimpeded and deals the box nothing.
- On a two-lane map, a box on lane `a` does not slow an enemy on lane `b` past the same arc distance.
- A box placed on a tile an enemy has already passed never blocks that enemy, however long it walks.

## Acceptance

- [x] `SYSTEM_ORDER` reads `... status, movement, barricades, targeting, combat ...` in `core/sim.ts`,
      in the comment on `tick()`, and in `tests/sim.spec.ts`.
- [x] `Enemy` gained no field, and `World` gained nothing at all — the world still survives its JSON
      round-trip assertion untouched.
- [x] No system file branches on a tower id or an enemy id.
- [x] Adding a hypothetical second barricade tower is a def in `core/content/towers.ts` plus an entry
      in `en.ts`, and nothing in `core/systems/`.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 10C

```
core/systems/barricades.ts   barricadeAhead(world: World, enemy: Enemy): { tower: Tower; distance: number } | null
                             barricadeHolding(world: World, enemy: Enemy): Tower | null
                             isBarricade(def: TowerDef): boolean
core/content/schema.ts       EnemyDef.meleeDamagePerTick: number
```

`barricadeHolding` is what 10C's chew animation reads, once per enemy per frame. Keep it cheap enough
to be asked that often — it is bounded by the barricade count, not the enemy count.

## Do not

Draw anything. The box's damage states, the chew animation and the tower HP bar are 10C's, and
`render/` is not this session's directory. Do not add a second damage path — everything goes through
10A's `damageTower` and `destroyTower`, including the box reaching 0. Do not implement flyers as a
system (step 11), tile effects (step 14) or pushback (step 18), and do not give the box the T3
reflect damage `../../analytic-docs/CONTENT.md` §1 lists — upgrades are step 12.
