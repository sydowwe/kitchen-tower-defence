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
   that hits air stands, and the ground term shrinks with every Shaker. That's the whole fix.
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
  and a `targets: 'both'` def's air term halves when one air-hitting tower is standing.

The existing replay, economy-knob and smoke tests must pass unchanged.

## Acceptance

- [ ] Rerun D's baseline matrix (D, Build §1). Under `greedy`, `default`, `optimal` and `blind` no longer
      give identical rows on nights 8–18, and the dominant flag no longer fires on every night. Put
      both counts in the commit message.
- [ ] Night 8 under `greedy` + `optimal` places its Spray Bottle, or the next air tower ranked, before
      wave 6 (the flyers-only wave).
- [ ] Read as rows, greedy's nights 1 and 8 look like a player reading the shop: some economy early,
      DPS along the lane, something for the flies.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to D

D reruns its Build §1 from scratch: its recorded baseline was measured with the old `greedy`. Two
things D's pre-flight should know:

- **Nights 1 and 2 can't meet "no single source over 60%"** whatever `greedy` does. Night 1 unlocks
  the Salt Shaker and the Crumb Tray, and night 2 adds Sticky Tape, which does 0 damage. The Shaker is
  the only damaging tower on the roster, so D's decision 1 should exempt them, or say why it doesn't.
- `casual` on `optimal` and `blind` earning nothing from night 7 is D's question, not this part's.
  It's newest-first opening on a specialist (B decision 6), which this part doesn't touch.

## Do not

Touch `casual`, `random`, the loadout policies, the report's flag rules or any content number. Don't add
a policy. Don't make `greedy` plan ahead, sell or retarget: it values a purchase, and that's all that
changes here. The tuning is D's.
