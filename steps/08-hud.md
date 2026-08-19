# Step 8 — Vue HUD v1 — **MILESTONE: playable prototype**

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, `../analytic-docs/ARCHITECTURE.md` §5 — the reactivity rule in there is not optional, ignoring it will cost you the frame budget.
**Prereq:** step 7.

## Goal

Replace the dev keyboard controls with a real interface. At the end of this step the game is genuinely playable by someone who hasn't read the code, and **you stop and play it**.

## Build

1. **The view model** (`ui/viewModel.ts`). A hand-built plain-object snapshot published into a `shallowRef` and **replaced wholesale** at ~15Hz. It contains only what the HUD shows: clock string, wave index/count, crumbs, crumbs-on-board, food items remaining (with names), noise (stubbed at 0), inter-wave countdown, early-call bonus preview, speed, and per-shop-entry `{ id, glyph, cost, affordable, unlocked }`.

   Never put entity arrays in it. Never make world state reactive. Publish the selected tower's stats on change rather than on the 15Hz tick, since 15Hz reads as laggy for numbers the player is actively watching.

2. **Components** (PascalCase names, camelCase props):
   - **`TopBar`** — clock (2:00am → 6:00am), wave `n/m`, crumbs 🍞, Grocery Money 💵, noise meter (present but inert until step 13), and the fridge contents as a row of food glyphs. Food is the health bar — make it the most visually prominent thing on screen.
   - **`TowerShop`** — a grid of emoji buttons with cost and a lock state. Hover shows a stat card: damage, rate, DPS, range, damage type, targets, noise. Unaffordable entries dim but stay hoverable. Number keys 1–9 select.
   - **`TowerInspector`** — appears on selecting a placed tower: glyph, tier, live stats, upgrade buttons (stubbed until step 12), targeting mode selector (stubbed until step 12), sell button showing the actual current refund including the mid-wave penalty.
   - **`WaveControl`** — "Call next wave" with the live early-call bonus, the inter-wave countdown, and pause / 1× / 2× / 3× buttons.
   - **`NightSummary`** — modal on win or loss: waves survived, food lost **listed by name**, enemies killed, crumbs collected vs dropped. Grocery Money is stubbed until step 20. Retry / continue.

3. **Placement interaction.** Selecting a shop entry enters placement mode: a ghost glyph follows the cursor with its range circle, tiles tint green or red for validity, click places, right-click or Escape cancels, and shift-click places repeatedly without leaving the mode. On an invalid click, surface the typed rejection reason from step 6 as a brief toast — "can't build on the track", not a silent no-op.

4. **Hotkeys**: `1–9` shop, `space` pause, `1/2/3` with a modifier or `,`/`.` for speed, `n` call wave, `x` sell selected, `esc` cancel, `` ` `` debug overlay.

5. **Layout.** Canvas centred, HUD in DOM around and over it. HUD root is `pointer-events: none` with children opting back in, so clicks pass through to the canvas for crumb collection. Design for 1280×720 up to 1920×1080; below 1280 wide, scale the canvas rather than reflowing.

6. **Style.** Warm 2am palette: deep blue-greys, warm amber accents for anything the player owns, cold blue for anything threatening. Rounded, soft, low-contrast chrome — the board should be the brightest thing on screen. No hard whites.

## Acceptance

- [ ] Nights 1–3 are fully playable with mouse and keyboard, no dev keys, no console.
- [ ] Frame time is unchanged from step 7. Profile it — if Vue costs you anything measurable, the view model is leaking reactivity into world state.
- [ ] Someone who has never seen the code can be handed the keyboard and understands what to do within a minute.

## Stop here and play it

This is the checkpoint the whole plan is built around. Play nights 1–3 several times, at every speed.

Ask, honestly:
- Is placing a tower and watching it work **satisfying**?
- Does the crumb loop create a real pull between defending and cleaning, or is clicking crumbs just a chore?
- Is calling waves early a decision you actually think about?
- Do you want to play night 4?

If the answer to the last one is no, the problem is in the core loop and no amount of Act II content will fix it. Change something here — crumb pacing, wave density, tower feel — before continuing. **Everything after this step assumes this step is fun.**
