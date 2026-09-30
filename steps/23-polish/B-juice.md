# Step 23B — Juice

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §1,
`../../analytic-docs/ARCHITECTURE.md` §2 (frames and ticks) and §6.
**Prereq:** step 23A.

## Goal

Small, cheap, and most of what makes a TD feel good. Enemies die with a poof. A tower lands with a
thunk, and an upgrade sparkles. The Mousetrap's snap and a box giving way shake the room, and nothing
else does. Walking enemies stop looking like stickers. A wave arrives with a line, and the last one
with a flourish. **This part carries the step's event tests.** Its two `core/` event changes are the
only thing in it that can drift silently. C plays its sounds off the same events.

## Already in the repo

Trust symbols over line numbers.

| File | What's there now |
| --- | --- |
| `render/layers/effects.ts` | The one stateful layer. `pushEvents(events, world)` feeds pools capped by `MAX_*` and aged in frames: `flashes` and `numbers` for hits (coloured by `effectivenessOf`), `pops` and `crumbValues` for the collection pop and its `+N`, `puffs` for a destroyed tower, then `digs`, `gusts`, `shoves`, takes, returns, escapes, the wake. `entities.ts` asks for a shove through `shoveOf(enemyId)`. `resetEffects()` clears every pool |
| `core/types.ts` `GameEvent` | `enemyKilled { at }`, `towerPlaced { tile }`, `towerSold { towerId, refund }` with **no tile and no defId**, `towerDestroyed { defId, tile }`, `towerFired { defId, noise }`, `waveStarted { waveIndex }`. **No `towerUpgraded`.** Its comment: "a member here is added by the step that reads it" |
| `core/systems/commands.ts` `upgradeTower` | Refuses silently on the top tier, too few crumbs or a finished night, then `spendCrumbs`, `tier++`, `reconcileToTier` |
| `core/systems/placement.ts` `sellTower` | Pushes `towerSold` after `removeTower` |
| `render/layers/entities.ts` | Flyers bob (`bobPhase`, `FLYER_BOB_*`) over a shadow that stays put. A fleeing thief hops (`SCURRY_*`). A chewing or feeding enemy lunges along its heading (`dirX`/`dirY`, `lungePhase`). A staggered one rotates, "the one transform in the loop". Walkers don't move at all. A added their contact shadows |
| `render/layers/towers.ts` | The box's states (`drawBox`, squashed by `BOX_COLLAPSE_*`), the rearm sweep, the tier marks (`TOWER_TIER_*`) |
| `render/renderer.ts` | The live context's transform is set **once**, in `resize()`. `drawWake` comes after the overlay. A's light layer sits under the tile effects |
| `ui/views/GameView.vue` | `tick()` reads each tick's `world.events` (loud shots, the wake, losses, `buildThiefBanner` on `waveStarted`). `draw()` hands `frameEvents` to `pushEvents`, then clears it |
| `ui/components/hud/ThiefCard.vue` | The Mouse's card, keyed on `waveIndex`, at `top: 7.4rem`, fading over 4.5s. Its comment: "the general wave-start banner is step 23's" |
| `ui/components/hud/WaveControl.vue` | The countdown, call-wave, speed |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **Two `core/` event changes and nothing else in `core/`.** A new `towerUpgraded { towerId,
   defId, tier, tile }`, pushed at the end of a successful `upgradeTower`. And `towerSold` gains
   `defId` and `tile`, for `towerDestroyed`'s reason: the tower is out of `world.towers` before
   anyone reads the event. C places and picks its sounds from both.
2. **The sparkle comes from the event, never from the command.** `UpgradeTower` is refused silently
   in three cases. A sparkle on the click or the `u` key celebrates an upgrade that didn't happen.
3. **Shake is derived from behaviour, never from an id.** It fires on a `towerFired` whose def has a
   `charge` that rearms (`rearmTicks > 0`, the snap), and on a `towerDestroyed` whose def
   `isBarricade`. Today that's the Mousetrap and the Cardboard Box and nothing else. Role is the wrong
   test, because the Toaster is `BURST_DPS` too. Sticky Tape and Fly Paper have charges, but they
   don't rearm. Shake is off under `prefers-reduced-motion: reduce`, whatever the setting says.
4. **Walkers scuttle along their heading. Nothing new moves up and down.** 11C gave flyers the bob,
   and 19C decision 4 kept the floor still so that a fleeing thief's hop reads as faster. A scuttle
   is a small surge forward and back along `dirX`/`dirY`, phase-offset per enemy like `bobPhase` and
   aged in frames. It moves the glyph and not the frame, the lunge's rule: the shadow, the health bar
   and the treatments stay where they are. It stops for anything that isn't walking: frozen, rooted,
   chewing, feeding, burrowed or stationary.
5. **Two switches for D, both on by default:** `setScreenShake(enabled)` and
   `setDamageNumbers(enabled)`, as module state in `effects.ts`. With numbers off, they're never
   pushed. They aren't pushed and then hidden. The hit ring stays.
6. **One banner slot.** The wave banner lives where `ThiefCard` does and fires on the same
   `waveStarted`. On a wave that brings a thief, the thief card *is* the banner, and no second card
   goes up. The last wave (`waveIndex === waveCount - 1`) gets its own line and a flourish. Wave 1
   gets a line too, because it's when the night begins. Step 21's modifier banner at night start
   should use this slot, and the index says so.
7. **The placement thunk and the sparkle follow `shoveOf`'s pattern.** `effects.ts` holds a short
   per-tower record, and `towers.ts` asks `placedAgo(towerId)` or `upgradedAgo(towerId)`. The layer
   never learns why.

## Build

### 1. The events: `core/types.ts`, `core/systems/commands.ts`, `core/systems/placement.ts`

Decisions 1 and 2. Comment the new members the way their neighbours are commented.

Gotcha: `upgradeTower` has three early returns. Push the event after `reconcileToTier`, at the one
exit that's a success. A type error will find anything else in `core/` that builds a `towerSold`
literal. Also check for specs that match a `towerSold` with `toEqual`
(`tests/placement.spec.ts`, `commands.spec.ts`).

### 2. The effects: `render/layers/effects.ts`, `towers.ts`, `entities.ts`, `renderer.ts`

- **Death poof** on `enemyKilled.at`. Dust, not gold (`CRUMB_POP` means money) and not cardboard
  (`TOWER_DEBRIS`). A kill that drops a pile lands on the same point in the same frame, so the poof
  mustn't swallow the pop. Cap it like the rest, because forty ants die at once at 3×.
- **Placement thunk** on `towerPlaced`: a drop and a squash on the glyph for a few frames, and a ring
  of dust at the pad. **Upgrade sparkle** on `towerUpgraded`, in the tier marks' gold.
- **Shake**, decision 3: an offset with a fast decay, held as state in `effects.ts` and read at the
  top of `drawFrame`.
- **Scuttle**, decision 4, in the glyph loop.
- Decision 5's two switches.

Gotchas:

- **The live context's transform is set once, in `resize()`.** A shake done with `ctx.translate` and
  no `save`/`restore` adds up every frame, and the board slides off the canvas. Bracket the board
  layers. Draw `drawWake` without the shake: it fills the whole board, and shaken it leaves a strip
  unwashed.
- **Every new pool goes into `resetEffects()`.** Symptom otherwise: a Retry opens mid-shake, or with
  last night's poofs settling on the new floor. `thiefLanes` and `shoves` were each added there for
  exactly this reason.
- **Per-tower records are keyed by an id that restarts with the world.** A stale thunk would land on
  the next night's tower with the same id. `resetEffects` fixes this as well.
- `blitGlyph` snaps to whole device pixels. A scuttle smaller than about one device pixel turns into
  a one-pixel flicker instead of a motion. Check it at a dpr of 1.

### 3. The banners: `ui/components/hud/WaveBanner.vue`, `HudLayer.vue`, `GameView.vue`, `en.ts`

Decision 6. Fed from `waveStarted` in `tick()`, the way `thiefBanner` is. The copy is in DECISIONS.md
§1's voice. The clock runs from 2am to 6am, so the last wave is the hour before it gets light, and a
line that knows that beats "FINAL WAVE". H reads it again.

## Tests

In `tests/commands.spec.ts` or `tests/upgrades.spec.ts`, beside what's there:

- A successful upgrade pushes exactly one `towerUpgraded`, with the tier it bought (1 for the first)
  and the tower's tile.
- An upgrade refused for crumbs, one refused at `MAX_TIER`, and one after the night is won each push
  **no** `towerUpgraded`.
- `towerSold` carries the sold tower's `defId` and `tile`.

## Acceptance

- [ ] A kill zone at 3× reads as bugs dying, not as a smear, and you can still see where the crumbs
      landed.
- [ ] The Mousetrap's snap and a box giving way are both felt. Nothing else on the board shakes the
      room.
- [ ] Placing a tower feels like setting something down. An upgrade you can't afford does nothing.
- [ ] A column of ants looks alive, and a fleeing Mouse still reads as faster than anything else on
      the floor.
- [ ] The last wave is legible as the last wave.
- [ ] Retry during a shake: the new night opens still.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

Leave every judgement criterion unticked unless you actually sat and looked.

## Hands to the next part

```
core/types.ts              | { kind: 'towerUpgraded'; towerId: EntityId; defId: DefId; tier: number; tile: Vec2 }
                           | { kind: 'towerSold'; towerId: EntityId; defId: DefId; refund: number; tile: Vec2 }
render/layers/effects.ts   setScreenShake(enabled: boolean): void
                           setDamageNumbers(enabled: boolean): void    // both re-exported by render/index.ts
```

## Do not

No sound, not even a placeholder beep (C). No settings UI (D). No shake triggers beyond decision 3:
the restraint is the feature. No modifier banner (step 21). Nothing in `core/` beyond decision 1.
