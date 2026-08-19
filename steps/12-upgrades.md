# Step 12 — Upgrades and targeting modes

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, `../analytic-docs/CONTENT.md` §1 (Upgrades, Selling), §5.
**Prereq:** step 11.

## Goal

Depth without new towers. Three tiers per tower, where the third tier changes *behaviour* rather than numbers, plus per-tower targeting control.

## Build

1. **Upgrade model.** Each `TowerDef` carries `upgrades: [T1, T2, T3]`, priced at **60% / 120% / 250%** of base cost. Each tier is a declarative patch, not imperative code:
   ```
   { cost, statDeltas: { damage: +2, range: +0.5, rate: ×1.4 },
     addBehaviours?: Behaviour[], replaceBehaviours?: Behaviour[], glyph?, label, description }
   ```
   Applied by folding the patches over the base def. A tower's *effective* def is derived, cached, and invalidated on upgrade — never mutate the base def, and never store the folded result as the tower's own copy, or step 21's difficulty scalars and step 18's aura buffs will silently stop applying.

2. **Tiers 1 and 2** are stat bumps — roughly +40% to the tower's defining stat each. Author them for all twelve towers built so far.

3. **Tier 3 behaviours** (`../analytic-docs/CONTENT.md` §1). These are the interesting ones and each is a small amount of real work:
   - Salt Shaker T3 — splash, 0.8-tile radius (reuse step 9's `circle` hitbox)
   - Nightlight T3 — damages what it attracts, 6/s
   - Sticky Tape T3 — roots 3 enemies simultaneously
   - Cardboard Box T3 — chewing enemies take 8/s reflect
   - Ice Cube Tray T3 — every 4th hit is a 1.5s Freeze instead of a Slow
   - Toaster T3 — fires two projectiles
   - Mousetrap T3 — rearm time halved
   - Spray Bottle T3 — poison stacks apply twice as fast

   Every one of these should be expressible as `addBehaviours` or a behaviour flag. **If any of them requires editing a system file, the behaviour vocabulary is too narrow — widen it now.** This is your last cheap chance before Act II content lands on top.

4. **`totalInvested`** accumulates upgrade costs, so the sell refund (70% / 50%) accounts for them. Selling a tier-3 tower mid-wave should feel like a real loss.

5. **Targeting modes.** All six from `../analytic-docs/CONTENT.md` §5, switchable per tower via the `SetTargetingMode` command. Sensible defaults per role: `FIRST` for DPS, `STRONGEST` for burst, `CLOSEST` for cones. The chosen mode persists on the tower and is shown in the inspector.

6. **UI** (`TowerInspector`):
   - Three upgrade slots showing tier, cost, affordability, and a **before → after** stat diff. Tier 3 shows its behaviour description prominently, since it's the reason to save for it.
   - Targeting mode as a compact cycling control with an icon per mode.
   - Live DPS readout that accounts for tier, targeting, and (from step 18) any active buffs. Players will trust this number, so make it honest — including the tag matrix caveat that DPS varies by target.

7. **Rendering**: upgraded towers must look upgraded. Tier 1 adds a subtle glow, tier 2 a ring, tier 3 changes the glyph or adds a distinct badge. Range circles update immediately on upgrade.

## Tests

- Folding T1→T2→T3 patches produces the documented final stats; folding order doesn't matter for additive deltas and does for multiplicative ones — assert the documented order.
- The base def object is never mutated: upgrade a tower, then assert a freshly-created tower of the same type has base stats.
- `totalInvested` after base + T1 + T2 equals the sum, and the mid-wave refund is exactly 50% of it.
- Salt Shaker T3 splash hits an enemy adjacent to its primary target.
- Ice Cube Tray T3 freezes on exactly the 4th hit, then the 8th.

## Acceptance

- [ ] "Upgrade the tower I have, or build a second one" is a genuine decision on night 9, not an obvious one.
- [ ] The inspector's DPS number matches observed damage over 30 seconds against a single ant.
- [ ] No system file was edited to add any tier-3 behaviour.

## Do not

Add branching upgrade paths. Linear tiers only — the spec's design, and it keeps the UI honest.
