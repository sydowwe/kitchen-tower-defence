# Step 22E — The noise answer

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §8, `../../analytic-docs/CONTENT.md`
§1 (the Noise column and the Gas Stove Burner's note) and §8 (the three noise installations),
`../../analytic-docs/OPEN-QUESTIONS.md` §3, `../00-done/13-noise.md` (*Balance is step 22's*).
**Prereq:** step 22D.

## Goal

Answer the question `OPEN-QUESTIONS.md` §3 has carried since before the meter existed: can anything
in Act I fill the noise meter? If nothing can, the mechanic is inert until Act IV, which defeats the
point of shipping it early. Step 13 deliberately shipped without touching a number, because this needs
a measurement, not a judgement. Measure it on the economy D left, then change **one** thing, or
nothing, and write down what you measured.

## Already in the repo

**The arithmetic step 13 handed over:**

- a Mousetrap is `noise: 2` every 396 ticks — **0.30/s**, and only while something is inside its
  range of 1;
- a Toaster is `noise: 3` every 200 ticks — **0.90/s**, and only while something is in the air inside
  its range of 4;
- the decay is **1.5/s**, always.

So five Mousetraps firing without a pause merely hold the meter level.

**A crude probe taken while splitting this step.** Every lane-side tile on the Counter was built, a
sixth of them Toasters, with no Mousetraps and nothing chosen by a policy. The meter peaked at 18 on
night 8 and at 33–50 on nights 10–17, and the only wake came on night 18. It isn't a measurement, but
it suggests option 1 below won't hold.

| Where | What's there |
| --- | --- |
| `npm run balance` | `peakNoise` (`noise.peakLevel`, written before a wake zeroes the level) and `wakeCount` per row. `--sweep noiseDecay=a:b:step` sets the base decay per second (22C) |
| `core/world.ts:24` | `NOISE_DECAY_PER_TICK = 1.5 / 60`, the only place the decay is set |
| `tests/noise.spec.ts:587` and `:594` | Pin the base: `2 / 60` with Oil the Hinges owned, `1.5 / 60` without |
| `tests/fixtures/world.ts:39` | Its own `decayPerTick: 1.5 / 60`. The specs on that fixture test the meter's arithmetic, not the tuned value. **Leave it** |
| `core/content/towers.ts` | `mousetrap.noise` 2 and `toaster.noise` 3. `tests/content.spec.ts:264` and `:567` pin both |
| The prose that quotes 1.5/s | `DECISIONS.md` §8, `CONTENT.md` §1 (the Burner's note), `core/world.ts:23`, `core/types.ts:600`, `core/systems/noise.ts:14`, `core/content/schema.ts:91` (`MAX_NOISE_DECAY_DELTA`'s reasoning), the Burner's comment in `towers.ts` (~line 935), `ui/viewModel.ts:121`, `ui/components/hud/StatCard.vue:116` |
| The prose that quotes the per-shot values | `DECISIONS.md` §8, `CONTENT.md` §1's Noise column, `OPEN-QUESTIONS.md` §3. The shop card reads `projectedNoisePerSecond`, so it follows the def by itself |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the measurement proves it wrong,
and then edit this file. Don't leave it lying.

1. **What to measure:** `greedy` and `casual` with the `optimal` loadout, on nights 3, 6 and 8, at all
   three difficulties, 20+ seeds each. Night 3 unlocks the Mousetrap, 8 the Toaster, and 6 is between
   them. Record the distribution of `peakNoise` and `wakeCount` and the win rate beside them, since a
   wake that loses the night is a different finding from one that doesn't. Then sweep `noiseDecay`
   across 0.5–2.0 on night 8 to see where it starts to bite.
2. **Change one thing, in the step's order of preference:**
   1. **Nothing**, if a plausible night-6 board wakes a human once and still wins. "Plausible" means
      `greedy`'s board. "Once" means some runs wake and most don't. Write that down and stop.
   2. **The decay**, if the meter is only just out of reach. It's one number in `core/world.ts`, it's
      what Oil the Hinges is priced against, and it's already sweepable.
   3. **The per-shot values**, if the towers are the problem rather than the decay. `CONTENT.md` §1's
      noise column and the two pinned literals in `tests/content.spec.ts` move together.

   Never the cap: it's the tier's number (`CONTENT.md` §9), and the step's options are these three.
3. **The doc first.** `DECISIONS.md` §8 and/or `CONTENT.md` §1 change before the code, in the same
   commit. One source of truth.
4. **The answer takes the shape of 11C's fruit-fly entry** in `OPEN-QUESTIONS.md` §3. Strike the bullet
   and write what was measured: the boards, the peaks, the wakes, what moved and what didn't, and what
   no person has watched yet. A balance question answered only in a commit message gets asked again in
   six months.

## Build

1. **Measure** (decision 1). Keep the table: it goes into the answer.
2. **Decide** (decision 2), and say in the answer which option held and why the ones before it didn't.
3. **Change it**, doc first, and every pin and every quote from the table above with it.

Gotcha: **a decay of 2/s or more inverts the Gas Stove Burner's design note.** The Burner pays its
noise only while it's burning something, because "2/s beats the meter's 1.5/s decay, and an idle
Burner would wake the house on its own" (`CONTENT.md` §1, and the comment on `gasStoveBurner`). At 2/s
or more, a Burner alone can never fill the meter, and the note argues for a rule nothing needs any
more. Rewrite both. Keep the rule unless the measurement says otherwise: it's still what a player
expects.

Gotcha: **Oil the Hinges is +0.5/s, priced against 1.5/s** (a third faster). If the base moves, that
ratio moves with it, and `CONTENT.md` §8's price may no longer match what it buys. Re-read the price
against the new ratio, and say in the answer whether it moved.

## Tests

**None new.** If the decay moves, `tests/noise.spec.ts:587` and `:594` move with it, and the fixture
stays. If a per-shot value moves, `tests/content.spec.ts:264` or `:567` moves with it.

## Acceptance

- [ ] `../../analytic-docs/OPEN-QUESTIONS.md` §3's "Noise cap 100 with 1.5/s decay" is struck through and
      answered with a measurement, not an opinion.
- [ ] Nothing in the table above still quotes the old number.
- [ ] Play night 8 twice, once with a Toaster-heavy air defence and once without. The two boards sound
      different on the meter, and the loud one is a decision rather than a trap.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Move the cap, an income number (D) or a noise installation's effect. Don't add a noise source: the
Cricket's passive noise is Act III.
