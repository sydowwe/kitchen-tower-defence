# Step 13C — The three installations, and whether Act I can wake anyone

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §8,
`../../analytic-docs/CONTENT.md` §8 (the Installations table) and §6 (nights 1–8),
`../../analytic-docs/OPEN-QUESTIONS.md` §3.
**Prereq:** steps 13A and 13B.

## Goal

The counterplay that makes a loud tower a choice rather than a trap, a way to turn it on before step
20 exists to sell it, and then the question the whole mechanic rests on: **with cap 100 and 1.5/sec
of decay, can anything in Act I actually fill the meter?** `OPEN-QUESTIONS.md` §3 has been asking
since before any of this was written. This is the session that answers it with a measurement and
writes the answer down.

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/content/installations.ts` | **empty**. Zero bytes, no exports |
| `core/content/schema.ts:530` | the `installation` schema — `{ id, nameKey, descriptionKey, cost }` and a comment saying step 20 extends it with the effect field |
| `core/content/index.ts:51` | `validateContentInDev({ towers, enemies, food, nights })` — `installations` is deliberately absent, with a comment saying why |
| `core/world.ts` | 13A's `CreateWorldOptions.noise?: { capDelta?, decayPerSecondDelta? }`, folded into `noise.cap` / `noise.decayPerTick` on top of the difficulty tier |
| `core/content/nights.ts` | `night01`–`night10`, **already authored and already tuned** — 5C tuned 1–3, 9C tuned 4–7, 11C tuned 8–10. All on the Counter, all on the lane `'crack'` (31.1 tiles). The header explains why the spawn window is authored against the crossing time and not the wave count; read it before touching a number |
| `core/content/towers.ts` | the only two non-zero noise values in the game: `mousetrap` 2 at 396 ticks, `toaster` 3 at 200 ticks |
| `tests/content.spec.ts:176, 463` | both pinned literally, with comments naming step 13 as the consumer |
| `dev/debug/state.ts` | `createDebugController(canvas, getMap)` — owns the `` ` `` toggle, guards against keys firing while an input is focused, and has a `destroy()`. `GameView.vue:269` imports it dynamically inside `import.meta.env.DEV` so nothing in `dev/` reaches the production bundle |
| `ui/views/GameView.vue:186` | `restart(index)` — builds a fresh world, re-bakes, resets effects, clears the selection |
| `ui/locales/contentKeys.ts` | `TowerMessages` / `EnemyMessages` / `FoodMessages` make a def without an English entry a **type error**. There is no `InstallationMessages` yet |

**The specs that will break:** none, unless you move a number. If you re-tune `mousetrap.noise` or
`toaster.noise`, `tests/content.spec.ts:176` and `:463` are the two literals to update in the same
commit — they are pinned so that moving one is a deliberate two-file edit.

Nothing in `tests/` asserts a night's authored tables, on purpose: `spawn.spec.ts` and `night.spec.ts`
both build their own nights so a tuning pass is never a red suite.

## Decisions already made

1. **Only the three noise installations are authored.** `CONTENT.md` §8 has fourteen; the other
   eleven touch eleven different systems and belong to step 20. Three defs and one effect field is
   the smallest thing that makes the counterplay real.
2. **The effect is two optional fields on the schema, `noiseCapDelta` and `noiseDecayPerSecondDelta`**
   — not a generic `effect` union. Step 20 has fourteen effects across as many systems and will pick
   the shape when it can see all fourteen; guessing it now with a sample of three is how you get a
   union that has to be rewritten by the step it was built for.
3. **`decayPerSecondDelta` is authored per second and converted once**, in `core/world.ts`, beside
   the existing `1.5 / 60`. `CONTENT.md` §8 says "+0.5/sec" and the def should read the way the doc
   does; `core/` holds ticks and there is exactly one place the conversion happens.
4. **Installations resolve to numbers at `createWorld` and the world never sees an id list.** 13A's
   decision, restated because this part is where it becomes visible: it is the `resolveDifficulty`
   precedent, and it is what stops a replay of tonight changing when White-noise Machine is
   re-priced next month.
5. **The dev toggle rebuilds the night.** Checking a box calls `restart(nightIndex)` with a new
   options object. It does *not* write to `world.noise` mid-night — that would be a dev tool reaching
   inside the determinism guarantee, which is the same reason 3C's debug marker is a plain number in
   dev state and not a command.
6. **The answer goes back into `OPEN-QUESTIONS.md` §3**, struck through with the measurement in it,
   exactly the way 11C struck the fruit fly gap. A balance question answered in a commit message is a
   question that gets asked again in six months.

## Build

### 1. `core/content/installations.ts` and the schema

Three defs from `CONTENT.md` §8, in the doc's own order and prices:

```
oilTheHinges          90   noiseDecayPerSecondDelta: 0.5
closeTheKitchenDoor  100   noiseCapDelta: 25
whiteNoiseMachine    260   noiseCapDelta: 30
```

`cost` is Grocery Money and nothing spends it yet — that is step 20's, and the field is on the schema
already. Add the two optional fields to the `installation` schema, bound them (a cap delta is tens,
not hundreds; a decay delta is a per-second rate under 10, which is what rejects a per-tick value
pasted in), wire `installations: INSTALLATIONS` into `core/content/index.ts`'s
`validateContentInDev` call and correct the comment above it that says the slot stays empty until
step 20.

Add `InstallationMessages` to `ui/locales/contentKeys.ts` and the three entries to `en.ts`. The type
is cheap and the dev panel renders these names, so an installation without English is a type error
rather than `installation.oilTheHinges.name` on screen — which is the whole job that file does.

Export a resolver — `resolveNoiseModifiers(ids: DefId[]): { capDelta, decayPerSecondDelta }` — so the
dev panel and step 20 fold the same way. Sums, additively; an unknown id throws with the id in the
message, like every other lookup in `core/content/index.ts`.

### 2. The dev toggles

Three checkboxes and a wake button, in `dev/`, behind `import.meta.env.DEV`, dynamically imported the
way `GameView.vue` already imports the debug controller and the editor preview. Verify in the build
output that none of it reaches the production bundle, the way 3C and step 4 both did.

- A checkbox per installation. Toggling restarts the night through `restart(nightIndex)` with the
  resolved modifiers — say so on the panel, because a silent restart mid-night looks like a crash.
- A **"wake now"** button. It is the instrument 13B could not have: firing a wake on demand is how
  you look at the wash, the card and the scatter twenty times in two minutes instead of playing to
  the cap each time. Enqueue nothing and call nothing on the world directly — set
  `world.noise.level = world.noise.cap` and let `noiseSystem` do the rest on its next tick, so the
  dev tool never contains a second copy of what a wake is.
- The panel reads `world.noise` for a live readout: level, cap, decay per second, wake count. You
  will want it during the measurement below more than during play.

### 3. Measure, then decide

**This is the session's real work.** Do the arithmetic first, because it tells you what to measure:

- A Mousetrap is `noise: 2` every 396 ticks — **0.30 noise/sec**, and only while something is inside
  its range of 1.
- A Toaster is `noise: 3` every 200 ticks — **0.90 noise/sec**, and only while something is in the
  air inside its range of 4.
- Decay is **1.5/sec**, always.

So five Mousetraps firing without a pause merely hold the meter level, and the tenth one is what
makes it climb at 1.5/sec — 67 seconds of ten Mousetraps all firing flat out to reach 100, at 90
crumbs each. Neither tower's range makes a 100% duty cycle plausible. **The arithmetic says Act I
probably cannot fill the meter**, which is precisely the failure `OPEN-QUESTIONS.md` §3 names: "if
they can't, the mechanic is inert until Act IV, which defeats the point of shipping it early."

Measure it headless, the way 11C measured the fruit fly gap — build a world, drive it with `tick()`,
put a board on it and read `world.noise` — and get real numbers, not a feeling:

- Night 6, a Mousetrap-heavy ground board of whatever the crumb income actually affords by then.
  What is the peak `level`? How many Mousetraps does reaching the cap take?
- Night 8, a Toaster-heavy air defence against that night's flies, including the flies-only wave 6.
- Both on `normal`. Then check `nightmare`'s cap of 80 and `cozy`'s 130 do not turn "once" into
  "never" or "every wave".

Then decide, in this order of preference, and change **one** thing:

1. **Nothing** — if the measurement says a plausible night 6 board wakes a human once. Write that
   down and stop.
2. **The decay**, if it is only just out of reach. It is one number in `core/world.ts`, it is the
   thing the Oil the Hinges installation is priced against, and `DECISIONS.md` §8 is where it has to
   change first.
3. **The per-shot values**, if the towers are the problem rather than the decay. `CONTENT.md` §1's
   noise column and `tests/content.spec.ts`'s two literals move together.

Whichever moves, **change `DECISIONS.md` §8 and/or `CONTENT.md` §1 first**, then the code: one source
of truth per decision, and a doc that disagrees with the balance sheet is worse than one that is out
of date.

### 4. The night 1–8 pass

The original step file said "author nights 1–8 in full". **They are already authored and already
tuned** — 5C, 9C and 11C each did a pass — so this is a noise pass over existing content, not an
authoring pass. *(Corrected here; the step was written before any of `nights.ts` existed.)*

What actually has to be true, per `DECISIONS.md` §8: night 3's Mousetrap and night 8's Toaster are
the **teachers**. A player leaning on Mousetraps by night 6 should be able to wake a human once and
still win the night. That is the claim to play against — and it is a claim about the *noise* curve,
so if a wave composition needs to move to make it true, say in `nights.ts` which pass moved it and
why, the way every other tuning note in that file does.

Nights 9 and 10 exist too. Leave them: this step's milestone is Act I, and their own pass belongs to
whichever step re-tunes Act II.

### 5. Write the answer down

Strike `OPEN-QUESTIONS.md` §3's noise bullet and replace it with what you measured — the boards, the
peaks, the number of towers, what moved and what did not — in the shape 11C's fruit-fly entry uses.
If a number changed, `DECISIONS.md` §8 and `CONTENT.md` §1 carry it and this file records which way
it went.

## Tests

**None new.** 13A's `tests/noise.spec.ts` is the regression net, and its modifier assertions already
cover additive stacking — re-run the suite after the installations land, because it is now asserting
against the real defs' numbers rather than against synthetic deltas. If you move a tower's noise,
`tests/content.spec.ts` is the one place to follow it.

The measurement is a throwaway script, not a spec: it asserts nothing, it reports numbers, and a
spec that pins tonight's balance turns the next tuning pass into a red suite. Run it, read it, write
the answer into the docs, delete it. Step 22's harness is where measurement becomes a tool.

## Acceptance

- [ ] The three installations validate at boot and show their English names in the dev panel.
- [ ] Ticking Close the Kitchen Door and White-noise Machine together gives a cap of 155, and Oil the
      Hinges takes the decay to 2/sec — visible in the panel's readout.
- [ ] `OPEN-QUESTIONS.md` §3's noise bullet is struck through and answered with numbers.
- [ ] Nights 1–8 are all winnable and all require different builds.
- [ ] Playing night 6 leaning on Mousetraps, you wake a human once, you know exactly why, and you
      still win the night. If you cannot wake one at all, the measurement was wrong or the fix was
      too timid — go back to item 3.
- [ ] Playing night 8 with a Toaster-heavy air defence and then with a quiet ground line, the two
      noise profiles are visibly different. This is the criterion that says the mechanic is a choice.
- [ ] The production bundle contains no `dev/` code — check the build output.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Author the other eleven installations, spend Grocery Money, or build a shop to buy them in — step 20,
in full. Do not add the loadout, the unlock schedule or night-end scoring. Do not touch the wash, the
card or the meter's treatment (13B's) beyond what a re-tuned number changes on its own. Do not author
maps: nights 4–10 are on the Counter because the other five maps do not exist, and step 21 is what
re-wires the campaign.
