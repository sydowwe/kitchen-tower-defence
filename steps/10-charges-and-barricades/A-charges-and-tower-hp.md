# Step 10A — The charge machine, tower HP, and the Mousetrap

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/CONTENT.md` §1 (the Act I table, the
*Behaviour notes* line for the Mousetrap, and *Economy rates* for the Cookie Jar),
`../../analytic-docs/DECISIONS.md` §9 change 3 (why tower HP ships now).
**Prereq:** step 9, including 9C.

## Goal

The rearm half of the charge machine, and the one path by which a tower takes damage and leaves the
board. Entirely headless — nothing new is drawn until 10C. The Mousetrap is the content that proves
the machine, and the Cookie Jar's destroy penalty is the second caller that proves the path is a
path and not a special case.

## Already in the repo

| File | What's there today |
| --- | --- |
| `core/content/behaviours.ts` | `charge({ charges, rearmTicks })`, `isCharge()`, `barricade()`. `IncomeBehaviour` is `{ crumbsPerPayout, payoutIntervalTicks }` |
| `core/types.ts` (~line 203) | `TowerState = { kind: 'charge'; charges; rearmTicksRemaining }`, with a comment saying step 10 "adds to the union" — it does not; fix it |
| `core/systems/placement.ts` | `initialState()` seeds `charges` and leaves `rearmTicksRemaining` at 0 with a comment naming this step; `removeTower()` (no event, no money) and `sellTower()`; `removeTower`'s comment reserves `towerDestroyed` for you |
| `core/systems/combat.ts` | the charge **gate** — `charges <= 0 \|\| hasOutstandingSourceStatus(...)` skips the tower — plus `hasOutstandingSourceStatus` itself, and the cooldown decrement with its "decrement first, then fire" note |
| `core/systems/status.ts` | `retireSpentTowers()`, which removes any charge tower at 0 charges with nothing outstanding. **Read this before you write a line** |
| `core/systems/targeting.ts` | `targetingSystem` refreshes every firing tower's target every tick and knows nothing about charges |
| `core/systems/spawn.ts` | `startWave()` (entry → `WaveSpawn[]`, incl. the round-robin over lanes for an entry with no `pathId`), `spawnEnemyAt()`, `spawnSystem` |
| `core/content/towers.ts` (~line 127) | `cookieJar` carries `TODO(step 10): drops 200 crumbs to the enemy side if destroyed`. You are here to delete that comment |
| `core/content/schema.ts` | `MAX_REARM_TICKS = 1800`; the bounds note already uses 6.6s → 396 as its worked example |
| `tests/status.spec.ts` (`Sticky Tape s three charges`) | asserts `tape.state` equals `{ kind: 'charge', charges: n, rearmTicksRemaining: 0 }` and that a spent tape is removed. Both must still pass |
| `tests/content.spec.ts` | pins every tower number literally, incl. `{ kind: 'charge', charges: 3, rearmTicks: 0 }` |
| `tests/behaviours.spec.ts` | `everyBehaviour` builds one of every kind through its factory and asserts the list against `BEHAVIOUR_KINDS`. Adding a **field** to `income` is free here; adding a **kind** is not |

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **The charge machine gets its own file, `core/systems/charges.ts`** — not a system, a module of
   helpers, the way `spatial.ts` and `placement.ts` already sit in that directory. Move
   `hasOutstandingSourceStatus` out of `combat.ts` and `retireSpentTowers` out of `status.ts` into
   it. **Three systems read the same machine** (targeting, combat, status), and the alternative is
   `targeting.ts` importing `combat.ts`, which already imports `isTargetable` from `targeting.ts` —
   an import cycle for a one-line predicate.
2. **No `phase` field on `TowerState`.** Export `chargePhase(tower): 'none' | 'armed' | 'rearming' |
   'spent'`, derived from the two numbers already there. A stored phase is a second truth that can
   disagree with the counter, and it goes into every save and every replay. 10C reads this rather
   than re-deriving `charges === 0 && rearmTicksRemaining > 0` in the renderer.
3. **The firing gate is `charges > 0`, and both `targetingSystem` and `combatSystem` ask the same
   exported predicate.** `targeting.ts`'s own header says why: a tower the targeting system serves
   and the combat system does not is a tower that aims and never shoots. The step's "towers in
   rearming are skipped by targeting" is the one-charge case of this.
4. **The rearm ticks down in the `status` slot (4th), not beside the cooldown in `combat` (7th).**
   `targeting` runs 6th, so a rearm that completes in the 4th slot is visible to targeting on the
   same tick and the gap between two Mousetrap shots is exactly `rearmTicks`. Decrementing in combat
   costs one extra tick per cycle and turns the assertion below from 396 into 397.
5. **A rearm restores one charge, not all of them**: `charges = min(charges + 1, behaviour.charges)`,
   and the timer restarts while still below the maximum. Generic, and it is what step 17's Fly Paper
   and step 12's tier upgrades need. The timer starts on a fire only if it is not already running, so
   a multi-charge tower emptying its magazine does not reset its own clock.
6. **A tower is *spent* only when it can never rearm** — `charges <= 0 && rearmTicks === 0`.
   `retireSpentTowers` currently tests `charges <= 0` alone. **This is the bug that will eat your
   afternoon:** a Mousetrap fires, drops to 0 charges, and is deleted from the board on the same
   tick, with no refund, no event and no message. It reads exactly like a crash.
7. **`damageTower` and `destroyTower` live in `placement.ts`**, beside `removeTower` and `sellTower`
   — that file already owns a tower's whole life cycle. `destroyTower` is *the* path off the board
   for a killed tower: penalty, then `towerDestroyed`, then `removeTower`. 10B and step 13 both call
   it, and a second removal path is how a Cookie Jar killed by noise pays nothing.
8. **No `towerDamaged` event.** Nothing consumes one — the HP bar reads `tower.hp` directly — and a
   `GameEvent` member is added by the step that reads it. `economy.ts`'s header states the same rule.
9. **The destroy penalty is a field on `IncomeBehaviour`, not a new behaviour kind**:
   `enemyCrumbsOnDestroy: number`, defaulting to 0. `../../analytic-docs/CONTENT.md` §1 puts the 200
   in the *Economy rates* table beside the 9/sec, which is what it is a property of. A thirteenth
   union member would cost a schema entry, a `BEHAVIOUR_KINDS` line and a `behaviours.spec.ts` update
   for one number; a branch on `defId` in a system file is what the content rule forbids outright.
10. **The penalty is a burst of extra spawns, bought from the running wave's own composition.** The
    algorithm, so it is not invented three ways: take the authored entries of
    `getNightDef(night.nightId).waves[night.waveIndex]`, walk them in order **repeatedly**, buying
    one enemy at a time at `getEnemyDef(entry.enemyDefId).reward`, until the budget cannot afford the
    cheapest entry left. Each entry that bought anything becomes a `WaveSpawn` cursor appended to
    `night.wave.spawns`, with `nextSpawnTick = world.tick` and the entry's own `spacingTicks`.
    So night 1 gets ants and night 5 gets beetles without the penalty knowing either name.
11. **Extract the entry → cursors translation out of `startWave`** as `cursorsFor(world, entry,
    count): WaveSpawn[]`, and let both `startWave` and the penalty call it. That is what carries the
    round-robin over lanes and the unknown-path throw into the penalty for free.
    *Built:* `cursorsFor` reads `entry.startDelayTicks` for its `nextSpawnTick`, and the penalty
    passes `{ ...entry, startDelayTicks: 0 }` — that is how decision 10's `nextSpawnTick =
    world.tick` is expressed without a second parameter. The throw moved with it, so it no longer
    knows the night id; `startWave` catches and re-throws with `night '<id>' wave N:` prefixed,
    which is what keeps `tests/spawn.spec.ts`'s "throws with both ids" passing.
12. **Mousetrap: one number, 396 ticks, for both `cooldownTicks` and `rearmTicks`.** §1's 0.15/sec
    and its 6.6s rearm are the same interval written twice, and `perSecond(0.15)` would be 400 — four
    ticks longer, which makes the rearm dead machinery and the balance sheet a lie. `round2(60 /
    396)` is 0.15, so the shop card still shows the doc's rate.
13. **Append to `TOWERS`, never reorder it.** The shop renders `TOWERS` order and prints
    `index + 1` on each button; reordering silently rebinds every hotkey the player has learned.

## Build

### 1. `core/systems/charges.ts`

`hasOutstandingSourceStatus` and `retireSpentTowers` move here unchanged apart from decision 6, plus:

- `chargeBehaviourOf(def)` / `chargeStateOf(tower)` — whatever narrowing the four call sites share.
- `chargeAllowsFiring(world, tower): boolean` — `true` for every tower with no charge state;
  otherwise `charges > 0 && !hasOutstandingSourceStatus(world, tower.id)`.
- `spendCharge(tower, behaviour)` — decrements, and starts the rearm timer per decision 5.
- `tickRearms(world)` — decision 4's per-tick half.
- `chargePhase(tower)` — decision 2.

Then: `targetingSystem` skips a tower `chargeAllowsFiring` says no to (leaving `targetEnemyId` null,
which is what "never consumes a target" means); `combatSystem`'s existing inline gate becomes the
same call and its `state.charges--` becomes `spendCharge`; `statusSystem` calls `tickRearms(world)`
before `retireSpentTowers(world)` and its file header gains the rearm.

Gotcha: `retireSpentTowers` iterates **descending** because `removeTower` splices. Keep that; a
forward loop skips the tower after every one it takes out.

### 2. Tower HP (`core/systems/placement.ts`, `core/types.ts`)

- `damageTower(world, tower, amount): void` — flat, clamped at 0. **It does not go through
  `resolveDamage`**: that function is damage-type × *enemy tag*, and a tower has no tags.
- `destroyTower(world, towerId): boolean` — the penalty, then
  `{ kind: 'towerDestroyed', towerId, defId, tile }` onto `world.events`, then `removeTower`. The
  event carries the tile because 10C draws something where the tower was, and the defId because it
  needs the glyph.
- Whoever damages a tower is responsible for calling `destroyTower` when `hp` reaches 0 — 10B's
  chew system is the only caller in v1. Keep the two functions separate: step 13 wants to destroy a
  tower without a damage number, and `destroyTower` on an id already gone is `false`, not a throw
  (the `sellTower` precedent).

### 3. The Cookie Jar penalty (`core/systems/spawn.ts`, `core/content/behaviours.ts`, `schema.ts`)

`enemyCrumbsOnDestroy` per decision 9 — added to `IncomeBehaviour`, `IncomeParams` (optional,
`?? 0`), the zod `income` object (`z.number().int().min(0).max(10_000)`) and
`tests/behaviours.spec.ts`'s `everyBehaviour` entry. Then `cursorsFor` per decision 11 and
`spawnDestroyPenalty(world, crumbs)` per decision 10, called from `destroyTower`.

Gotchas, both worth four lines each:

- **Appending cursors holds the wave open.** `hasFinishedSpawning` is what gates the countdown to
  the next wave and `emitClearedWaves`; a wave with a live penalty cursor is not finished spawning.
  That is the penalty being real, and it is the reason the burst is bounded by a budget rather than
  being a multiplier.
- **`night.wave` is null before wave 0** and the wave index may have no authored wave. Skip the
  penalty rather than throwing — and note in the code that nothing in v1 can destroy a tower during
  `'building'` anyway.

Then delete the `TODO(step 10)` on `cookieJar`, set `enemyCrumbsOnDestroy: 200` on its `income`, and
add the rule to `../../analytic-docs/DECISIONS.md` §4 as one bullet — the step asks for it to be
written down, and §4 is where the crumb economy lives.

### 4. The Mousetrap (`core/content/towers.ts`, `ui/locales/en.ts`)

`../../analytic-docs/CONTENT.md` §1, Act I: 90 crumbs, 60 damage, 0.15/sec, range 1, physical,
ground, noise **2**, `off_path`, and §1's behaviour note gives `STRONGEST` and the 6.6s rearm.
`maxHp: 100` matches every non-wall tower's precedent, `role: 'BURST_DPS'`, glyph 🪤.

`projectileSpeed: 0` — a trap snaps; the hit lands the tick it fires, with no `Projectile` entity at
all. `behaviours: [attack({...}), charge({ charges: 1, rearmTicks: 396 })]`, both tick counts from
the one named constant per decision 12.

Write the `en.ts` entry now; 10C revises it after seeing the card. `../../analytic-docs/DECISIONS.md`
§1 sets the voice — understated, dry, never jokey.

## Tests

In `tests/status.spec.ts`'s neighbourhood or a new `tests/charges.spec.ts`, your call — but do not
restate what `status.spec.ts` already asserts about the tape.

- A Mousetrap that has fired is **not** removed from the board, while a spent Sticky Tape still is —
  the same tick, in the same world. This is decision 6, and it is the one that silently deletes the
  tower.
- A rearming Mousetrap ends the tick with `targetEnemyId === null` even with two enemies in range,
  and a Salt Shaker beside it targets normally. It also fires nothing: no `towerFired` event.
- The ticks a Mousetrap fires on are exactly 396 apart over three cycles, and the same set of ticks
  comes out whether `tick()` is called once or three times per loop iteration — a rearm scaled by a
  `dt` would not survive the second form.
- After a rearm completes, `charges` is 1 and `rearmTicksRemaining` is 0; a tower with `rearmTicks:
  0` never leaves 0. **With nothing in range on that tick** — the rearm lands in the 4th slot and
  combat runs 7th, so a trap with a target spends the restored charge on the same tick it gets it
  (which is the assertion above, and why the two are separate tests).
- `damageTower` past 0 hp clamps at 0 and emits nothing on its own; `destroyTower` emits exactly one
  `towerDestroyed`, takes the tower out of `world.towers` **and** `world.index.towers`, and returns
  `false` for a second call on the same id.
- Destroying a Cookie Jar during a wave appends cursors whose enemies are worth 200 crumbs at that
  wave's own `reward` prices and no more; destroying a Salt Shaker appends none. Destroying one with
  `night.wave === null` changes nothing and does not throw.

## Acceptance

- [x] `SYSTEM_ORDER` is unchanged — this part adds no tick slot, and `tests/sim.spec.ts` still passes
      untouched.
- [x] No system file branches on a tower id. The penalty reads a behaviour field; the gate reads a
      behaviour kind.
- [x] `core/` still imports nothing but itself and zod, and no import cycle appeared between
      `targeting.ts`, `combat.ts` and `charges.ts`.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 10B and 10C

These exports are the contract the next two sessions build against. If you change a signature, change
it here too.

```
core/systems/placement.ts   damageTower(world: World, tower: Tower, amount: number): void
                            destroyTower(world: World, towerId: EntityId): boolean
core/systems/charges.ts     chargeAllowsFiring(world: World, tower: Tower): boolean
                            chargePhase(tower: Tower): 'none' | 'armed' | 'rearming' | 'spent'
                            tickRearms(world: World): void
core/systems/spawn.ts       cursorsFor(world: World, entry: WaveEntry, count: number): WaveSpawn[]
                            // `WaveEntry` is inferred, not declared: export it from schema.ts beside
                            // `NightDef` rather than hand-writing a second copy of the shape.
core/types.ts               GameEvent | { kind: 'towerDestroyed'; towerId: EntityId; defId: DefId; tile: Vec2 }
```

`amount` is already-final damage: nothing between `damageTower` and `tower.hp` scales it.

## Do not

Damage a tower from anywhere — 10B builds the only thing in v1 that does, and a temporary caller here
is a second damage path that will not get deleted. Do not build the barricade system, add
`meleeDamagePerTick`, or author the Cardboard Box (all 10B). Do not draw anything: the HP bar, the
armed/rearming treatment and the destruction puff are 10C's, and `render/` is not this session's
directory. Do not add tower repair, and do not touch the noise meter — `towerFired` already carries
`def.noise` and step 13 is what reads it.
