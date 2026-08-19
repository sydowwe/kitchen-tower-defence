# Step 13 — The noise meter — **MILESTONE: Act I complete**

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, `../analytic-docs/DECISIONS.md` §8, `../analytic-docs/CONTENT.md` §1 (noise column), §8 (installations).
**Prereq:** step 12.

## Goal

Make power cost something. Every tower already carries a `noise` value and step 6 has been emitting it on every shot — now it accumulates, and when it fills, a human walks in.

This is the mechanic people describe to each other. Give it weight.

## Build

1. **The meter** (`core/systems/noise.ts`).
   - `world.noise`, 0 → `noiseCap` (default **100**, raised by installations and difficulty).
   - Towers add their `noise` value **per shot**. Aura and tile towers add `noise` per second while active.
   - Decays at **1.5/sec**, always, including between waves.
   - Track a per-night `peakNoise` and `wakeCount` for step 20's scoring.

2. **The wake event.** When noise reaches the cap:
   - Emit `HumanWoke`. Everything below is consequence, driven off that event.
   - **All enemies flee** — they reverse along their path at 2× speed and despawn at the spawn point. They are *not* killed and drop *no* crumbs. You keep the night.
   - **Every uncollected crumb on the board is forfeited** and removed.
   - **The current wave's unbanked income is forfeited.** This requires tracking income earned since the last wave boundary as a separate bankable pool — add that now.
   - **Every tower takes 20% of max HP** in damage. Towers at low HP die. This is where step 10's tower HP finally does something.
   - Noise resets to 0. The wave counter does **not** advance; the fled wave is simply gone, and the next wave proceeds normally.

3. **Counterplay** (`../analytic-docs/DECISIONS.md` §8 — without this, loud towers are a trap rather than a choice). Wire the hooks now, even though the installations themselves are bought in step 20:
   - `noiseCap` and `noiseDecay` read from a modifiers object on the world, populated from owned installations.
   - Close the Kitchen Door: cap +25. White-noise Machine: cap +30. Oil the Hinges: decay +0.5/s.
   - For testing before step 20 exists, expose them as dev toggles.

4. **Presentation — this deserves real effort.** The meter is the game's tension mechanic and it must be *felt*, not read:
   - A prominent meter in `TopBar` that changes colour and starts pulsing past 70%, with an audible-looking "creak" indicator near the top.
   - Every noisy shot puts a small ripple on the meter, so the player connects cause and effect immediately.
   - On wake: the screen washes to warm light (someone flipped the switch), the board desaturates, enemies scatter visibly, and a quiet card explains what it cost — *"You woke someone up. Lost: 340 crumbs, one Salt Shaker."* Understated, not a fail buzzer. This is the tone from `../analytic-docs/DECISIONS.md` §1.
   - Show the projected noise cost in the shop's stat card and in the placement ghost, so a player can anticipate rather than only react.

5. **Author nights 1–8 in full** and balance the noise curve across them. Night 3's Mousetrap (noise 2) and night 8's Toaster (noise 3) are the teachers: with default decay, a player spamming Mousetraps on night 6 should be able to wake a human — once — and learn from it without losing the night.

## Tests

- Noise accumulates per shot at exactly the def's value, and decays at exactly 1.5/sec.
- Reaching the cap emits exactly one `HumanWoke`, never two in consecutive ticks.
- After a wake: enemy count reaches 0 via fleeing, crumbs on board is 0, banked income is unchanged, unbanked income is 0, every tower is at 80% or less of max HP, and any tower below 20% is destroyed.
- Cap and decay modifiers apply correctly and stack additively.
- A wake during the inter-wave countdown doesn't skip or duplicate the next wave.

## Acceptance

- [ ] Waking a human hurts, is clearly your own fault, and does not end the night.
- [ ] Loud towers are a real decision — a Toaster-heavy air defence and a quiet ground line have visibly different noise profiles.
- [ ] Nights 1–8 are all winnable and all require different builds.

## **MILESTONE: Act I**

Nine towers, five enemies, statuses, flyers, barricades, upgrades, targeting, crumbs, noise. This is a complete-feeling tower defence game.

Play all eight nights start to finish before continuing. Check specifically: does difficulty rise smoothly, does each new tower feel like it opens something, and can you afford roughly 1.5 new towers per night? If income is off, fix it here — Act II content will only obscure the problem.
