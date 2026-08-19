# Step 23 — Polish pass — **MILESTONE: v1 shippable**

> Paste this entire file as your prompt into a fresh session. Consider splitting it into 23a/23b/23c if one session runs long — the four sections below are independent.

**Read first:** `CLAUDE.md`, `../analytic-docs/DECISIONS.md` §1 (tone — reread it before writing a single line of copy).
**Prereq:** step 22, with the numbers tuned.

## Goal

The difference between "the systems work" and "this is a game someone finishes". Everything here is optional individually and collectively decisive.

## A. Art pass

The flat-tile placeholder from step 3 has carried you this far; make it intentional.

- **Palette.** Deep blue-grey 2am base, warm amber pools of light where lamps and appliances are, cold blue for anything threatening. The board must be the brightest thing on screen — HUD chrome stays low-contrast. No hard whites anywhere.
- **Lighting as a real layer.** Warm radial pools around the Nightlight, the Candle, the Burner and the fridge, composited over the terrain. This one effect does more for the game's identity than any other visual change available to you — the kitchen should look *dark*, with your towers making it less so.
- **Terrain detail.** Subtle texture per surface (counter grain, tile grout, wood), rounded track edges, soft shadows under every entity. Keep it flat and clean — it has to sit beside emoji without clashing.
- **Emoji font.** Subset Noto Color Emoji to the glyphs actually used, bundle it, and set it as the sole family for the glyph cache so the game renders identically everywhere (`../analytic-docs/DECISIONS.md` §2). Verify on Windows, macOS and Linux.
- **Distinct glyphs.** Baking Soda and Salt Shaker currently share 🧂 — fix. Audit the whole roster for pairs that read alike at 48px.

## B. Juice

Small, cheap, and it's most of what makes a TD feel good:

- Hit flashes, floating damage numbers colour-coded by matrix effectiveness (from step 16), death poofs.
- Crumb collection pop and a rising `+N` — the most-repeated interaction in the game.
- Screen shake on the Mousetrap firing and on a barricade collapsing. Nothing else. Restraint is what makes shake work.
- Tower placement thunk; upgrade sparkle; a distinct sell sound.
- Wave-start banner, and a "final wave" flourish so the end of a night is legible.
- Enemy idle animation — a slight bob or scuttle. Static emoji look dead, and a two-line sine offset fixes it.
- **Audio.** A quiet ambient hum (fridge, clock ticking), tower SFX, enemy death sounds, and — most importantly — **the noise meter must be audible**. Loud towers should *sound* loud, and the approach to the cap should get audibly tense. Use Howler or raw WebAudio; keep the whole set under 2MB.

## C. Onboarding

- **Night 1 as a scripted tutorial**: contextual prompts one at a time — place a Salt Shaker, collect a crumb, call the next wave early, watch a leak happen. No modal walls of text, no forced clicks beyond the first.
- **Contextual first-time hints** on each new mechanic: the first crumb to start rotting, the first flyer, the first time noise passes 50%, the first mold tile, the Mouse's approach.
- **Codex screen** (from the kitchen): every discovered tower and enemy with full stats, tags, and the damage matrix rendered as a readable grid. Undiscovered entries stay silhouetted. This is where a player who wants to understand the counter system goes.
- **Settings**: audio volumes, screen shake toggle, damage numbers toggle, colourblind-safe palette variant, key rebinding, reset progress.

## D. Copy and shipping

- **Write every line in the tone from `../analytic-docs/DECISIONS.md` §1** — sincere-cozy, dry, understated. The objects never talk. Night names, item names, the loss screen, the tutorial prompts. `"You woke someone up."` beats any joke you could put there. Get the food item names right; the summary line is the emotional payload of the whole game.
- Pause on window blur. Handle tab-out gracefully (the loop's 250ms delta clamp already covers the spiral).
- Error boundary that offers to export `(seed, mapId, nightId, commandLog)` — free bug reports, courtesy of step 2's determinism.
- Production build check: no editor code, no harness code, no dev overlays. Measure the bundle; target under 3MB including the emoji font subset.
- Deploy static to itch.io or GitHub Pages.

## Acceptance

- [ ] A stranger can start the game and understand it without being told anything.
- [ ] The kitchen looks like a dark kitchen at 2am, not a grid with emoji on it.
- [ ] The noise meter is tense to listen to.
- [ ] All 18 nights are winnable on Normal and the campaign is worth finishing.

## **MILESTONE: v1**

Ship it.

After that, the original roadmap's Tiers 3–5 are waiting, and each is a self-contained system that drops in without destabilising anything here: adjacency buffs, autonomous units (Roomba, Cat), chain lightning, the ultimates, the bosses, and the reactive enemies. The architecture from step 1 was chosen so that none of them requires a refactor — the tile state, the tower HP, the behaviour vocabulary, and the pushback system are all already in place waiting for them.
