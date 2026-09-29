# Step 16A — Burrowing, armor, and the two towers that answer them

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../../CLAUDE.md`, `../../../analytic-docs/CONTENT.md` §1 (the Act II table's **Bay
Leaf** and **Lemon** rows, the Bay Leaf behaviour note, and the *Upgrades* list), §2 (the Weevil and
Silverfish rows and the Weevil paragraph), §3 (the `armored` row) and §4 (the Armor Strip row).
**Prereq:** step 15, all three parts.

## Goal

This part is the whole headless half of step 16. One new system (burrowing), the interpreter for a
behaviour that has been in the vocabulary since step 2 (`suppress`), and four config objects: the
Weevil and the Bay Leaf that surfaces it, and the Silverfish and the Lemon that strips it. Nothing is
drawn; B and C own every pixel. **Every test step 16 asked for lives here.** Burrowing and armor are
where the step can be silently wrong.

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/types.ts:66` | `EnemyFlag = 'hidden' \| 'untargetable' \| 'fleeing' \| 'revealed'`. `Enemy.flags` is `Record<EnemyFlag, boolean>`, so adding a member breaks every literal that builds one |
| `core/systems/noise.ts:67` | **the wake sets `untargetable = true`** on every enemy, alongside `fleeing`. The flag is already taken. Read decision 1 before you touch it |
| `core/systems/targeting.ts:27` | `isTargetable`. It already refuses `untargetable`, and its comment calls that "step 16's burrow flag", which decision 1 makes untrue |
| `core/systems/targeting.ts:43` | `isFlyer`, and a docstring saying it is *the* floor answer for barricades and tiles, **not** `isTargetable`. It also warns that reusing `isTargetable` "would walk a `hidden` Weevil straight through a Cardboard Box". The Weevil is not `hidden`; it is burrowed, and the warning is about the wrong flag. Decision 2 |
| `core/systems/barricades.ts:89` | `nearestAhead` returns null for `isFlyer`: the one line that decides who a box can stop |
| `core/systems/tiles.ts:34` | `tileUnder` returns null for `isFlyer`. It is **the one place tile effects decide who they touch**: slime speed, heat damage and residue statuses all go through it |
| `core/systems/projectiles.ts:118` | a homing projectile re-aims at its target every tick and **hits it on arrival without asking whether it can still be hit**. Build item 5 |
| `core/systems/spawn.ts:144` | `spawnEnemyAt`, the one constructor for an `Enemy`. The flags literal is at `:172` |
| `core/content/behaviours.ts:382` | `SuppressKind = 'burrow'` and `SuppressBehaviour { radiusTiles, suppresses }`. **Already in the union, in `BEHAVIOUR_KINDS`, in `DELTA_TARGETS` and in the schema** (`schema.ts:328`), with no interpreter. There is no `isSuppress` helper yet |
| `core/content/schema.ts:464` | `tileWriter` on the enemy schema: the precedent for a per-enemy ability that is **a field, not a tag** |
| `core/content/matrix.ts:79` | `tagMultiplier` moves the `armored` row toward 1.0 by `armorStripStrength` **inside the product**. That is correct, and nothing in it changes. `tests/statuses.spec.ts:136` already checks 0.4 → 0.7 on a hand-built holder |
| `core/content/towers.ts:611` | the Nightlight: a tower with no firing behaviour, and a tier 3 that `addBehaviours` an `aura`. That is the precedent for the Bay Leaf |
| `core/sim.ts:62` | `SYSTEMS`. `tests/sim.spec.ts:66` pins the order as a literal, and `:89` requires a `${name}System` export from `core/systems/index.ts` for every slot |
| `tests/content.spec.ts:644` | `expect(TOWERS).toHaveLength(12)` |
| `ui/locales/contentKeys.ts:38,40` | an English entry is **required** per tower id (with three tiers) and per enemy id. Four new defs mean `type-check` fails until `en.ts` has them |

**Specs that will break, by design:** every fixture that builds an `Enemy` literal. That's 13
literals in 12 files: `charges`, `hitbox`, `light`, `noise`, `barricades`, `night`, `crumbs`,
`tiles`, `status`, `upgrades` (two), `combat` and `viewModel`. Step 15A met the same cost for
`nextTileWriteTick`. Update them mechanically; don't make the new fields optional to dodge it.
`tests/light.spec.ts:309` sets `untargetable` to stand in for "burrowed". After decision 1 it
should set `burrowed`.

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **A new flag, `burrowed`. `untargetable` stays the wake's.** The step file names `untargetable`
   as the burrow flag, but `wake()` already sets it. Burrowing is recomputed every tick (decision 3),
   so a system writing `untargetable` would clear the wake's `true` on the next tick, and towers
   would kill fleeing enemies. `isTargetable` gains `|| enemy.flags.burrowed`. One term in step 11's
   predicate, which is the seam working, not a new mechanism.
2. **One floor predicate, `isOnFloor(enemy)` = `!isFlyer(enemy) && !enemy.flags.burrowed`, in
   `targeting.ts` beside `isFlyer`.** `tileUnder` and `nearestAhead` switch to it, and nothing
   else does. A burrowed Weevil is *under* the floor: the floor does nothing to it (no slime, no
   heat) and a box can't stop it. The renderer's `flying` stays `isFlyer`, because a mound is not
   a flyer.
3. **Burrowing is stateless and recomputed every tick**, the rule `light.ts` and `barricades.ts`
   are built on: `burrowed = distance ∈ [fromTiles, toTiles) && !suppressed`. So **a Weevil that
   leaves a Bay Leaf radius while still inside its window burrows again.** `CONTENT.md` §2 says
   Bay Leaf suppresses burrowing "inside its radius", and the stateless version is the only one
   with no field to clear when the Bay Leaf is sold. The alternative, "once surfaced, surfaced
   for good", needs a latched field. Take that only if C finds the re-dive unreadable, and write it
   back here.
4. **The window is rolled once, at spawn, and stored: `Enemy.burrowWindow: { fromTiles: number;
   toTiles: number } | null`.** It is required, not optional, and `null` for everything that
   doesn't burrow. It's in arc tiles on the enemy's own lane. It has to be state, because it's
   random per enemy.
5. **Who burrows is a field on the def, not the tag.** `EnemyDef.burrow?: { startMaxFraction,
   lengthMinFraction, lengthMaxFraction }`, fractions of the lane's `lengthTiles`. This follows
   `tileWriter` exactly: a tag can't carry the numbers, and `'burrows'` stays descriptive
   (`tests/matrix.spec.ts:48` already asserts it multiplies by 1.0). The Weevil authors `1/3`,
   `0.25`, `0.4`, which is the step file's "say 25–40%, beginning in the first third". **These
   numbers are a blind draft; C re-tunes them.**
6. **The rng is drawn only for a def with `burrow`.** Two `next()` calls per Weevil, inside
   `spawnEnemyAt`. An Ant spawning must leave `world.rng` untouched. Otherwise every seeded replay
   and every `RANDOM`-targeting spec on nights 1–12 shifts, with no Weevil anywhere in sight.
7. **`suppress` is a query, not a system slot.** `core/systems/suppress.ts` answers "which zones
   suppress *this ability*", filtering on `behaviour.suppresses === ability`. It never names
   `'burrow'`. The burrow system is its only caller and the only line in `core/` that passes
   `'burrow'`. **`SuppressKind` stays one member**: no Act III ability exists yet, and a member
   with no reader is a Bay Leaf variant that silently does nothing.
8. **`burrow` is a new slot between `movement` and `barricades`.** After movement, so a Weevil
   that steps into a Bay Leaf radius is targetable **in the same tick**. Before barricades, so a
   burrowed Weevil is never clamped to a box. Known and accepted: `movementSystem` reads last
   tick's flag through `tileSpeedMultiplier`, so the tick a Weevil dives on slime it takes one
   tick of 1.6×.
9. **Two events, `enemyBurrowed` and `enemySurfaced`, each `{ enemyId, at: Vec2 }`**, emitted by
   the burrow system when the flag *changes*. C's dive and surfacing puffs read them. The surfacing
   is the one moment the player must not miss (the step's "visually obvious"), and a renderer
   diffing flags per frame drops a surface-and-re-dive that lands inside one 3× frame.
10. **Bay Leaf and Lemon tiers are authored here and added to `CONTENT.md` §1 *Upgrades*,** as 15B
    did for its two towers. The Bay Leaf's tier 3 is an existing `aura` descriptor with
    `damagePerTick: 0` that applies `marked`, which is the Nightlight's tier-3 shape. That is **not**
    a new aura in the `Do not` sense: no system changes. If you find a better tier 3, take it and
    write it back here and to the doc.

## Build

### 1. The shape — `core/types.ts`, `core/content/schema.ts`

- `EnemyFlag` gains `'burrowed'`. `Enemy` gains `burrowWindow` (decision 4). `GameEvent` gains the
  two members from decision 9.
- The enemy schema gains the optional `burrow` object. Bound all three fractions to `[0, 1]` and
  refine `lengthMinFraction <= lengthMaxFraction`, with the enemy id in the message. *(As built: the
  refine sits on the `burrow` object itself, and `validateCollection` already prefixes every issue
  with `enemy '<id>': burrow:`, so the id arrives without being written into the message.)*
- `spawn.ts:172`'s literal gains `burrowed: false`. Then update the 13 fixture literals listed above.

### 2. The roll — `core/systems/spawn.ts`

In `spawnEnemyAt`, only when `def.burrow` is set (decision 6). Take `L` from the lane the enemy
spawns on. `from = next() * startMaxFraction * L`, and
`to = min(L, from + (lengthMin + next() * (lengthMax - lengthMin)) * L)`. The Cookie Jar penalty
and every other caller go through this constructor, so they all get a window for free.

### 3. `core/systems/suppress.ts` and `core/systems/burrow.ts`

`suppress.ts` builds the zones once per tick, as `lightsOf` does: every tower whose
**effective** def has a `suppress` behaviour for the ability asked about, radius measured tile
centre to enemy position with `<=`, like every other radius. Add `isSuppress` to `behaviours.ts`
beside `isReveal`; B's card and reach need it too.

`burrow.ts`: skip terminal phases. Skip `burrowWindow === null` before anything else, because this
runs for every enemy every tick. Then write the flag unconditionally (decision 3) and push an event
on change. Register it in `core/systems/index.ts` and `sim.ts`, and update the literal in
`tests/sim.spec.ts` in the same commit.

Gotcha: **never write `untargetable` from here.** It is the wake's flag, and the symptom of writing
it is quiet: a fled Weevil, then every fled enemy, takes shots on its way out after the next wake.
The test in *Tests* is the tripwire.

### 4. The predicates — `targeting.ts`, `barricades.ts`, `systems/tiles.ts`

Decisions 1 and 2. Rewrite both stale comments in `targeting.ts` (the "step 16's burrow flag" line
and the `hidden Weevil` warning) to say what is true now.

Gotcha: `barricadeHolding` and `barricadeAhead` are built on `nearestAhead`, so the renderer's chew
animation inherits the change for free. **Don't** add a second `burrowed` check in
`barricadesSystem`'s loop. One predicate means one place to be wrong.

A Weevil that surfaces *inside* a box's hold gap (for example, stepping into a Bay Leaf radius half
a tile before a box) is already handled: `barricadesSystem` clamps with "never backwards", so it
stops where it stands and chews. Don't special-case it.

### 5. Shots already in the air — `core/systems/projectiles.ts`

When the homing update finds a target that is no longer `isTargetable(target, projectile.targets)`,
treat it exactly like a dead one. Null the id, fly on to the last aimed point and despawn. Without
this, a Salt Shaker grain fired a tick before a Weevil dives still lands on the mound. It also fixes
the same leak for enemies fleeing a wake, which `noise.ts:62` says must not be shot. Re-run
`tests/noise.spec.ts` to confirm nothing asserted the old behaviour. A splash shell whose target
dives now despawns without splashing, which matches what it does when its target dies.

### 6. The four defs — `core/content/enemies.ts`, `core/content/towers.ts`

Append; never reorder. Every number comes from the `Read first` sections. Only what isn't there is
listed here:

- **`weevil`**: 🐛, `burrow` per decision 5, and `meleeDamagePerTick` at the file's `hp / 10`.
- **`silverfish`**: 🐟, the same `hp / 10`. **No new field, no system line.** The `armored` tag does
  all the work, and that is this def's architecture checkpoint.
- **`bayLeaf`**: 🌿, `SUPPRESSION`, `suppress({ radiusTiles: 3, suppresses: 'burrow' })` and nothing
  else. Then `maxHp: 100`, `CLOSEST`, and noise 0, per the Nightlight precedent. Tiers:
  `raise('suppress', 'radiusTiles', 0.5)` twice (3 → 3.5 → 4). A whole tile a tier would suppress
  half the Counter's lane by tier 2 and delete the mechanic. Tier 3 is decision 10's marking aura,
  at the **base** radius, the way the Nightlight's aura sits at its base radius.
- **`lemon`**: 🍋, `DOT`, `attack` with 8 chemical, `perSecond(0.9)`, range 3, `both`,
  `projectileSpeed: 0.1`, `applies: ['armorStrip']` **bare**. The status table's 4s and 0.5 *are*
  the doc's numbers, as the Vinegar Spray's poison is. `FIRST`. Tiers:
  `raise('attack', 'damage', 3)` twice (8 → 11 → 14). Tier 3 is `add` of `1.0` on
  `attack.splashRadiusTiles`, so the strip lands on everything around the hit.
  `dealSplashDamage` already applies statuses per enemy caught.
- **`en.ts`**: names, descriptions, tier names and two tier-3 sentences, as a **first draft that B
  rewrites** against the tooltip and the card. Add the two tier-3 lines, and a Lemon behaviour note
  ("applies Armor Strip"), to `CONTENT.md` §1.
- `tests/content.spec.ts:644` becomes 14, with the index assertions the file already makes for every
  appended tower.

## Tests

- A burrowed Weevil is skipped by targeting: a Salt Shaker in range holds `targetEnemyId === null`.
  It takes no damage from a `heat` cell written under it with `writeEffect`, gets exactly `1` from
  `tileSpeedMultiplier` on a slimed cell, and walks past a Cardboard Box in its window. The box's
  HP is unchanged and the Weevil's `distance` passes the box's.
- Windows are deterministic: two worlds on one seed give identical windows, and a different seed
  differs. Every window starts at or before `startMaxFraction × L`, and its length lies in the
  def's `[min, max] × L`. **Assert against the def's fields, never the literals**, so C's re-tune
  doesn't break this spec.
- Spawning an Ant leaves `world.rng` deep-equal to what it was (decision 6).
- A burrowed Weevil stepping into a Bay Leaf radius is targetable **in the same tick** (after that
  one `tick()`, the shaker in range has it as `targetEnemyId`). It stays surfaced on every tick
  inside, and burrows again on leaving if its window isn't over. `enemySurfaced` and
  `enemyBurrowed` fire once per change and never on a tick with no change.
- A tower whose `suppress` names a different ability has no effect on burrowing. `SuppressKind` has
  one member, so build that behaviour in the spec with a cast and a one-line comment saying why. The
  assertion is that `suppress.ts` filters on the field and not on the tower.
- After a wake, a fleeing enemy is still `untargetable` on the next tick. This is the tripwire for
  decision 1.
- A projectile in flight at a Weevil that dives before it arrives deals nothing and despawns.
- Silverfish takes exactly **0.4×** from a Salt Shaker grain and exactly **0.7×** once a Lemon's
  shot has landed. Both go **through the projectile path** (`spawnProjectile` →
  `projectilesSystem` → `dealDamage`), not `resolveDamage` directly. It is back to 0.4× after the
  strip's 240 ticks.
- The strip composes **inside** the product. Write the factors out by hand: `armored` + `mammal`,
  stripped, physical is `0.7 × 1.5 = 1.05`, not `0.8` (the product moved halfway) and not `0.9`
  (a flat +0.3 afterwards). Stripped *and* `marked` is `0.7 × 1.25`.
- `createWorld()` with a Weevil on the board still survives the JSON round trip. Extend the existing
  assertion rather than writing a second one.

## Acceptance

- [x] The Silverfish and the Lemon required **no change to any file in `core/systems/`**.
- [x] The Bay Leaf required no change to `behaviours.ts`'s union or to the schema's `behaviour`
      union. Only the `isSuppress` helper and the query in `suppress.ts` are new.
- [x] `grep -n "'burrow'" src/core/systems` finds exactly one call site.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 16B and 16C

```
core/types.ts               EnemyFlag              // + 'burrowed'
                            Enemy.burrowWindow: { fromTiles: number; toTiles: number } | null
                            GameEvent              // + { kind: 'enemyBurrowed' | 'enemySurfaced'; enemyId: EntityId; at: Vec2 }
core/systems/targeting.ts   isOnFloor(enemy: Enemy): boolean
core/systems/burrow.ts      burrowSystem(world: World): void
core/systems/suppress.ts    suppressionZones(world: World, ability: SuppressKind): { x: number; y: number; radiusTiles: number }[]
core/content/behaviours.ts  isSuppress(behaviour: Behaviour): behaviour is SuppressBehaviour
core/content/enemies.ts     weevil, silverfish          // appended to ENEMIES
core/content/towers.ts      bayLeaf, lemon              // TOWERS[12], TOWERS[13]: no hotkey, per 15B
```

**Everything downstream reads `enemy.flags.burrowed`** and never re-derives it from
`burrowWindow` (see the index, *The seam that can't be split*).

## Do not

Draw anything. The mound, the puffs and the plating are C's, and B's tooltip is the first UI. Don't
touch `ui/` beyond the `en.ts` entries `type-check` demands. Don't add a `SuppressKind` member, a
behaviour kind, or a latched "was suppressed" field. Don't author a night; C owns 13, 16 and 17.
Don't tune the burrow fractions from what the specs suggest; C has the board.
