# Design Decisions

Canonical. Every step prompt refers back to this file. If you change your mind mid-build, change it **here** first.

---

## 1. Fiction and tone

The kitchen at 2am. Humans asleep, appliances on their own. Your towers are the objects on the counter; they defend the fridge until sunrise.

Tone is **sincere-cozy with dry humour**, not jokey. Objects have no faces, no googly eyes, and never talk. The comedy is situational — a mousetrap and a scented candle holding a line against forty ants. Copy should be understated. The night-end summary saying "Lost: one slice of pizza, half a lemon" is funnier than any joke you could write.

---

## 2. Technology

| Concern | Decision |
|---|---|
| Language | TypeScript, `strict: true` |
| Build | Vite |
| Board rendering | **Canvas 2D**, hand-rolled |
| HUD / menus | **Vue 3**, DOM/CSS, overlaid on the canvas |
| Simulation | Pure TypeScript, zero DOM dependencies |
| Tests | Vitest |
| Validation | Zod, on all content and save data |
| Platform | Desktop web, mouse + keyboard. No touch support in v1. |
| Distribution | Static build → itch.io / GitHub Pages |

**No game engine.** Phaser and friends would supply physics (a TD needs none) at the cost of coupling game logic to the engine, which would kill the headless balance harness. Pixi was considered and rejected as unnecessary given the emoji-sprite decision below; the sim/render split keeps it a one-file swap if the entity count ever demands it.

### Art: emoji sprites

All entities are emoji. Towers 🧂🕯️🍯🧻, enemies 🐜🪳🪰🦟🐌, food 🍕🧀🍎, crumbs 🍞.

Two non-obvious requirements:

- **Pre-render every glyph.** Never call `ctx.fillText` per entity per frame. Rasterise each glyph once into a small offscreen canvas keyed by `emoji + size + dpr`, then `drawImage` from that cache. You end up blitting cached bitmaps exactly like a sprite atlas.
- **Bundle the font.** Segoe UI Emoji (Windows) and Apple Color Emoji render the same codepoint differently enough to change which bug the player thinks they're looking at. Subset Noto Color Emoji to the ~80 glyphs actually used (~200KB) and ship it, so you can choose glyphs by how they look in exactly one font.

Board terrain is **flat illustrated tiles** in a warm 2am palette — deep blues with warm pools of lamp light. A dedicated art pass is scheduled at step 23; everything before that is functional colour.

---

## 3. Path model — fixed track (BTD-style)

The map is authored. The track is a **polyline of waypoints**, and enemies walk it from start to finish without ever making a decision. An enemy stores `{ pathId, distance }`; its world position is `samplePath(pathId, distance)`.

**Consequence: there is no pathfinding in this game.** No A*, no flow fields, no repath-on-place, no "is the maze fully blocked" validation. `FIRST` / `LAST` targeting is a max/min over a single float.

Later maps (Act II onward) may have **2–3 spawn points**, modelled as `Path[]`. Author those tracks so they **merge into a shared final stretch** before the fridge, so one well-placed late tower still covers everything and the difficulty stays legible.

### Towers redesigned because the path is fixed

The original spec contained mazing towers that are meaningless without player-authored routes.

| Tower | Original | Redesigned |
|---|---|---|
| **Cardboard Box** | Wall for mazing | **Barricade placed *on* the track.** Blocks it outright; enemies stop and chew through it. 200 HP, 25 crumbs. Buys time, not geometry. Termites (Act III) still eat it instantly. |
| **Mint Pot** | "Repel, reshapes paths — dynamic repathing" | **Pushback.** In a 1D track world, repelling means shoving enemies *backwards* along the track. Moves from a Tier-3 system to a Tier-1 one. T3 upgrade "repelled enemies take damage" is unchanged. |
| **Fan** | Knockback on flyers | Same pushback system, air-filtered. One system, two towers. |
| **Ant pheromone memory** | "Repaths along the last successful route" | **Lane memory.** On multi-spawn maps, if a lane leaks, later ant waves favour that lane. Only meaningful on maps with lanes. |

`path_only` / `off_path_only` placement flags from the original spec are unchanged and now make sense.

---

## 4. Economy — crumbs

Crumbs are the in-night currency and they are **physical objects on the board**. This is the signature mechanic; if it ever collapses into "gold on kill", the game has lost its hook.

- Every kill drops a **crumb entity** at the death position.
- Crumbs within ~0.7 tiles of each other **merge into one larger pile** with summed value and a bigger glyph. A good kill zone therefore produces one fat 🍞 worth clicking, not forty specks. This keeps the board readable and caps entity count for free.
- **Click to collect**: instant, full value. A tempo reward for active play — never mandatory.
- **Tower collection**: towers have a `collectRadius` (`0` for most). Crumb Tray, Cookie Jar, Compost Bin and later the Roomba have one. Auto-collected crumbs pay full value but take ~1.5s to travel in. Economy towers buy you *attention*, not just money.
- **Rot**: a crumb older than **20s** starts raising local spawn pressure. At **35s** it hatches a Fruit Fly and is consumed.

A dirty kitchen is a rich kitchen and a dangerous one.

Crumbs are **in-night only**. Whatever you haven't spent evaporates at sunrise. See §7 for the metagame currency.

---

## 5. Night structure

A night runs **2:00am → 6:00am**, shown as a clock. Each wave advances the clock one tick; the clock is a display mapping over `waveIndex / waveCount`, not an independent timer.

- Waves are **player-triggered**. After a wave's last enemy spawns, a "next wave in Xs" countdown starts. Calling the wave early grants **bonus crumbs proportional to the seconds you skipped**. This is BTD's fast-forward incentive and it's the main tempo decision in the game.
- Speed controls: pause, 1×, 2×, 3×. Implemented as **running more simulation ticks per frame**, never as a larger `dt` — see ARCHITECTURE.md, this is a determinism requirement.
- Build and sell freely at any time. Sell returns **70%** of total invested, dropping to **50%** once a wave is in progress.

**Win** a night by surviving all its waves. **Lose** when the fridge is empty.

---

## 6. Food — the fridge is your health bar

The fridge holds a set of **named food items** (🍕 pizza slice, 🧀 cheese, 🍎 apple, 🥛 milk…). Each enemy has a `steals` value; reaching the fridge takes that many items and removes the enemy.

- Food **resets at the start of every night**. It is your lives, not a persistent resource — no death spirals.
- The sting comes from **specificity, not attrition**: you see the item leave, and the night-end summary lists exactly what you lost by name.
- **Thieves** (Mouse, and Act III+ Squirrel/Pigeon) are different: they grab an item, then turn around and flee back down the track. Kill them before they escape and the item is dropped and returns to the fridge. Let them off the map and it's gone for the night.

Losing a night means retrying it. Installations (§7) are kept.

---

## 7. Metagame — what persists

**Towers do not persist.** Every night starts with an empty board and you rebuild with that night's crumbs.

**Installations do persist.** These are the home improvements: seal the baseboard crack, fix the window screen, better tupperware, close the kitchen door, oil the hinges, buy a broom. They're bought between nights and never lost.

Installations are paid for with **Grocery Money** 💵 — a second currency, earned **from performance**, never carried over from crumbs:

```
Grocery Money = food saved + enemies killed + cleanliness bonus + no-wake bonus + early-call bonus
```

Crumbs deliberately do **not** convert. If leftover crumbs banked, under-building would be the optimal strategy, which fights everything else in the design. Making cleanliness a scored stat also reinforces the crumb hook at the metagame layer.

Full installation list in [CONTENT.md](CONTENT.md).

---

## 8. Noise meter

Live from **night 1** with a generous cap, so that Mousetrap (noise 2, night 3) and Toaster (noise 3, night 8) teach the mechanic harmlessly long before anything dangerous is unlocked.

- Cap **100** by default. Decays at **1.5/sec**. Loud towers add noise per shot; some enemies (Cricket, Act III) add it passively.
- **When it fills, a human walks in and turns on the light.** All enemies flee — you keep the night — but:
  - you forfeit every uncollected crumb on the board,
  - you forfeit the current wave's unbanked income,
  - every tower takes 20% of max HP in damage.
- **Counterplay exists**, which is what makes loud towers a real choice rather than a trap: installations raise the cap (Close the Door +25, White-noise Machine +30) or the decay rate (Oil the Hinges +0.5/s).

---

## 9. Scope of v1

**Acts I and II — nights 1–18.** 19 towers, 11 enemies, plus the noise meter, tile state, and the food-theft system.

**v1 enemy roster:** Ant, Roach, Beetle, Fly, Moth, Mold, Weevil, Slug, Silverfish, Fruit Fly, Mouse.

**Modes:** linear 18-night campaign + three difficulty tiers (Cozy / Normal / Nightmare, implemented as global scalars) + an unlockable Endless night.

**Maps:** 6 hand-authored kitchens — Counter, Sink, Pantry, Stove, Table, Floor — each replayed ~3 times across the campaign with different wave compositions and a **night modifier** (after a dinner party: crumbs pre-scattered; moving day: boxes consume build tiles; heatwave: fire towers boosted). Modifiers are a reusable content lever forever after.

### Changes made to the original spec for v1

1. **Fruit flies exist from night 1**, as a *consequence* enemy only — they hatch from rotting crumbs. They become a scheduled wave enemy at night 20 as originally specced. This teaches the crumb hook by punishing it immediately.
2. **The Mouse moves to night 14** as the Act II mini-boss. The original roadmap ships the food-theft system in v1 but the earliest thief was night 42; the theft system needs something to demonstrate it.
3. **Towers carry `maxHp` from day 1**, even though only the Cardboard Box and the noise penalty consume it in v1. Wasps, termites and carpet beetles arrive in Act III and retrofitting tower HP then is the same class of pain as retrofitting tile state.
4. **Tile state ships in v1** (step 14) even though its heaviest consumers are Act III+ towers. Same reasoning — the original roadmap flagged this and it's correct.
5. **Mint Pot's pushback system is built in v1** (step 18, for the Fan). Mint Pot itself still unlocks at night 21, post-v1, but arrives as pure config.

### Explicitly deferred past v1

Acts III and IV in full: adjacency buffs, autonomous units (Roomba, Cat, Dog Bowl), chain lightning, the ultimates, all bosses, multi-night persistence (Sourdough Starter), and reactive enemy AI (wasps attacking towers, roaches hiding from light, mealworm splitting). Each is a self-contained system that ships independently; the architecture must not *prevent* them, but no v1 step implements them.

---

## 10. Loadouts — you can't bring everything

**The player selects a fixed number of towers before each night. Only those are available in the shop.**

The fiction: it's what you **set out on the counter before you go to bed**. It's the last thing you do before the night starts, it happens on the Kitchen screen alongside the installations, and it's the same home-improvement idiom as everything else in the metagame.

### Slots

| Source | Slots |
|---|---|
| Base | 5 |
| Clear the Drying Rack (installation) | +1 |
| Take the Toaster Off the Counter (installation) | +1 |
| Second Shelf (installation) | +1 |
| **Maximum** | **8** |

By night 18 the player has 19 towers and at most 8 slots. That's a real choice without being brutal.

**The mechanic is invisible until roughly night 8**, because fewer towers are unlocked than there are slots. It turns on by itself exactly when choice becomes meaningful — no tutorial required.

### What this changes

- **The next-night preview becomes load-bearing.** The Kitchen screen already shows the upcoming map, new tower and new enemy; with loadouts that's no longer flavour, it's the information the player builds their loadout from. Show the full enemy composition of the coming night, not just what's new.
- **The Codex stops being optional.** A player choosing between Lemon and Ice Cube Tray for a Silverfish night needs the damage matrix in front of them. Step 23's codex should be reachable *from the loadout screen*.
- **Every night must be winnable by more than one loadout.** This is the balance constraint loadouts impose, and step 22's harness must verify it. A night with exactly one valid answer is a lockout, not a puzzle.
- **Retry keeps the loadout screen open.** Losing a night and rebuilding the loadout is a legitimate and intended second attempt — it's how the player learns the matrix.
- **Sell-and-rebuy stays unrestricted** within the loadout. Loadouts constrain what you *bring*, never what you do with it once the night starts.

### Why in v1 rather than later

Cheap as a system, expensive as a retrofit. Authoring and balancing 18 nights assuming full tower access and *then* adding loadouts invalidates all of step 22's tuning — night difficulty depends entirely on whether the counter to that night's enemy is guaranteed available or has to be anticipated. Same class of dependency as tile state and tower HP.

---

## 11. Standing rules for later content

Two rules that keep Acts III–IV cheap when you get there:

- **Adding a tower or enemy should be adding a config object.** If a new Tier 0–2 entry needs a new class, the behaviour composition in `core/content/` is wrong. Fix the composition, not the entry.
- **Anything that touches a tile writes to tile state**, never to a bespoke per-tower structure. Heat, slime, mold, chemical residue and scorch all live in one place.
