# Step 16C — Burrow and armor on screen, and nights 13, 16 and 17

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/DECISIONS.md` §2 (*Art: emoji sprites*),
`../../analytic-docs/CONTENT.md` §6 (the night table, rows 13 to 17) and the Silverfish line of
`../../analytic-docs/OPEN-QUESTIONS.md`.
**Prereq:** steps 16A and 16B.

## Goal

This session closes step 16. A Weevil going under reads as a mound with a dust trail: present,
plainly untouchable, plainly *coming*. Its surfacing is a moment you catch from across the room.
Armor looks like armor, and a Lemon visibly cracks it. Then come the three nights that make both a
decision, and the pass that re-tunes the numbers 16A authored blind.

## Already in the repo

| File | What's there now |
| --- | --- |
| `render/layers/entities.ts:129` | `EnemyFrame`, a pooled entry **every field of which is written every frame**. An unwritten field on a reused entry is stale, and the header says so. `readStatuses` (`:216`) is where a status becomes a frame field. Treatments are **batched passes** (one `beginPath`, many arcs, one `fill`), aged in frames and never in ticks |
| `render/layers/effects.ts:245` | `pushEvents`, the seam for one-shot visuals, with capped arrays aged in frames. The tower-destroyed puff (`drawPuffs`) is the nearest precedent for a dirt puff. `render/` has no rng, so "scattered" is fixed angles offset by position |
| `render/palette.ts` | colours named by **role**, never by hue. Step 23 retunes all of them |
| `core/types.ts` | 16A's `flags.burrowed`, `burrowWindow`, and the `enemyBurrowed` / `enemySurfaced` events. 16B's `enemyDamaged.multiplier` |
| `core/content/nights.ts` | after 15C: nights 1 to 12 and 15, all on the Counter's single `crack` lane (31.1 tiles), with a header sentence explaining the gap at 13 and 14. **The pacing rule at the top of the file**: a wave spawns over roughly as long as the gap after it |
| `ui/views/GameView.vue:98,107` | `SEED = 1234`, fixed so a retry replays the same night, and `nightIndex`, which walks `NIGHTS` **by array position** |
| `tests/content.spec.ts:379` | two literal lists pinning `NIGHTS`' wave counts and indices. 15C extended them; you extend them again. `:390` requires every entry to name `pathId: 'crack'` |
| `core/systems/spawn.ts:226` | the Cookie Jar's destroy penalty **buys from the running wave's own composition** at each enemy's `reward` |

If 15C is not in `nights.ts`, stop: this part's prereq isn't met.

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **The mound reads `enemy.flags.burrowed` and nothing else.** Never "is `distance` inside
   `burrowWindow`". That ignores the Bay Leaf, and it would draw a mound under a Weevil the towers
   are shooting (the index's unsplittable seam).
2. **The dust trail is derived, not remembered.** Sample the path at a few distances *behind* the
   Weevil, clamped at `burrowWindow.fromTiles` so the trail starts where it went under, with falling
   alpha. No position history in module state: that would need an id-keyed store, cleanup on death,
   and a reset on retry, and a pure function of `distance` needs none of it.
3. **The two puffs come from 16A's events, through `pushEvents`.** Dirt goes up on a dive. On a
   surface it's dirt plus a brief bright ring: the step's "moment of vulnerability" is **visual
   only**, with no stun and no status. A mechanical pause would turn the Bay Leaf into crowd
   control, since a Weevil re-diving and re-surfacing at a radius edge would stall every time.
4. **Plating is read off `enemy.tags`, the crack off `armorStrip` in `readStatuses`.** Tags are
   copied onto the enemy at spawn, so no def lookup per frame.
5. **Nights 13, 16 and 17 are on the Counter, single-lane**, exactly like the note above `night04`
   and `night08` explains. No map in §6's column exists, and `createWorld` throws on a mismatch.
   Extend that note; don't write a new one.
6. **`NIGHTS` becomes 1–13, 15, 16, 17.** 14 is the Mouse's (step 19) and 18 is the Fan's
   (step 18). Put 13 **between 12 and 15**: Continue walks array positions, and an appended 13
   plays after 15. Rewrite the header's gap sentence to say both gaps.
7. **Night 17's two routes are "non-physical" and "Lemon plus physical", not "cold" and "Lemon".**
   The step file says "stack cold damage", but the only cold tower lands 2 × 1.2 = 2.4 a hit at
   0.8/sec. Even with its own slow keeping a Silverfish in range ~17 s, that's about 33 damage per
   tray: three or four 110-crumb trays per Silverfish. What `armored` actually rewards is
   anything that isn't physical: chemical at 1.0× (Spray Bottle, Vinegar Spray, Baking Soda) plus
   cold's 1.2× for the slow. That's also the reading `OPEN-QUESTIONS.md` asks you to verify ("cold
   or chemical").
8. **Re-tune 16A's blind numbers here**: the burrow fractions in `core/content/enemies.ts`, and the
   Bay Leaf and Lemon numbers in `core/content/towers.ts`. 16A's window spec asserts against the
   def's own fields, so moving them moves no assertion. Say in the commit which way each went and
   why.

## Build

### 1. The mound and its trail — `render/layers/entities.ts`

A `burrowed` frame field, written every frame. A burrowed entry skips the glyph blit and draws a
low dirt mound with a slow wobble instead, plus decision 2's trail in the same batched pass. Decide
by looking whether the HP bar stays. It says "this is an enemy with health"; the mound says "you
can't touch it". Pick whichever reads better at 3×.

Everything that isn't the glyph still applies: a poisoned Weevil keeps bubbling underground,
because the DoT is still ticking, and that's true information.

### 2. The dive and the surfacing — `render/layers/effects.ts`

Decision 3. Cap the arrays like every other one there, and clear them in `resetEffects`.
Otherwise a retry opens with last night's dirt still settling.

### 3. Plating and its crack — `render/layers/entities.ts`

A segmented rim or shell for `armored`, drawn so the glyph still reads as a Silverfish. When
stripped, the same rim broken, with a gap or crack lines, not a colour change. That way it survives
a colour-blind read and matches the Lemon's "halfway" rather than "gone". One batched pass each,
like `drawRooted`.

### 4. Nights 13, 16 and 17 — `core/content/nights.ts`

Draft from arithmetic against the 31.1-tile lane, then play:

- **Night 13, 12 waves: the Weevil arrives.** Introduce it the roster's way: two of them in wave 3,
  well behind the wave's opening column and spaced to be watched one at a time. Then fold Weevils
  into Ant and Roach streams in growing numbers. The acceptance to hit: a defence built entirely
  in the first third loses to it. With 16A's fractions, the average window runs from about tile 5
  to tile 16, so a front-loaded line gets roughly five seconds of a Weevil before it's gone.
- **Night 16, 13 waves: no new enemy.** It's the night that makes the player use everything from
  11 to 15 at once: Weevils diving under Slug roads, and Mold sitting where a Bay Leaf wants to
  stand. §6's Honey Pot unlock (step 17) and "moving day" (step 21) are not this night's concern.
  Leave a one-line note that step 17 may re-tune it once the Honey Pot exists, as 15C did for
  night 12 and the Burner.
- **Night 17, 14 waves: the Silverfish.** Two in wave 3 on the usual pattern, then in numbers a
  physical-only line can't hold. For scale: a T0 Salt Shaker lands 5 × 0.4 = 2 a second, and a
  Silverfish at 0.6 tiles/sec spends ~10 s inside one range-3 circle. That's ~20 damage per shaker
  against 110 HP, so five or six shakers per Silverfish. Stripped, a shaker lands ~35 a pass, and
  the Lemon's own 8 a hit adds ~70, so one Lemon and a couple of shakers do the same job.
  At ~52 s to cross the lane it overlaps the next wave by design, as the Beetle does.

Gotchas that will bite the authoring:

- **`SEED` is fixed, so every retry rolls the same burrow windows.** Tuning night 13 on one seed
  tunes it to one roll. Play it on at least two (change the constant locally and **don't commit
  it**) before calling it punishing.
- **The Cookie Jar penalty buys Weevils at 9 crumbs and Silverfish at 18.** A jar lost in a
  Weevil-only wave is up to 22 more of them, each with its own window. One lost in a Silverfish-only
  wave is eleven 110-HP walls. A mixed wave buys round-robin, so fewer. Look at both on purpose rather than finding them later.
- **Nightmare's 1.25 count rounds up**, so two Silverfish become three. Sanity-check night 17 on
  nightmare.
- **A Mold left alive holds its wave open** (15C's gotcha). If night 16 uses one, it has to sit
  where some buildable pocket can reach it.

### 5. Play it, then tune

`npm run dev`, nights 13, 16 and 17, at 1× and 3×. Then decision 8, and re-read 16B's copy for the
four defs against the board.

## Tests

**No behaviour tests.** `../../analytic-docs/ARCHITECTURE.md` §7 excludes `render/`, and a mound
that reads as a pebble is not something a spec can catch. Keep `tests/content.spec.ts` true: extend
the two lists at `:379`, and add one "introduces X in wave 3" assertion each for the Weevil (night
13) and the Silverfish (night 17), following the Beetle, Fly and Moth precedents in the same file.
16A's and 16B's suites are the regression net for everything you re-tune.

## Acceptance

- [ ] A burrowed Weevil reads as present, untargetable and coming, at 3× from across the room.
- [ ] Every surfacing is caught without looking for it. That includes a Weevil forced up at a Bay
      Leaf's edge.
- [ ] A Silverfish reads as armored before you hover it, and a stripped one as cracked.
- [ ] Night 13 punishes a defence concentrated at the start of the track, on two seeds.
- [ ] Night 17 is lost with physical damage alone and won both ways from decision 7. Leave this
      unticked unless you played all three.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

Leave every judgement criterion unticked unless you actually sat and looked. The checkboxes are the
ledger of what has been confirmed.

## Do not

Change anything in `core/systems/`. If a treatment needs data the enemy doesn't carry, that's 16A's
file and a note in the commit. Don't author night 14 or 18, don't build night modifiers (step 21),
and don't start the Honey Pot (step 17). Don't add a codex or a matrix screen (step 23).
