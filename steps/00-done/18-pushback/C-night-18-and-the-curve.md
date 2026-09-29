# Step 18C — Night 18, and the tuning pass

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../../CLAUDE.md`, `../../../analytic-docs/CONTENT.md` §6 (the night table, row 18,
and the lines under it) and §2 (the roster), `../../../analytic-docs/DECISIONS.md` §5 (night
structure) and §8 (noise), and the *Pushback resistance curve* line of
`../../../analytic-docs/OPEN-QUESTIONS.md`.
**Prereq:** steps 18A and 18B.

## Goal

This session closes step 18. The v1 finale exists as a night you can play: fourteen waves on the
Counter, with enough flyers that a Fan earns its slot. Then comes the pass that re-tunes every
number A authored blind: the Fan's opening and tiers, and the resistance curve. The Fan should feel
like holding a door shut, and a row of them shouldn't be the only strategy.

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/content/nights.ts` (`NIGHTS`) | 1–13, 15, 16, 17, positional. `GameView.vue` walks it by array position. The note above it says "18 the Fan's (step 18), and authoring either now would be authoring a night its own step rewrites". **Night 17 is the template**: `OPENING_TICKS` first, then `8 * 60` countdowns, two chaos-shaped waves with nothing armored or permanent, and molds placed with `startDistanceTiles` |
| `tests/content.spec.ts` (`nights 4 to 9`) | pins every night's wave count and index as literals. The comment says "18 the Fan's (step 18); the gaps are on purpose". The next test requires `mapId: 'counter'` and `pathId: 'crack'` on every entry |
| `core/content/towers.ts` (`fan`) | A's blind numbers: `coneHalfAngleDeg: 25`, tiers +0.5 range twice, T3 Marked |
| `core/systems/pushback.ts` | `PUSHBACK_FLOOR` 0.35, `PUSHES_TO_FLOOR` 4, `PUSHBACK_DECAY_TICKS` 240: **values** you may move. `tests/pushback.spec.ts` asserts against the names, so moving a value moves no assertion. But the two-Fan test is a tripwire: if a re-tune makes it fail, the re-tune locks lanes |
| `ui/views/GameView.vue` | `SEED = 1234`. If `dev/night/NightPanel.vue` is in the tree (17D), use it to jump straight to 18 |
| `ui/locales/en.ts` | B's Fan copy |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **Night 18 is on the Counter, single-lane, 14 waves, with no modifier.** §6 puts it on the Floor
   with the heatwave. The Floor is step 21's map and the heatwave is step 21's modifier, and every
   night since 4 has made the same substitution for the same reason (`createWorld` throws on an
   unknown `mapId`). Append it after `night17`: 18 comes after 17, so appending is already the right
   position. Rewrite the note above `NIGHTS` and the spec comment so neither says 18 is missing.
2. **It's the finale, so it's the hardest night in v1, and it asks the Fan's question.** No new
   enemy (§6). Everything the roster has, plus fly- and moth-heavy waves dense enough that a line
   without air control leaks. At least one wave should be a dense fly swarm on a short countdown:
   the door a Fan holds. Keep the Silverfish and Mold rules from night 17's note (never a
   Silverfish-only wave, nothing permanent in the chaos waves).
3. **The Fan is judged on the board, then by the numbers.** Tune the cone's opening and the tiers
   first, because they decide whether a Fan is *placeable* (does a wedge beside the Counter's lane
   catch a useful stretch?). Tune the curve second. Say in the commit which way each moved and why.
4. **Answer the open question.** Rewrite the *Pushback resistance curve* line of `OPEN-QUESTIONS.md`
   with what play showed: the floor, the decay, how many Fans it took to trivialise night 18, and
   whether the noise did that job instead. A line that still says "a guess" after the step that
   could judge it is a line that lies.

## Build

### 1. Night 18: `core/content/nights.ts`, `tests/content.spec.ts`

Decisions 1 and 2. Update both literals (the wave count list gains a 14, the index list an 18) in
the same commit.

### 2. Play it, then tune: `core/content/towers.ts`, `core/systems/pushback.ts` (values)

Night 18 at 1× and 3×, with zero, one, two and three Fans, on two seeds (change `SEED` locally and
**don't commit it**). A throwaway headless harness is fine for comparing layouts, as 16C and 17D did;
**don't commit it**, because the balance harness is step 22's. Then re-read B's copy against what
the Fan turned out to be.

Gotchas that will bite the tuning:

- **The Fan's price is noise, not crumbs.** One Fan firing is 1.5/s, exactly the meter's decay, so
  it holds the meter flat. Two climb at 1.5/s net. Three climb at 3/s and wake the house from empty
  in about half a minute at the normal cap. That's the real anti-spam, and it only bills while
  flyers are in the cone. Watch the meter before calling the Fan balanced or broken.
- **The floor is per push, so enough Fans always lock.** At the draft floor with overlapping cones,
  three Fans out-push a Moth (1.6 tiles/s) and four out-push a Fly (2.2). A higher floor or a slower
  decay moves both thresholds. A's two-Fan test holds the line at two.
- **Tier 3 marks everything in the gust, continuously.** Marked is 3 seconds and the Fan pulses every
  0.67, so a tier-3 Fan keeps its whole cone at +25% damage taken. Judge it against the Bay Leaf's
  tier-3 Marked aura, which does the same for ground enemies.
- **The Fan's damage is 0.5 a hit against `air`.** It's a token, and nothing should be tuned around
  it killing things.
- **A stuck fly is never pushed** (A, decision 4). A Fly Paper under a Fan's cone isn't a combo for
  the push, only for the Marked. That's correct, not a bug to tune around.

## Tests

**None new.** Keep `tests/content.spec.ts` true for night 18, in the same commit. A's and B's suites
are the regression net for everything you re-tune. `../../../analytic-docs/ARCHITECTURE.md` §7: a night
that plays badly isn't something a spec catches.

## Acceptance

- [ ] A Fan on a flyer lane visibly buys time and feels good to place.
- [ ] Fan spam does not trivialise night 18. Leave this unticked unless you played it with three
      Fans and watched the meter.
- [x] Night 18 is winnable with a line that answers air, and lost by one that doesn't.
- [x] `OPEN-QUESTIONS.md`'s pushback line says what play showed.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

Leave every judgement criterion unticked unless you actually sat and looked. The checkboxes are the
ledger of what has been confirmed.

## Do not

Change logic in `core/systems/`. The three constants' values and the defs' numbers are yours to
move, and nothing else is. Don't build the heatwave, any other modifier or the Floor map (step 21).
Don't author night 14 or the Mouse (step 19). Don't touch Mint Pot's numbers: it's post-v1, and
tuning it against a v1 night is tuning it against the wrong game. Don't add unlocks (step 20).
