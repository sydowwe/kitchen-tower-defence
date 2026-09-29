# Step 17A — The Candle, the Gas Stove Burner and the Fly Paper

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../../CLAUDE.md`, `../../../analytic-docs/CONTENT.md` §1 (the Act II table's
**Candle**, **Fly Paper** and **Gas Stove Burner** rows, their behaviour notes, and the *Upgrades*
list), §4 (the Burn and Rooted rows), and `../../../analytic-docs/DECISIONS.md` §8 (noise).
**Prereq:** step 16, all three parts.

## Goal

Three of the step's four towers, headless. Two of them are nearly pure config: the Candle is an
`aura` plus a `reveal`, and the Fly Paper is an `attack` plus a `charge`. The Burner needs the one
interpreter this part adds, for `tileEffect`, which has been in the vocabulary since step 2 with
nobody reading it. Reading the code for the Fly Paper also turned up two bugs in step 10's roots,
and this part fixes both. Nothing is drawn. C owns the cards and D every pixel. **This part carries
the step's Burner and Fly Paper tests**; B carries the Honey Pot's.

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/systems/aura.ts` | `auraSystem`, which pulses every `AURA_INTERVAL_TICKS` (6) on the world clock through `circle` + `isTargetable`. It deals `damagePerTick * 6` via `applyDamage` and lands `applies` via `applyStatuses`. **The Candle needs no line here.** The header's sentence about "the Gas Stove Burner beside it" is wrong: the Burner isn't an aura. Fix it |
| `core/systems/light.ts:56` | `lightSources` = every tower with a `reveal`. `LIGHT_ATTRACTION_TILES` (5) is the moth's reach, and `RevealBehaviour`'s docstring (`behaviours.ts:477`) already says the Candle joins by carrying a `reveal` |
| `render/layers/towers.ts:337` | the light-pool gradient cache is keyed by radius, "so the Candle is one cache lookup away". The Candle gets a pool for free |
| `core/content/behaviours.ts:445` | `TileEffectBehaviour { effect, radiusTiles, magnitude, durationTicks, refreshIntervalTicks }`, schema'd at `schema.ts:341`, with no interpreter and no `isTileEffect` helper. **`magnitude` is `z.number()` with no bound**, because it means a different thing per kind. A bare `14` passes validation and burns at 840/s |
| `core/tiles.ts:161` | `writeEffect` merges a rewrite by the kind's `onRewrite`. Heat is `'refresh'`: the longer of the two durations, and the newer magnitude. `tilesInRadius(map, centre, 0)` is exactly the one tile. `durationFor` (`:144`) lifts a 0 duration to 1 |
| `core/content/tileEffects.ts:86` | `heat`: `damageOverTime`, fire, default 14/60 a tick for **2 seconds** |
| `core/systems/tiles.ts:34` | `tileUnder`, the one floor check (`isOnFloor`): flyers and burrowed Weevils take no heat |
| `core/systems/noise.ts:136` | "There is no per-second emitter here. The only one in v1 is the Gas Stove Burner's `tileEffect` … step 17's". `projectedNoisePerSecond` (`:49`) returns 0 for anything without a firing behaviour |
| `ui/views/GameView.vue:425` | counts every `towerFired` with `noise > 0` as a loud shot. Nothing in `render/` consumes `towerFired` |
| `core/systems/charges.ts:178` | `retireSpentTowers`: a charge tower leaves when `charges === 0`, nothing is rearming, **and** it holds no roots. The `tickRearms` comment (`:115`) says "step 17's Fly Paper" needs the one-at-a-time rearm, which is false: the paper doesn't rearm |
| `core/systems/placement.ts:207` | `removeTower`, the single exit that `sellTower`, `destroyTower` and `retireSpentTowers` all go through. **It releases nothing.** See decision 5 |
| `core/systems/targeting.ts:163` | `pickTargets` excludes only enemies *this* tower holds (`holdsSourceStatusFrom`). See decision 6 |
| `core/content/statuses.ts:54` | `rooted` merges under `refresh`: last application wins, **`sourceId` included** |
| `core/sim.ts:64` | `SYSTEMS`. `tests/sim.spec.ts:66` pins the order as a literal, and `:89` requires a `${name}System` export from `core/systems/index.ts` per slot |
| `tests/content.spec.ts:651` | `TOWERS[12]`, `[13]` and `toHaveLength(14)` |
| `ui/locales/contentKeys.ts:39` | an English entry with three tiers is **required** per tower id, so `type-check` fails until `en.ts` has the three new ones |

**Specs that will break, by design:** `tests/sim.spec.ts`'s order literal, and
`tests/content.spec.ts`'s tower count. `Enemy` doesn't change here, so no fixture literal does.

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **The Candle is `[aura(...), reveal(...)]` with one radius constant for both, 2**: the
   Nightlight's "one constant because they are one number". The `reveal` *is* "reuse step 11's
   light registry". A second registry is what the step says not to build. It also reveals `hidden`
   enemies within 2, which is correct for a lit candle and inert today, because no v1 enemy is
   `hidden`. **The base aura applies nothing, and tier 3 `replaceApplies` the aura with
   `['burn']`.** "Burn stacks to 3" can't mean a capped base burn: `StatusApplication.stacks` is
   how many go on per hit, and the cap of 3 lives on `STATUS_DEFS.burn`, so any base burn already
   reaches 3 in three pulses. At the status table's 5/s, three stacks is +15/s on top of the
   aura's 4/s. That's too much for a tier: author a `magnitude` override and let D judge it.
2. **The Burner authors `durationTicks: 2, refreshIntervalTicks: 1`.** It rewrites its cells every
   tick, and each write lives two. The test wants heat gone within one tick of a sale, and heat's
   2-second default would linger 120 ticks. **Not 1**: a 1-tick effect is written in the
   `tileEffect` slot and aged out in `tiles` the same tick. It still burns, but the renderer, which
   reads between ticks, never sees it. The symptom is a Burner that kills things standing on a
   tile that looks clean.
3. **The Burner's noise is `def.noise` per second of burning something.** On the world clock
   (`world.tick % 60 === 0`), a Burner with an on-floor enemy on any cell it wrote this tick pushes
   **one `towerFired { noise: def.noise }`**. That's the same event as a shot, so the meter,
   `GameView`'s loud-shot count and a future balance report all count it with no new member.
   Constant noise would be a trap: 2/s beats the 1.5/s decay, so a Burner idling through the build
   phase would wake the house on its own. `projectedNoisePerSecond` gains a `tileEffect` branch
   returning `def.noise`, and the card will say 2/sec.
4. **A new slot, `tileEffect`, in `core/systems/tileEffect.ts`, between `cleanse` and `tiles`.**
   That's the group `sim.ts` already calls "everything that writes or erases a cell, then the
   system that ages them". Before `tiles`, so a Burner placed this tick burns this tick. Named after
   the behaviour, as `aura` and `cleanse` are. It's stateless: it writes every
   `refreshIntervalTicks` on the world clock, keeps no field on the tower, and a sold Burner simply
   stops writing.
5. **`removeTower` releases every `endsWithItsSource` status whose `sourceId` is the removed
   tower**, on every enemy. Today a Sticky Tape sold mid-root leaves that enemy rooted with a -1
   duration forever: a rooted fly with nothing left that can hit air is a wave that never clears.
   It goes in `removeTower` because sell, destroy and retire all pass through it. **Import
   `endsWithItsSource` from `core/content/statuses.ts`, not anything from `charges.ts`**: that file
   already imports `removeTower`, and the cycle surfaces as an `undefined` at module load.
6. **A tower that applies a hold never targets an enemy someone else already holds.** Today two Fly
   Papers side by side both pick the nearest fly. The second root overwrites `sourceId`, so the
   first paper's count drops to 0 and it re-roots the same fly next cooldown, and the two drain
   each other onto one insect. It's the same with two tapes. In `pickTargets`: when the firing
   behaviour's `applies` contains a kind whose def is `untilSourceSpent`, skip any enemy carrying
   such a status from any source. **Only then**: a Salt Shaker must keep shooting rooted enemies.
   Name the kind-level check once in `statuses.ts` (e.g. `holdsUntilSourceSpent(kind)`) beside
   `endsWithItsSource`, which asks it of a live status.
   **`pickTargets` alone is not enough, and 17A added a second check in `combatSystem`.**
   `targeting` runs for every tower before any of them fires, so two papers that see the same
   nearest fly both aim at it on the same tick, before either root exists. So, at fire time, a
   holder whose target has just been rooted by an earlier tower in the loop picks again through
   `pickTarget`. The two-paper test puts the papers mirrored across the lane for exactly this case;
   with them side by side, CLOSEST happened to split them and the test passed without the fix.
7. **Fly Paper is `attack` (0 damage, `targets: 'air'`, `projectileSpeed: 0`, `applies:
   ['rooted']`, range 2) plus `charge({ charges: 2, rearmTicks: 0, maxOutstanding: 2 })`.**
   `maxOutstanding` equals the charges: a panic button that holds one fly and waits for it to die
   before catching the second isn't one. "Self-removes when spent" means what the tape means: it
   leaves on the tick after its last stuck flyer dies. Reading "at zero charges" instead would,
   after decision 5, release both flies the moment it caught the second.
8. **Appended, never inserted:** `candle`, `gasStoveBurner`, `flyPaper` are `TOWERS[14]`, `[15]`,
   `[16]`. No hotkey (step 20a).
9. **Tiers are authored here and added to `CONTENT.md` §1 *Upgrades***, as 15B and 16A did. Drafts,
   which D re-tunes:
   - **Candle**: `raise('aura', 'damagePerTick', …)` twice, landing on numbers the card can print
     (4 → 5.5 → 7/s). T3 is decision 1, authored as `burn` at 2/s a stack (+6/s at the cap).
   - **Burner**: `raise('tileEffect', 'magnitude', …)` twice (14 → 20 → 26/s). T3 is `add`
     `radiusTiles: 1`: the flame reaches the tiles either side.
   - **Fly Paper**: `charges` and `maxOutstanding` both +1, twice (2 → 3 → 4). T3 `add`s
     `rearmTicks: 600`: a fresh sheet every ten seconds, and it stops leaving the board. That's a
     tier-3-shaped change for a disposable tower, and it's pure config: `spendCharge` and
     `retireSpentTowers` already read `rearmTicks`.

   Take a better tier where you find one, and write it back here and to the doc.

## Build

### 1. The interpreter: `core/systems/tileEffect.ts`, `sim.ts`, `systems/index.ts`, `behaviours.ts`

`isTileEffect` beside `isCleanse`. For each tower's **effective** def, each `tileEffect` behaviour,
on its interval: `writeEffect` on every `tilesInRadius(world.map, tower.tile, radiusTiles)` with the
behaviour's magnitude and duration. Skip terminal phases. Update `tests/sim.spec.ts` and the order
string in `tick()`'s docstring in the same commit.

Then the noise (decision 3). Ask "is an on-floor enemy on one of these cells" through `tileUnder` or
`enemyPosition` + `tileAt` + `isOnFloor`, not a second floor rule. Rewrite `noise.ts:136` to say
what's true now.

Gotcha: `magnitude` is per **tick**. Author the Burner's `14 / TICKS_PER_SECOND`, and pin it in
`tests/content.spec.ts`, because the schema won't catch a bare 14 (see the table).

Gotcha: tier 3's radius 1 around a track tile also writes heat on the buildable tiles beside it.
That's harmless (nothing off the track stands on the floor there today), but the cell count
triples. It's still a handful of cells, far inside `core/tiles.ts`'s budget.

### 2. The roots: `placement.ts`, `targeting.ts`, `statuses.ts`

Decisions 5 and 6. Fix the stale `tickRearms` comment while you're in `charges.ts`.

### 3. The three defs: `core/content/towers.ts`

Every doc number comes from the `Read first` rows; only what isn't there is listed here. `maxHp:
100` and `CLOSEST` are every non-wall, non-DPS tower's precedent.

- **`candle`**: 🕯️, `DOT`, 130, noise 0, `off_path`. `aura({ radiusTiles: 2, damagePerTick: 4 /
  TICKS_PER_SECOND, damageType: 'fire', targets: 'both' })` plus `reveal({ radiusTiles: 2,
  attractsLightDrawn: true })`.
- **`gasStoveBurner`**: ♨️, `TILE_EFFECT`, 200, noise 2, **`path_only`**. `tileEffect({ effect:
  'heat', radiusTiles: 0, magnitude: 14 / TICKS_PER_SECOND, durationTicks: 2, refreshIntervalTicks:
  1 })` and nothing else. It isn't a barricade: `barricadePositions` asks `isBarricade`, so enemies
  walk over it. The Cardboard Box competes with it for the same tiles, which is the step's
  "good tension".
- **`flyPaper`**: 🎗️, `CONTROL`, 35, noise 0, `off_path`, decision 7. The doc's rate column is a
  dash, and the attack needs a `cooldownTicks`: `perSecond(2)` is a draft. The damage type is
  `physical` against 0 damage, the Sticky Tape's honest filler.
- **`en.ts`**: names, descriptions, tier names and three tier-3 sentences, as a **first draft that
  C rewrites**. Add the three tier-3 lines to `CONTENT.md` §1 *Upgrades*, drop "*(arrives with the
  Candle, step 17)*", and add a behaviour note for the Candle ("a light: Moths drift toward it") and
  the Burner's noise rule.

Gotcha: the Candle is `fire`, and `applyDamage` writes a permanent `scorch` under every enemy fire
touches (`combat.ts:52`). A Candle on a busy lane scorches its whole radius of track within a
night. It's cosmetic and `ignore`-on-rewrite, so it costs one scan and no allocation. Don't "fix"
it; D may want to look at it.

## Tests

- **Burner heat**: placed through the command path, its tile carries `heat` at the end of the tick
  it was placed and at the end of every tick for 600 more. After a `SellTower`, it is gone by the
  end of **that** tick (`hasEffect` false).
- A rooted Ant on the Burner's tile for 60 ticks loses `14 × 1.5` (`swarm`), through the matrix.
  A Fly over the same tile loses nothing.
- **Burner noise**: over 120 ticks with an enemy held on its tile, exactly two `towerFired` from it,
  each `noise: 2`. With nothing on the tile, none. `projectedNoisePerSecond(gasStoveBurner)` is 2,
  and a Salt Shaker's is unchanged.
- **Fly Paper consumes exactly one charge per rooted flyer.** With three Flies in range, two are
  rooted and `charges` is 0. The third is never rooted, and no ground enemy ever is. The paper is
  still on the board while either fly lives, and gone the tick after the second dies.
- **Two Fly Papers against four Flies root four different Flies** and spend four charges. This is
  the tripwire for decision 6. A Salt Shaker in range still targets a rooted Ant.
- **Selling a Sticky Tape mid-root** leaves its Ant with no `rooted` status at the end of that
  tick, and it has moved one tick later. Same for a Fly Paper and a Fly.
- **Candle**: `lightSources` includes it. A Moth within 5 tiles of a lone Candle drifts toward it,
  following the Nightlight spec in `tests/light.spec.ts`. A rooted Ant in its radius loses `4 ×
  1.5` over 60 ticks. At tier 3 the Ant carries 3 `burn` stacks after 18 ticks, never 4.
- `tests/content.spec.ts`: each def against its doc row, the Burner's magnitude per tick, and
  `TOWERS[14..16]` with `toHaveLength(17)`.

## Acceptance

- [x] The Candle required **no change to any file in `core/systems/`** (beyond the `aura.ts` header
      sentence this step asked to correct). The Fly Paper's only system changes are decisions 5 and
      6 (`placement.ts`, `targeting.ts`, and decision 6's fire-time re-check in `combat.ts`), and
      both are fixes to step 10's roots that the Sticky Tape needed too.
- [x] The Burner's only new file is `tileEffect.ts`, and `core/systems/tiles.ts` is untouched.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 17B, 17C and 17D

```
core/systems/tileEffect.ts   tileEffectSystem(world: World): void            // slot 'tileEffect', after 'cleanse'
core/systems/noise.ts        projectedNoisePerSecond(def)                    // def.noise for a tileEffect tower
core/content/behaviours.ts   isTileEffect(behaviour: Behaviour): behaviour is TileEffectBehaviour
core/content/statuses.ts     holdsUntilSourceSpent(kind: StatusKind): boolean
core/systems/targeting.ts    appliesHold(reach), isHeld(enemy)               // Reach gained optional `applies`
core/content/towers.ts       candle, gasStoveBurner, flyPaper                // TOWERS[14], [15], [16]
```

## Do not

Draw anything, or touch `ui/` beyond the `en.ts` entries `type-check` demands. The cards are C's
and the pixels D's. Don't start the Honey Pot or `bait` (B). Don't change `aura.ts` or
`tilesSystem` logic. Don't author or re-tune a night. Don't tune numbers from what the specs
suggest; D has the board.
