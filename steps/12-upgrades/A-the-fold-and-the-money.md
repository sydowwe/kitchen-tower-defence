# Step 12A — The upgrade fold, the effective def, and the money

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/CONTENT.md` §1 (*Upgrades* and *Selling*
only), `../../analytic-docs/ARCHITECTURE.md` §4.
**Prereq:** step 11, all three parts.

## Goal

A tower's numbers become a function of `(defId, tier)` instead of a lookup, and `UpgradeTower`
starts paying for the difference. Entirely headless. By the end of it every tower has three tiers,
four of them already change behaviour, and nothing on screen says so — 12C is what draws it.

This is the part that can silently be wrong, so it carries most of step 12's tests.

## Already in the repo

Step 12 has been anticipated in comments since step 2. Several of them are about to become wrong;
fix each one as you pass it.

| File | What's there today |
| --- | --- |
| `core/types.ts:245` | `Tower.tier: number` and `Tower.totalInvested: number` — both already on the entity, both currently only written by `placeTower` |
| `core/types.ts:296` | `Projectile.pierce`, documented as "step 12's upgrade field". Decremented in `projectiles.ts`; no content sets it |
| `core/content/schema.ts:290` | a comment above `const tower` reading "Absent on purpose — the step that adds the mechanic extends this schema: upgrade tiers (step 12)" |
| `core/content/towers.ts` | **ten** towers, not twelve. `saltShaker, toasterCrumbTray, cookieJar, iceCubeTray, stickyTape, sprayBottle, mousetrap, cardboardBox, toaster, nightlight` |
| `core/content/towers.ts:50, 320, 353, 396` | four doc comments naming a T3 that this step adds |
| `core/systems/placement.ts:141` | `totalInvested: def.cost`, with the comment "the sell refund reads this field and never the def, because step 12's upgrades add to it" |
| `core/systems/placement.ts:161` | `refundFor` — 70%, 50% during `phase === 'wave'`. **Already correct**; it only needs `totalInvested` to grow |
| `core/systems/commands.ts:12` | "Step 12 executes `UpgradeTower`". The command interface exists in `core/commands.ts:25` and falls through the `default` case |
| `core/systems/commands.ts:89` | `setTargetingMode`, **already implemented**; all six modes work in `targeting.ts:119` |
| `tests/placement.spec.ts:130` | asserts `tier === 0` and `totalInvested === 50` on a fresh tower |
| `tests/content.spec.ts` | asserts the Salt Shaker's numbers literally, including `splashRadiusTiles === 0` at line 104 |
| `tests/behaviours.spec.ts:128` | asserts `Object.keys(attack(...))` is **exactly** nine names. Any field you add to `AttackBehaviour` fails here |
| `tests/schema.spec.ts` | asserts each inferred schema union is exactly its `core/types.ts` counterpart |

**Five spec files hand-build a `TowerDef` literal** — `combat`, `hitbox`, `status`, `light` and
`schema`. There is a `tests/fixtures/world.ts` but no tower fixture. Making `upgrades` a required
field on `TowerDef` breaks them at `type-check`; decision 8 below is how, and it is one line per
literal. `light`'s spreads `nightlight` and needs nothing.

> *12A, corrected against the repo.* The original line named `barricades`, `charges` and `crumbs`
> instead. Those three build a **`Tower`** literal, which this step does not change, and it missed
> `schema.spec.ts` — the one literal that goes through `validateContent`, so it carries three real
> tiers rather than the empty list the others pass (decision 8).

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **`upgrades` is authored inline in `core/content/towers.ts`, beside each def**, not in a second
   file keyed by tower id. `TowerDefOf<Id>` already derives every key from the id in that file; a
   parallel table is a second place a tower can be missing from, and nothing would catch it.

2. **A tier is `{ multiply, add, addBehaviours, nameKey, descriptionKey }` and nothing else.** No
   `cost` (decision 4), no `glyph` (decision 6), no `replaceBehaviours`: every T3 in the roster is
   either a field delta or an added behaviour, and a replace is how a fold stops being a fold — the
   second application cannot see what the first did. If 12B finds a tier that genuinely needs one,
   it adds it then and writes the reason back here.

3. **Deltas name real behaviour fields, never a second stat vocabulary.** The plan sketched
   `statDeltas: { rate: ×1.4 }`; there is no `rate` field anywhere, so something would have to
   translate it into `cooldownTicks ÷ 1.4` and that translation is where the rounding bug lives.
   A rate bump is authored as `multiply: { cooldownTicks: 1 / 1.4 }`, against a named behaviour
   `kind`.

4. **Costs are derived from the base cost, not authored per tier.**
   `../../analytic-docs/CONTENT.md` §1 gives 60% / 120% / 250% as a *formula*; thirty transcribed
   numbers are thirty chances to drift from it, and step 22 re-pricing the curve would then touch
   thirty lines instead of three. `upgradeCost(def, tier)` is the one reader, `Math.round`ed.

5. **The fold applies `multiply` before `add`, within one tier, and folds tiers in order 1 → 2 → 3.**
   The multiplier describes the tower as it stands and the flat add is a bonus on top of it; the
   reverse silently multiplies a flat `+2` by whatever the same tier's multiplier is. Say it in a
   comment on the fold — `tests/upgrades.spec.ts` asserts the order and the comment is what stops
   someone "simplifying" it.

6. **No per-tier glyph.** `preloadTowerGlyphs` in `render/layers/towers.ts:470` rasterises
   `TOWERS.map(def => def.glyph)` at exactly one size; a tier glyph means forty cache entries and
   two more readers of the effective def for a string. The tier treatment is a badge drawn over the
   one glyph, which is the call step 10C already made for the rearming Mousetrap ("there is no
   flattened-mousetrap emoji"). 12C owns it.

7. **Any field whose name ends in `Ticks` is `Math.round`ed after the fold**, and **every other
   numeric field is rounded to six decimal places.** `cooldownTicks` is `z.number().int()` in the
   schema, so an unrounded multiply produces a def that would fail its own validation — and the
   symptom before it gets there is the shop card printing `0.15000000000000002` for a rate, which
   reads as a simulation bug. A name-suffix rule rather than a list, because the list is what goes
   stale when 12B adds a field.

   > *12A.* The suffix rule alone does not catch its own stated symptom: `5 × 1.4 × 1.4` is
   > `9.799999999999999`, and `ui/viewModel.ts` puts `damage` on the inspector **raw**. So the
   > six-place clean-up is the general half and the `Ticks` integer round sits on top of it. Six
   > places is far finer than anything authored, so a deliberately fractional stat survives it.

8. **`upgrades` is required on `TowerDef`, and the schema bounds it `.max(3)` rather than requiring
   three.** "Exactly three for every tower in the roster" is a *collection* invariant and belongs
   beside the duplicate-id check in `validateContent`, not in the per-entry schema — the synthetic
   defs the spec files register into `TOWERS` are not the roster, and they pass `upgrades: []`. This
   is the same split `validateCollection` already uses.

   > *12A.* The check runs over every tower `validateContent` is handed, so the one synthetic def
   > that goes *through* it — `schema.spec.ts`'s `validTower()` — carries three real tiers.

9. **`core/content/upgrades.ts` imports only `behaviours.ts` and `schema.ts`, both type-only.** It
   holds `TowerUpgrade`, the `tier()` factory, `foldUpgrades(def, n)` and `upgradeCost(def, n)`, all pure,
   all taking a def rather than looking one up. The **lookup** half — `effectiveDef(defId, tier)`
   with its memo, and `effectiveDefOf(tower)` — lives in `core/content/index.ts` beside
   `getTowerDef`. Putting the fold where it can call `getTowerDef` makes
   `towers.ts → upgrades.ts → index.ts → towers.ts` a cycle, and a content cycle surfaces as `TOWERS`
   being `undefined` at module load from a stack trace that names neither file.

10. **The memo is keyed by `` `${defId}|${tier}` ``, in a module-level `Map` in
    `core/content/index.ts`.** Forty entries at most, every one immutable, and **nothing ever
    invalidates it** — a different tier is a different key, so "invalidated on upgrade" is true by
    construction rather than by a call someone forgets. Module-level and never on `World`: the
    `Serialisable<World>` guard in `tests/types.spec.ts` rejects a `Map` on the world, and
    `core/path.ts`'s arc-length cache is the precedent.

11. **Step 17's aura buffs are *not* folded into the cache.** The fold is content — a function of
    `(defId, tier)`. A buff is world state, applied at the damage site. Folding one in would make
    the key depend on the board and the memo would have to die. Say so in a comment on
    `effectiveDef`, or step 17 will try.

## Build

### 1. `core/content/upgrades.ts` — the tier shape and the fold

```
DeltaTarget = BehaviourKind | 'def'

TowerUpgrade = {
    multiply: { kind: DeltaTarget; fields: Record<string, number> }[]
    add:      { kind: DeltaTarget; fields: Record<string, number> }[]
    addBehaviours: Behaviour[]
    nameKey: string
    descriptionKey: string | null
}
```

> *12A.* The sketch had `kind: BehaviourKind`, which item 5 below then contradicts: `maxHp` is on
> the def, not on a behaviour, so a delta has to be able to point at the def. `'def'` reaches the two
> fields that are genuinely def-level (`maxHp`, `noise`) and nothing else, and the tier shape stays
> at decision 2's five fields.

`tier(params)` writes every field out rather than spreading, exactly the way every factory in
`behaviours.ts` does and for the same reason.

`foldUpgrades(def, tier)` returns a **new** `TowerDef` with new behaviour objects. A delta naming a
`kind` the def does not have is a silent no-op today and a typo tomorrow — throw with the def id and
the kind in the message, the way `loadMap` throws on a bad `lengthTiles`.

`upgradeCost(def, tier)` — `Math.round(def.cost * [0.6, 1.2, 2.5][tier - 1])`. Tier is 1-based here
and `Tower.tier` is 0-based; write that down next to it, because the off-by-one is free to make and
costs a whole session's confidence in the prices.

Gotcha: `structuredClone` is the obvious way to get "a new def with new behaviours" and it is wrong
here — `Projectile.applies` in `projectiles.ts:87` is assigned **by reference** off the behaviour
and documented as never written through, which is only safe while a behaviour object is stable for
the life of the session. The memo gives you that; a fresh clone per call does not, and the symptom
is an allocation on the 60Hz path that `../../analytic-docs/ARCHITECTURE.md` §6 budgets against.

### 2. `core/content/schema.ts` and `core/types.ts`

Add `upgrades` to the `tower` schema per decisions 2 and 8, and the collection check to
`validateContent` (every tower in the roster has exactly three; the message names the tower and how
many it has). `TowerDef` is `z.infer`red and there is **no** hand-written interface to keep in sync —
see the header of that file. Delete the stale comment at line 290 while you are in there.

### 3. `effectiveDef` and the seam

`core/content/index.ts`:

```
effectiveDef(defId: DefId, tier: number): TowerDef
effectiveDefOf(tower: Tower): TowerDef
```

Then thread it. **Every reader of a placed tower's def moves; the one that constructs a tower does
not.** These are all of them:

| Call site | What it reads |
| --- | --- |
| `core/systems/combat.ts:125` | the firing behaviour, and `def.noise` for `towerFired` |
| `core/systems/targeting.ts:145` | the firing behaviour's `rangeTiles` / `targets` |
| `core/systems/charges.ts:108` | `charges` and `rearmTicks` on the rearm |
| `core/systems/barricades.ts:65` | `isBarricade` |
| `core/systems/economy.ts:23` | the income behaviour |
| `core/systems/crumbs.ts:177` | the collect behaviour |
| `core/systems/light.ts:57` and `:72` | the reveal behaviour |
| `core/systems/placement.ts:228` | `enemyCrumbsOnDestroy` in `destroyTower` |
| `render/layers/towers.ts:292` and `:315` | the reveal radius, the glyph, the charge |
| `render/layers/crumbs.ts:92` | the collect behaviour's `travelTicks` |
| `render/layers/entities.ts:212` | `isBarricade` |
| `ui/interaction.ts:464` | `reachOf` for the selected tower's range ring |
| `ui/viewModel.ts:361` | the inspector's stats |
| `core/systems/commands.ts:105` | **stays `getTowerDef`** — `PlaceTower` builds a tier-0 tower from the base def, which is what tier 0 means |

`interaction.ts:464` is the one 12C's "range circles update immediately on upgrade" criterion rides
on; it costs one word here and a bug report there.

### 4. `UpgradeTower`, in `core/systems/commands.ts`

Beside `setTargetingMode`, and silently a no-op on every refusal, like every other command naming a
gone entity: no tower, `tier >= 3`, `crumbs < cost`, or `phase` is `'won'` / `'lost'`. Then pay,
`tower.tier++`, `tower.totalInvested += cost`.

**Three live counters have to be reconciled against the new tier in the same breath**, and every one
of them is silent:

- `tower.maxHp` — set it from the new def and move `tower.hp` by the **delta**, not to full. A
  Cardboard Box upgraded to full HP mid-chew is a free repair, and a box left at `hp: 200` with
  `maxHp: 280` reads as pre-damaged the moment it is built.
- `tower.state.charges` / `rearmTicksRemaining` — clamp both to the new behaviour's numbers. A
  Mousetrap upgraded while rearming otherwise counts down from the *old* 396 once, and the player
  concludes the upgrade did nothing.
- `tower.cooldownTicks` — clamp to the new `cooldownTicks` for the same reason.

Export `upgradeCostFor(world, tower)` from this file, next to `earlyCallBonus`. The HUD previews the
price under the button and a formula the UI repeats is a button promising 30 while the wallet loses
31.

### 5. Author tier 1 and tier 2 for all ten towers

Roughly +40% to the tower's defining stat per tier, as `multiply` against the behaviour that carries
it: damage for the DPS towers, `crumbsPerPayout` for the economy pair, `radiusTiles` for the
Nightlight, `maxHp`… — `maxHp` is on the def, not on a behaviour, so the Cardboard Box's tiers need
`multiply` to reach a def-level field too. Keep that to the two fields that are genuinely def-level
(`maxHp`, `noise`) and say so in a comment; anything else belongs on a behaviour.

**Structurally correct, not balanced.** You have no inspector to read a before → after diff in and
no night to feel them in; 12C re-tunes these with both. Getting them right now means judging them by
reading TypeScript.

> *12A, two towers that are not a `multiply` on damage.* The **Sticky Tape** gains `add: { charges: 1 }`
> instead — 3 × 1.4 is 4.2 strips, and `TowerState.charges` is a counter the charge system spends
> down by one. The **Ice Cube Tray** bumps its *rate* (`multiply: { cooldownTicks: 1 / 1.4 }`) rather
> than its damage: its own def comment says the 2 damage is not meant to matter, and the magnitude of
> `slow` is on the status def where a tier cannot reach it.

### 6. The four tier-3s that are pure deltas

These need no new field and no line in any system, which is the acceptance criterion this part
exists to prove:

- **Salt Shaker T3** — `add: { splashRadiusTiles: 0.8 }` on `attack`. Both paths already exist:
  instant AoE at `combat.ts:166` and the arrival at `projectiles.ts:140`, both through
  `dealSplashDamage` and step 9's `circle`. The Salt Shaker has `projectileSpeed: 0.1`, so it takes
  the projectile path — and `dealSplashDamage` deliberately includes the primary target in the
  circle, so nothing hits it twice.
- **Mousetrap T3** — "rearm time halved". **Halve `cooldownTicks` on the `attack` as well as
  `rearmTicks` on the `charge`.** `MOUSETRAP_TICKS = 396` is documented in `towers.ts:283` as one
  number doing both jobs; halving only the rearm leaves the 396-tick cooldown gating every shot, the
  tower fires at exactly the rate it did before, and every test still passes.
- **Toaster Crumb Tray T3** and **Cookie Jar T3** — not in
  `../../analytic-docs/CONTENT.md` §1, because that list was written for the towers with
  interesting tiers. Every tower needs three, so author them: the tray's collected piles arrive
  instantly (`multiply: { travelTicks: 0 }`), and the jar stops owing the enemy side when it dies
  (`multiply: { enemyCrumbsOnDestroy: 0 }`). Both remove the tower's one drawback, which is a real
  tier-3-shaped decision, and both are one number. **Add the two lines to CONTENT.md §1 *Upgrades*
  in this commit**, and correct that list's Candle and Fan entries to say they arrive with their
  towers in steps 17 and 18.

12B authors the other six. Leave `upgrades[2]` for those towers as a tier with a `nameKey`, no
deltas and no behaviours rather than omitting it — decision 8's collection check wants three, and a
tier that does nothing for one session is visible, where a missing one is a crash in 12C.

### 7. English, placeholder-quality

`ui/locales/contentKeys.ts` turns a missing entry into a `type-check` failure, so the strings have
to exist before this part is green. Derive the keys from the id the way `nameKey` already is —
`` `tower.${id}.tier${n}.name` `` — and add a `TowerUpgradeMessages` type requiring a name per tower
per tier and a description for tier 3 only. Tiers 1 and 2 get no description: the before → after
diff says "5 → 7" and a sentence under it reading "more damage" is noise.

> *12A.* `TowerUpgradeMessages` is the `tier1` / `tier2` / `tier3` block and `TowerMessages` becomes
> `Record<TowerId, Entry & TowerUpgradeMessages>`, so the tiers sit **inside** each tower's entry.
> That is where the derived key lands — `tower.saltShaker.tier1.name` — and a second top-level block
> would have resolved a different key.

Write them quickly. **12C rewrites every one of them against the inspector**, and polishing them
here means writing forty lines of flavour for a panel you cannot see.

## Tests

New file `tests/upgrades.spec.ts`, plus the edits the table above warns about.

- Folding T1 → T2 → T3 over a synthetic def produces the documented final stats, and swapping the
  order of two multiplicative tiers produces a different answer — asserted against the documented
  order, not against whatever the implementation does.
- Within one tier, `multiply` runs before `add`: a tier with both on the same field lands on the
  number decision 5 describes and not the other one.
- **The base def object is never mutated.** Upgrade a tower to tier 3, then assert
  `getTowerDef('saltShaker')` still has `damage: 5` and `splashRadiusTiles: 0`, and that a freshly
  placed tower of the same type has base stats.
- `effectiveDef(id, n)` returns the **same object** on a second call — the memo is live, not a
  fresh fold per tick.
- Every tick-suffixed field is an integer after a fractional multiply: `perSecond(1.0)` at
  `multiply: { cooldownTicks: 1 / 1.4 }` is 43, not 42.857…
- `totalInvested` after base + T1 + T2 equals the sum of the three prices, and `refundFor` during
  `phase === 'wave'` is exactly 50% of it, floored.
- `UpgradeTower` at tier 3, with insufficient crumbs, and against a sold tower each change nothing —
  in particular the wallet is untouched in all three.
- Upgrading a damaged Cardboard Box raises `maxHp` and raises `hp` by the same delta, leaving the
  damage taken intact.
- A Mousetrap at tier 3 fires twice as often: run it against a standing enemy and count shots over
  800 ticks. This is the assertion that catches decision 6's gotcha.
- Salt Shaker T3 splash hits an enemy adjacent to its primary target, and hits the primary exactly
  once.
- Every def in `TOWERS` has exactly three tiers, and `validateContent` names the tower when one
  does not.

## Acceptance

- [x] No system file, and no file under `render/` or `ui/`, contains a branch on a tower id or on a
      tier number. *(The one comparison against a tier number anywhere is `tower.tier >= MAX_TIER` in
      `commands.ts`, twice — the "already at the top" boundary of the mechanic, not a special case.)*
- [x] `core/` still imports nothing but itself and zod; nothing added to `World`.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 12B and 12C

These exports are the contract the next two sessions build against. If you change a signature,
change it here too.

```
core/content/upgrades.ts   TowerUpgrade
                           tier(params): TowerUpgrade
                           foldUpgrades(def: TowerDef, tier: number): TowerDef
                           upgradeCost(def: TowerDef, tier: number): number   // tier is 1-based
core/content/index.ts      effectiveDef(defId: DefId, tier: number): TowerDef // memoised, tier 0-based
                           effectiveDefOf(tower: Tower): TowerDef
core/systems/commands.ts   upgradeCostFor(world: World, tower: Tower): number // 0 at tier 3
```

`Tower.tier` is 0 for a freshly placed tower and 3 at the top, so `def.upgrades[tower.tier]` is the
*next* one to buy. `upgradeCost` takes the 1-based tier the player is buying.

## Do not

Add a `replaceBehaviours`, a per-tier glyph, or a branching path — decisions 2 and 6, and the step's
own `Do not`. Do not touch `behaviours.ts`, any system's *interpretation* of a behaviour, or
`core/systems/aura.ts`: every one of those is 12B's, and the four tiers above are authored here
precisely because they need none of it. Do not change `TowerInspector.vue`, `StatCard.vue` or
`render/layers/towers.ts` beyond the effective-def swap in the table above — 12C owns what an
upgraded tower looks like, and the disabled Upgrade button stays disabled until it.
