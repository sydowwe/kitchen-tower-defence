# Step 22 — Headless balance harness

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, `../analytic-docs/ARCHITECTURE.md` §1, §3, `../analytic-docs/CONTENT.md` (the whole thing — you're about to change most of its numbers).
**Prereq:** step 21.

## Goal

Play five hundred nights in ten seconds and find out whether the income curve is right.

This is the step the entire architecture was built for. `core/` has no DOM dependency and the sim is deterministic, which means the whole game runs in Node with no renderer — so balance stops being a matter of opinion and becomes a matter of data.

**The one number that must be right is crumbs earned per wave versus tower cost.** Everything else in `../analytic-docs/CONTENT.md` can be adjusted after launch without breaking anything. The income curve cannot.

## Build

1. **The runner** (`src/dev/harness/run.ts`), executed via `tsx`. Not part of the app bundle.
   ```
   npm run balance -- --nights 1-18 --difficulty normal --runs 50 --policy greedy --out results.csv
   ```
   Creates a world, runs `tick()` in a tight loop with no rendering and no frame limiter, and records the outcome.

2. **Scripted policies** — a `Policy` interface returning commands each tick, so you can compare how different players fare:
   - `greedy` — always buy the highest DPS-per-crumb tower it can afford, place it at the free tile covering the most track length, always call waves as early as possible, collect crumbs the instant they land. **The upper bound on income.**
   - `casual` — buys the most recently unlocked tower, places it near the fridge, never calls early, collects only crumbs inside tower radii. **The lower bound.** If `casual` cannot clear night 8, your difficulty curve is broken for real players.
   - `noEconomy` — never builds an economy tower. Tests whether economy towers are mandatory (they should be strong, not required).
   - `random` — seeded random legal actions. A crash-finder more than a balance tool, and it will find crashes.

   Coverage scoring for placement needs to be shared with the real game's future "recommended tile" hint, so put it in `core/`, not in the harness.

   **Every policy must also select a loadout** (step 20a). Add a `loadoutPolicy` dimension: `optimal` picks the best counters given full knowledge of the night's composition; `blind` picks generically strong towers, ignoring the preview. **The gap between those two win rates measures whether loadouts are a fair puzzle or a memorisation tax** — if `blind` cannot clear Act I, either the night preview isn't informative enough or slots are too tight.

3. **Metrics per night**, to CSV: night, map, difficulty, policy, seed, won, waves survived, food remaining, crumbs earned / spent / wasted-at-sunrise, crumbs dropped vs collected, towers built, peak noise, wake count, Grocery Money, and **`towersAffordablePerNight`** — the headline number.

4. **The sweep mode.** Vary one global parameter across a range and re-run everything:
   ```
   npm run balance -- --sweep income=0.6:1.6:0.1 --nights 1-18 --runs 20
   ```
   Sweepable: global income multiplier, enemy HP, enemy count, tower cost multiplier, crumb rot time, noise decay.

5. **A report.** Markdown or a small static HTML page: win rate per night per policy, the income curve plotted against tower costs, and a **flag list** — nights where `greedy` loses (too hard), nights where `casual` wins comfortably (too easy), nights where a single tower type accounts for over 60% of damage (a dominant strategy).

6. **Then actually use it.** Tune until:
   - `casual` clears nights 1–8 on Normal and struggles from 13 onward.
   - `greedy` clears all 18 on Normal and loses some nights on Nightmare.
   - Affordable new towers per night runs **~1.5 in Act I falling to ~0.5 by night 18** (`../analytic-docs/CONTENT.md` §1).
   - No single tower exceeds 60% of total damage on any night.
   - Economy towers are chosen by `greedy` but `noEconomy` still clears Act I — strong, not mandatory.

   **Write the resulting numbers back into `../analytic-docs/CONTENT.md`** so the reference doc is never stale.

7. **CI-friendly smoke run**: 3 nights × 5 seeds × 2 policies, asserting no crashes and no NaN. Fast enough to run on every commit.

## Tests

- The harness produces byte-identical CSV output for the same seed across runs, and across Node and browser sim runs.
- A full 18-night `greedy` run completes in under 30 seconds.
- Sim tick count per simulated night matches the expected wave schedule.

## Acceptance

- [ ] `npm run balance` runs the whole campaign and writes a CSV in seconds.
- [ ] The report's flag list points at real problems you can feel when you play those nights.
- [ ] `../analytic-docs/CONTENT.md` has been updated with the tuned numbers.

## Do not

Try to make the policies play *well*. They are measuring instruments, not AI opponents. A `greedy` policy that plays like a mediocre human is exactly right.
