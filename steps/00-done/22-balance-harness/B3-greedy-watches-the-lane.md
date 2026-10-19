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

   *Changed in the build: **slipping** is "was in range, now isn't, **and past the farthest point of
   its path that any tower answering it reaches**".* Read literally, "was in range, now isn't" also
   fires on an ant crossing the gap between two Shakers' ranges, which isn't walking through the
   defence. Measured on night 1 (`greedy` + `optimal`, seed 1234) with the literal rule: every one of
   157 slipping samples stood at distance 10–12.6 of the `crack`'s 31.1, between the Shaker at (4,9)
   and the cluster at (10,4)–(13,4). No food was lost (18 of 18), and every Shaker was credited the
   whole night until seven stood. The build read seven Shakers, then the Tray at tick 3,887 of 4,147,
   and earned 295 (459 at B2). With the farthest point (`farthestReached` in `greedy.ts`, sampled every
   0.05 tiles and cached per tile and reach), night 1 is B2's build to the placement. Night 7 still
   wins: the ants there do walk out past the last Shaker.
2. **Where follows what.** While an entry is unanswered because of a **stranded** enemy, a def that
   answers that entry searches only the free tiles that have a stranded enemy of it in reach, best
   coverage first. Same `placeableButForPrice` check, and the same fallback to `bestTile` when none is
   free. Coverage still ranks tiles (B2 decision 4). Without this, the gap prices the Mold right and
   the tile search still puts the tower by the fridge.

   *Changed in the build: the Mold's tile is **a second candidate**, not the def's only one, and a
   stranded entry is in the gap **only at a tile that reaches one of its stranded enemies**.* Elsewhere
   B2's count stands for it. As written, every def that answers ground was sent to the Mold tiles once
   one stood stranded, the Salt Shaker and the Candle included. That left the lane with no candidate
   but economy. Night 16 (`greedy` + `optimal`, seeds 1234–1238) lost all five by tick ~2,500. At tick
   781 a Shaker went to (8,4) for the Mold with the Candle half saved for, and later the Cookie Jar
   outbid the lane at 0.474/crumb. A "leak first" variant (no restriction while anything the def
   answers is slipping) still lost all five, because the Mold is stranded at ~tick 660, before anything
   reaches the lane. Decision 1 alone wins 3 of 5 but leaves night 12's Mold stalled. As built, night 16
   wins 3 of 5 with no stall (B2: 2 wins and 1 stall). Night 12 under `noEconomy` wins with a Shaker in
   the vent's reach. `bestTiles` returns one tile, or two while a stranded enemy of the def stands. Both
   are priced by the same `worth`, so the Mold's tile wins only when its gap outweighs the coverage it
   gives up.
3. **Policy state stays on tonight's object** (B decision 10). "Has been in range" is a `Set` of enemy
   ids, and "hasn't moved" is a map of enemy id to (distance, tick). Both live in `createGreedy`'s
   closure and are pruned of dead ids each `decide`. Nothing goes in module scope, and nothing reads or
   writes `world.rng`, or the replay test diverges.
4. **`ECONOMY_WEIGHT` is re-read, as in B2 decision 5, and only if night 1 moved.** Slipping ants on
   night 1 may move a Shaker ahead of the Tray. If B2's night-1 literal changes, read the build. If it
   still looks like a few Shakers, then a saved-for Tray, then Shakers along the lane, update the
   literal and leave the weight alone. Move the weight only if it doesn't look like that, and write the
   new value and night 1's build into B2 decision 5. **Never toward a win rate.**

   *Read in the build: night 1 didn't move, so the literal and the weight (4) stand.* Seed 1234 under
   `optimal` places Shaker ×4 (ticks 0, 2, 3, 1,288), the Tray at 2,091, Shakers at 2,505, 2,984, 3,241
   and 3,509, then a second Tray at 3,901, and earns 459, B2's number. It moved only under decision 1's
   literal reading (above).

## Build

### 1. Pre-flight measurement

Build decision 1 first, without decision 2, and play night 7 (`default`, seeds 1234–1236) and night 1
(`optimal`, seed 1234). Night 7 should place a fourth damaging tower before the Cookie Jar. If it
doesn't, or night 7 still loses at all three seeds, stop and record it (see *Decisions*).

*Measured:* with the literal decision 1, night 7 placed four Shakers (ticks 0, 2, 3, 1,641) and then
the Cookie Jar at 3,354, and won at all three seeds. Night 1 moved to seven Shakers (see decision 1's
note). With decision 1 as built, night 7 places ten Shakers before the Jar at tick 5,117 and wins all
three seeds, losing 5 of 20 food. The three seeds play identically to the tick, at B2 and here.

### 2. `dev/harness/value.ts`

`WeightedEnemy` gains `id: DefId`, so a composition entry can be matched to `world.enemies`.
`compositionOf` already holds the id from `buildPreview`. Nothing else in the file changes.
`optimalLoadout` must give the same 108 loadouts as before: check it the way B2 did, by dumping them
before and after.

### 3. `dev/harness/policies/greedy.ts`

Decisions 1–3. `standingOf` returns the honest `answering` (and the stranded enemies, for decision 2).
`bestTile` takes them. *As built:* the classifier is `watchLane` (exported, beside `createLaneWatch`
and `farthestReached`). `answering` is zeroed for slipping only. The stranded enemies go to `worth`,
which zeroes an entry's count only at a tile in reach of one, and to `bestTiles`, which replaced
`bestTile` (decision 2's note). An upgrade's own count is floored at 0 (`Math.max(0, count - 1)`), or
an entry in the gap would divide by zero. `optimalLoadout` gives the same loadouts before and after:
144 checked (18 nights × economy on/off × Normal/Nightmare × 5 and 8 slots).

Gotcha: **the budget.** "In range of an answering tower" is enemies × towers per tick, around 100 × 80
late in a night. Do it once per `decide`, with squared distances as `queryEnemiesInRange` does, and
only for towers whose `Profile.answers` includes the enemy's entry. Don't call `queryEnemiesInRange`
once per tower: it walks every enemy each time. B's acceptance bound still holds (18 nights on one
seed in under 30 s). *Measured: 10.9 s for `--nights 1-18 --policy greedy --runs 1 --jobs 1`. Back to
back on night 16 under `optimal` (seed 1236), 7.2 s against B2's 6.0 s.* The farthest point each
entry's towers cover is folded once per `decide` (towers × entries × paths), so the enemy loop still
breaks on the first tower in range.

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
  enemy is never stranded. *Added with decision 1's change:* the same walker in the gap before a
  second answering tower isn't slipping, `farthestReached` reads 12 for a reach-2 tower at x = 10 on
  the fixture's lane, and dead ids are pruned from the watch.

B2's share test gained `id: 'ant'` / `id: 'fly'` on its two-entry composition, which `WeightedEnemy`
now requires. Its numbers didn't change.

B2's night-1 literal changes only per decision 4. The replay, economy-knob, smoke and B2 tests must
pass otherwise unchanged.

## Acceptance

- [ ] Night 7 under `greedy` + `default` (Normal) wins at more than 0 of 20 seeds, and the build reads as
      Shakers until the lane holds, then economy. Put the win count in the commit message. *20 of 20
      (0 at B2). Seed 1234 places ten Shakers, then the Cookie Jar at tick 5,117. Left for the read.*
- [ ] B2's matrix rerun: 0 stalled rows (30 at `b185ca7`). Put the flag counts beside B2's (84 too hard,
      16 too easy, 26 dominant, 7 lockout, 3 stalled) in the commit message and in *Hands to D*.
      ***2** stalled rows, not 0, and neither is the policy's (see Hands to D). Flags: 80 too hard, 16
      too easy, 33 dominant, 8 lockout, 1 stalled. 8,640 rows in 2,104 s on 8 processes.*
- [ ] Night 1's build, read as rows, still looks like a player: a few Shakers, a saved-for Tray,
      Shakers along the lane.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green. *Lint (0
      errors; every warning is a CRLF `␍` of this Windows checkout, 57,450 at HEAD too), type-check and
      build are green. `npm run test` fails 1–9 tests per run, every one a timeout and a different set
      each time, while other processes held the machine. HEAD fails the same way (4 timeouts). With
      `npx vitest run --no-file-parallelism` all 54 files and 1,024 tests pass.*

## Hands to D

D reruns its Build §1 from this part's matrix, not B2's. Write the results here, as B2 did: wins by
loadout on Normal per night, the flag counts, and anything left that's the policy and not the night.

*Written by the build.* `game/.balance/b3/night.csv` and `report.html` (gitignored, so only on the
machine that ran it), from B2's command. Flags: **80 too hard, 16 too easy, 33 dominant, 8 lockout,
1 stalled** (B2: 84, 16, 26, 7, 3). 2 stalled rows (B2: 30). Wins on Normal, out of 20, by
`default` / `optimal` / `blind`:

| Nights | `greedy` | `noEconomy` |
| --- | --- | --- |
| 1–6 | 20/20/20 | 20/20/20 |
| 7 | 20/20/20 (B2 0/0/0) | 20/20/20 |
| 8 | 0/20/0 | 0/0/0 |
| 9 | 0/0/0 | 0/0/0 |
| 10 | 0/20/0 | 0/0/0 |
| 11 | 0/20/0 (B2 0/0/0) | 0/20/0 (B2 0/0/0) |
| 12 | 0/20/0 | 0/20/0 (B2 0/0/0, 20 stalled) |
| 13–15 | 0/20/0 | 0/20/0 (B2 14: 0/19/0) |
| 16 | 0/11/0 (B2 0/12/0) | 0/13/0 (B2 0/4/0, 9 stalled) |
| 17–18 | 0/0/0 | 0/0/0 |

Flags that moved: night 7's three `greedy` *too hard* flags and night 11 `greedy`/`optimal`'s are gone,
and so are both `noEconomy`/`optimal` *stalled* flags (nights 12 and 16). New ones:

- **Dominant on Normal nights 9–13, 16 and 17: the Salt Shaker** does over 60% of the damage in 56–78%
  of runs. That's partly the policy. Ants slipping past the last tower put the ground in the gap, the
  Shaker is the cheapest thing answering it, and so `greedy` and `noEconomy` buy more of them. Weigh
  that before reading these as the night's.
- **Lockout on Normal night 11 (`greedy`): only `optimal` wins** (20/0/0). That's the night now winnable
  at all, and only with the preview read. That's D's decision 4 question.

Left over, and **not the policy**: the 2 stalled rows, `greedy`/`optimal` on night 16 at seeds 1244
and 1247. Each ends at the 72,000 cap with one Mold at `crack` 9 on 29.2 HP, after two wakes,
`flags.fleeing` and `flags.untargetable` both true. At speed 0 a fleeing Mold never leaves, and nothing
may shoot it, though two tier-2 Shakers stand 1 tile away. `mold`'s comment in `enemies.ts` already
notes that a wake's flee at `speed * 2` is 0. No policy can clear it, so it's a content/core question
for D, or for whoever owns the wake. Night 7, and the Mold out of reach on nights 12 and 16, are
closed.

## Do not

Touch `casual`, `random`, the loadout policies, the report's flag rules or any content number. Don't
add a policy. Don't make `greedy` plan ahead, sell or retarget. It still only values a purchase and
picks its tile, and what changes is what it sees as answered. If decision 1 doesn't win night 7, don't
reach for one of the *Ruled out* rules or a constant that makes it win: record it and stop. The tuning
is D's.
