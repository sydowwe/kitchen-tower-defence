# Step 23D — Settings

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/ARCHITECTURE.md` §5 and §8,
`../../analytic-docs/PERSISTENCE.md` §2 and §6.
**Prereq:** steps 23A, 23B and 23C.

## Goal

One place to set the game up the way you like it: volumes, screen shake, damage numbers, the
colour-blind palette, the keys. It opens from the title, the Kitchen and the night, and every knob is
saved in one record. **This part writes the settings record for the whole step**, including F's seen
hints. After it, nothing else in step 23 adds a settings field. Tests: the migration and the rebind
rule.

## Already in the repo

Trust symbols over line numbers.

| File | What's there now |
| --- | --- |
| `data/dto/settings.ts` | `settingsSchemaV1 = { speed: 1 \| 2 \| 3 }`, `settingsCodec` at version 1, `migrations: {}` |
| `data/ports/index.ts` | `Settings { speed: PlaySpeed }`. `PlaySpeed` reaches `ui/` through `ui/composables/useSettings.ts`'s re-export |
| `data/dto/progress.ts` | The model migration: `progressV1ToV2` parses with the v1 schema and adds the new field's default |
| `ui/stores/settings.ts` | A local `defaultSettings()`. The one **optimistic** store: `update(patch)` assigns, and `useSettings` saves on a 500ms debounce. Stores can't import `data/` (`dataBan`) |
| `ui/views/TitleView.vue`, `GameView.vue` | Both call `settings.ensureLoaded()`. `GameView.restart` applies `settings.speed` |
| `ui/interaction.ts` `onKeyDown` | `event.code === 'Space'` for pause, and **`event.key`** for `,` `.` `n` `x` `u` `Escape` and the digits. `hotkeyTowers(loadout)[typed === 0 ? 9 : typed - 1]` |
| `ui/viewModel.ts` `hotkeyLabel` (not exported) | `'1'`..`'9'`, then `'0'`: the shop's badge, `ShopEntry.hotkey` |
| `ui/locales/en.ts` | `hud.sellKey` ("Sell this tower  (x)"), `hud.upgradeKey`, `hud.callWaveKey`, and `debug.hint`, which spells out every key. `settings: { title, volume, showFps }` is left over from step 1, and nothing reads it |
| `ui/components/kitchen/ResetProgress.vue` | 20D's reset, with its save states, in the Kitchen's footer |
| A, B, C | `setPaletteVariant` plus `data-palette`; `setScreenShake`, `setDamageNumbers`; `setVolume(bus, v)` and `AUDIO_DEFAULTS`. Each has a default, and none is persisted |
| **Specs that will break** | `tests/persistence.spec.ts` asserts that `settingsCodec.version` is `1` and saves `{ speed: 2 }`. `tests/progressStore.spec.ts` asserts the store `toEqual({ speed: 3 })` |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **The record goes to v2 once, with everything in it:** `speed`, `volumes: Record<Bus, number>`,
   `screenShake`, `damageNumbers`, `palette`, `bindings: Record<Action, string>`, `seenHints:
   string[]`. The v1-to-v2 migration adds each field's default. F only appends to `seenHints`. It
   adds no field.
2. **`seenHints` isn't checked against a list.** F hasn't written its ids yet, and a stale id is
   inert: it never matches anything. Unlike a dropped installation, dropping it would take nothing
   from the player, and keeping it costs nothing.
3. **Bindings store `KeyboardEvent.code`, not `key`.** `code` is the physical key, so a binding
   survives a switch of keyboard layout. Reading `key` is why the digit hotkeys don't work on an
   AZERTY keyboard today, where the number row's `key` is `&é"'…`. **The labels on screen come from
   the bindings:** the shop badge, the three tooltips (which take a `{key}` parameter now), and
   `debug.hint`. Symptom otherwise: rebind "call wave" to W, and the tooltip still says N.
4. **The actions** are pause, speed down, speed up, call wave, sell, upgrade, and the ten tower
   slots. **Escape stays Escape** and can't be rebound, because it closes every panel, this one
   included. **`rebind(bindings, action, code)` is pure and swaps on a conflict**: the action that
   had the key takes over the key being replaced. A key never does two things, and a rebind never
   silently unbinds anything.
5. **Settings is a panel, not a route.** A route away from `/night` unmounts `GameView`, and the
   world with it, and nights aren't resumable (ARCHITECTURE.md §8). One `SettingsPanel` component,
   opened from the title, the Kitchen and a control in the night's HUD. In a night it pauses while
   it's open.
6. **Every automatic pause restores what it found.** This panel is the first of three automatic
   pausers, with F's first prompt and G's blur after it. Opening remembers `loop.paused`, and closing
   puts that back. It never calls `resume()` blind. That's what lets them compose: close Settings
   while night 1's first prompt is holding the clock, and the hold is still on. Only G's blur pauses
   without ever resuming.
7. **One applier.** A single `watch` on the settings store, at App level, pushes every knob to
   `render/` and `audio/` and sets `document.documentElement.dataset.palette`. It runs once on load
   and again on every change. Not a store plugin, and not per component: with two appliers, a slider
   moves the sound on one screen and not on another.
8. **No reset in Settings.** 20D's Reset lives in the Kitchen, with its save states, and a second
   copy is a second failure path to keep honest. The panel's one destructive control is "show the
   first-night hints again", which clears `seenHints`.

## Build

### 1. The record: `data/ports/index.ts`, `data/dto/settings.ts`, `ui/composables/useSettings.ts`, `ui/stores/settings.ts`

Decisions 1–4. Take the defaults from A's, B's and C's code rather than inventing them. The store
gets `markHintSeen(id)` and `resetHints()` for F.

Gotchas:

- **`defaultSettings()` and the migration's defaults have to be one function.** With two copies, a
  new player and a migrated player start with different volumes, and nothing ever notices. The
  store can't import `data/`, so put the settings types, the action list and `defaultSettings()` in
  `data/`, and re-export them through `useSettings.ts` the way `PlaySpeed` already is.
- `data/` imports neither `render/` nor `audio/`, so the bus and palette unions are restated there.
  The applier (decision 7) is where they meet: assert there, with `satisfies`, that the two agree.
  Then a new bus is a type error, not a slider that silently never saves.

### 2. The keys: `ui/keys.ts` (new), `ui/interaction.ts`, `ui/viewModel.ts`, `en.ts`

Decisions 3 and 4. `ui/keys.ts` holds `defaultBindings`, `rebind` and `keyLabel(code)`, which turns
`KeyN` into `N`, `Digit1` into `1`, and `Comma` into `,`.

Gotcha: while the panel is capturing a key to bind, the game's handler must not act on it as well.
Symptom: binding a key to "sell" sells the selected tower. `interaction.ts` listens on `window`, so
capture in the capture phase and stop propagation, or have the handler check the panel's state
first. Keep `isTypingTarget` as the first check in `onKeyDown`.

### 3. The panel: `ui/components/SettingsPanel.vue` and its pieces, `TitleView.vue`, `KitchenView.vue`, the night's HUD, `GameView.vue`, `icons.ts`

Decisions 5, 6 and 8. A gear icon through `icons.ts`, imported per icon. The panel opens over
whatever is there, and Escape closes it. Replace `en.ts`'s step-1 `settings` block, and write the
copy in DECISIONS.md §1's voice.

### 4. The applier

Decision 7.

## Tests

In `tests/persistence.spec.ts` and `tests/progressStore.spec.ts`, plus a new `tests/keys.spec.ts`:

- A stored v1 record `{ speed: 3 }` loads as v2 with `speed: 3`, and every other field equal to
  `defaultSettings()`'s.
- A v2 record round-trips through `toDto` and `fromDto` unchanged, `seenHints` included, unknown ids
  and all.
- A v2 record with an unknown action in `bindings` loads with that entry dropped, and with the
  default for every known action present.
- `rebind(defaultBindings, 'callWave', 'KeyX')` gives `callWave: 'KeyX'`, and gives `sell` the key
  call-wave had. Nothing else moves.
- `keyLabel('Digit0')` is `'0'`, and the shop's badges follow the bindings, not a fixed `'1'`..`'0'`.
- Update the two specs that break to the v2 shape. Don't delete their assertions.

## Acceptance

- [ ] Each volume slider changes the sound while you drag it, in a night and from the title.
- [ ] Shake off: the Mousetrap no longer shakes the room. Numbers off: no damage numbers, and the
      crumbs' `+N` is still there.
- [ ] Colour-blind palette on: the placement ring's yes and no survive a deuteranopia emulation, on
      the board and in the HUD.
- [ ] Rebind "call wave" to W: W calls it, N doesn't, and the tooltip says W. Rebind it to X: sell
      moves to N.
- [ ] Opening Settings in a night pauses it, and closing it restores whichever pause state it found.
- [ ] Reload: everything is as you left it.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

Leave every judgement criterion unticked unless you actually sat and looked.

## Hands to the next part

```
ui/stores/settings.ts   settings.value.seenHints: string[]
                        markHintSeen(id: string): void
                        resetHints(): void
```

And decision 6's rule, which F and G both follow.

## Do not

No hint content, tutorial or seen-hint logic (F). No codex (E). No difficulty setting: step 21
puts difficulty on the title and in the progress record, not here. No second Reset (decision 8). No
gamepad or touch.
