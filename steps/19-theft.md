# Step 19 — Food theft and the Mouse — **MILESTONE: Act II complete**

> This step is four sessions. Paste **one part file** into a fresh session, in order, and `/clear`
> between them. Do not paste this index. It only says what the parts are and how they fit.

**Prereq:** step 18, all three parts. This split was written against `313fe33` (17D) while 18A was
being built in another session: `core/content/behaviours.ts` carried 18A's uncommitted
`PushbackBehaviour` rewrite, and `core/systems/pushback.ts` did not exist yet. So the parts name 18A's
**handoff contract** (`pushEnemy`, `Enemy.pushback`, `enemyPushed`), not code that could be read. They
also name symbols rather than line numbers in every file 18 touches: `combat.ts`, `types.ts`, the
Enemy literals in `tests/`, `nights.ts`, `entities.ts` and `effects.ts`.

## Goal

An enemy with a *goal state*. Everything so far walks one way until it dies or reaches the fridge.
The Mouse reaches the fridge, stands there for a second and a half, takes five named items, turns
round and runs. If it gets out, those items are gone for the night. If it dies on the way, they're
dropped on the floor, and you have to go and get them. It's the most dramatic thing in the game, and
it's the system Act III's Squirrel, Pigeon and Raccoon inherit (`../analytic-docs/ROADMAP-POST-V1.md`
§1, tier 4), so it's built general: a thief is an enemy def with a `thief` field, and nothing in
`core/systems/` names the Mouse.

## Parts

Each part names its own `Read first:` sections, so a session only loads the docs it needs.

| Part | Session | Builds |
| --- | --- | --- |
| [A](19-theft/A-the-thief.md) | The thief, headless | `Enemy.theft` and the state machine in `core/systems/theft.ts`, `core/systems/fridge.ts` as the one writer of food state, the flight in `movement`, boxes in reverse, the escape in `resolve`, the pushback sign, `FIRST` for a runaway, the Tupperware hook, the Mouse |
| [B](19-theft/B-dropped-food.md) | Dropped food, headless | the drop on death, `CollectFood`, towers with `collect` returning it, food left on the floor at night end |
| [C](19-theft/C-theft-on-screen.md) | Theft on screen | the grab, the take, the carry, the flight and its trail, glowing food on the floor and clicking it, the shelf, the summary, the warning and banner, the copy |
| [D](19-theft/D-night-14-and-act-two.md) | Night 14, and closing Act II | authoring night 14 and a second Mouse on night 17, tuning the grab and the flight, the milestone |

Strictly in order. B turns A's interim "death returns the food" into a drop. C draws what A's and B's
state and events say happened. D can't judge a Mouse it can't see.

**A carries most of the step's tests**, **B carries the dropped-food tests**, and both are headless.
**C carries a few `viewModel` tests** and nothing over `render/`. **D carries no behaviour tests.**
It keeps `tests/content.spec.ts` true for night 14, per `../analytic-docs/ARCHITECTURE.md` §7.

**Authored twice on purpose:**

- *Death while carrying.* A returns the food straight to the shelf, which is the simple version in
  `../analytic-docs/DECISIONS.md` §6, so its world is never inconsistent. B replaces that one call
  with the drop.
- *Numbers.* A drafts `grabTicks` (90) and `fleeSpeedMult` (1.3) from the step, and D re-tunes them on
  the board.
- *English.* A drafts the Mouse's name and description because `type-check` demands them. C rewrites
  them, and D re-reads them after the tuning.

All the part files say so.

## The seam that can't be split

**`core/systems/fridge.ts` is the only writer of food state.** It writes `FoodItem.heldBy`,
`droppedAt`, `lostTo` and `Enemy.stolenItems`, always together. The leak and the grab both take food
through the one function that counts it with `stealsFor`. The shelf, the lose check, the summary, the
HUD and the renderer all read an item's state and never re-derive it from events or from the other
list. If a second writer appears (`resolve` marking `lostTo` itself, or a renderer deciding "carried"
from `stolenItems`), then `heldBy` and `stolenItems` disagree. An item gets drawn on the shelf *and*
on the Mouse, or it's counted as neither gone nor present, and the night can't be lost or won
correctly. The Tupperware hook also stops applying to one of the two paths, and nothing fails.

A second, smaller seam: **`Enemy.theft.phase` is the thief's truth, and `flags.fleeing` is the
wake's.** Every system asks about the wake first. Merge them back into one flag and every branch A
wrote needs an `untargetable` tiebreak to tell them apart.

## Contradictions this split resolved

Each one is settled in the part that implements it, with the reason there.

1. **"A `thief` behaviour on the enemy def"**: behaviours are the tower vocabulary. It's an optional
   `thief` **field** on `EnemyDef`, following `burrow` and `tileWriter` ("a field and not a tag"). A
   schema refine ties it to the `thief` tag (A, decision 1).
2. **"`enemy.carrying[]`"**: `Enemy.stolenItems` has been on the type since step 2 with exactly that
   docstring. It keeps its name (A).
3. **Sharing the wake's `fleeing` flag.** `noise.ts` and `EnemyFlag`'s docs expected step 19 to reuse
   it. The thief gets its own phase instead, because the two flights differ in speed, statuses,
   boxes, targetability and pushback sign. The comments that expected otherwise are rewritten (A,
   decision 2).
4. **The system slot**: `../analytic-docs/ARCHITECTURE.md` §1 already lists `economy, theft,
   resolve`, and A keeps that order (A, decision 4).
5. **Better Tupperware** is step 20's installation, and step 20's own test asserts it. What 19 owes is
   the hook step 20 item 4 says it built: `stealsReduction`, through `CreateWorldOptions` the way 13A
   passes noise. A asserts the hook, not the installation (A, decision 7).
6. **"A distinct sound"**: there is no audio anywhere in the codebase, and step 23 owns it. That
   request was added to step 23's audio bullet in this split's commit (C).
7. **"Night 17 or 18"**: 17. Night 18 is 18C's finale, tuned against the Fan. Night 17 teaches chemical
   against armor, and `mammal` takes chemical at 0.6 (D, decision 3).
8. **`FoodItem.lost: boolean`** can't say *how* an item was lost, and "the summary lists what escaped,
   by name" needs that. It becomes `lostTo: 'eaten' | 'escaped' | 'floor' | null` (A, decision 5).
9. **`resolve` removes a fled enemy at 0 *before* the death check** (13A). That order is right for the
   wake and wrong for a thief: killing the Mouse on the tick it reaches the crack has to be a kill
   (A, decision 10).
10. **"A tower with `collectRadius` retrieves it"**: that's the `collect` behaviour, and it returns food
    on the tick the food is in reach, with no flight state (B, decision 4).
11. **"Pushback now helps you"**: 18A left the sign to this step, and in v1 only Mint Pot, which isn't
    shipped, could push a Mouse. A decides the sign and asserts it through Mint Pot (A, decision 12).

## Step acceptance

- [ ] Killing the Mouse on its way out, at the last moment, is the best feeling in the game.
- [ ] Letting it escape with five items on night 14 is survivable but clearly costly.
- [ ] Dropped food is impossible to miss.
- [ ] Adding the Squirrel later would be one `EnemyDef` with a `thief` field. `grep -rn "'mouse'"
      src/core/systems` finds nothing (`../CLAUDE.md`, *Content is data, not classes*).
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## **MILESTONE: Act II — the game is content-complete for v1**

19 towers, 11 enemies, nights 1–18. Status effects, cones, auras, tile state, barricades, charges,
flyers, light, burrowing, armor, bait, pushback, noise, theft.

Play the campaign end to end at least twice before starting Phase 4. What's left is the frame around
the game (metagame, maps, modes, balance, polish), not the game itself. Anything that isn't fun *now*
won't be fixed by any of that. D's acceptance lists the questions to ask.

## Do not

Author Better Tupperware, Bigger Fridge or any installation, or add unlocks (step 20). Don't build
audio (step 23), the general wave-start banner (step 23; C builds the Mouse's announcement only), the
Squirrel, the Pigeon or any second thief (post-v1), or night modifiers and the Table map (step 21).
