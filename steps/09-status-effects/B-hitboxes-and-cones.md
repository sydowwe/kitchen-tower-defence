# Step 9B — Hitbox shapes, the cone interpreter, and the Spray Bottle

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/CONTENT.md` §1 (Act I — the **Spray Bottle**
row), §2 (the **Beetle** row), §6 (nights 4–7 of the schedule),
`../../analytic-docs/ARCHITECTURE.md` §6 (the range-query budget).
**Prereq:** 9A.

## Goal

The second reusable system: hitboxes that are not a single target. Three query functions, an
interpreter for the `coneAttack` descriptor that has been sitting inert since step 2B, and the first
tower and enemy that need them. Headless, apart from two English strings and one decor glyph.

## Already in the repo

| File | What's there today |
| --- | --- |
| `core/systems/spatial.ts` | `queryEnemiesInRange(world, center, radiusTiles, filter?)` — **the seam every range question in the simulation goes through**, so the uniform-grid hash ARCHITECTURE.md §6 names can drop in behind it without touching a caller. Squared distances, results in `world.enemies` order, which is what makes every tie-break downstream deterministic |
| `core/systems/targeting.ts` | `pickTarget(world, tower, attack: AttackBehaviour)`, `isTargetable(enemy, targets)`, `bestBy` (first-wins on a tie, deliberately not `sort`). Every tower's target is refreshed every tick, before `combat` runs |
| `core/systems/combat.ts` | `combatSystem` finds one `attack` per tower, decrements the cooldown, emits `towerFired` with the def's `noise`, then either spawns a projectile or hits |
| `core/systems/projectiles.ts` | arrival, `dealDamage`, `pierce`. `Projectile.splashRadiusTiles` is carried off the behaviour and **never read**; the comment says step 12 owns the query. That comment is what you are replacing |
| `core/content/behaviours.ts` | `ConeAttackBehaviour` — `damage`, `damageType`, `cooldownTicks`, `rangeTiles`, `coneHalfAngleDeg`, `targets`, and 9A's `applies`. No `projectileSpeed`: a cone lands the tick it fires. `isAttack` is the only narrowing helper |
| `core/path.ts` | `samplePath` returns `{ x, y, angle }` with `angle = atan2(dy, dx)` — the convention every angle in the codebase follows |
| `core/content/nights.ts` | nights 1–3, and a header note worth reading before you author a wave: **what sets the pace is the spawn window against the crossing, not the wave count** |
| `core/content/maps/counter.json` | one lane, `crack`, 31.12 tiles; decor includes **🧴 at (18, 11)** — the Spray Bottle's own glyph |
| `core/world.ts` | `createWorld` throws when `night.mapId` is not the map it was handed |
| `ui/views/GameView.vue` | `MAP_ID = 'counter'`, and *Continue* steps through `NIGHTS` and stops at the last |
| `tests/combat.spec.ts` | the fixture pattern to copy: a 40-tile straight lane, `addEnemy` / `addTower`, and synthetic defs pushed into `TOWERS` in `beforeAll` and spliced out in `afterAll` |
| `tests/content.spec.ts` | asserts each roster def against the doc literally, and that no night schedules the Fruit Fly — that one now covers your four new nights for free |

## Decisions already made

Override one only if the code proves it wrong — and then edit this file, don't leave it lying.

1. **`core/systems/hitbox.ts`, three functions, all built on `queryEnemiesInRange`** and all taking
   `world` first with an optional `filter` last, exactly like it. They are shape filters over the
   seam, never a second traversal of `world.enemies` — the whole point of the seam is that there is
   one place to make the query fast.
2. **Angles are radians** and match `samplePath().angle`; the half-angle argument is **degrees**,
   because `coneHalfAngleDeg` is what content authors and the schema bounds. Convert once, inside
   `cone`.
3. **`pickTarget`'s third parameter widens to a structural `{ rangeTiles: number; targets:
   TargetClass }`.** A cone then picks its aim with the six existing modes and no branch, and
   `AttackBehaviour` still satisfies it. Widening beats a union parameter: the six modes do not care
   which descriptor they came from.
4. **A cone aims at the chosen target and then hits everything in the wedge.** One target choice,
   many hits — that is what makes it the crowd answer.
5. **There is no `aoeAttack` kind and there must not be one.** Instant AoE is `attack` with
   `splashRadiusTiles > 0`, resolved through `circle` in **one** helper that both the instant path
   and the projectile arrival call.
6. **`Projectile` gains `targets: TargetClass`.** Splash needs the filter and the projectile
   outlives the tower that fired it. Two lines and one pooled field now, against a ground-only
   splash silently hitting flyers in step 12 — and like `applies`, it is overwritten on acquire.
7. **The Spray Bottle defaults to `CLOSEST`** — `../../analytic-docs/CONTENT.md` §5: `FIRST` for
   DPS, `STRONGEST` for burst, `CLOSEST` for auras and cones.
8. **Nights 4–7 are authored on the Counter** (`mapId: 'counter'`). §6 puts them on the Sink and in
   the Pantry, but neither map exists until step 21, which authors all five and re-wires the
   campaign; `createWorld` throws on the mismatch and `GameView.vue` only ever passes `'counter'`.
9. **The nights are a draft.** 9C re-tunes them after watching them at 1× and 3×, the way step 5C
   tuned nights 1–3. Get the arithmetic right — counts, spacing, the spawn window against the
   crossing — and leave the feel to the session that can see it.
10. **The 🧴 collision is fixed on the decor side.** CONTENT.md §1 fixes the tower's glyph, so
    `counter.json`'s decor at (18, 11) becomes something else (🧼 reads as the same kitchen). A tower
    and a piece of scenery cannot share a silhouette — step 7C found the same thing with the Cookie
    Jar and the bread, and wrote it into `towers.ts`.
11. **The Spray Bottle's poison is authored at §1's 2/s, as a per-application override.** §1's row
    says "3 + 2/s" and §4 says Poison is 4 dmg/s — and both are right about different things: 9A
    made the magnitude, and only the magnitude, overridable for exactly this case, so the status
    table keeps the default every other source takes and the tower carries the rate its own row
    gives it. **You are the first content to use the override**, so it is worth reading 9A's
    decisions 1 and 2 before authoring the def: `applies: [{ kind: 'poison', magnitude: 2 /
    TICKS_PER_SECOND }]`, through the divisor already in `towers.ts`, and a bare `2` is rejected by
    the schema's `[0, 1]` bound rather than dealing 120 damage a second.

## Build

### 1. `core/systems/hitbox.ts`

```
circle(world, center: Vec2, radiusTiles, filter?): Enemy[]
cone(world, origin: Vec2, directionRad, radiusTiles, halfAngleDeg, filter?): Enemy[]
line(world, from: Vec2, to: Vec2, widthTiles, filter?): Enemy[]
```

- `circle` is `queryEnemiesInRange` under a name that says what it is — keep it as a wrapper rather
  than making callers pick between two names for one question.
- `cone` filters that result by angle. **Wrap the angle difference into `[-π, π]`** — `atan2`
  returns `(-π, π]`, so a tower aiming left has a facing near ±π and a raw subtraction gives a
  difference near 2π. The symptom is a cone that works perfectly on three quarters of the board and
  hits nothing at all on the fourth, which reads as a targeting bug rather than an arithmetic one.
- An enemy at distance 0 from the origin has no angle (`atan2(0, 0)` is 0). Count it as inside, and
  say so in a comment: it is inside every other shape too.
- `line` projects onto the segment with `t` **clamped to `[0, 1]`**, never onto the infinite line —
  `nearestOnPath` in `core/path.ts` has the same clamp and the same reason next to it. Prefilter
  through `circle` around the midpoint with a radius of half the length plus half the width, so it
  is still one traversal. Nothing in v1 calls it; it is here because it is four lines next to the
  two that are needed and several Act III towers want it.

### 2. The cone interpreter

`targetingSystem` and `combatSystem` both find the first behaviour that is an `attack` **or** a
`coneAttack` — add `isConeAttack` beside `isAttack` rather than hand-writing the check in two files.
Targeting is unchanged past decision 3. In combat: keep the cooldown decrement and the `towerFired`
event exactly where they are, then aim at the target's position, query `cone`, and for each enemy in
the wedge deal the damage and call 9A's `applyStatuses`. A tower definition can then say "cone,
3 tiles, chemical, applies poison" in one object, which is the acceptance criterion below.

Gotcha: the direction comes from `enemyPosition(world, target)`, which is null for an enemy whose
path is missing (a half-edited map out of step 4's editor). Every caller in `core/` skips such an
enemy rather than throwing; do the same, or a saved map from the editor takes the whole tick down.

### 3. Splash through `circle`

One helper next to `dealDamage`, called from the projectile arrival and from the instant path.
**The primary target is inside the circle** — deal damage to the queried set and nothing else. Hitting
the target *and* the circle double-damages it, and the symptom is a damage total that looks exactly
like the tag matrix being applied twice. Filter by `projectile.targets`, and fix the now-wrong
comment in `projectiles.ts` while you are there: step 12 still owns the first *content* with a
non-zero radius, but the query is no longer its to build.

### 4. Spray Bottle and Beetle

`core/content/towers.ts`, `core/content/enemies.ts`, both as the existing `TowerDefOf` /
`EnemyDefOf` shapes, both with an `en.ts` entry (a def without one fails `type-check`, it does not
render a raw key), both pinned literally in `tests/content.spec.ts` like every other def:

- **Spray Bottle** 🧴 — `DOT`, 120, `coneAttack` 3 damage at 1.2/sec (the file's `perSecond` helper),
  range 3, `coneHalfAngleDeg: 30`, chemical, **both** targets, noise 0, `off_path`, `maxHp: 100`,
  and poison at §1's 2/s per decision 11. Pin the override in `tests/content.spec.ts` with the
  `magnitude * 60` form the Ant's speed assertion uses, so a per-second value pasted in fails there
  as well as at the schema.
- **Beetle** 🪲 — 55 HP, 0.7 tiles/sec, reward 10, **steals 2**, tags `ground, bug`. Neither tag has
  a matrix row, so it takes every damage type at 1.0: what makes it a bruiser is 5.5 Ants' worth of
  HP crossing in ~44 seconds, and it is the first enemy that costs you two items when it lands.

Then `debug.hint` in `en.ts`, which 9A left reading `1-5`.

### 5. Nights 4–7

`core/content/nights.ts`, following the file's own header and the shape of `night03`: 8, 9, 9 and 10
waves (§6). Night 4 is Ants and Roaches with the pressure up; **night 5 introduces the Beetle**,
which is the night the step's acceptance criterion is about; 6 and 7 tighten. Export them from
`NIGHTS`, in order.

- **A wave's spawn window should be about as long as the gap that follows it.** A wave that spawns
  in three seconds and then waits twelve is a clump followed by a stare.
- The Beetle crosses in ~44 seconds against the Ant's ~31 and the Roach's ~17, so a Beetle released
  with a wave is still walking when the next one arrives. That overlap is the point — waves overlap
  by design — but count it when you set the countdowns, or night 5 stacks up three waves' worth of
  bruisers.
- Introduce the Beetle the way night 3 introduced the Roach: two of them, well behind the wave's
  Ants, far enough apart to be watched one at a time.
- `en.ts`'s `night.continueUnavailable` has a comment saying night 3 is the last one authored. Fix
  the comment; the string itself still reads correctly.

## Tests

You and 9A carry every test in step 9. A new `tests/hitbox.spec.ts` for the geometry, plus the
literal content assertions in `tests/content.spec.ts`.

- A cone at 30° half-angle hits an enemy 25° off-axis and misses one at 35°.
- A cone facing left (direction ≈ π) hits an enemy directly in front of it. This is the wrap
  assertion, and it is the one that fails first.
- A cone excludes an enemy inside the wedge but past `rangeTiles`, and one inside the radius but
  behind the tower.
- A cone respects `targets`: an air enemy in the wedge of a ground-only cone takes nothing.
- One Spray Bottle shot damages three enemies in its wedge and poisons all three, on one cooldown.
- Splash through `circle` hits the primary target **exactly once**, and a ground-only splash leaves
  a flyer in the radius untouched.
- `line` includes a point 0.4 tiles beside a 1-tile-wide segment, excludes one 0.6 beside it, and
  excludes one a tile past the segment's end — the clamped-projection assertion.
- Nights 4–7 validate at boot (they already do through `tests/content.spec.ts`'s full-collection
  check) and every entry names the `crack` lane, so `startWave`'s unknown-path throw cannot fire.

## Acceptance

- [ ] A tower that says "cone, 3 tiles, chemical, applies poison" in one config object works with no
      further edit to `core/systems/` — the same architecture checkpoint 9A made for statuses.
- [ ] `core/systems/hitbox.ts` contains no distance loop of its own: every shape goes through
      `queryEnemiesInRange`.
- [ ] Nights 4–7 play to the end from *Continue*, and night 5 is noticeably harder without a crowd
      answer than night 4 was.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 9C

```
core/systems/hitbox.ts     circle(world, center: Vec2, radiusTiles, filter?): Enemy[]
                           cone(world, origin: Vec2, directionRad, radiusTiles, halfAngleDeg, filter?): Enemy[]
                           line(world, from: Vec2, to: Vec2, widthTiles, filter?): Enemy[]
core/content/behaviours.ts isConeAttack(behaviour): behaviour is ConeAttackBehaviour
core/systems/targeting.ts  pickTarget(world, tower, reach: { rangeTiles: number; targets: TargetClass }): Enemy | null
core/types.ts              Projectile.targets: TargetClass
```

The Spray Bottle has **no range preview and no stat lines on its shop card** when you hand over:
`rangeOf` in `ui/interaction.ts` and `statsFor` in `ui/viewModel.ts` both find their numbers through
`isAttack`, and a cone tower has no attack behaviour. That is 9C's first job and it is expected, not
a regression.

## Do not

Draw anything — 9C owns the cone preview, the ghost and the status indicators, and it is the session
that can judge them. Add a `light`, `aura` or `pushback` interpreter (steps 11, 17, 18), even though
`pushback` shares the cone maths: the shape function is yours, the behaviour is step 18's. Author
night 8 or beyond (step 11 owns nights 8–10), and do not give any night a modifier — "dishes left
out" on night 6 is step 21's, along with the map it is authored for.
