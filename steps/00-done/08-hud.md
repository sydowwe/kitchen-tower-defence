# Step 8 — Vue HUD v1 — **MILESTONE: playable prototype**

> This step is three sessions. Paste **one part file** into a fresh session, in order, and `/clear`
> between them. Do not paste this index — it exists to say what the parts are and how they fit.

**Prereq:** step 7.

## Goal

Replace the dev keyboard controls with a real interface. At the end of this step the game is
genuinely playable by someone who hasn't read the code, and **you stop and play it** — which is the
checkpoint the whole plan is built around.

## Parts

Each part names its own `Read first:` sections, so a session only loads the docs it needs.

| Part | Session | Builds |
| --- | --- | --- |
| [A](08-hud/A-view-model.md) | The view model and every string | `ui/viewModel.ts`, `ui/selection.ts`, `ui/locales/`, `earlyCallBonus` + `night.enemiesKilled` in `core/` |
| [B](08-hud/B-hud-components.md) | The six components and the layer they live in | `ui/components/hud/*.vue`, the HUD half of `ui/App.vue`'s palette |
| [C](08-hud/C-placement-and-hotkeys.md) | Pointer, hotkeys, night flow, and deleting the scaffolding | `render/layers/overlay.ts`, `ui/interaction.ts`, `ui/keyboard.ts`, `ui/views/GameView.vue`; deletes `dev/placement.ts` and `dev/nightHud.ts` |

Strictly in order. B renders what A publishes; C drives what B renders and is the only part that
touches input, so it is also the part that plays the milestone.

**A carries every test step 8 has. B and C have none.** A is headless and `vite.config.ts` runs
`environment: 'node'` with no jsdom and no `@vue/test-utils` — a component spec is not reachable, and
the interaction layer's only assertable claims (`canPlaceTower`'s eight reasons, what `CallWaveEarly`
pays) are already covered by `tests/placement.spec.ts` and `tests/commands.spec.ts`. A part with no
tests is not an under-tested part; do not invent coverage for B or C.

**Authored twice on purpose**, and both parts say so: A writes every English string in `en.ts` with
nothing on screen — the toast copy, the shop's stat-card labels, the summary lines — and C revises
that copy in `en.ts` after playing nights 1–3. Same for the HUD's spacing and weight: B authors it
against a running game, C re-tunes it against three nights at every speed.

## The seam that can't be split

**The snapshot is the only channel from the world to the DOM, and a command is the only channel
back.** A defines both ends. B may read the snapshot and emit an intent; it may not import `core/`,
hold world state, or enqueue anything. C may enqueue commands and mutate the selection; it may not
give a component a live reference into the world.

Move that line — one component importing `world`, one handler writing a field a template reads — and
Vue reactivity is over simulation state (`../../analytic-docs/ARCHITECTURE.md` §5). Nothing fails; the
frame budget just goes, three steps later, and the diff that did it is by then invisible.

## Dependency order

A → B → C, no overlap. A ships types and pure builders. B consumes A's types and emits named events.
C wires B's events to the command queue and deletes the dev scaffolding that stood in for all of it.

## Step acceptance

- [ ] Nights 1–3 are fully playable with mouse and keyboard: no dev keys, no console, no `r` to
      restart.
- [ ] Frame time is unchanged from step 7. Profile it — if Vue costs anything measurable, the view
      model is leaking reactivity into world state, and the first suspect is a per-pointermove field
      that became a `ref`.
- [ ] Someone who has never seen the code can be handed the keyboard and understands what to do
      within a minute.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.
- [ ] `dev/placement.ts` and `dev/nightHud.ts` are gone, and nothing imports them.

## Stop here and play it

This is the checkpoint the whole plan is built around, and it belongs to part C. Play nights 1–3
several times, at every speed.

Ask, honestly:

- Is placing a tower and watching it work **satisfying**?
- Does the crumb loop create a real pull between defending and cleaning, or is clicking crumbs just a
  chore?
- Is calling waves early a decision you actually think about?
- Do you want to play night 4?

If the answer to the last one is no, the problem is in the core loop and no amount of Act II content
will fix it. Change something here — crumb pacing, wave density, tower feel — before continuing.
**Everything after this step assumes this step is fun.**

## Do not

Upgrades and the targeting *mechanic* are step 12, the noise meter is step 13, Grocery Money and the
campaign frame are step 20. No new towers, no new maps.

## Reconciled while splitting

Seven things this step said that the repo has since made untrue, or that contradicted the step's own
lines. Each is fixed in the part that owns it; they are listed here so the change is on the record
rather than silently reinterpreted.

1. **"`1/2/3` with a modifier or `,`/`.` for speed"** — already settled. Step 6C decision 1 gave the
   number keys to the shop and `,`/`.` to speed, and `GameView.vue` ships it that way with a comment
   saying step 8 inherits it. C keeps the commas and drops the modifier variant.
2. **"the fridge contents as a row of food glyphs" in the TopBar** — `render/layers/fridge.ts` has
   drawn that row on the canvas since step 5C, and `effects.ts` launches a stolen item out of its
   slot. A second row in the DOM would disagree with the theft animation the moment an item goes. B
   keeps one shelf, on the board, and gives the TopBar the count plus **the name of the last item
   lost** — which is the sting `../../analytic-docs/DECISIONS.md` §6 actually asks for and the canvas
   cannot show.
3. **"targeting mode selector (stubbed until step 12)"** — `SetTargetingMode` has been executed by
   `core/systems/commands.ts` and all six modes implemented in `core/systems/targeting.ts` since step
   6B. B wires it for real. The **upgrade** buttons stay stubbed: `TowerDef` has no `upgrades` field
   at all, and `schema.ts` says so in a comment.
4. **"shift-click places repeatedly without leaving the mode"** — shipped `dev/placement.ts` is
   sticky *always* ("survives a placement, so four in a row is four clicks"). C makes a plain click
   place-and-exit with shift to stay armed, per this step; the change to shipped behaviour is
   deliberate and C says why.
5. **"noise (stubbed at 0)"** — `world.noise` is a real `NoiseState` with `level` and `cap`, filled
   by `createWorld`; only `noiseSystem` is a stub. A reads the fields rather than hard-coding 0, so
   step 13 lights the meter up with no view-model change.
6. **"enemies killed" in the night summary** — nothing counts kills. `night` has no such field and
   step 20's scoring assumes one is "already being tracked". A adds `night.enemiesKilled`,
   incremented in `resolveSystem` beside the event, rather than tallying events in the UI where a
   replay and the balance harness cannot see it.
7. **"Nights 1–3 are fully playable"** — `GameView.vue` hard-codes `nightId: 'night01'` and nothing
   advances it. C makes `NightSummary`'s *Continue* step through `NIGHTS`, as a local id in
   `GameView.vue`. Campaign progress, unlocks and persistence stay step 20's.
