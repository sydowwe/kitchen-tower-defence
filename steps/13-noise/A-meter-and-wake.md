# Step 13A — The meter, the wake, and what it costs

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §8,
`../../analytic-docs/ARCHITECTURE.md` §3.
**Prereq:** step 12.

## Goal

The meter fills, a human walks in, and the night costs you something. Entirely headless — nothing
about noise looks any different on screen until 13B. Every test step 13 has lives here, because this
is the half that can silently be wrong: a meter that decays at 1.5 per *tick*, a wake that fires on
two consecutive ticks, a forfeit that takes money you already spent.

## Already in the repo

Most of the wiring exists. These are the files you edit rather than create.

| File | What's there now |
| --- | --- |
| `core/systems/noise.ts:4` | `noiseSystem(_world)` — a four-line stub with an empty body, and a comment saying step 13 owns it. It is already in `SYSTEM_ORDER`, 13th, **after `combat` and before `economy`** |
| `core/types.ts:443` | `interface NoiseState { level, cap, decayPerTick, hasFilled }` — already on `World.noise` |
| `core/types.ts:506` | `GameEvent` member `{ kind: 'noiseFilled' }` — declared in step 2A, **consumed by nothing** |
| `core/world.ts:22, 121` | `NOISE_DECAY_PER_TICK = 1.5 / 60`, and `noise: { level: 0, cap: tier.noiseCap, ... }` |
| `core/content/difficulty.ts` | `noiseCap` 130 / 100 / 80 per tier, copied onto the world by `resolveDifficulty` |
| `core/systems/combat.ts:159` | pushes `{ kind: 'towerFired', towerId, defId, noise: def.noise }` on every shot, with a comment saying step 13 reads it |
| `core/systems/placement.ts:210, 222` | `damageTower(world, tower, amount)` (flat, clamped at 0, no event) and `destroyTower(world, towerId)` (penalty → event → removal). Both comments name step 13 as a caller |
| `core/systems/spawn.ts:208` | `spawnDestroyPenalty(world, crumbs)` — buys extra enemies **from the running wave's own composition** and appends cursors to `night.wave.spawns`. Returns early on `wave === null` |
| `core/systems/economy.ts:31`, `crumbs.ts:165`, `commands.ts:60` | the three places `world.crumbs +=` happens: tower payout, `collectCrumb`, the early-call bonus |
| `core/systems/placement.ts:146` | `world.crumbs -= def.cost` — the only spend |
| `core/systems/movement.ts:26` | `enemy.distance += enemy.speed * speedMultiplier(enemy)` — the whole system |
| `core/systems/barricades.ts:144` | the per-enemy loop; `nearestAhead` only ever looks **ahead**, and recomputes `previous = distance - speed * mult`, which assumes the enemy moved forward |
| `core/systems/resolve.ts:74` | the one pass that removes enemies: `hp <= 0` first (event + crumb), then `distance >= totalLength` (leak) |
| `core/systems/targeting.ts:31` | `isTargetable` — `hidden && !revealed`, then `untargetable`, then the air/ground class |
| `core/types.ts:66` | `EnemyFlag = 'hidden' \| 'untargetable' \| 'fleeing' \| 'revealed'`. **`fleeing` has no writer yet** — its comment says step 19 owns it; you are the first writer |
| `ui/viewModel.ts:92` | `hitPoints` is null for every tower that is not a barricade, with a comment reading "Step 13's noise penalty is what turns it on for the rest" |

**The specs that will break:**

- `tests/fixtures/world.ts:36` — the noise literal and every other `World` field, spelled out on
  purpose so a new field fails `type-check` here. Its night is `phase: 'won'`, which is terminal and
  runs nothing; a noise spec has to move it.
- `tests/world.spec.ts:76` — `expect(world.noise.cap).toBe(DIFFICULTIES.nightmare.noiseCap)`. Stays
  true as long as no modifier is passed.
- `tests/world.spec.ts:30` — the JSON round-trip over the whole world. Every field you add is
  covered by it for free; extend it rather than writing a second one.
- `tests/types.spec.ts` — `Serialisable<World>`. Fails `type-check` the moment a `Map`, a `Set` or a
  function-typed field lands on the world.

**Step 12 lands between this file being written and this session running.** Two lines below depend on
what it did: if it introduced an accessor for a tower's *effective* def, `combatSystem`'s `def.noise`
becomes that accessor's noise, and `projectedNoisePerSecond` below takes the effective def too. If it
did not put `noise` in `statDeltas`, both stay as they are. Check before you change either.

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **`noiseFilled` is renamed `humanWoke`** and gains a payload:
   `{ kind: 'humanWoke'; crumbsForfeited: number; crumbsOnBoardForfeited: number; towersDestroyed: DefId[] }`.
   Nothing consumes the old member, so the rename is free; the name matters because 13B's card is
   about what happened in the kitchen, not about a meter reaching a number. The payload is on the
   event because the card cannot reconstruct it — the crumbs are already gone and the towers are
   already out of `world.towers` by the time anyone reads it, which is exactly why `towerDestroyed`
   carries its own `defId` and `tile`.
2. **`hasFilled` becomes `wakeCount: number`**, and the no-wake bonus reads `wakeCount === 0`. A
   boolean and a count are two truths about one thing, and the count is the one the night-end card
   can say a sentence with.
3. **No `peakNoise`.** The step's Build list asked for one; `CONTENT.md` §8's scoring formula has no
   term that reads it, and a field with no reader goes into every save and every replay for nothing.
   Step 20 adds it when it has a formula. *(Overruled from the original step file — recorded here.)*
4. **`decayPerTick` stays per tick and stays on the world.** `core/` has no clock; the doc's 1.5/sec
   is converted once in `core/world.ts` and never again. A system dividing by 60 is a system that
   will one day divide twice.
5. **`world.unbankedCrumbs: number`, top level, beside `world.crumbs`.** It is a slice of the wallet,
   not a per-night ledger like `crumbsDropped`, and it has to be reachable by every spend path.
6. **Income is unbanked; refunds and starting crumbs are not.** Collection (click and delivery),
   tower payouts and the early-call bonus all add to both `crumbs` and `unbankedCrumbs`. A sell
   refund is returned capital rather than income — making it forfeitable turns selling before a
   wake into a trap the player cannot see.
7. **Spending draws `unbankedCrumbs` down first**, `max(0, unbanked - amount)`. Without it: start
   with 200 banked, earn 300, spend 300 on towers, wake — and the forfeit of 300 eats the 200 you
   started the night with. With it, converting income into towers is how you protect it, which is
   the decision the mechanic is for.
8. **Two helpers in `core/systems/economy.ts`, and every wallet write goes through them:**
   `earnCrumbs(world, amount, banked)` and `spendCrumbs(world, amount)`. Four call sites is four
   chances to forget the second field; one function is none. Same shape as `collectCrumb` being the
   single paying door for a crumb.
9. **The wake's order is fixed and the order is load-bearing:** flee → forfeit board crumbs →
   forfeit unbanked → close the wave → damage towers → `level = 0`, `wakeCount++` → push the event.
   See Build item 3 for what each ordering buys.
10. **A wake suppresses the Cookie Jar's destroy penalty.** `destroyTower` gains an explicit
    `payPenalty` option defaulting to true, and the wake passes false. The penalty buys enemies from
    *the running wave's composition* and appends live spawn cursors — on the tick every enemy on the
    board just fled, and the symptom is a board that empties and then refills from a wave you were
    told was over. `destroyTower`'s own comment currently says a jar killed by noise should pay; it
    was written before the flee existed, so **correct that comment** rather than leaving it lying.
11. **A fleeing enemy is `fleeing` *and* `untargetable`.** `fleeing` alone is not enough: a tower
    that kills one would drop a crumb on a board whose crumbs were just forfeited, and count a kill
    for a thing that got away. Step 19's fleeing thief is the opposite case — you very much want to
    shoot that — so it will set `fleeing` alone, which is why the no goes on `untargetable` and not
    into `isTargetable`'s reading of `fleeing`.
12. **Fleeing ignores `speedMultiplier`.** A frozen or rooted enemy that can never leave is a board
    that never empties and a night that never ends. Flee speed is exactly `speed * 2`.

## Build

### 1. `core/types.ts` and `core/world.ts` — the fields

`NoiseState` becomes `{ level, cap, decayPerTick, wakeCount }`. `World` gains `unbankedCrumbs`,
initialised to 0 — **not** to `startingCrumbs`, which is banked.

`CreateWorldOptions` gains `noise?: { capDelta?: number; decayPerSecondDelta?: number }`, folded into
`noise.cap` and `noise.decayPerTick` at construction, additively, on top of the difficulty tier.

The shape is a **resolved pair, not a list of installation ids**, and the fold happens once at
construction rather than being read every tick from a modifiers object. That is exactly what
`resolveDifficulty` already does and for the same reason: the world carries the numbers it was built
with, so a replay of tonight is not at the mercy of a balance patch that re-prices White-noise
Machine next month. 13C authors the three installations and resolves them into this pair.

Then `tests/fixtures/world.ts`, which spells every field out and will fail `type-check` until you do.

### 2. `core/systems/economy.ts` — the banked/unbanked split

```
earnCrumbs(world, amount, banked = false)   // crumbs += amount; if (!banked) unbankedCrumbs += amount
spendCrumbs(world, amount)                  // crumbs -= amount; unbankedCrumbs = max(0, unbanked - amount)
```

Route `collectCrumb` (`crumbs.ts:165`), the payout (`economy.ts:31`), the early-call bonus
(`commands.ts:60`) and `placeTower`'s `world.crumbs -= def.cost` (`placement.ts:146`) through them.
`sellTower`'s refund uses `earnCrumbs(..., banked = true)` per decision 6. Step 12's `UpgradeTower`
spends and must go through `spendCrumbs` too — if it does not, a wake after upgrading forfeits money
that is already in the tower.

`world.crumbs` stays a whole number everywhere; nothing here introduces a float.

### 3. `core/systems/noise.ts` — the meter and the wake

Skip on the two terminal phases, like every other system in the file set.

**Accumulate, then decay, then test the cap, in that order.** `noise` runs after `combat`, so this
tick's `towerFired` events are sitting in `world.events` — sum their `noise` field. Decaying first
would let a tower's own shot be shaved by the same tick's decay, which is a silent 2.5% discount on
every loud tower.

Clamp at 0 on the low end and at `cap` on the high end. **`level` is clamped to `cap`, not left to
overshoot**, and the wake tests `level >= cap` and then assigns `level = 0` in the same call — that
is what makes "exactly one `humanWoke`, never two in consecutive ticks" fall out of the code rather
than out of a guard flag.

Aura and tile towers do not emit yet. `CONTENT.md` §1 gives the Candle noise 0 and the only per-second
noise source in v1 is the Gas Stove Burner (noise 2, `tileEffect`), whose interpreter is step 14's —
so **do not** write a per-second emitter with nothing to drive it. Leave a one-line comment naming
step 14 and move on. *(The original step file asked for it; there is no content and no interpreter to
exercise it, and a branch nothing reaches is a branch that is wrong by the time something does.)*

Export two pure helpers 13B needs, so no component re-derives them:

- `noiseFraction(world): number` — `level / cap`, 0 when `cap` is 0.
- `projectedNoisePerSecond(def): number` — the def's `noise` times its firing behaviour's shots per
  second, 0 for a tower that never fires. This is the number a player can actually plan against;
  `noise: 3` on its own does not say that a Toaster is three times louder per second than a
  Mousetrap when it is nine tenths of a per-second rate louder. Use the file's own 60, not a magic
  number: `def.noise * 60 / firing.cooldownTicks`.

### 4. The wake, in `noise.ts`, in this order

1. **Every enemy flees.** Set `flags.fleeing` and `flags.untargetable`, clear `targetEnemyId` on
   every tower that was aiming at one (or let `targetingSystem` do it next tick — but say which in a
   comment, because `combatSystem` reads the id the tick after and an untargetable enemy that is
   still someone's `targetEnemyId` takes one free hit).
2. **Every uncollected pile is forfeited.** Sum their value into the event, then remove them.
   Through the same reindex `crumbs.ts` uses — the pile array and `world.index.crumbPiles` cannot
   disagree. Nothing is credited and `night.crumbsCollected` is not touched: a forfeited crumb was
   dropped and not collected, which is precisely what keeps `CONTENT.md` §8's cleanliness ratio
   meaning something.
3. **`crumbs -= min(unbankedCrumbs, crumbs)`, then `unbankedCrumbs = 0`.** The `min` is the belt to
   decision 7's brace: the wallet must never go negative even if a spend path was missed.
4. **Close the wave.** Set `remaining = 0` on every cursor of `night.wave.spawns` and leave
   `night.wave` in place. The fled wave is now spawned out, so `waveSystem` moves the night into
   `'countdown'` with the authored gap on its own next tick, `emitClearedWaves` clears it, and
   `resolveSystem` can still win the night if it was the last wave — all three through the code
   paths that already exist, with no special case. **Do not null `night.wave`**: `resolveSystem`'s
   `lastWaveIsOut` requires it to be non-null, and a wake on the final wave would hang the night
   forever with a board that empties and a phase that never moves.
   If the phase is already `'countdown'`, leave `countdownTicks` alone — the step's own test is that
   a wake during the gap neither skips nor duplicates the next wave.
5. **Every tower takes 20% of `maxHp`** through `damageTower`, and any tower at `hp <= 0` goes
   through `destroyTower(world, id, { payPenalty: false })`. Iterate a snapshot or walk backwards:
   `destroyTower` splices `world.towers` and rebuilds the index, and a forward `for...of` over the
   live array skips the tower after each one it removes — the symptom is every second doomed tower
   surviving a wake it should not have.
6. **`level = 0`, `wakeCount++`, push `humanWoke`** with the two totals and the `defId` of each
   tower destroyed.

### 5. `movement.ts`, `barricades.ts`, `resolve.ts` — the flee

- `movementSystem`: `enemy.flags.fleeing ? distance -= speed * FLEE_SPEED_MULT : distance += speed * speedMultiplier(enemy)`.
  `FLEE_SPEED_MULT = 2`, named in this file. No clamp here — `samplePath` already clamps a negative
  distance to 0 for the renderer, and `resolve` is what removes the enemy.
- `barricadesSystem`: `continue` on a fleeing enemy, first thing in the loop. Its `previous`
  arithmetic adds the enemy's forward step back on, which is the wrong sign for one walking
  backwards, and the visible symptom is a retreating ant snapping forward onto a box it already
  passed and taking a bite out of it.
- `resolveSystem`: a new branch in the existing single pass, **before** the `hp <= 0` branch —
  `enemy.flags.fleeing && enemy.distance <= 0` removes the enemy with **no event, no
  `enemiesKilled`, no `dropCrumb`**. Before the death branch so a fleeing enemy that was left on 1 HP
  by a shot in flight leaves rather than dying at the baseboard and paying out.

Projectiles already in the air when the wake fires will still arrive. `Projectile.targets` and
`isTargetable` mean a fleeing enemy is not hit by a splash; a single-target arrival may still land on
one. That is acceptable and visible, and adding a fleeing check to the projectile arrival is a fourth
place that has to agree with the other three — leave it.

### 6. `ui/viewModel.ts` — turn the HP row on

`statsFor` gives `hitPoints` only to a barricade, with a comment saying step 13 is what changes it.
Every tower can now be damaged, so `hitPoints = def.maxHp` for all of them, and the comment goes.
Also publish `noise.wakeCount` and `unbankedCrumbs` in `HudSnapshot` — 13B's card and the top bar
read both. Nothing else in `ui/` changes here.

## Tests

New `tests/noise.spec.ts`. The fixture's night is terminal, so move it to `'wave'` first.

- One Mousetrap firing once adds **exactly 2** to `level` — the def's value, not a rounded one.
- 60 ticks with nothing firing drop `level` by **exactly 1.5**, from a level that is neither 0 nor
  the cap. This is the one that catches a per-tick decay authored as a per-second value.
- Decay runs during `'building'` and `'countdown'`, not only during a wave.
- A world driven from `level = cap - 0.01` past the cap emits **exactly one** `humanWoke`, and the
  next tick emits none.
- After a wake: every enemy has `fleeing` and `untargetable` set; `world.crumbPiles` is empty;
  `world.crumbs` equals what it was minus the unbanked pool; `unbankedCrumbs` is 0; every surviving
  tower is at `<= 0.8 * maxHp`; a tower placed at 19% of max HP is gone from `world.towers` and its
  `towerDestroyed` event fired.
- A wake with a Cookie Jar destroyed by it appends **no** new spawn cursors to `night.wave.spawns` —
  decision 10, and the one nobody would think to check.
- A fleeing enemy reaches `distance <= 0` and is removed with no `enemyKilled`, no crumb dropped and
  `night.enemiesKilled` unchanged.
- A frozen enemy still flees: `statusSystem` applying a freeze does not stop `distance` falling.
- Earn 300 unbanked, spend 300 on towers, wake — `world.crumbs` is unchanged and never negative.
- A sell refund survives a wake: refund into a wake and assert the refunded crumbs are still there.
- A wake during `'countdown'` leaves `countdownTicks` unchanged and the next wave starts exactly
  once, at the same tick it would have.
- A wake on the **last** wave still lets the night reach `'won'` once the board empties.
- `createWorld` with `noise: { capDelta: 25, decayPerSecondDelta: 0.5 }` on top of
  `{ capDelta: 30 }` gives cap 155 and decay `2 / 60`: additive, both, on top of the tier.
- Extend `tests/world.spec.ts`'s round-trip assertion rather than writing a second one, so
  `unbankedCrumbs` and `wakeCount` are covered by the test that already guards this.

## Acceptance

- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.
- [ ] `core/` still imports nothing but itself and zod; no `Date.now`, no `Math.random`, no
      millisecond anywhere in this part.
- [ ] Grepping for `world.crumbs +=` and `world.crumbs -=` finds hits only inside
      `core/systems/economy.ts`.
- [ ] `SYSTEM_ORDER` is unchanged — the noise slot was already in the right place and this part does
      not move it.

## Hands to 13B and 13C

These exports are the contract the next two sessions build against. If you change a signature, change
it here too.

```
core/types.ts            NoiseState { level, cap, decayPerTick, wakeCount }
                         World.unbankedCrumbs: number
                         GameEvent | { kind: 'humanWoke'; crumbsForfeited: number
                                       crumbsOnBoardForfeited: number; towersDestroyed: DefId[] }
core/systems/noise.ts    noiseSystem(world: World): void
                         noiseFraction(world: World): number              // 0..1
                         projectedNoisePerSecond(def: TowerDef): number   // 0 for a silent tower
core/systems/economy.ts  earnCrumbs(world: World, amount: number, banked?: boolean): void
                         spendCrumbs(world: World, amount: number): void
core/systems/placement.ts destroyTower(world, towerId, options?: { payPenalty?: boolean }): boolean
core/world.ts            CreateWorldOptions { …, noise?: { capDelta?: number
                                                           decayPerSecondDelta?: number } }
ui/viewModel.ts          HudSnapshot.noise { level, cap, wakeCount }
                         HudSnapshot.unbankedCrumbs: number
```

## Do not

Draw anything, change a colour, or touch a `.vue` file beyond `viewModel.ts`'s two fields — 13B owns
every pixel of this, including the flee. Do not author the installations or a dev toggle (13C). Do
not re-tune the cap, the decay or any tower's `noise` value: those are numbers 13C measures, and
moving them here means moving them with no meter on screen. Do not add a `noiseSource` behaviour for
enemies — the Cricket is Act III.
