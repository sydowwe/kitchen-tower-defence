# Step 19D — Night 14, and closing Act II

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/CONTENT.md` §6 (the night table, row 14, and
the lines under it) and §2 (the roster), and `../../analytic-docs/DECISIONS.md` §5 (night structure)
and §6 (food).
**Prereq:** steps 19A, 19B and 19C.

## Goal

This session closes step 19 and Act II. It authors night 14 in full, with the Mouse as its
mini-boss, and gives the Mouse a second appearance on night 17 now that the player has better tools.
Then it re-tunes the two numbers A drafted blind, the grab and the flight, until killing the Mouse
on its way out is the best moment in the game and letting it go is survivable but costly. The
campaign then has all eighteen nights, and the milestone below is played rather than ticked.

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/content/nights.ts` (`NIGHTS`) | Positional, and `GameView.vue` walks it by array position. **14 is missing on purpose.** The note above `NIGHTS` and the file header both say it's the Mouse's (step 19). `night13` is the template for 12 waves: `OPENING_TICKS` first, `8 * 60` countdowns, a new enemy introduced as two in wave 3, and a flyer-only wave. `night17` is the Silverfish night, and its note explains what it asks |
| `tests/content.spec.ts` (`nights 4 to 9`) | Pins every night's wave count and index as literals. Its comment says "14 is the Mouse's night (step 19)". The next test requires `mapId: 'counter'` and `pathId: 'crack'` everywhere |
| `tests/content.spec.ts` (`the Mouse`) | `is scheduled by no night yet` asserts no night carries a `mouse`. This step makes it false: it is replaced by the night-14 test below, not kept |
| `core/content/enemies.ts` (`mouse`) | 19A's draft `thief: { grabTicks: 90, fleeSpeedMult: 1.3 }`, and **values you may move**. HP, speed, reward and steals are CONTENT.md §2's row |
| `core/systems/spawn.ts` (`spawnDestroyPenalty`) | Buys extra enemies from the running wave's own entries, one of each affordable per round, at each enemy's `reward` |
| `ui/views/GameView.vue` | `SEED = 1234`. If `dev/night/NightPanel.vue` is in the tree (it was uncommitted when this was written), use it to jump straight to 14. Its header comment calls 14 and 18 documented gaps; neither is one after this step |
| `ui/locales/en.ts` | C's Mouse copy |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **Night 14 is on the Counter, single-lane, 12 waves, with no modifier, inserted between `night13`
   and `night15` in `NIGHTS`.** §6 puts it on the Table. The Table is step 21's map, and every night
   since 4 has made the same substitution (`createWorld` throws on an unknown `mapId`). Its Fly Paper
   unlock is step 20's. Rewrite the header, the note above `NIGHTS` and the spec comment, so none of
   them says 14 is missing.
2. **The Mouse arrives on its own terms.** It comes in a wave in the back half of the night, never
   wave 1, because C's warning needs a wave in front of it. Give it enough room that the grab and the
   whole flight are watched: a thin column ahead of it, or nothing. At most two Mice on night 14, one
   entry each: nightmare's `enemyCountMult` of 1.25 rounds a 2 to a 3, which is the Mold's lesson.
   The rest of the night is night 13 with more of everything, since §6 gives it no other new enemy.
3. **The second appearance is on night 17, not 18.** Night 18 is 18C's finale, tuned against the Fan,
   and a Mouse there reopens a judgement 18C closed. Night 17 teaches chemical against `armored`, and
   `mammal` takes chemical at 0.6, so the Mouse there is a check on exactly the answer the night
   teaches. That's the step's "genuine check on a chemical-heavy defence". One Mouse, in a wave that
   also carries Silverfish.
4. **Tune the grab and the flight first, and the Mouse's row never.** `grabTicks` decides whether the
   player notices in time. `fleeSpeedMult` decides whether the line gets a real second pass. The
   200 HP, 1.5 speed, 40 reward and 5 steals are the doc's; move one only with a CONTENT.md §2 edit in
   the same commit. Say in the commit which way each number moved and why.

## Build

### 1. Night 14, and the Mouse on night 17: `core/content/nights.ts`, `tests/content.spec.ts`

Decisions 1 to 3. Update both literal lists in `content.spec.ts` (the wave counts gain a 12, and the
indices gain a 14 between 13 and 15). Replace the Mouse's "is scheduled by no night yet" with
"introduces the Mouse on night 14 and nowhere earlier", following the Silverfish test.

Gotchas that will bite the authoring:

- **A lost Cookie Jar in a wave with a Mouse buys Mice.** `spawnDestroyPenalty` buys one of each
  affordable entry per round from a 200-crumb budget. With Ants, Roaches and a Mouse in the wave,
  that's three or four extra 200-HP thieves. Either keep the Mouse's wave light on cheap entries, or
  accept that losing a jar there costs Mice, and say which in the night's note. Never write a
  Mouse-only wave: that's five Mice for one jar.
- **The Mouse is also a wall.** `meleeDamagePerTick` is `hp / 10`, 20 a second, so it goes through a
  Cardboard Box fast in either direction. A box behind it on the way out is a delay, not a stop.
- **The Mouse holds the night open.** `resolve` wins a night only on an empty board, and a fleeing
  Mouse is on the board until it dies or escapes. A Mouse in the last wave makes the night's last
  seconds about it, which is either the best ending or a stall. Judge it.

### 2. Play it, then tune: `core/content/enemies.ts` (the two values)

Night 14 at 1× and 3×, and night 17, on two seeds (change `SEED` locally and **don't commit it**). A
throwaway headless harness is fine for comparing layouts, as 16C, 17D and 18C did. **Don't commit
it**, because the balance harness is step 22's. Then re-read C's copy against what the Mouse turned
out to be.

Gotchas that will bite the tuning:

- **The flight is `1.5 × 1.3` ≈ 1.95 tiles/s, about 16 s back across the `crack`'s 31.1 tiles**,
  slowed by whatever is stuck to it. A line that never touched it on the way in gets it again for
  the whole lane. That second pass is the mechanic, so tune for it and don't tune it away.
- **`FIRST` towers turn on a fleeing Mouse** (19A, decision 13). If a line ignores it, check the
  towers' targeting modes before touching a number.
- **Five items out of 22** (`18 + floor(14 / 3)`) is the escape's cost. It shouldn't end the night by
  itself, and it should hurt the summary.
- **`mammal` is 1.5× physical.** A Salt Shaker line that struggled with the Silverfish shreds the
  Mouse. Night 17's check only works if the line the night pushed you into is chemical-heavy, so
  play it with that line.

## Tests

**None new beyond `content.spec.ts`.** Keep it true for night 14 and the night-17 Mouse in the same
commit. A's, B's and C's suites are the regression net for everything you re-tune.
`../../analytic-docs/ARCHITECTURE.md` §7: a night that plays badly isn't something a spec catches.

## Acceptance

- [ ] Killing the Mouse on its way out, at the last moment, is the best feeling in the game.
- [ ] Letting it escape with five items on night 14 is survivable but clearly costly.
- [ ] Dropped food is impossible to miss.
- [ ] On night 17, a chemical-heavy line feels the Mouse.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

Leave every judgement criterion unticked unless you actually sat and looked. The checkboxes are the
ledger of what has been confirmed.

## Milestone: Act II

This session ends the content for v1. Before closing, hand over this list. It's for the human, and
no session can tick it:

1. Play nights 1 to 18 end to end, twice, on Normal: once your own way, once deliberately with a
   different core line.
2. Is every new enemy from night 8 onward a *question* you had to answer, or a number you
   out-built?
3. Does any tower never earn its slot? Does any night never make you rebuild?
4. Is the noise meter a decision by night 18, or a bar you ignore?
5. Does the Mouse's night feel like a set piece, or like a big ant?
6. What is not fun *now*? Write it down. Steps 20–23 frame the game, and they will not fix it.

## Do not

Change logic in `core/systems/`. The two thief values and the nights are yours to move, and nothing
else is. Don't build the Table, night modifiers or multi-lane nights (step 21), unlocks or
installations (step 20), or audio (step 23). Don't touch night 18 (18C's).
