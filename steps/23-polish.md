# Step 23 — Polish pass — **MILESTONE: v1 shippable**

> This step is eight sessions. Paste **one part file** into a fresh session, in order, and `/clear`
> between them. Do not paste this index. It only says what the parts are and how they fit.

**Prereq:** see *When to run it* below. This split was written against `eb45174` (the fridge
sprite, on top of 20aB). Steps 21 and 22 weren't built, and were being split at the same time.

## Goal

The difference between "the systems work" and "this is a game someone finishes". A kitchen that is
dark at 2am and lighter where your towers stand. Hits, deaths and purchases you can feel, and a noise
meter you can hear. A first night that teaches itself, a codex for the counter system, and settings.
A crash that hands you a replay instead of a frozen board. A build small enough to ship. Every item
here is optional on its own, and together they decide whether anyone finishes the game.

## When to run it

The step was written with `Prereq: step 22`. Only H actually needs it:

- **A–G don't depend on step 21 or 22.** They touch `render/`, a new `audio/`, `ui/`, one event
  change in `core/`, and a new `core/replay.ts`. They can run now or after 22.
- **H needs step 22, and so step 21.** Its acceptance is "all 18 nights winnable on Normal". Its copy
  pass reads 21's modifier and map names, and its font manifest and bundle budget have to cover 21's
  five new maps.
- If 21 or 22 lands between two parts, take each remaining part's pre-flight seriously. The `Already
  in the repo` tables name `GameView.vue`, `TitleView.vue`, `en.ts` and the settings record, all of
  which step 21 touches.

## Parts

Each part names its own `Read first:` sections, so a session only loads the docs it needs.

| Part | Session | Builds |
| --- | --- | --- |
| [A](23-polish/A-the-dark-kitchen.md) | The dark kitchen | the palette retuned on both sides, a light layer that the Nightlight, Candle, Burner and fridge cut holes in, a surface per map, contact shadows, and a colour-blind variant behind one setter |
| [B](23-polish/B-juice.md) | Juice | `towerUpgraded` and a fuller `towerSold`, death poofs, the placement thunk, the upgrade sparkle, shake for the snap and the collapse, a scuttle for walkers, the wave banner and the last-wave flourish, and two switches for D |
| [C](23-polish/C-sound.md) | Sound | `src/audio/` on raw WebAudio with its lint lane, synthesized cues that a file overrides by name, the noise meter as a sound, ambience, the Mouse's arrival, three volume buses |
| [D](23-polish/D-settings.md) | Settings | the settings record at v2 with every knob in it, one panel for the title, the Kitchen and the night, rebinding by `event.code`, key labels from the bindings, the pause rule |
| [E](23-polish/E-codex.md) | The codex | `/kitchen/codex` from the Kitchen and the loadout screen, discovered entries with stats, silhouettes, the matrix as a grid |
| [F](23-polish/F-tutorial-and-hints.md) | The first night, and first times | night 1's four prompts, the first one holding the clock, and first-time hints for rot, flyers, noise and mold, all through D's seen list |
| [G](23-polish/G-when-it-breaks.md) | When it breaks | `core/replay.ts`, the night recorded as its options plus a command log, a crash card that exports the recording, a loop that survives a throw, pause on blur and tab-out |
| [H](23-polish/H-copy-font-and-ship.md) | Copy, the font, and shipping | the lost-food line grouped and spoken, every line reread in tone, the emoji subset and the glyph audit, `base`, the 3MB budget, the deploy workflow, the milestone |

**Order: A → B → C → D → E → F → G → H.** B's shake and scuttle sit on A's shadows and light. C
plays B's events. D persists A's, B's and C's knobs, and nothing else may. F writes to D's seen list
and follows D's pause rule. E needs only A, and G needs only D, so either can move earlier. H is
last because it rereads every line the others wrote.

**Tests are spread by what each part can break silently.** B asserts the two event changes. C adds a
`lint.spec` case for the audio lane. D asserts the settings migration and `rebind`. E tests the
codex's discovery and multiplier rules, F the hint rules. G carries the step's one determinism test,
a record-and-replay of a real night. H tests the food line's grouping and the font manifest. **A has
none**, by ARCHITECTURE.md §7.

**Authored twice on purpose: the copy.** Each part writes its own lines in DECISIONS.md §1's voice.
H rereads all of them together, with the whole game on screen. A–G shouldn't polish copy at the
build's expense, but they should write it in tone. A's surfaces are authored twice as well, but
across steps: A judges each one on the Counter, and step 21 picks one per map.

## The seam that can't be split

**The settings record is written once, in D, with every field the step needs.** A, B and C expose
setters with defaults and persist nothing. F appends to D's `seenHints` and adds no field. If any
part persisted its own knob, the record would reach v3 inside one release. A v1 save would then walk
two migrations, written in two sessions that never saw each other.

**Effects and sounds come off the same per-frame event drain**, `frameEvents` in `GameView.vue`'s
`draw()`. B draws from that one list and C plays from it. A consumer that reads `world.events` once
a frame sees one tick in three at 3× (step 5C, decision 2). The sparkle and its chime would then
disagree, and only at speed.

## Contradictions this split resolved

Each one is settled in the part that implements it, with its reason there.

1. **`Prereq: step 22`**, with 21 and 22 not built. A–G run on the repo as it is. H waits for 22
   (see *When to run it*).
2. **"Subset Noto Color Emoji … so the game renders identically everywhere."** Towers, enemies,
   crumbs and the fridge have been sprites since D21. The font now covers the food, decor, the crack,
   installations and the HUD's emoji: about thirty glyphs, not eighty. DECISIONS.md §2's reason, bugs
   looking different on each OS, no longer applies to bugs. H keeps the font for what's left and
   rewrites §2 first (H, decision 1).
3. **"Baking Soda and Salt Shaker share 🧂 — fix."** Already done. Baking Soda is 🥣 with its own
   sprite, and SPRITES.md tells five look-alike pairs apart. What's left to audit is the food at
   shelf size, and decor glyphs that collide with a sprite's key (H, build 2).
4. **"Rounded track edges."** Done since 3B (`lineJoin` and `lineCap` are round). Dropped.
5. **"Hit flashes, floating damage numbers colour-coded by matrix effectiveness … crumb collection
   pop and a rising `+N`."** Built in 6C, 16B and 7C. B adds the missing death poofs and rebuilds
   nothing.
6. **"Enemy idle animation — a slight bob."** 11C gave flyers a bob with a shadow, and 19C decision
   4 keeps every walker still so a fleeing thief's hop reads as faster. Walkers get a scuttle along
   their heading, with no vertical motion (B, decision 4).
7. **"Warm radial pools around … the Burner."** `palette.ts` keeps heat out of the lamp family,
   because an amber heat glow reads as lit, not lethal. The light layer lifts the dark around a
   Burner without the amber, and the ember stays on top (A, decision 3).
8. **"Soft shadows under every entity."** Flyers already cast a shadow that shrinks with the bob,
   and a burrowed Weevil is a mound. Shadows go under what stands on the floor (A, decision 5).
9. **"Every discovered … enemy."** The Fruit Fly is in no wave. It's discovered from night 1 by rule,
   as CONTENT.md §2 says it hatches from night 1 (E, decision 2).
10. **"Settings: … reset progress."** 20D put Reset in the Kitchen's footer, with its save states.
    It stays there, with no second copy (D, decision 8).
11. **A settings screen.** Routing away from `/night` unmounts the world, and nights aren't
    resumable (ARCHITECTURE.md §8). Settings is a panel, not a route, and in a night it pauses (D,
    decision 5).
12. **"First-time hints … the Mouse's approach."** 19C's top-bar warning and card already announce
    it every time. No new hint. C gives it a sound (F, decision 4).
13. **"Wave-start banner."** `ThiefCard` fires on the same `waveStarted`, and 19C left "the general
    wave-start banner" to this step. One slot: on a thief wave, the thief card is the banner (B,
    decision 6).
14. **"Night names."** Nights have no name and no field for one. The named nights are the modifier
    nights in CONTENT.md §6, which step 21 names. None are invented (H, decision 3).
15. **"Keep the whole [audio] set under 2MB"** beside **"target under 3MB including the emoji font
    subset".** The build was about 1.1MB at split time (642KB of JS and 36 PNGs), so 2MB of audio
    breaks the 3MB. Cues are synthesized, and a file dropped in `assets/audio/` overrides one by
    name, the sprite rule. The audio budget is whatever 3MB leaves (C, decision 3). Howler or raw
    WebAudio: raw, and no new library lane (C, decision 1).
16. **"Key rebinding."** Key names are baked into `en.ts` (`hud.sellKey` says "(x)", plus
    `upgradeKey`, `callWaveKey` and `debug.hint`) and into the shop's `hotkeyLabel`. They now come
    from the bindings (D, decision 3).
17. **"Error boundary that offers to export `(seed, mapId, nightId, commandLog)`."** There's no
    command log anywhere, and a throw inside the rAF loop never reaches Vue's error handler. The
    tuple is also short: difficulty, the installations' modifiers and the loadout build the world too
    (G, decisions 1–3).
18. **"Pause on window blur."** The settings panel (D) and night 1's first prompt (F) pause as well,
    so three owners share one boolean. Every automatic pause restores what it found, and only blur
    doesn't resume (D, decision 6).
19. **"Deploy static to itch.io or GitHub Pages."** Publishing is outward-facing. H prepares the
    build and the workflow, and asks before anything is published. `vite.config.ts` has no `base`,
    so a Pages project site would 404 every asset today (H, decisions 4 and 5).
20. **OPEN-QUESTIONS.md §1** has two rows due at step 23. C answers the audio direction: no music,
    and the quiet is the score. F answers the recommended-tile hint: no.

## Step acceptance

- [ ] A stranger can start the game and understand it without being told anything.
- [ ] The kitchen looks like a dark kitchen at 2am, not a grid with emoji on it.
- [ ] The noise meter is tense to listen to.
- [ ] All 18 nights are winnable on Normal, and the campaign is worth finishing.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green, and the
      production build is under 3MB.

## Consequences for later steps

- **Step 21**, if A and B land first. Each new map gets a line in `render/surfaces.ts` beside its
  `map.<id>.name` in `en.ts`. The modifier banner at night start uses B's banner slot rather than
  adding a fourth card. Its maps' decor must pass H's font manifest spec, and must not use a tower's,
  an enemy's or a crumb band's glyph.
- **Step 22.** `core/replay.ts` (G) replays an exported crash report headless, and a harness run
  can be written in the same format.

## **MILESTONE: v1**

Ship it, once H's closing questions come back mostly yes.

After that, the original roadmap's Tiers 3–5 are waiting, and each is a self-contained system that
drops in without destabilising anything here: adjacency buffs, autonomous units (Roomba, Cat), chain
lightning, the ultimates, the bosses and the reactive enemies. The architecture from step 1 was
chosen so that none of them needs a refactor. The tile state, the tower HP, the behaviour vocabulary
and the pushback system are already in place and waiting for them. Write their steps then, from the
code, not before (DECISION-LOG.md D17).

## Do not

Add content. No towers, enemies, nights, maps, modifiers, difficulty selection or endless mode (step
21), and no number changes (step 22). Polish is presentation, onboarding, robustness and the build.
