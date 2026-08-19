# Step 20a — Loadouts

> Paste this entire file as your prompt into a fresh session.
> **Runs between steps 20 and 21.** It needs the Kitchen screen from step 20, and steps 21 and 22 both depend on it — authoring and balancing nights without loadouts in place would have to be redone.

**Read first:** `CLAUDE.md`, `../analytic-docs/DECISIONS.md` §10, `../analytic-docs/CONTENT.md` §8 (installations, loadout slots).
**Prereq:** step 20.

## Goal

The player can't bring everything. Before each night they choose a fixed number of towers to set out on the counter, and only those appear in the shop.

Small system, large design consequence: it converts every night from "do I have the counter" into "did I *anticipate* the counter", and it makes the codex and the night preview load-bearing rather than decorative.

## Build

1. **The model.** `NightState.loadout: TowerId[]`, fixed at night start and immutable for the duration. Slot count comes from `WorldModifiers.loadoutSlots` — base **5**, plus 1 for each of the three counter-space installations, max **8**.

2. **Shop filtering.** `TowerShop` shows only towers in the loadout. Do not grey out the others — hide them entirely. The shop should feel like *your* shop for tonight, not a reminder of what you left upstairs.

3. **The loadout screen**, on the Kitchen hub, immediately before "Start night N". Fiction: what you set out on the counter before bed.
   - Every unlocked tower, filterable by role, with full stats on hover.
   - Slots shown as physical counter space — an empty counter filling up as you choose. Selecting past capacity swaps rather than refusing.
   - **The night preview sits beside it and is the point of the screen.** Show the map, the wave count, the modifier, and **the full enemy composition of the coming night** — not just what's new. Tags visible on each enemy, since tags are what the player is choosing against.
   - A link straight into the Codex (step 23) from here, so the damage matrix is one click away while choosing.
   - Remember the last loadout used per night and preselect it, so a retry doesn't mean rebuilding from scratch. Also offer "last night's loadout" as a one-click preset.

4. **Retry flow.** Losing a night returns to the loadout screen with the previous loadout preselected and fully editable. Rebuilding the loadout *is* the intended second attempt — it's how the player learns the matrix.

5. **Installations.** Add the three from `../analytic-docs/CONTENT.md` §8: Clear the Drying Rack (170), Take the Toaster Off the Counter (240), Second Shelf (320). They fold into `WorldModifiers` like every other installation.

6. **Endless mode** uses the same loadout flow, chosen once at run start and locked for the run.

7. **Validation.** A loadout below capacity is legal — bringing 3 of 6 is the player's business. An empty loadout is not; require at least one.

## Tests

- The shop contains exactly the loadout's towers and no others; a `PlaceTower` command naming a tower outside the loadout is rejected with a typed reason.
- Slot count is base 5 and rises by exactly 1 per counter-space installation, capped at 8.
- Selecting a 6th tower with 5 slots swaps out the oldest selection rather than failing.
- Loadout is immutable once the night starts — assert no command can mutate it.
- Losing and retrying preselects the previous loadout.
- Nights 1–5 present fewer unlocked towers than slots, so the screen is trivially satisfiable and teaches itself.

## Acceptance

- [ ] Around night 8, leaving a tower behind starts to feel like a real cost.
- [ ] The night preview gives you enough information to choose well — if you're guessing, the preview is under-informative, not the mechanic.
- [ ] Losing a night and winning it with a different loadout is a satisfying second attempt, not a chore.

## Consequences for later steps

- **Step 21 (night authoring):** every night must be winnable by **more than one loadout**. A night with exactly one valid answer is a lockout, not a puzzle. Design each night's enemy mix so at least two counters exist.
- **Step 22 (balance harness):** every policy must now select a loadout before each night. Add a `loadoutPolicy` — at minimum `optimal` (picks the best available counters given full knowledge of the night) and `blind` (picks generically strong towers, ignoring the preview). **The gap between those two win rates is your measure of whether loadouts are a fair puzzle or a memorisation tax.** If `blind` can't clear Act I, the preview isn't informative enough or slots are too tight.
- **Step 23 (codex):** the codex is now a core screen, not a nice-to-have, and must be reachable from the loadout screen.

## Do not

Add loadout presets/saved builds beyond "last used" and "last night's", per-tower loadout costs, or any restriction on selling and rebuying within a night. Loadouts constrain what you *bring*, never what you do once the night starts.
