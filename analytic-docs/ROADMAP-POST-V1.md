# Post-v1 Roadmap — Acts III & IV

Everything deliberately excluded from v1, preserved in full with its original stats and unlock schedule. Nothing here is implemented by steps 1–23; the architecture is built so that none of it requires a refactor.

**How to use this:** each entry names the v1 system it builds on. If an entry's dependency exists, that entry is mostly a config change plus one small system. Ship them as independent content drops in roughly the order below.

---

## 1. Engineering-cost tiers

The organising insight from the original brief: group by **engineering cost, not power**. Each tier is buildable using only systems from tiers at or below it, so building in this order never forces a refactor.

### Towers

| Tier | What it needs | Members |
|---|---|---|
| **0** | Range check, targeting, fire rate, projectile, damage | Salt Shaker, Toaster Crumb Tray, Cookie Jar, Cardboard Box |
| **1** | Status effects, radius damage | Spray Bottle, Vinegar Spray, Ice Cube Tray, Candle, Baking Soda, Lemon, Sticky Tape, Fly Paper |
| **2** | Non-standard firing patterns, tile writes, charges | Mousetrap, Toaster, Gas Stove Burner, Hot Pan, Popsicle, Fan, Diatomaceous Earth, Nightlight, Bird Feeder, Honey Pot, Compost Bin |
| **3** | Adjacency, auras that buff *towers*, pathing | Sharpening Steel, Fridge Magnets, Extension Cord, Spice Rack, Recipe Card, Mint Pot, Bay Leaf, Cold Draft, Bleach, UV Lamp |
| **4** | Autonomous agent AI, separate from enemy AI | Roomba, Cat, Dog Bowl |
| **5** | Bespoke; most depend on the noise meter | Freezer Burst, Bug Zapper, Blender, Oven, Microwave, Garbage Disposal, Sourdough Starter |

**v1 covers all of tiers 0–2 except** Hot Pan, Popsicle, Diatomaceous Earth, Bird Feeder and Compost Bin — which are cheap adds, since their systems already exist.

### Enemies

| Tier | What it needs | Members |
|---|---|---|
| **0** | Path + HP only | Ant, Roach, Silverfish, Beetle, Earwig |
| **1** | Flags on the mover | Fly, Moth, Weevil, Springtail, Booklouse, Pantry Mite |
| **2** | Writes state to tiles / alters the board | Slug, Snail, Mold, Grease Blob, Ash Beetle, Fruit Fly |
| **3** | Senses towers or other enemies — reactive AI | Roach (evolved), Ant colony line, Wasp, Cricket, Carpet Beetle, Aphid, Mealworm, Termite |
| **4** | Goal state, inventory, return path — the theft system | Mouse, Squirrel, Pigeon, Ant Queen |
| **5** | Bosses, multi-phase | Raccoon, Rat King, Neighbour's Cat, Wasp Nest |

**v1 covers tiers 0–2 (minus Earwig, Springtail, Snail, Grease Blob, Ash Beetle) plus the Mouse from tier 4.**

---

## 2. Act III — The Whole Kitchen (nights 19–30)

Synergy and board state. This is the act that introduces towers knowing about each other.

| Night | Tower | Role | Cost | DMG | Rate/s | Range | Type | Targets | Noise | Builds on |
|---|---|---|---|---|---|---|---|---|---|---|
| 19 | Compost Bin | ECONOMY | 220 | — | — | 4 | — | — | 0 | v1 income + death events |
| 20 | Sharpening Steel | BUFF | 180 | — | — | Adjacent | — | — | 0 | **new: adjacency buffs** |
| 21 | Mint Pot | CONTROL | 190 | 0 | — | 2 | — | Ground | 0 | v1 pushback (step 18) — **pure config** |
| 22 | Hot Pan | TILE_EFFECT | 210 | 20 | 0.4 | 3 | Fire | Ground | 1 | v1 tile state (step 14) |
| 23 | Roomba | AUTONOMOUS | 250 | 6 | 1.0 | 1 | Physical | Ground | 2 | **new: patrol AI** |
| 24 | Fridge Magnets | BUFF | 200 | — | — | Adjacent | — | — | 0 | adjacency buffs |
| 25 | Diatomaceous Earth | TILE_EFFECT | 130 | 12/s | — | 1 tile | Physical | Ground | 0 | v1 tile state + charges |
| 26 | UV Lamp | DETECTION | 185 | 0 | — | 5 | — | Both | 0 | v1 reveal (step 11) |
| 27 | Extension Cord | BUFF | 165 | — | — | Adjacent | — | — | 0 | adjacency + tower tags + chewable HP |
| 28 | Bleach | AOE | 240 | 40 | 0.5 | 2 | Chemical | Both | 1 | v1 tile state — permanent tile change |
| 29 | Popsicle | SLOW | 60 | 3 | 1.0 | 3 | Cold | Ground | 0 | **new: lifespan timer / self-removal** |
| 30 | Cat | AUTONOMOUS | 400 | 45 | 0.7 | 2 | Physical | Both | 3 | free-roam AI with behaviour states |

**New systems needed:** adjacency buffs (towers reading their neighbours), patrol/free-roam agent AI, temporary towers with lifespans. Three systems for twelve towers.

### Act III enemies

| Night | Enemy | HP | Speed | Reward | Steals | Tags | Special |
|---|---|---|---|---|---|---|---|
| 19 | Earwig | 70 | 1.4 | 14 | 2 | ground, bug | Fast bruiser, no gimmick |
| 20 | Fruit Fly | 8 | 2.0 | 2 | 1 | air, swarm, self-spawning | *Already in v1 as a rot consequence; becomes a scheduled wave enemy here* |
| 22 | Springtail | 22 | 1.2 | 7 | 1 | ground, erratic, bug | Randomly hops forward, unpredictable spacing |
| 24 | Snail | 140 | 0.3 | 22 | 3 | ground, armored, slime, shell | Retracts into shell when hit — temporary invuln. **armored × slime makes it genuinely weird to kill** |
| 26 | Booklouse | 12 | 1.5 | 8 | 1 | ground, hidden, bug | Only visible under UV Lamp — the real customer for v1's reveal plumbing |
| 27 | Pantry Mite | 35 | 1.1 | 15 | 1 | ground, physical-immune | 0.0× physical; must be killed with chemical or heat |
| 28 | Grease Blob | 90 | 0.5 | 20 | 2 | ground, disables-towers | Coats towers it passes, disabling them briefly |
| 29 | Mealworm | 60 | 0.9 | 12 | 2 | ground, splits, bug | Splits into two smaller mealworms on death |

---

## 3. Act IV — Late Game (nights 31+)

Power at a price. Almost every entry here depends on the noise meter, which is why v1 ships it.

| Night | Tower | Role | Cost | DMG | Rate/s | Range | Type | Targets | Noise | Builds on |
|---|---|---|---|---|---|---|---|---|---|---|
| 31 | Cold Draft | SLOW | 230 | 0 | — | 5 | Cold | Both | 0 | v1 auras + wave-spawn modifier |
| 33 | Spice Rack | BUFF | 260 | — | — | Adjacent | — | — | 0 | adjacency + randomisation |
| 35 | Bug Zapper | AOE | 450 | 30, chains 4 | 0.8 | 4 | Electric | Both | 6 | **new: chaining target logic** |
| 37 | Bird Feeder | ECONOMY | 280 | — | — | — | — | — | 0 | v1 income + `edge_only` placement |
| 39 | Recipe Card | BUFF | 350 | — | — | Global | — | — | 0 | global modifier, one per level |
| 41 | Oven | AOE | 500 | 90 | 0.4 | 3 | Fire | Both | 8 | v1 AoE + noise |
| 43 | Dog Bowl | AUTONOMOUS | 420 | 70 | — | Roams | Physical | Ground | 9 | **new: timed friendly summon** |
| 45 | Sourdough Starter | ECONOMY | 300 | — | — | — | — | — | 0 | **new: persistence between nights** |
| 48 | Blender | BASIC_DPS | 650 | 40 | 3.0 | 1.5 | Physical | Both | 12 | v1 attack + noise |
| 52 | Microwave | ULTIMATE | 700 | 250 | 0.05 | Screen | Fire | Both | 15 | **new: charge state + global effect** |
| 55 | Garbage Disposal | ULTIMATE | 800 | ∞ | — | 1 tile | Physical | Ground | 7 | v1 tile state — tile-based instakill |
| 60 | Freezer Burst | ULTIMATE | 750 | 20 + freeze 4s | 0.07 | 6 cone | Cold | Both | 10 | v1 cones + freeze status |

**Economy rates:** Compost Bin 3 per nearby kill · Bird Feeder 12/sec (edge tiles only) · Sourdough Starter +15% per night survived, resets on damage.

### Act IV enemies

| Night | Enemy | HP | Speed | Reward | Steals | Tags | Special |
|---|---|---|---|---|---|---|---|
| 31 | Ash Beetle | 100 | 0.8 | 24 | 2 | ground, armored, douses-fire | Extinguishes fire-based towers it walks past. 0.2× fire |
| 33 | Aphid | 20 | 1.0 | 10 | 1 | ground, buffs-allies, bug | Harmless alone, buffs every enemy around it |
| 34 | Cricket | 50 | 1.3 | 16 | 1 | ground, noisy, bug | **Adds 0.5/sec to your noise meter just by being alive** |
| 36 | Termite | 80 | 0.9 | 18 | 2 | ground, eats-wood, bug | Destroys Cardboard Boxes and wooden towers on contact |
| 38 | Carpet Beetle | 95 | 1.0 | 20 | 2 | ground, eats-support, bug | Chews the Extension Cord and other support towers specifically |
| 40 | Wasp | 75 | 1.7 | 25 | — | air, attacks-towers | Attacks and disables towers instead of walking past |
| 42 | Mouse | 200 | 1.5 | 40 | 5, flees | ground, thief, mammal | *Moved to night 14 in v1 to demonstrate the theft system* |
| 45 | Ant Queen | 350 | 0 | 60 | — | ground, stationary, spawner | Parks and continuously spawns ants until killed |
| 47 | Squirrel | 300 | 2.0 | 55 | 8, flees | ground, thief, fast, mammal | Takes the largest item available |
| 50 | Pigeon | 260 | 1.8 | 50 | 6, flees | air, thief, bird | Ignores the whole ground layer |

Also from tier 3, unscheduled: **Roach (evolved)** — scatters and hides under objects when a light tower fires. **Ant colony line** — repaths along the last successful route (in the fixed-path model this became *lane memory*, see [DECISIONS.md](DECISIONS.md) §3).

### Bosses

| Night | Boss | HP | Speed | Reward | Steals | Special |
|---|---|---|---|---|---|---|
| 20 | Raccoon | 1500 | 0.8 | 150 | 10, repeat | Opens containers, multi-phase, steals repeatedly |
| 40 | Rat King | 3000 | 0.6 | 300 | — | Spawns mice continuously, splits when damaged |
| 55 | Wasp Nest | 4000 | 0 | 400 | — | Stationary, spawns waves of tower-attacking wasps |
| 60 | Neighbour's Cat | 6000 | 1.2 | 600 | — | Fights your Cat, knocks towers off the counter |

All bosses carry the `boss` tag: 1.0× against every damage type, and `pushImmune`.

---

## 4. Suggested drop order after v1

Each drop is self-contained and ships without destabilising what came before.

1. **Drop 1 — the cheap tier-2 leftovers.** Hot Pan, Popsicle, Diatomaceous Earth, Bird Feeder, Compost Bin, plus Earwig, Springtail, Snail, Grease Blob, Ash Beetle. Nearly all config on top of v1 systems. Extends the campaign to ~night 24 for very little work.
2. **Drop 2 — adjacency.** Sharpening Steel, Fridge Magnets, Extension Cord, Spice Rack, Recipe Card, plus Carpet Beetle and Termite as their counters. One new system, five towers, and it changes how players think about layout.
3. **Drop 3 — thieves and the first boss.** Squirrel, Pigeon, Ant Queen, the Raccoon. Pure extensions of v1's theft system.
4. **Drop 4 — autonomous units.** Roomba, Cat, Dog Bowl. The biggest single new system (agent AI), and the most distinctive content in the game.
5. **Drop 5 — reactive enemies.** Wasp, Cricket, Mealworm, Aphid, evolved Roach. Enemies that sense towers; the last genuinely new AI work.
6. **Drop 6 — the loud endgame.** Bug Zapper, Oven, Blender, Microwave, Garbage Disposal, Freezer Burst, Sourdough Starter, and the remaining bosses. The noise meter finally does what it was designed for.
