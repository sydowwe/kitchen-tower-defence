# Step 23C — Sound

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §1 and §8,
`../../analytic-docs/ARCHITECTURE.md` §2, `../../analytic-docs/OPEN-QUESTIONS.md` §1 (the *Audio
direction* row only).
**Prereq:** step 23B.

## Goal

The kitchen gets a sound. There's a quiet ambient hum (the fridge, a clock), a voice for towers and
for deaths, and above all a noise meter you can hear: loud towers sound loud, and the approach to the
cap gets audibly tense. The Mouse arrives with a sound of its own, which step 19 asked for and left
here because it had no audio to put it in. **Tests: one lint case** for the new directory's fence.
The rest is audible, so it isn't tested.

## Already in the repo

Trust symbols over line numbers.

| File | What's there now |
| --- | --- |
| `ui/views/GameView.vue` `draw()` | `pushEvents(frameEvents, world)`, then `frameEvents.length = 0`. The one place where every tick's events are seen at frame time |
| B's events | `towerPlaced`, `towerUpgraded`, `towerSold` (with `tile` and `defId`), `towerFired { noise }`, `enemyKilled`, `enemyLeaked`, `humanWoke`, `thiefGrabbed`, `thiefEscaped`, `waveStarted`, `nightEnded`, `crumbCollected` |
| `world.noise` | `level`, `cap`, `decayPerTick`, `wakeCount`, `peakLevel` |
| `ui/components/hud/TopBar.vue` | `const PULSE_AT = 70`, a percentage: past it the meter warms, pulses and says "Creak". It lives inside the component |
| `ui/viewModel.ts` | `thiefInWave` and `buildThiefBanner`: whether a wave brings the Mouse |
| `loop.ts` | `paused` and `speed`. Speed runs more ticks per frame |
| `eslint.config.js` | Lanes for `core/`, `render/`, `ui/`, `data/` and `dev/`. **None for `audio/`** |
| `tests/lint.spec.ts` | The persistence fence, asserted through ESLint itself. The pattern for a new fence |
| `OPEN-QUESTIONS.md` §1 | "Audio direction … No decisions on music, ambience, or whether there's a soundtrack at all … Step 23" |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **Raw WebAudio, no library.** Howler earns its place with an HTML5-audio fallback and sprite
   sheets. An evergreen desktop browser needs neither. A library here would also need its own lane in
   `eslint.config.js` and a row in CLAUDE.md's table.
2. **`src/audio/` is a lane beside `render/`.** It reads `core/` (events and the world's noise) and
   never writes to it. It imports nothing from `ui/`, `data/` or `render/`, and no app library. Add
   the block to `eslint.config.js`, and the directory to CLAUDE.md's layering section.
3. **Cues are synthesized, and a file overrides one by name.** A session can't record a fridge.
   Every cue gets a WebAudio recipe (oscillators, filtered noise, envelopes) that costs no bytes. A
   file at `assets/audio/<cue>.<ext>`, found through `import.meta.glob`, replaces its cue, the way
   `render/sprites.ts` matches a PNG to a glyph. Adding a real recording later is a file drop. **The
   byte budget is whatever 3MB minus the rest of the build leaves.** The build was about 1.1MB when
   this was written, so the step's 2MB for audio doesn't exist.
4. **No music.** OPEN-QUESTIONS.md §1 asks. At 2am the kitchen is quiet, and that quiet is what lets
   a mousetrap and the meter land. Ambience (a fridge hum, a clock) and sound effects only. Strike the
   row and write the answer there.
5. **Three buses: `master`, `effects`, `ambience`.** **The noise layer rides `effects`**, not
   `ambience`, because it's information. A player who turns the atmosphere off must still hear the
   house stirring.
6. **The tension threshold is the HUD's.** The point where the sound turns is `PULSE_AT`'s 70%. Move
   the constant out of `TopBar.vue` to one place both can read. Audio can't import `ui/`, so it goes
   beside the meter, for example in `core/systems/noise.ts`, and TopBar imports it from there. With
   two copies, the sound and the pulse drift apart.
7. **Loud towers sound loud.** A `towerFired` with `noise > 0` plays at a gain taken from its noise.
8. **Fed from the same drain as B's effects**, `frameEvents` in `draw()`, plus one `update` per frame
   that reads the meter. Never from `world.events` once a frame: at 3× that's one tick of three (5C,
   decision 2).

## Build

### 1. The engine: `src/audio/`

One `AudioContext` for the page, created lazily and resumed on the first user gesture. The buses.
Cue playback with a per-cue throttle and a voice cap. The file-override table. `setVolume`.

Gotchas:

- **The context starts suspended, and stays suspended unless `resume()` is called from a user
  gesture.** The normal way in has clicks on it, but a reload straight onto `#/night` doesn't.
  Symptom: a silent night after a reload, and only then. Resume on the first `pointerdown` or
  `keydown` anywhere.
- **Don't create a context per night.** `GameView` mounts once per night and once per Retry.
  Browsers cap how many contexts can be live, and one per mount is how the sound disappears after a
  few Retries. Suspend on unmount and reuse it on the next.
- **At 3× with forty towers there are hundreds of `towerFired` a second.** Without a per-cue minimum
  interval and a voice cap, night 15 is crackle and a pegged audio thread. Throttle per cue, not
  globally, or the Mousetrap's snap is lost under the Salt Shakers.
- Suspend the context on `visibilitychange` to hidden. G pauses the loop on blur, and a hidden tab
  that keeps humming is a bug report.
- If a file overrides a cue, pick a format every engine's `decodeAudioData` accepts. MP3 decodes
  everywhere. Check Safari before choosing Ogg.

### 2. The cues

Towers by the kind of shot. `enemyKilled`. `enemyLeaked`, where the item leaving is a sting, not a
crunch. `towerPlaced`, the thunk. `towerUpgraded`. `towerSold`, which the step asks to be distinct.
`crumbCollected`, the most repeated sound in the game: short, soft and pitch-varied, or it grates by
wave 3. `humanWoke`: footsteps and a light switch. The Mouse's arrival on its `waveStarted`.
`nightEnded`, won and lost.

### 3. The noise meter, audible: `update(world)`

Decisions 5–7. Something that rises with `level / cap` (a floorboard settling, a held breath, a low
hum opening up) and changes character at 70%. It's **relative to the cap**. With Close the Door and
the White-noise Machine the cap is 155, and a sound keyed on the raw level goes tense at 32%.

### 4. The wiring: `GameView.vue`, `eslint.config.js`, `CLAUDE.md`, `OPEN-QUESTIONS.md`

While paused, the ambience carries on, the meter's layer holds where it is, and nothing fires,
because no ticks run.

## Tests

In `tests/lint.spec.ts`, beside the persistence fence: a file under `src/audio/` that imports `vue`
errors with `no-restricted-imports`, and so does one that imports `@/ui/viewModel.ts`. One that
imports `@/core/types.ts` doesn't.

## Acceptance

- [ ] The noise meter is tense to listen to. Play night 8 with three Toasters and hear it coming
      before you see it.
- [ ] A Mousetrap sounds louder than a Salt Shaker, and you can pick out a Toaster by ear.
- [ ] Night 15 at 3× doesn't crackle, and the snap still cuts through.
- [ ] The Mouse's arrival is unmistakable with your eyes shut.
- [ ] A reload straight onto `#/night` plays sound after the first click.
- [ ] Ten Retries in a row, and there's still sound.
- [ ] Tab away and it goes silent. Come back and the kitchen is there.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green, and the
      bundle has grown by the engine and nothing else.

Leave every judgement criterion unticked unless you actually sat and listened.

## Hands to the next part

```
audio/index.ts   type Bus = 'master' | 'effects' | 'ambience'
                 setVolume(bus: Bus, value: number): void   // 0..1, applied at once, persisted by D
                 AUDIO_DEFAULTS: Record<Bus, number>        // D copies these into the record's defaults
```

## Do not

No music. No settings UI and no persistence (D). No `core/` change beyond moving the threshold
constant. No sound on the title, Kitchen or loadout screens: the daytime is a different room. Don't
commit a third-party audio file without its licence written down beside it.
