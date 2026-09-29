# Step 18 — Pushback

> This step is three sessions. Paste **one part file** into a fresh session, in order, and `/clear`
> between them. Do not paste this index. It only says what the parts are and how they fit.

**Prereq:** step 17, all four parts. This split was written against `1d6943c` (17C) while 17D was
still uncommitted in the working tree (`render/layers/entities.ts`, `render/layers/towers.ts`,
`render/palette.ts`, `ui/views/GameView.vue`, `dev/night/`). 17D also moves numbers in
`core/content/towers.ts` and `nights.ts`. So the part files name **symbols, not line numbers**, in
those files. Re-read them before trusting any line reference there.

## Goal

Move enemies *backwards* along the track. It's a small system with one v1 tower, but it's the
redesign that saved Mint Pot from the fixed-path decision (`../../analytic-docs/DECISIONS.md` §3), and
building it now means Mint Pot arrives post-v1 as pure config. Against a fly wave, a well-placed Fan
should feel like holding a door shut.

## Parts

Each part names its own `Read first:` sections, so a session only loads the docs it needs.

| Part | Session | Builds |
| --- | --- | --- |
| [A](18-pushback/A-the-push-and-the-fan.md) | The push, headless | `pushback` reshaped into a rider on a `coneAttack`, `core/systems/pushback.ts` (clamp, immunity, resistance), `Enemy.pushback`, the `push-immune` tag, two events, the Fan, and Mint Pot in `POST_V1_TOWERS` |
| [B](18-pushback/B-the-fan-on-screen.md) | The Fan on screen | the gust on each pulse, the shove and the stagger, the Fan's card row, the Fan's copy |
| [C](18-pushback/C-night-18-and-the-curve.md) | Night 18, and the tuning pass | authoring night 18 on the Counter, then re-tuning the Fan and the resistance curve against it |

Strictly in order. B draws what A's events say happened. C can't judge a curve it can't see, or a
finale that doesn't exist yet.

**A carries every test the step file asked for.** They're headless, and each one checks a number
that drifts silently. **B carries two small tests** over `statsFor`, following 17C's precedent.
**C carries no behaviour tests.** It keeps `tests/content.spec.ts` true for night 18, per
`../../analytic-docs/ARCHITECTURE.md` §7.

**Numbers are authored blind in A and re-tuned in C.** That covers the Fan's cone angle and tiers,
and the three resistance constants in `pushback.ts`. The English goes the same way: A drafts it
because `type-check` demands it, B rewrites it against the card and the board, and C re-reads it
after the tuning. All three part files say so.

## The seam that can't be split

**`pushEnemy` in `core/systems/pushback.ts` is the only thing that shortens a walking enemy's
`distance`.** Immunity, the clamp at 0, the resistance curve, the event and the order within one hit
all live in that one call, and it's called from the one place a pushback lands: the cone's hit loop
in `combat`. B's slide reads `enemyPushed.tiles`, which is the distance actually moved, and never
recomputes it from the resistance. C moves the constants and never the call site. If this moves (a
second writer, a slot of its own, a renderer working out what the push "should" have been), the
resistance is counted twice or not at all, and the lock the curve exists to prevent comes back with
nothing failing. Step 19's fleeing thief goes through the same function.

## Contradictions this split resolved

Each is settled in the part that implements it, with the reason there.

1. **The descriptor in the repo vs the step.** `PushbackBehaviour` has shipped since step 2 as a
   continuous shove (`pushTilesPerTick` "while it is in the cone") with its own range and cone. The
   step describes discrete hits (1.2 tiles "per hit", resistance "rising with each push", a gust
   "on each pulse"), and the Fan's row is a cone attack with 1 damage. Pushback becomes a **rider on
   a `coneAttack`**: `{ pushTiles, targets, applies }`, landing on what the cone hits. The step's
   `rate` is the cone's `cooldownTicks` (A, decision 1).
2. **"Mint Pot … with `unlockNight: 21`"**: the schema has no such field, and `schema.ts` reserves
   unlock state for step 20. Adding Mint Pot to `TOWERS` would put it in the shop, on a number key,
   and in `contentKeys`' required English *today*. It goes in a separate `POST_V1_TOWERS`, validated
   at boot beside `TOWERS`. The 21 stays in `ROADMAP-POST-V1.md` (A, decision 7).
3. **"Bosses and stationary enemies carry a `pushImmune` flag"**: `EnemyFlag` is per-tick runtime
   state, and there are no bosses in v1. Immunity is what an enemy *is*, like `physical-immune`. So
   it's the **`push-immune` tag**, carried by the Mold, with a schema refine making every
   speed-0 enemy carry it (A, decision 4).
4. **The barricade and tile re-entry combos**: both are ground-only (a flyer is never held by a box
   and never touches a heated tile), and the only shipped pusher is air-only. Neither is reachable
   in v1. Both are also free, since blocking and tile effects are recomputed every tick. So they are
   asserted through Mint Pot, which the specs register, and nothing is built for them (A).
5. **"A brief stagger before they resume"** is rendering, not a pause in the simulation. A sim pause
   would multiply the lock power the resistance floor is sized against (B, decision 3).
6. **Night 18 is never mentioned as work**, yet the acceptance judges it and `nights.ts` has
   reserved it for this step since 16C. C authors it on the Counter, single-lane, 14 waves, **without
   the heatwave**: night modifiers are step 21's (C, decision 1).
7. **"Cap effective pushback at ~35% after four pushes"** is a per-push floor, so enough Fans still
   lock a lane. At the floor, three overlapping Fans out-push a Moth and four a Fly. The noise meter
   is the real price of that many Fans. C judges it, and A's test pins the two-Fan case.
8. **Fan T1/T2 can't raise the push distance or the rate.** Either one raises the lock threshold the
   floor is sized against: two tier-2 Fans at 2.0 tiles would lock a Moth at the floor. The tiers
   take range instead (A, decision 6).

## Step acceptance

- [ ] A Fan on a flyer lane visibly buys time and feels good to place.
- [ ] Fan spam does not trivialise night 18: the resistance curve and the noise are doing their job.
- [ ] Mint Pot exists in the data and validates, without a single file in `core/systems/` mentioning
      it by name.
- [ ] The Fan is a config object. The only new system file is `pushback.ts`. The only edits to
      existing systems are the rider in `combat.ts`'s cone path and the comments this step corrects
      (`../../CLAUDE.md`, *Content is data, not classes*).
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Build ground pushback UI, unlock Mint Pot, or add knockback to any other tower. That's one system and
one shipped tower. Don't build the heatwave or any night modifier (step 21), unlock state (step 20),
a hotkey for the nineteenth tower (step 20a), or the fleeing thief's pushback sign (step 19).
