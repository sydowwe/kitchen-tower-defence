# Step 22D — Tuning the income curve

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/CONTENT.md` (all of it: you're about to change
most of its numbers), `../../analytic-docs/DECISIONS.md` §4, §7 and §10,
`../../analytic-docs/OPEN-QUESTIONS.md` §3.
**Prereq:** steps 22A, 22B and 22C, **and step 21, all seven parts.**

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
