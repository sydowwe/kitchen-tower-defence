# Content Tables — v1 (Acts I & II, nights 1–18)

All of this is **starting values calibrated to one baseline**: Salt Shaker = 50 crumbs, 5 damage, 1.0/sec, range 3. That's 10 crumbs per DPS. Every other tower is priced against that ratio, with deviations where a tower does something a plain turret can't.

Ranges are in tiles. Speeds are tiles/sec. Grid is **24 × 14 tiles at 48px** (1152 × 672 logical).

Tune these. The one number that must be right before anything else is **crumbs earned per wave versus tower cost** — target ~1.5 new towers affordable per night in Act I, dropping to ~0.5 by the end of Act II. See step 22.

---

## 1. Towers

Roles: `BASIC_DPS · BURST_DPS · AOE · DOT · SLOW · CONTROL · WALL · ECONOMY · DETECTION · SUPPRESSION · TILE_EFFECT`

### Act I (nights 1–8)

| Tower | Glyph | Role | Cost | DMG | Rate/s | Range | Type | Targets | Noise | Placement |
|---|---|---|---|---|---|---|---|---|---|---|
| Salt Shaker | 🧂 | BASIC_DPS | 50 | 5 | 1.0 | 3 | physical | ground | 0 | off_path |
| Toaster Crumb Tray | 🍞 | ECONOMY | 75 | — | — | 2.5 collect | — | — | 0 | off_path |
| Sticky Tape | 🧻 | CONTROL | 40 | 0 | 0.5 | 2 | — | ground | 0 | off_path |
| Mousetrap | 🪤 | BURST_DPS | 90 | 60 | 0.15 | 1 | physical | ground | 2 | off_path |
| Cookie Jar | 🍪 | ECONOMY | 150 | — | — | 3 collect | — | — | 0 | off_path |
| Spray Bottle | 🧴 | DOT | 120 | 3 + 2/s | 1.2 | 3 cone | chemical | both | 0 | off_path |
| Cardboard Box | 📦 | WALL | 25 | — | — | — | — | — | 0 | **path_only** |
| Ice Cube Tray | 🧊 | SLOW | 110 | 2 | 0.8 | 3 | cold | ground | 0 | off_path |
| Toaster | 🔥 | BURST_DPS | 140 | 35 | 0.3 | 4 | fire | **air only** | 3 | off_path |

### Act II (nights 9–18)

| Tower | Glyph | Role | Cost | DMG | Rate/s | Range | Type | Targets | Noise | Placement |
|---|---|---|---|---|---|---|---|---|---|---|
| Nightlight | 💡 | DETECTION | 100 | 0 | — | 4 | — | both | 0 | off_path |
| Candle | 🕯️ | DOT | 130 | 4/s aura | — | 2 | fire | both | 0 | off_path |
| Vinegar Spray | 🧪 | DOT | 145 | 4 + 4/s | 1.0 | 3 | chemical | both | 0 | off_path |
| Fly Paper | 🎗️ | CONTROL | 35 | 0 | — | 2 | — | **air only** | 0 | off_path |
| Bay Leaf | 🌿 | SUPPRESSION | 160 | 0 | — | 3 | — | ground | 0 | off_path |
| Gas Stove Burner | ♨️ | TILE_EFFECT | 200 | 14/s | — | 1 tile | fire | ground | 2 | **path_only** |
| Baking Soda | 🧂 | AOE | 80 | 6 | 0.6 | 2 | chemical | ground | 0 | off_path |
| Honey Pot | 🍯 | ECONOMY | 175 | 0 | — | 3 bait | — | ground | 0 | off_path |
| Lemon | 🍋 | DOT | 155 | 8 | 0.9 | 3 | chemical | both | 0 | off_path |
| Fan | 🌀 | CONTROL | 170 | 1 | 1.5 | 4 cone | — | **air only** | 1 | off_path |

> Baking Soda and Salt Shaker share 🧂 — pick a distinct glyph for one during step 23's art pass (Baking Soda → 🥣 or a tinted variant).

### Behaviour notes that aren't in the table

- **Cardboard Box** — 200 HP barricade placed *on* the track. Enemies stop and attack it; it does not damage them. Termites (Act III) delete it instantly.
- **Sticky Tape** — applies `Rooted` to one enemy at a time. Root persists until the tape is spent (3 charges) or the enemy dies.
- **Fly Paper** — 2 charges, air-only root, self-removes when spent.
- **Mousetrap** — charge state machine: `armed → fired → rearming (6.6s) → armed`. Fires at the STRONGEST target in range by default.
- **Nightlight** — deals nothing. Reveals hidden enemies and pulls light-drawn ones (Moth) into its radius. T3 upgrade adds damage.
- **Bay Leaf** — suppresses burrowing inside its radius: Weevils surface and become targetable.
- **Honey Pot** — 7 crumbs/sec income *and* an aggro radius that pulls nearby ground enemies toward it, holding them in a kill zone. Bait is the point; the income is the bribe for taking the risk.
- **Fan** — pushback, air-only. Shares the pushback system with Mint Pot (post-v1, ground).
- **Gas Stove Burner** — writes a persistent damaging tile onto the track. First real area denial.

### Economy rates

| Tower | Income |
|---|---|
| Toaster Crumb Tray | 4/sec |
| Cookie Jar | 9/sec — **drops 200 crumbs to the enemy side if destroyed** |
| Honey Pot | 7/sec |

### Upgrades

Three tiers per tower, priced at **60% / 120% / 250%** of base cost. Tiers 1 and 2 are stat bumps (roughly +40% to the tower's defining stat each). Tier 3 adds a *behaviour*:

- Salt Shaker T3 — gains splash (0.8 tile radius)
- Nightlight T3 — damages what it attracts (6/s)
- Sticky Tape T3 — roots 3 enemies simultaneously
- Cardboard Box T3 — enemies chewing it take 8/s reflect damage
- Ice Cube Tray T3 — slow becomes a 1.5s freeze on every 4th hit
- Toaster T3 — fires two projectiles
- Candle T3 — burn applied by the aura stacks to 3
- Fan T3 — pushback also applies `Marked`

### Selling

70% of total invested (base + upgrades), dropping to **50% once a wave is in progress**.

---

## 2. Enemies

| Night | Enemy | Glyph | HP | Speed | Reward | Steals | Tags |
|---|---|---|---|---|---|---|---|
| 1 | Ant | 🐜 | 10 | 1.0 | 3 | 1 | ground, swarm, bug |
| 3 | Roach | 🪳 | 18 | 1.8 | 5 | 1 | ground, fast, bug |
| 5 | Beetle | 🪲 | 55 | 0.7 | 10 | 2 | ground, bug |
| 8 | Fly | 🪰 | 14 | 2.2 | 6 | 1 | air, bug |
| 10 | Moth | 🦋 | 25 | 1.6 | 8 | 1 | air, light-drawn |
| 11 | Mold | 🟢 | 40 | 0.15 | 12 | — | ground, spreads, fungal |
| 13 | Weevil | 🐛 | 30 | 1.0 | 9 | 1 | ground, burrows, bug |
| 14 | **Mouse** (mini-boss) | 🐭 | 200 | 1.5 | 40 | 5, flees | ground, thief, mammal |
| 15 | Slug | 🐌 | 45 | 0.4 | 11 | 2 | ground, slime, soft |
| 17 | Silverfish | 🐟 | 110 | 0.6 | 18 | 2 | ground, armored, bug |
| — | Fruit Fly | 🦟 | 8 | 2.0 | 2 | 1 | air, swarm, self-spawning |

**Fruit Fly has no scheduled night in v1.** It hatches from crumbs left on the board longer than 35s, from night 1 onward. It becomes a scheduled wave enemy at night 20 (post-v1).

**Mold does not walk.** It spawns on a track tile and spreads to adjacent tiles on a timer, permanently corrupting them (corrupted tiles block placement and slow nothing — they're a board-space tax). It never reaches the fridge; it wins by eating the map.

**Weevil** burrows for a randomised stretch of the track — untargetable while under. Bay Leaf suppresses this inside its radius.

**Moth** deviates from the track toward any active light source (Nightlight, Candle) within 5 tiles, then resumes. This is the one enemy that leaves the polyline; implement it as a lateral offset from the sampled path point, not as free movement.

---

## 3. Damage type × tag matrix

Multipliers. **Multiple tags multiply** — that's how a Snail (armored + slime) ends up genuinely weird to kill. Untagged combinations default to 1.0.

| | Physical | Fire | Cold | Chemical | Electric |
|---|---|---|---|---|---|
| soft | 1.0 | 1.5 | 0.5 | 2.0 | 1.0 |
| armored | 0.4 | 1.0 | 1.2 | 1.0 | 1.0 |
| swarm | 1.0 | 1.5 | 1.0 | 1.5 | 1.0 |
| air | 0.5 | 1.2 | 1.0 | 1.0 | 2.0 |
| fungal | 0.2 | 1.5 | 0.3 | 2.5 | 0.5 |
| mammal | 1.5 | 1.0 | 0.8 | 0.6 | 1.2 |
| slime | 1.0 | 1.3 | 1.0 | 1.5 | 1.8 |
| physical-immune | 0.0 | 1.3 | 1.0 | 1.5 | 1.0 |
| douses-fire | 1.0 | 0.2 | 1.3 | 1.0 | 1.0 |
| boss | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 |

Rows below `slime` have no v1 enemies but ship in the table anyway — they cost nothing and Act III fills them in.

---

## 4. Status effects

Implemented as a list of timed modifiers on each enemy. Durations are tick counts internally.

| Effect | Value | Duration | Stacks |
|---|---|---|---|
| Slow | −40% speed | 2s | No — refreshes |
| Freeze | −100% speed | 4s | No |
| Burn | 5 dmg/s | 3s | Yes, max 3 |
| Poison | 4 dmg/s | 5s | Yes, max 5 |
| Armor Strip | `armored` multiplier moves halfway to 1.0 | 4s | No |
| Marked | +25% damage taken | 3s | No |
| Rooted | Cannot move | Until source is spent | No |

Slow and Freeze do not stack with each other — Freeze overrides, Slow does not re-apply under Freeze.

---

## 5. Targeting modes

Per-tower, player-switchable in the inspector: `FIRST · LAST · STRONGEST · WEAKEST · CLOSEST · RANDOM`.

Defaults: `FIRST` for DPS towers, `STRONGEST` for burst towers, `CLOSEST` for auras and cones.

With a fixed track, `FIRST` and `LAST` are max/min over `distance` — but on multi-path maps, compare **remaining distance to the fridge**, not raw distance, or the tower will prefer whichever lane happens to be longer.

---

## 6. Night and wave schedule

6 maps in rotation, 3 nights each. Wave counts rise from 6 to 14.

| Night | Map | Waves | Unlocks tower | New enemy | Modifier |
|---|---|---|---|---|---|
| 1 | Counter | 6 | Salt Shaker, Crumb Tray | Ant | tutorial |
| 2 | Counter | 7 | Sticky Tape | — | — |
| 3 | Counter | 8 | Mousetrap | Roach | — |
| 4 | Sink | 8 | Cookie Jar | — | — |
| 5 | Sink | 9 | Spray Bottle | Beetle | — |
| 6 | Sink | 9 | Cardboard Box | — | **dishes left out** — crumbs pre-scattered |
| 7 | Pantry | 10 | Ice Cube Tray | — | — |
| 8 | Pantry | 10 | Toaster | Fly | — |
| 9 | Pantry | 10 | Nightlight | — | — |
| 10 | Stove | 11 | Candle | Moth | — |
| 11 | Stove | 11 | Vinegar Spray | Mold | **damp night** — mold spreads 50% faster |
| 12 | Stove | 12 | Gas Stove Burner | — | — |
| 13 | Table | 12 | Bay Leaf | Weevil | — |
| 14 | Table | 12 | Fly Paper | **Mouse** (mini-boss) | — |
| 15 | Table | 13 | Baking Soda | Slug | **after a dinner party** — double crumbs, double spawns |
| 16 | Floor | 13 | Honey Pot | — | **moving day** — boxes consume 30% of build tiles |
| 17 | Floor | 14 | Lemon | Silverfish | — |
| 18 | Floor | 14 | Fan | — | **heatwave** — fire towers +30%, cold towers −30% |

Second spawn point appears from night 10; third from night 16. Author multi-lane tracks so they merge before the fridge.

**Wave composition** lives in `core/content/nights.ts` as `{ enemyId, count, spacingTicks, startDelayTicks }[]` per wave. Difficulty scalars are applied on top at runtime, never baked in.

---

## 7. Food

Fridge holds `18 + floor(nightIndex / 3)` named items, reset every night, scaled by difficulty.

Item pool: 🍕 slice of pizza · 🧀 cheese · 🍎 apple · 🥛 milk · 🍰 cake · 🥖 bread · 🍇 grapes · 🥚 eggs · 🍫 chocolate · 🥕 carrot · 🍗 chicken · 🧈 butter

Items are drawn from the pool at night start and displayed on the fridge shelves. Theft removes the *specific* items shown, and the night-end summary lists them by name. That specificity is the entire point — do not replace it with a counter.

---

## 8. Grocery Money 💵

Earned only from performance, at the end of each night. Crumbs never convert.

```
base            = 25 + 5 × nightIndex
foodSaved       = 8 × itemsRemaining
kills           = 0.25 × enemiesKilled
cleanliness     = 40 × (crumbsCollected / crumbsDropped)
noWakeBonus     = 50 if the noise meter never filled
earlyCallBonus  = 2 × secondsSkippedCallingWavesEarly

total = (base + foodSaved + kills + cleanliness + noWakeBonus + earlyCallBonus) × difficultyMult
```

### Installations

| Installation | Cost | Effect |
|---|---|---|
| Oil the Hinges | 90 | Noise decay +0.5/sec |
| Close the Kitchen Door | 100 | Noise cap +25 |
| Buy a Broom | 110 | Click-collect becomes a 1.5-tile sweep |
| Seal the Baseboard Crack | 120 | First ground spawn point on each map spawns 20% fewer enemies |
| Night Shift Dustpan | 140 | Tower auto-collect travel 1.5s → 0.7s |
| Fix the Window Screen | 150 | Flyer waves arrive one wave later than scheduled |
| Pantry Shelf Liner | 160 | Mold spreads 40% slower |
| Better Tupperware | 180 | Every enemy's `steals` value −1 (minimum 1) |
| Bigger Fridge | 200 | +4 food items every night |
| Emergency Snack Stash | 220 | Once per night, at 3 food remaining, +3 food |
| White-noise Machine | 260 | Noise cap +30 |
| Clear the Drying Rack | 170 | Loadout +1 slot (6 total) |
| Take the Toaster Off the Counter | 240 | Loadout +1 slot (7 total) |
| Second Shelf | 320 | Loadout +1 slot (8 total) |

### Loadout slots

Base **5**, maximum **8** with all three counter-space installations. See [DECISIONS.md](DECISIONS.md) §10.

| Nights | Towers unlocked | Slots (base) | Bites? |
|---|---|---|---|
| 1–5 | 2–5 | 5 | No — fewer towers than slots |
| 6–8 | 6–9 | 5 | Barely — first real cuts |
| 9–13 | 10–14 | 5–6 | Yes |
| 14–18 | 15–19 | 6–8 | Yes, sharply |

The mechanic turns itself on around night 8 without a tutorial. Price the three slot installations so a player who prioritises them can reach 7 slots by roughly night 14 — but has then spent Grocery Money they didn't put into Better Tupperware or the noise cap. Breadth versus depth is the intended metagame tension.

---

## 9. Difficulty tiers

Global scalars only. No bespoke content per tier.

| | Cozy | Normal | Nightmare |
|---|---|---|---|
| Enemy HP | ×0.80 | ×1.00 | ×1.35 |
| Enemy count | ×0.85 | ×1.00 | ×1.25 |
| Crumb income | ×1.25 | ×1.00 | ×0.85 |
| Starting crumbs | 250 | 200 | 150 |
| Food items | ×1.30 | ×1.00 | ×0.75 |
| Noise cap | 130 | 100 | 80 |
| Grocery Money | ×0.70 | ×1.00 | ×1.50 |
