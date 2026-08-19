# Step 7 — Crumb economy

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, `../analytic-docs/DECISIONS.md` §4 — read it twice, this is the game's signature mechanic and it is easy to accidentally reduce to "gold on kill".
**Prereq:** step 6.

## Goal

Mess is money, and money left lying around is a liability. Killing things litters the board; you collect the litter by clicking it or by having built economy towers near where the killing happens; litter you ignore rots and hatches flies.

## Build

1. **Crumb entities** (`core/systems/crumbs.ts`). On `EnemyKilled`, drop a crumb at the death position with `value = enemy.reward`, `age = 0`.

2. **Merging.** On spawn, if a crumb exists within **0.7 tiles**, merge into it: sum the values, keep the older crumb's `age`, and step the glyph up by size band (small speck → 🍞 → a visible pile). This keeps a good kill zone producing one fat clickable pile instead of forty specks, and caps entity count for free. Merge on spawn only — do not run an O(n²) merge pass every tick.

3. **Click collection.** The `CollectCrumb` command (carrying a crumb id resolved from a canvas click) credits **full value instantly**. Hit target should be forgiving — test against the crumb's visual radius plus ~6px, and prefer the largest crumb when several overlap. Step 20's "Buy a Broom" installation upgrades this to a 1.5-tile radius sweep; leave the radius as a parameter now.

4. **Tower collection.** Towers with `collectRadius > 0` claim crumbs in range. A claimed crumb becomes `collecting` with a travel timer (**1.5s**, a parameter — step 20's Dustpan installation drops it to 0.7s), animates toward the tower, then credits full value. A claimed crumb cannot be double-claimed but **can** still be clicked, which cancels the claim and pays instantly.

5. **Rot** — the tension knob, per `../analytic-docs/DECISIONS.md` §4:
   - `age > 20s`: the crumb enters `rotting`. Visually distinct (a faint green tint or a fly-speck particle). Raises a local `spawnPressure` value on its tile.
   - `age > 35s`: the crumb is consumed and a **Fruit Fly** spawns at that position.
   - A Fruit Fly is `air, swarm, self-spawning`, 8 HP, speed 2.0 (`../analytic-docs/CONTENT.md` §2). It joins the nearest path at the crumb's position — i.e. it enters *mid-track*, past most of your defences. That's the punishment and it should sting.
   - Nothing targets flyers until step 11, so on nights 1–7 fruit flies are effectively unkillable. **This is intentional and it is the tutorial**: it teaches the player to sweep before it teaches them to shoot. Keep night 1–3 wave rewards low enough that a careless player generates only two or three.

6. **Economy tower income.** `income` behaviour credits at its per-second rate. Cookie Jar's destruction penalty still waits for step 10.

7. **Rendering.** Crumbs as glyphs sized by value band. A subtle pulse on rotting crumbs. A satisfying pop plus a floating `+N` on collection — this is the most-repeated interaction in the game, so spend a little effort on how it feels. Draw crumbs *under* enemies but *over* tile effects.

8. **HUD stub**: current crumbs, crumbs on the board, and a rot warning count. Step 8 makes it real.

## Tests

- Two kills 0.5 tiles apart produce one crumb with summed value; 1.2 tiles apart produce two.
- A crumb reaching 35s age is removed and spawns exactly one Fruit Fly at its position.
- A crumb claimed by a tower, then clicked at travel-time 0.8s, credits full value once and only once.
- Total crumbs credited over a full simulated night equals the sum of rewards of all collected crumbs — no rounding leak, no double-credit.
- `crumbsCollected / crumbsDropped` is tracked correctly for step 20's cleanliness score.

## Acceptance

- [ ] Playing night 3 while ignoring the board floor produces visible fly problems by wave 6.
- [ ] A Crumb Tray placed in a kill zone measurably out-earns one placed in a corner. If it doesn't, `collectRadius` or the tower's income rate is wrong.
- [ ] Collecting a big pile feels good.

## Do not

Add the noise meter, tile state, or any new tower. Fruit flies get no special AI beyond joining a path.
