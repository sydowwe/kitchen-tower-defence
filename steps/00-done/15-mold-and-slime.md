# Step 15 — Mold and slime — enemies that rewrite the board

> This step is three sessions. Paste **one part file** into a fresh session, in order, and `/clear`
> between them. Do not paste this index — it exists to say what the parts are and how they fit.

**Prereq:** step 14.

## Goal

The first two enemies that don't play by the "walk to the fridge" rule, and the two towers that
answer them. Mold doesn't walk at all and wins by eating your build space; the Slug is harmless and
paves a 1.6× road for the wave behind it. Both are pure consumers of step 14's tile system — if
either needs new grid code, step 14 was under-built and that is where the fix goes.

## Parts

Each part names its own `Read first:` sections, so a session only loads the docs it needs.

| Part | Session | Builds |
| --- | --- | --- |
| [A](15-mold-and-slime/A-the-two-enemies.md) | The two enemies, and what they write on the board | `EnemyDef.tileWriter`, `core/systems/spread.ts`, the Mold and Slug defs, `WaveEntry.startDistanceTiles`, the `molded` placement rejection |
| [B](15-mold-and-slime/B-the-two-answers.md) | The two towers that scrub it off | the `cleanse` behaviour, `core/systems/cleanse.ts`, Vinegar Spray and Baking Soda with their tiers, the card rows |
| [C](15-mold-and-slime/C-on-screen-and-the-nights.md) | Mold and slime on screen, and nights 11, 12, 15 | the mold and slime treatments in `render/layers/tileEffects.ts`, the two glyphs, `core/content/nights.ts` |

Strictly in order. B's end-to-end assertions need A's enemies to shoot at and A's tiles to scrub;
C can't judge a spread interval or a trail fade until both exist.

**A and B both carry tests, and C carries none.** A asserts everything about writing a tile —
the spread, its determinism, the trail, the expiry, the placement refusal. B asserts everything about
taking one off again, plus the damage-matrix pair: `fungal` at 0.2× physical and 2.5× chemical is one
assertion about a *product*, and it needs a real chemical tower to be end-to-end at all, so both
halves stay in the session where both towers exist. C has no `Tests` section beyond the word
**None**, by `../../analytic-docs/ARCHITECTURE.md` §7 — say it out loud there so it doesn't invent
coverage to look thorough.

**Two numbers are authored blind in A and re-tuned in C**, the way 6B's `projectileSpeed` and 7A's
`travelTicks` were: the mold's 6-second spread interval and the slug's 8-second slime. Neither can be
judged before there is a board to watch them on. Both part files say so, so C isn't reluctant to
overwrite them and A doesn't polish them blind.

## The seam that can't be split

**Step 14's tile API.** All three parts read it and none of them may change it: A writes `mold` and
`slime` cells, B clears them, C draws them. Putting the enemy's writes and the tower's clears in
different sessions from the API they share is already the risk this split takes; putting a second
grid anywhere is what would make it fatal. If a part finds the API can't express what it needs —
"write `mold` to one neighbour of a cell that already has it", "clear every `slime` cell in a
radius" — the fix goes into step 14's files and is recorded as step 14 having been under-built.
That is exactly what step 14's own third acceptance criterion is for.

## What step 14 owes this step, and what to do if it doesn't

Step 14 had not been built when this split was written, so the tile-API lines in the three parts are
written against **step 14's step file**, not against code anyone has read. Each part opens by
checking the four things it actually depends on:

1. the shape of a cell's state and the read/write calls (`getTile` / `setState` / `clearState` /
   `hasState` / `forEachTileWithState` / `neighbours`);
2. `worldToTile`, and where it lives;
3. whether `movementSystem` already reads `slime` and multiplies speed (step 14, build item 4);
4. whether `tilesSystem` advances a **staged** effect, and in which field (step 14, build item 3) —
   C's "mold advancing in three visible steps" is drawn from it.

Where the real names differ, use the real ones and correct the part file in the same commit. Where
the capability is genuinely missing, add it to step 14's file rather than working around it here.

Two committed contradictions this step resolves, both settled in **A**:

- `core/map.ts:26` and `core/world.ts:58` say mold sets a bit in `MapDef.flags`. It does not:
  `TileEffectKind` in `core/types.ts` has carried `'mold'` since step 2A and
  `../../analytic-docs/DECISIONS.md` §11 says anything touching a tile writes tile state. Those two
  comments are wrong and A corrects them.
- `render/renderer.ts:168` says `// tile effects: step 15`. The layer is step 14's; only the mold and
  slime *treatments* are this step's.

## Step acceptance

- [ ] Ignoring mold on night 11 costs you a visible chunk of the board by the final wave.
- [ ] A slug leading a roach wave is dramatically more dangerous than the same roaches alone.
- [ ] Neither enemy nor either tower required a change to `core/systems/tiles.ts`.
- [ ] Adding both towers required no change to any file in `core/systems/` except the one new
      interpreter — if a system file grew a branch on a tower id, the composition is wrong
      (`../../CLAUDE.md`, *Content is data, not classes*).
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Add Bleach, the Gas Stove Burner, or any other tile-writing tower — the Burner is step 17's and
Bleach is Act III's. Two enemies, two answers. Do not build the night-modifier system: "damp night"
and "after a dinner party" are named in `../../analytic-docs/CONTENT.md` §6 and owned by **step 21**,
which authors `core/content/modifiers.ts`; this step authors the numbers those modifiers will later
patch and nothing else. Do not implement the Pantry Shelf Liner installation — installation effects
are step 20's.
