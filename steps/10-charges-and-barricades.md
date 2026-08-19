# Step 10 — Charge states, tower HP, barricades

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, `../analytic-docs/DECISIONS.md` §3 (the Cardboard Box redesign) and §9 (why tower HP ships now).
**Prereq:** step 9.

## Goal

Two towers that aren't turrets: one that must be re-armed, and one that enemies attack instead of walking past. Both introduce state machines that later content reuses heavily.

## Build

1. **Charge / rearm state machine.** A `charge` behaviour with an explicit state field on the tower: `armed → firing → rearming(duration) → armed`. Generic, not mousetrap-specific — the state, its remaining duration, and its visual must all come from config. Towers in `rearming` are skipped by targeting entirely.

2. **Mousetrap** (90, 60 damage, 0.15/sec effective, range 1, physical, ground, noise 2). Rearm 6.6s. Defaults to `STRONGEST` targeting. It should feel like a decision — an enormous single hit you spend, then a long anxious wait. Make the armed/unarmed states unmistakable at a glance (🪤 vs a flattened, greyed variant), because misreading it is the difference between a held line and a leak.

3. **Tower HP.** Every tower already carries `maxHp` from step 2; make it real:
   - `hp`, damage application, destruction, and a `TowerDestroyed` event.
   - HP bar rendered only when damaged.
   - Repair is **not** a v1 feature — a destroyed tower is gone and you rebuild it.
   - Nothing damages towers yet except step 13's noise penalty and the Cardboard Box being chewed. The wasps and termites that make this system matter arrive in Act III; you are laying the rail now so that step doesn't require a refactor.

4. **Cardboard Box barricade** (25 crumbs, 200 HP, **`path_only`**):
   - Occupies a track tile and blocks it. Enemies whose `distance` would carry them past the box's arc position instead **stop and attack it**, dealing their `meleeDamage` (add this field to `EnemyDef`, default `hp / 10` per second, tuned per enemy) until it dies.
   - While blocked, enemies stack up behind it — a free kill zone, which is the entire point of the tower.
   - Flyers ignore it completely.
   - On destruction the tile clears and the queue moves on.
   - **Edge case that will bite you:** an enemy already past the box's arc position when it is placed must not teleport backwards or get stuck. Only enemies with `distance < boxDistance` are ever blocked.

5. **Cookie Jar penalty.** Finish the step 6 `TODO`: on `TowerDestroyed` for a Cookie Jar, the enemy side gains 200 crumbs — spawn an immediate wave-strength boost or a burst of extra spawns (pick one and document it in `../analytic-docs/DECISIONS.md`). High income, real risk.

6. **Rendering.** Enemies attacking a box need an obvious attack animation and the box needs visible damage states (crisp → dented → collapsing). A queue of forty ants chewing a box is one of the game's best images — make it read.

## Tests

- A rearming Mousetrap is never selected as a firing tower and never consumes a target.
- Rearm duration is exact in ticks and unaffected by speed multiplier.
- An enemy at `distance = boxDistance - 0.1` is blocked; one at `boxDistance + 0.1` is not.
- Destroying the box releases every blocked enemy in the same tick, and they resume from their held distance without a jump.
- A flyer passes the box unimpeded.
- Selling a box mid-chew releases the queue cleanly.

## Acceptance

- [ ] A Cardboard Box plus two Salt Shakers holds night 6's opening waves in a way neither does alone.
- [ ] The Mousetrap's armed state is unambiguous at 3× speed from across the room.
- [ ] Placing and selling barricades under load produces no stuck or teleporting enemies.

## Do not

Add tower repair, tower-attacking enemies, or the noise meter. Barricade and charge machinery only.
