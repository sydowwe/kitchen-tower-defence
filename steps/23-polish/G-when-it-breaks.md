# Step 23G — When it breaks

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md` (*Determinism rules*), `../../analytic-docs/ARCHITECTURE.md` §2
and §3.
**Prereq:** step 23D, for the pause rule. Independent of E and F.

## Goal

Determinism has been paid for since step 2, and this is where it pays out to a player. A night is
recorded as it's played: the options that built it, plus each command and the tick it landed on.
When something throws, the board doesn't just freeze. A card says so and offers the recording as a
file, and `core/replay.ts` plays that file back to the same state. Also, the game pauses when the
window loses focus, and comes back from a tab-out calmly. **This part carries the step's only
determinism test.**

## Already in the repo

Trust symbols over line numbers.

| File | What's there now |
| --- | --- |
| `core/sim.ts` `tick(world, queue)` | Drains the queue at the top, runs every system, then `world.tick++`. A batch drained while `world.tick === t` is applied at tick `t` |
| `core/commands.ts` | Commands are plain data: "that is what lets `(seed, mapId, nightId, commandLog)` be written to a crash report and replayed". **There's no command log anywhere** |
| `core/world.ts` `CreateWorldOptions` | `seed`, `mapId`, `nightId`, `difficulty`, `modifiers?`, `loadout?`. `modifiers` are resolved numbers, kept so a replay doesn't depend on an installation that has since been re-priced |
| `tests/night.spec.ts` | Determinism over the event log and the world. Its `playOut` kills enemies by **writing `enemy.hp = 0`**, which a recording can't capture |
| `loop.ts` | `frame()` calls `advance()`, which runs `tick()` and `draw()`, and only re-arms `requestAnimationFrame` **after** `advance` returns. The 250ms clamp. `pause()` |
| `ui/views/GameView.vue` | `optionsFor(progress)` returns `{ options, records }`. Under dev overrides, `previewMap` is **assigned onto the world after `createWorld`**, and `onDevWakeNow` writes `world.noise.level` directly. `SetSpeed` is enqueued for the log, and the sim ignores it |
| `main.ts`, `ui/App.vue` | No `app.config.errorHandler`, no `onErrorCaptured`, no `window` error listeners |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **`core/replay.ts` defines `Recording = { version, options: CreateWorldOptions, log: { tick,
   commands }[], ticks }`.** Only non-empty batches are logged, so a ten-minute night is a few
   hundred entries rather than 36,000. The step's four-tuple is short: difficulty, the resolved
   modifiers and the loadout build the world too. The whole `CreateWorldOptions` is the only shape
   that can't be missing a field.
2. **Recorded by wrapping the queue.** `createRecorder(queue, tickOf)`'s `drain()` logs its batch
   against the tick it's drained on, and `GameView` hands `tick()` the recorder. Nothing goes on
   `World`. The world is the state and the log is the input, and a world carrying its own history
   would bloat every save and every snapshot the specs take.
3. **A throw inside the loop is caught in the loop.** `frame()` only re-arms rAF after `advance()`
   returns, so today a single throw stops the board for good. It also happens outside Vue's call
   stack, so `app.config.errorHandler` never sees it. Wrap the callbacks, or `advance`, so a throw
   stops the loop on purpose and reports. Add `errorHandler` too for throws in components, and
   `window`'s `error` and `unhandledrejection` for anything else.
4. **The report is a file download**, `kitchen-defense-<nightId>-tick<N>.json`: the recording, the
   error's message and stack, and the build. Nothing is sent anywhere. The crash card is written in
   DECISIONS.md §1's voice. It offers the file and a way back to the Kitchen.
5. **A night built under a dev override is recorded but marked `reproducible: false`.**
   `previewMap` and `onDevWakeNow` change the world outside the options and the commands, so its
   replay can't match, and the report shouldn't claim it will.
6. **Blur and hidden pause, and don't resume.** `window`'s `blur` and `visibilitychange` to hidden
   both pause the loop. Coming back leaves it paused, and the player resumes. That's the one pauser
   D's restore rule exempts. The 250ms clamp already stops the spiral. This stops the night running
   on while you're somewhere else.

## Build

### 1. `core/replay.ts`

`createRecorder`, and `replay(recording, uptoTick?)`, which returns the world.

Gotcha: **log each batch with the tick it's applied on.** `tick()` drains before any system runs,
and increments `world.tick` at the end. Read the tick inside `drain()`. A log written after `tick()`
returns is one tick late for every command. Replays like that still pass on a quiet night, then
diverge on any night where a tower placed a tick later catches a different ant.

### 2. The loop and the boundary: `loop.ts`, `main.ts`, `GameView.vue`, `ui/components/CrashCard.vue`

Decisions 3–5. Only a night can produce a recording. A throw on the Kitchen gets the same card
without the file.

Gotcha: after a crash, stop the loop. Calling `tick()` again on a world that threw mid-system is
running half a tick on top of half a tick.

### 3. Blur and tab-out: `GameView.vue`

Decision 6. Listen on `window` and `document`, and remove both listeners in `onBeforeUnmount`.

## Tests

`tests/replay.spec.ts`, played through **commands only**. Don't use `night.spec.ts`'s `playOut`,
which writes `hp` directly.

- A night 1 world behind a recorder: `PlaceTower` at tick 0, a second `PlaceTower` at tick 900,
  `CallWaveEarly` during the first countdown, `CollectCrumb` on the first pile that lands, then run
  to `nightEnded`. `replay(recording)` deep-equals the original world, and its events match tick for
  tick.
- At least one command's timing matters: the same log with that command one tick later gives a
  different final world. Assert that too, so the spec shows it can catch decision 2's off-by-one.
- The recording survives `JSON.parse(JSON.stringify(…))` and still replays equal.
- A tick with no commands adds no log entry.

## Acceptance

- [ ] Throw on purpose inside a system during a night (temporarily): the board stops, a card says so
      in one quiet line, and the file downloads.
- [ ] That file, fed to `replay` in a spec or the console, reaches the same `world.tick` and the same
      state.
- [ ] Throw inside a Kitchen component: the same card, with no file.
- [ ] Alt-tab during a wave: the night is paused when you come back, and nothing jumped.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

Leave every judgement criterion unticked unless you actually sat and looked.

## Hands to the next part

```
core/replay.ts   interface Recording
                 createRecorder(queue: CommandQueue, tickOf: () => number): CommandQueue & { log(): Recording['log'] }
                 replay(recording: Recording, uptoTick?: number): World
```

Step 22's harness can write and read the same format.

## Do not

No replay viewer, no upload, no telemetry: the file stays on the player's machine. No saving a night
mid-play (ARCHITECTURE.md §8: nights aren't resumable). No change to what `tick()` does.
