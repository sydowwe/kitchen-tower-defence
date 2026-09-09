# Step 11A — Air as a real layer, and the tower that answers it

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../../CLAUDE.md`, `../../../analytic-docs/CONTENT.md` §1 (the Act I table — the Toaster
row), §2 (the Fly row and the note under the table about the Fruit Fly), §3 (the `air` row of the
matrix) and §6 (nights 8 and 9), `../../../analytic-docs/OPEN-QUESTIONS.md`, "The fruit fly gap".
**Prereq:** step 10, all three parts.

## Goal

The `air` tag becomes a wall instead of a label. One exported predicate for "is this thing off the
floor", both directions of the air filter asserted end to end, and the first two defs that make the
distinction matter: the Fly, which nothing on the board can touch until you buy the Toaster, and the
Toaster, which can touch nothing else. Entirely headless — nothing about a flyer looks any different
on screen until 11C.

## Already in the repo

Most of this step's mechanical work is already done. These are the files you edit rather than create.

| File | What's there now |
| --- | --- |
| `core/systems/targeting.ts:27` | `isTargetable(enemy, targets)` — reads `flags.hidden`, `flags.untargetable`, then `tags.includes('air')` against the `TargetClass`. Its doc comment already says "Step 11's flyers … extend this function rather than six call sites". |
| `core/systems/barricades.ts:82` | `isFlyer(enemy)` — private, `tags.includes('air')`, with a four-line comment on why it is **not** `isTargetable`. `nearestAhead` returns null for one, so flyers already walk through boxes. |
| `core/systems/combat.ts:88, 109` | `dealSplashDamage` and `fireCone` both filter through `isTargetable(candidate, behaviour.targets)`. Nothing else re-asks the question. |
| `core/types.ts:262` | `Projectile.targets` — carried off the firing behaviour on purpose, so an air-only splash cannot catch ground enemies after its tower is sold. |
| `core/content/enemies.ts` | `ant`, `roach`, `beetle`, `fruitFly`. `tilesPerSecond()` and `damagePerSecond()` are the two converters; `ENEMIES` is appended to, never reordered. |
| `core/content/towers.ts` | eight defs, `perSecond()`, and `TOWERS` — **appended, never reordered**: the shop prints `index + 1` on each button. |
| `core/content/nights.ts` | `night01`–`night07`, all `mapId: 'counter'`, all on the lane `'crack'`. The header explains why the spawn window is authored against the crossing time and not the wave count; read it before authoring. |
| `core/systems/tiles.ts` | a four-line stub with an empty body. Step 14 owns it. |
| `ui/locales/en.ts` + `contentKeys.ts` | `TowerMessages` / `EnemyMessages` are `Record<id, Entry>` derived from `TOWERS` / `ENEMIES`, so a def without an English entry is a **type error**, not a runtime key on screen. |

**The specs that will break:**

- `tests/content.spec.ts:363` — `expect(NIGHTS.map(night => night.waves.length)).toEqual([6, 7, 8, 8, 9, 9, 10])`
- `tests/content.spec.ts:364` — `expect(NIGHTS.map(night => night.index)).toEqual([1, 2, 3, 4, 5, 6, 7])`
- `tests/content.spec.ts:395` — "schedules only enemies the roster has", which passes once `fly` is in `ENEMIES`
- `tests/content.spec.ts:448` — "the Fruit Fly is scheduled by no night in v1". `fly` and `fruitFly`
  are **two different defs**; leave that assertion true and do not schedule `fruitFly`.
- `tests/combat.spec.ts:188` — registers synthetic towers and removes them with
  `TOWERS.splice(TOWERS.length - REGISTERED.length, REGISTERED.length)`. Appending real towers at
  module scope is safe; inserting one mid-array is not.

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **`isFlyer` moves to `core/systems/targeting.ts`**, exported, beside `isTargetable`;
   `barricades.ts` imports it and its private copy goes. That file's header already claims to be the
   one place the roster is asked what it may be shot at, and three more readers are coming: step 14's
   tile effects, step 17's auras, step 18's pushback. **Carry the existing comment across verbatim** —
   the reason `isFlyer` is `tags.includes('air')` and not `isTargetable` is that a `hidden` Weevil
   must still be stopped by a Cardboard Box, and the version that loses that comment is the version
   step 16 quietly re-merges.
2. **The step's "flyers ignore tile effects — add the check now" is not built.** `tilesSystem` is an
   empty stub; there is nothing to add a check to. Decision 1 is what that bullet is worth — one
   predicate, so step 14 opens with `if (isFlyer(enemy)) continue` instead of inventing a second
   answer. Correct the bullet in `../11-flyers.md` if you touch it; the index already records it.
3. **The Fly's tags are `['air', 'bug']`** — `../../../analytic-docs/CONTENT.md` §2, exactly. **Not
   `swarm`.** The Fruit Fly has `swarm` and the Fly does not, and that is the whole difference in how
   the two take a Toaster shot: §3's matrix gives `air` ×1.2 to fire and `swarm` another ×1.5 on top.
4. **`meleeDamagePerTick` is authored for the Fly anyway**, at `hp / 10` per second like every other
   enemy, and marked as never read — a flyer is never held at a barricade. The field is required by
   the schema on purpose (a default of 0 is an enemy that stands at a box forever), and the Fruit Fly
   above it carries the same comment.
5. **The Toaster's id is `toaster` and its glyph is 🔥**, both straight from §1. It sits in the shop
   two rows under `toasterCrumbTray`; that is C's problem to look at, not a reason to rename either.
6. **`role: 'BURST_DPS'` and `defaultTargetingMode: 'STRONGEST'`** — §1 gives the role and §5 gives
   `STRONGEST` for burst towers.
7. **`projectileSpeed: 0.12`, authored blind and re-tuned in 11C.** There is no column for it in §1.
   The Salt Shaker's 0.1 was authored at 0.2 in 6B and halved in 6C by watching a grain cross; a
   toaster launching something upward at range 4 has further to go and no reason to be faster. Pin it
   in `tests/content.spec.ts` alongside the rest of the row, the way the Salt Shaker's is.
8. **`splashRadiusTiles` stays 0.** §1's Toaster T3 is "fires two projectiles", not splash, and
   upgrades are step 12's.
9. **Nights 8 and 9 are authored on the Counter**, on the `'crack'` lane, with the same comment
   nights 4–7 carry. §6 puts them in the Pantry; the Pantry does not exist and `createWorld` throws
   on a night whose `mapId` is not the map it was handed. Wave counts are §6's: **10 and 10**.
10. **Night 9 introduces no enemy.** §6 gives it the Nightlight unlock and nothing else, and unlocks
    are step 20's. It is night 8 with more of everything — which is the honest content for a night
    whose job is to let the fly pressure settle before the Moth.

## Build

### 1. `isFlyer`, and the air filter end to end (`core/systems/targeting.ts`, `barricades.ts`)

Decision 1. Then read `isTargetable` again and satisfy yourself that both directions hold, because
the tests below are the only thing that will ever check the second one: a `targets: 'ground'`
behaviour must skip `air`, and a `targets: 'air'` behaviour must skip everything else. Today no
content exercises the second direction at all, which is exactly why it is worth an assertion.

Nothing else in `core/` re-asks the question — `dealSplashDamage`, `fireCone` and `pickTarget` all
route through the one predicate, and `Projectile.targets` carries the class onto the shot. Do not add
a fourth check anywhere.

### 2. The Fly (`core/content/enemies.ts`)

§2, night 8: 14 HP, 2.2 tiles/sec, 6 crumbs, steals 1, `air bug`. `speedTilesPerTick` is
`tilesPerSecond(2.2)` = 0.0367 — the schema's `max(0.5)` on that field exists precisely to reject the
2.2, and its comment already names the Fly as the fastest thing in v1.

Worth writing into the def's comment, because it is what makes night 8 work: a Toaster shot resolves
to 35 × 1.2 = 42 against `air`, which one-shots a Fly, a Moth and a Fruit Fly alike. The Toaster's
scarcity is its 0.3/sec rate and its range-4 circle, never its damage.

### 3. The Toaster (`core/content/towers.ts`, appended to `TOWERS`)

§1, Act I: 140 crumbs, 35 damage, 0.3/sec, range 4, fire, **air only**, noise 3, `off_path`.
`cooldownTicks` is `perSecond(0.3)` = 200, comfortably under the schema's `MAX_COOLDOWN_TICKS` of
600. `maxHp: 100`, the non-wall precedent. Plus decisions 5–8.

`noise: 3` is the highest in the game and nothing consumes it yet — `combatSystem` already publishes
`towerFired` with the def's noise on it and step 13 is what reads it. Author the number; do not build
a meter.

### 4. Nights 8 and 9 (`core/content/nights.ts`)

Ten waves each, per decision 9, authored the way the file's header describes: **the spawn window
against the crossing, not the wave count.** An Ant crosses the `crack`'s 31.1 tiles in ~31s, a Roach
in ~17s, a Beetle in ~44s, and a Fly in **~14s** — the shortest window any tower has ever had, which
is what makes a range-4 circle on the wrong side of the board worth nothing.

The one wave the step is specific about: **night 8 needs a wave that is nothing but flies, called
while ground pressure is still walking.** Waves overlap by design
(`../../../analytic-docs/DECISIONS.md` §5), so this is a mid-night wave whose `entries` contain only
`fly` — the previous wave's ants and beetles are still crossing when it lands, and a board of
ground-only towers watches all of it go past. Put it late enough that the player has had two waves'
worth of crumbs to react with, and follow it with a mixed wave rather than another pure one.

Gotcha, and it is the reason to check the whole night rather than the one wave: `spawnDestroyPenalty`
buys extra enemies **from the running wave's own composition**. A Cookie Jar destroyed during a
flies-only wave therefore buys flies, at 6 crumbs each — 33 of them for the jar's 200. That is
correct behaviour and it is also the most expensive mistake available on night 8; the flies-only wave
is a bad place to also be the wave with the most ground pressure.

These are a draft. 11C watches a night at 1× and 3× and re-tunes them, the way 5C tuned nights 1–3
and 9C tuned 4–7. Do not spend this session making them feel right — you have nothing to feel them
with.

### 5. The English, and the specs (`ui/locales/en.ts`, `tests/content.spec.ts`)

One entry each for `fly` and `toaster`, or the build fails at `contentKeys.ts` rather than on screen.
Write them plainly; 11C revises both against the cards it can finally see, the way 10C revised the
Mousetrap's and the Cardboard Box's.

Then the two night assertions above: `[6, 7, 8, 8, 9, 9, 10, 10, 10]` and `[1 … 9]`.

## Tests

- A `targets: 'ground'` tower with **only** a flyer in range fires **zero** times over 600 ticks —
  count `towerFired` events, not damage, so a tower that aims and cannot hurt anything still fails.
- The mirror: a `targets: 'air'` tower with only ground enemies in range fires zero times over 600
  ticks. This is the direction nothing else in the codebase covers.
- `pickTarget` for an air-only reach over a board holding one Fly and five Ants returns the Fly, and
  for a ground-only reach over the same board never returns it.
- A Toaster shot on a Fly resolves through `resolveDamage` to 42 — the matrix's `air` ×1.2 on 35 —
  and to 63 on a Fruit Fly, whose `swarm` multiplies again. Assert the product end to end, the way
  `tests/content.spec.ts` already asserts the Ant's.
- A Fly walking into a Cardboard Box's tile is never held: its `distance` after 300 ticks equals its
  unobstructed distance, while an Ant released beside it stops. `barricadesSystem` already does this;
  the assertion is what stops decision 1's refactor breaking it silently.
- The Toaster row and the Fly row against `../../../analytic-docs/CONTENT.md`, every number literal,
  including `projectileSpeed` and the tick conversions — the same shape as the Salt Shaker's and the
  Beetle's blocks in `tests/content.spec.ts`.
- Nights 8 and 9 are on `'counter'` and on a lane the Counter has, and night 8 has at least one wave
  whose entries are all `fly`.

## Acceptance

- [x] `isFlyer` has exactly one definition in the codebase, and `grep "includes('air')"` finds it and
      nothing else. `isTargetable` now asks `isFlyer` rather than repeating the tag test, so `src/`
      carries the string once; the one other hit is a lambda in `tests/hitbox.spec.ts` whose whole
      point is that `cone` passes an arbitrary filter through.
- [x] Adding the Toaster required **zero** changes in `core/systems/` — it is a def in
      `core/content/towers.ts` and an entry in `en.ts`. If it did not, the behaviour composition is
      wrong and this is the step to fix it. (The two `core/systems/` files this step touched are
      decision 1's move of `isFlyer`, and nothing else.)
- [x] Nothing in `core/` imports anything but itself and zod; no `Math.random`, no `Date.now`.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 11B and 11C

```
core/systems/targeting.ts   isFlyer(enemy: Enemy): boolean            // tags.includes('air')
                            isTargetable(enemy: Enemy, targets: TargetClass): boolean
core/content/enemies.ts     fly: EnemyDefOf<'fly'>                    // air, bug
core/content/towers.ts      toaster: TowerDefOf<'toaster'>            // attack, targets 'air'
core/content/nights.ts      night08, night09: NightDef                // in NIGHTS, after night07
```

11B extends `isTargetable` with the `revealed` half and must not touch the air half. 11C draws the
air layer and re-tunes nights 8 and 9.

## Do not

Touch `enemyPosition`, `core/path.ts` or `Enemy` — 11B owns the lateral offset and the one function
that says where an enemy is, and a second position derivation added here is the one mistake in this
step that no test catches. Do not build the light registry, the `reveal` behaviour's interpreter, the
Nightlight, the Moth or night 10 (all 11B). Do not draw anything: the shadow, the bob and the shop
card are 11C's, and there is no reason for this session to open a file under `render/` or `ui/`
beyond `en.ts`. Do not build the noise meter (step 13), upgrades (step 12) or tile effects (step 14).
