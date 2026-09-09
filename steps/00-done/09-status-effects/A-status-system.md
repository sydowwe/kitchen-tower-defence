# Step 9A — Statuses that land, and the two towers that apply one

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../../CLAUDE.md`, `../../../analytic-docs/CONTENT.md` §4 (the status table) and §1's
Act I rows for **Sticky Tape** and **Ice Cube Tray**. §3 (the matrix) only if you want to check a
multiplier by eye.
**Prereq:** step 8.

## Goal

Step 2C shipped the whole status vocabulary as pure functions and **nothing has ever called them**
outside their own spec. This session gives an attack an `applies` list, fills in the status system's
empty tick slot, routes damage-over-time through the tag matrix, and ships the two towers that need
no new geometry. Entirely headless apart from two English strings; 9C is what draws any of it.

## Already in the repo

| File | What's there today |
| --- | --- |
| `core/content/statuses.ts` | `STATUS_DEFS`, `applyStatus`, `tickStatuses`, `createStatus(kind, sourceId)`, `speedMultiplier`, `damageTakenMultiplier`, `armorStripStrength`. Complete, tested, and called by nothing |
| `core/systems/status.ts` | `statusSystem(_world) {}` — an empty stub whose comment already promises it runs before movement |
| `core/sim.ts` | `SYSTEM_ORDER`: `commands → spawn → wave → status → movement → targeting → combat → projectiles → …`. `tests/sim.spec.ts` pins it against a literal list — you are filling a slot, not adding one |
| `core/systems/combat.ts` | `dealDamage(world, enemy, base, damageType, sourceTowerId)` — matrix, hp, `enemyDamaged`. `combatSystem` finds **one** `attack` per tower, decrements the cooldown, then fires |
| `core/systems/projectiles.ts` | a module-local pool of dead projectiles. Its header note is load-bearing: **every field is overwritten on acquire**, and a projectile is released exactly once |
| `core/content/behaviours.ts` | twelve descriptors. Each factory **writes every field out** rather than spreading `params`, so a typo cannot travel into a save |
| `core/content/schema.ts` | the zod behaviour union, pinned `satisfies z.ZodType<Behaviour>` |
| `core/systems/placement.ts` | `placeTower` builds a `Tower` with `state: null`; `sellTower` splices, reindexes and emits `towerSold` |
| `core/types.ts` | `ActiveStatus` (`kind`, `remainingTicks`, `stacks`, `magnitude`, `sourceId`), `TowerState = { kind: 'charge', charges, rearmTicksRemaining }`, `Projectile` |
| `core/systems/movement.ts` | `distance += speed * speedMultiplier(enemy)` — a root already means "does not move"; only the test is new |
| `ui/locales/contentKeys.ts` | `TowerMessages` is keyed off `TOWERS`' ids: **a tower with no English entry fails `type-check`**, it does not render a raw key |

The specs that will break, so you plan for them rather than discovering them:

| Spec | Why |
| --- | --- |
| `tests/behaviours.spec.ts` | *"keeps a factory to exactly the descriptor keys"* asserts `Object.keys(attack({…}))` is exactly eight names. Adding `applies` fails it — add the key to the list |
| `tests/schema.spec.ts` | `BehaviourSchemaMatchesUnion` is an `Exact<>` type assertion. The union and the zod schema have to gain the field in the same commit or `type-check` fails |
| `tests/spawn.spec.ts` (~line 228) | a comment reading *"Nothing applies a status until step 9"*. It is now wrong; fix the comment |
| `tests/statuses.spec.ts` | asserts refresh-vs-stack, freeze suppressing slow, the burn cap and a root that never expires — over the **pure functions**. Do not restate any of them at system level |

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **`applies` on `attack`, `coneAttack`, `aura` and `pushback`, always present, defaulting to
   `[]`.** Not optional: the factories write every field out and the zod union is pinned
   `satisfies z.ZodType<Behaviour>`, so an optional field on one side and a default on the other is
   exactly the drift `Exact<>` exists to catch.
   **One shape in the descriptor, two in the params.** The descriptor is `StatusApplication[]` —
   `{ kind: StatusKind; magnitude: number | null }`, where `null` means "whatever the def says" —
   and the factory normalises a bare `'slow'` into it. So authoring stays `applies: ['slow']` and
   only a tower that actually overrides writes the object out, while exactly one shape is validated,
   saved and replayed. `attack()` already normalises `projectileSpeed ?? 0` in the same place for the
   same reason.
2. **Magnitude is overridable per application. Duration and stacking are not.**
   `../../../analytic-docs/CONTENT.md` §1 authors a DoT rate per *tower* — the Spray Bottle's 2/s,
   Vinegar Spray's 4/s, the Candle's 4/s aura, the Burner's 14/s — against §4's one status-wide 4/s,
   so the roster disagrees with the status table in three places before Act II is out. Duration and
   the stack cap have no such second source: they stay single-copy on `STATUS_DEFS`, and Ice Cube
   Tray's T3 ("slow becomes a 1.5s freeze") and the Candle's T3 ("burn stacks to 3") are step 12's
   to earn.
   **The override is a per-tick magnitude, bounded `[0, 1]` by the schema.** A speed fraction is
   never above 1 and 1 damage *per tick* is 60/sec, so the bound is what rejects the doc's
   per-second number pasted in — the same job `MAX_COOLDOWN_TICKS` does for a millisecond value.
   Author it through the `TICKS_PER_SECOND` divisor already in `towers.ts`, so the doc's number
   stays legible next to it.
   **Last application wins**, which is what both `STACK_RULES` entries already do with `magnitude`
   and `sourceId`. A `Math.max` there would leave a sold tower's stronger number running on an enemy
   for the rest of the effect, with nothing on the board to explain it.
3. **`ActiveStatus` gains `damageType: DamageType | null`**, set at application from the applying
   behaviour's own `damageType`. `StatusDef` carries the fallback for a source that has none — burn
   `'fire'`, poison `'chemical'`, `null` for the five that deal no damage. Reason: per-tick DoT has
   to go through `resolveDamage`, which takes a damage type; deriving it from the status *kind*
   alone would make a burn lit by an electric tower deal fire damage, and choosing it at each call
   site puts a copy in every interpreter. **Both merge functions in `STACK_RULES` copy `magnitude`
   and `sourceId` off the incoming status — copy `damageType` in the same breath**, or a
   re-application from a different tower leaves the first source's type running.
4. **Per-tick DoT emits no `enemyDamaged` event.** Burn is `5/60` = 0.083 damage per tick, and
   `render/layers/effects.ts` rounds the amount to key the glyph cache: every burning enemy would
   print a stack of `0`s sixty times a second and blow that layer's 32-number cap, taking the real
   hit numbers with it. Split the function instead — `applyDamage(world, enemy, base, type): number`
   (matrix, hp, no event) and `dealDamage(…)` as that plus the event. 9C's flicker is the feedback
   for DoT.
5. **An attack whose resolved damage is 0 emits no `enemyDamaged` either.** Sticky Tape is
   `damage: 0`; without this every root prints a floating `0` over the enemy.
6. **One application seam: `applyStatuses(target, applications, sourceId, damageType)` in
   `core/content/statuses.ts`**, next to `createStatus`. It needs no world, so it belongs with the
   vocabulary rather than in a system, and 9B's cone calls the same one. Two call sites each
   building their own `createStatus` is how the damage type ends up set on one path and null on the
   other — and now the override with it.
7. **`Projectile` gains `applies: readonly StatusApplication[]`, assigned by reference.** A slow
   lands when the ice cube arrives, not when it is fired, and the tower may be sold in between, so
   the projectile has to carry it. Assign the behaviour's own array — `projectile.applies =
   attack.applies` — rather than copying: a behaviour descriptor is immutable content that outlives
   every world, the reference is overwritten on acquire like every other pooled field, and copying
   an array of objects per shot allocates on the one path `../../../analytic-docs/ARCHITECTURE.md` §6
   budgets. **Never write through it.** Mutating that array edits the tower def for the rest of the
   session; the symptom is a tower whose second shot applies something its first one didn't.
8. **`placeTower` initialises `Tower.state` from a `charge` behaviour** —
   `{ kind: 'charge', charges: <the behaviour's>, rearmTicksRemaining: 0 }` — and leaves it `null`
   for every other tower. Nothing has ever filled the field in, and a tape placed with `state: null`
   silently has infinite charges.
9. **Charge *consumption* only, no state machine.** Step 10 owns `armed → firing → rearming` and
   towers that targeting skips while rearming. Sticky Tape's `rearmTicks` is 0 and nothing reads it
   this session.
10. **A spent tape is removed with no event and no refund.** Add `removeTower(world, towerId)` to
    `placement.ts` — splice plus reindex — and refactor `sellTower` to call it after paying.
    `TowerDestroyed` is step 10's event, and emitting `towerSold` with a refund of 0 would lie to a
    ledger the HUD reads.
11. **Ice Cube Tray targets `ground`** (`../../../analytic-docs/CONTENT.md` §1), and **Sticky Tape
    defaults to `CLOSEST`** — §5 gives `FIRST` to DPS and `STRONGEST` to burst, and a tape is
    neither.

## Build

### 1. `applies` across the vocabulary

`core/content/behaviours.ts`: `StatusApplication` and the params form it normalises from —

```
type StatusApplication = { kind: StatusKind; magnitude: number | null }
type StatusApplicationParam = StatusKind | { kind: StatusKind; magnitude?: number }
```

— the field on the four descriptors and their `*Params`, and one shared `toApplications(params)`
that every factory runs its list through. Four copies of a two-line normaliser is four places for
`?? null` to become `?? 0`, and a magnitude of 0 is a status that applies and does nothing.

`core/content/schema.ts`: the same four entries of the union, as
`z.array(z.object({ kind: statusKind, magnitude: z.number().min(0).max(1).nullable() }))`. The bound
is decision 2's, and it is the whole value of the field being validated at all. Then the two specs
above.

### 2. What an application carries

`ActiveStatus.damageType` in `core/types.ts`, the DoT fallback on `StatusDef`, the copy of **both**
new fields in the two `STACK_RULES` entries, `applyStatuses` per decision 6, and `createStatus`
growing two more parameters:

```
createStatus(kind, sourceId = null, damageType = null, magnitude = null): ActiveStatus
```

Positional and defaulted, not an options object, so step 2C's `createStatus('rooted', 7)` calls in
`tests/statuses.spec.ts` keep compiling untouched. `magnitude` falls back to `STATUS_DEFS[kind]`,
which seeds `ActiveStatus.magnitude` — so **every existing reader gets the override for free**:
`speedMultiplier`, `damageTakenMultiplier` and `armorStripStrength` already read the live field and
none of them changes.

### 3. `core/systems/status.ts`

```
for each enemy:
    for each status whose def.effect === 'damageOverTime':
        applyDamage(world, enemy, status.magnitude * status.stacks, status.damageType ?? def fallback)
    tickStatuses(enemy)
```

Four things that are easy to get wrong here, in the order they will bite:

- **The terminal-phase guard.** Every other system opens with
  `if (phase === 'won' || phase === 'lost') return`. Without it the night keeps burning enemies
  behind the summary screen.
- **`tickStatuses` runs last, per enemy, after the damage is read off.** Its docstring says why: a
  status with one tick left delivers this tick and is gone from the next one. Decrementing first
  costs every DoT in the game one tick of damage, which is a 2% error nothing will ever notice.
- **Do not remove a dead enemy here.** `resolveSystem` is the only place an entity leaves an array
  (see the note on `EntityIndex` in `core/types.ts`), and routing a burn kill through it gets you
  `enemyKilled`, the crumb drop and `night.enemiesKilled` for free.
- **`magnitude * stacks`, never `magnitude` alone.** Three stacks of burn is 15/sec, and the symptom
  of missing the factor is a tower that feels fine on one enemy and useless on a wave.
- No branch anywhere in this file on a status *kind*. `effect` is a field on the def precisely so
  the reads filter on it.

### 4. Wiring the two damage paths

Split `dealDamage` per decision 4. In `combat.ts`, an instant hit (`projectileSpeed: 0`) applies the
attack's statuses at the hit; in `projectiles.ts`, a projectile carries `applies` and applies them
on arrival, with `projectile.damageType` as the source type and `sourceTowerId` as the source.

### 5. Charges, and the tape that spends them

`placeTower` initialisation per decision 8, then two halves in two files:

- **The fire gate**, in `combatSystem`: a tower with a `charge` state fires only while
  `charges > 0`, and Sticky Tape roots **one enemy at a time** — skip it while any enemy carries a
  status of this tower's that ends when its source is spent. Filter on
  `durationTicks === UNTIL_SOURCE_SPENT` rather than on the kind `'rooted'`, and the scan needs no
  `Do not` fence when step 10 adds a second charge tower.
- **The spend is at the shot**, not at the release. `charges--` in `combatSystem` on the tick the
  tape fires. *This part was written the other way round — "the release scan, one tick later, finds
  no such enemy → `charges--`" — and the code proved it wrong: a freshly placed tape has no
  outstanding root either, so that rule burns all three charges on the tick it is built. Spending at
  the shot lands the same three roots with no marker field on `TowerState`.*
- **The retirement**, in `statusSystem` after the per-enemy pass: a `charge` tower at 0 charges with
  no outstanding status of its own is done with → `removeTower`. Scanning `world.enemies` rather
  than remembering the enemy's id on the tower keeps `TowerState` as it is, and — the real reason —
  it covers **both** ways a root ends. A version that hooks `enemyKilled` misses the enemy that
  reached the fridge and leaked, and the symptom is a tape that stands there forever. Requiring the
  scan to be clear is also what stops the tape being removed while a live root of its own is still
  holding an enemy, which would leave that root running with nothing to end it.
- The end of a root is noticed on the **following** tick, because `resolveSystem` runs ninth and
  this system first. That is fine and worth a comment; a tape that re-fires in the same tick its
  target died would be reading a dead enemy out of a stale index.

### 6. The two towers

`core/content/towers.ts`, as `TowerDefOf<'iceCubeTray'>` and `TowerDefOf<'stickyTape'>` like every
existing def, with the doc's numbers (§1, Act I) and the `perSecond()` helper already in the file:

- **Ice Cube Tray** 🧊 — `SLOW`, 110, 2 damage, 0.8/sec, range 3, cold, ground, noise 0, `off_path`,
  `applies: ['slow']`, `maxHp: 100`. Give it a projectile (the Salt Shaker's 0.1 tiles/tick is the
  only precedent; the doc has no column for it, so author it here and pin it in
  `tests/content.spec.ts` the way the Salt Shaker's is). **Cold is *weak* against `soft` (0.5×) and
  slightly strong against `armored` (1.2×)** — it is a control tower, not a DPS tower, and none of
  its 2 damage is meant to matter.
- **Sticky Tape** 🧻 — `CONTROL`, 40, 0 damage, 0.5/sec, range 2, ground, noise 0, `off_path`,
  `applies: ['rooted']`, `charge({ charges: 3, rearmTicks: 0 })`, `maxHp: 100`. A `damageType` is
  still required by the schema; `physical` with 0 damage is the honest filler.

Neither overrides a magnitude — both take the status table's number, so both author the bare-kind
form and the normaliser is exercised by the roster rather than only by a spec. The first real
override is 9B's Spray Bottle; the synthetic def in your tests is what pins the mechanism.

Then `ui/locales/en.ts` (both entries — the tone is `../../../analytic-docs/DECISIONS.md` §1:
understated, dry, never jokey), and `debug.hint`, which reads `'1-3 tower · …'` and is now `1-5`.

## Tests

This part and 9B carry every test in step 9. Yours are about the **wiring**, not about the pure
functions `tests/statuses.spec.ts` already covers. Put them in a new `tests/status.spec.ts`;
`tests/combat.spec.ts` has the fixture pattern to copy — `makeWorld`, `addEnemy`, `addTower`, and
`TOWERS.push` in `beforeAll` to register a synthetic def.

- A tower whose attack `applies: ['slow']` leaves exactly one `slow` on the enemy it hits, at
  `STATUS_DEFS.slow.durationTicks`, and that enemy's `distance` advances at 0.6× on the next tick.
- Burn from a **fire** source on a `fungal` enemy costs it `5/60 × 1.5` hp per tick. No v1 enemy is
  fungal until Mold at night 11, so build a synthetic one.
- Poison from a **chemical** source on that same enemy costs `4/60 × 2.5` — the second type, so a
  hard-coded `'fire'` fails here rather than shipping.
- Poison stacks to exactly 5 and a sixth application only refreshes the duration, driven by a firing
  tower rather than by `applyStatus` directly.
- A tower applying `{ kind: 'poison', magnitude: 2 / 60 }` costs its target **half** the per-tick
  damage the def's 4/60 would, while its duration and its cap of 5 are unchanged — the assertion
  that says which of the three numbers a tower may override.
- `applies: ['slow']` and `applies: [{ kind: 'slow' }]` produce the same descriptor, and a slow
  applied from either lands at `STATUS_DEFS.slow.magnitude`.
- In `tests/schema.spec.ts`, an application authored `magnitude: 2` — the doc's per-second value —
  is rejected with `applies` in the message, the way a millisecond cooldown already is.
- A rooted enemy's `distance` is unchanged after 120 ticks with `movementSystem` running.
- A tick in which an enemy burns produces **no** `enemyDamaged` event, and neither does a hit from a
  `damage: 0` attack.
- A projectile-carried status is absent the tick the tower fires and present the tick it arrives.
- A pooled projectile does not inherit the previous shot's `applies`: fire a status-applying tower,
  let it despawn, fire a plain one, assert the second target has no statuses.
- Sticky Tape roots one enemy at a time, spends a charge when that enemy dies, and is gone from
  `world.towers` after the third — with `world.index.towers` consistent with the array afterwards.

## Acceptance

- [x] Adding a fourth status-applying tower is a def in `core/content/towers.ts` plus an `en.ts`
      entry, and **no file in `core/systems/` changes**. This is the architecture checkpoint for the
      step; if it isn't true, the composition is wrong and this is the session to fix it.
- [x] No `kind === 'burn'`-style branch anywhere in `core/systems/status.ts`.
- [x] `core/` still imports nothing but itself and zod; `SYSTEM_ORDER` is unchanged.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 9B and 9C

The contract the next two sessions build against. If you change a signature, change it here too.

```
core/content/behaviours.ts StatusApplication      = { kind: StatusKind; magnitude: number | null }
                           StatusApplicationParam = StatusKind | { kind: StatusKind; magnitude?: number }
                           attack/coneAttack/aura/pushback all carry `applies: StatusApplication[]`
core/content/statuses.ts   applyStatuses(target: StatusHolder, applications: readonly StatusApplication[],
                                         sourceId: EntityId, damageType: DamageType | null): void
                           createStatus(kind, sourceId?, damageType?, magnitude?): ActiveStatus
core/systems/combat.ts     applyDamage(_world, enemy, base: number, damageType: DamageType): number
                           dealDamage(world, enemy, base, damageType, sourceTowerId): number
                           hasOutstandingSourceStatus(world, towerId: EntityId): boolean
core/content/statuses.ts   endsWithItsSource(status: ActiveStatus): boolean
core/systems/placement.ts  removeTower(world: World, towerId: EntityId): boolean
core/types.ts              ActiveStatus.damageType: DamageType | null
                           Projectile.applies: readonly StatusApplication[]
```

`applyDamage` takes the world and does not read it — hence the underscore, which `noUnusedParameters`
insists on. It is kept in the signature so both halves of the split read the same at every call site,
and so 9B's splash has it when it needs a position.

## Do not

Build `core/systems/hitbox.ts`, interpret `coneAttack`, or resolve splash — all three are 9B's, and
`coneAttack` gaining `applies` here is the *field*, not the interpreter. Draw anything: 9C owns the
status indicators, and an enemy with a slow on it looks exactly like one without until then. Add the
rearm state machine, tower HP or the barricade (step 10), auras (step 17), pushback (step 18) or
tile effects (step 14). Touch the dead zod `status` schema in `core/content/schema.ts` — see the
index's *Reconciled while splitting* §7 for why it stays.
