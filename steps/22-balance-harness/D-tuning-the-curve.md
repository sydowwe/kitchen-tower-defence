# Step 22D — Tuning the income curve

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/CONTENT.md` (all of it: you're about to change
most of its numbers), `../../analytic-docs/DECISIONS.md` §4, §7 and §10,
`../../analytic-docs/OPEN-QUESTIONS.md` §3.
**Prereq:** steps 22A, 22B, 22C and **22B2** ([B2-greedy-answers-the-gap.md](B2-greedy-answers-the-gap.md)) and **22B3** ([B3-greedy-watches-the-lane.md](B3-greedy-watches-the-lane.md)), **and step 21, all seven parts.**

## Status: the curve lever is built; the rest wants splitting (2026-10-19, at `c871478`)

The first run of this step stopped blocked on `greedy`, which built only Salt Shakers. [B2](B2-greedy-answers-the-gap.md)
and [B3](B3-greedy-watches-the-lane.md) fixed that, and this run went through Build §1 and decision 3's first lever
(the curve). **It stopped there on purpose.** What the measurement found past the curve is three
more sessions' worth of different work, each with its own reading list. Each is written down below
with its numbers, under *Where this run stopped*. Run `/step-split` on this file before building the
rest. The Build, Acceptance and Do-not sections below are the step as written. Decisions 8–11 are
what this run measured and settled.

### The baseline: the "from" for `OPEN-QUESTIONS.md`

Night mode, `idle`/`greedy`/`noEconomy`/`casual` × `default`/`optimal`/`blind`, Normal and Nightmare,
seeds 1234–1253, at `c871478`, to `game/.balance/d0/` (gitignored). It reproduced B3's *Hands to D* to
the flag: **138 flags: 80 too hard, 16 too easy, 33 dominant, 8 lockout, 1 stalled.** Nearly every group
of 20 runs is identical row for row, so for exploring, 1–3 seeds read the same as 20.

`towersAffordablePerWave` on Normal under the `optimal` loadout. Each cell is wins out of 20, then the
headline (target ~1.5 through night 8, falling to ~0.5 by 18). A lost night's waves are short, so its
headline is an upper bound.

| Night | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `greedy` | 20: 1.22 | 20: 1.80 | 20: 2.18 | 20: 2.64 | 20: 4.14 | 20: 9.79 | 20: 8.05 | 20: 7.08 | 0: 0.95 | 20: 23.6 | 20: 19.8 | 20: 37.0 | 20: 46.6 | 20: 55.5 | 20: 223 | 11: 141 | 0: 0.48 | 0: 0.33 |
| `noEconomy` | 20: 0.73 | 20: 1.01 | 20: 1.14 | 20: 0.97 | 20: 1.10 | 20: 1.63 | 20: 1.71 | 0: 0.67 | 0: 0.95 | 0: 0.47 | 20: 2.47 | 20: 2.53 | 20: 2.74 | 20: 3.06 | 20: 10.6 | 13: 2.47 | 0: 0.48 | 0: 0.33 |

Three campaigns per policy and loadout (`d0c/`): `greedy`/`default` earned **246,371 crumbs on night
15** and 111,593 on 16. Every policy owned all three counter-space installations by night 3–4 and all
fourteen by night 8, at ~390–515 Grocery Money a night. `greedy`/`optimal` and `blind` stopped `stuck`
on night 8, `default` on 16–17, `casual` on 3–7.

## Goal

Use the harness, and get the numbers right. The curve comes first: crumbs earned per wave against
what towers cost. Then difficulty through nights 1–18 on Normal and Nightmare. Every moved number is
written back into `CONTENT.md`, so the reference doc is never stale. This is a measuring session: it
ends with numbers in content files and a doc that states them, not with new code.

**Run the pre-flight against step 21's result first.** This part was written before step 21 existed.
The nights have moved onto six maps, with modifiers and more than one lane, and the "Already in the
repo" below names the files that hold numbers, not the numbers themselves.

## Already in the repo

| Where | What holds the number |
| --- | --- |
| `npm run balance` | 22A–C. `--campaign`, `--sweep`, `--jobs`, `--report`, the flag list, and the `towersAffordablePerWave` headline with its three inputs in their own columns |
| `core/content/towers.ts` | Costs, rates, economy payouts (`income({ crumbsPerPayout })`) and the tiers' flat adds. `tests/content.spec.ts` pins every tower's cost and the Salt Shaker's whole row literally |
| `core/content/upgrades.ts` | `UPGRADE_COST_RATES = [0.6, 1.2, 2.5]`, `CONTENT.md` §1's 60% / 120% / 250% |
| `core/content/enemies.ts` | `reward` (the crumb drop), HP, speed and `steals`. `content.spec` pins several rewards literally |
| `core/systems/commands.ts:29` | `CRUMBS_PER_SECOND_SKIPPED = 2`, with a comment saying "step 22 is what re-prices this" |
| `core/content/difficulty.ts` | `CONTENT.md` §9, transcribed |
| `core/content/nights.ts` | Counts, spacing and countdowns. Its notes carry numbers measured by earlier steps (the mold counts, the fly and moth introductions). **Each night's note names the two loadouts it was authored to fall to** (21C, decision 4) |
| `core/systems/scoring.ts`, `core/content/installations.ts` | Grocery Money's terms, and installation prices |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the measurement proves it wrong,
and then edit this file. Don't leave it lying.

1. **The targets, from the step:**
   - `casual` clears nights 1–8 on Normal and struggles from 13 onward.
   - `greedy` clears all 18 on Normal and loses some nights on Nightmare.
   - `towersAffordablePerWave` runs ~1.5 through Act I and falls to ~0.5 by night 18.
   - No single source takes over 60% of the damage on any night.
   - `greedy` builds economy towers, and `noEconomy` still clears Act I: strong, not mandatory.
   - The lockout flag is empty: every night is won by at least two loadout policies under `greedy`
     (DECISIONS §10). **And each night's two named answers both win**, run as
     `--policy greedy --loadout fixed=…`. Step 21C calls that "the two-answers proof" and leaves it to
     this step. A night that loses to its own named answer is the night's fault, not the policy's.
2. **The Salt Shaker doesn't move.** 50 crumbs, 5 damage, 1.0/s and range 3 is the baseline every
   price in `CONTENT.md` §1 is set against (its preamble). `DECISION-LOG.md` records that every Act III
   price in `ROADMAP-POST-V1.md` is set against it too. Move income, rewards and other prices around it.
3. **The levers, in order:** the curve first (enemy `reward`, economy payouts, the early-call rate,
   starting crumbs), then difficulty (counts, spacing, HP), then individual tower prices last. Sweep a
   knob to find the region, then move the content number the knob stands for. **A sweep result is never
   shipped as a multiplier.**
4. **Don't tune a policy to hit a target.** If `greedy` loses a night because it never buys the night's
   answer (a Bay Leaf for Weevils, a Vinegar Spray for mold), that's the policy, not the night. Check
   `optimal`'s rows before moving a number. Fixing a policy *bug* is fine, with a spec, in the commit.
   Moving a policy constant because the curve looks wrong isn't.
5. **Nightmare is its tier's scalars, never its own content** (`CONTENT.md` §9). If Nightmare doesn't
   bite, the scalars move, in §9 first.
6. **`CONTENT.md`'s preamble states what the headline measures.** 22A settled it as crumbs earned per
   wave played, over the unlocked roster's mean price, because the doc said "per wave" and "per night"
   in one sentence. Write the definition beside the target, so the doc and the CSV say the same thing.
7. **The doc first, then the code.** One source of truth per number: `CONTENT.md` changes in the same
   commit as the file that transcribes it, never after it.

*Measured and settled by this run:*

8. **Ruled out: keeping an entry out of the gap until one of its enemies has been on the board.** On
   night 8 `greedy` buys a Toaster as its second purchase, at tick 1, for flies that arrive at tick
   ~3,200. That reads like a bug against B2's "once the ground is held". Prototyped as a `seen` flag on
   `LaneWatch` passed to `sharedValue`: night 8's Toaster moved to tick 3,206, and night 8's named
   answer still lost (roaches through the line with 8 waves called by tick 5,711). `noEconomy`/`optimal`
   then lost nights 11–15, which it had won 20/20, because the Spray Bottle came only once flies were
   already leaking. Buying air from the composition at tick 0 is what reading the preview is *for*
   (DECISIONS §10). It's the policy working, not a bug, and it was reverted.
9. **The curve, decided with the user, at this run's numbers.** Lever 1 moved four content numbers.
   Measured before and after with the matrix above:
   - **Economy payouts.** Tray 4 → 2/s (tiers 3, 4), Jar 9 → 4/s (tiers 6, 8), Honey Pot 7 → 3/s
     (tiers 4, 5). At 4 and 9 a tray paid back in 19 s and economy compounded inside a night (the
     campaign numbers above). A Jar at 5 is better per crumb than a Tray at 2, so `optimal` reserves it,
     and `greedy` compounded again: 3.3 on night 7, 56 on night 15. At 4 it ties the Tray.
   - **The jar's penalty 200 → 100**, with its income and the rewards it is spent at. A lost jar still
     costs ~25 s of its own income, and in Act I it buys about what it did (50 Ants at 2, 67 at 3).
   - **Rewards cut** (ant 3→2, roach 5→3, beetle 10→6, fruit fly 2→1, fly 6→2, moth 8→3, mold 12→6,
     weevil 9→3, slug 11→4, silverfish 18→6, mouse 40→20). Every enemy paid ~0.3 crumbs per HP, and
     Act II waves carry up to 8× night 1's HP, so kill income alone (`noEconomy`) ran 2.5–3.1 on nights
     11–14 against 1.2–0.9. An income sweep showed the nights had room: `noEconomy` wins 13–14 at 0.3×
     income, 12 at 0.5×, 11 at 0.6×. **The user chose to cut rewards toward the target, then, shown
     the arithmetic below, to cut what Act I tolerates and override the falling half.**
   - **`CRUMBS_PER_SECOND_SKIPPED` 2 → 4.** The early call pays a flat ~12–15 crumbs a wave on every
     night at 2. It is the one income that doesn't scale with enemy counts, so it lifts Act I without
     inflating Act II.

   **The falling half is overridden.** Act II's per-wave income is ~9× night 1's whatever an enemy is
   worth, because the authored counts are (68 Ants on night 1; 377 Ants, 191 Roaches and 60 Beetles on
   night 18). Night 18's Act I three alone drop 192 crumbs a wave at the old prices, against its
   target of 57. Reaching 0.5 would need crumbs per HP to fall ~15× across the campaign. That's Ants
   at ~1 and Act I's kill income near 0.2, or fewer bodies in Act II's waves. Starting crumbs were
   left at 200: they aren't in the headline, and 1–3× of them doesn't save the openers (below).
10. **`ECONOMY_WEIGHT` 4 → 8, by B3 decision 4's rule.** With the Tray at 2/s, night 1 under `greedy`
    + `optimal` stopped placing it (seven Shakers and an upgrade, 282 earned). At 8 it places Shaker ×4
    (ticks 0, 2, 3, 1,058), the Tray at 1,749, then Shakers along the lane, and earns 386. The weight
    was read against that build, never a win rate, and B2 decision 5 has it. The night-1 literal
    didn't move. B3's night-7 spec now counts an upgrade as a damaging purchase. Night 7 is three
    Shakers and an upgrade, then the Tray at 1,752, and wins 16/20 under all three loadouts. It also
    asserts the win.
11. **`casual`'s "clears nights 1–8" was reached only through compounding**, and the curve removes
    that. At `c871478`, `casual`/`default` won night 2 by building 76 towers on 4,022 crumbs earned,
    and night 5 on 44,914. Its night-2 rotation is Tape, Tray, Shaker, so two purchases in three do no
    damage. At any economy that doesn't compound it can't hold the lane, and it loses night 3 at every
    income up to 2× (Mousetrap and Tape first). On `optimal`/`blind` it opens nights 7+ on the night's
    specialist and earns nothing. On `default` night mode brings no air answer from night 8. By
    decision 4 these are the policy's. The target needs either `casual` reworked (22B's) or a decision
    that it measures the floor and not a player who clears Act I.

### The final run, at this commit

The same matrix, to `.balance/d1/`: **123 flags: 82 too hard, 7 too easy, 28 dominant, 6 lockout, 0
stalled** (from 80, 16, 33, 8, 1). Same table as the baseline:

| Night | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `greedy` | 20: 1.03 | 20: 1.27 | 20: 1.45 | 20: 1.24 | 20: 1.67 | 20: 2.56 | 20: 3.09 | 20: 2.05 | 0: 0.62 | 0: 1.05 | 20: 2.39 | 0: 0.94 | 20: 3.24 | 20: 3.64 | 20: 32.8 | 13: 6.29 | 0: 0.34 | 0: 0.31 |
| `noEconomy` | 20: 0.75 | 20: 0.96 | 20: 0.99 | 20: 0.83 | 20: 0.91 | 20: 1.30 | 20: 1.30 | 0: 0.51 | 0: 0.62 | 0: 0.41 | 20: 1.50 | 20: 1.53 | 20: 1.58 | 20: 1.74 | 20: 5.83 | 12: 1.37 | 0: 0.34 | 0: 0.31 |

What moved: Act I sits at 1.0–1.7 on nights 1–5, with economy adding a third over kills. Nights 6–7 sit
at 2.6–3.1, where economy still compounds on a long night. Act II's won nights went from 20–55 to
2.0–3.6. Night 15 went from 223 to 33: the dinner party's double crumbs over a 390-s night, which is
off the curve by design. What it cost: `greedy` loses nights 10 and 12, which it won at the old income.
Campaigns (`d1c/`) stop `stuck` one night later for `greedy`/`optimal` (night 9). Grocery Money and
the installations are unchanged.

### Where this run stopped: three pieces of work, for `/step-split`

1. **The openers of nights 8–18 fail their own named answers.** This is decision 1's two-answers proof,
   run as `--policy greedy --loadout fixed=…`, three seeds, from each night's note in `nights.ts`. At
   this commit, 12 of 30 answers win: both on nights 4–7, then only the four with a Spray Bottle (8B,
   9B, 15B, 17A). The other 18 lose before wave 1 is cleared, and lose the same way at `c871478`'s
   numbers. With `greedy`'s early calls switched off (a prototype, reverted), 8A wins. Adding 3×
   starting crumbs (600) wins 9A, 11B and 13B as well, and **the other 14 still lose**. With 40,000
   starting crumbs (a sweep misread as a value, kept because it bounds the money), 13A, 14A, 18A and
   18B still lose. Nights 16–18 lose to every policy and loadout in 2–3 waves (~40 s),
   with 17 of 22 leaks flyers on night 17 even at 0.4× enemy count. By decision 1 this is the nights'
   fault. It's difficulty work over ten nights' waves (counts, spacing and where the flyers start),
   with the proof as its test.
2. **Nightmare.** `greedy` loses every Nightmare night from night 1, under every loadout, at
   `c871478` and here. `noEconomy` wins only 1, 3 and 6. By decision 5 that's §9's scalars, and it
   can't be judged until Normal's nights are won.
3. **Grocery Money against §8.** Every campaign owns all three counter-space installations by night
   3–4 (against "7 slots by roughly night 14") at ~390–500 a night, before and after this run. By
   the gotcha in Build §2, the installation prices move.

Not touched, and why: tower prices (decision 3's last lever, after difficulty), the Salt Shaker
(decision 2), and every noise number (*Do not*).

## Build

### 1. The baseline

Before touching anything, run the matrix (`idle`, `greedy`, `noEconomy`, `casual` × `default`,
`optimal`, `blind`, on Normal and Nightmare, 20+ seeds, in night mode) and one `--campaign` per
policy, then write the report. Keep the headline curve and the flag list from this run. The
`OPEN-QUESTIONS.md` answer is "from this, to this", and nothing else records the "from".

### 2. Tune

Decisions 1–5, in decision 3's order. Re-run the matrix after each lever, not after each number.

Gotcha: **nights with a modifier are measured with it.** Night 15's "after a dinner party" doubles
spawns and crumb values, so its headline sits well off the curve by design. Night 6's fifteen
scattered piles go through `dropCrumb` at tick 0 (21B), so they count as dropped and, once collected,
as earned. Judge the curve across the nights around those two, and don't flatten either back onto
the line.

Gotcha: `CONTENT.md` §8 says the three slot installations are priced so a player who prioritises
them "can reach 7 slots by roughly night 14". 22A's campaign buys them first, so `--campaign`
measures that claim directly. If it's off, the prices in §8 move, not the slot rule.

### 3. Write back

`CONTENT.md` §1, §2, §6, §8 and §9 for every number that moved, then the code. Then, in the same
commit:

- **`tests/content.spec.ts` pins most of these literally.** A moved number moves its literal,
  deliberately, in the same commit. That's what the pins are for.
- **Comments that quote a measurement taken at the old numbers** go stale silently. These include the
  Candle's 5/s, the Lemon's splash, the Honey Pot's HP, the Fan's cone and the mold counts in
  `nights.ts`. Re-measure the one it argues for, or say which step measured it and at what prices.
- `CRUMBS_PER_SECOND_SKIPPED`'s "step 22 is what re-prices this": re-priced or confirmed, and the
  comment says which.
- `OPEN-QUESTIONS.md` §3: strike **The income curve** and **Silverfish at night 17**. Night 17's two
  `fixed` answers are "beatable two ways", measured. Answer each with what was measured, in the shape of
  11C's fruit-fly entry: the runs, the numbers before and after, what moved and what didn't.

## Tests

**None new.** 22A–C carry the harness's tests. The literals in `tests/content.spec.ts` move with the
numbers they pin.

*As built:* the moved numbers moved their literals in `content`, `charges` (the jar's 100 buys 20 Ants
and 20 Roaches), `crumbs`, `night`, `viewModel`, `sweep`, `modifiers` and `upgrades`. B3's night-7
spec in `policies.spec.ts` counts an upgrade as a damaging purchase and asserts the win (decision 10).
B2's night-1 literal didn't move.

## Acceptance

- [ ] Every target in decision 1 holds on the final run, and the report's flag list is empty or each
      remaining flag is written down in `OPEN-QUESTIONS.md` with why it stays. *Not this run: 123 flags.
      The curve's Act I half holds on nights 1–5. The rest is* Where this run stopped.
- [ ] `../../analytic-docs/CONTENT.md` has the tuned numbers and states what the headline measures.
      *It states the measure and has lever 1's numbers (§1 economy rates, §2 rewards). Difficulty, §8
      and §9 are still to tune.*
- [ ] Play nights 5, 13 and 18 on Normal. Night 5 feels like you can afford something new most waves,
      and night 18 like every purchase is a decision.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Touch a noise number: the decay, the cap or a tower's `noise`. That's E, which runs on the economy this
part leaves. Don't touch endless (F). Don't add a tower, an enemy or a policy, and don't sweep crumb rot
(not sweepable, 22C decision 3).
