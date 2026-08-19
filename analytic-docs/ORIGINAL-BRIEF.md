# Original Brief — source material

This is the design brief the project started from, preserved as written. **Do not edit it.** It is the creative source; when a later decision contradicts it, the contradiction and its reasoning are recorded in [DECISIONS.md](DECISIONS.md) §9 and [DECISION-LOG.md](DECISION-LOG.md), and this file stays as it was.

Read it when you need to know *why* something exists, or what a mechanic was originally meant to feel like. The tone section in particular is the reference for all game copy.

---

## The core fiction

The strongest version isn't "kill bugs in a kitchen" — it's the kitchen at 2am, when the appliances are on their own. The humans are asleep. Your towers are the objects on the counter, defending the fridge until sunrise. That gives you: a fixed time limit per level (a night), a reason objects can act, a reason nobody just calls an exterminator, and a naturally cozy-but-tense mood.

The fridge is your health pool. Enemies aren't trying to kill you — they're trying to steal food. Every leak takes an item off the shelves. Lose all the food and you lose the night. This is a better fail state than an HP bar because it's visible and specific: watching a roach walk off with your last slice of pizza stings in a way that "-1 life" doesn't.

## Enemies — the pantry roster

Natural tiers, each family with its own silhouette language:

- **Ants** — weak, arrive in huge lines, follow a pheromone trail (they literally repath along the last successful route, which is a nice mechanic)
- **Roaches** — fast, scatter when hit, hide under things when a light-based tower fires
- **Flies** — flying, ignore ground obstacles entirely
- **Moths** — flying, drawn to any light source, which you can weaponize
- **Weevils / pantry beetles** — burrow, emerge past your first defensive line
- **Mold** — doesn't walk. Spreads across tiles slowly and permanently corrupts them unless cleaned
- **Silverfish** — armored, slow, high HP, the "ceramic bloon" equivalent
- **Mouse** — mini-boss, carries food away and must be killed before it escapes or the food is gone permanently
- **Slug** — leaves a slime trail that speeds up everything behind it
- **Fruit flies** — spawn from any uncleared food/corpse; a swarm that grows if you ignore it

Bosses: the Raccoon (opens things), the Rat King, the Neighbour's Cat (only if you go absurd).

## Towers — kitchen objects

Ship-first tier is deliberately mundane and readable:

- **Salt shaker** — cheap, fast, weak; strong vs slugs
- **Mousetrap** — one-shot high damage, needs re-arming (a resource-timing tower, not a turret)
- **Sticky tape** — no damage, holds enemies in place
- **Spray bottle** — cone AoE, damage over time
- **Cat** — expensive, roams instead of holding a position, kills anything it catches, occasionally naps
- **Toaster** — burst damage on a long cooldown, launches projectiles upward (hits flyers)
- **Nightlight** — attracts moths and flies into its radius, damages nothing itself

Later additions lean support and conditional: Roomba (patrols a path, clears mold and crumbs), Blender (huge damage, tiny range, loud — wakes the humans), Herb pot (basil/mint aura repels insects), Vinegar trap, Bug zapper, Fan (pushes flyers back), Fridge magnet (buffs adjacent towers — the letter tiles are a great visual), Microwave, Bleach (clears mold permanently, damages your own tiles).

## The two mechanics that make it yours

Any TD can have towers and paths. These are the hooks worth prototyping:

**1. Crumbs as currency and as bait.** Killing enemies leaves mess. Mess attracts more enemies but also is your income — you collect it to build. So a dirty kitchen is a rich kitchen and a dangerous one. That's a real tension knob, and it's thematically perfect.

**2. The noise meter.** Powerful towers are loud. Blender, bug zapper, smashing things — each adds noise. Fill the meter and a human wakes up, walks in, turns on the light. That's a hard reset of the board: all enemies flee, but you lose your placements or your income for the night. It makes power a cost rather than just an unlock, and it's a mechanic people will describe to each other.

## Structure

Levels as nights, each one a different room or a different mess — the counter, the pantry, the sink, after a dinner party, moving day with boxes everywhere. Between nights you're not upgrading abstract stats but cleaning and fortifying: seal a crack, fix the window screen, buy better tupperware. Progression as home improvement gives you a metagame that fits the fiction and is easy to expand indefinitely.

## Tone

Sincere-cozy with dry humor rather than jokey. The objects don't have googly eyes and don't talk. They just quietly do their jobs, and the comedy comes from the situation — a mousetrap and a lit scented candle holding the line against forty ants.

## The first thing I'd actually build

One counter, ant lane, three towers (salt, tape, mousetrap), crumb economy. If that's fun with rectangles for sprites, everything above is worth doing.

---

## Recommended build order (from the brief)

1. **Prototype:** Tier 0 towers + Tier 0 enemies + crumb economy. Rectangles for sprites. If this isn't fun, nothing above saves it.
2. **Vertical slice:** Add Tier 1 both sides. You now have elements, counters, and flyers — a complete-feeling TD.
3. **Ship v1:** Tier 2 both sides, plus the noise meter and the food-theft system. That's roughly 8–10 towers and 10–12 enemies, which is a full game.
4. **Post-launch:** Tiers 3–5 as free content drops. Each one is a self-contained system, so they ship independently without destabilizing what's already working.

> **The dependency worth flagging:** build the noise meter and tile-state systems early even if you don't use them yet. Tier 2 enemies and Tier 5 towers both assume tiles can hold state, and retrofitting that into a finished game is genuinely painful.

*(This warning was heeded — tile state is step 14 and the noise meter is step 13, both inside v1.)*

## The balance instruction

> The one number to tune first is crumbs per wave versus tower cost. Aim for the player affording roughly 1.5 new towers per night early on, dropping to 0.5 by Act III. Everything else in this spec can be adjusted later without breaking anything; the income curve can't.

*(This is the stated goal of step 22, the headless balance harness.)*
