# Step 20a — Loadouts

> This step is two sessions. Paste **one part file** into a fresh session, in order, and `/clear`
> between them. Do not paste this index. It only says what the parts are and how they fit.

**Prereq:** step 20, all five parts. This split was written against `bcd303a` (20E), with the sprite
work (`render/sprites.ts`, `ui/components/EntityGlyph.vue`, D21 in `DECISION-LOG.md`) uncommitted in
the tree. Neither part depends on it; B says what to do if it has landed.
**Runs between steps 20 and 21.** Steps 21 and 22 both depend on it: authoring and balancing nights
without loadouts in place would have to be redone.

## Goal

The player can't bring everything. Before each night they choose a fixed number of towers to set out
on the counter, and only those appear in the shop. Small as a system, large as a design consequence:
every night stops being "do I have the counter" and becomes "did I *anticipate* the counter", and the
night preview stops being decoration (`../analytic-docs/DECISIONS.md` §10).

## Parts

| Part | Session | Builds |
| --- | --- | --- |
| [A](20a-loadouts/A-rules-and-record.md) | The rules, the night and the record, headless | the three counter-space installations and `WorldModifiers.loadoutSlots`, `NightState.loadout` (renamed from `availableTowerIds`) and the `notInLoadout` refusal, `core/loadout.ts`, `Progress.loadouts` with `setLoadout` / `tonightsLoadout` / `previousLoadout`, the progress record at v2 with its first real migration, and the store's `chooseLoadout` |
| [B](20a-loadouts/B-loadout-screen-and-shop.md) | The loadout screen, and the shop that follows it | the `'loadout'` route and screen (the counter, the roster by role, stats on hover, the "last night's" preset, the full enemy composition with tags), Start and Retry routed through it, the draft in the session store, the in-night shop showing only the loadout, the installation copy rewritten |

Strictly in order. B draws the rules A writes and saves through the store method A adds.

**A carries the step's headless tests** (installations, `loadout.spec`, campaign, placement,
persistence). **B carries view-model tests only**, over `ui/loadoutView.ts`, `ui/kitchenView.ts` and
`ui/viewModel.ts`'s shop, and none over components.

The step's first test is split along the same line: A asserts that a `PlaceTower` outside the loadout
is refused with a typed reason, and B asserts that the shop contains exactly the loadout. They read the
same field and share no code, so nothing is lost by splitting them.

**Authored twice on purpose:** the three new installations' English and their spots in the Kitchen
scene. A drafts both because `contentKeys.ts` and `KitchenScene.vue`'s `SPOTS` record fail `type-check`
without them. B rewrites them with the loadout screen's blocked slots on screen, since that's where
these three installations finally mean something.

## The seam that can't be split

**A world is a function of progress and a seed, and nothing else.** The loadout a night is played with
is saved onto `Progress` before the night starts, and `worldOptionsFor` reads it through
`tonightsLoadout`, the same function the screen preselects with. If the chosen loadout travelled to
`GameView` through the session store or a route param instead, a reload mid-night, a Retry and step
22's harness would each build tonight from a different source. The first time they disagreed, a player
would find a tower missing from the shop that they know they chose.

## Contradictions this split resolved

Each one is settled in the part that implements it, with its reason there.

1. **"Nights 1–5 present fewer unlocked towers than slots."** Night 1 unlocks two towers, so night 5
   has six. Nights 1–4 fit, and night 4 fills all five exactly. Night 5 is the first cut at base slots.
   The test asserts that. `CONTENT.md` §8's *Loadout slots* table had the same off-by-one and was
   corrected in this split's commit (A, Tests).
2. **`NightState.loadout: TowerId[]`, required.** 20B's reason for `null` still holds: specs push
   synthetic towers after building their world. So it's `loadout: DefId[] | null`, renamed from
   `availableTowerIds`, and the campaign always passes a list (A, decision 1).
3. **"Rejected with a typed reason."** `'locked'` exists, but its English says "You do not have that
   one yet", which is wrong for a tower you own and left upstairs. It becomes `'notInLoadout'` (A,
   decision 3).
4. **Where the chosen loadout lives.** 20C reserved the session store for the "loadout-in-progress".
   The draft goes there. The *chosen* loadout is saved on `Progress` when the night starts, per the
   seam above (A, decision 7; B, decision 4).
5. **"A v2 or an optional field, its call"** (20C, decision 7). A v2, with the chain's first real
   migration (A, decision 11).
6. **"Selecting past capacity swaps"** beside **"preselect"**. A swap is what a click does. The
   default never swaps a new tower in, so the first full counter is the player's own cut (A,
   decision 8).
7. **Retry.** 20D's Retry calls `restart()` straight away. DECISIONS.md §10 says a retry reopens the
   loadout screen. A campaign night's Retry now routes there, and a dev override's still restarts (B,
   decision 5).
8. **The shop's greyed locked entries** (20E, decision 4) are replaced by hiding. 20E's "same key on
   night 3 and night 9" no longer holds. Keys follow the loadout, in shop order (B, decision 7).
9. **"A link straight into the Codex (step 23)."** There is no Codex, and no dead link gets added. The
   draft is kept in a store so step 23's round trip loses nothing. Step 23's Codex line was edited in
   this split's commit to own the link.
10. **"Endless mode uses the same loadout flow."** Endless is step 21's. Step 21's item 4 was edited in
    this split's commit to say it's chosen through this screen once per run.
11. **"Show the map, the wave count, the modifier."** One map, and no modifiers until step 21. The
    preview names the map and counts the waves. Step 21's items 1 and 2 were edited to put the map's
    shape and the modifier on this screen's preview (B, decision 3).
12. **"Filterable by role."** `TowerDef.role` exists and has no English. B adds `loadout.role.*`,
    typed over `TowerRole` in `contentKeys.ts` (B, decision 8).

## Step acceptance

- [ ] Around night 8, leaving a tower behind starts to feel like a real cost.
- [ ] The night preview gives you enough information to choose well. If you're guessing, the preview
      is under-informative, not the mechanic.
- [ ] Losing a night and winning it with a different loadout is a satisfying second attempt, not a
      chore.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Consequences for later steps

- **Step 21 (night authoring):** every night must be winnable by **more than one loadout**. A night
  with exactly one valid answer is a lockout, not a puzzle. Design each night's enemy mix so at least
  two counters exist.
- **Step 22 (balance harness):** every policy selects a loadout before each night, through
  `setLoadout` and then `worldOptionsFor`. Add a `loadoutPolicy`, at minimum `optimal` (the best
  counters given full knowledge of the night) and `blind` (generically strong towers, ignoring the
  preview). **The gap between those two win rates is the measure of whether loadouts are a fair puzzle
  or a memorisation tax.** If `blind` can't clear Act I, the preview isn't informative enough or the
  slots are too tight. `core/loadout.ts` is Progress-free so a policy can build lists with it.
- **Step 23 (codex):** the codex is now a core screen and must be reachable from the loadout screen.

## Do not

Add loadout presets or saved builds beyond "last used" and "last night's", per-tower loadout costs,
or any restriction on selling and rebuying within a night. Loadouts constrain what you *bring*, never
what you do once the night starts.
