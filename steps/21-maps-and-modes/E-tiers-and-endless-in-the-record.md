# Step 21E — Tiers and endless in the record

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §7, `../../analytic-docs/CONTENT.md`
§9, `../../analytic-docs/PERSISTENCE.md` §4 (the paragraph on pessimistic writes) and §6,
`../../analytic-docs/OPEN-QUESTIONS.md` §1 (the endless row) and §2 (the difficulty line).
**Prereq:** step 21D.

## Goal

The rules and the record for everything that outlives one campaign. Which tiers the player has beaten
the kitchen on, and so which they may start. What starting over on another tier keeps. When endless
opens, what a run is played with, where its loadout is remembered, and what it scores. A save record
that carries all of it through its second migration, and the store actions the screens will call.
Nothing is drawn: F and G do that. **This part carries the record's and the store's tests.**

## Already in the repo

Trust symbols over line numbers.

| File | What's there now |
| --- | --- |
| `core/campaign.ts` | `Progress` has six fields: `nightId`, `groceryMoney`, `installations`, `nightResults`, `difficulty` (always `'normal'`: nothing sets it) and `loadouts`. Also `newProgress`, `applyNightResult` (moves on only on a win of the current night, and to null after night 18), `setLoadout` (throws on a finished campaign), `tonightsLoadout`, `previousLoadout`, `loadoutSlots`, `unlockedTowerIds` and `worldOptionsFor`. Every reducer copies what it changes |
| `core/content/endless.ts` (21D) | `ENDLESS_NIGHTS`, `endlessNightId`, `isEndlessNightId`, and `findNightDef` in `content/index.ts` |
| `core/loadout.ts` | `checkLoadout(ids, unlocked, slots)`, `LoadoutProblem` |
| `data/dto/progress.ts` | v2, `migrations: { 1 }`, strict schemas. `knownLoadouts` drops a loadout whose key fails `isNightId`, which is **`NIGHTS` only**. `fromProgressDto` throws on an unknown `nightId` or `nightResults` key |
| `ui/stores/progress.ts` | `commit`, `base()` and `pending`. Every action is refused as `'busy'` during a save. `resetProgress()` commits `newProgress()` |
| `ui/viewModel.ts` (`buildNightSummary`) | `wavesSurvived: won ? waveIndex + 1 : waveIndex`, the only copy of that rule |
| `tests/campaign.spec.ts` | "a new campaign" pins `newProgress()`'s literal. "purity" deep-freezes a progress and runs every reducer |
| `tests/persistence.spec.ts` | "ships at v2 with exactly the 1→2 migration", `codecWithV0` (spreads the chain), and every corrupt case at `envelope(2, …)`. "A version newer than this build" is `envelope(3, …)` |
| `tests/progressStore.spec.ts` | Pessimistic writes, the failed-save carry, and "names a refusal without saving anything" |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and then
edit this file. Don't leave it lying.

1. **The ladder is cozy → normal → nightmare. Cozy and Normal are open from the start. A tier above
   Normal opens when the tier below it has been cleared.** The step's "beating one tier unlocks the
   next", read from the bottom, would send a new player through Cozy first. But Normal is the default
   (20B, decision 13), and every balance target in step 22 is on Normal. So in practice a Normal clear
   opens Nightmare.
2. **`Progress.cleared: DifficultyId[]`**: the tiers the campaign has been won on, in the order they
   were cleared, no repeats. `applyNightResult` adds `progress.difficulty` on the win that moves
   `nightId` to null, and nowhere else. It's a lifetime record.
3. **`startCampaign(progress, tier)`** returns `{ ok: true; progress } | { ok: false; reason: 'locked' }`.
   It's `newProgress()` on the tier, keeping `cleared` and `endlessBests`, copied. **It clears the
   kitchen**: installations, Grocery Money, results, loadouts. A tier belongs to a campaign
   (`OPEN-QUESTIONS.md` §2). Carrying fourteen installations into Nightmare's night 1 would make the
   next tier easier than the one just beaten, and the Grocery Money curve paces them across one
   campaign (`CONTENT.md` §8). `resetProgress` stays the full erase, lifetime record included.
4. **Endless opens for life on the first clear (`cleared.length > 0`), on all six maps.** Every map's
   nights come before night 18, so "from those beaten" is all of them. A run is played **at the current
   campaign's tier and with its installations** (their loadout slots included), **with every tower any
   campaign night unlocks**, and **pays no Grocery Money**. A mode with no end paying the currency the
   campaign stops you farming would be a farm (see `applyNightResult`'s note). That answers
   `OPEN-QUESTIONS.md` §1's endless row. Move it to §6 *Resolved* in this commit, with "Step 21E" as
   where.
5. **An endless loadout is stored in `Progress.loadouts` under `endlessNightId(mapId)`**, the sibling
   the step allows, with no new field. `endlessLoadout(progress, mapId)` returns the stored loadout if
   it passes `checkLoadout` against `endlessTowerIds()` and `loadoutSlots`. Otherwise night 18's stored
   loadout if that passes. Otherwise the first `slots` of `endlessTowerIds()`. `setEndlessLoadout` works
   whatever `nightId` is, unlike `setLoadout`.
6. **Bests are per tier and per map:**
   `endlessBests: Partial<Record<DifficultyId, Record<DefId, number>>>`, keyed by map id. The step says
   "a per-map best". It's per map *within a tier*: a Cozy best is a number a Nightmare run can't
   approach, and a post-v1 leaderboard needs the tier (PERSISTENCE §7's replay tuple carries it).
7. **`wavesSurvivedOf(world)` moves into `core/campaign.ts`**, with the summary's rule unchanged, and
   `buildNightSummary` reads it. The best and the summary then print the same number.
8. **`endlessResultOf(world): EndlessResult` returns `{ mapId, difficulty, waves }`** and throws while
   the night runs or on a campaign night. `applyEndlessResult(progress, result)` keeps the maximum.
   Nothing else moves.
9. **`applyNightResult` throws on a night id that isn't in `NIGHTS`.** An endless world recorded as a
   campaign night pays Grocery Money and writes `nightResults.endlessSink`. The next load then sends
   the whole save to `:corrupt:`, because `fromProgressDto` throws on a result for an unknown night.
   Fail at the call instead.
10. **`worldOptionsForEndless(progress, mapId, seed): CreateWorldOptions`** returns the map's endless
    night and the map, the campaign's tier, `resolveModifiers(installations)` and
    `endlessLoadout(progress, mapId)`. It throws while endless is locked or for an unknown map. It's
    headless, like `worldOptionsFor`, so the harness builds a run exactly as the game does.
11. **The record goes to v3**, with a 2→3 migration: `cleared: nightId === null ? [difficulty] : []`,
    `endlessBests: {}`. A save that has already finished the campaign keeps its clear, and so keeps
    endless and the next tier.
12. **Reading v3:** `nightId` and `nightResults` keys stay campaign-only. Loadout keys accept endless
    ids too. `cleared` must hold tier ids (otherwise corrupt), with repeats dropped. A best keyed by an
    unknown tier is corrupt. A best for an unknown map is dropped, the way a loadout's unknown tower
    is: there's nothing left to show it against.
13. **The store gains `startCampaign(tier)`, `chooseEndlessLoadout(mapId, ids)` and
    `recordEndlessResult(result)`**, pessimistic and on `base()` like their neighbours.
    `startCampaign` building on `base()` matters most. The night-18 win that clears the tier may be the
    save that failed and is `pending`, and a new campaign built on the shown state would start without
    the clear that opened it.

## Build

### 1. The rules: `core/campaign.ts`

Decisions 1–10.

Gotcha: **`startCampaign` and `applyEndlessResult` copy `endlessBests` two levels deep.** Every progress
in the store's history shares nested objects until something copies them (20aA's `setLoadout` gotcha,
one level further in). The purity spec's deep freeze catches a write into the shared record, but only
once the new reducers are added to it.

### 2. The record: `data/dto/progress.ts`

Decisions 11 and 12.

Gotchas, all in `persistence.spec`:

- **Every corrupt case goes corrupt for the wrong reason.** They're `envelope(2, …)` around a `valid`
  that is now v3-shaped. The 2→3 migration's strict v2 parse rejects `cleared`, so each case lands in
  `:corrupt:` whether or not the check it names still exists. Move them to `envelope(3, …)`. "A version
  newer than this build" becomes `envelope(4, …)`, or it quietly loads.
- **`knownLoadouts`' `isNightId` drops an endless key on every load.** Nothing fails: the run's counter
  just resets to the default every visit. Give it a second predicate, and leave `nightId` and
  `nightResults` on the first.
- "Ships at v2" becomes "ships at v3 with exactly the 1→2 and 2→3 migrations". `codecWithV0` already
  spreads the chain, so its expectations only gain the two new fields.

### 3. The store: `ui/stores/progress.ts`, and the summary's one line in `ui/viewModel.ts`

Decisions 7 and 13.

## Tests

Extensions to `campaign.spec`, `persistence.spec`, `progressStore.spec` and `viewModel.spec`'s summary.

- **The ladder:** a fresh progress may start Cozy and Normal and is refused Nightmare as `'locked'`.
  After a Normal clear, Nightmare opens. A Cozy clear opens nothing new.
- **A clear is recorded once:** winning night 18 adds the tier to `cleared`. A second clear of the same
  tier doesn't repeat it. A loss of night 18 adds nothing.
- **A new campaign keeps the lifetime record and nothing else:** after a clear with installations,
  money, loadouts and a best, `startCampaign(…, 'nightmare')` is night 1, $0, nothing owned, no results
  or loadouts, `difficulty: 'nightmare'`, and the same `cleared` and `endlessBests`.
- **Endless:** locked before a clear and open after it, and still open after `startCampaign`.
  `worldOptionsForEndless` builds a world on the endless night with the campaign's tier, its
  installations and `endlessLoadout`. It throws while locked.
- **The endless loadout:** stored and legal, it's returned. After a campaign, with nothing stored for
  the map, it's night 18's loadout. Fresh, it's the first five endless towers. It survives a save and a
  load (the `knownLoadouts` gotcha).
- **The result:** a lost run at wave index 7 is 7 waves, the same as `buildNightSummary`'s
  `wavesSurvived`. A lower score leaves the best alone, and a higher one replaces it, under its own
  tier only. `applyNightResult` throws on an endless night id.
- **Purity:** `startCampaign`, `setEndlessLoadout` and `applyEndlessResult` join the deep-frozen spec.
- **The record:** a v3 progress with a clear, bests and an endless loadout round-trips deep-equal. A
  stored v2 with `nightId: null` reads with `cleared: [its difficulty]`, and a v2 mid-campaign with
  `cleared: []`. A best for `atticMap` is dropped, and a best under `'impossible'` is corrupt.
- **The store:** `startCampaign` is pessimistic like `buyInstallation`. After a failed save of the
  night-18 win, `startCampaign('nightmare')` then `retry()` lands a Nightmare campaign with Normal
  cleared, once.

## Acceptance

- [ ] Nothing outside `core/campaign.ts` decides whether a tier or endless is open, or what a run is
      played with.
- [ ] `OPEN-QUESTIONS.md` has no open endless row.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 21F and 21G

```
core/campaign.ts      Progress.cleared: DifficultyId[]
                      Progress.endlessBests: Partial<Record<DifficultyId, Record<DefId, number>>>
                      DIFFICULTY_LADDER: readonly DifficultyId[]          // cozy, normal, nightmare
                      tierUnlocked(progress, tier: DifficultyId): boolean
                      startCampaign(progress, tier): { ok: true; progress: Progress } | { ok: false; reason: 'locked' }
                      endlessUnlocked(progress): boolean
                      endlessMapIds(): DefId[]                             // MAPS order
                      endlessTowerIds(): DefId[]                           // every campaign unlock, unlock order
                      endlessLoadout(progress, mapId): DefId[]
                      setEndlessLoadout(progress, mapId, ids): SetLoadoutResult
                      endlessBest(progress, mapId): number | null          // at progress.difficulty
                      worldOptionsForEndless(progress, mapId, seed): CreateWorldOptions
                      wavesSurvivedOf(world): number
                      endlessResultOf(world): EndlessResult                // { mapId, difficulty, waves }
                      applyEndlessResult(progress, result): Progress
ui/stores/progress.ts startCampaign(tier): Promise<'ok' | 'locked' | 'busy' | 'failed'>
                      chooseEndlessLoadout(mapId, ids): Promise<'ok' | LoadoutProblem | 'busy' | 'failed'>
                      recordEndlessResult(result): Promise<'ok' | 'busy' | 'failed'>
```

## Do not

Draw any of it: the title's tiers (F), the Kitchen's way into a run, its screens and its summary (G).
Don't pay Grocery Money for a run, submit a score anywhere (`LeaderboardService` is post-v1), or give
endless a record of its own outside `Progress`.
