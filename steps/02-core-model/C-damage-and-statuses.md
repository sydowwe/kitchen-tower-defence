# Step 2C — Damage matrix and status effects

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, `../../analytic-docs/CONTENT.md` §3–4.
**Prereq:** step 2A. (Independent of 2B.)

## Goal

The two pure files the whole difficulty curve lives in: the damage-type × tag table every damage
source routes through, and the seven status effects with their stacking rules. Both are arithmetic
and bookkeeping — nothing here touches the world.

## Build

### 1. `core/content/matrix.ts`

The full damage-type × tag table from `../../analytic-docs/CONTENT.md` §3, transcribed exactly.

`resolveDamage(base, damageType, enemy): number` — applies **multiplicative** tag stacking, then
status modifiers. Pure: no world, no rng, no mutation of the enemy.

Gotchas:

- An enemy with two tags gets the **product** of both multipliers, not the average, the max, or the
  first match. This is the single most likely thing in the codebase to silently drift.
- A tag with no entry for a damage type is `1.0`, and that must be a real lookup default rather than
  an `undefined` that turns the result into `NaN`.
- Status modifiers apply *after* the tag product — except armor strip, which changes the tag
  multiplier itself. See below.

### 2. `core/content/statuses.ts`

The seven effects from `../../analytic-docs/CONTENT.md` §4, each with its stacking rule declared as
data on the status def (`stack: 'refresh' | 'stackTo(n)' | …`) rather than as a branch inside
`applyStatus`.

`applyStatus(enemy, status)`, `tickStatuses(enemy)`, `speedMultiplier(enemy)`,
`damageTakenMultiplier(enemy)`.

Gotchas:

- Durations are **tick counts**. `tickStatuses` decrements by 1 per tick and drops at 0; a status
  applied and expiring in the same tick must not deal a phantom extra tick of damage.
- Freeze suppresses slow *re-application* — the rule is about what `applyStatus` refuses while
  frozen, not about what `speedMultiplier` returns.
- Armor strip changes the enemy's `armored` tag multiplier, so it belongs on the tag side of
  `resolveDamage`, not the status-modifier side. Wire it deliberately — this is why the two files
  are built together, and step 16 comes back to check it.
- `speedMultiplier` and `damageTakenMultiplier` are pure reads over `enemy.statuses` — no cached
  field on the enemy that some system forgets to recompute.

## Tests

**Matrix**

- A `swarm` + `bug` ant takes 1.5× chemical.
- A hypothetical `armored` + `slime` enemy takes `0.4 × 1.0` physical and `1.0 × 1.5` chemical —
  **assert the multiplication explicitly**, with the two factors written out in the test.
- A tagless enemy takes exactly `base` for every damage type.
- `resolveDamage` does not mutate the enemy it was passed (deep-equal before and after).

**Statuses**

- Burn stacks to exactly 3 and no further; a fourth application refreshes duration without a 4th stack.
- Slow refreshes rather than stacking — two applications leave one status with the full duration.
- Freeze suppresses slow re-application while active, and slow can be applied again once it expires.
- Armor strip moves `armored` physical from 0.4 to 0.7, asserted **through `resolveDamage`**.
- A status with 1 tick remaining ticks exactly once more, then is gone.

## Acceptance

- [ ] Both files are pure and import only `core/types.ts`.
- [ ] The matrix reads like the doc — someone can diff the two by eye in ten seconds.
- [ ] Adding an eighth status is a config entry plus (at most) one new stacking rule, with no change
      to `applyStatus`'s control flow.
- [ ] `speedMultiplier` of an unafflicted enemy is exactly `1`, not `0.9999…`.

## Do not

Apply damage, kill anything, or emit events — step 6 owns dealing damage. Do not apply statuses from
anything; no source emits them until step 9. Do not implement per-tick burn *damage* delivery; this
file owns the bookkeeping, the combat system owns the hit.
