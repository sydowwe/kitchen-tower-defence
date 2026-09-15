# Step 15B — The two towers that scrub it off

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/CONTENT.md` §1 (the **Act II** table — the
Vinegar Spray and Baking Soda rows — and the *Upgrades* section) and §3 (the `fungal`, `slime` and
`soft` rows only), `../../analytic-docs/ARCHITECTURE.md` §4.
**Prereq:** step 15A.

## Goal

The twelfth and thirteenth members of the behaviour vocabulary's client list, and the first two
towers whose job is the *board* rather than the enemy standing on it. One new behaviour kind,
`cleanse`, one interpreter, two config objects with three tiers each. Still headless: the tile going
from fuzzy green back to clean counter is 15C's, and this session judges it through specs.

This part also carries the step's damage-matrix pair — `fungal` at 0.2× physical and 2.5× chemical,
end to end through a real projectile — because that assertion needs a chemical tower to exist and one
does only here.

## Before anything else

Read `core/content/enemies.ts` for what 15A shipped (`mold`, `slug`, and the `tileWriter` field), and
step 14's tile API for the read and clear calls. `core/systems/cleanse.ts` already exists as an empty
stub with your name on it, and `SYSTEM_ORDER` already has its slot, between `spread` and `tiles` — do
not add a second.

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/content/behaviours.ts:511` | the `Behaviour` union, twelve members, plus `BEHAVIOUR_KINDS` as data and a set of `isX` narrowing helpers. Every factory writes its fields out longhand rather than spreading `params` |
| `core/content/schema.ts:262` | one `z.object` per union member inside `behaviour`, pinned `satisfies z.ZodType<Behaviour>` |
| `core/content/schema.ts:199` | `DELTA_TARGETS` — the runtime list behind `DeltaTarget`, which is `BehaviourKind \| 'def'` and so grows by itself at the type level but **not** in this array |
| `core/content/schema.ts:789` | `checkUpgradeTiers` — **exactly three tiers per tower**, a collection invariant. A tower with two fails `validateContent` at boot |
| `core/content/towers.ts:80` | `upgradesFor(id, one, two, three)` derives all four tier keys from the id; `raise(kind, field, amount)` is the one-field helper. Tiers 1 and 2 are **flat adds** sized at roughly +40% of base, re-tuned in 12C — read the comment block at the top of that file before pricing anything |
| `core/systems/combat.ts:205` | the **instant-AoE branch**: `projectileSpeed === 0 && splashRadiusTiles > 0` resolves through `dealSplashDamage`. **No tower in the game takes it today** — the Baking Soda is the first |
| `core/systems/combat.ts:161` | a tower fires only when `tower.targetEnemyId !== null`. Read decision 1 below before you attach anything to a shot |
| `core/content/statuses.ts:142` | `poison` is `4 / 60` per tick for 5s, stacking to 5 — which is *exactly* the Vinegar Spray's authored "4/s", so it needs no override |
| `ui/viewModel.ts:76` | `TowerStatsView` — one nullable field per stat a card can show, plus `buildUpgradeDiff` further down, which is what draws a tier's before → after |
| `ui/locales/contentKeys.ts:38` | `TowerMessages` requires `name`, `description` and three tier entries **per tower id**. Two new towers is ten new English strings, and a missing one fails `type-check` rather than rendering a raw key |
| `tests/content.spec.ts` | asserts the Salt Shaker's numbers literally as the calibration baseline, and walks `TOWERS` for key/English coverage. Both new towers land in the walk automatically; the literal assertions are yours to add |
| `tests/behaviours.spec.ts:38,~42` | `KindListCoversUnion`, and a `switch` with a `never` default over the whole union. Both stop compiling for a thirteenth member — that is the tripwire working, not a failure |
| `tests/schema.spec.ts:32` | `BehaviourSchemaMatchesUnion` — the schema's inferred union must be **exactly** `Behaviour` |

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **Cleansing is its own behaviour with its own interval — it is not a rider on firing.** The step
   plan says "cleans one mold tile per shot", and taken literally that ships broken: `combatSystem`
   only fires a tower when something targetable is in range, so a Vinegar Spray standing beside a
   board full of molded tiles with the mold entity already dead would never clean one of them, which
   is the exact moment the player bought it for. A `cleanse` with `intervalTicks` equal to the
   tower's `cooldownTicks` gives the doc's *rate* — one tile a second — with none of the dependency.
2. **`maxTilesPerPulse: 0` means every cell in radius.** Vinegar authors 1 and Baking Soda authors 0.
   A limit of zero meaning "no limit" is the ordinary idiom and it keeps this one field instead of a
   `scope` discriminant nothing else would ever read.
3. **"Nearest the fridge" is euclidean distance to `map.fridge.tile`, ties broken by row-major cell
   index.** Not `remainingToFridge`: that measures along a lane, and a molded cell is routinely not
   on one, so the arc answer would be measured against whatever point `nearestOnPath` happened to
   project it to. The tiebreak is what keeps it deterministic without touching `world.rng`.
4. **`clears` is an array of `TileEffectKind`, not a single kind.** Bleach clears mold *and* residue
   in Act III, and a `StatDelta` cannot rewrite an array — so a tier can never change what a tower
   clears, only how much and how far. That is the right constraint: a tier-3 Baking Soda that
   suddenly also cleared mold would make the Vinegar Spray pointless, and this shape makes that
   impossible to author by accident.
5. **The Baking Soda takes 🥣, not 🧂.** `CONTENT.md` §1 gives it the Salt Shaker's glyph and a note
   saying to pick a distinct one in step 23. Take the doc's own suggestion now: two towers with one
   emoji are indistinguishable in the shop and on the board, and leaving step 23 a collision is
   leaving step 23 a bug. Update the note in the doc while you are there.
6. **The Baking Soda is `projectileSpeed: 0` with a splash radius**, which is the instant-AoE branch
   at `core/systems/combat.ts:205`. A shaker of powder does not fly. That branch has been written and
   unexercised since step 6; this tower is what makes it real, and the specs below are the first
   thing that has ever covered it.
7. **One radius constant serves the Baking Soda's splash and its cleanse**, the way
   `NIGHTLIGHT_RADIUS_TILES` serves both halves of the lamp. It clears slime from exactly the circle
   it damages in, which is one idea and should be one number; its tier 3 raises both, the way the
   Mousetrap's tier 3 halves two fields to mean one thing.
8. **Both towers' tier 3s are authored here and added to `CONTENT.md` §1's *Upgrades* list.** That
   list was written for the towers with interesting tiers and names neither of these; the two economy
   towers set the precedent in step 7A. If the code suggests a better tier 3 than the ones below,
   take it — and write it back into this file *and* the doc.

## Build

### 1. The `cleanse` behaviour — `core/content/behaviours.ts`, `core/content/schema.ts`

Appended to the union (never reordered), with its factory writing every field out longhand:

```
CleanseBehaviour {
  kind: 'cleanse'
  radiusTiles: number
  clears: TileEffectKind[]
  /** Cells one pulse removes it from. 0 is every cell in radius. */
  maxTilesPerPulse: number
  /** Ticks between pulses. Authored to match the tower's own firing rate. */
  intervalTicks: number
}
```

Then, in the same sitting because they have to agree: the `z.object` in `behaviour`, `'cleanse'`
appended to `BEHAVIOUR_KINDS` and to `DELTA_TARGETS`, an `isCleanse` narrowing helper, and the two
spec files above updated. `DeltaTarget` is derived and needs nothing; `DELTA_TARGETS` is a hand-kept
runtime list and does — the `satisfies` on it checks that every entry is a member, **not** that every
member is an entry, so a forgotten `'cleanse'` there is a silent "this tier's delta matched nothing"
rather than a compile error. `applyDelta` throws on a field name that does not exist, which is what
catches it at boot instead.

`intervalTicks` takes `tickCount(MAX_COOLDOWN_TICKS)` with a `min(1)` — it is a firing rate wearing
a different name, and the same bound should reject the same pasted millisecond value.

### 2. `core/systems/cleanse.ts`

Replace 15A's stub. Loop `world.towers`, take `effectiveDefOf(tower)` (never the base def — tier 3
changes both towers' numbers), find the `cleanse` behaviours, and pulse.

The pulse counter is **not** `Tower.cooldownTicks` — that one belongs to the firing behaviour and is
reset by `combatSystem` on every shot, so sharing it would make cleaning stop whenever the tower
happened to be shooting. Derive it instead: `world.tick % behaviour.intervalTicks === 0`. A tower
placed mid-interval gets a short first pulse and nothing anywhere cares; and unlike 15A's spread this
one draws no rng, so lockstep across towers costs nothing but a frame where several tiles clear at
once, which is if anything the better picture.

Collect the candidate cells — every cell within `radiusTiles` of `tower.tile` carrying any kind in
`clears` — then either clear all of them (`maxTilesPerPulse === 0`) or sort by decision 3 and clear
the first N.

Gotchas:

- **Radius is measured from the tower's tile centre to the cell's tile centre**, both integers, so
  this is plain `Math.hypot` and not `core/systems/hitbox.ts`'s `circle`, which queries *enemies*.
  Do not reach for it; it takes `world` and filters entity arrays.
- **Clearing the last effect on a cell has to release the cell**, not leave a `TileState` with an
  empty `effects` array behind. Step 14's `clearState` is supposed to do this — its own fifth test
  says so. Verify it, because `world.tiles` is iterated by the renderer every frame and a night's
  worth of empty shells is a per-frame cost nobody would think to look for.
- **This runs before `tiles`**, so a cell cleared this tick is gone before it is aged. That is
  deliberate and it means a cleanse and an expiry can never both fire on the same cell.

### 3. `vinegarSpray` — `core/content/towers.ts`

`CONTENT.md` §1 Act II: 🧪, `DOT`, **145** crumbs, 4 damage + 4/s, **1.0/sec**, range **3**,
chemical, **both**, noise 0, `off_path`. `maxHp: 100` and `projectileSpeed: 0.1` by the precedent of
every other projectile tower in the file; `defaultTargetingMode: 'FIRST'` per §5 for a DPS tower.

`applies: ['poison']` **bare** — no magnitude override. The Spray Bottle two defs above overrides
because §1 gives it a 2/s the status table disagrees with; this tower's 4/s *is* the table's number,
and authoring `4 / TICKS_PER_SECOND` here would be a second copy of it that only drifts. Say that in
the comment, because the neighbouring def looks like it is setting a precedent and is not.

Plus `cleanse({ radiusTiles: 3, clears: ['mold'], maxTilesPerPulse: 1, intervalTicks: perSecond(1.0) })`
— the 3 matching its own range, and the interval matching its own rate, so the card can honestly say
"one patch a second".

Tiers, through `upgradesFor`:

- **1 and 2**: `raise('attack', 'damage', 2)` twice — 4 → 6 → 8, round numbers the diff row can print.
- **3**: `add` on `cleanse.radiusTiles` of 3, taking it to 6. What changes is what the tower is *for*:
  a base Vinegar Spray defends its own corner and a tier-3 one is the board's answer to mold. Its
  attack range stays 3, which is the point — the scrubbing reaches where the shooting does not, and
  that is a sentence the tier-3 description can actually say.

### 4. `bakingSoda` — `core/content/towers.ts`

`CONTENT.md` §1 Act II: 🥣 (decision 5), `AOE`, **80** crumbs, 6 damage, **0.6/sec**, range **2**,
chemical, **ground**, noise 0, `off_path`. `defaultTargetingMode: 'CLOSEST'` per §5 for an area tower.
`perSecond(0.6)` is 100 ticks.

`splashRadiusTiles` has no column in §1 — author it. One module constant, `BAKING_SODA_RADIUS_TILES`,
at **1.2** tiles, used for the splash *and* the cleanse radius (decision 7). For scale, the Salt
Shaker's tier-3 splash is 0.8 and it is a bonus; 1.2 is what makes this tower the AOE its role says
it is without covering its whole range-2 circle at tier 0.

`cleanse({ radiusTiles: BAKING_SODA_RADIUS_TILES, clears: ['slime'], maxTilesPerPulse: 0,
intervalTicks: perSecond(0.6) })`.

Tiers:

- **1 and 2**: `raise('attack', 'damage', 2)` twice — 6 → 8 → 10.
- **3**: two deltas in one tier, `add` of 0.8 on both `attack.splashRadiusTiles` and
  `cleanse.radiusTiles`, taking the pair to 2.0 — the whole circle at once. Two fields because they
  are one idea, exactly as the Mousetrap's tier 3 halves `cooldownTicks` and `rearmTicks` together;
  raising one and not the other gives a tower that scrubs further than it hits, which is a bug
  wearing a tier's clothes.

### 5. The card, the shop and the ghost

- `TowerStatsView` in `ui/viewModel.ts` gains `cleanseRadiusTiles: number | null` and the per-second
  count, built the way every other row is: null for a tower that has no `cleanse`, never 0.
- `ui/locales/en.ts` gains the `hud.stat` label, both towers' names and descriptions, and their six
  tier names plus two tier-3 descriptions. The label says what the tower *does*, the way `lights`
  does for the lamp and not the way the vocabulary word would.
- `buildUpgradeDiff` has to produce the tier-3 rows, or both towers' best tier reads as a blank slot.
- `reachOf` in `ui/interaction.ts:143` draws the placement ghost's circle from the firing behaviour.
  A tier-3 Vinegar Spray cleans twice as far as it shoots, and a ghost showing only the smaller
  circle is a ghost that lies about the tower's headline feature. Draw the larger of the two, or two
  circles — but decide it here rather than leaving 15C to notice.

## Tests

- A Salt Shaker's shot on a Mold resolves to exactly **0.2×**, and a Vinegar Spray's to exactly
  **2.5×** — both through the full projectile path (`spawnProjectile` → `projectilesSystem` arrival →
  `dealDamage`), not through `resolveDamage` directly. They stay one pair in one place: this is the
  assertion that catches the matrix becoming an average instead of a product, and it needs both ends.
- Chemical on a Slug is exactly **3.0×** (`slime` 1.5 × `soft` 2.0) and cold is exactly **0.5×**. Two
  tags, written out by hand, for the same reason `tests/matrix.spec.ts` writes its factors out.
- A Vinegar Spray clears **exactly one** mold cell per pulse, and it is the one nearest
  `map.fridge.tile`; with two cells equidistant it takes the lower row-major index, twice, from two
  worlds.
- It still cleans with **no enemy anywhere on the board** — decision 1's whole point, and the test
  that fails if cleaning is ever re-attached to a shot.
- A Baking Soda clears every slimed cell inside its radius in one pulse and none outside it; a cell
  at exactly `radiusTiles` is in.
- Clearing the last effect on a cell removes it from `world.tiles` rather than leaving an empty
  `TileState`.
- A Baking Soda takes the **instant-AoE** branch: one shot damages every ground enemy in
  `splashRadiusTiles` on the tick it fires, spawns no `Projectile`, and damages its primary target
  exactly once.
- Tier 3 of each tower changes both of its numbers, asserted through `effectiveDefOf` — the Baking
  Soda's splash *and* its cleanse radius, not one of the two.
- `validateContent` accepts the full roster with both towers, and `checkUpgradeTiers` is satisfied.

## Acceptance

- [ ] Adding both towers required **no change to any file in `core/systems/` except the new
      `cleanse.ts`**. If it needed one, the composition is wrong — fix the vocabulary, not the entry
      (`../../CLAUDE.md`, *Content is data, not classes*; `ARCHITECTURE.md` §4).
- [ ] `core/systems/tiles.ts` is unchanged by this session.
- [ ] A hypothetical third tower that cleared `residue` in a radius would be a config object here and
      nothing else — check it by writing one in a scratch spec, then delete it.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 15C

```
core/content/behaviours.ts  cleanse(params): CleanseBehaviour   // radiusTiles, clears,
                                                                // maxTilesPerPulse, intervalTicks
                            isCleanse(behaviour): behaviour is CleanseBehaviour
core/content/towers.ts      vinegarSpray: TowerDefOf<'vinegarSpray'>   // 145, range 3, both
                            bakingSoda:   TowerDefOf<'bakingSoda'>     // 80, range 2, ground
core/systems/cleanse.ts     cleanseSystem(world: World): void
```

Both are appended to `TOWERS`, which makes them the 11th and 12th entries.
`TowerShop.vue:81` prints a hotkey badge only for the first nine, so neither gets one — that is the
existing behaviour for the Nightlight already and it is step 20a's loadout screen that fixes it for
good. Do not add a tenth hotkey.

## Do not

Add the Gas Stove Burner (step 17), Bleach (Act III), or any tower that *writes* a tile — the
`tileEffect` behaviour already exists as a descriptor with no interpreter and it stays that way this
session. Do not author a night; 15C owns nights 11, 12 and 15. Do not draw anything — the cleaned
tile popping back to clean counter is 15C's, and a tower that scrubs invisibly is the correct output
of this session. Do not tune 15A's spread interval or slime duration from what the specs here imply;
15C has the board.
