# Step 22D — Tuning the income curve

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/CONTENT.md` (all of it: you're about to change
most of its numbers), `../../analytic-docs/DECISIONS.md` §4, §7 and §10,
`../../analytic-docs/OPEN-QUESTIONS.md` §3.
**Prereq:** steps 22A, 22B, 22C and **22B2** ([B2-greedy-answers-the-gap.md](B2-greedy-answers-the-gap.md)), **and step 21, all seven parts.**

## Blocked: `greedy` can't judge difficulty (pre-flight, 2026-10-09, at `a61c1a0`)

The first run of this step stopped after Build §1. The baseline ran, but no number moved. **The
instrument this step judges difficulty with doesn't discriminate.** Fixing it isn't the policy bug fix
decision 4 allows. It redesigns 22B's decision 2, and *Do not* rules that out here. The fix is [B2](B2-greedy-answers-the-gap.md). Run it before this part runs
again, then rerun §1, because the baseline below was measured with the old `greedy`.

**`greedy` only ever builds Salt Shakers.** On every night, under `default`, `optimal` and `blind` alike,
on Normal and on Nightmare, the Salt Shaker did over 60% of the damage in 20 of 20 runs. In the rows
read one by one, it did 100%. 22B decision 2 values a tower as card DPS × tonight's matrix mean × coverage
÷ cost. §1 prices every tower at or below the Shaker's 10 crumbs per DPS, and fliers are a small share
of a night's count × HP, so a Toaster or a Spray Bottle never outranks another Shaker. The consequences:

- **All three loadout policies give identical rows under `greedy`**, to the crumb. The lockout flag
  reads 0 only because they lose the same nights together.
- **`greedy` loses every night from 8 to 18 on Normal**, 0 of 20 each, from the night the Fly arrives.
  By decision 4, that's the policy, not the night.
- **Every night trips the dominant flag** (36 of 36). Clearing it with content means pricing other
  towers under the Shaker's ratio, against decision 2.
- **The two-answers proof can't be read.** A `fixed=` answer that includes the Shaker is played as
  Shakers only.

What the fix has to give, without making `greedy` play *well* (the index's *Do not*): **a purchase is
credited for the threat nothing standing already answers**. For example, its weight is tonight's
count × HP that no tower on the board can target, so once the ground is held, the fliers lift an
anti-air tower over a ninth Shaker. It needs a spec: on night 8 under `optimal`, `greedy` places
something that hits air. And it needs `ECONOMY_WEIGHT`'s night-1 build re-read, not re-tuned.

### The baseline: the "from" for `OPEN-QUESTIONS.md`

Night mode, `idle`/`greedy`/`noEconomy`/`casual` × `default`/`optimal`/`blind`, Normal and Nightmare,
seeds 1234–1253. Most groups of 20 runs came out identical. The report showed **121 flags: 69 too hard, 16 too easy, 36 dominant, 0 lockout, 0 stalled.**

`towersAffordablePerWave` on Normal, all 20 runs per night identical (target ~1.5 through Act I,
~0.5 by night 18):

| Night | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `greedy` | 1.11 | 1.49 | 1.66 | 2.49 | 2.73 | 3.64 | 4.05 | 3.05 | 2.65 | 2.86 | 2.60 | 2.16 | 2.68 | 2.33 | 5.36 | 2.91 | 2.28 | 2.12 |
| `noEconomy` | 0.73 | 1.01 | 1.14 | 0.97 | 1.10 | 1.63 | 1.71 | 1.01 | 0.87 | 0.77 | 0.67 | 0.47 | 0.91 | 0.69 | 2.42 | 0.59 | 0.60 | 0.47 |

Nights 8–18 are lost nights, so each wave there is a short one. Read them as an upper bound.

What this measurement can already see, and which the fixed `greedy` won't change:

- **Economy towers compound.** The Crumb Tray pays back in ~19 s and the Cookie Jar in ~17 s. `casual`
  buys them in its rotation like anything else. On `default`, it earned 28,000 crumbs on night 4,
  44,900 on night 5 and 49,800 on night 6, with 17,600, 34,600 and 39,100 of them unspent at sunrise.
  `greedy` roughly triples `noEconomy`'s income, and its curve never falls toward 0.5.
- **Grocery Money outruns §8's prices.** Three campaigns per policy and loadout pay 350–540 a night.
  `greedy`'s owned all three counter-space installations (8 slots) by night 3, against "7 slots by
  roughly night 14", and all fourteen by night 5. Every campaign stopped `stuck`: `greedy` and
  `noEconomy` on night 8, `casual` on 3 (`default`) or 6 (`optimal`).
- **`casual` on `optimal` or `blind` loses nights 7–18 having earned almost nothing.** Newest-first
  opens with the night's specialist (an Ice Cube Tray, a Candle). It kills little or nothing, so no
  income ever starts. Whether that's the night or the policy is a question for the rerun.

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

## Acceptance

- [ ] Every target in decision 1 holds on the final run, and the report's flag list is empty or each
      remaining flag is written down in `OPEN-QUESTIONS.md` with why it stays.
- [ ] `../../analytic-docs/CONTENT.md` has the tuned numbers and states what the headline measures.
- [ ] Play nights 5, 13 and 18 on Normal. Night 5 feels like you can afford something new most waves,
      and night 18 like every purchase is a decision.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Touch a noise number: the decay, the cap or a tower's `noise`. That's E, which runs on the economy this
part leaves. Don't touch endless (F). Don't add a tower, an enemy or a policy, and don't sweep crumb rot
(not sweepable, 22C decision 3).
