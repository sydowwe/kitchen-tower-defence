# Step 21F — The night on screen

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §1 (tone) and §10 (*What this
changes*, the first bullet), `../../analytic-docs/CONTENT.md` §6 (the modifier column) and §9.
**Prereq:** steps 21A–21E.

## Goal

A modifier the player doesn't notice is wasted content, and a map chosen by its name alone is chosen
blind. Tomorrow's modifier goes on the Kitchen's preview and the loadout screen's, because a heatwave
changes which towers are worth bringing. It's said again in a banner when the night starts, and stays in
the HUD while the night runs. The loadout preview shows the map's *shape*, its lanes included, because
the track is part of what the player chooses towers against. The tier is chosen on the title screen and
shown in the HUD. **This part carries view-model tests only**, over `ui/kitchenView.ts` and
`ui/viewModel.ts`.

## Already in the repo

Trust symbols over line numbers.

| File | What's there now |
| --- | --- |
| `ui/kitchenView.ts` (`buildPreview`, `NightPreviewView`, `compositionOf`) | The one preview builder for the Kitchen and the loadout screen: night, `mapNameKey`, `waveCount`, `unlocks`, `introduces`, `enemies`. `count` is **authored** counts summed (20aB decision 3, "until step 21's difficulty selector") |
| `ui/components/kitchen/NightPreview.vue`, `ui/components/loadout/NightComposition.vue` | Both print `kitchen.preview.where` ("{map}, {waves} waves") and nothing about the map but its name |
| `core/content/modifiers.ts`, `spawn.ts` (21B) | `getNightModifierDef`, `applyNightModifier`, `waveEntryCount(count, difficulty, modifiers)`. The drafted `modifier.*` English |
| `core/types.ts` (21B) | `NightState.modifierId`, `WorldModifiers.damageTypeMult` |
| `core/campaign.ts`, `ui/stores/progress.ts` (21E) | `DIFFICULTY_LADDER`, `tierUnlocked`, `startCampaign`, the store's `startCampaign(tier)` |
| `ui/viewModel.ts` (`buildEnemyTooltip`, `ThiefBannerView`, `HudSnapshot`) | The tooltip's damage rows are `resolveDamage(1, type, enemy)`, with no world modifier. `ThiefBannerView` is the one-shot-card idiom. The snapshot has no tier and no modifier |
| `ui/views/GameView.vue` (`restart`, `thiefBanner`, `wake`) | `restart()` is where every per-world view is reset after `createWorld`. `thiefBanner` and `wake` are `shallowRef`s handed to `HudLayer` as props |
| `ui/components/hud/HudLayer.vue`, `TopBar.vue`, `ThiefCard.vue`, `WakeCard.vue` | `TopBar` shows the clock and "wave n of m". `ThiefCard` is the card to copy |
| `ui/components/hud/WaveBanner.vue` | **Only if step 23B has landed.** The one banner slot, where `ThiefCard` sits, fed off `waveStarted`. Wave 1 gets a line. 23B decision 6 asks step 21 to put the night-start modifier banner in this slot |
| `ui/views/TitleView.vue` | The name, the tagline, and one "Enter" button, shown once progress has loaded |
| `ui/components/kitchen/ResetProgress.vue` | The confirm-before-erasing idiom |
| `tests/kitchenView.spec.ts` ("the night's composition") | "lists every enemy … summing the authored counts", and night 14's counts. Decision 2 changes what `count` means |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and then
edit this file. Don't leave it lying.

1. **`NightPreviewView` gains `modifier: ModifierView | null`** (`{ id, glyph, nameKey, descriptionKey }`)
   **and `map: MapShapeView`**, both in `buildPreview`, so the Kitchen and the loadout screen can't
   disagree.
2. **The preview's counts are what will spawn tonight at this tier:** each entry through
   `waveEntryCount(count, resolveDifficulty(progress.difficulty), applyNightModifier(NO_MODIFIERS, def))`
   before summing. Night 15 shows its dinner party doubled, and Nightmare shows more of everything.
   20aB kept authored counts only until a tier existed, and B exported the rounding so `ui/` copies
   none. The crack's and the window screen's cuts stay out, for 20aB's reason. `buildPreview` needs the
   tier, so it takes the progress, or the tier, as a new argument.
3. **The map's shape is `MapShapeView`:**
   `{ widthTiles, heightTiles, cells: MapCell[], lanes: Vec2[][], fridge: Vec2 }`, with `MapCell`
   being `'buildable' | 'blocked' | 'decor' | 'track'`. It's built by `buildMapShape(mapId)` in
   `kitchenView.ts` from `getMapDef`: the authored map. Moving day's boxes are the seed's, placed at
   night start. It's drawn as an **SVG** by `ui/components/MapShape.vue`: cells as rects, lanes as
   polylines, a fridge mark. Not a canvas: a pure view model is testable, scales with CSS, and G reuses
   the component for the endless map choice. It goes on the loadout screen (required) and, small, on
   the Kitchen's preview.
4. **The modifier is said three ways.** On both previews: glyph, name and its one line. **A banner when
   the night starts**, built in `restart()` from `world.night.modifierId`, in `ThiefCard`'s idiom (a
   `shallowRef` prop, keyed so a Retry says it again). If 23B's `WaveBanner` exists, the modifier is its
   wave-1 line on a modifier night, in its slot, not a fourth card. If it doesn't, build a
   `ModifierCard` at `ThiefCard`'s spot, and 23B folds it into the slot later. **A chip in the
   `TopBar`** for the whole night, so a player who looked away during the banner can still find out why
   the flies are doubled. The general wave-start banner stays step 23's.
5. **`HudSnapshot` gains `difficulty: DifficultyId` and `modifier: { glyph, nameKey } | null`**, read
   off the world each publish. The tier chip sits beside the clock.
6. **The enemy tooltip agrees with the damage numbers:** each row multiplies by
   `world.modifiers.damageTypeMult[type]`. On a heatwave night, 21B's damage numbers colour a neutral
   fire hit strong, and a tooltip saying ×1.0 beside it would be the two of them disagreeing on screen.
7. **The title offers the three tiers.** The current campaign's is marked. A locked tier says what opens
   it ("beat the kitchen on Normal"). Picking another open tier **asks first** when the campaign has
   anything in it (a result, money, an installation), in `ResetProgress`'s confirm idiom, then calls
   the store's `startCampaign`. "Enter" is unchanged. The Kitchen's reset stays the full erase.
8. **English, in `DECISIONS.md` §1's voice:** rewrite B's five modifier drafts with the banner on
   screen, and add the three tiers (a name, and one line each on what changes in the kitchen, never a
   number), the banner, the chip and the title's question. Type the tier names as
   `Record<DifficultyId, …>` in `contentKeys.ts`, the `RoleMessages` trick.

## Build

### 1. The builders: `ui/kitchenView.ts`, `ui/viewModel.ts`

Decisions 1–3, 5 and 6.

Gotcha: **a track tile is `BUILDABLE | TRACK`**. Test `TRACK` first when mapping flags to a `MapCell`,
or every lane draws as floor. Blocked comes next, then decor.

### 2. The shape and the previews: `ui/components/MapShape.vue`, `NightPreview.vue`, `NightComposition.vue`

Decisions 1 and 3.

### 3. The banner and the HUD: `GameView.vue`, `HudLayer.vue`, `TopBar.vue`, and 23B's `WaveBanner.vue` or a `ModifierCard.vue`

Decisions 4 and 5.

Gotchas:

- **Set the banner in `restart()`, after `createWorld`, beside `thiefBanner.value = null`.** One built
  in `onMounted` shows on the first night and never on a Retry, and a Retry is exactly when the player
  most needs reminding that it's moving day.
- **Without 23B, the card and the `ThiefCard` can overlap.** The Mouse is never in wave 1, but the
  card's fade and the thief's warning for wave 2 can overlap at 3× speed. Look at a Mouse night at 3×
  before you settle where it sits. With 23B's slot, one card replaces the other, and that's its point.

### 4. The title: `TitleView.vue`

Decision 7.

Gotcha: **read `status` from the store, never a local flag** (20D's card gotcha). The title is the
first screen that loads, and in mock mode `startCampaign` can fail. The picker shows the failure and
the store's retry. It never shows a tier as chosen that the save didn't take.

### 5. The copy: `en.ts`, `contentKeys.ts`

Decision 8.

## Tests

Extensions to `kitchenView.spec` and `viewModel.spec`.

- **The modifier on the preview:** nights 6, 11, 15, 16 and 18 carry theirs by id, and every other
  night carries null.
- **The counts are tonight's:** night 15's enemy totals are its authored totals doubled, entry by entry
  through `waveEntryCount`. Night 5 at Nightmare is each entry's `round(count × 1.25)`, summed. Rewrite
  "summing the authored counts" to sum `waveEntryCount` at Normal. Every night but 15 comes out equal
  to its authored total.
- **The shape:** the Counter's `cells` are 336 long, with 33 `'track'` (the count `path.spec` pins). Its
  `lanes` are its one path's waypoints. The Floor has three lanes, and every map's fridge is its
  `fridge.tile`.
- **The HUD:** a Nightmare world's snapshot says `'nightmare'`. A heatwave world's says the heatwave,
  and a world with no modifier says null.
- **The tooltip under a heatwave:** an untagged enemy's fire row is 1.3, its cold row 0.7, and the
  others 1.

## Acceptance

- [ ] On the loadout screen you can tell the Stove from the Floor without reading either name.
- [ ] On night 18 the heatwave is on the counter before you choose, and it changes what you bring.
- [ ] Night 16 opens with moving day said once, the boxes on the floor, and the chip there for the rest
      of the night.
- [ ] Nightmare can be chosen on the title only after a Normal clear. Choosing it asks before clearing
      anything, and the HUD says it all night.
- [ ] With `VITE_DATA_MODE=mock` and the dev toggle at 100%, starting a new tier shows the failure, and
      its retry works once the toggle is back down.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

Leave every judgement criterion unticked unless you actually sat and looked.

## Hands to 21G

```
ui/kitchenView.ts          buildMapShape(mapId: DefId): MapShapeView
                           buildPreview(night, difficulty): NightPreviewView   // or whatever second argument you chose — say so here
ui/components/MapShape.vue props: { shape: MapShapeView }                     // sized by its container
```

## Do not

Change `core/` or `data/`. A rule the screen needs that E didn't write is E's file and a note in the
commit. Build nothing for endless: the Kitchen's run entry, the run's loadout, route, HUD and summary
are all G's. Don't draw moving day's boxes on the preview (they're the night's, not the map's), and
don't add a general wave-start banner (step 23).
