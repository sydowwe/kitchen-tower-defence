# Step 12B — The six tier-3 behaviours, and the vocabulary they need

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/CONTENT.md` §1 (*Upgrades*, and the
*Behaviour notes that aren't in the table*), §4 (the status table),
`../../analytic-docs/ARCHITECTURE.md` §4.
**Prereq:** step 12A.

## Goal

The six tier-3 upgrades that cannot be expressed as a number, and the smallest widening of the
behaviour vocabulary that expresses them. This is the last cheap chance to widen it before Act II's
content lands on top, so the test of every change below is "would a *second* tower gaining this
cost any code at all".

## Already in the repo

12A shipped the fold. Four tiers already work through it with no code — Salt Shaker splash,
Mousetrap rearm, and the two economy tiers — and those four are the shape the six below are trying
to get as close to as they can.

| File | What's there today |
| --- | --- |
| `core/content/behaviours.ts` | the twelve-member union and its factories. `aura`, `bait`, `suppress`, `pushback`, `tileEffect` are descriptors **with no interpreter**; the header says so and names the step that adds each |
| `core/content/behaviours.ts:38` | `StatusApplication = { kind, magnitude }`, with a comment saying **only** the magnitude is overridable and "duration and the stack cap have one source each and stay on the def". You are about to overrule that — see decision 4 |
| `core/content/behaviours.ts:454` | `BEHAVIOUR_KINDS`, asserted against the union in `tests/behaviours.spec.ts` |
| `core/systems/charges.ts:44` | `hasOutstandingSourceStatus` — a `some` over `world.enemies`. Two callers: `chargeAllowsFiring` and `retireSpentTowers` |
| `core/systems/barricades.ts:175` | `damageTower(world, tower, meleeDamagePerTick)` — the one place a chew lands, and where reflect goes |
| `core/systems/combat.ts:153` | `tower.cooldownTicks = firing.cooldownTicks` — one line per shot, for all three fire paths. The hit counter increments here |
| `core/systems/combat.ts:161` | the three-way fire path: cone / projectile / instant-splash / instant |
| `core/systems/targeting.ts:111` | `pickTarget(world, tower, reach)` and `bestBy`, documented as first-wins on a tie so replays don't diverge |
| `core/content/statuses.ts:196` | `createStatus(kind, sourceId, damageType, magnitude)` — three optional positionals, documented as positional on purpose |
| `core/content/statuses.ts:115` | `slow.suppressedBy: ['freeze']` — already exactly what the Ice Cube Tray's tier 3 needs |
| `core/sim.ts:56` | `SYSTEMS`, and `tests/sim.spec.ts` asserts `SYSTEM_ORDER` against a literal list |
| `render/layers/effects.ts` | the floating damage numbers, with a documented **32-number cap** keyed by rounded amount |

**Seven spec files hand-build a `Tower` literal** — `barricades`, `charges`, `combat`, `crumbs`,
`hitbox`, `light`, `status`. Decision 5 adds a field to `Tower`, so all seven fail `type-check` until
they get a line each. `tests/behaviours.spec.ts:128` asserts `Object.keys(attack(...))` is exactly
nine names and will need the tenth.

`steps/17-auras-and-zones.md` item 1 is "**`aura` behaviour**" — the interpreter. Decision 6 builds
it here. **Correct that step file in this commit**: item 1 becomes "the interpreter exists from step
12B; add the Candle and pair it with step 11's light registry".

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **Every change below is a field on an existing behaviour, defaulted so no current def changes.**
   Not a new union member, not a new `TowerState` kind, and never a branch on a tower id. The
   acceptance criterion is the whole point of the step: a second tower gaining any of these is a
   config object and no code.

2. **Two projectiles means two *targets*.** The Toaster one-shots every flyer in v1 (35 fire is 42
   against `air`; the Fly has 14 HP), so a second projectile at the same enemy is entirely wasted
   and the upgrade is a 350-crumb no-op the player cannot tell is working. So `targeting.ts` gains
   `pickTargets(world, tower, reach, count)` returning up to *count* distinct enemies in the tower's
   own mode order, and the fire path spawns one shot at each, repeating the last when fewer are in
   range.

3. **Reflect damage uses `applyDamage`, not `dealDamage`.** 8/sec is 0.133 per tick, and
   `dealDamage` publishes an `enemyDamaged` event that `render/layers/effects.ts` turns into a
   floating number — sixty `0`s a second per chewing enemy, blowing that layer's documented 32-number
   cap and taking the real hit numbers with it. This is exactly why burn already goes through
   `applyDamage`; the comment on that function says so.

4. **`StatusApplication` gains `durationTicks` and `stacks`, both nullable, both defaulting to the
   def's.** This overrules the comment at `behaviours.ts:38`. The reason that comment gave —
   "duration has one source" — stopped being true the moment a tier could author a 1.5-second freeze
   against a 4-second status def; a 4-second freeze on every fourth Ice Cube hit is a permanent
   freeze, so the number matters. Rewrite that comment rather than leaving it contradicting the
   type below it.

5. **The hit counter is `Tower.shotsFired: number`, not a second `TowerState` member.** A `TowerState`
   is a union and a tower has one — the Mousetrap needs both a magazine and a shot count, so a second
   member would be mutually exclusive with the thing it has to coexist with. It is one integer, it
   survives the JSON round-trip, and `tests/types.spec.ts` is satisfied.

6. **The aura interpreter is a new system with its own slot, `core/systems/aura.ts`, running
   immediately after `combat`.** Not a branch inside `combatSystem`: that loop opens by finding a
   firing behaviour and skipping every tower without one, and an aura tower has none. Give it step
   17's 6-tick interval now (`world.tick % 6`), on the world clock the way `economySystem` does, so
   that step collapses to adding the Candle.

7. **`pickTargets` keeps `bestBy`'s first-wins tie rule.** Take the best, exclude it, take the next.
   A `sort` is not stable enough to promise a replay reproduces which two enemies were shot, and the
   symptom is a divergence ten minutes in — the same reason `bestBy` is written the way it is.

## Build

### 1. `core/content/behaviours.ts` — six fields

| Behaviour | Field | Default | Wanted by |
| --- | --- | --- | --- |
| `AttackBehaviour` | `projectilesPerShot: number` | 1 | Toaster T3 |
| `BarricadeBehaviour` | `reflectDamagePerTick: number` | 0 | Cardboard Box T3 |
| `BarricadeBehaviour` | `reflectDamageType: DamageType` | `'physical'` | the same |
| `ChargeBehaviour` | `maxOutstanding: number` | 1 | Sticky Tape T3 |
| `StatusApplication` | `everyNthHit: number \| null` | null | Ice Cube Tray T3 |
| `StatusApplication` | `durationTicks: number \| null` | null | the same |
| `StatusApplication` | `stacks: number \| null` | null | Spray Bottle T3 |

Each gets its schema entry in `contentSchemas()` with a bound tight enough to reject the
per-*second* number pasted in from the doc — that is the whole job of every bound in that file.
`reflectDamagePerTick` is `z.number().min(0).max(0.5)`, matching `meleeDamagePerTick`'s reasoning
exactly: 8/sec is 0.133 here, so the bound is what rejects a bare `8`.

`toApplications` in that file is the one normaliser for all four factories carrying `applies`; the
three new fields normalise there and nowhere else. `?? null`, never `?? 0` — the comment above it
says why, and a `stacks` of 0 is a status that applies and does nothing.

### 2. The interpreters

- **`combat.ts`** — `tower.shotsFired++` beside the cooldown assignment at line 153, so it counts
  cone shots too. **Increment before the applies are computed**: incrementing after makes the first
  freeze land on shot 3 and the second on shot 7, which passes a casual look and fails the test
  below. Then filter `firing.applies` by `everyNthHit` (`null`, or `shotsFired % n === 0`) on all
  three fire paths, and loop `spawnProjectile` `projectilesPerShot` times over `pickTargets`.

  Gotcha: `projectile.applies` is assigned **by reference** off the behaviour (`projectiles.ts:87`,
  "nothing may write through it"). A filtered array is a new array and safe, but allocate it only
  when some application actually has an `everyNthHit` — otherwise every shot in the game allocates
  on the path `../../analytic-docs/ARCHITECTURE.md` §6 budgets against.

- **`charges.ts`** — `hasOutstandingSourceStatus` becomes `countOutstandingSourceStatuses`, and
  `chargeAllowsFiring` compares it against `maxOutstanding`. `retireSpentTowers` keeps asking `> 0`:
  a tape with three roots out and no charges left must not leave the board until the last one ends.

- **`barricades.ts`** — after `damageTower`, if `reflectDamagePerTick > 0`, `applyDamage` onto the
  chewing enemy through the matrix (decision 3). It is the enemy in hand in that loop, so this is
  four lines and no second query.

- **`statuses.ts`** — `createStatus` takes the duration and the stack count. It has three optional
  positionals already and the file says they are positional on purpose; a fourth and fifth is
  getting long, so converting the tail to an options object is a fair call if you make it in one
  move and update both call sites.

- **`targeting.ts`** — `pickTargets(world, tower, reach, count)` per decisions 2 and 7. Keep
  `pickTarget` as `pickTargets(...)[0] ?? null` so there is one ranking, not two.

- **`core/systems/aura.ts`** — new, plus its slot in `core/sim.ts` and the literal list in
  `tests/sim.spec.ts`. Every tower with an `aura` behaviour, every 6 ticks, `circle()` from step 9,
  `applyDamage` through the matrix, `applyStatuses` for whatever it carries. Skip the terminal
  phases like every other system.

  Gotcha: deal `damagePerTick * 6`, not `damagePerTick`. Ticking six times less often and dealing
  the same amount is a silent 6× nerf that nothing in the game reports and no test catches unless
  it is the test below.

### 3. The six tier-3s

Author them in `core/content/towers.ts` through 12A's `tier()`, and write the English into
`en.ts` — placeholder-quality, because **12C rewrites all forty strings against the inspector**.

- **Nightlight T3** — `addBehaviours: [aura({ radiusTiles: 4, damagePerTick: 6 / 60, damageType:
  'fire', targets: 'both' })]`. `fire` rather than `physical`: the matrix gives fire ×1.2 against
  `air` and physical ×0.5, and a lamp whose job is moths should not be the worst damage type against
  them. Radius 4 matches its own `reveal` — it damages what it attracts, so the two numbers are the
  same number and a comment should say so.
- **Sticky Tape T3** — `add: { maxOutstanding: 2 }` on `charge` (1 → 3). It already has 3 charges, so
  tier 3 is the tower holding all three roots at once instead of one at a time.
- **Cardboard Box T3** — `add: { reflectDamagePerTick: 8 / 60 }` on `barricade`.
- **Ice Cube Tray T3** — `applies` becomes `[{ kind: 'freeze', everyNthHit: 4, durationTicks: 90 },
  { kind: 'slow' }]`, in that order. **Freeze first is load-bearing and free**:
  `STATUS_DEFS.slow.suppressedBy` is already `['freeze']`, so on the fourth hit the freeze lands and
  `applyStatus` turns the slow away by itself — "a freeze *instead of* a slow" with no branch
  anywhere. Reversed, the slow lands and the freeze overwrites it, which is the same damage and a
  different story in the code.

  This one needs `replaceBehaviours`, or it needs the whole `applies` array authored as an `add` of
  a second entry. 12A's decision 2 ruled a replace out; take the second route if it works, and if it
  does not, add `replaceBehaviours` here and **write the reason back into 12A's decision 2**.
- **Toaster T3** — `add: { projectilesPerShot: 1 }` on `attack`.
- **Spray Bottle T3** — `add: { stacks: 1 }` on the poison application (1 → 2 per hit). "Twice as
  fast" is two stacks a hit rather than a halved cooldown: the poison cap is 5 and the tower reaches
  it in three sprays instead of five, which is what the doc's sentence is describing.

## Tests

- An aura ticking every 6 ticks deals exactly its per-second rate over 60 ticks. This is the
  assertion that catches the 6× nerf above.
- Aura damage routes through the matrix — the Nightlight's fire against an `air` enemy is ×1.2.
- Ice Cube Tray T3 freezes on exactly the 4th hit and then the 8th, and the enemy carries **no
  `slow`** on those two hits — that is the suppression rule doing the work, asserted rather than
  assumed.
- The freeze it lands runs 90 ticks, not the status def's 240.
- Spray Bottle T3 puts 2 poison stacks on per hit and still caps at 5.
- A tier-3 Sticky Tape roots three enemies at once, stays on the board while any of them is rooted,
  and leaves on the tick the last one ends.
- An enemy chewing a tier-3 Cardboard Box loses 8 HP per second, through the matrix, and
  `world.events` contains **no** `enemyDamaged` for it.
- A tier-3 Toaster with two flyers in range fires two projectiles at two different enemies; with one
  flyer in range it fires two at the same one.
- `SYSTEM_ORDER` matches the literal list in `tests/sim.spec.ts` with `aura` in it.
- A behaviour factory still produces exactly its descriptor's keys — extend the assertion at
  `tests/behaviours.spec.ts:128` rather than writing a second one.

## Acceptance

- [ ] No system file contains a branch on a tower id or a tier number. Every edit above reads a
      field of the vocabulary.
- [ ] Every tower in `TOWERS` has three real tiers; none is the empty placeholder 12A left.
- [ ] `steps/17-auras-and-zones.md` item 1 says the interpreter already exists.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 12C

```
core/systems/targeting.ts   pickTargets(world: World, tower: Tower, reach: Reach, count: number): Enemy[]
core/systems/aura.ts        auraSystem(world: World): void
core/types.ts               Tower.shotsFired: number
```

Nothing 12C needs beyond these and 12A's contract: the six tiers reach it through
`effectiveDef`, which already carries their behaviours.

## Do not

Add the Candle, the Gas Stove Burner, the Fly Paper or the Honey Pot — step 17 owns all four, and
the aura interpreter above is deliberately the *only* piece of it that arrives early. Do not
interpret `bait`, `suppress`, `pushback` or `tileEffect`: those descriptors stay uninterpreted, and
the steps named in their comments are what read them. Do not touch `TowerInspector.vue`,
`StatCard.vue`, `viewModel.ts` or `render/` — 12C owns every pixel and every line of the panel, and
the tiers above are meant to be invisible until it.
