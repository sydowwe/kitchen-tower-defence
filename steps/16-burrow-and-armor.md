# Step 16 — Burrowing and armor

> This step is three sessions. Paste **one part file** into a fresh session, in order, and `/clear`
> between them. Do not paste this index. It only says what the parts are and how they fit.

**Prereq:** step 15, **all three parts**. This split was written against the repo at 15B; 15C had
not been built. 15C edits `core/content/nights.ts`, `render/layers/entities.ts`,
`render/layers/tileEffects.ts` and the night lists in `tests/content.spec.ts`, and each part below
says where it expects to find 15C's work.

## Goal

Two enemies that each break one assumption: "I can always shoot it" and "damage is damage". Each
comes with the tower that answers it. Both answers are *suppression* rather than raw power, which is
the shape Act II is teaching. The player also gets a way to *learn* the damage matrix without a
menu: an enemy tooltip and damage numbers coloured by effectiveness.

## Parts

Each part names its own `Read first:` sections, so a session only loads the docs it needs.

| Part | Session | Builds |
| --- | --- | --- |
| [A](16-burrow-and-armor/A-burrow-armor-and-their-answers.md) | The whole simulation half | the `burrowed` flag, `Enemy.burrowWindow`, `core/systems/burrow.ts`, the `suppress` interpreter, the floor predicate, Weevil, Silverfish, Bay Leaf and Lemon with their tiers |
| [B](16-burrow-and-armor/B-learning-the-matrix.md) | Making the matrix readable | `enemyDamaged.multiplier`, `effectivenessOf`, colour-coded damage numbers, the enemy tooltip, the Bay Leaf's card row and placement circle |
| [C](16-burrow-and-armor/C-on-screen-and-the-nights.md) | Burrow and armor on screen, and nights 13, 16, 17 | the mound and dust trail, the dive and surfacing puffs, the plating and its cracks, three nights, the tuning pass |

The parts run strictly in order. B's tooltip and coloured numbers need A's Silverfish and Lemon to
show a 0.4× and a 0.7× at all. C can't judge a burrow window, a Bay Leaf radius or night 17 until
the mound is drawn and the tooltip exists.

**A carries every test the step file asked for.** Those tests are all headless, and each one checks
a number that can drift silently. **B carries a few tests** over its two pure seams, the event's
multiplier and the tooltip view model; `tests/viewModel.spec.ts` sets that precedent. **C carries
no behaviour tests.** It only keeps `tests/content.spec.ts`'s night lists true, per
`../analytic-docs/ARCHITECTURE.md` §7.

**Some numbers are authored blind in A and re-tuned in C**, the way 15A's spread interval was: the
Weevil's burrow-window fractions, the Bay Leaf's radius and tiers, and the Lemon's tiers. The
English for the four new defs goes the same way: A drafts it because `type-check` demands it, B
rewrites it against the tooltip and the card, and C re-reads it against the board. All three part
files say so. That way A doesn't polish numbers it can't see, and C isn't reluctant to move them.

## The seam that can't be split

**`enemy.flags.burrowed`, written only by `burrowSystem`.** Targeting, the floor predicate, the
tooltip and the mound all read that flag. None of them re-derives burrowing from
`burrowWindow` and `distance`. That derivation ignores the Bay Leaf, so it would be wrong exactly
where the player is looking. If this line moves (say the renderer starts computing "is it inside
its window"), B's tooltip and C's mound disagree with the simulation inside every Bay Leaf radius.

## Contradictions this split resolved

Each is settled in the part that implements it, with the reason:

1. **The step calls `untargetable` the burrow flag. The wake already owns `untargetable`**
   (`core/systems/noise.ts:69`). A burrow system that rewrote it every tick would clear the wake's
   flag and let towers shoot fleeing enemies. Burrowing gets its own `burrowed` flag, and
   `isTargetable` gains one term. Step 11's seam holds (A, decision 1).
2. **"Reuses step 11's targetable predicate"**: true for targeting, but tile effects and barricades
   deliberately ask a *different* question, `isFlyer`, about the floor. Burrowing changes that
   answer too, so the two floor readers move to one new `isOnFloor`. `isFlyer`'s own docstring
   foresaw this (A, decision 2).
3. **"Verify Armor Strip composes multiplicatively"**: it already does
   (`core/content/matrix.ts:79`). Nothing gets fixed. A only adds the end-to-end tests.
4. **"Night 17 is beatable by stacking cold damage"**: the only cold tower does 2 damage a hit, so
   cold alone costs three or four trays per Silverfish. The real non-physical route is chemical
   plus cold, both at ≥1.0× against `armored` (C, decision 7).
5. **Bay Leaf and Lemon need three tiers each** (`checkUpgradeTiers`), and `CONTENT.md` names
   neither tier 3. A authors both and writes them into the doc.

## Step acceptance

- [ ] Night 13 punishes a defence concentrated entirely at the start of the track.
- [ ] Night 17 can't be won with physical damage alone, and can be won two different ways.
- [ ] Colour-coded damage numbers make "this isn't working" obvious without opening a menu.
- [ ] Adding the Weevil, Silverfish, Bay Leaf and Lemon required **no new behaviour kind**. The
      only new system file is `burrow.ts`, plus the `suppress.ts` query it calls. Armor needed
      no system change at all (`../CLAUDE.md`, *Content is data, not classes*).
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Add new tile effects or new aura *systems*. This step adds two enemies, two towers and one general
suppression behaviour. Don't build the codex (step 23), night modifiers (step 21), unlocks
(step 20) or the Honey Pot (step 17). Don't author night 14 (the Mouse, step 19) or night 18 (the
Fan, step 18).
