# Step 21B — Night modifiers, headless

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/CONTENT.md` §3 (the matrix's first paragraph)
and §6 (the modifier column), `../../analytic-docs/DECISIONS.md` §4 (the rot line) and §11.
**Prereq:** step 20a. It's ordered after 21A, but nothing in it depends on A: its tests build on the
Counter.

## Goal

A modifier is a named patch applied at night start, and it's the content lever for every future update.
It needs to be a general system, and five modifiers exercise it: dishes left out, a damp night, after a
dinner party, moving day, and a heatwave. At the end of this part a night def can name a modifier and
`createWorld` builds that night with it: its numbers folded into `world.modifiers`, its crumbs on the
floor and its boxes on the build tiles. No night names one yet, because C wires them, and nothing shows
one, because that's F. **This part carries the step's two modifier tests.**

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/types.ts` (`WorldModifiers`) | Eleven fields, each documented with the system that reads it. The header calls them what the installations are worth. `NightState` has no modifier |
| `core/content/installations.ts` (`NO_MODIFIERS`, `resolveModifiers`) | The fold. A per-kind `switch` with a `never` default, over `{ ...NO_MODIFIERS }`, which is a **shallow** copy. The header says "multipliers multiply, so step 21's night modifiers can land in the same object" |
| `core/world.ts` (`createWorld`, `cloneMapDef`, `stockFridge`) | Resolves the night def. `cloneMapDef`'s comment already expects moving day. The shelf is drawn from `world.rng` first. `modifiers` is copied as `{ ...modifiers, snackStash: … }` |
| `core/map.ts` (`TileFlags`, `canPlace`) | The comment on `TileFlags` says moving day clears `BUILDABLE` from 30% of tiles. `DECOR` is floor drawn as scenery that can't be built on |
| `core/systems/spawn.ts` (`startWave`) | `Math.max(1, Math.round(entry.count * world.difficulty.enemyCountMult))`, then the crack's cut per cursor |
| `core/systems/resolve.ts` (`crumbValueFor`) | `max(1, round(reward × crumbIncomeMult))`, at the drop |
| `core/systems/combat.ts` (`applyDamage`, `dealDamage`) | Every damage in the game goes through `applyDamage`: hits and splash (via `dealDamage`), auras (`aura.ts`), DoT (`status.ts`), heat tiles (`systems/tiles.ts`) and barricade reflect. `dealDamage`'s event carries `multiplier: amount / base` |
| `core/systems/crumbs.ts` (`dropCrumb`, `MERGE_RADIUS_TILES`, `HATCH_TICKS`) | The one door onto the floor. It adds to `night.crumbsDropped` and merges into a pile within 0.7 tiles. A pile hatches at 2100 ticks |
| `core/systems/spread.ts` (`intervalFor`) | `writer.intervalTicks / world.modifiers.spreadRateMult` |
| `core/content/schema.ts` (`night`, `RawContent`, `validateContent`, `checkNightUnlocks`) | `night` has no modifier field. `checkNightUnlocks` is the precedent for a collection check across two kinds |
| `core/content/enemies.ts` (`mold`) | "Night 11's 'damp night' (step 21) is 50% faster than this" |
| `ui/locales/contentKeys.ts` (`InstallationMessages`) | The pattern that makes an untranslated def a build error |
| `tests/fixtures/world.ts` | A literal `NightState`. A new field fails `type-check` there, on purpose |
| `tests/content.spec.ts:88` | `validateContent({ towers, enemies, maps, nights })`, with no modifiers passed |
| `tests/world.spec.ts` | The round-trip, and "gives the world its own copy of the map, so a night modifier cannot corrupt the def" |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and then
edit this file. Don't leave it lying.

1. **`core/content/modifiers.ts`: `NIGHT_MODIFIERS`**, each
   `{ id, nameKey, descriptionKey, glyph, effects: NightModifierEffect[] }`, in the
   `InstallationDefOf<Id>` pattern and zod-validated at boot. It's a *list* of effects because the
   dinner party and the heatwave have two each. The effects are the declaration the step asks for.
   Beside the union goes a table exhaustive over its `kind`s, naming the world fields each kind writes.
   Then a sixth kind can't ship without saying what it touches, and the snapshot test reads the table.
2. **Ids and effects**, transcribed from `CONTENT.md` §6:
   - `dishesLeftOut`: `scatterCrumbs { piles: 15, value }`. Pick the value and give the reason in the
     file. 5 is a Roach's reward and draws as the 🍞 band.
   - `dampNight`: `spreadRate { mult: 1.5 }`. It's the *rate*, so the interval is divided: 720 → 480.
     That's §6's "50% faster" and the note on `mold`. The step's "interval ×1.5" was backwards.
   - `dinnerParty`: `enemyCount { mult: 2 }` and `crumbValue { mult: 2 }`.
   - `movingDay`: `boxes { fraction: 0.3, glyph }`.
   - `heatwave`: `damageType { damageType: 'fire', mult: 1.3 }` and
     `damageType { damageType: 'cold', mult: 0.7 }`.
3. **The numbers fold into `world.modifiers`.** `WorldModifiers` gains `enemyCountMult`,
   `crumbValueMult` and `damageTypeMult: Record<DamageType, number>`, all 1 in `NO_MODIFIERS`.
   `applyNightModifier(modifiers, def): WorldModifiers` returns a new object and multiplies. Installations
   never write the three new fields. They're on the world for the reason the others are: a replay
   carries what the night was built with, and no system reads a modifier id.
4. **The night brings its modifier, and the options bring the installations.**
   `NightDef.modifierId?: DefId` is optional: nights 1–3 and every synthetic night carry none.
   `createWorld` reads it off the night def it already resolves, folds it over `options.modifiers`, and
   sets `NightState.modifierId: DefId | null`. `CreateWorldOptions` doesn't change. A modifier passed in
   separately could disagree with the night, and the save and the harness both build tonight from its
   id.
5. **The scatter and the boxes are built in `createWorld`, after the shelf, from a generator opened on
   the seed (`createRng`, salted per effect). Never `world.rng`, and never a `fork()` of it**, which
   writes `rng.forks`. The world's own stream stays exactly what it would have been without the modifier,
   so every Weevil window and `RANDOM` target on that night is unchanged by it. That's also what lets
   the snapshot test show nothing else moved.
6. **The count rounds once, over the product**:
   `waveEntryCount(count, difficulty, modifiers) = max(1, round(count × difficulty.enemyCountMult ×
   modifiers.enemyCountMult))`, exported from `spawn.ts` and called by `startWave`. F's preview calls
   the same function with the tier and tonight's fold, so `ui/` shows what will spawn without copying
   the rounding (20aB decision 3's objection).
7. **The crumb value doubles on the drop:** `crumbValueFor` multiplies by `crumbValueMult` inside its
   one rounding. Tower income and the early-call bonus stay as they are. §6's "double crumbs" are the
   ones on the floor.
8. **Damage by type, in `applyDamage`:**
   `resolveDamage(base × world.modifiers.damageTypeMult[damageType], damageType, enemy)`. Every source
   goes through it, so a heatwave warms burn ticks, the Candle's aura and heat tiles as well as a
   Toaster shot. `dealDamage`'s `multiplier` (`amount / base`, on the unmultiplied base) therefore
   includes it. On a heatwave night a neutral fire hit's number is coloured strong. That's intended,
   and F makes the enemy tooltip agree. Edit `CONTENT.md` §6's cell from "fire towers +30%, cold
   towers −30%" to "fire damage +30%, cold damage −30%".
9. **Boxes go on `round(fraction × n)` of the n tiles where `canPlace(map, tile, 'off_path')`**, picked
   without replacement. That's never track: a box on the lane would sit on the barricade slot and in
   the enemies' way. Each boxed tile becomes `DECOR` (not `BUILDABLE`) in `world.map.flags` and gets a
   `world.map.decor` entry. Then the bake draws it, and `canPlace`, the placement ghost and the refusal
   toast all say no without a new flag or a new rejection. **The glyph isn't 📦.** Sprites are found by
   glyph, so a 📦 on a build tile draws as the Cardboard Box sprite, and the player sees a tower they
   think they own. Use one no tower, enemy or crumb band uses. **It lives on the effect, not as a
   constant in `world.ts`.** Step 23H builds its emoji subset by walking the content. A glyph that
   exists only in world state at runtime is the one that list misses, and it would render in the
   system font.
10. **The scatter goes through `dropCrumb`**: 15 piles on the lanes at tick 0, spaced so none merge.
    `dropCrumb` is the one door, so they count in `crumbsDropped`. Collecting them is cleanliness, and
    leaving them is a dirty kitchen. 20B decision 3 expected otherwise. The clamp it added in
    `groceryMoneyFor` stays, and does no harm.
11. **English: `modifier.<id>.name` and `.description`**, typed as `NightModifierMessages` in
    `contentKeys.ts` over the modifier ids. You draft it, and F rewrites it with the banner on screen.
    Each glyph has to be one no tower or enemy uses, because `EntityGlyph` draws a sprite for any glyph
    that matches one.
12. **Doc fixes in this commit:** `DECISIONS.md` §9's parenthetical gives the scatter to the dinner
    party. It belongs to dishes left out, and the dinner party doubles crumbs and spawns. Plus
    `CONTENT.md` §6's heatwave cell (decision 8).

## Build

### 1. The defs and the fold: `schema.ts`, `types.ts`, `modifiers.ts`, `installations.ts`

Decisions 1–4 and 11. The zod `nightModifier` has an effect union bounded like every number in the
schema. The collection check: a night naming an unknown modifier fails boot, beside `checkNightUnlocks`.
`RawContent` and `Content` gain `modifiers`, and `content/index.ts` passes `NIGHT_MODIFIERS`. So does
`content.spec`'s `validateContent` call now, so C doesn't meet it later.

Gotcha: **`damageTypeMult` is the first nested object on `WorldModifiers`, and three places copy it
shallowly**: `resolveModifiers`' `{ ...NO_MODIFIERS }`, your fold, and `createWorld`'s copy. A fold that
writes `modifiers.damageTypeMult.fire *= 1.3` into the shared record edits `NO_MODIFIERS` for the rest
of the process. The game never shows it, because it builds one world per page. But every world built
after the first heatwave has fire at ×1.3: a spec that passes alone and fails in the suite, and a step
22 harness whose nights 1–17 are balanced in a heatwave. Copy the record in all three.

### 2. The three hooks: `spawn.ts`, `resolve.ts`, `combat.ts`

Decisions 6–8. These are the step's one-time system edits. From here on a modifier is an entry.

### 3. The world: `world.ts`

Decisions 4, 5, 9 and 10, plus `NightState.modifierId`, the fixture, and `cloneMapDef` untouched: the
boxes write the clone it already makes.

Gotchas:

- **The boxes reach the screen with no change to `render/`** only because `GameView.restart()` calls
  `renderer.setMap(next.map)` with the **world's** clone, and the bake is keyed by that object. Keep it
  that way. A `setMap(getMapDef(…))` anywhere would draw the authored floor under invisible boxes.
- **Piles spaced along a lane by distance can still merge** where a lane doubles back past itself, or
  where two lanes run side by side. Place, then count `world.crumbPiles`: it has to be 15.
- **A scattered pile rots from tick 0.** Fifteen fruit flies hatch 35 seconds in unless the piles are
  collected. That's the "free spawn pressure" in the step, not a bug, and the opening countdown is 6
  seconds of it.
- **Doubling turns a `count: 1` mold into two molds on one tile**: one patch growing twice as fast.
  Nightmare's 1.25 on top makes it 3 (`round(2.5)`). C authors night 15 knowing that. Don't special-case
  it here.
- **The Pantry Shelf Liner's 0.6 and the damp night's 1.5 fold to 0.9.** That's the header's "multipliers
  multiply". Assert it, so no one "fixes" it into a max.

## Tests

`tests/modifiers.spec.ts`, plus extensions to `world.spec` (the round-trip with each modifier).

- **Each modifier changes exactly the documented fields and nothing else.** Push one synthetic night on
  the Counter into `NIGHTS` (the `charges.spec` trick, popped in `afterEach`). Build it at one seed
  without a `modifierId`, then with each modifier's. Diff the two worlds as JSON paths: the changed set
  is exactly decision 1's table for that modifier's effects, plus `night.modifierId`. Each declared
  path actually changed, and nothing undeclared did (so `rng` never appears).
- **Moving day is deterministic under a fixed seed:** the same seed gives the same flags twice, and
  another seed gives another set. Exactly `round(0.3 × n)` tiles are boxed, none of them track, each
  refused by `canPlace` and each carrying a decor entry. The authored `MapDef` from `getMapDef` is
  untouched.
- **Damp night:** a mold's pulse is 480 ticks. With the Pantry Shelf Liner owned too it's 800
  (720 / 0.9).
- **Dinner party:** a 5-count entry spawns 10. A 1-count entry at nightmare spawns 3. An Ant's drop is
  6, and a Crumb Tray payout is unchanged.
- **Heatwave:** 10 fire on an untagged target deals 13, 10 cold deals 7, and 10 physical deals 10. A
  burning enemy's tick is ×1.3 too. The event's `multiplier` is 1.3.
- **Dishes left out:** 15 piles at tick 0, `crumbsDropped` is 15 × value, and the world's
  `rng.state` equals the unmodified night's.
- **No leak between worlds:** build every modifier's world, then a plain one. The plain one's
  `modifiers` equal `NO_MODIFIERS`, and `NO_MODIFIERS.damageTypeMult.fire` is still 1.

## Acceptance

- [x] Adding a sixth modifier from the existing effect kinds is a new entry in `modifiers.ts` and its
      English, and no other file. If it isn't, the vocabulary is wrong. Fix it now.
- [x] No system reads a modifier id. `grep -rn "modifierId" src/core/systems` finds nothing.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 21C and 21F

```
core/content/modifiers.ts   NIGHT_MODIFIERS; ids dishesLeftOut, dampNight, dinnerParty, movingDay, heatwave
                            getNightModifierDef(id: DefId): NightModifierDef   // throws on an unknown id
                            applyNightModifier(modifiers: WorldModifiers, def: NightModifierDef): WorldModifiers
core/content/schema.ts      NightDef.modifierId?: DefId
core/types.ts               NightState.modifierId: DefId | null
                            WorldModifiers.enemyCountMult, crumbValueMult: number
                            WorldModifiers.damageTypeMult: Record<DamageType, number>
core/systems/spawn.ts       waveEntryCount(count: number, difficulty: Pick<Difficulty, 'enemyCountMult'>,
                                           modifiers: Pick<WorldModifiers, 'enemyCountMult'>): number
ui/locales/en.ts            modifier.<id>.name / .description (drafts; F rewrites)
```

## Do not

Give any authored night a modifier (C). Show one anywhere: no banner, preview line or HUD chip (F). Add
a modifier the doc doesn't list, or a tile-state effect for the boxes. They're map flags, and tile state
is for things that happen to a tile during a night.
