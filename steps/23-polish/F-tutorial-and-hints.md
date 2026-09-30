# Step 23F — The first night, and first times

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §1, §4 (crumbs and rot) and §8
(noise), `../../analytic-docs/OPEN-QUESTIONS.md` §1 (the *recommended tile* row only).
**Prereq:** step 23D, for the seen list and the pause rule.

## Goal

A stranger can start the game and understand it without being told anything. Night 1 teaches itself
in four prompts, one at a time: place a Salt Shaker, collect a crumb, call the next wave early, and
watch a leak happen. No modal walls of text, and no forced click beyond the first. After that, each
new mechanic gets one quiet line the first time it happens: a crumb going off, something that flies,
the noise past half, the first mold. **Tests: the hint rules.** They're pure, and easy to get subtly
wrong.

## Already in the repo

Trust symbols over line numbers.

| File | What's there now |
| --- | --- |
| D's store | `settings.value.seenHints`, `markHintSeen(id)`, `resetHints()`. D's decision 6: an automatic pause restores what it found |
| `ui/views/GameView.vue` | `restart()` builds the world and resets per-night UI state (`wake`, `thiefBanner`, `lossCount`, …). `tick()` reads each tick's events. `publish()` builds the snapshot from the world at ~15Hz. `queue` is the command queue `interaction.ts` enqueues into. `loop.pause()`, `resume()`, `paused` |
| `core/sim.ts` `tick` | Commands drain **only at a tick boundary**, at the top of `tick()` |
| `core/systems/crumbs.ts` | `isRotting(crumb)`: a pile older than 20s |
| `core/systems/targeting.ts` | `isFlyer(entity)`, by tags |
| `core/tiles.ts` | `hasEffect`, `forEachTileWithEffect`. Mold is a tile effect |
| `world.noise` | `level`, `cap` |
| `core/content/nights.ts` `night01` | Six waves of Ants. Unlocks the Salt Shaker (ground only) and the Crumb Tray. Opens on a 6-second countdown (`OPENING_TICKS`). Normal starts with 200 crumbs |
| `ui/components/hud/*` | `WakeCard` at `top: 4.6rem`. `ThiefCard` and B's `WaveBanner` share `top: 7.4rem`. `ToastStack` at `bottom: 7.5rem` |
| `TopBar.vue`, `ThiefCard.vue` (19C) | The Mouse is announced a wave ahead and again when it arrives, every time |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **Hints are UI, keyed on facts about the world, and never live in `core/`.** `ui/hints.ts` is
   pure: facts go in (built from the world at publish, plus the events `tick()` saw), the seen list
   goes in, and one hint id or null comes out. Nothing is written to the world, so nothing reaches a
   replay.
2. **Tutorial prompts are hints.** They're ids in the same `seenHints` (`'tutorial.placeTower'`, and
   so on), shown on night 1 while unseen. One mechanism, one list, and one "show them again" button,
   which D built. A player who resets the campaign has already learned the game, and doesn't see it
   twice.
3. **The first prompt holds the clock, and nothing else does.** Night 1 opens on a 6-second
   countdown, too short for someone who has never seen the shop. While the first prompt is up, the
   loop is paused (by D's rule), until the player's first command. **It's released on the enqueue,
   not on `towerPlaced`.** A paused loop runs no ticks, so the command never drains and the event
   never arrives. Symptom: the player places the Salt Shaker, nothing appears, and the prompt waits
   forever. Watch the queue: `queue.length > 0` in `draw()`, or a wrapper handed to
   `createInteraction`. Any command releases the hold, and so does the player unpausing. The other
   three prompts never pause.
4. **No Mouse hint.** 19C's warning in the top bar and its card already announce the Mouse every
   time, and C gave it a sound.
5. **Noise is relative to the cap.** "Past half" is `level / cap > 0.5`. With Close the Door and the
   White-noise Machine the cap is 155, and `level > 50` would fire at 32%.
6. **"Something flies" means `isFlyer`, and on nights 1–7 it's a Fruit Fly.** The first flyer most
   players see hatched out of rot, not out of night 8's wave. Write the line so that it's true of
   both. It's also the moment to say the Salt Shaker can't reach it.
7. **One at a time.** A queue with an order: a tutorial prompt beats a hint, and a hint waits while
   another is on screen. Each is marked seen **when it's shown**, so a hint that went by under a wake
   doesn't come back to nag.
8. **No recommended-tile hint.** OPEN-QUESTIONS.md §1 left it to step 22 or 23. Where to build is the
   decision the game is about, and a tile lit up for you takes that decision away. The first prompt
   says "near the track" and stops there. Strike the row and write this answer in it.

## Build

### 1. `ui/hints.ts`

Decisions 1, 2 and 5–7. The facts builder reads the world (rotting piles, flyers, the noise
fraction, a mold tile) and the frame's events (a crumb collected by click, a wave called early, a
leak). The chooser is pure and picks.

### 2. The card and the wiring: `ui/components/hud/HintCard.vue`, `HudLayer.vue`, `GameView.vue`

Decision 3 for the hold. The card gets a slot of its own that it doesn't share with the wake, the
banner or the toasts. It has a dismiss control, and it's never modal.

Gotchas:

- **Reset the tutorial's state in `restart()`**, the way `wake`, `thiefBanner` and `lossCount` are
  reset. Otherwise a Retry of night 1 opens holding the clock for a prompt from the previous attempt.
- **Start the hold in `restart()`, before the first tick.** Starting it from the first `publish()`
  lets four frames of countdown run first, which is harmless. Starting it from an event that can't
  arrive while paused is decision 3's deadlock.
- The collect prompt needs a crumb to exist first. Salt Shaker kills drop piles, but a Crumb Tray
  placed early collects them all. The prompt waits for a click (`crumbCollected` with `byTowerId ===
  null`), and gives up gracefully once the Tray has made it moot.

### 3. The copy: `en.ts`

Short, in DECISIONS.md §1's voice, where the objects never talk. "The crumbs are going off." beats
anything with an exclamation mark. H reads it again.

## Tests

`tests/hints.spec.ts`, over the pure chooser and the facts builder:

- Noise at 60 of 100 shows the noise hint. 60 of 155 doesn't. 78 of 155 does.
- A seen hint never comes back, whatever the facts say, and `resetHints` brings it back.
- On night 1 with nothing seen, the prompts come in order. A prompt whose condition is met out of
  order (a crumb clicked before the first tower) is marked done without being shown.
- A hatched Fruit Fly on the board counts as the first flyer.
- On night 2, no tutorial prompt is ever chosen.
- With a rotting pile *and* a flyer in the same publish, one hint comes back, and the other comes on
  a later call.

## Acceptance

- [ ] Hand the game to someone who has never seen it. They get through night 1 without asking
      anything.
- [ ] The first prompt waits for them, and nothing after it does.
- [ ] Night 2 has no tutorial. The first rotting pile, the first flyer, the first half-full meter and
      the first mold each get one line, and never another.
- [ ] Settings → "show the hints again", then night 1: the tutorial runs again.
- [ ] Retry night 1 halfway through the prompts: it carries on from the first unseen one, and
      doesn't hold.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

Leave every judgement criterion unticked unless you actually sat and looked.

## Do not

No modal, no arrow walkthrough, and no forced click after the first. No tile highlighting (decision
8). No `core/` change and no new settings field. No hints for towers, upgrades or installations: the
codex and the shop's cards teach those. Don't link to the codex from a hint, because leaving `/night`
ends the night.
