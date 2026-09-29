# Step 14 — Tile state system

> This step is two sessions. Paste **one part file** into a fresh session, in order, and `/clear`
> between them. Do not paste this index — it exists to say what the parts are and how they fit.

**Prereq:** step 13.

## Goal

One place where the board itself holds state. Nothing in Act II works without it, and — as the
original roadmap warned — retrofitting this into a finished game is genuinely painful. Build it now,
build it general, and accept that it looks over-engineered for the two things that use it this step.

Step 2 already put `tiles: TileState[]` on the world and `TileEffectKind` in the vocabulary, and
step 12B put `tileEffect` in the behaviour union. All three have been inert since. This step is what
reads them.

## Parts

Each part names its own `Read first:` sections, so a session only loads the docs it needs.

| Part | Session | Builds |
| --- | --- | --- |
| [A](14-tile-state/A-tiles-and-enemies.md) | The tile system | `core/content/tileEffects.ts` (the per-kind def table), `core/tiles.ts` (the model and every read), `core/systems/tiles.ts` (the tick and the enemy pass), the slime factor in `movement.ts`, the mold gate in `placement.ts`, scorch in `combat.ts` |
| [B](14-tile-state/B-tiles-on-screen.md) | Tile state on screen, and the brush | the paint brush in `dev/debug/`, then `render/layers/tileEffects.ts`, its palette entries, and the draw-order slot in `renderer.ts` |

Strictly in order. B draws what A stores, and B's brush is the only thing in the repo that writes
`heat`, `slime` or `mold` before step 15 — so nothing A builds can be *looked at* until B exists.

**A carries every test this step has.** The model, the ageing and the per-enemy reads share one
suite because they share one assertion — that an effect written for N ticks is felt on exactly those
N ticks and on no others — and splitting them costs the test that catches it. B adds none, by
`../../analytic-docs/ARCHITECTURE.md` §7, and says so in its own `Tests` section so it doesn't invent
coverage to look thorough.

B opens by building its own instrument, the way 13B did: the brush first, then the visuals, because
a slime sheen cannot be judged until something can put slime on a tile in less than a second.

## The seam that can't be split

**The model, the ageing and the per-enemy reads are one session.** The step's whole risk is
off-by-one: an effect that expires a tick early, a tick late, or that is read after it was aged
instead of before. That is one invariant with three writers, it is invisible on screen, and the only
thing that catches it is a spec that writes a cell and ticks past it. Put the reads in a second part
and that spec has no home — the part with the model will assert ageing in isolation, the part with
the reads will assert damage in isolation, and the tick where the two meet is exactly the one
neither covers.

Everything B builds, by contrast, is visible the moment it is wrong.

## What is deliberately not here

The `tileEffect` **behaviour interpreter** is step 17's, with the Gas Stove Burner it exists for.
`core/systems/noise.ts` carries a comment saying it is this step's; that comment is wrong and A
fixes it. Step 17 is where acceptance criterion 3 below is actually checked — this step can only
build the API to be checked.

## Step acceptance

- [ ] Painting heat, slime and mold from the brush produces the right visuals and the right enemy
      behaviour, and the three read as three different things at a glance.
- [ ] With no tile states active, the tile system costs effectively nothing per tick — measure it.
- [ ] The API is general enough that step 15's mold and step 17's burner are pure consumers, adding
      no new grid code. Neither is built here, so this one is a design review, not a test: read
      `15-mold-and-slime.md` §1–4 and `17-auras-and-zones.md` §3–4 against the exports
      in A's `Hands to 14B` block and name anything either step would have to add.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Do not

Add mold, slime, or the burner themselves. This step is the substrate only.
