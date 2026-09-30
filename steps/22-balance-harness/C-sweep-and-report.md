# Step 22C — Sweep, parallel jobs, the report

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/CONTENT.md` preamble, §6 and §9,
`../../analytic-docs/OPEN-QUESTIONS.md` §3 (what the report is for),
`../../analytic-docs/DECISIONS.md` §10 (*Every night must be winnable by more than one loadout*).
**Prereq:** step 22B.

## Goal

Run the matrix at scale, and read it. A sweep varies one global number across a range and re-runs
everything. `--jobs` spreads the jobs over processes, because the matrix is hours on one core: a
defended night takes 0.5–3 s, and 18 nights × 4 policies × 3 loadout policies × 50 seeds is ~10,000
nights. The report turns rows into win rates per night and policy, the income curve against tower
prices, and a flag list of nights to go and play. **This part carries the tests for the sweep's
isolation, for sharding and for the flag rules.**

## Already in the repo

| Where | What's there now |
| --- | --- |
| `dev/harness/run.ts` (`runNight`) | Takes `patch?: (world) => void`, applied after `createWorld` and before tick 0. `Job.sweep` and the row's `sweepKnob` / `sweepValue` exist and are always blank |
| `dev/harness/csv.ts` (`toCsv`) | Sorts rows, sweep value first |
| `scripts/balance.mjs`, `dev/harness/cli.ts` | The Vite launcher and `main(argv)`. `cli.ts` is the only harness file allowed a `node:` import |
| `core/content/difficulty.ts` (`resolveDifficulty`) | Returns a **copy** of the tier, so `world.difficulty` is the world's own |
| `world.difficulty.enemyHpMult` | Read at spawn (`spawnEnemyAt`) |
| `world.difficulty.enemyCountMult` | Read in `startWave`, as `max(1, round(count × mult))`. Step 21B moves this into `waveEntryCount(count, difficulty, modifiers)`, rounding once over the tier's and the night modifier's product. The knob still multiplies the tier's value |
| `world.difficulty.crumbIncomeMult` | Read at the drop (`resolve.ts`, `crumbValueFor`) and at every payout (`economy.ts`). **Not** read by the early-call bonus, deliberately. 21B's `crumbValueMult` (the dinner party) multiplies the drop alongside it |
| `world.noise.decayPerTick` | Set once in `createWorld` from `NOISE_DECAY_PER_TICK` plus the installations' delta |
| `world.crumbs` | The tier's `startingCrumbs` until the first tick |
| `core/systems/crumbs.ts:36` | `ROT_TICKS` and `HATCH_TICKS`: module constants, not on the world |
| A tower's `cost` | Read off the def at placement (`placement.ts:142`) and upgrade (`commands.ts:140`). Not on the world |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **A sweep is a patch on the world's own copies, applied between `createWorld` and tick 0.** The
   knobs:
   - `income` multiplies `crumbIncomeMult`, `enemyHp` multiplies `enemyHpMult` and `enemyCount`
     multiplies `enemyCountMult`. Each multiplies the tier's own value, so a Nightmare `enemyHp` sweep
     scales its 1.35.
   - `startingCrumbs` multiplies the wallet at tick 0.
   - `noiseDecay` **sets the base** per second: `decayPerTick = v / 60 +
     modifiers.noiseDecayPerTickDelta`. E's question is what the decay should be, not "1.2× whatever it
     was".
2. **`towerCost` is `income` and `startingCrumbs` both divided by v.** Every crumb a night has is
   starting capital or income, and every crumb it spends is a price. Scaling every price by v is the
   same night as scaling every crumb by 1/v, with two exceptions. The early-call bonus isn't scaled,
   and small rewards round (`max(1, round(3 / 1.5))`). The sell refund stays exact, since it's a
   fraction of what was paid. The CSV records `towerCost` as the knob asked for, and the report's
   legend states the approximation.
3. **Crumb rot is not sweepable in this step.** `ROT_TICKS` and `HATCH_TICKS` are module constants,
   which a patch can't reach, and moving them onto the world is a core change that nothing but the sweep
   would read. Rot isn't one of D's targets either. `OPEN-QUESTIONS.md` §3's rot bullet stays open, and
   the report says so. If it's wanted later, the cheap version is two fields on `Difficulty`, decided in
   `CONTENT.md` §9 first.
4. **`--jobs N` forks the launcher N times, with `--shard i/N`.** Each child takes every job whose
   index modulo N is i and writes its rows as JSON lines on stdout. The parent merges them through
   `toCsv`, which already sorts. Child processes rather than worker threads, because each needs its own
   Vite module runner anyway, and a fork of the one launcher is the smallest thing that works. Default
   `--jobs` is the core count minus one.
5. **The report is one static HTML file**, `.balance/report.html`, with no dependency and no script.
   It has tables for the numbers and one inline SVG for the income curve: `towersAffordablePerWave` by
   night, one line per policy, with the target band behind them (~1.5 through Act I falling to ~0.5 by
   night 18, `CONTENT.md` preamble). It's read in a browser and never committed.
6. **The flag list.** The thresholds are named constants, each with its reason:
   - **too hard**: `greedy` loses a night in more than 10% of its runs at a difficulty.
   - **too easy**: `casual` wins with at least 75% of the shelf left in at least 90% of its runs, on
     Normal or Nightmare.
   - **dominant**: one source's `topDamageShare` is above 60% in at least half a night's runs. This
     uses 22A's damage book, so DoT and auras count.
   - **lockout**: under `greedy`, exactly one of `optimal`, `blind` and `default` ever wins a night.
     That's DECISIONS §10's constraint, which step 21 authors for and this step verifies. When the rows
     include `fixed` runs, the report also tables each fixed list's win rate per night. D runs a
     night's two named answers (21C) that way. The answers live in comments, so the report can't flag
     them itself.
   - **stalled or stuck**: any row at all.

   Each flag names the night, the policy, the numbers and the seeds of its rows, so it can be replayed.
   The legend says what the flags can't see: the Cardboard Box never shows up in `greedy`'s rows,
   because it has no DPS (22B, decision 9), and `default` in night mode is the five oldest towers
   (22A).

## Build

### 1. `dev/harness/sweep.ts` and `--sweep knob=from:to:step`

Decisions 1–3. The range is inclusive. Build it by index, `from + i × step`, rounded to the step's
decimals, never by adding `step` in a loop, or `0.6:1.6:0.1` ends at `1.5000000000000002` and loses
its last value.

Gotcha: **the patch writes `world.difficulty`, never `DIFFICULTIES`.** The table has the same shape
and is one import away. Written to, it compounds across every later job in the process: a sweep's
later values drift, and results depend on job order. The one symptom that points at it is a sharded
CSV that differs from the unsharded one.

### 2. `--jobs` and `--shard`: `dev/harness/cli.ts`

Decision 4. A child that throws fails the whole run, naming its shard and the job that threw. Never
write a partial CSV that looks complete.

### 3. `dev/harness/report.ts`, `--report`

Decisions 5 and 6. `--report` writes the report beside the CSV. `--report-only path.csv` rebuilds it
from a CSV without re-running anything.

## Tests

`tests/sweep.spec.ts` and `tests/report.spec.ts`.

- **A patch touches only its world.** Run `enemyHp=2`, then an unswept job, in the same process. The
  second row equals a fresh unswept run's, and `DIFFICULTIES.normal.enemyHpMult` is still 1.
- **Each knob moves what it names.** `income=2` doubles an Ant's pile (3 → 6) and a Crumb Tray payout
  (4 → 8). `noiseDecay=3` gives `decayPerTick` of 3/60 with nothing owned and (3 + 0.5)/60 with Oil the
  Hinges. `towerCost=2` halves the wallet at tick 0.
- **The range is exact.** `0.6:1.6:0.1` is eleven values, and the last one is 1.6.
- **Sharding changes nothing.** The same jobs through two shards, merged, give the same CSV string as
  through one.
- **Each flag fires at its threshold and not one step short of it.** Use synthetic rows at the
  threshold and just inside it, for each of the five flags.

## Acceptance

- [ ] `npm run balance -- --sweep income=0.6:1.6:0.1 --nights 1-18 --runs 20 --policy greedy,casual
      --jobs 8 --report` finishes, and the report opens in a browser with a curve you can read.
- [ ] The report's flag list points at real problems you can feel when you play those nights. Play
      two of them. *(These are the Counter-only nights until step 21. D reads the report again on the
      real maps.)*
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Move any content number because of what the report says. That's D's and E's work. Don't add a chart
library, a dev route that renders the report, or any `ui/` code.
