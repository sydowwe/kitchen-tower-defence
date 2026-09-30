# Step 22A — The runner, the ledger and the CSV

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/ARCHITECTURE.md` §3,
`../../analytic-docs/CONTENT.md` §8 (the Grocery Money formula, the installations table and *Loadout
slots*), `../../analytic-docs/DECISIONS.md` §4 (its last paragraph: crumbs are in-night only).
**Prereq:** step 20a, both parts.

## Goal

A night played headless from a job, as fast as the sim goes, and one CSV row that describes it. At
the end of this part `npm run balance -- --nights 1-3 --policy idle` writes a CSV. The only policy is
`idle`, which builds nothing and loses every night. That's the undefended baseline, and it proves the
pipeline end to end before B puts players in it. Two small ledgers land in `core/` too, because the
row needs numbers no event carries. **This part carries the determinism tests.** C's parallel runs
and D's tuning rest on them.

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/campaign.ts` | `worldOptionsFor(progress, seed)`, the one translation from progress to a world. `setLoadout`, `tonightsLoadout`, `unlockedTowerIds`, `applyNightResult`, `buyInstallation`. `nightResultOf` **throws while the night is running**, because `night.pay` is null until it ends. The header says the harness plays by exactly these rules |
| `core/sim.ts` (`tick`) | **`world.events` is truncated at the top of every tick** |
| `core/commands.ts` | `createCommandQueue()`. `drain()` hands back the batch |
| `core/systems/economy.ts` | `earnCrumbs(world, amount, banked = false)` and `spendCrumbs`: every wallet write in `core/` goes through them. `banked` is a sell refund. Starting crumbs are assigned in `createWorld` and never pass through here |
| `core/systems/combat.ts:46` (`applyDamage`) | `enemy.hp -= amount` is the only write to enemy HP anywhere. `dealDamage` adds the `enemyDamaged` event for a discrete hit. **Aura (`aura.ts:60`), status DoT (`status.ts:34`), tile heat (`tiles.ts:119`) and box reflect (`barricades.ts:225`) call `applyDamage` directly and publish nothing** |
| `core/types.ts` (`NightState`) | The per-night ledgers: `crumbsDropped`, `crumbsCollected`, `enemiesKilled`, `ticksSkippedTotal`, `pay`. The note on `enemiesKilled` says why a ledger lives here and not in a tally of events: a tally "would not exist for the balance harness at all" |
| `core/world.ts` (`createWorld`) | Builds `night` field by field (~line 185) |
| `tests/fixtures/world.ts` | The night literal. It fails `type-check` until every new `NightState` field has a value, which is the point |
| `core/content/nights.ts` | All eighteen nights, all on the Counter until step 21 moves them. The note above `night11` says **a mold nobody can shoot is a night that never ends** |
| `core/content/schema.ts:1016` | `if (import.meta.env.DEV)`, run at load by anything that imports `core/content/` |
| `src/dev/harness/.gitkeep` | The directory, empty |
| `eslint.config.js:228` | `dev/` is exempt from the determinism rules (`Date`, `Math.random`, `performance`) |
| `ui/views/GameView.vue:135` | `SEED = 1234`, fixed, so a retry reopens the same night |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **The launcher is Vite's dev server used as a module runner, not `tsx`.** `tsx` isn't installed,
   and it can't evaluate `import.meta.env.DEV` in `schema.ts`, so the first content import dies with a
   TypeError. `scripts/balance.mjs` calls `createServer({ server: { middlewareMode: true, hmr: false,
   watch: null }, appType: 'custom', logLevel: 'error' })`, then
   `ssrLoadModule('/src/dev/harness/cli.ts')`, awaits its `main(argv)`, and closes the server in
   `finally`. That gets the project's `vite.config.ts` (the `@` alias, the JSON map import) with
   `import.meta.env.DEV` true, so content is zod-validated at boot exactly as under `npm run dev`.
   Checked while splitting: it boots in ~0.4 s, and night 1 undefended ends on tick 4003, the same
   tick vitest gets. `npm run balance` is `node scripts/balance.mjs`. No new dependency.
2. **`cli.ts` is the only file in `dev/harness/` that may import a `node:` module**, and a lint block
   says so. The job, runner, row and CSV are plain TypeScript that would run in a page. This replaces
   the step's "byte-identical across Node and browser runs": vitest already runs the sim through the
   same Vite transform, and the property worth keeping is a harness core with nothing Node-only in it.
3. **The unit of work is a job, and a job is plain data**: kind (`'night' | 'campaign'`), nights,
   difficulty, seed, policy, loadout policy, installations and sweep. `runJob(job): Row[]` depends on
   nothing else, so the same job gives the same rows in any process and in any order. That's the
   index's seam.
4. **Night mode is the default. Campaign mode is `--campaign`.** Night mode plays each night from a
   progress built for it: `{ ...newProgress(), nightId, difficulty, installations }`. Only `nightId` is
   synthetic, and unlocks, slots and the default loadout all derive from it through `core/campaign.ts`.
   Without night mode, a `casual` that loses night 9 leaves no rows for nights 10–18, and "struggles
   from 13" can't be measured. Campaign mode folds `applyNightResult` over the nights and buys
   installations between them. It's what measures Grocery Money pacing and whether a player reaches 7
   slots by night 14 (`CONTENT.md` §8). **Set `difficulty` on the progress directly, in both modes.**
   If step 21E has landed, don't go through its `startCampaign(progress, tier)`: that refuses
   Nightmare until Normal is cleared, and the harness plays every tier from night 1.
5. **A campaign retry is the game's retry.** It uses the same seed, pays the loss's Grocery Money,
   buys installations, and asks the loadout policy again. If a retry would rebuild the same world with
   the same policy (same installations, same loadout), determinism makes it identical. The campaign
   then stops, and the night's last row is `stuck`. That's the measurement `OPEN-QUESTIONS.md` §1's
   catch-up question is waiting for. Installations are bought in one fixed priority while affordable:
   the three counter-space ones cheapest first, then the rest in `INSTALLATIONS` order.
6. **Every job builds its world the game's way.** The loadout policy either returns a list, which goes
   through `setLoadout` (a refusal throws, because it's a policy bug), or null, which leaves
   `tonightsLoadout`. Then `worldOptionsFor(progress, seed)` → `createWorld` → `patch?.(world)` →
   tick. The `patch` hook exists for C's sweep, and this part only ever passes none.
7. **A night that doesn't end is `stalled`, not a hang.** The runner stops at `MAX_NIGHT_TICKS` =
   72,000, twenty game-minutes. The longest defended night measured while splitting was 22,219 ticks.
   A stalled row has blank Grocery Money. **Never call `nightResultOf` on one**, because it throws. In
   campaign mode a stall ends the run.
8. **Two crumb ledgers go on `NightState`, each written in the one function it belongs to.**
   `crumbsEarned` is added in `earnCrumbs` when not banked: collection, payouts and the early-call
   bonus. That's income, which is what the headline divides. `crumbsSpent` is added in `spendCrumbs`:
   placements and upgrades. Nothing else writes either. The row's `crumbsStart` is `world.crumbs`
   before tick 0.
9. **Damage is booked by source inside `applyDamage`**, which gains a source argument from its five
   callers. The step's "one tower type over 60% of damage" can't be measured from `enemyDamaged`,
   which poison, burn, auras, heat and reflect never publish. A Spray Bottle, Candle or Burner board
   would read as "Salt Shaker, 90%", and D would nerf the calibration baseline. The requirements (the
   shape is yours):
   - every point of HP `applyDamage` removes is booked exactly once;
   - it books **effective damage**, `min(amount, max(0, hp before))`. A Mousetrap's 60 on a 10-HP Ant
     is 10 of damage, and counting overkill makes every burst tower look dominant;
   - the source is the tower id when a tower is the source: a hit, an aura, reflect, or a DoT status
     whose `sourceId` is a tower. Tile damage is booked to its effect kind, and anything else to an
     explicit unattributed bucket;
   - **no allocation per call.** `applyDamage` runs for every DoT tick of every enemy, so don't build a
     key string per call. Number-keyed records are fine.

   The runner turns tower ids into def ids from the `towerPlaced` events it has seen. The tower may
   be long sold by the time its poison stops ticking.
10. **The headline is `towersAffordablePerWave` = `crumbsEarned / wavesStarted / rosterMeanCost`**,
    where `rosterMeanCost` is the mean `cost` of `unlockedTowerIds(progress)`.
    - **Per wave, not per night.** The brief and `CONTENT.md` line 7 say "crumbs per wave versus tower
      cost" and "1.5 per night" in one sentence. Per night can't be meant: night 1 opens with 200
      crumbs, four Salt Shakers, before a crumb of income.
    - **The unlocked roster, not tonight's loadout.** The denominator is then the same for every policy
      on a night, and the prices of the whole roster are what "falling to 0.5 by night 18" is about.
    - **The row carries all three inputs**, so D can redefine the number without re-running anything.
      D writes the definition into `CONTENT.md`.
11. **Row order is a sort, never an execution order**: by sweep value, difficulty, night index,
    policy, loadout policy, seed, attempt. C's shards finish in any order. Floats get three decimals,
    integers stay integers, and a null is an empty field. **No timing goes in the CSV.** Elapsed time
    goes to stderr, or byte-identity dies on the first run.
12. **Output defaults to `game/.balance/`**, gitignored and prettier-ignored. Raw results aren't
    committed. What D and E learn goes into the docs as numbers.
13. **Seeds are `--seed` (default 1234, the game's own `SEED`) plus the run index**, so run 0 is the
    night a player actually gets.
14. **`idle` is a real, shipped policy.** It builds nothing and calls nothing. It's the undefended
    baseline (how fast night N falls with no answer at all), and it's the only policy this part needs.

## Build

### 1. The ledgers: `core/types.ts`, `core/world.ts`, `core/systems/economy.ts`, `core/systems/combat.ts` and its callers

Decisions 8 and 9. Document the fields like their neighbours, and initialise them in `createWorld`
and the fixture.

Gotcha: a Sticky Tape's `rooted` and a Fly Paper's carry a tower `sourceId` and deal no damage. Book
only what `applyDamage` actually removed. A resolved 0 books nothing and costs nothing.

Step 21B puts a heatwave into the same function: it multiplies `base` by
`world.modifiers.damageTypeMult[damageType]` before `resolveDamage`. Book the resolved `amount`, the
HP the enemy actually lost, and the two edits compose whichever lands first. If 21B is already in,
its shallow-copy gotcha on `damageTypeMult` applies to anything you add to `WorldModifiers` or
`NightState` too. Copy a nested record wherever a world is built.

### 2. `dev/harness/`: job, runner, row, CSV, campaign

Suggested files: `types.ts` (`Job`, `Row`, `Policy`, `LoadoutPolicy`, the two registries), `run.ts`
(`runNight`, `runCampaign`, `runJob`, `replayNight`), `row.ts`, `csv.ts`, `policies/idle.ts`, and the
`default` loadout policy, which returns null.

The loop, per tick: `policy.decide(world)`, enqueue each command and append `(tick, command)` to the
log, `tick(world, queue)`, **then read `world.events`**. They're gone at the top of the next tick.
Reading them once at the end gives `towersBuilt: 1` and an empty tower-id map, with no error.

Row columns (add to them, don't drop any): `night, nightIndex, map, difficulty, policy,
loadoutPolicy, loadout` (ids joined with `|`), `installations, seed, attempt, sweepKnob, sweepValue,
outcome` (`won | lost | stalled | stuck`), `ticks, wavesStarted, wavesCleared, waveCount, foodStart,
foodRemaining, crumbsStart, crumbsEarned, crumbsSpent, crumbsWastedAtSunrise` (the wallet at the end,
which DECISIONS §4 says evaporates), `crumbsDropped, crumbsCollected, crumbsForfeited` (both halves of
every `humanWoke`), `towersBuilt, towersSold, towersDestroyed, enemiesKilled, enemiesLeaked,
thievesEscaped, peakNoise, wakeCount, groceryMoney, rosterMeanCost, towersAffordablePerWave,
damageTotal, topDamageSource, topDamageShare`. Grocery Money is `night.pay.total`, peak noise
`noise.peakLevel` and the loadout `night.loadout`: read them, never recompute them.

Gotcha: **read `foodStart` before tick 0.** The Emergency Snack Stash adds three items mid-night, so
`night.food.length` at the end isn't what the night started with.

Gotcha: **in night mode, `default` is the five oldest unlocked towers.** A progress with no stored
loadouts has no "last night", and `tonightsLoadout` falls back to the first slots of the unlock order.
So on night 9, `default` never brings the Nightlight. In campaign mode it brings last night's plus
tonight's unlock. Don't compare `default` across modes. Say so in the CLI's help.

### 3. The CLI and the launcher: `dev/harness/cli.ts`, `scripts/balance.mjs`, `package.json`

`npm run balance -- --nights 1-18 --difficulty normal --runs 50 --policy idle --loadout default --out
.balance/results.csv`, plus `--campaign`, `--seed` and `--installations a,b`. Lists are
comma-separated, and `--difficulty all` means all three. An unknown policy, night or installation id
is an error that names it, before any job runs. A one-line summary and the elapsed time go to stderr.

Gotchas, all in the launcher:

- Without `watch: null` and `hmr: false`, Vite starts a watcher over the whole tree, and the process
  idles after the run instead of exiting.
- Close the server in `finally`. Otherwise a throw prints its stack and never gives the prompt back.
- Lint runs over `scripts/*.mjs` too. If it flags `process` as undefined, give `scripts/**` Node
  globals in `eslint.config.js`. Never an `eslint-disable`.

### 4. `eslint.config.js`, `.gitignore`, `game/.prettierignore`

Decision 2's block: a `no-restricted-imports` pattern on `node:*` for `src/dev/harness/**`, with
`cli.ts` excepted. `no-restricted-imports` is replaced wholesale by a later config object, so restate
the shared patterns through `restrict()`, the way every other scope does. Then decision 12's ignores.

## Tests

`tests/ledger.spec.ts` and `tests/harness.spec.ts`.

- **The wallet balances on every tick.** Use a scripted policy defined in the spec, not shipped, that
  places, upgrades, sells, clicks piles and calls early across a whole night. After every tick,
  `crumbs === crumbsStart + crumbsEarned − crumbsSpent + Σ towerSold.refund − Σ humanWoke.crumbsForfeited`.
  Force one wake by driving the level to the cap, so the forfeit term isn't 0. This catches any wallet
  write that bypasses the two doors.
- **Damage is conserved.** Over a night with a Spray Bottle, a Candle, a Gas Stove Burner and a tier-3
  Cardboard Box on the board, the sum of every bucket equals the HP every enemy lost, tracked by id
  each tick as `maxHp − max(0, hp)` at its removal, to 1e-6. The Spray Bottle's booked damage exceeds
  the sum of its own `enemyDamaged` amounts, because the poison counts. The Burner's lands under heat.
  A Mousetrap killing a 10-HP Ant books 10, not 60.
- **Byte-identical.** The same list of jobs run twice gives the identical CSV string, and so does that
  list reversed.
- **Replay.** A night's logged commands, enqueued at their ticks into a fresh world built from the
  same options, end in a world `toEqual` the one the run ended with. B runs this for every policy. It's
  what catches a policy that writes the world or draws on `world.rng`.
- **The wave schedule.** For `idle` on night 1, every `waveStarted` lands on the tick a schedule
  computed from the night def says: the opening countdown runs out, then each wave's last spawn plus
  its countdown. Work the off-by-one out once from `waveSystem` and `spawnSystem`, and pin night 1's
  first start as a literal beside the computation. The row's `ticks` equals `world.tick` at the end.
  This is the step's "tick count matches the wave schedule". It's only true for a policy that never
  calls early and loses no Cookie Jar, whose penalty holds a wave open, and `idle` does neither.
- **Stall.** A job whose tick cap is shorter than its night returns `stalled` with blank Grocery Money
  and doesn't throw.
- **Campaign.** A won night advances and pays. A lost night retries on the same seed. A retry with
  nothing changed stops as `stuck` after that one identical attempt.

## Acceptance

- [ ] `npm run balance -- --nights 1-18 --policy idle` writes eighteen rows, every one `lost`, in a few
      seconds.
- [ ] Opened in a spreadsheet, those eighteen rows already tell a story: undefended, night 1 lasts
      ~4,000 ticks and night 18 ~2,100 (measured while splitting). If a column is unreadable without
      its code open, rename it now, before B and C build on it.
- [ ] Searching `src/dev/harness/` for `node:` finds only `cli.ts`, and `npm run build`'s output
      contains nothing from `dev/harness/`.
- [ ] Nothing in the row recomputes a number that already has a home in `core/`.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 22B and 22C

```
dev/harness/types.ts  interface NightContext { progress: Progress; loadout: readonly DefId[] }
                      interface Policy { readonly name: string; readonly economy: boolean
                                         begin(world: World, night: NightContext): void    // once, before tick 0
                                         decide(world: World): readonly Command[] }        // every tick, commands only
                      type PolicyFactory = (options: { seed: number }) => Policy
                      interface LoadoutPolicy { readonly name: string
                                                choose(progress: Progress, wants: { economy: boolean }): DefId[] | null }
                      POLICIES: Record<string, PolicyFactory>
                      LOADOUT_POLICIES: Record<string, LoadoutPolicy>
                      interface Job; interface Row
dev/harness/run.ts    runJob(job: Job): Row[]
                      runNight(progress: Progress, seed: number, policy: PolicyFactory,
                               loadoutPolicy: LoadoutPolicy, patch?: (world: World) => void)
                          : { row: Row; log: LoggedCommand[]; world: World; options: CreateWorldOptions }
                      replayNight(options: CreateWorldOptions, patch, log: LoggedCommand[]): World
dev/harness/csv.ts    toCsv(rows: readonly Row[]): string      // sorted, fixed decimals
core/types.ts         NightState.crumbsEarned, NightState.crumbsSpent, and the damage book
```

`runNight` creates a fresh policy for every night. A policy's state lives on that object, never in
module scope.

## Do not

Write a policy that builds anything (B), the sweep, `--jobs` or the report (C), or move a content
number (D and E). Don't add a replay viewer or a `--replay` flag: the replay is a test here, not a tool.
