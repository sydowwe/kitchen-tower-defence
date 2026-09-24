# Step 16B — Learning the matrix: the enemy tooltip and coloured damage numbers

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/ARCHITECTURE.md` §5 (the snapshot and the
reactivity trap), `../../analytic-docs/DECISIONS.md` §1 (tone) and §2 (*Art*: emoji on the board,
FontAwesome for chrome), `../../analytic-docs/CONTENT.md` §3 (the matrix, to check the tooltip
against).
**Prereq:** step 16A.

## Goal

The player learns the counter system without a tutorial. Hover an enemy and see its HP, its tags,
and what each damage type does to it right now. Watch a Salt Shaker's numbers come off a Silverfish
dull and grey, and a Lemon's strip turn them back to normal. The same session gives the Bay Leaf the
card row and the placement circle it has lacked since 16A, because a tower whose only stat is a
radius, placed with no radius drawn, is chosen blind.

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/types.ts:523` | `enemyDamaged { enemyId, sourceTowerId, amount, at }`. `amount` is **resolved**, and nothing says how that compares to the base |
| `core/systems/combat.ts:69` | `dealDamage`, the one place `enemyDamaged` is pushed. A resolved 0 publishes nothing, so `base` is never 0 when an event exists |
| `render/layers/effects.ts:245` | `pushEvents` turns each hit into a ring and a number. The number is blitted at `:374` in the single colour `DAMAGE_NUMBER` (`render/palette.ts:140`). Colour is part of the glyph-cache key (`glyphCache.ts:93`), so three colours triple the key space for numbers and nothing else |
| `ui/viewModel.ts` | `TowerStatsView` (`:76`), `statsFor` (`:369`), `DIFF_ROWS` (`:532`), `buildHudSnapshot` (`:683`), and the pattern for a view built **outside** the 15Hz publish and passed in: `inspector` |
| `ui/selection.ts:9` | the hover fields are **plain, not refs**, on purpose. Read the header before adding one |
| `ui/interaction.ts:157` | `reachOf` knows `attack`, `cleanse`, `coneAttack` and `reveal`. **The Bay Leaf has none of them**, so its ghost draws no circle today |
| `ui/interaction.ts:306` | `onPointerMove` sets `hoverTile` and `hoverPoint` (waypoint space, the same space `enemyPosition` returns) |
| `ui/components/hud/StatCard.vue:77` | one `<template v-if>` per nullable row |
| `ui/views/GameView.vue:422` | `publish()`, where `refreshInspector()` is called before `buildHudSnapshot` |
| `ui/icons.ts` | per-icon FontAwesome registration. ESLint forbids importing icons anywhere else |
| `ui/locales/en.ts` | 16A's **first-draft** English for the Weevil, Silverfish, Bay Leaf and Lemon, which this part rewrites. `hud.damage.*` already names the five types. `hud.stat.dpsNote` reads "Per target, before the type matrix.", and this tooltip is the matrix it points at |
| `ui/locales/en.ts:381` | **the Beetle's description says "Armoured".** It has no `armored` tag and takes 1.0× physical. Once the tooltip shows ×1.0 under that sentence, the copy is lying about the matrix. Rewrite it |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **`enemyDamaged` gains `multiplier: number` = `amount / base`,** computed in `dealDamage`. It
   includes `Marked`, because that's what actually happened to the hit. The renderer can't compute
   it itself: the event carries no damage type, and the enemy may be dead by the time it's read.
2. **One band function, `effectivenessOf(multiplier): 'weak' | 'neutral' | 'strong'`, in
   `core/content/matrix.ts`,** with a named epsilon of `0.01` either side of 1. `render/` colours
   numbers with it and `ui/` colours the tooltip with it. Two copies of the thresholds would let a
   ×0.99 read neutral on the board and weak in the tooltip. It's pure arithmetic on a number, so it
   belongs in `core/` where both readers can reach it.
3. **The tooltip shows the live multiplier per damage type, `resolveDamage(1, type, enemy)`,** not
   the bare tag product. A stripped Silverfish's physical reads ×0.7, and that change is the whole
   Lemon lesson. Round to two decimals the way the rest of the view model does.
4. **Hover latches.** Pick the enemy **on pointermove only**: nearest to `hoverPoint` within half a
   tile, through `queryEnemiesInRange`. Keep it as `selection.hoveredEnemyId` (plain, not a ref)
   until the pointer moves off it, leaves the canvas, or the enemy is gone. Re-picking at 15Hz
   against a still cursor drops an Ant within a second of walking under it, and the tooltip
   flickers.
5. **Built like the inspector:** `buildEnemyTooltip(world, enemyId): EnemyTooltipView | null`,
   called from `publish()` and passed into `buildHudSnapshot`. It's rebuilt every publish, because
   HP moves. It returns `null` for an id that's gone, like `towerById`.
6. **HP is `Math.ceil`ed, both numbers.** `hp` is unrounded by design (`spawn.ts:151`: difficulty
   scales it and DoT chips fractions off). A floor would show a living enemy at `0 / 41`.
7. **Every tag is shown, keyed `hud.tag.<tag>`** and typed against `EnemyTag` the way
   `hud.status` is keyed by `StatusKind`. The descriptive ones (`burrows`, `fast`, `spreads`) are
   exactly the ones the multiplier row can't explain.
8. **A burrowed enemy still gets a tooltip**, with one extra line saying nothing can reach it
   there. Hovering the mound and learning why the towers ignore it is the lesson C's mound is
   drawn to set up.
9. **Damage-type icons are FontAwesome**, registered one by one in `icons.ts`. The tooltip is HUD
   chrome, and DECISIONS.md §2 keeps emoji for things on the board. `hud.damage.*` stays the
   accessible label on each.
10. **The Bay Leaf's card row is `suppressRadiusTiles`,** labelled with what it *does*, following
    `lights` and `cleans` (something like "Brings them up within"), and added to `DIFF_ROWS` so its
    two radius tiers diff. `reachOf` gains a `suppress` branch drawing that radius as a circle. Its
    tier-3 marking aura needs no row: the tier-3 sentence says it, as the Nightlight's does.

## Build

### 1. The event and the band — `core/types.ts`, `core/systems/combat.ts`, `core/content/matrix.ts`

Decisions 1 and 2. No spec asserts a whole `enemyDamaged` object, so adding the field breaks
nothing. Grep `tests/` for `enemyDamaged` before assuming it.

### 2. Coloured numbers — `render/layers/effects.ts`, `render/palette.ts`

`DamageNumber` carries its band from `pushEvents`. Add two palette entries **named by role**
(`DAMAGE_NUMBER_WEAK`, `DAMAGE_NUMBER_STRONG`), keeping `DAMAGE_NUMBER` as neutral. Weak should look
spent (low saturation, darker), not red: red reads as "damage taken by *you*". Strong should be
brighter and warmer than neutral, not just bigger.

Gotcha: the ring from the same hit stays `HIT_FLASH`. Colouring both makes a crowd of weak hits a
grey smear that hides where the hits land.

### 3. The tooltip — `ui/viewModel.ts`, `ui/selection.ts`, `ui/interaction.ts`, a new `hud/EnemyTooltip.vue`

`EnemyTooltipView`: glyph, `nameKey`, ceiled `hp`/`maxHp`, `tagKeys`, five
`{ damageType, multiplier, band }` in `hud.damage` order, `burrowed`, and the enemy's tile position
plus the board's `widthTiles`/`heightTiles`. The component places itself as a percentage of the
board. The HUD layer is the board's exact size, so percentages line up at any window size, where
pixel maths is off by the CSS scale.

Gotchas:

- **The tooltip must not take pointer events.** `.hud` is `pointer-events: none` and components opt
  back in. This one must not. If it does, it appears under the cursor, the canvas fires
  `pointerleave`, the latch drops, the tooltip vanishes, the canvas gets the pointer back, and the
  tooltip reappears. The flicker looks like a hover bug.
- **`selection.clear()` must clear `hoveredEnemyId`**, or a retry opens with a tooltip on an id from
  the previous world. Ids restart per world, so it may even point at a live enemy.
- **Nothing in the view holds a reference into the world.** `tagKeys` is a new array of strings,
  not `enemy.tags`. `tests/viewModel.spec.ts` already mutates a world after building to prove this;
  extend it.
- Anchor it off the enemy, offset so it never covers the glyph it describes. At 15Hz it steps 1/15
  of a tile per publish behind an Ant. A short linear CSS `transition` on position hides that.
  Anything longer and the tooltip visibly trails.

### 4. The Bay Leaf's card and circle — `ui/viewModel.ts`, `StatCard.vue`, `ui/interaction.ts`

Decision 10, through `isSuppress` from 16A. `reachOf` is ordered: it returns the first behaviour it
recognises. Put the `suppress` branch where a tower that someday both shoots and suppresses would
show the larger circle, as 15B did for the Vinegar Spray.

### 5. The copy — `ui/locales/en.ts`

Rewrite 16A's drafts for the four defs against the tooltip and the card, in DECISIONS.md §1's
voice: the Weevil's sentence is about going *under*, the Silverfish's about how little a hit does,
the Bay Leaf's about what it brings up, and the Lemon's about what it does for everything else's
hits rather than its own. Add the tag keys, the burrowed line, the stat label, and the Beetle fix
from the table above.

Then look at the shop. Fourteen towers is two more than 15B saw it hold.

## Tests

- A Salt Shaker grain on a Silverfish publishes `multiplier` 0.4, and 0.7 once a Lemon shot has
  landed. A chemical hit on an Ant publishes 1.5. All three go through the real projectile path.
- `effectivenessOf`: 0.4 is weak, 1.0 neutral, 1.5 strong, and 0.995 and 1.005 are both neutral.
  The epsilon is the one number here that drifts silently.
- `buildEnemyTooltip` on a stripped Silverfish shows physical ×0.7 and cold ×1.1. A difficulty-scaled
  enemy with fractional HP shows ceiled HP. A burrowed Weevil gets `burrowed: true`. An unknown id
  gives `null`. Mutating the world afterwards changes nothing in the built view.
- The Bay Leaf's `statsFor` has a suppress radius of 3 and every other tower's is `null`. Its tier-1
  diff has exactly one row.

## Acceptance

- [ ] Hovering a Silverfish shows ×0.4 physical in the weak colour. After a Lemon hit it shows ×0.7,
      and the change is visible without reading the number.
- [ ] Colour-coded damage numbers make "this isn't working" obvious without opening a menu. A
      Salt-Shaker-only defence against a Silverfish reads as failing from across the room.
- [ ] Hovering a walking Ant holds the tooltip steady until the pointer moves. There's no flicker,
      and no tooltip is left behind after the Ant dies.
- [ ] The Bay Leaf's ghost draws its circle, and its card says what it does.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 16C

```
core/content/matrix.ts   effectivenessOf(multiplier: number): 'weak' | 'neutral' | 'strong'
core/types.ts            enemyDamaged.multiplier: number
ui/viewModel.ts          buildEnemyTooltip(world: World, enemyId: EntityId): EnemyTooltipView | null
```

## Do not

Draw the mound, the puffs or the plating. Those are C's, and the tooltip has to work with a mound
that's still a plain glyph. Don't build the codex or a matrix screen; that's step 23, reachable from
step 20's loadout. Don't author nights or move 16A's numbers. Don't add a hotkey for towers 11 to
14 (step 20a).
