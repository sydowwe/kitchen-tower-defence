# Step 16 — Burrowing and armor

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, `../analytic-docs/CONTENT.md` §2–4.
**Prereq:** step 15.

## Goal

Two enemies that break a specific assumption each — "I can always shoot it" and "damage is damage" — plus the towers that answer them. Both answers are *suppression* rather than raw power, which is the shape Act II is teaching.

## Build

1. **Burrowing** (`untargetable` flag on the enemy).
   - **Weevil** (night 13, 30 HP, speed 1.0, `ground, burrows, bug`).
   - Each Weevil rolls a burrow window at spawn from `world.rng`: a start distance and a length along the track (say 25–40% of total length, beginning somewhere in the first third). While inside that window it is `burrowed`: untargetable, immune to tile effects, and unaffected by barricades — it goes *under* your first defensive line, which is the entire point.
   - It surfaces at the end of its window and is normal thereafter. Surfacing must be visually obvious — dirt puff, a moment of vulnerability.
   - This reuses step 11's `targetable` predicate. **If it needs a new mechanism, step 11's seam was cut in the wrong place** — fix the seam.

2. **Bay Leaf** (160, no damage, radius 3, `SUPPRESSION`). Inside its radius, burrowing is suppressed: a burrowed Weevil entering the radius surfaces immediately and stays surfaced while inside. Build `suppress` as a **general behaviour keyed by ability name** (`'burrow'`), not a Weevil-specific check — Act III's Bay Leaf variants and several other suppressions reuse it.

3. **Armor**.
   - **Silverfish** (night 17, 110 HP, speed 0.6, `ground, armored, bug`). No new mechanics — the `armored` matrix row (0.4× physical, 1.2× cold) does all the work. This is the game's "ceramic bloon" and it should make a pure-physical build fail loudly.
   - **Lemon** (155, 8 damage, 0.9/sec, range 3, chemical, both) applies **Armor Strip**: the `armored` multiplier moves halfway toward 1.0 for 4s, so physical goes 0.4 → 0.7. Step 2 defined this; verify it actually composes with the multiplicative tag stacking rather than being applied afterward as a flat modifier — they give different numbers and only one is correct.

4. **Wave authoring**: nights 13, 16, 17. Night 17 should be beatable two ways — stack cold damage, or bring Lemon and keep your existing physical line — so the counter system reads as *options*, not a lock and key.

5. **UI.** The player needs to be able to *learn* the matrix, so surface it:
   - Enemy tooltips (hover an enemy on the board) show HP, tags, and its damage-type multipliers as a compact row of icons.
   - Damage numbers are colour-coded by effectiveness: dull for <1.0×, normal for 1.0×, bright for >1.0×. This single touch teaches the entire counter system without a tutorial.

6. **Rendering.** Burrowed enemies show as a moving mound with a dust trail — present, clearly untargetable, and clearly *coming*. Armored enemies get a visible plating cue, and Armor Strip visibly cracks it.

## Tests

- A burrowed Weevil is skipped by targeting, takes no tile damage, and passes barricades.
- Burrow windows are deterministic under a fixed seed.
- A burrowed Weevil entering a Bay Leaf radius becomes targetable in the same tick, and stays surfaced while inside.
- The `suppress` behaviour keyed to a different ability name has no effect on burrowing — proving it's general.
- Silverfish takes exactly 0.4× physical; under Armor Strip, exactly 0.7×; and the strip composes multiplicatively with `bug` and any other tag rather than replacing the product.

## Acceptance

- [ ] Night 13 punishes a defence concentrated entirely at the start of the track.
- [ ] Night 17 is unwinnable with physical damage alone and winnable two different ways with it.
- [ ] Colour-coded damage numbers make "this isn't working" obvious without opening a menu.

## Do not

Add new tile effects or auras. Two enemies, two towers, one general suppression behaviour.
