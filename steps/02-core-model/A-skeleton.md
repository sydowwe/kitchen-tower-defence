# Step 2A — Skeleton: rng, types, commands, the tick

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, `../../analytic-docs/ARCHITECTURE.md` §2–3, `../../analytic-docs/CONTENT.md` §1–2 (skim the tables for what fields entities need).
**Prereq:** step 1.

## Goal

Every noun in the game as plain data, the one channel the player can change it through, and one
function that advances it by a tick. Nothing has behaviour yet. This is the skeleton the rest of
step 2 hangs content on.

## Build

### 1. `core/rng.ts`

Mulberry32. `createRng(seed)` returning
`{ next(): number, int(max): number, pick<T>(arr): T, chance(p): boolean, fork(): Rng }`.

The generator's state must be **serialisable** so a world can be snapshotted and resumed — the `Rng`
carries a plain numeric state field, not a closed-over variable that vanishes through
`JSON.stringify`. `fork()` derives a child stream from the parent's next value without otherwise
advancing the parent in a way that depends on how much the child is used.

Gotcha: `pick` on an empty array. Decide and document the behaviour now (throw), rather than
returning `undefined` and having it surface as a blank enemy on night 9. `noUncheckedIndexedAccess`
will force the question anyway.

`int`, `pick` and `chance` are all built on `next()` — the raw arithmetic lives in exactly one place.

### 2. `core/types.ts`

Plain objects, **no classes, no methods, no functions stored on any type**:

- `Enemy`: `id, defId, pathId, distance, hp, maxHp, statuses[], tags[], speed, stolenItems[], flags`
- `Tower`: `id, defId, tile, hp, maxHp, tier, targetingMode, cooldown, state` (`state` is the charge
  machines' slot), `totalInvested`
- `Projectile`, `Crumb`, `TileState`, `FoodItem`, `Wave`, `NightState`
- `World`: entities in arrays plus an `id → index` map, `tick`, `rng`, `crumbs`, `groceryMoney`,
  `noise`, `map`, `night`, `difficulty`, `events[]`

`World` must be a plain serialisable object.

Notes worth getting right now:

- Durations are **tick counts**, and field names should say so (`cooldownTicks`), because a field
  called `duration` will be filled with milliseconds by someone eventually.
- The `id → index` map is a lookup cache over the arrays. Whoever removes an entity has to rebuild
  it; say that in a comment at the map's declaration, since later steps remove entities.
- `flags`/`tags` are string-literal unions, not `string`, so a typo is a type error.

### 3. `core/commands.ts`

A discriminated union of player intents on a `kind` field: `PlaceTower`, `SellTower`,
`UpgradeTower`, `SetTargetingMode`, `CollectCrumb`, `CallWaveEarly`, `SetSpeed`. Every payload is
plain data (ids, tile coordinates, enum values) — never an entity reference, so a command log
serialises.

Plus a queue with `enqueue(cmd)` / `drain(): Command[]`. `drain` empties the queue and returns the
batch; the sim calls it exactly once per tick, at the tick boundary.

Gotcha: a command enqueued *while* the batch is being processed must land in the **next** batch, not
the current one. Draining into a fresh array (rather than iterating the live queue) is what makes
that true — and it is what the test below is checking.

### 4. `core/sim.ts` and `core/systems/`

`tick(world, commands)`. Drains the command queue first, then runs the systems in a **fixed,
documented order**. Write the order out as a comment at the top of the function:

`commands → spawn → status → movement → targeting → combat → projectiles → tiles → crumbs → noise → economy → resolve (deaths, leaks, win/lose) → events`

`world.tick` increments once per call, at one end or the other — pick one and say which in the
comment, because "is this tick's spawn before or after the increment" is the exact question someone
will have in step 5.

Stub every system as a no-op exported function in `core/systems/`, one file each, with the real
signature it will keep (`(world: World) => void`, plus the drained batch for the commands system).
`sim.ts` imports and calls them all in order.

## Tests

**RNG**

- Same seed → identical 1000-number sequence, asserted element-wise, not by checking a couple of values.
- Two rngs from the same seed advanced differently diverge and never re-sync.
- `fork()` does not disturb the parent: the parent's next 100 values are identical whether or not the
  fork was created and consumed.
- An rng round-tripped through `JSON.parse(JSON.stringify(rng))` and rehydrated continues the same sequence.

**Types**

- A type-level assertion that fails `type-check` if `World` gains a function-typed member — a
  `Serialisable<T>` conditional type applied to `World`.

**Commands**

- Commands enqueued during processing of a drained batch are drained at the *next* tick boundary,
  never mid-tick.
- `drain()` on an empty queue returns an empty array and does not throw.
- A command round-trips through `JSON.parse(JSON.stringify(cmd))` unchanged.
- The union is exhaustive: a `switch` over `kind` with a `never` default compiles.

**Sim**

- `tick()` advances `world.tick` by exactly 1.
- The systems array in `sim.ts` matches the documented order — assert against a literal list of names
  so a reorder in a later step has to be deliberate.
- `tick()` mutates nothing but `world.tick`, verified by deep-equality against a cloned world.

(The same-seed-worlds determinism test needs `createWorld`; it lives in step 2D.)

## Acceptance

- [x] `core/rng.ts` imports nothing; `core/types.ts` imports only `rng.ts`; `core/commands.ts`
      imports only `types.ts`.
- [x] No type in `types.ts` has a method.
- [x] Every name in the documented system order has a file in `core/systems/`.
- [x] `npm run test`, `npm run lint` and `npm run type-check` are green.

## Do not

Implement any system — movement is step 5, combat step 6, crumbs step 7. Do not execute any command;
this part defines the shapes and the queue only. Do not build worlds (step 2D) or add fields for
mechanics that don't exist yet (mold spread, burrow timers); the steps that own them add their own.
A stub that does real work "because it's only two lines" is how the order comment stops being true.
