# Kitchen Defense

A kitchen tower defence: at 2am the bugs come for the food, and you defend the fridge with salt
shakers, candles, honey traps and mousetraps. Enemies walk a fixed authored track (BTD-style, no
pathfinding anywhere in the codebase), you pay for towers with crumbs collected during the night,
and the fridge's food is your health bar. It is a browser game — Canvas 2D for the board, Vue 3 for
the HUD and menus, all entities drawn as emoji.

**Read before designing anything:**

- [analytic-docs/DECISIONS.md](analytic-docs/DECISIONS.md) — what the game is, and what it deliberately is not.
- [analytic-docs/ARCHITECTURE.md](analytic-docs/ARCHITECTURE.md) — layers, the loop, determinism, the Vue reactivity trap.
- [analytic-docs/CONTENT.md](analytic-docs/CONTENT.md) — the tower and enemy roster with stats.
- [analytic-docs/TECH-EVALUATION.md](analytic-docs/TECH-EVALUATION.md) — what was considered and rejected. Read this before proposing a stack change.
- [steps/](steps/) — the build plan, one session per step.

Do not restate design decisions in code comments or in step files. There is exactly one source of
truth per decision; point at it.

---

## Repo layout

This is a monorepo. Reference docs and `steps/` live at the root and are shared with the backend
that arrives much later.

```
kitchen-defense/
  CLAUDE.md  analytic-docs/  steps/
  game/          Vite + Vue 3 + TypeScript. All npm commands run from here.
  api/           .NET 10 + FastEndpoints. Does not exist yet.
```

Commands (from `game/`): `npm run dev`, `npm run test`, `npm run lint`, `npm run type-check`,
`npm run format`, `npm run build`.

---

## The layering rule

```
src/core/     pure TypeScript simulation. Imports nothing but itself and zod.
src/render/   canvas 2d. Reads core state, never writes it.
src/ui/       Vue 3. Reads a snapshot, emits commands.
src/data/     persistence. Ports + adapters, async from the first line.
src/dev/      map editor and balance harness. Not shipped in production builds.
```

**Dependency direction is one-way: `ui → core`, `render → core`, `core → nothing`.** `core/` may
not import `vue`, may not touch the DOM, and may not import from `render/`, `ui/`, `data/` or
`dev/`. ESLint enforces this in `game/eslint.config.js`; if a rule there needs an
`eslint-disable`, the design drifted — fix the design.

Two corollaries that are easy to get wrong:

- **`ui/` reaches persistence only through `ui/composables/`** — never a port, never an adapter,
  never `localStorage` directly (ARCHITECTURE.md §8).
- **Vue reactivity never touches simulation state.** The renderer reads raw world state at 60Hz
  with no reactivity; the UI reads a hand-built snapshot published into a `shallowRef` at ~15Hz and
  replaced wholesale. Wrapping the world in `ref()` will destroy the frame budget (ARCHITECTURE.md §5).

## Determinism rules

`(seed, mapId, nightId, commandLog)` must fully reproduce any session. This is what makes the
balance harness and bug reports work, and it is non-negotiable.

- **All randomness goes through `world.rng`.** No `Math.random()` in `core/`.
- **No wall-clock time in `core/`.** No `Date.now()`, no `performance.now()`, no `new Date()`.
  Time is `world.tick`, an integer.
- **Durations are tick counts, never milliseconds.** `TICK = 1/60`.
- **Speed multipliers run more ticks per frame. They never scale `dt`.** Scaling `dt` would change
  projectile travel, status durations and crumb rot timing, so the game would be balanced
  differently at each speed.
- **Player input enters only as commands**, drained at a tick boundary. Never mutate world state
  from a Vue handler or a canvas click listener — enqueue a command.

## Content is data, not classes

Adding a tower or an enemy means adding a **config object**, not a class. A tower composes
behaviours from a fixed vocabulary (`attack`, `coneAttack`, `aura`, `income`, `collect`, `charge`,
`barricade`, `bait`, `suppress`, `pushback`, `tileEffect`, `reveal`). If a new Tier 0–2 tower needs
a new class or a change to a system file, the composition is wrong — fix the vocabulary, not the
entry. All content is zod-validated at boot in dev, so a typo fails loudly at startup instead of
dealing zero damage on night 11.

## Testing

Vitest over `core/` only. Renderer bugs are visible; testing them is not worth it. Tests are
assertions about things that silently drift — the damage matrix being a product and not an average,
a duration measured in frames instead of ticks — not "test that DoT works".

---

## Code style

Carried over from the AntiProcrastinationApp frontend so both repos read the same way.

- **`function name() {}` declarations, never `const name = () => {}`** for anything named. ESLint
  enforces this (`func-style`).
- **Strict equality** `===` / `!==` everywhere, in script and template. `== null` is allowed for the
  null/undefined check (`eqeqeq: smart`).
- **Import by the `@/` alias, never a relative path across directories.** `@` → `game/src`.
  Import paths carry the `.ts` extension.
- **Prettier owns formatting** (tabs, width 4, no semicolons, single quotes, print width 120,
  one attribute per line). Config lives in `game/package.json`. Do not hand-format.
- `strict: true` plus `noUncheckedIndexedAccess` — the simulation indexes tile grids and entity
  arrays constantly, and that flag is what forces those lookups to be narrowed.

### Vue

- `<script setup lang="ts">`, block order `template` → `script` → `style`.
- **PascalCase** component names in templates and filenames; **camelCase** props and events in both
  TS and templates (`hideDetails`, not `hide-details`).
- Props via destructure defaults, never `withDefaults()`:
  `const { foo, bar = 42 } = defineProps<{ foo: string; bar?: number }>()`.
- Emits: `const emit = defineEmits<{ change: [id: number] }>()`.
- Two-way binding: always `defineModel()`.
- `ref` by default; `reactive` only where it is genuinely conventional.
- Boolean attribute shorthand: `loading`, not `:loading="true"`.
- Split larger components into smaller ones.

---

## Libraries, and where each one is allowed

Every entry below is enforced by `game/eslint.config.js`. The rule is the reason the library is
affordable — a library that leaks out of its lane costs what it was chosen to avoid.

| Library | Lives in | Rule |
| --- | --- | --- |
| `vue-router` | `src/router.ts` | Hash history (static deploy, no server rewrites). Dev-only routes register inside an `import.meta.env.DEV` branch so they tree-shake out. |
| `pinia` | `src/ui/stores/` | Metagame, session and settings state only. See *What goes in a store*. |
| `vue-i18n` | `src/i18n.ts`, resolved in `ui/` | `core/` stores keys, never strings. See *Strings*. |
| `axios` | `src/data/adapters/http/` | Nothing else may import it. Everything reaches HTTP through a port. |
| `@vueuse/core` | `ui/` | Not `useStorage`/`useLocalStorage` (ports own saves), not `useRafFn` (`loop.ts` owns the single rAF). |
| FontAwesome | `src/ui/icons.ts` | Per-icon imports, never `library.add(fas)` — that ships the whole set and defeats tree-shaking. HUD chrome only; entities are emoji. |
| `zod` | `core/content/`, `data/` | Content validated at boot in dev; every save record validated on read. |

### What goes in a store

Pinia holds state that outlives a component and is read from several screens: settings, unlocked
towers, owned installations, loadouts, current difficulty, session. It never holds:

- **the world, or any part of it.** Deep reactivity over hundreds of entities mutated 60 times a
  second destroys the frame budget, and the world has to stay plain and serialisable for replays
  and the balance harness. This is what `TECH-EVALUATION.md` §6 rejected, and it still stands.
- **the HUD snapshot.** That is a plain `shallowRef` replaced wholesale at ~15Hz. In a store,
  someone will eventually `storeToRefs` it into deep reactivity.
- **its own persistence.** No persist plugin: a store calls a composable, the composable calls a
  port. Two save systems is the failure mode being avoided.

### Strings

No user-facing literal anywhere. `core/content/` carries keys (`nameKey: 'tower.saltShaker.name'`)
and `ui/` resolves them — `core/` imports nothing, so it cannot translate, and retrofitting forty
towers and thirty enemies later is the expensive version of this decision. EN is both primary and
fallback; `src/ui/locales/en.ts` is the only catalogue today. Adding a locale is one file plus one
line in `src/ui/locales/index.ts`, typed against `Messages` so a missing key fails the build
instead of rendering a raw key.

### Still deliberately absent

| Not used | Why | Reference |
| --- | --- | --- |
| Vuetify / any component library | Material Design fights the 2am kitchen art direction, and the HUD is a thin overlay over a canvas. A handful of hand-rolled components on CSS variables is less code than the theme overrides would be. | TECH-EVALUATION.md §4 |
| A game engine (Phaser, Pixi) | An engine pulls game logic into itself, which kills the headless balance harness. | TECH-EVALUATION.md §2 |
| An ECS | ~500 entities. Plain objects in arrays plus systems, which stays legible. | TECH-EVALUATION.md §6 |
| Pathfinding of any kind | The track is fixed and authored. An enemy is `{ pathId, distance }`. | DECISIONS.md §3 |
