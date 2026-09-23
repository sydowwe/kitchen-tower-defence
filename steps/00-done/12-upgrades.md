# Step 12 — Upgrades and targeting modes

> This step is three sessions. Paste **one part file** into a fresh session, in order, and `/clear`
> between them. Do not paste this index — it exists to say what the parts are and how they fit.

**Prereq:** step 11, all three parts.

## Goal

Depth without new towers. Three tiers per tower, where the third tier changes *behaviour* rather
than numbers, priced off the base cost and paid for out of the same wallet the tower came from. At
the end of it, "upgrade the tower I have or build a second one" is a real decision on night 9.

## Parts

Each part names its own `Read first:` sections, so a session only loads the docs it needs.

| Part | Session | Builds |
| --- | --- | --- |
| [A](12-upgrades/A-the-fold-and-the-money.md) | The fold, the effective def, the money | `core/content/upgrades.ts`, the schema field, `UpgradeTower`, the seam threaded through fourteen call sites, T1/T2 for all ten towers and the four T3s that are pure deltas |
| [B](12-upgrades/B-tier-three-behaviours.md) | The tier-3 behaviours and the vocabulary they need | `behaviours.ts` fields, `core/systems/aura.ts`, readers in `combat`, `charges`, `barricades`, `statuses`, `targeting`, and the six remaining T3s |
| [C](12-upgrades/C-the-inspector-and-the-board.md) | The inspector, the targeting control, upgraded towers on screen | `ui/viewModel.ts`, `TowerInspector.vue`, `StatCard.vue`, `en.ts`, `render/layers/towers.ts` |

Strictly in order. B authors content against A's fold; C shows what A and B produced.

**A and B carry the tests.** A asserts the fold, the immutability of the base def, the money, and
the four pure-delta tiers; B asserts the six behaviour tiers. C adds two view-model assertions (the
stat diff and the DPS number) and nothing over `render/` —
`../../analytic-docs/ARCHITECTURE.md` §7.

The tier-1 and tier-2 stat bumps are **authored twice on purpose**: A writes them from arithmetic
with no inspector to read them against, and C re-tunes them with the before → after diff on screen.
Same for the forty English strings — A and B write placeholder-quality entries because
`ui/locales/contentKeys.ts` turns a missing one into a type-check failure, and C writes the ones a
player reads.

## The seam that can't be split

**The effective def.** A single function answers "what are this tower's numbers right now", every
reader in `core/`, `render/` and `ui/` goes through it, and no fold is ever stored on the tower or
written back onto the base def. If the line moved so that B or C had to introduce it, each would
invent its own cache key and its own place to keep the result — and the version that mutates the
base def passes every test in the repo until a second tower of the same type is built.

## Step acceptance

- [ ] "Upgrade the tower I have, or build a second one" is a genuine decision on night 9, not an
      obvious one.
- [ ] The inspector's DPS number matches observed damage over 30 seconds against a single ant.
- [ ] No system file contains a branch on a tower id or a tier number. Every system edit reads a
      **field of the behaviour vocabulary**, and a second tower gaining the same tier-3 behaviour is
      a config change with no code in it.
- [ ] Every tower in `TOWERS` has exactly three tiers, and selling a tier-3 tower mid-wave refunds
      exactly 50% of everything paid for it.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Add branching upgrade paths. Linear tiers only — the spec's design, and it keeps the UI honest.
