# Step 7A — Piles, merging, collection, income

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §4 — read it twice, this is the
game's signature mechanic and it is easy to accidentally reduce to "gold on kill" —
`../../analytic-docs/CONTENT.md` §1 (*Economy rates* and the two `collect` radii in the Act I table)
and §9 (the difficulty scalars).
**Prereq:** step 6.

## Goal

A crumb is a physical object on the board with a value, an age and a life: dropped where something
died, merged with its neighbours, and removed through exactly one door — credited to the wallet, by a
click or by a tower that spent 1.5 seconds dragging it in. Entirely headless; nothing is drawn until
7C and nothing rots until 7B. This part carries every assertion about the wallet.

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/types.ts` | **`Crumb` is already declared in full** — `id, position, value, ageTicks, claimedByTowerId, travelTicksRemaining`. `World.crumbPiles: Crumb[]` and `EntityIndex.crumbPiles` both exist and are empty. `GameEvent` already has `{ kind: 'crumbCollected'; crumbId; value; byTowerId: EntityId \| null }` |
| `core/systems/crumbs.ts` | a 4-line stub: `export function crumbsSystem(_world: World): void {}` |
| `core/systems/economy.ts` | the same stub shape |
| `core/sim.ts` | `SYSTEM_ORDER` runs `… projectiles → tiles → **crumbs** → noise → **economy** → resolve → events`. Both slots are already yours |
| `core/systems/resolve.ts` | the one place entities are removed. Pushes `enemyKilled` with `at` = the death position, and its comment already says "`at` is where step 7 drops the crumb" |
| `core/systems/commands.ts` | a `switch` on `command.kind`; the header says **step 7 executes `CollectCrumb`**. `CollectCrumb { crumbId: EntityId }` is already in `core/commands.ts` |
| `core/systems/placement.ts` | `towerById(world, id)` — id → tower or null through `world.index.towers`, safe against a sold tower |
| `core/content/behaviours.ts` | `collect({ radiusTiles, travelTicks })` and `income({ crumbsPerPayout, payoutIntervalTicks })` are both already in the vocabulary and schema-validated. `isAttack(behaviour)` is the narrowing-helper precedent |
| `core/content/towers.ts` | `toasterCrumbTray` and `cookieJar` carry `income(...)` and **no** `collect(...)` — step 6A decision 11 deferred the radii to you |
| `core/content/difficulty.ts` | `crumbIncomeMult` is 1.25 / 1.0 / 0.85 and **nothing reads it yet**. You are the first |
| `core/systems/commands.ts` | `callWaveEarly` deliberately does *not* apply `crumbIncomeMult` — "a tempo reward, not income". Crumbs and payouts are income and do |
| `tests/fixtures/world.ts` | `createTestWorld()` — every `World` field spelled out literally, so a new field on `World` or `NightState` fails `type-check` here until you add it. 40 × 1 map, `night.phase === 'won'` |
| `tests/sim.spec.ts` | asserts `SYSTEM_ORDER` **as a literal list**, and "mutates nothing but `world.tick` while the night is over" against that fixture |
| `tests/content.spec.ts` | has a test named *"carries no collect behaviour yet — the radii in the table are step 7"* asserting `behaviours.map(b => b.kind)` equals `['income']` for both economy towers. **You are expected to change it** |

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **The drop is a function call from `resolve.ts`, not a reaction to `enemyKilled`.**
   `crumbsSystem` runs at slot 10 and `resolveSystem` at slot 13, and `tick()` clears `world.events`
   at the **top** of the next tick — so a crumbs system that scanned `world.events` for `enemyKilled`
   would find an empty array forever. Export `dropCrumb(world, at, value)` from `crumbs.ts` and call
   it from `resolve.ts` beside the `enemyKilled` push, the same shape as `dealDamage` living in
   `combat.ts` and being called from `projectiles.ts`. **Do not reorder `SYSTEM_ORDER`** to dodge
   this: `tests/sim.spec.ts` pins it as a literal, and moving `crumbs` after `resolve` would put the
   age tick and the drop one tick apart for no gain.
2. **The crumb's value is `Math.max(1, Math.round(def.reward * world.difficulty.crumbIncomeMult))`,
   applied at drop.** At drop rather than at credit, so the pile's value is the number the player
   will be shown and merging sums numbers that are already final. The `max(1)` is what stops
   nightmare's 0.85 rounding a 1-crumb reward to nothing.
3. **`world.crumbs` stays a whole number**, so every credit is an integer. Income pays
   `Math.max(1, Math.round(crumbsPerPayout * crumbIncomeMult))` per payout — computed from the def
   each time, with no accumulator and no float carried on the world.
4. **Income pays on `world.tick % payoutIntervalTicks === 0`**, not on a per-tower timer. It needs no
   new field on `Tower`, nothing extra to serialise, and it lines the payouts up so 7C's `+N` popups
   arrive together. The consequence is a tower placed at tick 59 getting a full payout at tick 60;
   that is not farmable, because the sell refund is 70% at best and the purchase is not.
5. **`night.crumbsDropped` and `night.crumbsCollected` go on `NightState`**, beside
   `ticksSkippedTotal` — the exact precedent, a per-night stat reset with the night and read by step
   20. **Both are sums of crumb *value*, not counts of piles**: merging changes the number of piles,
   so a ratio of pile counts would measure nothing. Say so in a doc comment; `CONTENT.md` §8's
   `cleanliness = 40 × (crumbsCollected / crumbsDropped)` is the consumer.
6. **Tower income does not touch `crumbsDropped`.** Cleanliness measures litter left on the floor;
   an income tower's payout was never on the floor.
7. **The crumb system draws no randomness.** Merge target, claim order and (in 7B) rot are all
   deterministic. A system running every tick that touched `world.rng` would make the fridge draw and
   `RANDOM` targeting depend on how many crumbs happened to be lying about.
8. **`core/` carries no glyph for a crumb.** A crumb has no def; `value` is the only truth, and the
   size bands are a pure function of it written once in 7C's renderer. Do not put a `glyph` or a
   `size` field on `Crumb`.
9. **Merging skips claimed crumbs.** A pile halfway to a tower is not on the floor any more, and
   merging into it would make the new crumb's drawn position jump onto someone else's flight path.
10. **`isCollect(behaviour)` goes next to `isAttack` in `behaviours.ts`.** Three files want the
    narrowing (this system, 7C's renderer for the travel fraction, step 20's installation) and
    hand-writing `b.kind === 'collect'` in each is how the third one gets it wrong.
11. **A `CollectCrumb` naming a crumb that has gone is a silent no-op**, like `SellTower`. Several
    frames pass between the click and the tick, and the crumb may have been claimed and delivered in
    between.

## Build

### 1. `core/types.ts`

Add `crumbsDropped: number` and `crumbsCollected: number` to `NightState`, both starting at 0 in
`createWorld` and in `tests/fixtures/world.ts`. Nothing else on `World` changes — `Crumb` is already
complete.

### 2. `core/systems/crumbs.ts`

```
dropCrumb(world, at, value): Crumb          // merges or creates; called by resolve.ts
collectCrumb(world, crumb, byTowerId)       // the one exit door: credit, event, remove, reindex
crumbById(world, crumbId): Crumb | null
crumbsSystem(world)                          // age, claim, tick travel timers, deliver
```

- **Terminal phases run nothing.** Early-return on `phase === 'won' || 'lost'` the way every other
  system does, or `tests/sim.spec.ts`'s "mutates nothing but `world.tick`" goes red against a fixture
  whose night is already over.
- **Merge on spawn only** (`DECISIONS.md` §4, ~0.7 tiles). Scan `world.crumbPiles` for the nearest
  unclaimed pile within `MERGE_RADIUS_TILES` and, if there is one, add the value into it and return
  it. Do not run an O(n²) merge pass per tick. **Keep the existing pile's `ageTicks`** — the older
  age, not the newer and not the average. That is the design and it looks like a bug: a kill zone's
  pile rots on the clock of the *first* thing that died there, which is precisely the pressure the
  mechanic is for. Comment it or the next reader will "fix" it.
- **Claiming.** For each tower with a `collect` behaviour, find unclaimed crumbs within
  `radiusTiles` of the tower's tile and set `claimedByTowerId` and `travelTicksRemaining =
  travelTicks`. Iterate `world.towers` in array order and skip anything already claimed, so two
  towers with overlapping radii resolve the same way on a replay.
- **Release a stranded claim.** If `towerById(world, crumb.claimedByTowerId)` is null — the tower was
  sold mid-flight — clear the claim and put the crumb back on the floor. Without this the crumb sits
  in `collecting` forever: it never arrives, and (after 7B) it never rots either. The symptom is one
  pile frozen on the board for the rest of the night.
- **Delivery.** Decrement `travelTicksRemaining`; at 0, `collectCrumb(world, crumb, towerId)`.
- **`collectCrumb` is the only place a crumb is removed and the only place `crumbsCollected` moves.**
  Both doors — the click and the delivery — go through it, which is what makes "once and only once"
  a property of one function rather than of two call sites. It credits `world.crumbs`, adds to
  `night.crumbsCollected`, pushes `crumbCollected`, splices `world.crumbPiles` and **rebuilds
  `world.index.crumbPiles`** (see the note on `EntityIndex` in `core/types.ts`;
  `reindexEnemies` in `resolve.ts` is the shape). Skipping the reindex is silent: every later lookup
  reads out the wrong crumb.
- Age every crumb by one tick. **Do nothing at any age threshold** — 7B owns both of them, and a
  half-built rot stage here is one the next session has to unpick.

### 3. `core/systems/resolve.ts`

One call to `dropCrumb(world, at, valueFor(defId))` at the `enemyKilled` branch, using the `at` it
already computes. `night.crumbsDropped` increases here (or inside `dropCrumb` — pick one and say
which in a comment), including for the value merged into an existing pile.

### 4. `core/systems/commands.ts`

`case 'CollectCrumb'`: `crumbById` then `collectCrumb(world, crumb, null)`. `byTowerId: null` is what
distinguishes a click from a delivery in the event, which is what 7C's popup and step 8's summary
read. A claimed crumb that is clicked **cancels the claim and pays instantly** — which falls out for
free if you do not check `claimedByTowerId` here, so say in a comment that the omission is deliberate.

### 5. `core/systems/economy.ts`

Terminal-phase guard, then for each tower, for each `income` behaviour, pay on the interval per
decisions 3 and 4. No event: nothing consumes one, and `GameEvent` members are added by the step that
consumes them. (7C's `+N` for an income payout, if it wants one, can read the wallet delta or add the
event and say so.)

### 6. `core/content/towers.ts` and `tests/content.spec.ts`

Add `collect({ radiusTiles: 2.5, travelTicks: 90 })` to `toasterCrumbTray` and
`collect({ radiusTiles: 3, travelTicks: 90 })` to `cookieJar` — `CONTENT.md` §1's "2.5 collect" and
"3 collect", and 1.5 seconds is 90 ticks, not 1500. Then **rewrite** the *"carries no collect
behaviour yet"* test into one that asserts both radii and the travel time literally, the way the
income rates are asserted. Leave the Cookie Jar's step 10 `TODO` alone.

`travelTicks` is authored here **with nothing on screen to judge it by**; 7C watches a night and may
re-tune it. If it does, it edits both files, the same way step 6C re-tuned `projectileSpeed`.

## Tests

New `tests/crumbs.spec.ts`, plus the two edits named above.

- Two kills 0.5 tiles apart produce **one** crumb whose value is the sum; 1.2 tiles apart produce
  **two**. Assert the surviving pile's `ageTicks` is the older one's.
- A merge into a claimed pile does **not** happen: the claimed pile keeps its value and a second
  crumb appears.
- `CollectCrumb` credits exactly `value`, emits exactly one `crumbCollected` with `byTowerId: null`,
  removes the pile, and leaves `world.index.crumbPiles` correct for every remaining pile.
- A crumb claimed by a tower and then clicked at 30 ticks of travel remaining credits **once**:
  `world.crumbs` moves by exactly `value` and exactly one `crumbCollected` is emitted across the
  whole run.
- Two `CollectCrumb` commands for the same crumb id in one batch credit once and emit once.
- A tower sold while a crumb is in flight releases the claim; the crumb is still on the board and
  unclaimed on the next tick.
- **The ledger**: over a headless night driven the way `tests/night.spec.ts` drives one,
  `night.crumbsCollected` equals the summed value of every `crumbCollected` event, and
  `night.crumbsDropped` equals `crumbsCollected` plus the value still on the board. No rounding leak,
  no double-credit. 7B extends this same test with the rot door.
- A Toaster Crumb Tray pays `4 × payouts` over 600 ticks on `normal`, and the difficulty multiplier
  changes that number on `cozy` and `nightmare` — the assertion that catches the multiplier being
  dropped or applied twice.
- A world with crumbs on it survives `JSON.parse(JSON.stringify(world))` deeply equal.

## Acceptance

- [x] `core/` still imports nothing but itself and zod; nothing in `crumbs.ts` knows about pixels,
      clicks or glyphs.
- [x] `SYSTEM_ORDER` is unchanged and `tests/sim.spec.ts` is green.
- [x] Adding the two `collect(...)` descriptors touched `core/content/towers.ts` and
      `tests/content.spec.ts` and **no** other file in `core/systems/` — the behaviour vocabulary
      held.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 7B and 7C

The contract the next two sessions build against. If you change a signature, change it here too.

```
core/types.ts             NightState.crumbsDropped: number     // summed value, not pile count
                          NightState.crumbsCollected: number

core/systems/crumbs.ts    dropCrumb(world: World, at: Vec2, value: number): Crumb
                          collectCrumb(world: World, crumb: Crumb, byTowerId: EntityId | null): void
                          crumbById(world: World, crumbId: EntityId): Crumb | null
                          MERGE_RADIUS_TILES: number

core/content/behaviours.ts isCollect(behaviour: Behaviour): behaviour is CollectBehaviour

core/content/towers.ts    toasterCrumbTray  collect({ radiusTiles: 2.5, travelTicks: 90 })
                          cookieJar         collect({ radiusTiles: 3,   travelTicks: 90 })
```

Two things 7A settled that the contract above does not show:

- **`night.crumbsDropped` moves inside `dropCrumb`**, not at the call site in `resolve.ts`, so no
  future caller can drop a crumb without the ledger seeing it. `night.crumbsCollected` moves inside
  `collectCrumb` for the same reason.
- Both towers' 90 is one `COLLECT_TRAVEL_TICKS` const in `towers.ts`, so 7C re-tunes the trip in one
  place (and in `tests/content.spec.ts`, which asserts the 90 literally).

`Crumb.position` is a **tile-space float**, the space `samplePath` returns and `Tower.tile` is
written in. 7C maps it to pixels; nothing in `core/` does. A claimed crumb's `position` **does not
move** — 7C interpolates the flight for drawing and for hit-testing, so the click target and the
pixels cannot disagree.

## Do not

Do not build rot, the `rotting` stage, the Fruit Fly, or anything that reads `ageTicks` past
incrementing it — all of that is 7B, and a half-built threshold here is worse than none. Do not draw
anything, add a key or pointer handler, or write a hit test (7C). Do not add tile state or a
`spawnPressure` field (step 14 owns the substrate; see the index's *Reconciled while splitting*).
Do not touch the noise meter (step 13), the Cookie Jar's destruction penalty (step 10), the Honey
Pot (step 17), or the Broom and Dustpan installations (step 20) — the radius and the travel time are
already parameters, which is all step 20 needs from you.
