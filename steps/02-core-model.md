# Step 2 — Core data model and content pipeline

> This step is four sessions. Paste **one part file** into a fresh session, in order, and `/clear`
> between them. Do not paste this index — it exists to say what the parts are and how they fit.

**Prereq:** step 1.

## Goal

The shape of the entire game, with one tower and one enemy as proof. Nothing moves yet. Get this
right and the next fifteen steps are mostly filling in config.

## Parts

Each part names its own `Read first:` sections, so a session only loads the docs it needs.

| Part | Session | Builds |
| --- | --- | --- |
| [A](02-core-model/A-skeleton.md) | Skeleton | `core/rng.ts`, `core/types.ts`, `core/commands.ts`, `core/sim.ts`, `core/systems/` |
| [B](02-core-model/B-content-pipeline.md) | Content pipeline | `core/content/schema.ts`, `core/content/behaviours.ts` |
| [C](02-core-model/C-damage-and-statuses.md) | Damage and statuses | `core/content/matrix.ts`, `core/content/statuses.ts` |
| [D](02-core-model/D-content-and-world.md) | Content and world | `core/content/towers.ts`, `enemies.ts`, `core/world.ts` |

A comes first. B and C both need A and are independent of each other — either order. D needs all three.

The groupings are the point: B's two files have to agree on what a behaviour descriptor looks like,
and C's armor-strip rule spans both of its files, so splitting either pair costs you the test that
catches the mistake.

## Step acceptance

- [ ] `createWorld()` returns a fully-typed world that survives `JSON.parse(JSON.stringify(w))` unchanged.
- [ ] All content validates at boot; a deliberately broken tower def throws with its id in the message.
- [ ] Tests pass. The game still shows step 1's bouncing emoji — nothing visual changed.

## Do not

Implement movement, rendering of entities, or any system beyond stubs. This step is types, data, and
pure functions.
