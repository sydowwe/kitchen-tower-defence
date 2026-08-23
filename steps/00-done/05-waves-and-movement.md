# Step 5 — Waves, spawning, movement, food loss

> This step is three sessions. Paste **one part file** into a fresh session, in order, and `/clear`
> between them. Do not paste this index — it exists to say what the parts are and how they fit.

**Prereq:** step 4, both parts.

## Goal

Ants march from the crack to the fridge and steal your food. No defences yet — this is the loop you
are about to defend against, and the first time the board has a simulation behind it rather than a
picture on it.

## Parts

Each part names its own `Read first:` sections, so a session only loads the docs it needs.

| Part | Session | Builds |
| --- | --- | --- |
| [A](05-waves-and-movement/A-spawning-and-movement.md) | Nights 1–3, spawning, movement | `core/content/nights.ts`, the Roach, `core/systems/spawn.ts`, `movement.ts`, `tests/spawn.spec.ts` |
| [B](05-waves-and-movement/B-wave-flow-and-food.md) | Wave flow, the fridge, win and loss | `core/systems/wave.ts`, `resolve.ts`, `commands.ts`, `core/content/food.ts`, `tests/night.spec.ts` |
| [C](05-waves-and-movement/C-enemies-on-screen.md) | Enemies, the shelf, the night on screen | `render/layers/entities.ts`, `fridge.ts`, `effects.ts`, `ui/views/GameView.vue`, `dev/nightHud.ts`, re-tuned nights 1–3 |

B is the only part that touches committed specs: it adds `wave` to `SYSTEM_ORDER` and moves
`tests/fixtures/world.ts` to a terminal phase so the fixture stops driving a night that does not
exist. A and C add files and break nothing.

Strictly in order. B decides *when* a wave starts; A decides *what* it spawns and how it moves. C
draws what the two of them produce and is the first part with a world behind the canvas.

A and B each carry their own tests — the split is exactly where the assertions split. A owns spawn
timing, movement arithmetic and difficulty scaling; B owns the wave state machine, the early-call
award and the win/lose conditions. **C has no tests at all**, per
`../../analytic-docs/ARCHITECTURE.md` §7: everything it builds is pixels, and vitest runs
`environment: 'node'` so none of it is reachable from a spec anyway.

The wave tables are authored twice on purpose. A ships nights 1–3 as a structurally correct ramp
built from `../../analytic-docs/CONTENT.md` §6, so B has something real to drive and C has something
real to watch. C re-tunes night 1 **after** watching it play out unattended, which is the first
moment anyone can judge whether the ramp reads as a ramp. Tuning it in A means tuning it blind.

## The seam that can't move

**A owns one wave's contents; B owns the night's structure.** `startWave(world, night, index)` builds
the runtime `Wave` — difficulty scalars, path distribution, spawn schedule — and `spawnSystem` walks
it. Everything about *when* that gets called (the inter-wave countdown, `CallWaveEarly`, the clock,
"all waves done") is B's and is not spawn's business.

Move the line and you get two answers to "is this wave over": one in the spawn schedule and one in
the wave machine, disagreeing on the tick a wave with a slow trailing entry finishes. That
disagreement is invisible until a night ends one wave early.

## Step acceptance

- [ ] Night 1 plays out unattended: six waves of ants walk the Counter, eat all your food, and you
      lose.
- [ ] The clock reads 2:00am on wave 1 and 6:00am on the final wave.
- [ ] Same seed, same result, every time — run it twice and diff the event log.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Build towers, targeting, projectiles or crumbs — steps 6 and 7. Enemies are invincible for the whole
of this step, which is the point: it is the unopposed loop. Do not build the real HUD (step 8) —
C's on-screen text is a dev-only scaffold and lives in `dev/`.
