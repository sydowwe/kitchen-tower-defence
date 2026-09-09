# Step 8B — The HUD: six components and the layer they live in

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../../CLAUDE.md` (the Vue block and *What goes in a store*),
`../../../analytic-docs/ARCHITECTURE.md` §5, `../../../analytic-docs/DECISIONS.md` §1 (tone — reread it
before writing a single class name) and §6 (the fridge is the health bar).
**Prereq:** step 8A.

## Goal

The interface itself: a top bar you read at a glance, a shop you buy from, an inspector, wave and
speed controls, a night summary worth reading, and a toast stack. All of it DOM over the canvas, all
of it fed by 8A's snapshot, none of it touching the world. At the end of this session the game *looks*
playable; 8C is what makes the mouse and keyboard reach it.

## Already in the repo

| File | What's there now |
| --- | --- |
| `ui/views/GameView.vue` | `.stage` is a 1-cell grid; `.board` and `.hud` both sit in `grid-area: 1 / 1` at `aspect-ratio: 1152 / 672`, CSS-scaled to the window. **`.hud` is already `pointer-events: none`** with the comment saying children opt back in |
| `ui/components/DebugOverlay.vue` | step 1's fps panel — the house style for a HUD component: scoped styles, `--kd-*` variables, `font-variant-numeric: tabular-nums`, and a comment saying it deliberately does *not* opt back into pointer events |
| `ui/App.vue` | the global `:root` palette: `--kd-night`, `--kd-night-soft`, `--kd-lamp`, `--kd-text`, `--kd-text-dim`. `--kd-night` is duplicated in `render/palette.ts` as `BACKGROUND`, with a comment on each side |
| `render/palette.ts` | the canvas half of the same palette, named by **role** because step 23 retunes every value. `render/` cannot read CSS variables; that is why the duplication exists |
| `render/layers/fridge.ts` | draws the fridge's remaining items as a shelf **on the board**, one fixed slot per index in `night.food`, never re-flowed. `effects.ts` launches a stolen item out of its slot |
| `dev/editor/panels/*.vue` | the only existing component set: `defineModel`, type-based `defineProps`/`defineEmits`, `template → script → style`, one attribute per line. Read one before starting — it is dev-only and not your style target, but it is the repo's Vue idiom |
| `ui/icons.ts` | `faPlay, faPause, faForward, faGear, faVolumeHigh, faVolumeXmark, faLock, faBan, faArrowUp, faTrash, faCoins, faTriangleExclamation, faXmark` already registered. The only file allowed to import an icon package |
| `ui/locales/en.ts` | 8A's keys, including `hud.reject.*` and `night.*` |
| `ui/viewModel.ts`, `ui/selection.ts` | 8A's `HudSnapshot`, `ShopEntry`, `TowerStatsView`, `TowerInspectorView`, `NightSummaryView`, `createSelection()` |
| `core/types.ts` | `TargetingMode` = `FIRST \| LAST \| STRONGEST \| WEAKEST \| CLOSEST \| RANDOM`, `NightPhase` = `building \| wave \| countdown \| won \| lost` |
| `core/content/schema.ts` (~line 275) | the comment recording that `TowerDef` has **no `upgrades` field** — "the step that adds the mechanic extends this schema" |

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **The components live in `ui/components/hud/`**, one file each, and `HudLayer.vue` composes them.
   `GameView.vue` mounts `HudLayer` and nothing else: that file already owns the canvas, the loop,
   the world and the dev imports, and it is the most load-bearing file in the repo.
2. **The HUD is over the board, not around it.** `.hud` stays the same box as the canvas. A DOM bar
   *outside* it would shrink the board, and `../../../analytic-docs/DECISIONS.md` §1 wants the board to
   be the brightest thing on screen — chrome floats at its edges on translucent panels.
3. **HUD chrome is sized in `rem`, not in board units.** The board scales with the window; the HUD
   does not. At 1920 wide a scaled HUD would be printing 20px text, and at 1280 it would be
   unreadable. This is what the step file's "below 1280 wide, scale the canvas rather than reflowing"
   already implies — the canvas scales, the chrome is fixed.
4. **Every element that takes input opts back in with `pointer-events: auto` on itself**, never on a
   wrapper and never on `.hud`. Symptom of getting it wrong: crumbs stop being clickable through
   whichever third of the board the wrapper covers, and it reads as the step 7C hit test having
   regressed.
5. **One shelf, and it is the canvas one.** The TopBar shows `remaining / total` plus **the name of
   the last item lost**, briefly, and does not draw a second row of food glyphs.
   `render/layers/fridge.ts` has drawn that row since step 5C and `effects.ts` animates a theft out
   of its slot; a DOM copy disagrees with the animation the moment an item goes, and the sting
   `DECISIONS.md` §6 asks for is the *name*, which the canvas cannot show. This overrides the step
   file's TopBar line, deliberately.
6. **Components are pure: props in, named events out.** Not one of them imports `core/`, `render/`,
   the command queue or the world. 8C wires them. A component that reached into the world would be
   the second write path the whole architecture exists to prevent.
7. **The targeting selector is real; the upgrade buttons are the stub.** `SetTargetingMode` has been
   executed by `core/systems/commands.ts` and all six modes implemented in `targeting.ts` since step
   6B, so wiring the selector costs one emit. `TowerDef` has no `upgrades` field at all — render the
   tier readout and a disabled button, and say step 12 in a comment.
8. **Numbers get `font-variant-numeric: tabular-nums`**, following `DebugOverlay.vue`. A crumb
   counter whose digits change width as it ticks up reads as broken.
9. **FontAwesome for chrome only, emoji for anything that is an entity.** Every icon the HUD needs is
   already registered in `ui/icons.ts`; if you need another, add it there one by one and never
   `library.add(fas)`.
10. **The emit contract's types come through `ui/viewModel.ts`, not from `core/`.** Written during the
    build: acceptance says no `hud/` component may import `core/`, and the contract below is typed in
    `DefId`, `EntityId`, `TargetingMode`, `NightPhase` and `Speed`. `viewModel.ts` already depends on
    `core/` and is the HUD's seam, so it re-exports those five (plus `DamageType` and `TargetClass`)
    as types. A component that reached past it for "just one type" is one refactor from reaching past
    it for a system, and the import graph is the only thing that catches that.
11. **No Pinia.** Nothing here outlives the view: the snapshot is a `shallowRef` in `GameView.vue`
    and the selection is 8A's module. `../../../CLAUDE.md`'s *What goes in a store* names the HUD snapshot
    explicitly as something a store must not hold — in one, someone eventually `storeToRefs`es it
    into deep reactivity.

## Build

### 1. `ui/components/hud/TopBar.vue`

Clock (`2:00am` → `6:00am`), wave `n / m`, crumbs 🍞 with the on-board total beside it, Grocery Money
💵, the noise meter, and food.

- **Food is the loudest element in the bar.** It is the health bar; nothing else in the top bar
  competes with it. When `lastLostNameKey` changes, say what went — "lost: the good cheese" — and let
  it fade. That one line is the whole of `DECISIONS.md` §6 in the HUD.
- The noise meter is present and reads 0 all night (step 13 fills it). Draw it as a real meter
  against `cap`, not as a number: a bar that never moves is honest, a `0` is clutter.
- Grocery Money likewise reads 0 until step 20. It is in the step file's list, so it stays — if it
  reads as dead chrome when you look at it, that is a finding for the play pass in 8C, not a reason
  to silently drop it.

### 2. `ui/components/hud/TowerShop.vue`

A row of emoji buttons: glyph, cost, `1`–`9` index, lock state, armed state from
`selection.selectedDefId`.

- **Unaffordable entries dim but stay hoverable and stay clickable** — the player wants to read what
  they are saving for, and arming a tower you can't afford yet costs nothing (8C's click check
  refuses it with the reason).
- Hover shows the stat card off `ShopEntry.stats`: damage, rate, DPS, range, damage type, targets,
  noise — or income and collect radius for an economy tower, where 8A gives you nulls rather than
  zeroes. Show the description key too; it is the only place the flavour text is ever read.
- The card must not push the layout around. Position it absolutely over the board, above the shop.

Built as a seventh component, `hud/StatCard.vue`, because the inspector renders the same block off
the same `TowerStatsView`. Hover is **CSS only** (`.tower:hover + .card-slot`): every entry renders
its card hidden, so the shop owns no hover ref and an unaffordable tower behaves identically to an
affordable one.

### 3. `ui/components/hud/TowerInspector.vue`

Appears when `snapshot.inspector` is non-null: glyph, name, tier, the live stat card, targeting mode
selector, disabled upgrade button, and a sell button showing **the actual refund**, with the penalty
called out when `refundIsPenalised`. A sell button that says "70%" while the sale pays 50% is worse
than one with no number on it.

### 4. `ui/components/hud/WaveControl.vue`

"Call next wave" with the live `earlyCallBonus`, the countdown as seconds, and pause / 1× / 2× / 3×.

- The call button is only meaningful in `'countdown'`. Disable it elsewhere rather than hiding it, so
  the control doesn't move.
- Pause and speed are **separate** states (`loop.ts` has both) — light the pause button *and* the
  current speed, and let 8C decide what pressing a speed while paused does.

### 5. `ui/components/hud/NightSummary.vue`

A modal on `phase === 'won' | 'lost'`, off `snapshot.summary`: waves survived, **food lost listed by
name**, enemies killed, crumbs collected versus dropped, and Retry / Continue.

The food-lost line is the emotional payload of the game. Write it as a sentence with names in it, not
as a table row. Grocery Money is a stubbed line here (step 20 fills the breakdown). Emit `retry` and
`continue`; what they *do* is 8C's.

### 6. `ui/components/hud/ToastStack.vue`

A short-lived stack of messages, fed by 8C when a click is refused. Take `{ id, messageKey }[]` as a
prop and render it; do not own the timer or the queue — 8C's interaction layer produces them and is
where their lifetime belongs.

### 7. `ui/components/hud/HudLayer.vue` and `ui/App.vue`

`HudLayer` takes the snapshot and the selection, lays the six out over the board, and re-emits their
events upward unchanged. Add the HUD's palette roles to `App.vue`'s `:root` — panel fill, panel edge,
amber for anything the player owns, cold blue for anything threatening, plus a danger tone — named by
role like `render/palette.ts`, since step 23 retunes both.

**Warm 2am palette, rounded, soft, low-contrast, no hard whites.** The board stays the brightest
thing on screen.

### 8. Mount it

`GameView.vue` renders `HudLayer` inside `.hud` beside `DebugOverlay`, fed by a second `shallowRef`
published from the same `publish()` callback. Leave the existing dev `Snapshot` and `DebugOverlay`
exactly as they are — 8C decides their fate.

Built with two things this item did not name, both cheap and both 8A's own machinery:
`GameView.vue` creates 8A's `createSelection()` (nothing writes to it yet — 8C does) and refreshes
`buildTowerInspector` on a `watch` of `selectedTowerId` *and* on each publish, so the inspector is
live the moment 8C can select a tower. `HudLayer`'s events are deliberately left unhandled: binding
one to the queue is 8C's, and doing it here would be the second write path.

## Tests

**None.** `vite.config.ts` runs `environment: 'node'` with no jsdom, and neither `@vue/test-utils`
nor a DOM environment has ever been a dependency of this repo — a component spec is not reachable,
and adding the toolchain to assert that a button renders is not what
`../../../analytic-docs/ARCHITECTURE.md` §7 means by testing what silently drifts. Every assertion worth
making about this session's numbers is already in 8A's `tests/viewModel.spec.ts`. The acceptance list
below is the instrumentation.

## Acceptance

- [x] No component in `ui/components/hud/` imports from `core/`, `render/`, `dev/` or `@/data`, and
      none of them holds state that outlives a frame beyond 8A's selection.
- [ ] Clicking anywhere on the board that is not a HUD control still reaches the canvas — check by
      collecting a crumb underneath the top bar and underneath the shop.
- [ ] At 1280×720 and at 1920×1080 the board fills the window, the HUD text is the same physical
      size in both, and nothing overlaps the fridge shelf or the track's spawn end.
- [ ] The stat card can be read while an enemy walks behind it, and hovering an unaffordable tower
      still shows it.
- [ ] Squint at it: you read "2am kitchen", the board is the brightest thing on screen, and there is
      no hard white anywhere.
- [ ] The food readout is the first thing your eye lands on in the top bar.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 8C

The emit contract. 8C binds these to the command queue; if you rename one, rename it here.

```
TowerShop        select: [defId: DefId]            // toggles: same id again disarms
TowerInspector   sell: [towerId: EntityId]
                 setTargetingMode: [towerId: EntityId, mode: TargetingMode]
WaveControl      callWave: []
                 setSpeed: [speed: Speed]
                 togglePause: []
NightSummary     retry: []
                 continueNight: []                 // not `continue`: it is a reserved word
HudLayer         re-emits all of the above, unchanged
ToastStack       props: toasts: { id: number; messageKey: string }[]
```

## Do not

Add a pointer listener to the canvas, a `window` key handler, or any call to `queue.enqueue` — 8C
owns every one of those, and a component that enqueues is a second write path. Do not delete
`dev/placement.ts` or `dev/nightHud.ts`, and do not remove the dev night HUD text that is still
drawn over the board — it will look redundant beside your top bar for exactly one session, and 8C
removes it. Do not implement upgrades (step 12), make the noise meter do anything (step 13), or write
a Grocery Money breakdown (step 20). Do not put a store behind any of this.
