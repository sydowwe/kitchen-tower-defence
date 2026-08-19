# Step 1 — Scaffold, conventions, game loop

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../analytic-docs/ARCHITECTURE.md` and `../analytic-docs/DECISIONS.md` in the repo root.
**Prereq:** none. This is the first step.

## Goal

An empty but correct skeleton: the project builds, a canvas renders emoji at 60fps through a fixed-timestep loop, Vue overlays it, tests run, and the conventions that every later step inherits are written down in the repo.

## Build

1. **Scaffold Vite + Vue 3 + TypeScript into a `game/` subfolder.**

   This folder is the **repo root of a monorepo**. The reference docs and `steps/` live at the root and stay there — they are shared with the future `api/` project and are referenced by path from every step. Do not move them, and do not scaffold over them.

   ```
   kitchen-defense/
     README.md  DECISIONS.md  ARCHITECTURE.md  ...  steps/
     game/          ← everything you create in this step
     api/           ← .NET 10, added much later. does not exist yet.
   ```

   `strict: true`, plus `noUncheckedIndexedAccess`. Add `@` → `game/src` path alias. All paths in `../analytic-docs/ARCHITECTURE.md` §1 are relative to `game/`.

   If the folder isn't a git repo yet, `git init` and commit the docs first, so the plan has its own commit before any code lands.

2. **Create the folder structure** exactly as laid out in `../analytic-docs/ARCHITECTURE.md` §1, with `index.ts` barrels where sensible. Empty placeholder files are fine.

3. **Write `CLAUDE.md` at the repo root.** This is the standing context every future session inherits. It must contain:
   - A three-sentence description of the game, and pointers to `../analytic-docs/DECISIONS.md`, `../analytic-docs/ARCHITECTURE.md`, `../analytic-docs/CONTENT.md`.
   - **The layering rule**: `core/` imports nothing from `render/`, `ui/`, or the DOM. `ui → core` and `render → core` only.
   - **Determinism rules**: all randomness through `world.rng`; no `Date.now()` or `performance.now()` in `core/`; durations are tick counts, not milliseconds.
   - **Code style**: `function foo() {}` declarations, never `const foo = () => {}`. Vue templates use PascalCase component names and camelCase props for non-native components.
   - **Content rule**: adding a tower or enemy means adding a config object, not a class.

4. **ESLint + a boundary check.** Configure ESLint with `no-restricted-globals` for `Math.random`, `Date`, and `performance` scoped to `src/core/**`, and a `no-restricted-imports` rule forbidding `vue`, `@/render`, and `@/ui` inside `src/core/**`. These rules are the enforcement mechanism for the whole architecture — verify they actually fail on a deliberate violation before moving on.

5. **The loop** (`src/main.ts` + `src/loop.ts`). Implement exactly the accumulator pattern in `../analytic-docs/ARCHITECTURE.md` §2: `TICK = 1/60`, frame delta clamped to 250ms, `MAX_CATCHUP = 5`, and a `speedMultiplier` of 0/1/2/3 that controls **how many sim ticks run per frame** — never `dt`. Expose `pause()`, `setSpeed(n)`.

6. **`src/render/glyphCache.ts`.** `getGlyph(emoji, sizePx): HTMLCanvasElement`, memoised on `emoji|size|devicePixelRatio`. Rasterise once via `fillText` into a tight offscreen canvas, return it for `drawImage`. Include a `preload(glyphs[])`.

7. **Canvas setup.** 1152 × 672 logical, `devicePixelRatio`-aware backing store, CSS-scaled to fit the window preserving aspect ratio. Vue's `App.vue` renders the canvas plus an absolutely-positioned HUD layer with `pointer-events: none` (children opt back in).

8. **Prove it.** Spawn 400 bouncing emoji drawn from the glyph cache, plus a debug overlay showing FPS, tick count, sim time, and entity count. Add speed/pause keyboard bindings (`space`, `1`/`2`/`3`).

9. **Vitest** configured over `src/core/**` with one real test: the loop advances exactly N ticks for a given elapsed time at each speed multiplier.

## Acceptance

- [ ] `npm run dev` shows 400 emoji at a locked 60fps; 3× visibly triples motion without changing per-tick behaviour.
- [ ] `npm run test` passes; `npm run lint` fails if you add `Math.random()` to a file in `core/`.
- [ ] `CLAUDE.md` exists and a fresh reader could infer the layering rules from it alone.

## Do not

Build any game logic. No entities, no towers, no map. This step is scaffolding only — resist the urge to start the ants.
