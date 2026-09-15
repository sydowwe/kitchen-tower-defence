# Step 13B — Noise on screen, and the moment the light comes on

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §1 (tone) and §8,
`../../analytic-docs/ARCHITECTURE.md` §5 (the snapshot).
**Prereq:** step 13A.

## Goal

The tension mechanic, felt rather than read. A meter that starts to pulse before it is too late, a
ripple on it every time something loud goes off so cause and effect are one glance apart, the warm
wash of someone flipping the kitchen light, and a quiet card that says what it cost by name. This is
the part the mechanic is remembered by; give it the effort the simulation got in 13A.

**Build the dev panel first.** It is Build item 1 and about fifteen minutes of work, and it is what
lets you look at a wake twenty times in two minutes instead of playing to the cap each time. Every
other item in this file is tuned by looking at it.

## Already in the repo

| File | What's there now |
| --- | --- |
| `ui/components/hud/TopBar.vue:25` | the noise reading: a `volume-high` / `volume-xmark` icon and a 3.5rem `.meter` with a `.meter-fill.threat`, sized off `noiseFraction`. The file owns **no state at all** and says so — its one animation is keyed on `food.lastLostNameKey` so a changed key remounts and replays the CSS fade |
| `ui/components/hud/HudLayer.vue` | composes and re-emits; **no `core/` import anywhere under `ui/components/hud/`**. `toasts` arrives as a plain prop from `GameView.vue` |
| `ui/components/hud/StatCard.vue:81` | the noise row — always drawn, reads `Silent` at 0. Shared by the shop's hover card and the inspector |
| `ui/components/hud/ToastStack.vue` | the precedent for transient UI fed from outside the snapshot |
| `ui/viewModel.ts:419` | `noise: { level, cap, wakeCount }` in `HudSnapshot`; `TowerStatsView.noise` is `def.noise` |
| `ui/views/GameView.vue:107` | `frameEvents` — this frame's events accumulated across however many ticks ran, pushed into `pushEvents` before `drawFrame` and then cleared. `toasts` is a `shallowRef` fed by `interaction.ts`'s callback |
| `render/renderer.ts:145` | `drawFrame` — the documented draw order, `drawOverlay` last |
| `render/layers/effects.ts` | **the one layer with state**, module-local, aged in *frames* not ticks, fed only from drained events. `pushEvents(events, world)` at :208, `resetEffects()` at :507 |
| `render/layers/entities.ts:464` | `entry.mirrored = Math.cos(at.angle) < 0` — the path's forward heading |
| `render/layers/towers.ts:337` | `drawHpBar` per tower, and `hpBar.ts:32` draws nothing at full health. After a wake every tower on the board grows a bar for free |
| `render/palette.ts` | every colour as a named export. `LAMP_CORE` / `TOWER_LIGHT_CORE` are the existing warm amber, `rgba(245, 198, 107, …)` |
| `ui/locales/en.ts:31, 44, 96` | `hud.noise`, `hud.noiseLevel`, `hud.stat.noise`, `hud.stat.silent`, plus 13A's three `installation.*` entries |
| `dev/debug/state.ts` | `createDebugController(canvas, getMap)` — owns the `` ` `` toggle, guards against keys firing while an input is focused, has a `destroy()`. `GameView.vue:269` imports it dynamically inside `import.meta.env.DEV` so nothing in `dev/` reaches the production bundle |
| `ui/views/GameView.vue:186` | `restart(index)` — builds a fresh world, re-bakes, resets effects, clears the selection |
| `core/content/installations.ts` | 13A's three defs and `resolveNoiseModifiers(ids)` |

**No spec will break.** There are no tests over `render/`, and `tests/viewModel.spec.ts` asserts the
snapshot holds no reference into the world — keep every field you add a copied primitive.

## Decisions already made

1. **The wake card is fed like a toast, not like the snapshot.** `GameView.vue` holds a
   `shallowRef<WakeView | null>`, filled from the `humanWoke` event it already accumulates in
   `frameEvents`, and passes it to `HudLayer` as a prop. The snapshot is rebuilt from the world at
   15Hz and the wake is a one-tick event with a payload the world no longer has — putting it in the
   snapshot means either holding it on the world or losing it between two publishes.
2. **The warm wash and the desaturation are `render/`'s, and they age in frames.** They are
   animation, not simulation: a wash driven off `world.noise` would be in every save and every
   replay, and at 3× speed it would run three times as fast. Same rule `effects.ts` states about
   itself.
3. **The wash draws after `drawOverlay`, from its own `drawWake(ctx)` call**, not from inside
   `drawEffects`. `drawEffects` runs at the particles slot and the overlay is drawn over it; a wash
   that the placement ghost sits on top of is a wash that does not read as the room.
4. **The meter's pulse threshold is 70% and it lives in `TopBar.vue` as CSS**, driven by a class
   bound to `noiseFraction >= 0.7`. No timer, no `requestAnimationFrame`: `loop.ts` owns the single
   rAF (CLAUDE.md, the `@vueuse/core` row) and a CSS animation costs this component no state, which
   is the property the file's own comment protects.
5. **The ripple is keyed, not timed.** A `:key` that changes on each loud shot remounts the ripple
   element and replays its CSS animation — the same trick `hud.lastLost` already uses. Counting
   loud shots in the snapshot and keying on the count is the whole implementation.
6. **The shop card shows noise per *second*, not the raw per-shot value.** `projectedNoisePerSecond`
   from 13A. A Mousetrap at `noise: 2` and a Toaster at `noise: 3` read as almost the same tower; at
   0.3/sec against 0.9/sec they read as what they are, and 1.5/sec of decay is the number both are
   being compared against.
7. **The dev panel's installation toggles rebuild the night.** Checking a box calls
   `restart(nightIndex)` with a new options object. It does *not* write to `world.noise` mid-night —
   that would be a dev tool reaching inside the determinism guarantee, which is the same reason 3C's
   debug marker is a plain number in dev state and not a command.
8. **"Wake now" pushes `world.noise.level` just over the cap and lets `noiseSystem` do the rest** on
   its next tick. A dev button that called the wake itself would be a second copy of what a wake is,
   and the copy is the one that goes stale.

   **Corrected while building: `= world.noise.cap` does not wake anyone.** `noiseSystem` accumulates,
   then decays, *then* tests the cap, so a level parked exactly on the cap is one tick's decay under
   it by the time the cap is read. The panel writes `cap + 1`. Any comfortable overshoot works and
   `cap + 1` is the one to prefer over `cap + decayPerTick`: the decay clamps back to the cap before
   the test, so the wake starts from exactly the state a real one does, while
   `cap + decayPerTick - decayPerTick` is not guaranteed to land on the cap in floating point — and an
   undershoot of 1e-15 is a debug button that silently does nothing once in a while. The decision's
   reasoning is unchanged; only the value moved.

## Build

### 1. The dev panel — the instrument, built first

Three installation checkboxes, a **"wake now"** button and a live readout of `world.noise` (level,
cap, decay per second, wake count). In `dev/`, behind `import.meta.env.DEV`, dynamically imported the
way `GameView.vue` already imports the debug controller and the editor preview.

- The checkboxes resolve through `resolveNoiseModifiers` and restart the night. Say "restarts the
  night" on the panel: a silent restart mid-play looks like a crash.
- The names come from the i18n keys 13A added, not from literals.
- Verify in the build output that none of it reaches the production bundle, the way 3C and step 4
  both did. That is an acceptance criterion below, not a nicety.

This is a dev tool and it ships nothing. Do not grow it into a settings screen — step 20 is what
sells installations for Grocery Money, and this panel's whole job is to let that arrive later.

### 2. The meter in `TopBar.vue`

It is a 3.5rem bar sharing a row with two wallets today. Past 70% it has to be the thing you are
looking at without the bar ever becoming the brightest object on screen — the board is
(`DECISIONS.md` §1, chrome floats at the edges).

- Colour moves with the fraction: the calm `--kd-threat` below 70%, warmer and then hot above it.
- Past 70% it pulses. Slow enough to read as tension rather than an alarm — this is a kitchen at 2am,
  not a fail state.
- The "creak" indicator near the top: a mark at the cap end that says the meter has a top and you
  are near it. Understated. A word, not a siren.
- The `volume-high` icon already switches on `level > 0`; give it the loud state too.

### 3. The ripple

Every noisy shot puts a small ripple on the meter. `HudSnapshot` gains a counter of loud shots — sum
`towerFired` events with `noise > 0` — and `TopBar.vue` keys a ripple element on it.

Gotcha: the snapshot publishes at ~15Hz and several loud shots can land between two publishes. The
key changes once, so one ripple plays for the batch. That is correct and deliberate; do not try to
fan out one ripple per shot, because at 3× speed with six Toasters it is a strobe.

Second gotcha: the counter must be a **count**, not a boolean or a tick number. A boolean flips back
and forth and replays the animation on the way down too; a tick number changes every publish and the
ripple never stops.

### 4. The wake, on the board — `render/layers/effects.ts` and `renderer.ts`

`pushEvents` learns `humanWoke` and starts a module-local wake timer. `drawWake(ctx, width, height)`
is called from `drawFrame` **after** `drawOverlay`, and ages one frame per call. `resetEffects()`
clears it — without that, a retry opens with last night's light still on.

(Built as `drawWake(ctx, width, height)` rather than the `tilePx` this file first said: both passes
fill the whole logical canvas and neither needs a tile size. They are parameters and not an import of
`LOGICAL_WIDTH` / `LOGICAL_HEIGHT`, because `renderer.ts` already imports `effects.ts` through
`layers/index.ts` and naming it back would close the cycle.)

Two passes over the whole board, over roughly a second and a half, easing out:

- **The wash.** A warm fill at low alpha over the full logical canvas. Someone flipped the switch:
  it arrives fast and leaves slowly, and at its peak it is unmistakable without hiding the board.
- **The desaturation.** `ctx.globalCompositeOperation = 'saturation'` with a grey fill drains the
  colour out of everything already drawn. It is a real Canvas2D blend mode and it works, but it
  composites against the whole canvas and it is **sticky**: set it and forget to put
  `globalCompositeOperation = 'source-over'` back, and the next frame's first draw composites into
  the last one. The symptom is a board that turns progressively and irreversibly grey over about ten
  seconds, which reads exactly like a memory leak. Save and restore it around both passes, the way
  `effects.ts` already saves and restores `globalAlpha` with a comment explaining why.

Peak alpha and duration are the two numbers to get right, and you can only get them right by
watching one. Author them, wake a human with a dev toggle or by hand, and re-tune.

### 5. The enemies scattering — `render/layers/entities.ts`

They already walk backwards, because 13A reverses `distance`. What they do not do is turn round:
`entry.mirrored` reads the path's forward heading, so forty ants moonwalk off the board. Flip it for
a fleeing enemy.

`entry.dirX` / `dirY` drive the chew nudge and are harmless here — a fleeing enemy is never chewing,
because 13A's `barricadesSystem` skips it.

### 6. The card — `ui/components/hud/WakeCard.vue`

*"You woke someone up. Lost: 340 crumbs, one Salt Shaker."*

Understated, not a fail buzzer — `DECISIONS.md` §1, and `NightSummary.vue`'s `lostSentence` is the
house pattern for a list of names read as a sentence, down to `night.listSeparator` and
`general.and` being catalogue entries rather than literals. Reuse the shape.

It fades out on its own like the top bar's `lastLost` line, takes no pointer events, and has no
buttons: the night is still running and the player has a board to look at. Copy goes in
`ui/locales/en.ts` under a new `wake` group, with the tower names resolved through the existing
`tower.<id>.name` keys — a `defId` list arrives on the event and `ui/` is where it becomes English.

A second wake in one night replaces the first card rather than stacking one under it.

### 7. Anticipation — the shop card and the ghost

- `StatCard.vue`'s noise row shows `projectedNoisePerSecond` and says it is per second, so it can be
  compared against the decay. Keep `Silent` for 0.
- The placement ghost: a tower about to be placed says what it will add. `OverlayView` and
  `drawOverlay` are plain resolved data by design — the caller (`ui/interaction.ts`) looks the def up
  and resolves everything, and `render/layers/overlay.ts` is a pure draw. Keep it that way: resolve
  the number in `interaction.ts` and add a field to `OverlayGhost`, do not import the def or
  `noiseFraction` into `render/`.

## Tests

**None.** `../../analytic-docs/ARCHITECTURE.md` §7 — no tests over `render/`, and bugs here are
visible. 13A's suite is the regression net for everything underneath, and the dev panel is a dev
tool: a spec over it would assert that a button you are looking at exists.

Re-run `npm run test` after Build item 1 anyway. The panel is the first caller of
`resolveNoiseModifiers` outside a spec, and an id typo there surfaces as a throw at the moment you
tick a box.

## Acceptance

- [x] "Wake now" fires a wake, and ticking Close the Kitchen Door and White-noise Machine together
      shows a cap of 155 in the panel's readout with Oil the Hinges taking the decay to 2/sec.
- [x] The production bundle contains no `dev/` code — check the build output.
- [ ] At 65% the meter is legible and calm; at 75% you notice it without looking for it; at 95% you
      are doing something about it. Judge this while playing, not from a screenshot.
      *(Not judgeable yet, and not only by a session: night 1 cannot reach 70% of a cap of 100 with
      the towers it can afford — one Mousetrap is 0.3/sec against 1.5/sec of decay, which is the
      measurement `core/systems/noise.ts` hands to step 22. At rest the calm state is confirmed
      correct: `--kd-threat`, no pulse, creak at opacity 0, `volume-xmark`. The warm, pulsing, creaking
      state above 70% has never been on screen.)*
- [x] Placing a Mousetrap and watching it fire, you can point at the ripple and say "that one".
      *(Three shots over one wave; the ripple element was replaced and its animation replayed on the
      same publish the level jumped ~2.0, fading 0.66 → 0.06 over ~340ms each time.)*
- [ ] The wake reads as *someone came in*, not as a game-over screen. Watch it three times; if the
      third one still makes you flinch rather than wince, it is too loud.
- [x] The board is unmistakably desaturated at the peak of the wash and is back to full colour
      afterwards — and stays that way over ten more wakes. This is decision 3's sticky composite op.
      *(Measured off the canvas over the fridge shelf. Rest: mean saturation 0.277. Peak of the wash:
      **0.097**, a 65% drop, coinciding with the brightest frame. Back to 0.277 exactly afterwards,
      and still 0.277 after ten overlapping wakes. `globalCompositeOperation` reads `source-over` at
      rest, mid-wash and late in the wash, so the op is not leaking.)*
- [x] Enemies face the direction they are running.
      *(Walking right before the wake, drawn mirrored and running left after it, heads leading.)*
- [x] The card names what it cost, by name, in one sentence, and is gone before you have finished
      reacting to it.
      *("You woke someone up. Lost: 6 crumbs." against a top bar reading `+6` on the floor. The
      zero case reads "It cost you nothing, this time." No tower was destroyed in either observed
      wake, so the `{n} × {name}` branch has not been on screen.)*
- [x] Standing in the shop, you can tell the Toaster is the loud one without doing arithmetic.
      *(Confirmed on screen: the Toaster's card reads `Noise 0.9/sec` against the Mousetrap's
      `0.3/sec`. The placement ghost carries the same number under the tile.)*
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

Two left, and they are the two this file always said were a human's.

**The wake's tone** — whether it reads as *someone came in* rather than as a fail state, watched three
times — is the one criterion no measurement reaches. `WAKE_WASH_PEAK` (0.3), `WAKE_DESATURATE_PEAK`
(0.8) and `WAKE_LIFE_FRAMES` (96) in `render/layers/effects.ts` are the three numbers to move, and the
dev panel's "Wake now" button is how to see them.

**The meter above 70% has never been on screen**, and that is a fact about the noise curve rather than
about the HUD: one Mousetrap is 0.3/sec against 1.5/sec of decay, so a night-1 board cannot get near a
cap of 100 at all. Seeing the warm, pulsing, creaking state needs either a stack of loud towers bought
with crumbs a night does not hand out yet, or step 22's sweep. **Do not tune the curve to make it
visible** — that is exactly the trade this file's *Do not* section forbids.

One thing found by watching and already fixed: authored at the lamp's full-chroma amber, the wash came
out measuring the board *more* saturated at its peak than at rest (0.38 against 0.27), because the
warm pass is drawn over the desaturating one and put the colour straight back. `WAKE_WASH` is now a
warm off-white and the peak measures 0.097. See the note on it in `render/palette.ts`.

## Do not

Touch `core/`. Every number on screen here already exists on the snapshot or on the event; if one
does not, the missing piece is 13A's and this part adds a field to `viewModel.ts`, never a field to
the world. Do not put the wake in a store or the wash in `world`. Do not add a second rAF.

**Do not re-tune a noise value or a night.** You will be looking at the meter for the first time and
it is the moment the temptation lands — but whether Act I can reach the cap at all needs a
measurement, and step 22 is the step that measures, with peak noise, wake count and a sweepable noise
decay already on its metrics list. If a night feels wrong, write down what you saw and leave the
number where it is. The dev panel's cap and decay toggles are how you explore the question without
committing to an answer.

Do not grow the panel into a Grocery Money shop, an unlock schedule or a loadout screen — all step
20's.
