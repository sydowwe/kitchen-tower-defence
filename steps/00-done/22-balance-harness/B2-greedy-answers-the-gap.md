# Step 22B2 — `greedy` answers the gap

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`; `B-policies.md` decisions 2, 4 and 10; the *Blocked* section at
the top of `D-tuning-the-curve.md` (what the baseline showed, and why D stopped);
`../../analytic-docs/CONTENT.md` §1's preamble and §3.
**Prereq:** step 22C, step 21, and D's first pre-flight (`e24bb74`).

## Goal

D's first run found that `greedy` builds only Salt Shakers on every night, under every loadout, on
every tier. So the three loadout policies give identical rows, every night from 8 to 18 is lost the
moment the Fly arrives, and the dominant flag fires on all 36 night × tier groups. The instrument D
judges difficulty and lockouts with doesn't discriminate. This part changes `greedy`'s valuation so a
purchase is credited for **the part of tonight's threat that the board doesn't already answer**. Then
a ninth Shaker stops outranking the first tower that can hit a fly.

This is still a measuring instrument (the index's *Do not*). The aim isn't a `greedy` that plays well.
It's one that, like a mediocre human, buys *something* for the flies once the flies are eating the
fridge. **This part carries the tests.**

## Already in the repo

| Where | What's there now |
| --- | --- |
| `dev/harness/policies/greedy.ts` | `greedyPolicy(name, economyWeight)`. `Profile.rate` is `valueOf(def, composition)`: one number per `defId\|tier`, cached in `plan.profiles` and blind to the board. `worth()` multiplies it by `plan.coverage.at(tile, reach)`. Economy is already **shared**: `rate / economyShare`, the economy towers standing, itself included. `ECONOMY_WEIGHT = 18`, set by reading night 1's build (B decision 4) |
| `dev/harness/value.ts` | `valueOf(def, composition)` folds the composition into one mean: Σ weight × `resolveDamage(1, type, tags)` × reaches ÷ Σ weight, times card DPS. `WeightedEnemy` is `{ tags, weight }`, with weight = count × HP from `buildPreview`. `optimalLoadout` in `loadouts.ts` also calls `valueOf` |
| `tests/policies.spec.ts` | Replay purity for every policy, the economy knob (`noEconomy` never places economy on nights 1, 4 and 8; `greedy` places at least one on night 1) and the smoke run. **None of these should break.** If one does, the change leaked out of the valuation |
| `tests/harness.spec.ts` | Uses its own `scripted()` player, not `greedy`. Its `topDamageSource: 'saltShaker'` / share 1 assertion is about that script, and stays |
| Baseline, seed 1234, Normal | Night 1: 11 towers built, Salt Shakers 100% of damage. Night 8 under `optimal` brings `sprayBottle\|cookieJar\|saltShaker\|mousetrap\|iceCubeTray`, builds 43 towers, and the Salt Shakers do 100% of the damage. It's lost with 6 of 10 waves cleared. Under `blind` it brings a Toaster, which does no damage either |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file.

1. **Share damage the way economy is already shared.** For each enemy in the composition, a tower's
   credit for it is its existing term (weight × matrix multiplier × reaches) divided by **1 + the
   damaging towers standing that can target that enemy**. "Can target" means the card's `targets`
   against `isFlyer`, and "damaging" means card DPS above 0, so Sticky Tape and the economy towers
   don't count. It's the same idiom as `rate / economyShare` in the same file: one rule, not a second
   mechanism. On a ground-only night every ground tower shares one denominator, so the *ranking*
   between ground towers is unchanged. On night 8 the fly term keeps its full weight until something
   that hits air stands, and the ground term shrinks with every Shaker. ~~That's the whole fix.~~

   *Changed in the build: the share alone isn't the fix, so **the gap** was added.* The share is kept
   for every enemy something standing answers. The enemies **nothing** standing answers are credited
   as if they were the whole night: their terms × tonight's count × HP ÷ theirs (`sharedValue` in
   `value.ts`). On an empty board that's every enemy, and the terms are `valueOf`'s. On a ground-only
   night the first Shaker answers every entry, so night 1's ranking still doesn't move. Why the share
   alone failed, measured at seed 1234 on Normal:
   - Night 8's flies are 11% of its count × HP (42 × 14 of 5,187). The Spray Bottle is `optimal`'s air
     pick at 3.6 DPS for 120, so it passes a Shaker per crumb only once ~17 ground towers stand. At
     decision 5's weight (4), `greedy` saved for a Cookie Jar on three Shakers, lost night 8 with 0 of 10
     waves cleared, and never placed anything that hits air. At the old 18 it built 65 Cookie Jars,
     earned 78,643, and the Spray Bottle came during wave 6, not before.
   - A steeper share, ÷ (1 + n)^1.5 or ^2, made economy outrank damage sooner, and night 8 starved worse.
   - With the gap, night 8 at weight 4 goes Shaker, then Spray Bottle at tick 2, then Shakers. It wins
     9 of 10 waves cleared, and the Shaker does 75% of the damage. Only one air tower comes early,
     because once one stands the flies are answered and go back to sharing.
2. **A placement counts itself, and an upgrade doesn't.** A new tower is the (n + 1)th to share an
   enemy it can target, as a new economy tower already is. An upgrade adds no tower, so its gain is
   computed at the current n.
3. **`valueOf` stays as it is**, for `optimalLoadout`. The loadout screen is chosen on an empty board,
   and the loadout policies aren't this part's business. Add a per-enemy breakdown beside it in
   `value.ts` (the terms `valueOf` sums), and have `valueOf` call it, so there's still one formula.
4. **Coverage is unchanged**: still × `coverage.at(tile, reach)`, per tower. The share answers *what*
   to buy, and coverage still answers *where*.
5. **`ECONOMY_WEIGHT` is re-read, not re-tuned.** Damage worth now falls as towers stand, while economy
   is measured against the empty-board `reference`, so `greedy` will build more economy than before.
   Read night 1's build after the change. B decision 4's target build was "four Salt Shakers, then a
   saved-for Crumb Tray, then shakers along the lane". If it no longer looks like that, move
   `ECONOMY_WEIGHT` until it does, and only then. Write the new value and what night 1 builds into
   B decision 4. **Never move it toward a win rate.**

   *Read in the build: **4**.* At 18 the share made night 1 alternate Shaker and Tray, 12 Trays and
   1,693 earned. Night 1's placements by weight: 6 gives three Shakers, then a Tray; 3 and 3.5 give five;
   4 and 4.5 give four, then the Tray, then Shakers along the lane. Night 1 at 4 places Shaker,
   Shaker, Shaker, Shaker, Tray, with the first Shaker upgraded at tick 1, and earns 459 (415 at
   baseline). An upgrade shares with the others answering, not with itself, so it now ranks above a
   second tower, as decision 2 says it should. The gap leaves night 1 unchanged, so the read stood after
   it was added.

   *Re-read by 22D: **8**.* D halved the Crumb Tray's income (4 to 2 a second). At 4, night 1 never
   placed the Tray: seven Shakers and an upgrade, 282 earned. At 8, the Tray's crumbs a second × weight
   is what B2 read, and night 1 places Shaker ×4 (ticks 0, 2, 3, 1,058, the first upgraded at tick 1),
   then the Tray at 1,749, then Shakers along the lane, and earns 386. The night-1 literal in
   `tests/policies.spec.ts` didn't move (D-tuning-the-curve.md, decision 10).

## Build

### 1. `dev/harness/value.ts`

Decision 3: a per-enemy breakdown of what `valueOf` sums, with `valueOf` rebuilt on top of it.

### 2. `dev/harness/policies/greedy.ts`

Decisions 1, 2 and 4. `Profile` keeps a vector, one term per composition entry, in place of the
single damage `rate`. `worth()` takes the per-enemy standing counts and divides term by term.

Gotcha: `decide` runs every tick, and B decision 10's budget still holds. Count the standing damaging
towers per composition entry **once per `decide`**, from `world.towers`, through the cached profiles,
and pass the counts down. Don't recount inside `worth()`, which runs once per candidate.

Gotcha: `plan.reference`, the best value per crumb on the empty board, is computed in `begin` with
nothing standing. Leave it there. It's what economy is measured against, and recomputing it per tick
would make the economy weight drift with the board.

### 3. Decision 5's re-read

Run `npm run balance -- --nights 1,8 --policy greedy --loadout optimal --jobs 1` and read the rows and
the log (B's unticked acceptance criterion is the same reading).

## Tests

In `tests/policies.spec.ts`, beside the economy knob:

- **Night 8 answers the air.** `greedy` with `optimalLoadout` on night 8 at seed 1234 places a tower
  for which `hitsAir` is true, and at least two distinct damaging defs in all. In the baseline,
  only the Salt Shakers did any damage.
- **A ground-only night keeps its ranking.** On night 1 the first damaging tower `greedy` places is a
  Salt Shaker, and its first five placements are the build decision 5 settles. Write those five as
  literals, so the next change to the valuation has to say what it did to night 1.
- **The share is per enemy, not per tower.** A unit test on the breakdown with a two-entry
  composition (one ground, one air): a ground-only def's term for the air entry is 0 at any count,
  and a `targets: 'both'` def's air term halves when one air-hitting tower is standing. *Added with
  the gap:* with the ground held and nothing on the air, the air term is the card's full DPS against
  it, as if the night were only flies.

The existing replay, economy-knob and smoke tests must pass unchanged.

## Acceptance

- [x] Rerun D's baseline matrix (D, Build §1). Under `greedy`, `default`, `optimal` and `blind` no longer
      give identical rows on nights 8–18, and the dominant flag no longer fires on every night. Put
      both counts in the commit message. *Identical groups (night × tier × seed): 440 of 440 → 0 of 440.
      Dominant: 36 → 26. 8,640 rows in 2,735 s on 8 processes.*
- [x] Night 8 under `greedy` + `optimal` places its Spray Bottle, or the next air tower ranked, before
      wave 6 (the flyers-only wave). *At tick 2, before wave 1.*
- [ ] Read as rows, greedy's nights 1 and 8 look like a player reading the shop: some economy early,
      DPS along the lane, something for the flies.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green. *`ledger.spec`'s
      damage book and `harness.spec`'s byte-identical CSV timed out at HEAD under the full suite on
      this machine, and pass alone. They got explicit timeouts, as 22B gave its whole-night specs.*

## Hands to D

**[B3](B3-greedy-watches-the-lane.md) runs before D** and takes the two policy results below: night 7 and
the Mold stalls. D reruns its Build §1 from B3's matrix. What follows is B2's, kept as B3's "from".

D reruns its Build §1 from scratch: its recorded baseline was measured with the old `greedy`. The
night-mode half of §1 has already been run with this `greedy`, as this part's acceptance:
`game/.balance/b2/night.csv` and `report.html` beside it (gitignored, so only on the machine that ran
it). Only the campaigns are left. Flags: **84 too hard, 16 too easy, 26 dominant, 7 lockout, 3 stalled**
(the old run: 69, 16, 36, 0, 0). `greedy` wins on Normal, out of 20, by `default` / `optimal` / `blind`:
nights 1–6 win 20/20/20; nights 7, 9, 11, 17 and 18 win 0/0/0; nights 8, 10, 12, 13, 14 and 15 win
0/20/0; night 16 wins 0/12/0. So the loadouts finally discriminate. Things D's pre-flight should know:

- **Night 7 is now lost under every loadout (0/20, 20/20 before), and that's the policy, not the
  night.** It's ground-only, so the gap doesn't open. At weight 4, `greedy` places three Shakers, then
  saves 150 for a Cookie Jar through waves 1–3, and the lane falls. Night 8 did the same before the
  gap. Moving `ECONOMY_WEIGHT` to win it would tune toward a win rate (decision 5). By D's decision 4,
  don't move night 7's content for it. Whether `greedy` should stop saving while the lane is leaking
  is a policy question for its own part.
- **The 30 stalled rows are Mold out of reach.** 29 are `noEconomy`/`optimal` on nights 12 and 16
  (Normal) and one is `greedy`/`optimal` on night 16. They hit the 72,000-tick cap with three Mold at
  full HP standing 2–5 tiles down the `vent` path, where no tower reaches. The wave can't clear and
  nothing reaches the fridge. They're new only because these boards now survive long enough. A policy
  that never places anything in the Mold's reach is D's decision 4 case.

- **Nights 1 and 2 can't meet "no single source over 60%"** whatever `greedy` does. Night 1 unlocks
  the Salt Shaker and the Crumb Tray, and night 2 adds Sticky Tape, which does 0 damage. The Shaker is
  the only damaging tower on the roster, so D's decision 1 should exempt them, or say why it doesn't.
- `casual` on `optimal` and `blind` earning nothing from night 7 is D's question, not this part's.
  It's newest-first opening on a specialist (B decision 6), which this part doesn't touch.

## Do not

Touch `casual`, `random`, the loadout policies, the report's flag rules or any content number. Don't add
a policy. Don't make `greedy` plan ahead, sell or retarget: it values a purchase, and that's all that
changes here. The tuning is D's.
