# Step 17C — Reading the four on the HUD: cards, circles and copy

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../../CLAUDE.md`, `../../../analytic-docs/ARCHITECTURE.md` §5 (the snapshot and the
reactivity trap), `../../../analytic-docs/DECISIONS.md` §1 (tone), and `../../../analytic-docs/CONTENT.md`
§1 (the Candle, Fly Paper, Gas Stove Burner and Honey Pot rows, to check the cards against).
**Prereq:** steps 17A and 17B.

## Goal

Four towers the player can choose between without guessing. Today the shop card is derived from
firing behaviours, and three of the four don't fire. A Candle's card reads "Lights up 2 tiles ·
silent", as if it were a dimmer Nightlight. A Burner's says nothing but its noise. A Honey Pot's
says it earns money and doesn't say it's bait. This part gives `aura`, `tileEffect` and `bait` their
rows and placement circles, gives a feeding enemy's tooltip a line, and rewrites A's and B's draft
English against all of it.

## Already in the repo

| File | What's there now |
| --- | --- |
| `ui/viewModel.ts:88` | `TowerStatsView`. Nulls, not zeroes, for a row a tower doesn't have (`:84`) |
| `ui/viewModel.ts:423` | `statsFor`: one branch per behaviour kind, each ending in `continue`. **There is no `aura`, `tileEffect` or `bait` branch.** The attack branch fills `damage`, `ratePerSecond`, `dps`, `rangeTiles`, `damageType`, `targets` and `applies` |
| `ui/viewModel.ts:592` | `DIFF_ROWS`, the one table both the card order and the tier diff read. `noise` shows the word `hud.stat.silent` at 0, which is the precedent for a row whose zero is a word |
| `core/content/towers.ts` | **two towers already carry an aura the card has never shown**: the Nightlight's tier 3 (6/s fire) and the Bay Leaf's tier 3 (0 damage, applies `marked`). Your aura branch changes both tier-3 diffs |
| `tests/viewModel.spec.ts:215` | pins the base Nightlight as `targets`, `damage` and `rangeTiles` all null, "because it does not shoot". Still true at tier 0 |
| `core/systems/noise.ts` | since 17A, `projectedNoisePerSecond` is `def.noise` for a `tileEffect` tower, so the Burner's card already says 2/sec |
| `ui/interaction.ts:160` | `reachOf`: an attack circle, a cone, or else the larger of `reveal` and `suppress`. It knows no `aura`, `bait` or `tileEffect`. The Candle draws a circle today only because its `reveal` radius equals its aura's |
| `ui/components/hud/StatCard.vue` | one `<template v-if>` per nullable row |
| `ui/viewModel.ts` | `buildEnemyTooltip` / `EnemyTooltipView` (16B), with `burrowed: boolean` and the line it drives in `EnemyTooltip.vue`. That's the precedent for a state line |
| `ui/locales/en.ts` | A's and B's **first-draft** English for the four, which this part rewrites. `hud.stat.*` labels say what a tower *does* ("Lights up", "Cleans within", "Brings them up within"), never "radius" |
| `ui/components/hud/TowerShop.vue` | 18 towers now. 16B looked at it with 14 |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **An aura with `damagePerTick > 0` fills `dps` (per second, `round2`), `rangeTiles` (its
   radius), `damageType` and `targets`, and appends its `applies`.** `damage` and `ratePerSecond`
   stay null, because an aura has no hit to count. **An aura with 0 damage contributes only
   `applies`**: the Bay Leaf's tier 3 must not print "Damage type: physical" for a leaf. A row a
   firing behaviour already filled isn't overwritten. No v1 tower has both, and the shot is the
   number the player aims with.
2. **So the Nightlight's tier-3 diff gains its damage rows** (targets, 6 dps, range 4, fire).
   That's correct: it's the tier that makes a lamp hurt, and the diff will now say so. Pin it.
3. **A `tileEffect` whose kind is `damageOverTime` fills `dps` (`magnitude × 60`) and
   `damageType` from `TILE_EFFECT_DEFS`**, plus `targets: 'ground'`, because heat is read through
   the floor check and flyers never take it. Add `heatRadiusTiles: number | null`, labelled for
   what it does ("Burns"), and **render 0 as a word** ("its own tile"), the way noise 0 is
   "silent". "0 tiles" reads as a tower that burns nothing.
4. **The Honey Pot gets two rows, `lureRadiusTiles` ("Lures from") and `holdSeconds` ("Holds each
   for", converted here as `rearmSeconds` is).** Both go in `DIFF_ROWS`. Income and hit points
   already have rows. Hit points is the one that says "this can die", so put it where it's seen.
5. **`reachOf` folds `aura`, `bait` and a non-zero `tileEffect` radius into the no-attack
   circle**, as the larger of all of them, the way 16B folded `suppress`. A radius-0 Burner keeps
   the placement tile it already gets.
6. **`EnemyTooltipView` gains `feeding: boolean`**, off `enemy.feeding !== null`, and the tooltip a
   line. A frozen Ant is the one enemy a player will hover to ask why it stopped. The line goes in
   the same slot as the burrowed one.

## Build

### 1. The card: `ui/viewModel.ts`, `StatCard.vue`

Decisions 1 to 4, through `isAura`, `isTileEffect` and `isBait`, never a hand-written `kind ===`.
`TILE_EFFECT_DEFS` is `core/` content, so `ui/` may import it.

Gotcha: `statsFor` branches `continue` after their first match, and a tower is a *list*. The Candle
is `aura` then `reveal`. Make sure the aura branch doesn't `continue` past a behaviour you still
need, and that the Honey Pot's `income` still fills `crumbsPerSecond`.

### 2. The circle: `ui/interaction.ts`

Decision 5. Place a Honey Pot and the circle should show the lure radius, which is the placement
decision. A pot whose circle doesn't touch the lane won't catch anything. That's a real thing to
see before the click.

### 3. The tooltip: `ui/viewModel.ts`, `EnemyTooltip.vue`

Decision 6. Nothing in the view holds a reference into the world. It's a boolean, not the
`feeding` object.

### 4. The copy: `ui/locales/en.ts`

Rewrite A's and B's drafts in DECISIONS.md §1's voice: understated, situational, no jokes told to
the player. The Candle's sentence is about what wanders into it, not about its damage. The Burner's
is about the tile you mustn't step on and the noise it costs. The Fly Paper's is about being cheap
and gone. The Honey Pot's has to carry the warning: it pays, it holds them, and it gets eaten. Add
the row labels and the tooltip line.

Then look at the shop with eighteen towers.

## Tests

Assert against the defs' own fields, never the numbers, so D's re-tune moves nothing here.

- The Candle's `statsFor` has `dps` equal to its aura's `damagePerTick × 60`, `rangeTiles` its
  radius, `fire`, `both`, a reveal radius, and `damage` and `ratePerSecond` null.
- The Burner's has a `dps` from its `tileEffect`, `fire`, `ground`, `heatRadiusTiles` 0, and noise
  equal to `def.noise`.
- The Honey Pot's has `crumbsPerSecond`, `lureRadiusTiles` and `holdSeconds` off its def, and
  `hitPoints` off `maxHp`. Every other tower's lure and hold are null.
- The Bay Leaf's tier-3 card has `damageType` and `dps` null and `marked` in `applies`. The
  Nightlight's tier-3 diff contains the `hud.stat.dps` row.
- `buildEnemyTooltip` on a feeding enemy has `feeding: true`, and after release `false`. Mutating
  the world afterwards changes nothing in the built view (extend 16B's assertion).

## Acceptance

- [ ] Each of the four cards says what the tower does without its description.
- [ ] Aiming a Honey Pot shows whether it reaches the lane before the click.
- [ ] The shop still reads with eighteen towers.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 17D

```
ui/viewModel.ts   TowerStatsView.heatRadiusTiles, .lureRadiusTiles, .holdSeconds: number | null
                  EnemyTooltipView.feeding: boolean
```

## Do not

Draw anything on the board: aura fills, the Burner's flame, the pot's ants and the stuck flies are
D's. Don't move a number in `core/content/`; D re-tunes with the board in front of it. Don't add a
hotkey past the ninth tower (step 20a), a codex (step 23), or unlock state on the shop (step 20).
