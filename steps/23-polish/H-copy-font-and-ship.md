# Step 23H — Copy, the font, and shipping

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §1 (read it again before you
change a line of copy), §2 *Art: emoji sprites* and §6, `../../analytic-docs/CONTENT.md` §7,
`../../analytic-docs/OPEN-QUESTIONS.md` §4 (the emoji font row only).
**Prereq:** steps 23A–G, **and step 22** with its numbers tuned, which means step 21 as well.

## Goal

The last session before v1. Every line the player reads, read again in one voice, with the lost-food
line said the way DECISIONS.md §1 hears it. The emoji that are left, drawn the same on every machine.
A production build that holds the game and nothing else, weighs under 3MB, and runs from a static
host. Then stop and play it. **Tests: the food line's grouping and the font manifest.** Both can be
wrong without anything looking broken.

## Already in the repo

Trust symbols over line numbers.

| File | What's there now |
| --- | --- |
| `ui/locales/en.ts` | About 850 lines, with tone notes from 8A onward. A–G each added their own lines. The `food.*.name` values are title case ("Slice of Pizza", "Cheese") |
| `ui/joinNames.ts`, `NightSummary.vue`, `WakeCard.vue`, `TopBar.vue` | Food names joined into sentences: "Lost: {items}", "Carried off: {items}", "Gone with the {thief}: {items}" |
| `core/world.ts` `stockFridge` | 18 + ⌊night / 3⌋ items drawn from a pool of 12, so **duplicates are certain**. Today the line can read "Lost: Cheese, Slice of Pizza, Cheese and Cheese" |
| `render/glyphCache.ts` `EMOJI_FONT` | `'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif`. Each glyph is rasterised once per `emoji\|size\|dpr\|colour\|sprite` and **memoised** |
| What is still an emoji | On the canvas: food (the shelf, the flights, what a Mouse carries, food on the floor), the crack 🕳️, decor, the fridge's fallback. In the DOM: installations, 💵, the 🍞 beside a price. Towers, enemies, crumb piles and the fridge are sprites (D21) |
| `render/sprites.ts` | Finds sprites **by glyph**, so a decor glyph that equals a tower's draws as that tower's sprite |
| `vite.config.ts` | No `base`, so it's `/`. The router uses hash history for a static deploy |
| The build when this was written | About 1.1MB: one 642KB JS chunk, 35KB of CSS, 36 sprite PNGs. None of `drawDebugOverlay`, `NoisePanel`, `EditorView`, `DataPanel`, `createDebugController` or `validateContentInDev` appeared in it |
| `DECISIONS.md` §2 | "Subset Noto Color Emoji to the ~80 glyphs actually used (~200KB)", justified by bugs looking different on each OS |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **The font stays for what's left, and DECISIONS.md §2 changes first.** The bugs are sprites now,
   so §2's reason no longer applies to them. But the food still carries the summary line, and the
   HUD's emoji are DOM text, which a sprite can't reach. Rewrite §2's paragraph to say what the font
   covers and why (about thirty glyphs, not eighty) before touching code. One source of truth.
2. **Lost food is grouped and said like a sentence.** "Lost: three pieces of cheese, a slice of
   pizza and an apple." In first-lost order, counted in words, with articles. The food messages
   become singular and plural forms (vue-i18n's `a piece of cheese | {n} pieces of cheese`), typed
   through `FoodMessages` in `contentKeys.ts`, so a food missing either form fails type-check. The
   grouping is a pure function beside `joinNames`, and every sentence that lists food uses it.
3. **No invented night names.** Nights have no name field. The named nights are the modifier nights
   in CONTENT.md §6, and step 21 named them. Read those names. Don't add eighteen more.
4. **`base: './'`.** Relative asset paths work on a GitHub Pages project site (served from
   `/<repo>/`) and inside an itch.io zip alike, and hash routing needs no server. With `/`, every
   asset 404s on Pages and the page comes up blank.
5. **Prepare the deploy, and don't publish.** A GitHub Actions workflow that builds `game/` and
   deploys `dist/` to Pages, and an `npm run package` that zips `dist/` for itch.io. Publishing is
   outward-facing and hard to take back. Ask the user before the first deploy runs. Pages also has to
   be switched to "GitHub Actions" in the repository's settings, which only the user can do.

## Build

### 1. The font: `DECISIONS.md` §2, a subset script, `src/assets/fonts/`, `ui/App.vue`, `render/glyphCache.ts`

Decision 1. Generate the glyph list from content (the food, the installations, every map's decor
and fridge glyph, the crack) plus the HUD's literal emoji, and subset from that list. A hand-kept
list is the one that misses step 21's new decor. Commit the subset, the script and the font's
licence (OFL), not the 10MB-plus source font.

Gotchas:

- **The glyph cache memoises whatever font was ready.** Canvas `fillText` with a web font that
  hasn't loaded yet silently falls back to the system emoji font, and `getGlyph` caches that bitmap
  for the whole session. Symptom: on a cold cache, the first night draws Segoe glyphs until a
  reload, and only on a first visit. Await `document.fonts.load(…)` for the family before the first
  preload, or make "font ready" part of the cache key, the way sprite-ness already is.
- **Variation selectors.** 🕯️, 🕳️ and 🗄️ are a base codepoint plus U+FE0F. A subset without
  U+FE0F, and without the font's sequences for it, draws those in text style or from the fallback.
  Symptom: the crack is the one emoji that looks different.
- **Colour font formats aren't supported evenly.** Bitmap (CBDT), COLR and SVG colour tables each
  have an engine that ignores them, and a colour table the browser can't read falls back to the
  system font without a word. That's the exact inconsistency this item exists to remove. Check
  Chromium, Firefox and Safari, not only three operating systems. If no single file covers all
  three, `@font-face`'s `src` with `tech()` descriptors can serve two. If that fails too, the
  remaining canvas glyphs can become PNGs through `render/sprites.ts`. Write whichever way it went
  into DECISIONS.md §2.
- **OPEN-QUESTIONS.md §4** carries the ~200KB estimate. Replace it with the measured size.

### 2. The glyph audit

With the font in, at the sizes they're drawn: the food on the shelf (about 24px) and in a Mouse's
arms, and decor at 0.72 of a tile. Two foods that read alike at 24px get a different glyph, changed
in CONTENT.md §7 and `core/content/food.ts` together. No decor glyph may equal a tower's, an enemy's
or a crumb band's, because `sprites.ts` looks up by glyph and would draw it as that sprite. The
editor's palette already avoids them. Check step 21's maps.

### 3. The copy: `en.ts`, `contentKeys.ts`, the grouping beside `ui/joinNames.ts`, the four food sentences

Decision 2 first. Then every line in the catalogue, with DECISIONS.md §1 open: the lines A–G added,
the loss screen, the tutorial, the codex, Settings, the crash card, and step 21's modifiers. The
objects never talk. "You woke someone up." beats any joke you could put there. Delete the `en.ts`
keys nothing reads.

### 4. Ship: `vite.config.ts`, `.github/workflows/`, `package.json`

Decisions 4 and 5. Build, then check the output. No dev-only strings: the list in the table above,
plus step 22's `dev/harness`. No source maps unless you meant to ship them. Measure: under 3MB in
total, the font included. Serve `dist/` from a subdirectory (a static server started one level up)
and play a night from there. That's the Pages case.

## Tests

- `tests/foodLine.spec.ts`: food lost in the order cheese, pizza, cheese, cheese groups as
  `[cheese × 3, pizza × 1]`, in first-lost order. One of each uses the singular form. An empty list
  gives nothing.
- `tests/font.spec.ts`: every glyph in `FOODS`, `INSTALLATIONS`, `MAP_SOURCES`' decor and fridge, and
  the crack is in the subset manifest, with its variation selector. A new decor glyph in step 21's
  maps that's missing from the manifest fails here instead of rendering from the system font.

## Acceptance

- [ ] The night summary's loss line is the emotional payload DECISIONS.md §1 promises. Read five of
      them out loud.
- [ ] Every line in the game sounds as if one person wrote it.
- [ ] The food on the shelf looks the same on Windows, macOS and Linux, in Chromium, Firefox and
      Safari.
- [ ] The production build has no editor, harness, debug-overlay or dev-panel code in it.
- [ ] The build is under 3MB, and a night plays from a subdirectory.
- [ ] All 18 nights are winnable on Normal, and the campaign is worth finishing: step 22's data
      first, then a person.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

Leave every judgement criterion unticked unless you actually sat and looked.

## Stop, and play it

This is the milestone. Play the campaign from night 1, and answer honestly:

1. Did someone who had never seen it get through night 1 on their own? Where did they hesitate?
2. Is the kitchen dark, and are your towers what light it? Or is it a dim grid?
3. With the sound on, do you hear trouble before you see it? Did you ever turn the sound off, and
   why?
4. Is there a night you'd skip if you could? Which one, and what's missing from it?
5. When you lost food, did the summary sting?
6. Is anything shaking, flashing or sounding that you'd stopped noticing by night 5? That's noise,
   not juice. Cut it.
7. Did you open the codex because you needed it, or never?

If most of those are yes, ship it, with the user's go-ahead (decision 5).

## Do not

No new content and no number changes: step 22 owns the numbers. Don't publish without asking. No
analytics and no telemetry. Don't rename message keys for style, because only their English is in
scope, and don't restructure `en.ts`.
