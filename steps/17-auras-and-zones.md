# Step 17 — Auras, zone towers, bait

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, `../analytic-docs/CONTENT.md` §1 (Act II), step 14's tile API.
**Prereq:** step 16.

## Goal

Towers that don't fire: persistent radius effects, damaging tiles, and a tower whose job is to be attractive. Four towers, three small systems, and the last of Act II's mechanical vocabulary.

## Build

1. **`aura` behaviour.** A persistent radius that applies damage-per-second and/or a status to everything inside, with no targeting and no projectile. Ticks every N ticks (not every tick — 6 is plenty and it's a meaningful saving with several auras up), and routes damage through `resolveDamage` like everything else.

2. **Candle** (130, 4/s fire aura, radius 2, both targets, noise 0). Also a **light source** — reuse step 11's light registry, so a Candle pulls moths into a burning radius. That interaction is the tower's best moment; make sure the numbers reward discovering it. T3: burn stacks to 3.

3. **`tileEffect` behaviour** — a tower that continuously writes state to the tiles it covers.

4. **Gas Stove Burner** (200, 14/s, 1 tile, fire, ground, noise 2, **`path_only`**). Writes `heat` to its own track tile, refreshed while the tower lives. First real area denial: a single tile of track that hurts to cross. Because it's `path_only` it competes with the Cardboard Box for track tiles, which is a good tension.

5. **`charges` on a consumable tower** — the field exists from step 9's Sticky Tape.
   **Fly Paper** (35, 2 charges, air-only root, radius 2). Roots one flyer per charge until it dies; self-removes when spent. Cheap, disposable, and the correct panic button for a fly wave.

6. **`bait` behaviour** — the interesting one.
   **Honey Pot** (175, 7 crumbs/sec income, bait radius 3, ground).
   - Ground enemies within the radius are pulled toward it and **held**, their `distance` frozen while they feed, for `baitDurationTicks` (say 3s each) before resuming.
   - Implement the pull as step 11's lateral-offset trick — the enemy stays on its path, it just stops advancing and visually leans in. Do not give it free movement.
   - The Honey Pot has HP and enemies feeding on it **damage it**; it dies and is lost if you leave it undefended. High income, a free kill zone, and a real liability all at once — the tower most in tune with `../analytic-docs/DECISIONS.md` §4's "a dirty kitchen is a rich kitchen and a dangerous one".
   - Flyers ignore it.

7. **Wave authoring**: nights 10, 12, 14, 16 as the unlock nights. Night 16's "moving day" modifier (boxes consume 30% of build tiles) should make the compact, no-firing-arc auras genuinely attractive.

8. **Rendering.** Auras need a soft, non-distracting radius fill — several will be on screen at once, so keep them low-contrast and additive. The Burner's heated tile should look dangerous. The Honey Pot needs visible ants clustered on it and an obvious HP state, because a player who doesn't notice it's dying will be angry rather than instructed.

## Tests

- An aura ticking every 6 ticks deals exactly its per-second rate over 60 ticks.
- Aura damage routes through the matrix — a Candle against a `fungal` enemy deals 1.5×.
- The Burner's `heat` state persists while the tower lives and clears within one tick of it being sold.
- Fly Paper consumes exactly one charge per rooted flyer and self-removes at zero.
- A baited enemy's `distance` is frozen for exactly the bait duration, then resumes from that same distance with no jump.
- Enemies feeding on a Honey Pot reduce its HP; at 0 it is destroyed and every baited enemy releases in the same tick.
- Flyers are unaffected by bait.

## Acceptance

- [ ] A Candle plus a Nightlight is a discoverable and satisfying anti-moth combination.
- [ ] The Honey Pot is a real gamble — profitable when defended, a disaster when it isn't.
- [ ] Several auras on screen at once remain visually readable and cost nothing measurable in frame time.

## Do not

Add adjacency buffs (Sharpening Steel, Fridge Magnets — Act III). Auras affect *enemies* in v1, never other towers.
