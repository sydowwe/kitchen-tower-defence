# Step 18A — The push, and the Fan

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §3 (the *Towers redesigned*
table, the Mint Pot and Fan rows), `../../analytic-docs/CONTENT.md` §1 (the **Fan** row, its
behaviour note, the *Upgrades* list), §2 (the Mold paragraph) and §4 (the Marked row), the
*Pushback resistance curve* line of `../../analytic-docs/OPEN-QUESTIONS.md`, and the **Mint Pot** row
of `../../analytic-docs/ROADMAP-POST-V1.md` §2.
**Prereq:** step 17, all four parts.

## Goal

The whole mechanic, headless. A Fan's gust shoves every flyer it hits 1.2 tiles back down the track.
Each shove weakens the next one for a few seconds, so two Fans can't hold a lane shut forever.
Nothing that can't move gets moved. Mint Pot exists as a complete, schema-valid ground pusher that
nobody can buy, and that's the proof the behaviour is general. Nothing is drawn: B owns every pixel
and the card, and C owns night 18 and the numbers. **This part carries every test the step asks
for.**

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/content/behaviours.ts` (`PushbackBehaviour`) | `{ rangeTiles, coneHalfAngleDeg, pushTilesPerTick, targets, applies }`, documented as a push "while it is in the cone". It's in the union, `BEHAVIOUR_KINDS` and `DELTA_TARGETS`, with no interpreter and no `isPushback`. **Reshaped by decision 1** |
| `core/content/schema.ts` (`kind: z.literal('pushback')`) | the matching schema, `pushTilesPerTick` bounded `[0, 1]` |
| `tests/behaviours.spec.ts:87` | builds `pushback({ rangeTiles: 4, coneHalfAngleDeg: 35, pushTilesPerTick: 0.02, targets: 'air' })`, which breaks |
| `core/systems/combat.ts` (`fireCone`) | aims at the target, runs `cone()` filtered by `isTargetable`, then `dealDamage` and `applyStatuses` per caught enemy. **The rider goes in this loop.** `applicationsForShot` (above it) filters `everyNthHit` against `tower.shotsFired` |
| `core/systems/barricades.ts` | stateless. `nearestAhead` is recomputed every tick, and the header already says pushback "can subtract from the same field without either of them knowing about the other". **Re-blocking after a push needs no code** |
| `core/systems/tiles.ts` | heat damages whoever stands on the cell each tick. `tileSpeedMultiplier` is read inside `movement`. **Re-entry needs no code.** Both go through `isOnFloor`, so no flyer ever meets either |
| `core/systems/resolve.ts` | removes an enemy at `distance <= 0` **only when `fleeing`**. A walking enemy at 0 stays |
| `core/systems/noise.ts` (the wake) | sets `fleeing` **and** `untargetable`, so no cone ever catches a fled enemy today |
| `core/systems/bait.ts` | resets every feeder to `feeding.distance` in the slot after `movement`. A pushed feeder snaps back next tick |
| `core/systems/targeting.ts` | `isHeld` (someone's root is on it), `isOnFloor`, `isFlyer` |
| `core/path.ts` | the `samplePath` note (clamps a negative distance, "step 18's pushback hands out negative ones") is true. The `applyLateralOffset` and `nearestOnPath` notes both say step 18's pushback will want them. **False after decision 1: rewrite both sentences** |
| `core/content/enemies.ts` (`mold`) | `speedTilesPerTick: 0`, tags `['ground', 'spreads', 'fungal']` |
| `core/types.ts` `EnemyTag`, `schema.ts` `ENEMY_TAGS` | `tests/schema.spec.ts:26` asserts they're exactly equal. `ui/locales/contentKeys.ts` types `hud.tag` as `Record<EnemyTag, string>`, so `type-check` demands an English label per tag. `tests/matrix.spec.ts:72` pins the ten matrix rows, and **a new tag must not get one** |
| `core/content/towers.ts` (`TOWERS`) | 18 towers. It feeds the shop (`buildShop`, `unlocked: true`), the number keys, the glyph preload, and `contentKeys`' required English. `getTowerDef` looks up `TOWERS` only |
| `core/content/index.ts` | `validateContentInDev({ towers: TOWERS, ... })` at module load |
| `core/systems/spawn.ts` (`spawnEnemyAt`) | the one `Enemy` literal |
| `tests/combat.spec.ts` | the fixture pattern: a straight lane, `addEnemy` / `addTower`, synthetic defs pushed into `TOWERS` in `beforeAll` and spliced out in `afterAll` |

**Specs that will break, by design:** all 18 `Enemy` literals in 17 files: `bait`, `barricades`,
`burrow`, `candle`, `charges`, `combat`, `crumbs`, `hitbox`, `holds`, `light`, `night`, `noise`,
`status`, `tileEffect`, `tiles`, `upgrades` (two) and `viewModel`. Update them mechanically, and
don't make the field optional to dodge it (15A, 16A and 17B paid the same). Also
`tests/behaviours.spec.ts:87` and the tower count in `tests/content.spec.ts`. No `sim.spec` order
change, because there's no new slot.

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **Pushback is a rider on a `coneAttack`: `{ kind: 'pushback', pushTiles, targets, applies }`.**
   Drop `rangeTiles`, `coneHalfAngleDeg` and `pushTilesPerTick`. The Fan's row *is* a cone attack
   (1 damage, 1.5/s, cone 4), and the step's push is per hit, with per-push resistance and a gust
   per pulse. A continuous per-tick shove contradicts all three. A pushback with its own range and
   cone would need its own aim and its own clock, which drift from the shot it's supposed to be.
   Riding the cone gets targeting, cooldown, noise, `towerFired`, the card's damage/rate/cone rows
   and the placement wedge for free. The step's `rate` is the cone's `cooldownTicks`. `pushTiles` is
   bounded like a range. **`validateContent` rejects a tower with a `pushback` and no `coneAttack`**
   (base def, or a tier that `addBehaviours` one), beside `checkUpgradeTiers`. Otherwise a pushback
   on a Salt Shaker would silently push nothing.
2. **The push lands inside `fireCone`, per caught enemy, in this order:** `dealDamage`, the cone's
   `applies`, then, if it also passes `isTargetable(enemy, pushback.targets)`, the pushback's
   `applies` (through `applicationsForShot`, like the cone's), then `pushEnemy`. The pushback's
   `targets` narrows the cone and never widens it. Damage before the push keeps the damage number
   where the hit landed. The Marked lands on everything the gust *reaches*, including an immune or
   floored enemy, because T3's point is the amplifier and not the displacement. **Skip an enemy the
   hit just killed** (`hp <= 0`). `resolve` removes it this tick, and an `enemyPushed` for it is a
   slide B starts on an enemy it'll never draw.
3. **`core/systems/pushback.ts` is a helper file, not a slot**, like `dealDamage` or `hitbox.ts`. It
   exports `pushEnemy(world, enemy, tiles, sourceTowerId): number`, which returns the tiles actually
   moved. Everything in the index's seam lives in it. It may import from `targeting.ts` but **never
   from `combat.ts`**, which imports it. That cycle surfaces as an `undefined` at module load.
4. **Nothing moves that can't:** `pushEnemy` returns 0, touching no state, for:
   - the **`push-immune` tag**: what an enemy *is*, like `physical-immune`, not an `EnemyFlag`,
     which is per-tick state. The Mold carries it. The enemy schema refines
     `speedTilesPerTick > 0 || tags.includes('push-immune')`, so the next stationary enemy can't
     forget. Bosses gain it post-v1 (`ROADMAP-POST-V1.md` §3). It reads `enemy.tags`, so there's no
     def lookup on the hit path, and the Mold's tooltip gains a line saying why the Fan ignores it.
   - **`isHeld`**: a fly stuck to a Fly Paper shoved 1.2 tiles away from its paper, still rooted,
     reads as a bug.
   - **`feeding !== null`**: `bait` would reset it next tick anyway.
   - **`fleeing`**: a no-op today, since the wake makes every fled enemy untargetable. Step 19's thief
     is fleeing *and* targetable, and subtracting from its distance speeds its escape. That step
     decides the sign; the skip is the safe default until it does.
5. **Resistance is lazy: `Enemy.pushback: { resistance: number; atTick: number } | null`**, null
   until first pushed. It rises by `(1 - PUSHBACK_FLOOR) / PUSHES_TO_FLOOR` per push, capped at
   `1 - PUSHBACK_FLOOR`. It decays linearly to 0 over `PUSHBACK_DECAY_TICKS` from the cap, computed
   at read time from `world.tick - atTick`. So no system ages it, there's no slot, and the save
   carries no per-tick churn. A push at tick T moves `min(distance, tiles × (1 - resistanceNow))`,
   then stores the raised resistance with `atTick: T`, even when the clamp moved it 0. Drafts:
   `0.35`, `4`, `240` (the step's "~35% after four pushes", "~4s"). C re-tunes the **values**. So
   pushes 1–4 in one tick move 100%, 83.75%, 67.5% and 51.25%, and the fifth moves 35%. Export
   `pushbackResistanceOf(world, enemy)` for the specs and B.
6. **The Fan is `TOWERS[18]`**: 🌀, `CONTROL`, 170, `maxHp: 100`, noise 1, `off_path`, `CLOSEST`
   (§5: cones). It's `coneAttack({ damage: 1, damageType: 'physical', cooldownTicks: perSecond(1.5),
   rangeTiles: 4, coneHalfAngleDeg: 25, targets: 'air' })` plus `pushback({ pushTiles: 1.2,
   targets: 'air' })`. The 25° is a draft (the doc gives range, not opening), and `physical` is the
   Sticky Tape's honest filler for a "—" type. It resolves 0.5 against `air`. **Tiers 1–2 raise the
   cone's `rangeTiles` by 0.5 twice (4 → 4.5 → 5), never `pushTiles` or the rate.** Both raise the
   lock threshold the floor is sized against, and two tier-2 Fans pushing 2.0 would lock a Moth at
   the floor. Range widens where the door is held without changing whether it can be held shut.
   **T3 `replaceApplies` the pushback with `['marked']`** (§1). No hotkey (step 20a).
7. **Mint Pot is `mintPot` in `towers.ts`, exported in `POST_V1_TOWERS`, not in `TOWERS`**, with no
   `unlockNight`. `schema.ts` reserves unlock state for step 20. In `TOWERS` it would be in the shop
   and on a number key today, and `contentKeys` would demand English for a tower with no UI.
   `core/content/index.ts` validates `[...TOWERS, ...POST_V1_TOWERS]`. The def is the ROADMAP row:
   🌱, `CONTROL`, 190, noise 0, `off_path`, `CLOSEST`. It's `coneAttack({ damage: 0, damageType:
   'physical', cooldownTicks: perSecond(1), rangeTiles: 2, coneHalfAngleDeg: 180, targets: 'ground'
   })` plus `pushback({ pushTiles: 0.8, targets: 'ground' })`. A 180° half-angle is the whole circle
   (`cone()` compares `<= π`). The row's "—" rate becomes a one-second pulse. Tiers: range +0.5
   twice, then T3 `raise('coneAttack', 'damage', 4)` for "repelled enemies take damage"
   (`DECISIONS.md` §3). All drafts, said so in its comment. Its keys are well-formed and
   unresolved. That's fine, because nothing renders it.
8. **Two events, both read by B:**
   `{ kind: 'pushbackFired'; towerId; tile: Vec2; facingRad; rangeTiles; halfAngleDeg }`, once per
   shot of a tower with a pushback, whatever it caught. And `{ kind: 'enemyPushed'; enemyId;
   sourceTowerId; tiles }` per enemy that actually moved, where `tiles` is the distance moved after
   resistance and clamp. The gust carries its own shape for `towerDestroyed`'s reason: the tower may
   be sold or upgraded by the time a frame reads it. The Spray Bottle publishes neither.

## Build

### 1. The shape: `behaviours.ts`, `schema.ts`, `types.ts`, `spawn.ts`, the fixtures

Decisions 1, 4, 5 and 8. Add `isPushback` beside `isBait`. Rewrite the `PushbackBehaviour` docstring,
the behaviours file header's list of what has an interpreter, and the two false `path.ts` sentences.
Add `'push-immune'` to `EnemyTag`, `ENEMY_TAGS`, the Mold's tags, and a draft `hud.tag` label in
`en.ts`. `spawnEnemyAt` gains `pushback: null`, then come the 18 fixtures. Add the collection check.

### 2. `core/systems/pushback.ts` and the rider in `combat.ts`

Decisions 2, 3, 4 and 5. `fireCone` takes the def's pushback (`find(isPushback)`, one per def like
`find(isFiring)`) and publishes `pushbackFired` with the direction it already computes.

Gotchas, each of which fails quietly:

- **Clamp with `Math.max(0, …)` and never let a walking enemy go negative.** `samplePath` would draw
  it fine, and `resolve` would keep it. But the moment step 19 flips a thief to `fleeing`, a negative
  distance is an instant escape.
- **The push is in `combat`, after `barricades`,** which is what makes re-blocking free. Blocking
  reconstructs last tick's position as `distance - step`. Don't move the push into a slot between
  `movement` and `barricades`.
- **Two Fans firing on the same tick both push the same fly**, in `world.towers` order, and the
  second push is already resisted. That's deterministic and correct. Don't dedupe.
- **The later tower in the loop aims at a target `targeting` picked before the earlier one pushed
  it.** `fireCone` re-reads `enemyPosition` at fire time, so the cone follows the pushed position.
  Don't cache positions across towers.
- **A pushed Weevil can re-enter its burrow window.** `burrow` reads `distance` next tick and dives
  it again. A pushed fed enemy walks back through its pot's window, and `fedAt` stops a second feed.
  Both are correct. Don't special-case either.

### 3. The defs: `towers.ts`, `index.ts`, `en.ts`, the docs

Decisions 6 and 7. The Fan's English (name, description, tier names, the tier-3 sentence) is a
**first draft that B rewrites**. Mint Pot gets none. In `CONTENT.md`: add the push distance and "a
pushed enemy resists the next push" to the Fan's behaviour note, put the tiers in the Fan's
*Upgrades* line and drop "*(arrives with the Fan, step 18)*", and add `push-immune` to the Mold's
tags in §2. In `ROADMAP-POST-V1.md`, note on the Mint Pot row that it's authored, as
`POST_V1_TOWERS`.

## Tests

In a new `tests/pushback.spec.ts`, plus the content and round-trip ones. Assert against `pushTiles`,
the defs' fields and the three constants, never the literals, so C's re-tune moves no assertion.
Register `mintPot` (and any synthetic def) into `TOWERS` in `beforeAll` and splice it out after, as
`combat.spec.ts` does.

- `pushEnemy` on an enemy at `distance = 5` with 1.2 lands it at 3.8 (`toBeCloseTo`, 9 places). One
  at 0.5 lands at 0, is still in `world.enemies` after a full tick, and is past 0 a tick later.
- A Fan shot moves a Fly in its cone back by exactly the Fan's `pushTiles` on the first push. It
  publishes one `pushbackFired`, and one `enemyPushed` whose `tiles` equals the distance moved.
- A synthetic flyer tagged `push-immune` in a Fan's cone, and a Mold inside Mint Pot's radius, keep
  their distances. A Fly held by a Fly Paper and an Ant with `feeding` set are unmoved too. The
  enemy schema rejects a speed-0 def without the tag.
- **Resistance**: `PUSHES_TO_FLOOR + 1` pushes in one tick move `pushTiles` down to exactly
  `pushTiles × PUSHBACK_FLOOR`, and the next one moves no less. `pushbackResistanceOf` falls
  strictly after a pause, and is 0 after `PUSHBACK_DECAY_TICKS` of no pushes.
- **Barricades, through Mint Pot**: an Ant held at a Cardboard Box and pushed back walks forward and
  is held at the same point again. An Ant that walked past a box placed behind it, pushed back
  behind the box, is now held by it. That's the step's "past".
- **Heat, through Mint Pot**: an Ant pushed back onto a tile carrying `heat` (written directly, long
  duration) loses heat damage through the matrix on that same tick.
- **Two Fans covering the same lane don't lock it.** Use a **Moth**, the slowest flyer, with its HP
  raised so the chip damage can't kill it, starting inside both cones: its distance after 600 ticks
  is greater than at the start. At the draft constants, the idealised margin is ~0.15 tiles/s. If it
  fails, the curve is wrong, not the test. Move the constants (slower decay before a higher floor),
  and write it back here and to `OPEN-QUESTIONS.md`.
- At tier 3, a Fly the Fan hits carries `marked`.
- `validateContent` rejects a def with a `pushback` and no `coneAttack`, naming the tower.
- `createWorld()` with a pushed enemy survives the JSON round trip (extend the existing assertion),
  and a push leaves `world.rng` untouched.
- `tests/content.spec.ts`: the Fan against its row, `TOWERS[18]`, `toHaveLength(19)`. `mintPot` is in
  `POST_V1_TOWERS`, validates, and isn't in `TOWERS`.

## Acceptance

- [ ] `grep -rn "mintPot\|Mint Pot" src/core/systems` finds nothing.
- [ ] The Fan and Mint Pot are config objects. The only new system file is `pushback.ts`, and the
      only existing system changed is `combat.ts`'s cone path.
- [ ] `grep -n "\.distance = \|\.distance -= " src/core/systems` finds no writer outside `movement`,
      `barricades`, `bait` and `pushback.ts`.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 18B and 18C

```
core/content/behaviours.ts  PushbackBehaviour { kind: 'pushback'; pushTiles: number; targets; applies }
                            isPushback(behaviour: Behaviour): behaviour is PushbackBehaviour
core/systems/pushback.ts    pushEnemy(world, enemy, tiles, sourceTowerId): number   // tiles moved
                            pushbackResistanceOf(world: World, enemy: Enemy): number
                            PUSHBACK_FLOOR, PUSHES_TO_FLOOR, PUSHBACK_DECAY_TICKS    // C re-tunes values
core/types.ts               Enemy.pushback: { resistance: number; atTick: number } | null
                            EnemyTag 'push-immune'
                            GameEvent 'pushbackFired' { towerId, tile, facingRad, rangeTiles, halfAngleDeg }
                                      'enemyPushed'   { enemyId, sourceTowerId, tiles }
core/content/towers.ts      fan                                  // TOWERS[18]
                            mintPot, POST_V1_TOWERS
```

## Do not

Draw anything, or touch `ui/` beyond the `en.ts` entries `type-check` demands. The gust, the shove
and the card are B's. Don't author night 18 or move a number from what the specs suggest; C has the
board. Don't give the pushback a slot, a range or a clock of its own. Don't add knockback to any
other tower, put Mint Pot in `TOWERS`, or give fleeing enemies a push sign (step 19).
