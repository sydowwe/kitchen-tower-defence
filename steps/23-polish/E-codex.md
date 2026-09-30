# Step 23E — The codex

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §1 and §10 (*What this
changes*), `../../analytic-docs/CONTENT.md` §2 (the Fruit Fly paragraph) and §3.
**Prereq:** step 23A, for the palette. Independent of B, C and D.

## Goal

Where a player goes who wants to understand the counter system. Every tower and enemy they've met,
with full stats and tags, and the damage matrix as a grid you can read at a glance. Everything they
haven't met stays a silhouette. It opens from the Kitchen and from the loadout screen, and with
loadouts it isn't optional any more: choosing between the Lemon and the Ice Cube Tray for a
Silverfish night means having the matrix in front of you. **Tests: the view builder.** Its discovery
and multiplier rules are the parts that can quietly be wrong.

## Already in the repo

Trust symbols over line numbers.

| File | What's there now |
| --- | --- |
| `router.ts` | `'title'`, `'kitchen'`, `'loadout'` at `/kitchen/loadout`, `'night'`, the dev `'editor'`, a catch-all. No guard |
| `ui/kitchenView.ts` | `buildPreview(night)` with `enemies` (tags, counts, first wave), and `enemyIdsOf(night)`, which is local |
| `ui/loadoutView.ts` | The pattern to follow: a pure builder, keys and numbers only, and components that import it and never `core/` |
| `ui/viewModel.ts` | `statsFor(def)` (exported by 20aB) builds a `TowerStatsView`. `buildEnemyTooltip` computes per-type multipliers with `resolveDamage(1, type, enemy)` and `effectivenessOf`. `DAMAGE_TYPES` is local |
| `core/campaign.ts` | `unlockedTowerIds(progress)`: every night's unlocks up to tonight's, or all of them once the campaign is finished |
| `core/content/matrix.ts` | `DAMAGE_MATRIX` has ten rows, three of them with no v1 enemy. `resolveDamage` and `effectivenessOf`. `DamageTarget` is `{ tags, statuses }`, so a def can be scored without a world |
| `core/content/index.ts` | `unlockNightOf(towerId)` |
| `ui/components/hud/StatCard.vue`, `EnemyTooltip.vue` | Styled on the night roles (`--kd-panel`) |
| `ui/components/EntityGlyph.vue` | A sprite or the emoji, for towers and enemies only |
| `ui/stores/session.ts` | `loadoutDraft`, which is why a trip here from the loadout screen loses nothing |
| `ui/views/KitchenView.vue`, `LoadoutView.vue` | No codex link. 20aB left none on purpose |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **A route: `'codex'` at `/kitchen/codex`**, in the daylight roles, a sibling of the loadout
   screen. Unlike Settings, it's never opened from a night.
2. **"Discovered" comes from progress alone.** A tower is discovered when `unlockedTowerIds` has it.
   An enemy is discovered when it's in the waves of any night up to and including tonight's, since
   tonight's preview already shows them. **The Fruit Fly is discovered from night 1**: it's in no
   wave, and CONTENT.md §2 says it hatches from night 1 onward. Name that exception in the code, and
   don't derive it from the crumbs system. No new persistence.
3. **An enemy's multipliers are products**, from `resolveDamage(1, type, { tags: def.tags,
   statuses: [] })`. Never an average, and never one row looked up. A Slug takes chemical at
   1.5 × 2.0 = 3.0.
4. **The grid's rows are the tags the discovered enemies carry that have a row.** `physical-immune`,
   `douses-fire` and `boss` have no v1 enemy, so they don't appear. Descriptive tags (`bug`, `ground`,
   `fast`) have no row. Cells are coloured by `effectivenessOf` in the `--kd-hit-*` colours the
   board's damage numbers use, because the codex is where those colours get learned.
5. **Undiscovered is a silhouette with no name.** The glyph under `filter: brightness(0)` at low
   opacity, which works on a sprite `<img>` and on an emoji alike, with "not seen yet" copy in
   DECISIONS.md §1's voice. A tower says which night it arrives. An enemy says nothing.
6. **Back goes back.** `router.back()` when the codex was reached from inside the app, and the
   Kitchen otherwise. Symptom of a hard-coded Kitchen: a player who came from the loadout screen
   lands in the Kitchen, with the draft intact but on the wrong screen.
7. **`ui/codexView.ts`, pure**, following `loadoutView.ts`. Export `enemyIdsOf` from `kitchenView.ts`
   rather than writing a second one.

## Build

### 1. `ui/codexView.ts`

Decisions 2–4 and 7. Per tower: `statsFor`, the role, placement, noise, damage type and targets, and
the three tier names. Per enemy: HP, speed, reward, steals, tags, the five multipliers with their
bands, and the night it first appears.

### 2. The screen: `router.ts`, `ui/views/CodexView.vue`, `ui/components/codex/*`

Decisions 1, 5 and 6. Split it into components: the tower list, the enemy list, the grid, one
entry's card. Optionally, an enemy on the loadout screen's composition can link to its entry
(`?enemy=<id>`). Do it only if it's cheap.

Gotcha: `StatCard` and `EnemyTooltip` are styled for the night. Reuse their views, and look at them
on the day screen before reusing their CSS.

### 3. The links: `KitchenView.vue`, `LoadoutView.vue`, `en.ts`

The copy is in DECISIONS.md §1's voice. It's the kitchen's notebook, not a database.

## Tests

`tests/codexView.spec.ts`:

- Night 1, fresh progress: the Salt Shaker and the Crumb Tray are discovered, and no other tower is.
  The Ant and the **Fruit Fly** are discovered, and no other enemy is.
- Night 3: the Roach is discovered, because tonight introduces it. On night 2 it isn't.
- The Slug's chemical multiplier is 3.0 (1.5 × 2.0), band `'strong'`. The Silverfish's physical is
  0.4, band `'weak'`.
- On night 17 the grid's rows are exactly the discovered tags that have a matrix row, in
  `DAMAGE_MATRIX` order, and never include `boss`, `douses-fire` or `physical-immune`.
- A finished campaign discovers everything.

## Acceptance

- [ ] From night 17's loadout screen you can choose between the Lemon and the Ice Cube Tray with the
      codex alone, and come back to the same counter.
- [ ] The grid reads at a glance: which damage for which bug.
- [ ] A silhouette makes you want to know what it is, and gives away nothing but its shape.
- [ ] Reload on `#/kitchen/codex`, then press Back: you're in the Kitchen, not off the site.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

Leave every judgement criterion unticked unless you actually sat and looked.

## Do not

No codex inside a night, and no link to it from one: leaving `/night` ends the night. No new
persistence, since "seen" is derived (decision 2). No Act III rows or content. No settings (D) and
no hints (F).
