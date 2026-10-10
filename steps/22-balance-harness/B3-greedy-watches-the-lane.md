# Step 22B3 — `greedy` watches the lane

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`; `B2-greedy-answers-the-gap.md` decisions 1, 2 and 5 and its *Hands
to D*; `B-policies.md` decisions 4, 9 and 10; the index's *Do not*.
**Prereq:** step 22B2 (`b185ca7`).

## Goal

B2's matrix made the loadouts discriminate. It also left two results that are the policy's fault and
would be read as the night's fault if D started from them:

- **Night 7 is lost by `greedy` under every loadout**, 0/20 on Normal (20/20 before B2). `greedy` places
  three Salt Shakers from 200 starting crumbs, then saves 150 for a Cookie Jar from tick 3 to tick
  3,165 while the lane falls. `noEconomy` wins it 20/20 on the same valuation.
- **30 rows stall at the 72,000-tick cap**: `noEconomy`/`optimal` on nights 12 and 16, and one
  `greedy`/`optimal` on night 16. Three Mold sit at full HP 2–5 tiles down the Stove's `vent` path,
  out of every tower's reach. The wave can't clear and nothing reaches the fridge.

Both have one cause. B2's share counts towers, not whether they're holding. Three Shakers "answer"
night 7's ground, so a fourth is worth a quarter of the first while the jar is still priced against
the empty board. A Mold that nothing reaches is still "answered" because some Shaker somewhere can
target ground. This part makes **answered mean answered now, as someone watching the board would see
it**. B2's gap rule already credits what nothing answers as the whole night, so once the answer is
honest, the purchase follows. **This part carries the tests.**

## Already in the repo

| Where | What's there now |
| --- | --- |
| `dev/harness/policies/greedy.ts` | `standingOf(world)` builds `Standing { economy, answering }` once per `decide`. `answering[i]` is the count of standing towers whose `Profile.answers[i]` is true, which comes from the card alone. `worth()` passes it to `sharedValue`. `bestTile` takes the free tile with the most `plan.coverage`, and `bestTrackTile` is decision 9's path-only search. `ECONOMY_WEIGHT = 4`, read in B2 against night 1's build |
| `dev/harness/value.ts` | `sharedValue(terms, others, composition)`: answered entries share `term / (1 + n)`, and entries with `others[i] === 0` are the gap, credited `term × total / gap`. `WeightedEnemy` is `{ tags, weight }` with **no enemy id**, so an entry can't be matched to `world.enemies` yet. `compositionOf` maps `buildPreview(...).enemies`, which carries the ids |
| `core/systems/spatial.ts` | `enemyPosition(world, enemy)` and `queryEnemiesInRange(world, centre, radius, filter)`: tile centre, euclidean, inclusive, the targeting measure B decision 1 matches |
| `core/content/enemies.ts` | Mold: `speedTilesPerTick: 0`, `push-immune`, molds its tile and then one neighbour every 720 ticks, and a molded tile refuses a tower. `fungal` takes physical at 0.2, so a Shaker that does reach it does 1 damage a shot |
| `tests/policies.spec.ts` | B2's three: night 8 places an air tower and two damaging defs; **night 1's first five placements as literals** (`saltShaker` ×4, `toasterCrumbTray`); the share unit tests on a two-entry composition. Plus the replay, economy-knob and smoke tests. **The night 1 literal is the one this part may move**, per decision 4 |
| `game/.balance/b2/` | B2's full matrix, `night.csv` and `report.html` (gitignored, so only on the machine that ran it). This part's "from" |

## Ruled out, measured at `b185ca7`

Each was prototyped and reverted. Don't spend the session on them again.

- **Buy the best affordable purchase for 10 or 30 s after food leaves the shelf.** No change on night 7.
  Nothing leaves the shelf until wave 4, long after the three-Shaker board has lost the lane.
- **Don't save for a purchase the last 10 s of income won't reach within H seconds.** Night 7 under
  `default`, seeds 1234–1236: H = 20, 30 and 60 lose every seed, and H = 40 wins every seed. A
  constant that works at exactly one value is a constant tuned to a win rate.
- **A lower `ECONOMY_WEIGHT`.** That's tuning toward a win rate too (B2 decision 5).
- **A steeper share, ÷ (1 + n)^1.5 or ^2.** Measured in B2: economy outranks damage sooner, and the
  board starves worse.

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. **Decision 1 is unmeasured.** It's the rule that fits B2's idiom, not one shown
to win night 7. If the pre-flight measurement in Build §1 says it doesn't, stop there and write what
was measured into this file, the way D's first run did.

1. **An entry is answered only while the board is visibly holding it.** Each `decide`, once, from
   `world.enemies`: an entry counts as **unanswered**, and goes in the gap whatever `answering[i]` says,
   while any live enemy of that def is
   - **slipping**: it has been in range of a standing tower that answers it, and now isn't, and it's
     still alive (it walked through the defence), or
   - **stranded**: it hasn't moved in the last 2 s (120 ticks), and no standing tower that answers it
     has it in range (a Mold out of reach, or anything else that stops where nothing can hit it).

   Otherwise `answering[i]` stands as B2 counts it. It's what a person watching sees: ants walking out
   past the last Shaker, or a green patch nothing is shooting. It reads the world the way `decide`
   already does for piles and dropped food, and nothing about the night's file. The gap rule then does
   the rest. A fourth Shaker on night 7 is credited the whole ground while ants slip past three.
2. **Where follows what.** While an entry is unanswered because of a **stranded** enemy, a def that
   answers that entry searches only the free tiles that have a stranded enemy of it in reach, best
   coverage first. Same `placeableButForPrice` check, and the same fallback to `bestTile` when none is
   free. Coverage still ranks tiles (B2 decision 4). Without this, the gap prices the Mold right and
   the tile search still puts the tower by the fridge.
3. **Policy state stays on tonight's object** (B decision 10). "Has been in range" is a `Set` of enemy
   ids, and "hasn't moved" is a map of enemy id to (distance, tick). Both live in `createGreedy`'s
   closure and are pruned of dead ids each `decide`. Nothing goes in module scope, and nothing reads or
   writes `world.rng`, or the replay test diverges.
4. **`ECONOMY_WEIGHT` is re-read, as in B2 decision 5, and only if night 1 moved.** Slipping ants on
   night 1 may move a Shaker ahead of the Tray. If B2's night-1 literal changes, read the build. If it
   still looks like a few Shakers, then a saved-for Tray, then Shakers along the lane, update the
   literal and leave the weight alone. Move the weight only if it doesn't look like that, and write the
   new value and night 1's build into B2 decision 5. **Never toward a win rate.**

## Build

### 1. Pre-flight measurement

Build decision 1 first, without decision 2, and play night 7 (`default`, seeds 1234–1236) and night 1
(`optimal`, seed 1234). Night 7 should place a fourth damaging tower before the Cookie Jar. If it
doesn't, or night 7 still loses at all three seeds, stop and record it (see *Decisions*).

### 2. `dev/harness/value.ts`

`WeightedEnemy` gains `id: DefId`, so a composition entry can be matched to `world.enemies`.
`compositionOf` already holds the id from `buildPreview`. Nothing else in the file changes.
`optimalLoadout` must give the same 108 loadouts as before: check it the way B2 did, by dumping them
before and after.

### 3. `dev/harness/policies/greedy.ts`

Decisions 1–3. `standingOf` returns the honest `answering` (and the stranded enemies, for decision 2).
`bestTile` takes them.

Gotcha: **the budget.** "In range of an answering tower" is enemies × towers per tick, around 100 × 80
late in a night. Do it once per `decide`, with squared distances as `queryEnemiesInRange` does, and
only for towers whose `Profile.answers` includes the enemy's entry. Don't call `queryEnemiesInRange`
once per tower: it walks every enemy each time. B's acceptance bound still holds (18 nights on one
seed in under 30 s).

Gotcha: **an enemy that enters range after spawning isn't slipping.** A walker near its spawn is out of
every tower's range because it hasn't arrived yet. Slipping needs *was in range, now isn't*. Stranded
needs *hasn't moved*. Plain "out of range" alone would put every fresh spawn in the gap.

Gotcha: **a Honey Pot holds enemies still on purpose.** A feeding enemy (`enemy.feeding !== null`) has
stopped inside a bait radius, usually in range of something. Don't count it as stranded, or a Honey
Pot board reads as unanswered.

### 4. Re-read and rerun

Decision 4's night-1 read. Then B2's matrix, the same command, to `.balance/b3/`:

```
npm run balance -- --nights 1-18 --policy idle,greedy,noEconomy,casual --loadout default,optimal,blind \
  --difficulty normal,nightmare --runs 20 --jobs 8 --report --out .balance/b3/night.csv
```

It took 2,735 s on 8 processes at `b185ca7`.

## Tests

In `tests/policies.spec.ts`, beside B2's:

- **Night 7 holds the lane.** `greedy` with `defaultLoadout` on night 7 at seed 1234 places at least four
  damaging towers before its first economy tower. At `b185ca7` it places three, then the Cookie Jar at
  tick 3,165.
- **The Mold gets a tower.** `noEconomy` with `optimalLoadout` on night 12 at seed 1234 doesn't end
  `stalled`, and places at least one tower within reach of a tile of the `vent` path's first 5 tiles.
  At `b185ca7` it stalls at 72,000 ticks with three Mold at distances 2–5.
- **Unanswered is about the board, not the card.** A unit test on the classifier, whichever function
  decision 1 lands in: a walker that has never been in range is neither slipping nor stranded; the
  same walker after leaving an answering tower's range is slipping; an enemy at the same distance for
  120 ticks with no answering tower in reach is stranded, and isn't stranded if one is; a feeding
  enemy is never stranded.

B2's night-1 literal changes only per decision 4. The replay, economy-knob, smoke and B2 tests must
pass otherwise unchanged.

## Acceptance

- [ ] Night 7 under `greedy` + `default` (Normal) wins at more than 0 of 20 seeds, and the build reads as
      Shakers until the lane holds, then economy. Put the win count in the commit message.
- [ ] B2's matrix rerun: 0 stalled rows (30 at `b185ca7`). Put the flag counts beside B2's (84 too hard,
      16 too easy, 26 dominant, 7 lockout, 3 stalled) in the commit message and in *Hands to D*.
- [ ] Night 1's build, read as rows, still looks like a player: a few Shakers, a saved-for Tray,
      Shakers along the lane.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to D

D reruns its Build §1 from this part's matrix, not B2's. Write the results here, as B2 did: wins by
loadout on Normal per night, the flag counts, and anything left that's the policy and not the night.

## Do not

Touch `casual`, `random`, the loadout policies, the report's flag rules or any content number. Don't
add a policy. Don't make `greedy` plan ahead, sell or retarget. It still only values a purchase and
picks its tile, and what changes is what it sees as answered. If decision 1 doesn't win night 7, don't
reach for one of the *Ruled out* rules or a constant that makes it win: record it and stop. The tuning
is D's.
