# Step 19 — Food theft and the Mouse — **MILESTONE: Act II complete**

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, `../analytic-docs/DECISIONS.md` §6, `../analytic-docs/CONTENT.md` §2, §7.
**Prereq:** step 18.

## Goal

An enemy with a *goal state*. Everything so far walks one direction until it dies or reaches the fridge. The Mouse reaches the fridge, takes something, turns around, and runs — and if it gets out, that item is gone for the night.

This is the most dramatic thing in the game. It's also the system that Act III's Squirrel, Pigeon and Raccoon all inherit, so build it general.

## Build

1. **Thief state machine** (`core/systems/theft.ts`). A `thief` behaviour on the enemy def with an explicit state:
   `approaching → grabbing(duration) → fleeing → escaped`
   - **approaching**: normal movement toward the fridge.
   - **grabbing**: on arrival, pause for `grabDurationTicks` (1.5s — a real window of vulnerability, and the moment the player has to notice), then take `steals` items **by name** into `enemy.carrying[]`. The items leave the fridge display immediately.
   - **fleeing**: `distance` decreases at `fleeSpeed` (Mouse: 1.5 × 1.3). Barricades block it in reverse. Towers still shoot it. Pushback now *helps you* — pushing a fleeing thief shoves it back toward the fridge and your guns.
   - **escaped**: reaching `distance <= 0` despawns it and the carried items are **permanently lost for the night**.
   - **Killed while carrying**: every carried item drops at the death position as a physical pickup. Walking food — the player clicks it, or a tower with `collectRadius` retrieves it, and it returns to the fridge. Uncollected dropped food is lost at night end.

2. **Mouse** (night 14, 200 HP, speed 1.5, reward 40, steals 5, `ground, thief, mammal`).
   - `mammal` takes **1.5× physical and 0.6× chemical** — the inverse of most of what Act II has taught you to build, so the Mouse is a genuine check on a chemical-heavy defence.
   - 200 HP against night-14 towers is a real fight. It should not die on the approach unless the player has prepared for it.
   - Announce it: a wave banner, a distinct sound, and a "Mouse incoming" warning one wave ahead. It's a mini-boss and it should feel like one.

3. **Fridge as a place.** The theft moment needs to be visible and specific:
   - Food items are rendered on shelves; the Mouse visibly takes named items off them.
   - Carried items ride on the thief — you can *see* your pizza slice leaving.
   - Dropped items lie on the track glowing gently until collected.
   - The night-end summary lists what escaped, by name.

4. **Retroactive check on ordinary leaks.** Non-thieves still consume `steals` items on contact and despawn — that's unchanged. But make sure both paths share the *same* food-removal code, so the Better Tupperware installation (step 20, `steals` −1) applies to both without a special case.

5. **Wave authoring**: night 14 in full, plus a second Mouse appearance in night 17 or 18 now that the player has better tools.

6. **Rendering.** The flee is the best sequence in the game — a mouse sprinting back down the track with a cheese wedge while every tower you own fires at it. Give it real motion, a trail, and let the camera-less board carry it with animation quality rather than effects.

## Tests

- A thief reaching the fridge enters `grabbing`, and takes items only after the full duration — killing it during the grab yields zero loss.
- A fleeing thief's `distance` decreases and it is blocked by barricades in reverse.
- Killed while carrying 3 items → exactly 3 pickups at the death position; collecting them returns exactly those named items to the fridge.
- Escaping removes those items permanently for the night, and the summary names them.
- Pushback applied to a fleeing thief increases its distance (pushes it back toward the fridge) rather than helping it escape — assert the sign.
- Better Tupperware's `steals −1` applies identically to an ant and to the Mouse.

## Acceptance

- [ ] Killing the Mouse on its way out, at the last moment, is the best feeling in the game.
- [ ] Letting it escape with five items on night 14 is survivable but clearly costly.
- [ ] Dropped food is impossible to miss.

## **MILESTONE: Act II — the game is content-complete for v1**

19 towers, 11 enemies, nights 1–18. Status effects, cones, auras, tile state, barricades, charges, flyers, light, burrowing, armor, bait, pushback, noise, theft.

Play the campaign end to end at least twice before starting Phase 4. What's left is the frame around the game — metagame, maps, modes, balance, polish — not the game itself. Anything that isn't fun *now* will not be fixed by any of it.
