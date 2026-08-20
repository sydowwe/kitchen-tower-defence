# Step 2D — First content and createWorld

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, `../../analytic-docs/CONTENT.md` §1 (Salt Shaker row), §2 (Ant row), §9,
`../../analytic-docs/ARCHITECTURE.md` §3.
**Prereq:** steps 2A, 2B, 2C.

## Goal

Two real content entries that prove the pipeline, and the function that builds a world from
`(seed, mapId, nightId, difficulty)`. This closes step 2: after it, the determinism guarantee is
testable end to end.

## Build

### 1. `core/content/towers.ts` and `core/content/enemies.ts`

**Salt Shaker only** and **Ant only**, full and schema-valid, stats and tags exactly as in
`../../analytic-docs/CONTENT.md` §1–2. The tower is composed of behaviour descriptors from step 2B;
`nameKey` and `descriptionKey`, no English strings.

An index that exposes both collections and runs `validateContent` at module load in dev.

If writing either def needs a change to the schema, the behaviour vocabulary or the matrix, one of
those is wrong — fix it there rather than bending the def.

### 2. `core/world.ts`

`createWorld({ seed, mapId, nightId, difficulty })`.

- The rng is created from the seed and stored **on** the world, in its serialisable form.
- Entity arrays start empty; the `id → index` map starts empty and consistent with them.
- Difficulty comes from `../../analytic-docs/CONTENT.md` §9 and is stored as the tier's id plus its
  resolved multipliers, so a replay isn't at the mercy of a later balance patch.
- No `Date.now()`, no `Math.random()`, no DOM. `world.tick` starts at 0.

Gotcha: a map or night id that doesn't exist should throw here with the id in the message, not
produce a world with `undefined` fields that fails three systems later.

A minimal placeholder map def is enough — step 3 authors real maps.

## Tests

**Content**

- Both defs validate against their schemas.
- The Ant's tags produce the expected multipliers through `resolveDamage` — the end-to-end check that
  content and matrix agree, distinct from step 2C's synthetic-enemy tests.
- The Salt Shaker's stats match the doc: assert the numbers literally, so a balance change has to be
  made in both places on purpose.
- A deliberately broken copy of the tower def throws with `saltShaker` in the message.

**World**

- `createWorld()` survives `JSON.parse(JSON.stringify(w))` **deeply equal** — the step's headline
  assertion.
- Two worlds from the same arguments are deeply equal.
- Two worlds from different seeds have different rng state but identical structure.
- A hundred `tick()` calls on two same-seed worlds leave them deeply equal — the determinism check,
  now with real content loaded.
- An unknown `mapId` throws with the id in the message.

## Acceptance

- [ ] Neither content file needed a new behaviour kind, a new schema field, or a change to `matrix.ts`.
- [ ] All `nameKey`/`descriptionKey` values have entries in `ui/locales/en.ts`, and the build fails
      if one is missing.
- [ ] `createWorld()` returns a fully-typed world that survives a JSON round-trip unchanged.
- [ ] All content validates at boot; a deliberately broken tower def throws with its id.
- [ ] `npm run test`, `npm run lint` and `npm run type-check` are green, and the game still shows
      step 1's bouncing emoji — nothing visual changed.

## Do not

Add a second tower or a second enemy "since it's easy" — the point of one each is that the second one
is step 6's proof that no system file has to change. Do not spawn anything, author a real map (step
3), or run the world from the loop. Step 5 is what first makes it move.
