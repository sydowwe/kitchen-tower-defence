# Step 12C — The inspector, the targeting control, and upgraded towers on screen

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md`, `../../analytic-docs/CONTENT.md` §1 (*Upgrades*, *Selling*) and
§5 (targeting modes), `../../analytic-docs/ARCHITECTURE.md` §5,
`../../analytic-docs/DECISIONS.md` §1 (tone).
**Prereq:** steps 12A and 12B.

## Goal

The panel that makes the mechanic a decision instead of a field. Three upgrade slots with an honest
before → after diff, a targeting control that fits beside them, a DPS number a player can trust, and
a tower that looks upgraded from across the board. This session closes step 12, so it ends with a
night played on the real numbers.

## Already in the repo

| File | What's there today |
| --- | --- |
| `ui/components/hud/TowerInspector.vue:30` | a **disabled** Upgrade button and a comment saying step 12 replaces it. `hud.upgradeUnavailable` in `en.ts:46` goes with it |
| `ui/components/hud/TowerInspector.vue:87` | `TARGETING_MODES` — six chips, already wired end to end through `HudLayer.vue:22` and `GameView.vue` to `SetTargetingMode`, and all six modes have worked in `targeting.ts` since step 6B. This control is **real**, not a stub; it is being re-shaped, not built |
| `ui/viewModel.ts:64` | `TowerStatsView` — seventeen fields, every one nullable except `noise` and `blocksPath`, with the rule that a missing stat is `null` and never `0` |
| `ui/viewModel.ts:216` | `statsFor(def)` — derives the card from the def's behaviours through the `isX` narrowers, so a tower that gains a behaviour gains a row without this file learning its name |
| `ui/viewModel.ts:355` | `buildTowerInspector` — the one exception ARCHITECTURE.md §5 carves out. **Corrected in 12C:** `GameView.vue:337` calls `refreshInspector()` from `publish()` as well as from the `watch`, so it is rebuilt on selection change *and* at 15Hz. The exception buys the click feeling instant, not a lower rate |
| `ui/components/hud/StatCard.vue` | the shared stat block, every row `v-if`'d on a null |
| `ui/icons.ts` | thirteen per-icon imports. `library.add(fas)` is forbidden and ESLint enforces it |
| `render/layers/towers.ts:307` | `drawTowers` — the pad, the rearm ring, the box damage states, the HP bar |
| `render/layers/towers.ts:64` | `REARM_GLYPH_ALPHA` and the sweep: step 10C's precedent for a treatment drawn **over** the one glyph rather than a second glyph on the def |
| `core/content/towers.ts`, `ui/locales/en.ts` | forty upgrade strings, written quickly in 12A and 12B and explicitly waiting for this session |
| `tests/viewModel.spec.ts` | 356 lines, including `tower.totalInvested = 101` at line 108 |

## Decisions already made

Reasons given so you don't re-derive them. Override one only if the code proves it wrong — and then
edit this file, don't leave it lying.

1. **The before → after diff is a diff of two `TowerStatsView`s.** Build
   `statsFor(effectiveDef(defId, n))` and `statsFor(effectiveDef(defId, n + 1))` and compare them
   field by field, emitting a row for every field that changed. Any other approach means a second
   list of which stats exist, and it drifts from `StatCard.vue` the first time a behaviour gains a
   row.

   **Corrected in 12C:** the draft finished "and it means 12B's six tiers show their numeric side for
   free", and they do not. `statsFor` derives from the behaviour vocabulary it already reads, and
   none of `splashRadiusTiles`, `projectilesPerShot`, `maxOutstanding`, `reflectDamagePerTick` or an
   added `aura` is on it — only the Ice Cube Tray's freeze surfaces, through `applies`. Five of the
   six tier 3s are carried by their description, which is what decision 5's layout gives the room to.
   Widening `TowerStatsView` would widen `StatCard.vue` with it, and an aura row belongs to step 17.

2. **All three slots are built, for every tier, on selection change.** That is a handful of `statsFor`
   calls over a memoised fold — microseconds, once per click — and it is what lets the panel show
   tier 3's description while the player is still standing on tier 0, which is the reason to save for
   it.

   **Corrected in 12C:** the draft said nine. It is **six** — each tier's diff reads the fold at
   `tier - 1` and at `tier`, so the three slots share their boundaries rather than each costing three.

3. **The targeting control becomes one cycling button, not six chips.** Six chips plus three upgrade
   slots is a panel taller than the board. One button showing the current mode's icon and name,
   advancing on click and reversing on shift-click, with the full list in its `title`.

4. **The mode icons are FontAwesome, per-icon, in `ui/icons.ts`.** They are HUD chrome, and
   `../../analytic-docs/DECISIONS.md` §2 reserves emoji for entities. Six more imports, never
   `library.add(fas)`.

5. **DPS on the card is single-target and says so.** A tier-3 Salt Shaker's splash and a tier-3
   Toaster's second projectile both make "damage per second" ambiguous, and a number that silently
   means "against a crowd" is the kind of number the acceptance criterion below catches by
   stopwatch. Keep `dps = damage × rate`, label the row so it reads as per-target, and put the tag
   matrix caveat in one sentence under it rather than trying to encode it.

6. **Tier shows on the board as a badge and a ring over the one glyph**, per 12A's decision 6 and
   10C's precedent. Tier 1 a subtle glow on the pad, tier 2 a ring at the pad edge, tier 3 a small
   corner badge. All three drawn in `drawTowers`, none of them a second glyph and none of them a
   change to `preloadTowerGlyphs`.

   **Corrected in 12C:** the draft put all three between the pad and the glyph, and the badge cannot
   go there. Under the glyph a corner badge is mostly covered by it, which loses the acceptance
   criterion it exists for — and on a tier-3 Cardboard Box it would land inside `drawBox`'s
   `ctx.scale` and be squashed flat with the box. The glow and the ring go between pad and glyph; the
   badge goes after the glyph, outside every transform.

## Build

### 1. `ui/viewModel.ts`

`TowerInspectorView` gains `upgrades: UpgradeSlotView[]` — three entries, always:

```
UpgradeSlotView = {
    tier: number                  // 1, 2, 3
    cost: number
    affordable: boolean           // world.crumbs >= cost, with >= not >
    state: 'owned' | 'next' | 'locked'
    nameKey: string
    descriptionKey: string | null // tier 3 only
    diff: { labelKey: string; from: StatValueView | null; to: StatValueView | null }[]
}
```

`from` and `to` are **resolved here, not in the component**: a range is `hud.stat.tiles` with
`{ n: 3 }`, a rate is `hud.stat.perSecond` with `{ n: 1.4 }` and a damage type is `hud.damage.fire`,
and a component that picked those would have to know what each field means — the same call step 9C
made when it resolved `applies` into `{ kind, perSecond }` here rather than in `StatCard.vue`.

**Corrected in 12C:** the draft said "strings, already formatted" — "3 tiles" — which is English in
the view model, and both CLAUDE.md's *Strings* rule and this file's own header forbid that. A
`StatValueView` is `{ textKey, params }` instead: the field still chooses the key, the component
still only calls `t`, and a bare number gets the pass-through key `hud.stat.plain`.

The diff covers the **scalar** rows only. `applies` is a list and `blocksPath` is a yes-or-no that no
tier moves, so neither gets a row — an `applies` row would need a multi-valued `StatValueView` for
the one tier in the roster that rewrites it, and the Ice Cube Tray's tier-3 sentence already says it.

`affordable` uses `>=`, matching `ShopEntry.affordable`'s note: a 30-crumb upgrade with exactly 30
crumbs is buyable, and a panel that dims it is lying about the one purchase the player has been
saving for.

The draft's gotcha here read: *`buildTowerInspector` runs on selection change, so `affordable` is
stale the moment the wallet moves — compare against `HudSnapshot.crumbs` in the component instead.*
**It is wrong**, for the reason in the table above: `GameView.vue:337` rebuilds the inspector from
`publish()`, so `affordable` is exactly as fresh as `ShopEntry.affordable` and is baked here for the
same reason that one is. The cost of being wrong the other way is a second answer to one question.

The real gotcha is what that rebuild rate does to decision 2: those six `statsFor` calls are no
longer once per click, they are fifteen times a second. Still microseconds over a memoised fold — but
they have to stay pure reads of `effectiveDef`, with no allocation the fold does not already make.

### 2. `TowerInspector.vue`

Three slots, the cycling targeting button, then the existing sell row. Tier 3's description gets
real prominence — it is the whole reason to save 250% of a tower's cost — and tiers 1 and 2 get the
diff and no sentence.

Delete the disabled button, the comment above it, and `hud.upgradeUnavailable` from `en.ts`.

Split it. `UpgradeSlot.vue` and `TargetingControl.vue` beside it: this component is already at the
size where CLAUDE.md's "split larger components into smaller ones" applies, and three slots inline
is three copies of the same markup.

The Upgrade click emits `upgrade: [towerId: EntityId]` through `HudLayer.vue` to the queue, the same
path `sell` takes. A keyboard binding belongs with the others in `ui/interaction.ts:416` next to
`x` — and it goes in `debug.hint` in `en.ts`, which is documented as the only written record of the
bindings.

### 3. The forty strings

Rewrite every `tower.*.tier*.name` and every tier-3 description, against the panel on screen.
`DECISIONS.md` §1 sets the voice: understated, dry, never jokey. A tier name is two or three words
of kitchen, not "Damage +40%" — the diff row beside it already says that, and a name repeating it
wastes the only line the tier has.

Re-read the four tiers 12A authored blind (Salt Shaker, Mousetrap, and the two economy towers) and
the six 12B authored; they were written to be replaced.

### 4. Re-tune tiers 1 and 2

This is the other half of the author-twice. 12A wrote "+40% to the defining stat" from arithmetic
with nothing to read it against. With the diff on screen and a night running, some of those will be
obviously wrong — an upgrade that moves a number the player never looks at, or one that costs 60% of
a tower for a change the diff shows as a single row. Fix them in `core/content/towers.ts` and in
whatever assertion in `tests/upgrades.spec.ts` pins them.

### 5. `render/layers/towers.ts`

The three tier treatments per decision 6, off `tower.tier`, drawn between the pad and the glyph.

Gotcha: the rearm branch at line 321 sets `ctx.globalAlpha` around its blit and puts it back
immediately — step 10C's decision 2, because `blitGlyph` hands out an opaque bitmap that cannot be
tinted. A glow drawn with an alpha left set fades every tower after it in `world.towers` order, and
the symptom is half the board dim and the half depending on placement order.

Second gotcha: a tier-3 Cardboard Box is drawn through `drawBox`, which wraps a `ctx.scale` in
`save`/`restore`. A badge drawn inside that transform is squashed with the box.

Range circles updating on upgrade needs nothing here — `ui/interaction.ts:464` went through
`effectiveDefOf` in 12A, so verify it rather than build it.

## Tests

Three assertions in `tests/viewModel.spec.ts` (the draft said two and listed three), and nothing over
`render/` —
`../../analytic-docs/ARCHITECTURE.md` §7, the bugs there are visible.

- The slot for a tier that raises damage from 5 to 7 carries a diff row for damage reading 5 → 7,
  and **no row** for range, rate or noise. A diff that emits every field is the failure mode worth
  catching: it is not visibly wrong, it is just eleven rows of unchanged numbers.
- A tier-3 tower's inspector reports `dps` from the folded def, not the base one — the number the
  acceptance criterion below checks by stopwatch.
- The snapshot still holds no reference into the world: extend the existing assertion in that file
  rather than writing a second one, so the new `upgrades` array is covered by the test that already
  guards this.

## Acceptance

- [ ] "Upgrade the tower I have, or build a second one" is a genuine decision on night 9. Play it.
      If the answer is always the same, the 60/120/250 curve or the +40% bumps are wrong — say which
      in the commit rather than leaving it for step 22.
- [ ] The inspector's DPS number matches observed damage over 30 seconds against a single ant, at
      tier 0 and at tier 3.
- [ ] A tower's ring, glyph treatment and range circle all change on the same frame the upgrade is
      bought, with no click needed to refresh the panel.
- [ ] Tier 3 is legible from across the room at 3× speed — you can tell which towers on the board are
      maxed without clicking one. This is 10C's armed-state criterion applied to the same problem.
- [ ] The tier-3 description is the thing you read first when you open the panel on a tier-0 tower.
      If the diff rows are louder than it, the layout is upside down.
- [x] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Add a sell confirmation, a refund preview beyond the number already under the button, or an
upgrade-all control. Do not put the upgrade state in a Pinia store — the inspector is part of the
snapshot and the snapshot is a `shallowRef` replaced wholesale (CLAUDE.md, *What goes in a store*).
Do not add a second stat vocabulary for the diff; decision 1 is what stops that. Do not touch
`core/`: if a number is wrong, it is wrong in `towers.ts`, and if the fold is wrong, that is a 12A
bug and the fix belongs there with its test.
