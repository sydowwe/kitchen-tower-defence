# Step 22F — The endless curve, measured

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §9 (the *Modes* line), and step
21's part files D (*The endless night, headless*) and E (*Tiers and endless in the record*), under
`../00-done/21-maps-and-modes/` once step 21 has been moved there.
**Prereq:** step 22D, and step 21, all seven parts.

## Goal

Step 21 built the endless night and handed its curve over: "the endless curve's constants are D's
draft and G's retune, never measured, and the harness is where they get measured." This part gives the
runner an endless job and measures how long runs last, on every map and tier. It moves a constant in
`core/content/endless.ts` only where a measurement says the curve is broken, not where it's merely
unfamiliar. **This part carries the endless job's tests.**

## Already in the repo

Written before step 21 existed, from its part files. Run the pre-flight against the code.

| Where | What's there |
| --- | --- |
| `core/content/endless.ts` (21D) | `ENDLESS_NIGHTS`, one generated `NightDef` per map, `endlessNightId(mapId)`, `ENDLESS_WAVE_COUNT` (~200, "far past where a run ends"). The generator is deterministic in the map alone. The constants are arithmetic that 21G re-tuned by playing. **The tests pin properties, never a constant**, so a constant can move without a spec edit |
| `core/campaign.ts` (21E) | `worldOptionsForEndless(progress, mapId, seed)`, which **throws while endless is locked**. It unlocks on a first campaign clear. `endlessLoadout(progress, mapId)`, the endless loadout setter, and the endless result and best |
| `dev/harness/` (22A–C) | `runJob`, the row, `--jobs`, the report. `MAX_NIGHT_TICKS` is 72,000 |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **An endless job is a third job kind**, built through `worldOptionsForEndless` like the game's. Its
   progress is a campaign cleared on the job's tier, built with 21E's own functions or fields, never by
   bypassing the lock inside `core/`. Its loadout goes through 21E's endless setter the way a campaign
   night's goes through `setLoadout`. The roster is every tower, since the campaign is over.
2. **The score is read from 21E's endless result**, whatever that records as waves survived, and never
   recomputed in the row. A second definition of the score would be a best the game and the harness
   disagree on.
3. **Endless jobs have their own cap, in waves.** A run stops when it's lost or when it clears
   `ENDLESS_WAVE_COUNT`, which counts as a win and is a finding. A tick cap backs that up, generous
   enough for the last wave. At 72,000 ticks, every run that got past wave ~30 would read `stalled`
   and look like a bug in the curve.
4. **What to measure:** `greedy` and `casual` with `optimal`, on all six maps and three tiers, 20+
   seeds each, with no installations and then with all fourteen. Endless keeps installations (21E).
   Record the distribution of waves survived, and the wave each run's food ran out on.
5. **What counts as broken.** Any run that clears every generated wave. A map whose median is more than
   twice or less than half the others' at the same tier. Or `casual` outlasting `greedy`. Anything
   else is taste, and the curve was already tuned for it by playing (21G).

## Build

### 1. The endless job: `dev/harness/run.ts`, `cli.ts`

Decisions 1–3. `--endless counter,sink` (or `all`) replaces `--nights`. Rows carry the map, the tier
and the score. The report gains a table per tier: maps down the side, policies across, median and
spread in each cell.

Gotcha: late waves are hundreds of enemies, and a tick on a board that full costs far more than the
~100 µs a campaign night does. Time one long run before launching the matrix, and size `--jobs` and
`--runs` from that.

### 2. Measure and judge

Decisions 4 and 5. If a constant moves, say which measurement moved it in `endless.ts`'s header, beside
the arithmetic 21D wrote there.

## Tests

In `tests/harness.spec.ts`:

- An endless job on one map with a small wave cap returns its rows, and the same job run twice gives
  the same CSV.
- A job whose progress hasn't cleared the campaign fails before any tick, naming the job. It never
  quietly builds a campaign night instead.

## Acceptance

- [ ] No run clears every generated wave, on any map or tier, with or without installations.
- [ ] The report's endless table exists, and its numbers are written where the curve's reasoning lives,
      not only in a commit message.
- [ ] Play one run on the map the table calls hardest and one on the map it calls easiest. The gap is
      one you can feel, and neither run feels like a different mode.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Add an endless leaderboard, a score other than 21E's, or a campaign number (D's, done). Don't re-tune
the curve toward a run length you picked: 21G tuned it by playing, and this part only corrects what's
broken.
