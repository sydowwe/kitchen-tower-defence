# Step 6 — Tower placement, targeting, projectiles, damage

> This step is three sessions. Paste **one part file** into a fresh session, in order, and `/clear`
> between them. Do not paste this index — it exists to say what the parts are and how they fit.

**Prereq:** step 5.

## Goal

The salt shaker kills ants. Every combat tower for the rest of the project is a variation on what
gets built here, so it is built as a general system and not as a salt shaker: a tower is placed by a
command, picks a target through a mode, fires on a cooldown, and the hit routes through
`resolveDamage` with the enemy's tags.

## Parts

Each part names its own `Read first:` sections, so a session only loads the docs it needs.

| Part | Session | Builds |
| --- | --- | --- |
| [A](06-towers-and-combat/A-placement-and-economy.md) | Placement, selling, the economy towers | `core/systems/placement.ts`, `core/systems/commands.ts`, `core/content/towers.ts` |
| [B](06-towers-and-combat/B-targeting-and-damage.md) | Range, targeting, combat, projectiles, death | `core/systems/spatial.ts`, `targeting.ts`, `combat.ts`, `projectiles.ts`, `resolve.ts` |
| [C](06-towers-and-combat/C-towers-on-screen.md) | Towers, shots and hits on screen | `render/layers/towers.ts`, `render/layers/effects.ts`, `dev/placement.ts`, `GameView.vue` |

Strictly in order. B fires the towers A creates; C draws what B produces and gives you a mouse to
place them with.

**A and B both carry tests; C carries none.** A owns the placement and refund assertions, B owns the
targeting, cooldown and damage assertions, and C is pixels — `../analytic-docs/ARCHITECTURE.md` §7,
and vitest runs `environment: 'node'` so nothing in C is reachable from a spec anyway. A part with
no tests is not an under-tested part; do not invent coverage for C.

The Salt Shaker's `projectileSpeed` is **authored twice on purpose**: B picks a structurally-correct
number with nothing on screen to judge it by, and C re-tunes it after watching a shot cross the
board. Same for the hit-flash and damage-number lifetimes. Both parts say so.

## The seam that can't be split

**A owns turning a `TowerDef` into a `Tower` entity; B owns everything that reads one.** Move the
line — targeting into A, or placement into B — and B loses its one end-to-end assertion: that a real
placed tower's shot reaches `resolveDamage` carrying the enemy's *tags*, not just the base number.
That is the assertion the whole damage matrix silently depends on, and it only exists if one session
holds both a placed tower and a live enemy.

## Step acceptance

- [ ] Four Salt Shakers placed along the Counter track clear wave 1 of night 1 without a leak.
- [ ] Range circles, hit flashes, and damage numbers all read clearly at 3× speed.
- [ ] Adding a second DPS tower to `core/content/towers.ts` requires **zero** changes to any file in
      `core/systems/`. If it doesn't, the behaviour composition is wrong — fix it in step 6, not in
      step 9.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Build status effects, cones, auras, or upgrades. One behaviour (`attack`) plus the two `income`
towers as content, done properly.
