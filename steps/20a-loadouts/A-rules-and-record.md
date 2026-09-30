# Step 20aA — Loadouts, headless: the rules, the night and the record

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §10 (*Slots* and *What this
changes*), `../../analytic-docs/CONTENT.md` §8 (the installations table's last three rows, and
*Loadout slots*), `../../analytic-docs/PERSISTENCE.md` §6.
**Prereq:** step 20, all five parts.

## Goal

Everything a loadout *is*, with nothing drawn yet. Three installations that buy counter space. A night
that knows which towers it was brought and refuses any other. The list rules: add, swap the oldest,
what's legal. A campaign that remembers the loadout chosen for each night and knows what to preselect.
A save record that carries all of it through its first real migration. At the end of this part the
game still plays: every night runs with `tonightsLoadout`, the default B's screen will preselect.
**This part carries the step's headless tests.** B carries view-model tests only.

## Already in the repo

| File | What's there now |
| --- | --- |
| `core/types.ts` (`NightState.availableTowerIds`) | `DefId[] \| null`, null is any tower. Its doc comment explains why null and not a snapshot of `TOWERS`, and that reason survives the rename |
| `core/types.ts` (`WorldModifiers`) | Ten fields, each documented with the system that reads it. `NO_MODIFIERS` is "the identity for every field" |
| `core/world.ts` (`CreateWorldOptions`, `createWorld`) | `availableTowerIds = null` default, copied onto `night` with `[...list]`. The header says ids are resolved here and nowhere later |
| `core/systems/placement.ts` (`PlacementRejection`, `canPlaceTower`) | `'locked'` is checked right after `'nightOver'` and before any tile or price. `en.ts`'s `hud.reject.locked` is "You do not have that one yet." |
| `core/systems/commands.ts` (`PlaceTower`) | `placeTower(world, getTowerDef(id), tile)`, a silent no-op on refusal. The typed reason comes from `canPlaceTower` |
| `core/content/installations.ts` | `INSTALLATIONS` (eleven, in the doc's order), `NO_MODIFIERS`, `resolveModifiers` with a per-kind `switch` ending in a `never` default. Its header says the three slots are 20a's |
| `core/content/schema.ts` (`installationEffect`) | A `discriminatedUnion` of ten kinds with `MAX_*` bounds. The `installation` comment says the slots are 20a's. So does a comment in `core/content/index.ts` |
| `core/campaign.ts` | `Progress` (five fields), `newProgress`, `unlockedTowerIds` (unlock order, tonight's own unlock included), `worldOptionsFor` passing `availableTowerIds: unlockedTowerIds(progress)` |
| `data/dto/progress.ts` | `progressSchemaV1` is a `strictObject`, `progressCodec` is version 1 with `migrations: {}`, and both mappers build their object field by field |
| `data/adapters/localStorage/record.ts` (`readRecord`) | Runs `migrations[v]` on the raw data from the stored version up, then parses **only** the codec's current schema |
| `ui/stores/progress.ts` | `commit` / `base()` / `pending`: a change builds on the unsaved state if a save failed. Every action is refused as `'busy'` while one is in flight |
| `ui/viewModel.ts` (`isUnlocked`, `hotkeyTowers`, `buildShop`), `ui/interaction.ts` (`armedDef`, the keydown), `ui/views/GameView.vue` (`optionsFor`) | The readers of `availableTowerIds`. **Rename them only.** What the shop shows is B's |
| `ui/kitchenView.ts` (`effectLine`), `ui/components/kitchen/KitchenScene.vue` (`SPOTS`), `ui/locales/en.ts`, `ui/locales/contentKeys.ts` | Each fails `type-check` until a new installation, effect kind or rejection has its entry. That's the point of them |
| `tests/fixtures/world.ts` | `availableTowerIds: null` |

**Specs that will break**, all expected:

- `installations.spec`: "the eleven" and the literal fold object.
- `campaign.spec`: `newProgress()`'s literal, and `worldOptionsFor` asserting the unlocked set.
- `placement.spec`: four specs on `availableTowerIds` / `'locked'`.
- `kitchenView.spec`: eleven cards, ten kinds.
- `persistence.spec`: v1, the empty chain, `codecWithV0`, and every corrupt case (see the gotcha).
- `viewModel.spec`: `shopWith` writes the field. Rename it and leave the assertions. B rewrites them.

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **`NightState.availableTowerIds` becomes `NightState.loadout: DefId[] | null`**, and
   `CreateWorldOptions` changes with it. Null still means any tower, for 20B decision 10's reason. The
   campaign never passes the unlocked set after this part, so the old name would describe a list
   nothing builds. The rename is mechanical, so use the IDE's rename. `isUnlocked` in `viewModel.ts`
   becomes `inLoadout`, and its behaviour is unchanged until B.
2. **`createWorld` refuses a non-null loadout that is empty, names a tower twice, or names an id not
   in `TOWERS`** (`getTowerDef` throws, with the id). It does **not** check the slot count. That's
   the campaign's rule, and `GameView`'s dev noise panel builds worlds whose modifiers aren't the
   progress's: a slot check here would throw on a six-tower campaign loadout under a panel that owns
   no Drying Rack.
3. **`'locked'` becomes `'notInLoadout'`**, in the same position in `canPlaceTower`. Its English is a
   tower you own and didn't bring, not one you lack: something like "You didn't set that one out
   tonight." After B it's unreachable from the UI. It exists for a stale selection and a replayed
   command log.
4. **The three installations are appended in the doc's order**, at the doc's prices:
   `clearTheDryingRack` 170, `takeTheToasterOffTheCounter` 240, `secondShelf` 320. Each is
   `{ kind: 'loadoutSlots', slots: 1 }`, with `slots` an int bounded by a new `MAX_LOADOUT_SLOTS_DELTA`
   (3) in the schema. **Pick glyphs that no tower or enemy uses.** `EntityGlyph.vue` (if it's in the
   tree) draws a sprite for any tower or enemy glyph, and its comment already warns that the Bigger
   Fridge's 🧊 would come out as an Ice Cube Tray. Draft the names, the descriptions and the three
   `SPOTS` entries. B rewrites them (see the index).
5. **`WorldModifiers.loadoutSlots`, with `NO_MODIFIERS.loadoutSlots = LOADOUT_BASE_SLOTS` (5).** The
   fold sums, then caps once after the loop at `LOADOUT_MAX_SLOTS` (8). Both constants are exported
   from `installations.ts`. **No system reads it.** `loadoutSlots(progress)` in the campaign reads it
   off `resolveModifiers(progress.installations)` before any world exists. It sits on
   `WorldModifiers` anyway because the fold is the one place an installation becomes a number, and
   because a replay carries what the night was built with. Say so on the field.
6. **`core/loadout.ts` holds the list rules and knows nothing about `Progress`**, because step 22's
   loadout policies build lists without one.
   - `addToLoadout(ids, id, slots)`: already present gives an unchanged copy. With room, it appends.
     When full, it drops `ids[0]` and appends.
   - `removeFromLoadout(ids, id)`.
   - `checkLoadout(ids, unlocked, slots): LoadoutProblem | null`, checking in the order `'empty'`,
     `'duplicate'`, `'notUnlocked'`, `'tooMany'`.
   **Array order is selection order.** It's what "oldest" reads, and it is never a display order (B,
   decision 7).
7. **`Progress.loadouts: Record<DefId, DefId[]>`**: the last loadout chosen for each night, keyed by
   night id. `newProgress()` starts it at `{}`. It's written only by
   `setLoadout(progress, ids): { ok: true; progress } | { ok: false; reason: LoadoutProblem }`, for
   `progress.nightId`, which throws when it's null. `applyNightResult` doesn't touch it. **The loadout
   is saved when the night starts** (B's Start button), so a reload mid-night, a Retry and the harness
   all rebuild tonight from progress alone. That's the index's seam.
8. **`tonightsLoadout(progress): DefId[]`** is both what B preselects and what `worldOptionsFor`
   passes, in this order:
   - Tonight's stored loadout, if `checkLoadout` passes.
   - Otherwise `previousLoadout(progress)` plus tonight's unlocks **while there's room, never swapped
     in**.
   - With no previous either, the first `slots` of `unlockedTowerIds`.

   It's never empty. **Why not swap the new tower in:** the first full counter is the moment the
   mechanic teaches itself. A default that quietly drops the Salt Shaker to make room for the Spray
   Bottle makes the player's first cut for them. B marks the new tower instead.
9. **`previousLoadout(progress): DefId[] | null`** is the stored loadout of the night whose index is
   one below tonight's, if it passes `checkLoadout`. Otherwise it's null. It's B's "last night's"
   preset.
10. **`worldOptionsFor` passes `loadout: tonightsLoadout(progress)`**, with its signature unchanged.
    20B decision 15 still holds. A night nobody chose a loadout for (a first run, a save from before
    this step, `#/night` typed into the address bar) plays the default the screen would have shown. It
    doesn't throw, and `GameView` needs no redirect.
11. **The record goes to v2, with a real v1→v2 migration adding `loadouts: {}`.** Every v1 save in a
    player's storage needs exactly one default, which is what the chain is for. Loosening v1 instead
    would stop the strict schema treating a field from another build as corrupt, and 20C tests
    exactly that. Keep `progressSchemaV1` exported, since the migration parses with it, the way the
    spec's synthetic v0 does. Add `progressSchemaV2` and `ProgressDtoV2`.
12. **Unknown ids in a stored loadout are dropped by `fromProgressDto`, not treated as corrupt.** A
    night key not in `NIGHTS` drops its entry, a tower id not in `TOWERS` drops the id, and an entry
    left empty drops too. Installations are strict (20C, decision 7) because dropping one takes back
    something the player paid for. A remembered loadout is a preference, and sending a whole campaign
    down the corrupt path over a renamed tower in it is out of proportion. Campaign legality (unlocked,
    slots) isn't checked here: `tonightsLoadout` re-checks on every read. Import `TOWERS` from
    `core/content/towers.ts`, never a schema (20C's zod-ships gotcha).
13. **`useProgressStore().chooseLoadout(ids): Promise<'ok' | LoadoutProblem | 'busy' | 'failed'>`**,
    pessimistic like its neighbours: `setLoadout(base(), ids)`, then `commit`. Building on `base()`
    matters here. A Retry after a failed night save reaches the loadout screen with the night's result
    still `pending`, and Start has to carry it.

## Build

### 1. The installations and the fold: `schema.ts`, `installations.ts`, `types.ts`

Decisions 4 and 5. Then the entries every exhaustive check will demand: `kitchenView.ts`'s
`effectLine`, `kitchen.effect.loadoutSlots` ("+{n} space on the counter" or so), the three
`installation.*` drafts in `en.ts`, the three `SPOTS`. Rewrite the comments in `installations.ts`,
`schema.ts`, `content/index.ts` and `contentKeys.ts` that say the slots are 20a's.

### 2. The night: `types.ts`, `world.ts`, `placement.ts`, and the readers

Decisions 1–3. `GameView`'s dev branch reads `campaign?.loadout`. Its `NightPanel` override still
passes `null`, which is every tower.

### 3. The list rules and the campaign: `core/loadout.ts`, `core/campaign.ts`

Decisions 6–10. Re-export `core/loadout.ts` from `core/index.ts`.

Gotcha: **`setLoadout` must build `{ ...progress.loadouts, [nightId]: [...ids] }`**, never assign
into `progress.loadouts`. `applyNightResult` and `buyInstallation` spread `...progress`, so every
progress in the store's history shares one `loadouts` object until something copies it. A write into
it rewrites the loadout of a progress that is supposedly unchanged, including the one a failed save is
holding as `pending`. Add `setLoadout` to the purity spec. The deep freeze is what catches this.

### 4. The record and the store: `data/dto/progress.ts`, `ui/stores/progress.ts`

Decisions 11–13.

Gotchas, all in `persistence.spec`:

- **Every corrupt case goes corrupt for the wrong reason.** They're `envelope(1, { ...valid, … })`,
  and `valid` is `toDto(sampleProgress())`, which is v2-shaped after this part. A v1 envelope runs the
  v1→v2 migration, whose strict v1 parse rejects the `loadouts` field. So every case lands in
  `:corrupt:` and passes, even with the check it names deleted. Move them to `envelope(2, …)`. "A
  version newer than this build" becomes `envelope(3, …)`. "An extra field from another build" uses
  `loadouts: []` today, which was a coincidence at 20C. It needs a field that isn't `loadouts`.
- **`codecWithV0` replaces `migrations` wholesale** with `{ 0: … }`. At v2 it has no 1→2 step and
  throws "no progress migration from v1". Use `{ ...progressCodec.migrations, 0: … }`. Its
  expectations gain `loadouts: {}`, and it writes back as v2.
- "Ships at v1 with an empty migration chain" becomes "ships at v2 with exactly the 1→2 migration".

## Tests

`tests/loadout.spec.ts`, plus extensions to `installations.spec`, `campaign.spec`, `placement.spec`,
`kitchenView.spec`, `persistence.spec` and `progressStore.spec`.

- **Installations:** fourteen, at the doc's prices in the doc's order, ending `170, 240, 320`. The
  literal fold gains `loadoutSlots: 8`. Nothing owned is 5. Each slot installation alone is 6, any
  two are 7, all three are 8. **Four copies of one slot id fold to 8, not 9.** The cap is tested with
  a repeated id because there is no fourth slot installation to own.
- **Swap the oldest:** `addToLoadout` of a sixth tower into five with `slots` 5 drops `ids[0]` and
  appends. With room it appends. An id already there is an unchanged copy.
- **Legality:** `checkLoadout` returns each problem once, in decision 6's order. `[]` is `'empty'`,
  and three of six unlocked with five slots is legal.
- **Refused with a typed reason:** in a world whose `loadout` is `['saltShaker']`, `canPlaceTower` on
  a Mousetrap is `'notInLoadout'`, ahead of a blocked tile and an empty wallet, and still behind
  `'nightOver'`. A `PlaceTower` for it, ticked, places nothing and spends nothing.
- **Immutable once the night starts:** freeze `world.night.loadout`, then enqueue one of every command
  and tick. Take the commands from a `{ [K in CommandKind]: Extract<Command, { kind: K }> }`, so a ninth
  kind fails `type-check` in this spec until it's covered. (Built as that mapped type rather than the
  `Record<CommandKind, Command>` first written here: the record would also accept a `SellTower` under
  the `PlaceTower` key.) Nothing throws, and the loadout deep-equals what `createWorld` was
  given. `createWorld` copies the list it was passed (the existing spec, renamed) and throws on `[]`,
  a duplicate and an unknown id.
- **Nights 1–4 fit and night 5 is the first cut:** for fresh progress at each of nights 1–4,
  `unlockedTowerIds` has at most five towers and `tonightsLoadout` equals it. At night 5 it's five of
  six, the Spray Bottle isn't in it, and nothing was dropped to make room.
- **A retry preselects the previous loadout:** `setLoadout` at night 3 with a chosen three, then a
  lost night-3 result, leaves `tonightsLoadout` equal to those three, in that order. A win instead
  makes night 4's `tonightsLoadout` those three plus the Cookie Jar, and `previousLoadout` the three.
- **`worldOptionsFor`** builds a world whose `night.loadout` is `tonightsLoadout(progress)`. With a
  stored loadout that names a tower unlocked after tonight, which is only possible through a content
  change, it falls back to the default rather than throwing.
- **The record:** a `Progress` with `loadouts` round-trips deep-equal at v2. A stored v1 record reads
  with `loadouts: {}`. A stored loadout naming `goldenToaster`, or keyed by `night99`, loads with that
  id or entry gone, and nothing goes to `:corrupt:`.
- **The store:** `chooseLoadout` on a mock at rate 1 leaves `progress` untouched, and `retry()` at
  rate 0 assigns it. After a failed night save, `chooseLoadout` then `retry()` lands the night's
  money **and** the loadout, once.

## Acceptance

- [x] `grep -rn availableTowerIds src tests` finds nothing, and neither does `'locked'` as a
      `PlacementRejection`.
- [x] Nothing outside `core/loadout.ts` and `core/campaign.ts` decides what a legal loadout is.
- [ ] The game still plays from title to summary, and from night 5 on the shop greys the one unlocked
      tower the default left behind. That's expected until B hides it.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 20aB

```
core/loadout.ts           type LoadoutProblem = 'empty' | 'duplicate' | 'notUnlocked' | 'tooMany'
                          addToLoadout(ids: readonly DefId[], id: DefId, slots: number): DefId[]
                          removeFromLoadout(ids: readonly DefId[], id: DefId): DefId[]
                          checkLoadout(ids: readonly DefId[], unlocked: readonly DefId[], slots: number): LoadoutProblem | null
core/content/installations.ts  LOADOUT_BASE_SLOTS (5), LOADOUT_MAX_SLOTS (8); effect kind 'loadoutSlots' { slots }
core/campaign.ts          Progress.loadouts: Record<DefId, DefId[]>
                          loadoutSlots(progress): number
                          tonightsLoadout(progress): DefId[]          // stored if legal, else the default
                          previousLoadout(progress): DefId[] | null   // last night's, if legal
                          setLoadout(progress, ids): { ok: true; progress: Progress } | { ok: false; reason: LoadoutProblem }
core/types.ts             NightState.loadout: DefId[] | null;  WorldModifiers.loadoutSlots: number
core/systems/placement.ts PlacementRejection 'notInLoadout'         // 'locked' is gone
ui/viewModel.ts           inLoadout(loadout: readonly DefId[] | null, id: DefId): boolean   // was isUnlocked
ui/stores/progress.ts     chooseLoadout(ids: DefId[]): Promise<'ok' | LoadoutProblem | 'busy' | 'failed'>
```

## Do not

Build the loadout screen, a route, the session store's draft, or change what the shop shows or how
Retry behaves (all B). Don't add a Codex link (step 23), endless mode (step 21), presets beyond
`previousLoadout`, or any rule on selling and rebuying within a night.
