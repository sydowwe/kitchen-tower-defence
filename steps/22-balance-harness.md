# Step 22 — Headless balance harness

> This step is six sessions. Paste **one part file** into a fresh session, in order, and `/clear`
> between them. Do not paste this index. It only says what the parts are and how they fit.

**Prereq:** step 20a, both parts, for A, B and C. **Step 21, all seven parts, for D, E and F.** This
split was written against `eb45174`. Step 21 was being split in another session at the same time, and
its index and parts A–E were read for this one. Neither split edits the other.

## Goal

Play hundreds of nights headless and find out whether the income curve is right.

This is the step the architecture was built for. `core/` has no DOM and the sim is deterministic, so
the whole game runs in Node with no renderer, and balance stops being opinion and becomes data. **The
one number that must be right is crumbs earned per wave against tower cost**
(`../analytic-docs/CONTENT.md`, preamble). Everything else can move after launch. That one can't.

## Parts

| Part | Session | Builds |
| --- | --- | --- |
| [A](22-balance-harness/A-runner-and-ledger.md) | The runner, the ledger and the CSV | `NightState.crumbsEarned` / `crumbsSpent` and damage booked by source; `dev/harness/`'s job, runner, row, CSV, campaign fold and `idle` policy; the Vite launcher and `npm run balance` |
| [B](22-balance-harness/B-policies.md) | The policies | `core/coverage.ts`; `greedy`, `noEconomy`, `casual`, `random`; the `optimal`, `blind` and `fixed` loadout policies; the smoke run |
| [C](22-balance-harness/C-sweep-and-report.md) | Sweep, parallel jobs, the report | `--sweep` as world patches, `--jobs` across processes, the static HTML report and its flag list |
| [D](22-balance-harness/D-tuning-the-curve.md) | Tuning the income curve | numbers in `core/content/`, `CONTENT.md` rewritten from what was measured, each night's two named answers proven |
| [E](22-balance-harness/E-the-noise-answer.md) | The noise answer | one noise number or none, and `OPEN-QUESTIONS.md` §3 answered with a measurement |
| [F](22-balance-harness/F-the-endless-curve.md) | The endless curve, measured | an endless job kind, run lengths per map and tier, a constant moved only where it's broken |

**Order: A → B → C → step 21 → D → E → F.** A, B and C build an instrument and depend on nothing
step 21 builds. Built first, they're ready when step 21 wants them: its Nightmare criterion asks for
this step's data, and its "more than one loadout wins every night" rule is what C's lockout flag and
B's `fixed` loadouts check. Step 21 needs only 20a too, so the other order also works. The two touch
the same `applyDamage` and the same `Progress`, and each of A's two notes on it says what to do if 21
landed first.

D, E and F tune. Tuning eighteen nights that step 21 is about to move onto five new maps with five
modifiers would be thrown away. E comes after D because how loud a board gets depends on how many
towers the income buys. F comes after D because endless plays on the same economy.

**A, B, C and F carry the tests.** A covers the ledgers, determinism, replay and the wave schedule. B
covers coverage, policy purity and the smoke run. C covers the sweep's isolation, sharding and the flag
rules. F covers the endless job. D and E add none: when a pinned number moves, its literal in
`tests/content.spec.ts` or `tests/noise.spec.ts` moves with it, in the same commit.

## The seam that can't be split

**A row is a pure function of its job.** A job is plain data: nights, difficulty, seed, policy,
loadout policy, installations and a sweep value. Its world is built by `worldOptionsFor` and
`createWorld`, the game's own path, and nothing from one job survives into the next. B's policies keep
their state on the object the runner creates each night. C's sweep patches the world's own copies,
never a content table, and C's shards are merged by sorting. If any part lets state leak between jobs,
the CSV starts depending on job order and on how many processes ran it, and every number D tunes
against shifts with `--jobs`. The byte-identical tests in A and C are what catch it. Step 21's own
seam (everything that makes a night itself is resolved inside `createWorld`) is the other half: it's
why the harness plays every modifier without knowing any of them.

## Contradictions this split resolved

Each one is settled in the part that implements it, with its reason there.

1. **Prereq step 21, which isn't built.** A, B and C need nothing from it, and D, E and F need all of
   it. Hence the order above.
2. **"Executed via `tsx`."** `tsx` isn't installed, and it can't evaluate the
   `import.meta.env.DEV` that `core/content/schema.ts` reads at load, so the first content import dies.
   The launcher is Vite's own dev server used as a module runner (A, decision 1). That was checked
   while splitting: it boots in ~0.4 s, and night 1 undefended ends on the same tick as under vitest.
3. **"Five hundred nights in ten seconds."** Measured while splitting on this machine: a board built
   on every lane-side tile runs at ~100–125 µs a tick. A defended night takes 0.5–3 s, an undefended
   one ~10 ms, and all eighteen defended ~30 s. Five hundred defended nights take about ten minutes on
   one core. So `--jobs` spreads jobs across processes (C, decision 4), and "writes a CSV in seconds"
   became an 18-night `greedy` campaign under 30 s (B, Acceptance).
4. **"Byte-identical across Node and browser sim runs."** There is no browser runner, and vitest
   already runs the sim through Vite's transform in Node. The property kept is that nothing in
   `dev/harness/` except `cli.ts` imports anything Node-only, enforced by lint (A, decision 2).
   Byte-identity is asserted across runs, across job orders (A) and across shards (C).
5. **"A full 18-night greedy run completes in under 30 seconds"** as a test. That's a 30-second spec
   in a suite that takes 4 seconds today. It became an acceptance timing in B. The per-commit spec is
   the smoke run, kept under 5 s.
6. **"Sim tick count per simulated night matches the expected wave schedule."** This only holds for
   a night where nobody calls early and no Cookie Jar dies, because the jar's penalty holds its wave
   open. So it's asserted on `idle` (A, Tests).
7. **"Per night" or "per wave".** `CONTENT.md` line 7 and the original brief both say "crumbs per wave
   versus tower cost" and "1.5 new towers per night" in one sentence. Per night can't be meant, since
   night 1 opens with four Salt Shakers' worth of starting crumbs before any income. The headline is per
   wave, over the unlocked roster's mean price, and every input is its own CSV column (A, decision
   10). D writes the definition into `CONTENT.md` (D, decision 6).
8. **`greedy` buys "the highest DPS-per-crumb tower", and `greedy` must choose economy towers.**
   Economy towers have no DPS. So there's one value-per-crumb scale with an economy weight on it, and
   `noEconomy` is the same policy with that weight at 0 (B, decisions 4–5).
9. **`casual` "buys the most recently unlocked tower".** Read literally, night 2's casual buys only
   Sticky Tape, which does 0 damage. It would lose every night whose unlock is a specialist, and the
   step's own "casual clears nights 1–8" would be unreachable. So casual buys newest-first, round
   robin (B, decision 6).
10. **Tower cost and crumb rot are listed as sweepable.** Neither is on the world. Tower cost is swept
    as income and starting crumbs divided by the same factor (C, decision 2). Rot isn't sweepable in
    this step, and `OPEN-QUESTIONS.md` §3's rot bullet stays open (C, decision 3).
11. **"A single tower type accounts for over 60% of damage."** Poison, burn, auras, Burner heat and
    box reflect publish no `enemyDamaged` event. Counted from events, every DoT board reads as "Salt
    Shaker, 90%". Damage is booked by source inside `applyDamage` instead (A, decision 9).
12. **`optimal` "given full knowledge of the night's composition".** Full knowledge would measure
    memorising the file. The step says the gap measures whether the preview is informative enough, so
    `optimal` reads the preview the loadout screen shows (B, decision 3).
13. **"The decay is one number in `core/world.ts`."** It's also pinned at two lines of
    `tests/noise.spec.ts`, quoted in nine other places, and the Gas Stove Burner's noise rule is
    argued against 1.5/s (E, Already in the repo).
14. **Step 21 hands this step two jobs its file never mentioned.** 21C writes into each night's note
    the two loadouts it falls to, and calls proving them "step 22's". 21's index says the endless curve
    "gets measured" by the harness. The first is B's `fixed` loadout policy and D's check. The second is
    part F.

## Step acceptance

- [ ] `npm run balance -- --campaign` plays all eighteen nights, and the full policy matrix runs with
      `--jobs` in minutes, not hours.
- [ ] The report's flag list points at real problems you can feel when you play those nights.
- [ ] `../analytic-docs/CONTENT.md` has been updated with the tuned numbers, and states what the
      headline number measures.
- [ ] `../analytic-docs/OPEN-QUESTIONS.md` §3's "Noise cap 100 with 1.5/s decay" is struck through and
      answered with a measurement, not an opinion.
- [ ] Every night's two named answers win, and no endless run clears every generated wave.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Consequences for later steps

- **Step 23:** `core/coverage.ts`'s `trackCoverage` is the answer a "recommended tile" hint would give
  (`OPEN-QUESTIONS.md` §1). Whether to show one is still step 23's call.

## Do not

Try to make the policies play *well*. They are measuring instruments, not AI opponents. A `greedy`
that plays like a mediocre human is exactly right. Don't build the recommended-tile hint (step 23),
anything of endless beyond measuring it (step 21's), or a replay viewer.
