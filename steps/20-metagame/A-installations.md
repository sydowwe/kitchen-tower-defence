# Step 20A — Installations, headless

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §7 and §8 (the counterplay
paragraph), `../../analytic-docs/CONTENT.md` §8 (the *Installations* table only; the formula above it
is B's).
**Prereq:** step 19, all four parts.

## Goal

The eleven installations of CONTENT.md §8, each one reaching the system it changes. The noise three
exist (13A), and so does the Tupperware hook (19A). The other eight hooks don't: no system reads a
sweep radius, a travel cap, a crack multiplier, a flyer delay, a spread rate, a food bonus or a snack
stash. This part gives the installations one effect shape, folds a set of owned ids into one
`WorldModifiers` object that the world carries, and threads each field into the one system that
consumes it. Nothing is bought yet (B writes the rules, D the screen). The dev noise panel becomes the
way to try them. **This part carries the step's installation tests.**

## Already in the repo

Trust symbols over line numbers.

| File | What's there now |
| --- | --- |
| `core/content/installations.ts` | `INSTALLATIONS`: the three noise ones, built by `installation(id, cost, effect)` whose `effect` is `Pick<…, 'noiseCapDelta' \| 'noiseDecayPerSecondDelta'>`. `resolveNoiseModifiers(ids)` sums them and **throws on an unknown id** (keep that) |
| `core/content/schema.ts` (`// --- installations`) | Two flat optional fields plus `MAX_NOISE_CAP_DELTA` / `MAX_NOISE_DECAY_DELTA`. The comment says step 20 picks the real shape once it can see all fourteen |
| `core/world.ts` | `CreateWorldOptions.noise` and `.food`, both "resolved numbers, not ids" (13A). `TICKS_PER_SECOND` does the one per-second conversion. `stockFridge` draws `round((18 + floor(index/3)) × foodItemsMult)` items with ids from 1 |
| `core/types.ts` | `NightState.stealsReduction`, folded in from `CreateWorldOptions.food` |
| `core/systems/fridge.ts` | `stealsFor` reads `world.night.stealsReduction`. `takeFood` is **the one take**, for a walker's leak and a thief's grab alike. It's the only place an item leaves the shelf |
| `core/systems/commands.ts` (`collect`) | `CollectCrumb` pays exactly one pile through `collectCrumb` |
| `core/systems/crumbs.ts` (`claimCrumbs`) | `travelTicksRemaining = behaviour.travelTicks`. Both collectors are 90. The Crumb Tray's tier 3 multiplies it to **0** |
| `render/layers/crumbs.ts` (`crumbPosition`) | Interpolates a claimed pile's flight as `1 - remaining / behaviour.travelTicks`, reading the **def** |
| `core/systems/spawn.ts` | `startWave` applies `enemyCountMult` per entry and calls `cursorsFor`. `spawnDestroyPenalty` reads `getNightDef(...).waves[waveIndex]` **directly** |
| `core/systems/spread.ts` | `nextTileWriteTick += writer.intervalTicks`. Mold is the only `mode: 'spread'` writer (720 ticks). The Slug is `trail` |
| `core/systems/targeting.ts` | `isFlyer(enemy)` is `tags.includes('air')` and takes an `Enemy` |
| `dev/noise/NoisePanel.vue`, `ui/views/GameView.vue` | The panel lists `INSTALLATIONS` as checkboxes and emits `resolveNoiseModifiers(owned)`. `GameView` keeps it in `devNoise` and passes `noise: devNoise` to `createWorld`. `GameView` may also carry an uncommitted `NightPanel` from another session. Leave it alone |
| `ui/locales/contentKeys.ts`, `en.ts` (`installation`) | `InstallationMessages` demands a name and description per id. **Eight new ids fail `type-check` until English exists** |
| `ui/interaction.ts` (`CRUMB_CLICK_FORGIVENESS_PX`) | Its comment says Buy-a-Broom widens it. That's stale after this part. Rewrite the comment |
| `tests/noise.spec.ts` (`the noise installations`), `tests/theft.spec.ts` (`the stealsReduction hook`), `tests/fixtures/world.ts` | Built on `noise:` / `food:` options, `world.night.stealsReduction` and a literal world. **All three change** |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **`InstallationDef.effect` is a discriminated union, exactly one per installation**, replacing the
   two flat fields: `noiseCap`, `noiseDecay`, `sweep`, `collectTravel`, `crackSpawns`, `flyerDelay`,
   `spreadRate`, `steals`, `foodBonus`, `snackStash`. The fold rule differs by kind (sum, product,
   max, min), and so does the card line D prints. With an exhaustive `switch`, a twelfth kind fails
   `type-check` in both places. 13A left this shape to this step on purpose.
2. **Defs author the doc's units, and `resolveModifiers` is the one conversion.** The noise decay is
   authored per second and the dustpan in seconds, the way CONTENT.md writes them. `WorldModifiers` is
   all ticks. The per-second conversion moves out of `world.ts` into the fold, and 13A's comment there
   moves with it.
3. **`World.modifiers: WorldModifiers`, set once in `createWorld` from
   `CreateWorldOptions.modifiers`** (default `NO_MODIFIERS`), replacing the `noise` and `food`
   options. The fold (`resolveModifiers(ids): WorldModifiers`) lives in `installations.ts`, not
   `core/modifiers.ts`, because step 21 puts night modifiers in `core/content/modifiers.ts` and will
   multiply into the same object. `NightState.stealsReduction` is **deleted**, and `stealsFor` reads
   `world.modifiers.stealsReduction`, so there's one truth. The noise pair is still folded into
   `NoiseState` at construction, because cap and decay are meter state the tier also feeds.
4. **Fold rules:** noise deltas, `stealsReduction`, `foodBonus` and `flyerDelayWaves` sum.
   `sweepRadiusTiles` takes the max. `collectTravelTicksMax` takes the min, null when none.
   `crackSpawnMult` and `spreadRateMult` multiply. `snackStash` is the def's own value, since only
   one installation carries it.
5. **The Night Shift Dustpan is a cap:** `min(behaviour.travelTicks, collectTravelTicksMax)`. An
   override of 42 would turn the Crumb Tray's tier-3 instant collection into a 0.7 s one.
6. **The broom sweeps in `core/`**, not as wider click forgiveness. A UI-only broom is invisible to a
   replay and to step 22's harness. `CollectCrumb` on a pile collects every pile whose `position` is
   within `sweepRadiusTiles` of the clicked pile's `position`, claimed or not (a click already
   cancels a claim), one `collectCrumb` each, in array order. The command shape doesn't change.
7. **Seal the Baseboard Crack** multiplies the cursors `startWave` builds on `map.paths[0]` for
   non-flyer entries that start at distance 0. That happens after the difficulty multiplier, per
   cursor, as `max(1, round(remaining × crackSpawnMult))`. A Mold with `startDistanceTiles` never came
   through the crack. `spawnDestroyPenalty`'s cursors are untouched, because they're bought against a
   crumb budget.
8. **Fix the Window Screen is per entry:** wave `w` spawns its own non-flyer entries plus the flyer
   entries of wave `w − flyerDelayWaves`. A last-wave flyer arrives "one wave later" than a night
   that has no later wave, so it doesn't come. There's no special case. Fruit Flies hatch indoors and
   are unaffected. **`waveComposition(world, night, waveIndex): WaveEntry[]`** in `spawn.ts` is the
   only reader of a night's entries for spawning, and `startWave` and `spawnDestroyPenalty` both call
   it.
9. **The Pantry Shelf Liner is a rate:** `spreadRateMult: 0.6`, read by `spreadSystem` for
   `mode: 'spread'` writers as `round(intervalTicks / spreadRateMult)`. Rate rather than interval,
   because step 21's damp night is "×1.5 faster" and multiplies the same field.
10. **Bigger Fridge adds after the difficulty rounding:** `round(base × foodItemsMult) + foodBonus`.
    "+4 every night" means four, on any tier.
11. **The Emergency Snack Stash is `{ atOnShelf: 3, items: 3 }`**, checked at the end of `takeFood`,
    because that's the only place the shelf shrinks. It fires when the count of `isOnShelf` items is
    `<= atOnShelf` (a Beetle's take can jump from 4 to 2), once per night
    (`NightState.snackStashUsed`). New items are drawn with `world.rng` from `FOODS`, take ids from
    `world.nextEntityId` and are appended. No event: the shelf and the count show it, and E's summary
    reads `snackStashUsed`.
12. **`InstallationDef.glyph`**, validated like a tower's. The card and D's scene both need one, and
    content is data. Pick them now; D may swap any once it's drawn.
13. **`isFlyer` takes `{ tags }`**, so a def and an enemy go through the one predicate.
14. **The Tupperware hook already exists.** It's re-plumbed through `WorldModifiers` and is not
    reinvented.

## Build

### 1. The effect union, the eleven defs and the fold: `schema.ts`, `installations.ts`, `types.ts`

Decisions 1–4, 12. The eleven at CONTENT.md §8's prices, in its order, without the three loadout rows
(20a). Bounds per kind in the schema, the way `MAX_NOISE_CAP_DELTA` bounds a cap. A bound should
reject a value pasted in the wrong unit: seconds as ticks, a fraction as a percent.

`NO_MODIFIERS` exported beside `resolveModifiers`. `resolveNoiseModifiers` goes. Every caller moves to
the fold.

### 2. `createWorld`, the fixture, and the dev panel

Decision 3 and decisions 10–11 in `stockFridge`. `NightState.snackStashUsed: false`.
`tests/fixtures/world.ts` gets `modifiers: NO_MODIFIERS` and loses `stealsReduction`.
`NoisePanel.vue` now lists all eleven and emits `resolveModifiers(owned)`, and `GameView`'s `devNoise`
becomes `devModifiers`. It stays dev-only.

### 3. The hooks

- `commands.ts` `collect`: decision 6. Iterate a copy, because `collectCrumb` splices, and look each
  pile up by id before paying it.
- `crumbs.ts`: export `collectTravelTicksFor(world, behaviour)` (decision 5) and use it in
  `claimCrumbs`. **Use it in `render/layers/crumbs.ts` `crumbPosition` too.** Otherwise a pile claimed
  with the dustpan starts its flight at 53% (`1 - 42/90`) and jumps halfway to the tower on the first
  frame. It looks like a claim bug, and no spec sees it.
- `spawn.ts`: decisions 7 and 8. Gotcha: `startWave` is also called from `callWaveEarly`
  (`commands.ts`). Both paths go through `waveComposition`, so neither skips the screen. A wave left
  empty by the shift (only flyers, nothing shifted in) is legal: it's spawned out on the tick it
  starts, clears, and counts down. Check that holds for the **last** wave too. The night must still
  be won.
- `spread.ts`: decision 9.
- `fridge.ts`: decisions 3 and 11. `fridge.ts` stays the only writer of food state (19's seam).

### 4. English and the stale comment

A first draft of the eight new names and descriptions in `en.ts`, in the existing idiom: what the
purchase does in the kitchen, and **no numbers** (the card reads them off the def). D rewrites them
with the cards on screen, so a draft is enough. Rewrite `CRUMB_CLICK_FORGIVENESS_PX`'s comment.

## Tests

Extend `tests/noise.spec.ts` and `tests/theft.spec.ts` where they already test this, and add
`tests/installations.spec.ts` for the rest. Every one goes **through `resolveModifiers([id])` into
`createWorld`**, never by writing `world.modifiers` by hand. The step's point is that the id reaches
the system.

- `resolveModifiers([])` deep-equals `NO_MODIFIERS`. An unknown id throws with the id in the message.
  Both cap installations together are worth +55.
- The content list is the eleven ids at 90, 100, 110, 120, 140, 150, 160, 180, 200, 220 and 260, in
  that order.
- **Broom:** three piles, two 1.2 tiles apart and one 2 tiles away. A `CollectCrumb` on the first
  pays the two and leaves the third, and `night.crumbsCollected` rises by both values. Without the
  broom it pays one.
- **Dustpan:** a Crumb Tray's claim sets `travelTicksRemaining` to 42. A tier-3 Crumb Tray's stays 0.
- **Crack:** a night with 10 Ants on `crack` spawns 8. 10 Flies spawn 10. A one-Ant entry spawns 1.
  A Mold entry with `startDistanceTiles` spawns its authored count.
- **Screen:** a synthetic night with wave 0 = Ants + Flies, wave 1 = Ants and wave 2 = Flies. Wave 0
  spawns no Flies, wave 1 spawns wave 0's, wave 2 spawns nothing, and the night is still won. A jar
  destroyed in wave 1 buys from a composition that includes the shifted Flies.
- **Liner:** a Mold's second write lands 1200 ticks after its first, not 720.
- **Tupperware:** a Beetle takes 1, the Mouse 4, an Ant still 1, and `stealsFor(mold)` is still 0.
  (The step's "reduces an ant's steals" can't be true: an Ant steals 1 and the floor is 1.)
- **Bigger Fridge:** night 1 on normal opens with 22 items, and on cozy with `round(18 × 1.3) + 4`.
- **Snack stash:** a take that leaves 3 or fewer on the shelf adds 3 on-shelf items with new ids, once.
  The next take below 3 adds none.
- `createWorld()` with every installation still survives the JSON round trip (extend the existing
  assertion).

## Acceptance

- [ ] No installation id appears anywhere in `core/systems/`. Systems read `world.modifiers`.
- [ ] `NightState.stealsReduction` and `resolveNoiseModifiers` are gone, and nothing outside
      `installations.ts` divides by 60 for an installation.
- [ ] With the dev panel, the broom visibly takes a whole kill-zone pile in one click, and a dustpan
      flight doesn't jump.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 20B

```
core/types.ts                   WorldModifiers { noiseCapDelta; noiseDecayPerTickDelta; sweepRadiusTiles;
                                  collectTravelTicksMax: number | null; crackSpawnMult; flyerDelayWaves;
                                  spreadRateMult; stealsReduction; foodBonus;
                                  snackStash: { atOnShelf: number; items: number } | null }
                                World.modifiers: WorldModifiers
                                NightState.snackStashUsed: boolean
core/content/installations.ts   INSTALLATIONS, InstallationId, InstallationEffect
                                resolveModifiers(ids: readonly DefId[]): WorldModifiers
                                NO_MODIFIERS: WorldModifiers
core/world.ts                   CreateWorldOptions.modifiers?: WorldModifiers
core/systems/spawn.ts           waveComposition(world, night, waveIndex): WaveEntry[]
core/systems/crumbs.ts          collectTravelTicksFor(world, behaviour): number
```

## Do not

Score a night, award or spend Grocery Money, or touch unlocks (B). Don't persist anything (C), draw
a Kitchen (D), or change the summary (E). Don't author Clear the Drying Rack, Take the Toaster Off
the Counter or Second Shelf (20a), or build night modifiers (step 21), even though the fold is where
they'll land.
