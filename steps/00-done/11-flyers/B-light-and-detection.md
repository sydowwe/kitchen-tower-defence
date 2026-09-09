# Step 11B — Light attraction, revelation, and the Nightlight

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../../CLAUDE.md`, `../../../analytic-docs/CONTENT.md` §1 (the Act II table — the
Nightlight row — and the *Behaviour notes* line for it), §2 (the Moth row and the **Moth** paragraph
under the table), §6 (night 10), `../../../analytic-docs/DECISIONS.md` §3 (the path model, and why this
is an offset rather than free movement).
**Prereq:** 11A.

## Goal

The one enemy in v1 that leaves the polyline, implemented so that it does not. A signed lateral
offset from the sampled path point, a light registry the Moth is drawn toward, and the `hidden` /
`revealed` plumbing the Booklouse will need in Act III — plus the Nightlight, which is both halves of
that at once. Entirely headless: a moth curves in the simulation this session and nobody can see it
until 11C.

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/content/behaviours.ts:398` | `RevealBehaviour { kind: 'reveal', radiusTiles, attractsLightDrawn }` and the `reveal()` factory. In `BEHAVIOUR_KINDS`, in the union, **and validated** by `core/content/schema.ts:280`. Its comment says "Step 16" and is wrong. There is **no `isReveal` narrowing helper**; `isCharge`, `isCollect`, `isIncome` at the bottom of the file are the pattern. |
| `core/types.ts:61` | `EnemyFlag = 'hidden' \| 'untargetable' \| 'fleeing'`. `Enemy.flags` is `Record<EnemyFlag, boolean>`, so adding a member breaks every literal. |
| `core/systems/targeting.ts:27` | `isTargetable` — `if (enemy.flags.hidden \|\| enemy.flags.untargetable) return false`. **Nothing anywhere sets or clears `hidden`.** |
| `core/systems/spatial.ts:37` | `enemyPosition(world, enemy)` — `samplePath(path, enemy.distance)`, null for a path the map has lost. Its header is explicit that this is tile space with integers on tile centres and that the renderer's `+ 0.5` is a pixel convention. |
| `core/path.ts:97` | `samplePath(path, distance): { x, y, angle }`. `angle` is `atan2(dy, dx)` and `core/systems/hitbox.ts:9` records that as the convention every angle in the codebase follows. |
| `core/path.ts:131` | `nearestOnPath` returns an **unsigned** `offsetTiles`. It is a different quantity from the one you are adding; do not reuse it. |
| `core/sim.ts:26, 54` | `SystemName` and `SYSTEMS`, in order. `SYSTEM_ORDER` is derived from the array so the two cannot disagree. |
| `core/systems/spawn.ts:128` | `spawnEnemyAt` — the **one** constructor for an `Enemy`, wave-spawned or rot-hatched. Line 151 is the `flags` literal. |
| `core/systems/placement.ts` | `placeTower` seeds `Tower.state` from `isCharge` only; a tower with neither a firing nor a charge behaviour needs no plumbing at all. |

**The specs that will break** — every one of these hand-builds an `Enemy`, so both the new field and
the new flag hit all eight at type-check:

`tests/barricades.spec.ts:62`, `tests/charges.spec.ts:87`, `tests/combat.spec.ts:73`,
`tests/crumbs.spec.ts:59`, `tests/hitbox.spec.ts:67`, `tests/night.spec.ts:49`,
`tests/status.spec.ts:60`, `tests/viewModel.spec.ts:317`.

Plus `tests/sim.spec.ts:66`, which asserts `SYSTEM_ORDER` against a literal list — deliberately, so a
new slot is an edit in two places rather than a line moved by accident. And
`tests/content.spec.ts:363` / `:364`, the night-count and night-index lists, which 11A has already
extended once.

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **`Enemy.lateralOffsetTiles: number`, signed, in tiles.** State on the world, not a derivation:
   the decay is hysteretic ("keeps drifting back for two seconds after the light is gone"), and there
   is no function of `distance` alone that answers it. A plain number, so the JSON round-trip
   `tests/world.spec.ts` asserts still holds. `spawnEnemyAt` initialises it to 0 and it stays 0 for
   every enemy that is not a Moth.
2. **`enemy.distance` is never touched by any of this.** That is the whole design and it is what
   makes the feature two hours instead of two days: targeting's `remainingToFridge`, the barricade
   projection, `FIRST`/`LAST`, step 18's pushback and the leak check all keep working unchanged
   because they read arc distance and the offset is perpendicular to it.
3. **One helper, `applyLateralOffset(at, lateralTiles): Vec2`, in `core/path.ts`.** It takes what
   `samplePath` returned — `{ x, y, angle }` — and returns the displaced point. Two callers:
   `enemyPosition` and, in 11C, `render/layers/entities.ts`, which already holds the sample for its
   mirroring. A second copy of the trig is how the drawn moth and the shot moth end up in different
   places. **The normal is `(-sin(angle), cos(angle))`** — a positive offset displaces to the left of
   travel — and that sentence goes in the function's comment, because nothing else in the codebase
   fixes the sign and step 18 will want it.
4. **`enemyPosition` returns early when the offset is 0.** It is the hottest function in `core/` —
   `queryEnemiesInRange` calls it once per enemy per tower per tick — and two extra trig calls per
   call is a real cost for an answer that is `{ x, y }` for every enemy in the game but one.
5. **New system `core/systems/light.ts`, slot name `light`, between `barricades` and `targeting`.**
   After movement and the barricade clamp so it reads this tick's `distance`; before targeting so a
   Nightlight placed this tick reveals in the same tick it was placed, which is what the step asks
   for. It skips terminal phases like every other system, or moths keep drifting behind the summary
   screen.
6. **Attraction range is `LIGHT_ATTRACTION_TILES = 5`, a constant in the light system — not the
   behaviour's `radiusTiles`.** `../../../analytic-docs/CONTENT.md` §2 says a Moth deviates toward a
   light "within 5 tiles"; §1 gives the Nightlight range 4, which is its **reveal** radius. Both are
   right about different things, and `attractsLightDrawn` being a *boolean* is the tell: the reach
   belongs to the moth's eyes, not to the lamp, so step 17's Candle (aura radius 2) pulls from the
   same five tiles without authoring a third number.
7. **`LIGHT_MAX_OFFSET_TILES = 3`**, the step's "~3 tiles", clamped on the *target* offset so the
   follower never has to chase a number it will not be allowed to reach.
8. **The follower is linear at a fixed rate, `LIGHT_DRIFT_TILES_PER_TICK = 0.04`.** An exponential
   ease never actually reaches 0, which would need a snap epsilon — a second constant that can
   disagree with the first, and the assertion below is exactly the kind that would then pass at
   0.001 tiles of permanent drift. 3 tiles at 0.04 is 75 ticks, 1.25 seconds, comfortably inside the
   2-second assertion with headroom for 11C to slow it down. The curve still looks like a curve
   because the *target* is smooth, not because the follower is.
9. **The nearest light wins; ties go to the earlier entry in `world.towers`. Never a sum.** Two lamps
   either side of the track summing to a net pull of zero is a moth that flies dead straight between
   two nightlights, which is the opposite of the picture.
10. **Attraction is measured from the base path point** (`samplePath`, no offset); **revelation is
    measured from `enemyPosition`** (with it). The first avoids a feedback loop — an offset that
    changes what is in range which changes the offset — and makes entering and leaving attraction
    happen at fixed arc distances. The second is right because "is it lit" is a question about where
    the thing actually is.
11. **`EnemyFlag` gains `'revealed'`, recomputed every tick, and `isTargetable` becomes
    `flags.hidden && !flags.revealed`.** Not "clear `hidden` permanently": `hidden` is what the enemy
    *is* and `revealed` is what a lamp is doing to it right now, so selling the Nightlight re-hides
    whatever it was lighting, on the same tick, with no field to clear in four places. This is the
    same stateless-recompute rule `core/systems/barricades.ts` is built on and says so in its header.
12. **Nothing in v1 is `hidden`.** The Booklouse is Act III's. The flag plumbing ships as a *tested
    rail*, asserted by setting `flags.hidden` on a synthetic enemy — 11C does not try to judge it by
    playing, the way 10A shipped the Cookie Jar's destroy penalty.
13. **Night 10 is authored on the Counter, single-lane**, with the comment nights 4–9 carry. §6 puts
    it on the Stove and gives it the game's second spawn point; neither exists, and step 21 authors
    both. Wave count is §6's **11**.

## Build

### 1. The offset, and the one position function (`core/types.ts`, `core/path.ts`, `core/systems/spatial.ts`, `core/systems/spawn.ts`)

Decisions 1–4. Then the eight test fixtures listed above, which will not compile until they carry the
new field.

Gotcha, and it is the one thing in this step that fails silently: **`render/layers/entities.ts:376`
calls `samplePath` directly, not `enemyPosition`.** It is the only such call outside `core/`. Move it
onto `applyLateralOffset` in this session, while the helper is in your hand — the layer already has
the sample for its `mirrored` flag, so it is two lines. Leave it and the moth is drawn on the track
while every tower shoots it three tiles away; nothing fails, the frame budget is untouched, and the
symptom reads as a targeting bug. This is the only file under `render/` this part opens.

Second, smaller consequence worth knowing rather than fixing: `resolveSystem` drops an enemy's crumbs
at `enemyPosition`, so a Moth killed mid-deviation is the first pile in the game to land off the
lane. `nearestPath` projects it back when it rots, `radiusTilesFor` draws it fine, and collection
never cared where the track was. Nothing to do; do not "correct" it back onto the polyline.

### 2. `core/systems/light.ts`

`isReveal` goes in `core/content/behaviours.ts` beside `isCharge` — two readers here and a third in
11C's `reachOf`, and hand-writing `b.kind === 'reveal'` in each is how the third one gets it wrong.

The system, in one pass over `world.enemies`:

- **Revelation.** `flags.revealed = ` is this enemy inside any light's own `radiusTiles`. Written
  unconditionally every tick, for every enemy — a version that only sets it true is a version where
  selling the lamp leaves the board permanently visible.
- **Attraction.** For a `light-drawn` enemy only: find the nearest light with `attractsLightDrawn`
  within `LIGHT_ATTRACTION_TILES` of the **base** path point (decisions 6, 9, 10). The target offset
  is the component of `(light.tile - basePoint)` along the path normal, clamped to
  ±`LIGHT_MAX_OFFSET_TILES`; with no light in range the target is 0. Then step
  `lateralOffsetTiles` toward the target by at most `LIGHT_DRIFT_TILES_PER_TICK` (decision 8).

Build the light list once per tick and share it across the enemies, the way
`barricadePositions` does — not once per enemy.

Gotcha: a light sitting *directly ahead on the track* has a normal component of ~0, so the moth flies
straight at it and never deviates. That is correct — it is already going there — and it is also why
the acceptance below asks for a lamp placed **beside** the lane. A session that tests with the
Nightlight on the track will conclude the feature is broken.

Then the slot: `SystemName`, `SYSTEMS`, the order comment in `tick`'s doc block, and
`tests/sim.spec.ts:66`'s literal list. Export `lightSystem` from `core/systems/index.ts`.

### 3. `isTargetable`, and the reveal half (`core/systems/targeting.ts`, `core/types.ts`)

Decision 11. Leave 11A's air half exactly as it is. `untargetable` keeps its own unconditional
`return false` — that is step 16's burrow flag and a lamp does not surface a Weevil.

### 4. The Moth and the Nightlight (`core/content/enemies.ts`, `towers.ts`)

**Moth** — §2, night 10: 25 HP, 1.6 tiles/sec, 8 crumbs, steals 1, `air light-drawn`.
`meleeDamagePerTick` at `hp / 10` per second, authored and never read, like the Fly's.

**Nightlight** — §1, Act II: 100 crumbs, DETECTION, no damage, radius 4, noise 0, `off_path`.
`behaviours: [reveal({ radiusTiles: 4, attractsLightDrawn: true })]` and **nothing else**. No attack,
so `targetingSystem` and `combatSystem` both skip it and it needs no `cooldownTicks`, no state and no
plumbing; `defaultTargetingMode: 'CLOSEST'` is required by the schema and inert, matching the other
behaviourless towers. `maxHp: 100`. §1's "T3 upgrade adds damage" is step 12's.

Fix `RevealBehaviour`'s "Step 16" comment while you are in `behaviours.ts`.

### 5. Night 10, and the English (`core/content/nights.ts`, `ui/locales/en.ts`)

Eleven waves, Counter, `'crack'`, decision 13. The Moth arrives the way the Roach did on night 3 and
the Beetle on night 5: **two of them in wave 3**, released well behind that wave's ground column and
far enough apart to be watched one at a time. There is no other way to see what the mechanic does,
and a moth in a clump of flies is a moth nobody notices curving.

An entry each for `moth` and `nightlight` in `en.ts`, or `contentKeys.ts` fails the build. 11C
revises both. Then `tests/content.spec.ts`'s two night lists again: `[…, 10, 10, 11]` and `[1 … 10]`.

## Tests

- A Moth entering a Nightlight's attraction range reaches a **non-zero** `lateralOffsetTiles`, and is
  back at exactly 0 within 120 ticks of leaving it. Exactly 0, not "close to" — decision 8 is what
  makes that assertable, and an exponential follower is what this catches.
- **The Moth's `distance` advances at its normal rate throughout the deviation.** Assert it
  explicitly against an identical Moth on a lamp-free lane, tick for tick. This is the assertion the
  whole design exists to make true.
- The offset is clamped: a Nightlight **4** tiles off the lane never produces an offset past
  `LIGHT_MAX_OFFSET_TILES`, at any point in the crossing — and reaches exactly it. *(Written as 5
  tiles; the build proved that unassertable. At 5 the lamp is inside the moth's 5-tile reach for a
  single tick of a straight lane, so the follower never gets near the clamp and the test passes
  without exercising it. At 4 the lamp is in reach over 6 tiles of lane, 225 ticks, three times what
  the follower needs to saturate.)*
- `enemyPosition` for a Moth at a known offset is the base sample displaced along
  `(-sin θ, cos θ)` — the sign, pinned once, so 11C and step 18 inherit it.
- A Fly (`air`, not `light-drawn`) walking the same lane past the same Nightlight keeps
  `lateralOffsetTiles === 0` for the whole crossing.
- Two Nightlights on opposite sides of the lane pull the Moth toward **one** of them, deterministically
  the earlier in `world.towers`, and never to a net zero.
- A `hidden` enemy is skipped by `isTargetable` until a Nightlight covers it, and is targetable **in
  the same tick** the tower is placed — drive it through `tick()` with a `PlaceTower` command, not by
  calling the system directly, or the assertion does not test the ordering it exists for.
- Selling that Nightlight re-hides it on the tick of the sale.
- A `light-drawn` enemy is unaffected by a `reveal` behaviour with `attractsLightDrawn: false` —
  the boolean is load-bearing, and there is no content that would notice if it were ignored.

## Acceptance

- [x] `grep -rn "samplePath" src/` finds it in `core/path.ts`, `core/systems/spatial.ts`,
      `render/layers/entities.ts` (via the helper), `ui/interaction.ts` (placement preview, not an
      enemy), `dev/debug/overlay.ts` (the track marker) — and in `core/systems/light.ts`, which
      decision 10 requires: attraction is measured from the **base** path point, so the light system
      has to sample one that `enemyPosition` would have displaced. No other new place.
- [x] Adding the Nightlight required **zero** changes to any tower system: it is a def plus an
      `en.ts` entry, and the only new code is one system reading a descriptor that already existed.
- [x] `Serialisable<World>` still holds — `tests/types.spec.ts` compiles — and `createWorld()`
      survives the JSON round-trip.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 11C

```
core/path.ts              applyLateralOffset(at: { x: number; y: number; angle: number },
                                             lateralTiles: number): Vec2
core/systems/light.ts     lightSystem(world: World): void
                          lightSources(world: World): Tower[]     // towers with a reveal behaviour
                          LIGHT_ATTRACTION_TILES, LIGHT_MAX_OFFSET_TILES
core/content/behaviours.ts isReveal(behaviour: Behaviour): behaviour is RevealBehaviour
core/types.ts             Enemy.lateralOffsetTiles: number        // signed, left of travel positive
                          EnemyFlag: … | 'revealed'
core/content/enemies.ts   moth: EnemyDefOf<'moth'>
core/content/towers.ts    nightlight: TowerDefOf<'nightlight'>
core/content/nights.ts    night10: NightDef
```

## Do not

Draw a pool of light, a shadow, a bob, or a range ring — 11C owns every pixel, and the one line under
`render/` this session touches is `entities.ts`'s position, for the reason in Build 1. Do not add a
`revealRadiusTiles` row to `TowerStatsView` or reorder the stat card (11C). Do not build the Candle
or any aura (step 17), the Booklouse or burrowing (step 16 and Act III), upgrades (step 12), or a
second lane on the Counter (step 21). Do not author a night past 10.
