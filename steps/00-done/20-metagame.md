# Step 20 — Night flow, Grocery Money, installations, save/load

> This step is five sessions. Paste **one part file** into a fresh session, in order, and `/clear`
> between them. Do not paste this index. It only says what the parts are and how they fit.

**Prereq:** step 19, all four parts. This split was written against `ee1f3b2` (19B). 19C and 19D had
not landed, so the parts name their **handoff contracts** (`NightSummaryView.foodEscapedNameKeys`,
`HudSnapshot.upcomingThief`, night 14 in `NIGHTS`) and not code anyone could read. The parts also name
symbols rather than line numbers in every file 19C touches: `viewModel.ts`, `NightSummary.vue`,
`TopBar.vue`, `en.ts`.

## Goal

The frame around the nights. Right now you play a night and it ends. After this step you play a
*campaign*: a night pays Grocery Money for how well you played it, the Kitchen is where you spend it,
what you buy changes the next night, towers unlock night by night, and all of it survives a reload.
That goes through a persistence layer built as ports and adapters, so the .NET backend is one adapter
later and not a rewrite.

## Parts

Each part names its own `Read first:` sections, so a session only loads the docs it needs.

| Part | Session | Builds |
| --- | --- | --- |
| [A](20-metagame/A-installations.md) | Installations, headless | the installation effect union, the eleven installations, `WorldModifiers` on the world, and the eight hooks that don't exist yet (sweep, collect travel, crack spawns, flyer delay, spread rate, food bonus, snack stash, and the Tupperware hook moved onto it) |
| [B](20-metagame/B-payout-and-campaign.md) | The night's pay and the campaign's rules, headless | `core/systems/scoring.ts`, the award at night end, `NoiseState.peakLevel`, unlocks authored on the nights, `availableTowerIds` and the `locked` refusal, `core/campaign.ts` |
| [C](20-metagame/C-persistence.md) | Persistence | `data/` (ports, DTOs, the localStorage and mock-remote adapters, selection), the five composables, the Pinia stores, the lint rule and the spec that proves it |
| [D](20-metagame/D-kitchen-and-flow.md) | The Kitchen and the way through it | routes, the title, the Kitchen screen, `GameView` built from progress, the result recorded and saved at night end, loading and error states, the installation copy |
| [E](20-metagame/E-summary-and-shop.md) | The night summary and the shop | the Grocery Money breakdown, lost food by name, peak noise and wakes, the shop in unlock order with locked towers greyed, the broom's ring, the summary copy |

Strictly in order. B's campaign rules fold A's installations. C saves B's `Progress`. D can't wire a
screen to a store C hasn't written. E reads the summary D routes out of.

**A, B and C carry the step's tests** and are headless. **D and E carry a few view-model tests each**,
over `ui/kitchenView.ts` and `ui/viewModel.ts`, and nothing over components or `render/`.

**Authored twice on purpose:**

- *Installation English.* A drafts the eleven names and descriptions because `contentKeys.ts` fails
  `type-check` without them. D rewrites them with the Kitchen cards on screen.
- *Installation glyphs.* A picks one per def so the schema is complete. D may swap any of them once
  the scene is drawn.

All the part files say so.

## The seam that can't be split

**Progress changes in one place, and only after it's saved.** `core/campaign.ts` holds the only
functions that turn one `Progress` into the next (`applyNightResult`, `buyInstallation`). The progress
store applies them to the current state, saves the result, and assigns it only when the save resolves.
And the money a night pays is computed once: `resolve` stores `groceryMoneyFor(world)` on
`night.pay` at the terminal tick, `nightResultOf` hands its total to the campaign, and the summary
lists its terms. If a
component computes a reward itself, the summary and the balance disagree by a rounding. If the store
assigns before the save resolves, a failed save shows up as progress that's gone after the reload, and
retrying it awards the night twice.

## Contradictions this split resolved

Each one is settled in the part that implements it, with the reason there.

1. **"Everything built in steps 7, 13, 15 and 19 already reads these from hooks."** Two of ten did:
   13A's noise pair and 19A's `stealsReduction`. The other eight hooks don't exist, and building them
   is most of A.
2. **`core/modifiers.ts`.** Step 21 puts night modifiers in `core/content/modifiers.ts`. The fold
   lives in `core/content/installations.ts` beside the defs, the way `resolveNoiseModifiers` already
   does, and the type goes in `core/types.ts` (A, decision 3).
3. **`collectTravelTicks` as a value.** Replacing the authored trip with 42 ticks would slow the
   Crumb Tray's tier 3, whose trip is 0. So it's a cap (A, decision 5).
4. **"Assert Better Tupperware reduces an ant's steals."** An Ant steals 1 and the floor is 1, so
   nothing can reduce it. The test goes through the Beetle (2 to 1) and the Mouse (5 to 4), and it
   asserts the Ant is unchanged (A, Tests).
5. **"Flyer waves arrive one wave later."** No night has flyer-only waves as a category. Flies ride in
   mixed waves from night 9. The delay is per entry, and a last-wave flyer never arrives (A,
   decision 8).
6. **"Persist unlocked towers."** They're derived from the current night instead. That's one truth,
   and a content change to an unlock night reaches old saves (B, decision 8).
7. **Step 21 item 5 also says "unlocks".** B authors all eighteen nights' unlocks now, and step 21's
   line was edited in this split's commit to say so.
8. **Peak noise.** Step 22 said 13A kept it off the world because nothing read it. The summary reads
   it now. It has to be written inside `noiseSystem`, because the level is zeroed on the wake tick and
   a reader after the tick never sees the cap. Step 22's line was edited in this split's commit (B,
   decision 7).
9. **"A v0 save migrates cleanly" beside "only v1 present."** The chain is a parameter of the reader,
   so the spec supplies a synthetic v0 and the shipped chain stays empty (C, decision 6).
10. **Stores or composables?** `../../CLAUDE.md` says Pinia holds the metagame state and "a store calls a
    composable". `PERSISTENCE.md` §4 gives the composables the state. The store holds the state and
    the composable holds the I/O and its `loading`/`error`. C edits §4 to match (C, decision 10).
11. **"Loadouts" in the persisted contents.** They're 20a's, and it adds them to the record (C,
    decision 7).
12. **Difficulty.** Step 21 owns the selector. Step 20 persists `difficulty` and defaults it to
    `normal` (B, decision 13).
13. **The empty stubs.** `data/adapters/localStorage.ts` and `mockRemote.ts` are files, and the step
    wants directories. They become directories (C, decision 1).
14. **"Vitest over `core/` only."** The step's own persistence tests are over `data/`. Those tests
    are what catches a corrupt save being thrown away, which is the silent-drift kind the rule exists
    for. They stay.
15. **"Continue / retry" beside "summary → kitchen".** Continue goes to the Kitchen and Retry replays
    the night straight away. Both wait for the save (D, decision 9).
16. **Shop order and number keys.** `TOWERS` order isn't unlock order, so keys would shift every time
    a tower unlocks mid-list. The shop goes in unlock order and the keys bind to the first ten
    available towers (E, decision 4).
17. **"40% (say)".** It's exactly 40%, per `../../analytic-docs/DECISION-LOG.md`'s table.

## What this leaves for 20a

`NightState.availableTowerIds` (B) is the field 20a narrows to the loadout. `null` means
"unrestricted" today, and 20a can rename it `loadout` and make it required. The installation effect
union (A) gets a `loadoutSlots` kind. The shop's greyed locked entries (E) are replaced by 20a's rule:
towers outside the loadout aren't shown. The progress record (C) gains the last loadout per night.

## Step acceptance

- [ ] Finishing a night and choosing an installation is a decision you look forward to.
- [ ] The kitchen visibly changes as you buy things.
- [ ] The night summary makes you want to play the night better.
- [ ] With `VITE_DATA_MODE=mock` the game still works: slower, occasionally failing, every screen
      showing a loading state, and every failure offering a retry.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Add achievements, statistics screens or a codex (step 23), the difficulty selector, endless mode or
night modifiers (step 21), loadouts or the three counter-space installations (20a), a settings screen
(step 23), or the HTTP adapter (post-v1, `../../analytic-docs/PERSISTENCE.md` §7).
