# Step 17 — Auras, zone towers, bait

> This step is four sessions. Paste **one part file** into a fresh session, in order, and `/clear`
> between them. Do not paste this index. It only says what the parts are and how they fit.

**Prereq:** step 16, all three parts. This split was written against the repo at `5006027` (16C).

## Goal

Towers that don't fire: a persistent radius that burns, a tile of track that hurts to cross, a
disposable sheet that stops flyers, and a tower whose job is to be attractive. Four towers, two new
system slots, and the last of Act II's mechanical vocabulary.

## Parts

Each part names its own `Read first:` sections, so a session only loads the docs it needs.

| Part | Session | Builds |
| --- | --- | --- |
| [A](17-auras-and-zones/A-candle-burner-fly-paper.md) | The three quiet towers, headless | the `tileEffect` interpreter and the Burner's noise, a sold tower releasing its roots, one root per enemy, Candle, Gas Stove Burner and Fly Paper with their tiers |
| [B](17-auras-and-zones/B-the-honey-pot.md) | The Honey Pot, headless | `BaitBehaviour.durationTicks`, `Enemy.feeding` and `Enemy.fedAt`, `core/systems/bait.ts`, the pot's HP, the Honey Pot with its tiers |
| [C](17-auras-and-zones/C-cards-and-circles.md) | Reading the four on the HUD | card rows for `aura`, `tileEffect` and `bait`, placement circles, the tooltip's feeding line, the copy for all four |
| [D](17-auras-and-zones/D-on-screen-and-the-nights.md) | On the board, and the tuning pass | aura fills, a heated tile that shows under its own Burner, the pot's ants and HP, stuck flyers, re-tuning A's and B's numbers and nights 10, 12 and 16 |

Strictly in order. B could technically run before A, but both edit `sim.ts`, `tests/sim.spec.ts`,
`towers.ts` and the tower count in `tests/content.spec.ts`, and the part files are written assuming
A landed first. C's cards need all four defs. D can't judge a Burner, a feeding cluster or a
Candle's pull on a moth until they're drawn and carded.

**A and B carry every test the step file asked for.** They are headless and each one checks a
number that drifts silently. **C carries a few tests** over `statsFor` and the tooltip, following
the precedent `tests/viewModel.spec.ts` set in 16B. **D carries no behaviour tests**; it only keeps
`tests/content.spec.ts` true, per `../../analytic-docs/ARCHITECTURE.md` §7.

**Numbers are authored blind in A and B and re-tuned in D**, the way 16A's burrow fractions were:
every tier, the Burner's heat, the Fly Paper's cooldown, the Honey Pot's HP, and the three named
constants in `bait.ts`. The English goes the same way: A and B draft it because `type-check`
demands it, C rewrites it against the cards, and D re-reads it against the board. All four part
files say so.

## The seam that can't be split

**`Enemy.lateralOffsetTiles` has exactly one writer per enemy.** `light.ts` writes it for flyers,
and `bait.ts` writes it for everything on the floor. Both systems drift it toward a target every
tick, so a second writer doesn't crash: the two just fight, and the enemy jitters or never comes
back to its lane. The partition is `isFlyer`, and it holds because the one `light-drawn` enemy in
v1 flies. If a ground enemy ever becomes `light-drawn`, the partition moves first. Everything
downstream (the cluster D draws, C's tooltip line) reads `enemy.feeding` and never re-derives it
from distances.

## Contradictions this split resolved

Each is settled in the part that implements it, with the reason there.

1. **Item 7, "nights 10, 12, 14, 16 as the unlock nights"**: nights 10, 12 and 16 are already
   authored (11C, 15C, 16C), and 15C and 16C left notes inviting this step to re-tune 12 and 16.
   Night 14 is the Mouse's (step 19), unlocks are step 20's (`buildShop` sets `unlocked: true`),
   and "moving day" is a step 21 night modifier. D re-tunes 12 and 16 and checks 10. Nobody
   authors 14 or builds a modifier.
2. **"Heat clears within one tick of the Burner being sold"** vs `TILE_EFFECT_DEFS.heat`'s 2-second
   default and the 120/30 example in `tests/behaviours.spec.ts:88`. Either of those lingers for
   seconds. The Burner authors `durationTicks: 2, refreshIntervalTicks: 1` (A, decision 2).
3. **The Burner's noise 2**: the step is silent on it, and `noise.ts:136` hands "the per-second
   emitter" to this step. It becomes 2 per second *of burning something*, published as
   `towerFired` (A, decision 3).
4. **Fly Paper "self-removes at zero"** vs the Sticky Tape rule it inherits, which is to leave only
   once the last root ends. Reading it as "at zero charges" would release the flies it just
   stuck. Reading the code also turned up a latent step 10 bug: **selling a tape leaves its roots
   on forever**, because nothing releases an `untilSourceSpent` status when its source leaves the
   board. A fixes both (A, decisions 5 and 6).
5. **"Candle T3: burn stacks to 3"** can't mean capping a base burn, because a status application
   has no per-application stack cap. Burn's cap of 3 is on `STATUS_DEFS`. So the base Candle
   applies nothing, and T3 adds the burn (A, decision 1).
6. **"`baitDurationTicks`"** isn't a field, and `BaitBehaviour` has none. Bait gains
   `durationTicks`, a vocabulary field and not a special case. "Pulled toward it" with only a
   sideways offset means the enemy is held where the pot projects onto its lane, and it leans the
   perpendicular distance in (B, decisions 1 to 3).
7. **The step says the Candle needs no line in `aura.ts`**: true, but `statsFor` has no `aura`
   branch at all. A Candle's card would read "Lights up 2 tiles · silent" and nothing else (C).
8. **Item 5 cites "step 9's Sticky Tape"**: charges are step 10's (`core/systems/charges.ts`).

## Step acceptance

- [ ] A Candle plus a Nightlight is a discoverable and satisfying anti-moth combination.
- [ ] The Honey Pot is a real gamble: profitable when defended, a disaster when it isn't.
- [ ] Several auras on screen at once remain visually readable and cost nothing measurable in
      frame time.
- [ ] The four towers are config objects. The only new system files are `tileEffect.ts` and
      `bait.ts`. The only edits to existing systems are the two root fixes in A, the Burner's
      branch in `projectedNoisePerSecond`, and the two slots in `sim.ts` (`../../CLAUDE.md`,
      *Content is data, not classes*).
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Add adjacency buffs (Sharpening Steel, Fridge Magnets: Act III). Auras affect *enemies* in v1,
never other towers. Don't build night modifiers or "moving day" (step 21), unlocks (step 20), the
Fan (step 18), or night 14 and the Mouse (step 19). Don't build the lighting layer (step 23).
