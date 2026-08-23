# Step 6A — Placement, selling, and the economy towers

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/CONTENT.md` §1 (the Act I table, *Economy
rates* and *Selling*), `../../analytic-docs/DECISIONS.md` §5 (the last bullet).
**Prereq:** step 5.

## Goal

A tower gets onto the board and off it again, for money. Entirely headless — nothing is drawn until
6C and nothing shoots until 6B. This part carries the placement and refund tests; 6B carries the
combat ones.

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/systems/commands.ts` | `commandsSystem(world, commands)` — the only system taking a second argument. Handles `CallWaveEarly` only; its header comment already says **step 6 executes `PlaceTower` / `SellTower` / `SetTargetingMode`** |
| `core/map.ts` | `canPlace(map, tile, placement)` and `flagsAt(map, tile)` (0 off the board), `TileFlags` — `off_path` needs `BUILDABLE` **and not** `TRACK`; `path_only` needs `TRACK` |
| `core/types.ts` | `Tower` — `id, defId, tile, hp, maxHp, tier, targetingMode, cooldownTicks, state, totalInvested`. `GameEvent` already has `towerPlaced` and `towerSold`; `EntityIndex.towers` already exists and is empty |
| `core/content/towers.ts` | `saltShaker`, the `TowerDefOf<Id>` key-deriving type, `perSecond(rate)`, `TOWERS`, `TowerId` |
| `core/content/schema.ts` | the `tower` schema — `cost` and `maxHp` are **integers ≥ 1**, `noise` 0–20, `behaviours` at least one |
| `core/content/behaviours.ts` | `income({ crumbsPerPayout, payoutIntervalTicks })`. `payoutIntervalTicks` is capped at 600 by the schema |
| `ui/locales/contentKeys.ts` | `TowerMessages = Record<(typeof TOWERS)[number]['id'], Entry>` — **a new tower with no `en.ts` entry fails `npm run type-check`, not a test** |
| `tests/content.spec.ts` | asserts the Salt Shaker's numbers **literally**, and loops `TOWERS` requiring an English name and description per id |
| `tests/fixtures/world.ts` | `createTestWorld()` — a 40 × 1 map where tile `0` is `BUILDABLE` only and tiles 1–39 are `BUILDABLE \| TRACK`, 200 crumbs, and **`night.phase === 'won'`** |
| `tests/sim.spec.ts` | "mutates nothing but `world.tick` while the night is over", against that fixture |
| `core/world.ts` | `createWorld`; `normal` opens on 200 crumbs, which is four Salt Shakers exactly |

`core/systems/economy.ts` is a stub owned by step 7. The two towers you add here therefore **pay out
nothing this session**, and that is correct — they are here to prove placement is content-driven.

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **Validity is a pure exported function**, `canPlaceTower(world, def, tile)`, in
   `core/systems/placement.ts`. The command executor calls it; 6C's hover tint and step 8's ghost
   preview call the same one. Two readers of a bitfield invent two slightly different answers, and
   the one that drifts is the one the player sees.
2. **It takes a `TowerDef`, not a `DefId`** — the same shape `startWave(world, night, index)` uses,
   so a spec can check a `path_only` rejection against a synthetic def without registering it in
   `TOWERS`. The executor does the `getTowerDef` lookup, which **throws** on an unknown id: a
   `PlaceTower` naming a tower that does not exist can only come from a corrupt replay, and every
   other lookup in `core/` throws with the id in the message.
3. **The rejection reason is a plain string union**, not an i18n key:
   `'offBoard' | 'blocked' | 'notBuildable' | 'onTrack' | 'offTrack' | 'occupied' | 'tooExpensive' | 'nightOver'`.
   It is a vocabulary like `TargetingMode`, not content — `ui/` resolves vocabularies, and `core/`
   carries content keys.
4. **A rejected command emits no event and logs nothing.** Nothing consumes a rejection: step 8
   calls `canPlaceTower` *before* it lets the click happen and shows the reason as a toast.
5. **"A wave is in progress" is `night.phase === 'wave'`.** It is the only phase-based truth the
   model has, `'countdown'` is explicitly the build window (`DECISIONS.md` §5), and it makes the
   50% refund an assertion rather than a judgement call.
6. **The refund is `Math.floor(totalInvested * rate)`.** The wallet is whole crumbs; rounding up
   turns place-then-sell into a crumb printer.
7. **A freshly placed tower has `cooldownTicks: 0`** and fires on the tick it lands. A tower that
   waits a full second before its first shot reads as broken at the moment the player is watching it
   hardest.
8. The rest of the new `Tower`: `hp: def.maxHp`, `tier: 0`, `state: null`,
   `targetingMode: def.defaultTargetingMode`, `totalInvested: def.cost`.
9. **Add `targetEnemyId: EntityId | null` to `Tower`, initialised to `null` here.** 6B's
   `targetingSystem` writes it and `combatSystem` reads it; it is declared here because this is the
   file that constructs a `Tower`, the same way `state` and `Enemy.flags` were declared a step
   before the system that fills them.
10. **Placement is refused while `night.phase` is `'won'` or `'lost'`**, with `'nightOver'`. The
    summary screen is up; a click landing behind it must not spend crumbs.
11. **The two economy towers get `income(...)` and no `collect(...)`.** CONTENT.md §1's "2.5 collect"
    and "3 collect" are collect *radii*, and step 7 owns both that descriptor's numbers and the
    system that reads them — authoring the radius here means step 7 re-tuning a number it never saw.
12. **`maxHp: 100` for both**, matching the Salt Shaker's precedent. The only HP in the table is the
    Cardboard Box's 200, and everything that is not a wall got 100 in step 2D.
13. **`defaultTargetingMode: 'CLOSEST'` for both.** The field is required and inert for a tower with
    no targeting behaviour; §5 gives `CLOSEST` to everything that is neither DPS nor burst.
14. **`SetTargetingMode` is executed here** — it is a one-line assignment on the tower. What the
    modes *do* is 6B's.

## Build

### 1. `core/systems/placement.ts`

`canPlaceTower(world, def, tile): PlacementResult`, `placeTower(world, def, tile)`,
`sellTower(world, towerId)`, `refundFor(world, tower): number`, `towerAt(world, tile): Tower | null`.

- **Call `canPlace(world.map, tile, def.placement)`; do not read `flags` yourself.** It already does
  bounds, blocked, and both placement branches. What it cannot know is occupancy and cost, which is
  the whole reason this file exists.
- **Always `world.map`, never `getMapDef(...)`.** The world holds its own mutable clone and night
  modifiers write to it (step 15's mold, "moving day"). The symptom of reading the def is placement
  staying legal on a tile the board draws as corrupted.
- `flagsAt` returns 0 for a fractional tile, so a click that was not floored comes back as
  `'blocked'` rather than as a bad coordinate. Reject a non-integer tile as `'offBoard'` first, so
  the reason names the real problem.
- Deduct `def.cost` from `world.crumbs` and record `totalInvested: def.cost` — the sell refund reads
  that field, never the def, because step 12's upgrades add to it.
- Push `towerPlaced` / `towerSold`. `towerSold` carries the refund actually paid.

### 2. Removal bookkeeping

Selling splices `world.towers`, which shifts every index after it. **Whoever removes an entity
rebuilds the index for that array** — see the note on `EntityIndex` in `core/types.ts`, and
`reindexEnemies` in `core/systems/resolve.ts` for the shape. The symptom of skipping it is silent:
sell the first of three towers and every later lookup reads out the wrong tower.

Selling an id that is not on the board is a **no-op**, not a throw — a double-click sends two
`SellTower` commands and the second one is normal.

### 3. `core/systems/commands.ts`

A `switch` on `command.kind`, keeping `callWaveEarly` where it is. Leave `UpgradeTower`,
`CollectCrumb` and `SetSpeed` unhandled; the header comment already names the step that owns each.

Commands are drained into a fresh array before any system runs, so a `PlaceTower` and a `SellTower`
in the same batch execute in enqueue order. That is correct and deterministic — do not dedupe or
reorder a batch.

### 4. `core/content/towers.ts` — the two economy towers

`toasterCrumbTray` (🍞, `ECONOMY`, 75 crumbs, income 4/sec) and `cookieJar` (🍪, `ECONOMY`, 150
crumbs, income 9/sec), both `off_path`, `noise: 0`. 4/sec is
`income({ crumbsPerPayout: 4, payoutIntervalTicks: 60 })` — a payout every N ticks and not a
per-tick trickle, because a fractional per-tick rate accumulates float error over a fourteen-wave
night and the wallet is an integer (see the note on `IncomeBehaviour`).

Leave a `TODO` on the Cookie Jar for "drops 200 crumbs to the enemy side if destroyed", naming
**step 10** — that needs tower HP to be damageable, which arrives there. Do not half-build it.

Then `ui/locales/en.ts`: an entry per new id, or `type-check` fails in `contentKeys.ts`.

### 5. `tests/content.spec.ts`

Extend it with the two towers' numbers, literally, the way the Salt Shaker's block does.

## Tests

- Each rejection, by reason: a tile off the board; a `BLOCKED` tile; a track tile for an `off_path`
  tower; an off-track tile for a `path_only` tower (synthetic def, decision 2); an occupied tile;
  a cost the wallet cannot cover; and a world in `'lost'`.
- **A rejected placement leaves `world.crumbs` untouched and `world.towers` empty.** This is the one
  that catches a deduct-then-validate ordering.
- Placing deducts exactly `cost`, sets `totalInvested`, indexes the tower at its position in
  `world.towers`, and pushes exactly one `towerPlaced`.
- Two `PlaceTower` commands for the same tile in one batch place **one** tower and spend 50 crumbs.
- Selling in `'countdown'` refunds `floor(0.7 × totalInvested)`; selling in `'wave'` refunds
  `floor(0.5 × totalInvested)`; both remove the tower and rebuild `world.index.towers` so the
  remaining towers still look up to their own array positions.
- Selling an unknown tower id changes nothing and emits nothing.
- A world with towers on it survives `JSON.parse(JSON.stringify(world))` deeply equal.

## Acceptance

- [ ] `core/` still imports nothing but itself and zod, and `placement.ts` knows nothing about
      pixels or clicks.
- [ ] Adding `toasterCrumbTray` and `cookieJar` touched `core/content/towers.ts`,
      `ui/locales/en.ts` and `tests/content.spec.ts` — and no file in `core/systems/`.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 6B and 6C

The contract the next two sessions build against. If you change a signature, change it here too.

```
core/types.ts             Tower.targetEnemyId: EntityId | null   // null on placement; 6B owns it

core/systems/placement.ts PlacementRejection =
                            | 'offBoard' | 'blocked' | 'notBuildable' | 'onTrack' | 'offTrack'
                            | 'occupied' | 'tooExpensive' | 'nightOver'
                          PlacementResult = { ok: true } | { ok: false; reason: PlacementRejection }
                          canPlaceTower(world: World, def: TowerDef, tile: Vec2): PlacementResult
                          placeTower(world: World, def: TowerDef, tile: Vec2): Tower | null
                          sellTower(world: World, towerId: EntityId): boolean
                          refundFor(world: World, tower: Tower): number
                          towerAt(world: World, tile: Vec2): Tower | null

core/content/towers.ts    toasterCrumbTray, cookieJar          // TOWERS now has three entries
```

`Tower.tile` is a **tile coordinate with integers on tile centres** — the same space `Vec2` uses
everywhere else, and the same space `samplePath` returns. 6C maps that to pixels; nothing in `core/`
does.

## Do not

Do not pick targets, fire, spawn a projectile or deal damage — all of that is 6B, and a placement
file that reaches into combat is how the range check ends up in two places. Do not draw anything or
add a key handler (6C). Do not add upgrade tiers or a targeting-mode UI (step 12), tower HP damage
or the Cookie Jar's death payout (step 10), or the `collect` behaviour and any crumb payout
(step 7).
