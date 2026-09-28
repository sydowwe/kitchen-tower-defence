# Step 19C — Theft on screen

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/ARCHITECTURE.md` §5 (the snapshot and the
reactivity trap) and §6 (the performance budget), `../../analytic-docs/DECISIONS.md` §1 (tone), §2
(*Art: emoji sprites*) and §6, `../../analytic-docs/CONTENT.md` §7, and the *thief carry* row of
`../../analytic-docs/OPEN-QUESTIONS.md` §1.
**Prereq:** steps 19A and 19B.

## Goal

The step calls this the best sequence in the game, and it has to look like it. The player notices
the Mouse at the fridge while there's still time to act. Named items visibly leave the shelf and ride
away on it. It sprints back down the track with a trail behind it while every tower fires at it. If
it dies, the food lies glowing on the floor where nobody could miss it, and one click sends it home.
If it gets out, the summary says what it took, by name. It's announced a wave ahead, like the
mini-boss it is. **All of it is drawn from 19A's and 19B's state and events.** This part changes
nothing in `core/`.

## Already in the repo

Step 18B landed in `entities.ts`, `effects.ts` and `palette.ts` after this part was written. Trust
symbols over line numbers.

| File | What's there now |
| --- | --- |
| `core/systems/theft.ts` (19A) | `isRetreating`, `isGrabbing`, `grabProgress(world, enemy)` 0..1 |
| `core/systems/fridge.ts` (19A, 19B) | `isOnShelf`, `isGone`, `isDropped`. `FoodItem.lostTo`, `droppedAt`, `heldBy`. `Enemy.stolenItems` is the carried list, in take order |
| `core/types.ts` (`GameEvent`) | `thiefGrabbed { enemyId, items }`, `thiefEscaped { enemyId, defId, items }`, `foodDropped { enemyId, items, at }`, `foodReturned { items, from, byTowerId }`. Nothing reads them yet |
| `core/commands.ts` | `CollectFood { foodId }` (19B), one per item |
| `render/layers/fridge.ts` | `shelfSlot(map, index)`, which is **exported so effects can't drift from it**. A slot belongs to an index in `night.food`, not to a survivor. `drawFridge` draws `isOnShelf` items (19A's swap), so a returned item reappears in its own slot |
| `render/layers/effects.ts` | The one stateful layer, fed by `pushEvents` before each frame and aged in **frames** with oldest-first caps. `Flight` is shelf → up and away, for `enemyLeaked`. `drawEffects` has **no world** |
| `render/layers/entities.ts` (`drawEntities`, `EnemyFrame`) | A pooled frame per enemy. **Every field is written every frame**, because an unwritten field on a reused entry is stale. `mirrored` reads `enemy.flags.fleeing` directly. The chew animation reads `barricadeHolding`, which 19A made direction-aware |
| `render/layers/crumbs.ts` (`pickCrumb`, `crumbPosition`) | The click hit-test and the position it's measured against, shared, in **waypoint space** |
| `ui/interaction.ts` (`onPointerDown`, `refreshHover`) | Click priority: armed def → crumb → tower. The cursor mirrors it |
| `ui/viewModel.ts` | `foodView` (`remaining` counts `!isGone`, and `lastLostNameKey` is "the highest lost index", with a note saying theft takes from the front). `buildNightSummary` (`foodLostNameKeys` is every gone item). `buildEnemyTooltip` |
| `ui/components/hud/TopBar.vue` | The food count and meter, and a `lastLost` line **keyed on `lastLostNameKey`** to replay its animation |
| `ui/components/hud/NightSummary.vue` | One sentence, `night.foodLost`, with every gone item's name in it |
| `ui/components/hud/WakeCard.vue` | The precedent for a one-shot card that says itself once and fades |
| `ui/locales/en.ts` | 19A's **first-draft** Mouse English, which this part rewrites |
| `steps/23-polish.md` | Now carries the Mouse's "distinct sound" (this split put it there). **No audio here** |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **The grab window has a tell on the Mouse itself**: a ring round it that fills with
   `grabProgress`, drawn in `entities.ts` off a new `EnemyFrame` field. At 3× it's half a second of
   real time, so it has to read from across the board. Drawn from state, not from an event, because
   the window is a duration the renderer can read.
2. **The take is a flight from each item's shelf slot to the Mouse**, from `thiefGrabbed`, resolved
   by item index into `shelfSlot` at push time, the way `enemyLeaked`'s flights are. The Mouse is
   standing still at the fridge during a grab, so its position at push time is where the flight
   lands, and `drawEffects` needs no world.
3. **The carry is drawn from `stolenItems` every frame**, not from the flight. It rides on the Mouse
   and moves with it, including the Moth-style lateral offset (sample through `applyLateralOffset`
   like the glyph). **Answer the OPEN-QUESTIONS carry row**: five full glyphs on one sprite is the
   worry. Recommended: the first one or two drawn full-size on its back, and the rest as a tight
   stack or a small `+N`, so "it has the pizza" still reads at 3×. Write what you chose into that
   row, and move it to resolved.
4. **The flight is `isRetreating`, never `flags.fleeing`.** Swap `entities.ts`' mirror to it, or the
   Mouse runs away facing the fridge. Give it a faster scurry than the walk, and **a stateless trail**:
   three or four fading afterimages sampled at `distance + k × gap` along its own lane (through
   `samplePath` and `applyLateralOffset`). With no pool, no ageing and no per-enemy record, the trail
   can't leak or go stale, and it follows the Mouse around corners because it's sampled on the track.
   Keep it to thieves in `fleeing`. A wake-fled ant stays as it is.
5. **Dropped food glows** (a slow pulse under the glyph, with a palette role of its own), drawn from
   `isDropped` items each frame. Items from one death sit at one point in `core/`, so fan them around
   it here. **The fan is one exported function** that both the draw and a new `pickFood(world, at,
   tilePx, forgivenessPx): FoodItem[]` use, beside `pickCrumb`, in waypoint space. That's
   `crumbPosition`'s rule: the thing clicked is the thing drawn.
6. **Click priority becomes armed def → food → crumb → tower**, and the cursor follows. A click
   enqueues one `CollectFood` per item under the pointer. Food goes before crumbs, because it's the
   thing that matters, and it lies on the track where crumbs pile up.
7. **The return is a flight from `foodReturned.from` to the item's shelf slot**, landing where
   `drawFridge` will draw it next frame. **The escape is a poof at the crack** from `thiefEscaped`.
   The items go with it and are never drawn flying home.
8. **HUD and summary**, in `viewModel.ts`: `food.remaining` counts `isOnShelf`, and the snapshot
   gains how many are carried or on the floor ("at risk"), so the meter drops the moment the Mouse
   takes them rather than when it leaves. `NightSummaryView` splits the sentence: `foodEscapedNameKeys`
   (`lostTo === 'escaped'`) gets a line of its own, above the eaten and floor ones. The step's
   "the summary lists what escaped, by name" is that line.
9. **The announcement is derived, not stored.** `HudSnapshot.upcomingThief: { nameKey } | null` is
   the first def with `thief` in the **next** wave's composition, read off `getNightDef` (wave 0 during
   `building`, `waveIndex + 1` after). It's shown as a warning during the wave before and its
   countdown. When the wave carrying it starts (`waveStarted`), a banner goes up once, in the
   `WakeCard` idiom. That's the Mouse's announcement only: step 23 owns the general wave-start banner.
   No sound (step 23).

## Build

### 1. The Mouse on the board: `entities.ts`, `palette.ts`

Decisions 1, 3 and 4.

Gotchas:

- **New `EnemyFrame` fields are written for every entry every frame**, carry count and grab progress
  included. An unwritten one is last frame's Mouse's five items riding on an Ant.
- **Draw the carry after the glyph and before the HP bar**, or the bar sits under a slice of pizza.
- **A thief chewing a box behind it** already reads as chewing through `barricadeHolding`. Check that
  the bite faces the box it's leaving through, not the fridge.

### 2. The food's journey: `effects.ts`, `fridge.ts`, `crumbs.ts` (or a new `render/layers/food.ts`)

Decisions 2, 5 and 7. Put the floor glow in the draw order with the crumbs (on the floor, under the
enemies), and the flights where the existing theft flights are.

Gotchas:

- **`pushEvents` runs before the frame, and at 3× it hands you three ticks' worth.** A drop and its
  tower return can land in the same batch: a Crumb Tray next to the kill takes it back the next tick.
  Look items up by index at push time, as `enemyLeaked` does, and start the return flight from
  `foodReturned.from`, never from `droppedAt`, which is already null by then.
- **Every new list gets a cap and a line in `resetEffects`**, or a retry opens with last night's
  pizza flying home.
- **Food on the floor has to beat a crumb pile for attention**, because they share the track. Size,
  pulse and colour are yours, but judge it on a board with a big pile beside it.

### 3. The click: `render/layers/` (`pickFood`), `ui/interaction.ts`, `render/index.ts`

Decision 6.

### 4. The HUD, the summary, the warning: `ui/viewModel.ts`, `TopBar.vue`, `NightSummary.vue`, a new card

Decisions 8 and 9.

Gotchas:

- **`lastLostNameKey`'s "highest lost index" is false now.** A Mouse escaping with items from the
  front of the shelf, after Ants have eaten further along it, reports an older loss as the latest one.
  Key `TopBar`'s line on something that changes once per loss, like a running count of gone items,
  not on a name. Two cheeses lost in a row share a key, and the second never replays the line.
- **`foodView` runs at 15 Hz. Don't walk `NIGHTS` in it**: `getNightDef` once, then index the wave.

### 5. The copy: `ui/locales/en.ts`

Rewrite A's Mouse draft in DECISIONS.md §1's voice: understated, situational, never a joke told to
the player. That covers the name, the description, a tooltip line for a thief (what it does, not its
numbers), the warning, the banner, the escaped line in the summary, and the `+N` if you use one.
The escaped line is the emotional payload `night.foodLost` already carries, so write the item names
with the same care.

## Tests

Over `ui/viewModel.ts` only, per `../../analytic-docs/ARCHITECTURE.md` §7. Nothing over `render/`.

- `buildNightSummary` puts exactly the `'escaped'` items' name keys in `foodEscapedNameKeys`, and
  eaten and floor items elsewhere.
- `food.remaining` drops by the carried count on the tick a grab completes, and rises again when
  `CollectFood` returns an item.
- `upcomingThief` is non-null during the wave before a wave containing a thief def and during its
  countdown, null during the thief's own wave, and null on a night with no thief. Use a synthetic
  night, not night 14, which D hasn't written yet.

## Acceptance

- [ ] At 1× and 3×, you can say which items the Mouse took by looking at it and at the shelf.
- [ ] The grab is noticed in time to do something about it.
- [ ] The flight reads as a sprint with every tower on it, not as an enemy walking backwards.
- [ ] Dropped food is impossible to miss next to a big crumb pile, and one click sends it home.
- [ ] The OPEN-QUESTIONS carry row says what was chosen.
- [ ] A board with the Mouse, its carry and its trail costs nothing measurable in frame time. Check
      the performance panel.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

Leave every judgement criterion unticked unless you actually sat and looked. To see a Mouse before D
schedules one, add it to a night **locally and don't commit it**, or use `dev/night/NightPanel.vue`
if it's in the tree.

## Hands to 19D

```
ui/viewModel.ts    HudSnapshot.upcomingThief: { nameKey: string } | null
                   NightSummaryView.foodEscapedNameKeys: string[]
render/palette.ts  the grab ring's, the trail's and the dropped glow's roles   // D may retune values, not roles
```

## Do not

Change anything in `core/`. If a treatment needs data the world doesn't carry, that's A's or B's
file and a note in the commit. Don't add audio, the general wave-start banner or first-time hints
(step 23). Don't schedule the Mouse in a committed night (D), and don't tune `grabTicks` or
`fleeSpeedMult` (D). Don't draw anything new for pushback on a thief: nothing in v1 can do it (19A,
decision 12).
