# Step 22B — The policies

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/CONTENT.md` §1 (both tower tables, *Economy
rates*, *Upgrades*), §3 and §5, `../../analytic-docs/DECISIONS.md` §10 (*What this changes*).
**Prereq:** step 22A.

## Goal

Four scripted players and two ways of packing a loadout, so a night can be asked how it goes for
different people. `greedy` is the upper bound on income. `casual` is the lower bound on skill: if it
can't clear night 8, the difficulty curve is broken for real players. `noEconomy` asks whether economy
towers are mandatory (they should be strong, not required), and `random` hunts crashes. `optimal` and
`blind` measure whether the night preview is enough to choose a loadout from.

They are **measuring instruments.** A `greedy` that plays like a mediocre human is exactly right, and
every hour spent making one play well is an hour measuring the policy instead of the game. Placement
scoring goes in `core/`, because step 23's "recommended tile" hint would ask the same question.
**This part carries the policy tests and the smoke run.**

## Already in the repo

| File | What's there now |
| --- | --- |
| `dev/harness/types.ts`, `run.ts` | 22A's `Policy`, `LoadoutPolicy`, the two registries, `runJob`, `runNight`, `replayNight`, the `idle` policy and the `default` loadout policy. `runNight` makes a fresh policy each night, calls `begin` once and `decide` every tick |
| `ui/viewModel.ts:598` (`statsFor(def)`) | The shop card's numbers: `dps`, `rangeTiles`, `targets`, `damageType`, `crumbsPerSecond`, `heatRadiusTiles`, rounded to 2 dp. It imports only `core/`, and its header forbids `vue`. **The only DPS formula in `src/`.** It counts a hit's damage times its rate, an aura's rate and heat's rate. It doesn't count poison |
| `ui/kitchenView.ts:156` (`buildPreview(night)`) | The preview the loadout screen shows. `enemies` is `[{ id, count, tagKeys, firstWave }]`, the whole composition at authored counts. Imports only `core/` |
| `core/content/matrix.ts` (`resolveDamage(base, type, target)`) | Tags multiply. `target` needs `{ tags, statuses }` |
| `core/systems/targeting.ts` (`isFlyer`) | Air or ground, from the tags |
| `core/systems/spatial.ts:63` (`queryEnemiesInRange`) | Squared distance from the tower's **tile centre** to the enemy's sampled position, inclusive |
| `core/path.ts` | `samplePath`, `totalLength`. Waypoints are tile coordinates on tile centres |
| `core/systems/placement.ts` (`canPlaceTower`) | The one legality answer, including `fouled` (mold) and `notInLoadout` |
| `core/systems/commands.ts` | `earlyCallBonus`, `upgradeCostFor(world, tower)`. `PlaceTower` naming an **unknown** def id throws, by design |
| `core/campaign.ts` (`unlockedTowerIds`) | Unlock order, oldest first |
| `core/loadout.ts` | `addToLoadout`, `checkLoadout`. Progress-free, written for exactly this |
| `core/rng.ts` (`createRng(seed)`) | A bound generator with its own state |
| `core/content/index.ts` (`effectiveDef(defId, tier)`) | A tower's def at a tier |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **`core/coverage.ts`: `trackCoverage(map, tile, rangeTiles): number`**, the tiles of track within
   `rangeTiles` of the tile's centre, summed over every path.
   - **Analytic, per segment**: the chord a circle cuts from a line segment, not a sampled count. The
     spec can then assert exact values, and there's no step size to argue about.
   - **The targeting measure**: tile centre, euclidean, inclusive, as in `queryEnemiesInRange`.
     Anything else ranks tiles by a reach the tower doesn't have.
   - **Map only, no world.** A hint would call it on an empty board.
2. **A tower's value is the card's DPS, weighted by what's coming.** Take `statsFor(def).dps` and
   multiply it by the mean matrix multiplier over tonight's enemies, weighted by count × HP. Each
   multiplier is `resolveDamage(1, type, { tags, statuses: [] })`, and 0 for an enemy the tower can't
   target (`isFlyer` against `targets`). The card's number, not a second DPS formula: ranking by what
   the card says is a human reading the shop, and two DPS formulas drift apart. It undervalues the Spray
   Bottle's poison exactly as a card-reader would.
3. **Tonight's composition comes from `buildPreview(night).enemies`, never from `night.waves`.** Take
   ids and counts, and look each id's def up for HP and tags. The gap between `optimal` and `blind` then
   measures what the preview gives a player, not what the file knows, which is the question 20a asked
   of the preview.
4. **`greedy`** clicks every pile on the board each tick and calls each wave on the tick its countdown
   starts. Each tick it buys the affordable purchase with the best value per crumb:
   - **a new tower** at its best free tile: value × `trackCoverage` there;
   - **an upgrade**: the value gained, `statsFor(effectiveDef(id, tier + 1))` minus the current tier's,
     at that tower's coverage, for `upgradeCostFor`;
   - **an economy tower**: `crumbsPerSecond × ECONOMY_WEIGHT`, placed where its collect radius covers
     the most track, since piles drop where enemies die.

   Start `ECONOMY_WEIGHT` wherever greedy's night-1 build opens with two or three Salt Shakers and
   then a Crumb Tray. Settle it by looking at what greedy builds on nights 1 and 8, **never by its win
   rate**: a constant tuned to make the targets pass measures itself.
5. **`noEconomy` is `greedy` with `ECONOMY_WEIGHT` at 0**, and `economy: false`, so its loadout
   brings none. One knob on the same code, so the comparison isolates economy and nothing else.
6. **`casual`** never calls early. It clicks a pile only when the pile lies inside some tower's range,
   where its attention is. Whenever it can afford one, it buys the next tower in its loadout in
   newest-first unlock order, round robin. It places each one at the free legal tile nearest the fridge
   with coverage above 0. **Not "only the newest".** Read literally, night 2's casual buys nothing but
   Sticky Tape, which does 0 damage, and loses every night whose unlock is a specialist. The step's own
   "casual clears nights 1–8" would then be unreachable. Newest-first is the human trying the new toy,
   then reaching for the familiar ones.
7. **`random`** gets its own `createRng`, seeded from the job seed and **never from `world.rng`**. A draw
   from the world's generator shifts every later roll in the night, and the replay test diverges. About
   once a game-second it acts, choosing uniformly among place, sell, upgrade, retarget, click a pile,
   fetch food, call early and `SetSpeed`. **One command in ten is deliberately stale or illegal**: a
   gone tower id, a gone pile, an off-board or fouled tile, a tower not in the loadout. The executor
   promises a silent no-op for every one, and `random` checks the promise. It never sends an unknown def
   id: that throw is designed for a corrupt replay, and it isn't a crash.
8. **The loadout policies** build lists with `addToLoadout`, and 22A passes each through
   `setLoadout`:
   - `default` returns null, which plays `tonightsLoadout` (22A).
   - `optimal` ranks the unlocked roster by decision 2's value per crumb. It reserves a slot for the
     best tower that hits air if anything tonight flies, and one for the best economy tower if the
     policy wants economy.
   - `blind` ranks by the card's raw `dps / cost` and reads nothing about tonight. It reserves the
     economy slot the same way and nothing else. That's "generically strong", per the step.
   - `fixed`, given on the command line as `--loadout fixed=saltShaker|lemon|cookieJar`, plays
     exactly that list. Step 21C writes into each night's note the two loadouts it's authored to fall
     to, and D checks that both actually win. A list that isn't legal tonight is refused by `setLoadout`
     like any other, naming the night.
9. **Path-only towers are scored on purpose, not by accident.** `statsFor` gives the Gas Stove
   Burner `heatRadiusTiles: 0` and no `rangeTiles`. Decision 1 scores that 0, and greedy would never
   buy one without anyone having chosen that. Score a path-only tower by the track it stands on (radius
   0.5 plus its heat radius). Place it on the track tile inside the most existing towers' ranges. The
   Cardboard Box has no DPS, so greedy never buys one. That's accepted (it's a WALL), and C's report
   legend says so.
10. **A policy's state lives on the object `runNight` made for tonight.** Nothing goes in module
    scope, per the index's seam. Cache coverage per range in `begin`, because it depends only on the
    map. `decide` runs every tick and has to stay cheap: a full board already costs ~100 µs a tick.

## Build

### 1. `core/coverage.ts`

Decision 1. Re-export it from `core/index.ts`.

Gotcha: step 21's multi-lane maps merge into a shared final stretch, which is two paths over the
same tiles. Summing counts that stretch twice, and that's right, because both lanes' enemies walk it.
Say so on the function, so step 23's hint doesn't "fix" it.

### 2. `dev/harness/value.ts`, `dev/harness/policies/{greedy,casual,random}.ts`, `dev/harness/loadouts.ts`

Decisions 2–10. Register each one in 22A's registries.

Gotcha: a tile that was legal at `begin` may be fouled by mold or occupied by now. Ask
`canPlaceTower` at decision time, every time. The cached coverage only ranks tiles.

Gotcha: walk legal tiles in row-major order and sort stably, so ties break by position. A tie broken
any other way still replays, but it moves when an unrelated tile's legality changes.

Gotcha: piles merge within 0.7 tiles (`dropCrumb`). Collect by the ids on the board this tick, never
by ids remembered from an event. A remembered id is a pile that has since merged into another.

## Tests

`tests/coverage.spec.ts` and `tests/policies.spec.ts`.

- **Coverage is exact.** A tile at perpendicular distance d from a long straight segment, with range
  r > d, covers `2√(r² − d²)`. A range that doesn't reach covers 0. A tile inside a right-angle corner
  covers more than one at the same distance from a straight.
- **Coverage is the targeting measure.** Sample the Counter's `crack` every 0.05 tiles. For a handful
  of tiles, the samples inside `r` times 0.05 match `trackCoverage` to within 0.1.
- **Every loadout policy gives a legal loadout on every night.** For all eighteen, at 5 slots and with
  all three counter-space installations (8), `setLoadout` accepts `optimal`'s and `blind`'s lists.
  `optimal` brings something that hits air on every night whose preview has a flyer.
- **Policies act only through commands.** For each of `greedy`, `noEconomy`, `casual` and `random`,
  a night capped at 3,600 ticks and replayed from its log with 22A's `replayNight` ends `toEqual` the
  world it played. This catches a policy that writes the world or draws on `world.rng`.
- **`noEconomy` never places an economy tower**, and `greedy` places at least one on night 1.
- **The smoke run.** Three nights spread across the roster (1, 11 and 17, unless you find three that
  cover more systems) × five seeds × `greedy` and `random`, each capped at 3,600 ticks. Nothing throws,
  and every number anywhere in the world is finite: a recursive walk, because a NaN in one enemy's
  `distance` shows up nowhere else. `crumbs >= 0`, and the rows serialise. **Keep it under 5
  seconds.** The whole suite is ~4 seconds today, and a smoke run nobody waits for gets skipped.

## Acceptance

- [ ] `npm run balance -- --campaign --policy greedy --loadout optimal` plays all eighteen nights on
      one seed in under 30 seconds. Measured while splitting, a board on every lane-side tile runs at
      ~100–125 µs a tick and eighteen such nights took ~30 s, so greedy's board has to stay short of
      "every tile". Put the time in the commit message.
- [ ] Read as rows (towers built, crumbs earned and spent), greedy's nights 1 and 8 look like a player
      reading the shop: some economy early, DPS along the lane, never a tower with nothing in range.
- [ ] `random` has run a few hundred nights without a throw. If it found one, the fix is in `core/`,
      with a spec, in this commit.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 22C

```
core/coverage.ts           trackCoverage(map: MapDef, tile: Vec2, rangeTiles: number): number
dev/harness/policies/      'idle' | 'greedy' | 'noEconomy' | 'casual' | 'random'    in POLICIES
dev/harness/loadouts.ts    'default' | 'optimal' | 'blind'                           in LOADOUT_POLICIES
                           'fixed=<id>|<id>|…'                                     parsed by cli.ts
```

## Do not

Make a policy play well, or tune one to make a number pass: D measures the game, not the policy.
Don't build the recommended-tile hint in `ui/` (step 23, if at all). The sweep, `--jobs` and the report
are C's.
