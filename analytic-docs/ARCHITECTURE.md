# Architecture

The one rule everything else follows from: **the simulation knows nothing about the browser.**

---

## 1. Layers

This is a **monorepo**: reference docs at the root, `game/` for the frontend, `api/` for the .NET 10 backend when it arrives. **Every path below is relative to `game/`.**

```
src/
  core/                 pure TypeScript. no DOM, no canvas, no Date.now(), no Math.random()
    rng.ts              mulberry32, seeded
    types.ts            entity + world types
    world.ts            state container + factory
    commands.ts         player intents (PlaceTower, SellTower, CollectCrumb, CallWave, ...)
    sim.ts              tick(world, commands): applies one fixed step
    systems/            spawn, movement, targeting, combat, status, tiles, crumbs,
                        noise, economy, theft, resolve
    content/
      towers.ts         data + behaviour composition
      enemies.ts        data
      matrix.ts         damage type x tag multipliers
      statuses.ts       effect definitions
      installations.ts  metagame purchases
      nights.ts         wave schedules per night
      maps/*.json       authored maps
      schema.ts         zod schemas for all of the above

  render/               canvas 2d. reads core state, never writes it
    glyphCache.ts       emoji -> offscreen canvas, keyed by glyph+size+dpr
    renderer.ts         frame entry point
    layers/             terrain, track, crumbs, entities, towers, effects, overlay

  ui/                   vue 3. reads a snapshot, emits commands
    App.vue
    components/
    composables/        useAuth, useProfile, useProgress, useSettings, useSync
    viewModel.ts        builds the HUD snapshot from world state

  data/                 persistence. async, adapter-agnostic. see PERSISTENCE.md
    ports/              interfaces: AuthProvider, ProfileStore, ProgressStore, ...
    adapters/           localStorage (now) · mockRemote (now) · http (later, .NET 10)
    dto/                versioned wire shapes + mappers
    index.ts            adapter selection, one switch

  dev/                  not shipped in prod builds
    editor/             map editor route
    harness/            headless balance runner

tests/
docs/
```

**Dependency direction is strictly one-way:** `ui → core`, `render → core`, and `core → nothing`. A single `import` of anything DOM-related inside `core/` breaks step 22 and should fail lint.

---

## 2. The loop

Fixed timestep, 60Hz. `TICK = 1/60`.

```ts
function frame(now: number) {
  accumulator += Math.min(now - last, 250);      // clamp so a tabbed-out
  last = now;                                     // window doesn't spiral
  let steps = 0;
  while (accumulator >= TICK_MS && steps < MAX_CATCHUP) {
    for (let i = 0; i < speedMultiplier; i++) sim.tick(world, commandQueue.drain());
    accumulator -= TICK_MS;
    steps++;
  }
  renderer.draw(world);
  if (frameCount % 4 === 0) viewModel.publish(world);   // ~15Hz for the HUD
  requestAnimationFrame(frame);
}
```

**Speed controls run more ticks. They never scale `dt`.** A 3× speed implemented as `dt * 3` would change projectile travel, status durations, and the crumb rot timer — the game would be balanced differently at each speed, and the balance harness would measure something the player never experiences.

---

## 3. Determinism

Non-negotiable, because it's what makes the balance harness and bug reproduction work.

- **All randomness goes through `world.rng`.** Add an ESLint rule banning `Math.random` outside `dev/`.
- **No wall-clock time in `core/`.** Time is `world.tick`, an integer. Durations are tick counts, not milliseconds.
- **Player input enters only as commands**, drained at a tick boundary. Never mutate world state from a Vue handler or a canvas click listener — enqueue a command.
- Consequence: `(seed, mapId, nightId, commandLog)` fully reproduces any session. Save that tuple on any crash. Replays and (later) leaderboard validation come free.

---

## 4. Content is data, not classes

Nineteen towers and eleven enemies in v1, roughly forty and thirty by Act IV. That is not forty classes. A tower is a config object composed from a small set of reusable behaviours:

```ts
{
  id: 'salt_shaker',
  glyph: '🧂',
  role: 'BASIC_DPS',
  cost: 50,
  maxHp: 100,
  placement: 'off_path',
  collectRadius: 0,
  noise: 0,
  behaviours: [
    attack({ damage: 5, rate: 1.0, range: 3, damageType: 'physical', targets: 'ground' }),
  ],
  upgrades: [ /* three tiers */ ],
}
```

Behaviours needed across v1: `attack`, `coneAttack`, `aura`, `income`, `collect`, `charge` (rearm), `barricade`, `bait`, `suppress`, `pushback`, `tileEffect`, `reveal`. That is the whole vocabulary. **If a new Tier 0–2 tower requires a new class, the composition is wrong** — fix the vocabulary, not the entry.

Everything is zod-validated at boot in dev, so a typo'd tower fails loudly at startup instead of silently dealing zero damage on night 11.

Damage resolution is a pure function:

```ts
finalDamage = base
  * product(matrix[tag][damageType] for tag of enemy.tags)   // tags multiply
  * statusModifiers(enemy)
```

Armor Strip is expressed as *moving the `armored` multiplier halfway toward 1.0* (physical vs armored: 0.4 → 0.7), which keeps it meaningful without introducing a second armor number.

---

## 5. Vue and reactivity — the one real trap

Never let Vue reactivity touch simulation state. Deep proxies over hundreds of entities mutated 60 times a second will destroy the frame budget.

The contract:

- The **renderer reads raw world state directly**, every frame, 60Hz. No reactivity involved.
- The **UI reads a hand-built snapshot**, published into a `shallowRef` roughly 15 times a second and replaced wholesale. It contains only what the HUD displays: clock, crumbs, grocery money, food remaining, noise level, wave state, selected-tower stats, shop affordability flags. It is a few dozen numbers, not an entity list.
- The UI's only write path is enqueueing commands.

The one exception is the selected tower's live stats, which look sluggish at 15Hz — publish those on change instead.

---

## 6. Performance budget

Worst realistic frame in v1: ~200 enemies, ~40 towers, ~120 projectiles, ~60 crumb piles, ~300 tile-state cells, ~150 particles.

- **Targeting** is naive O(towers × enemies) at first — 8k checks per tick is fine. Add a uniform-grid spatial hash (~40 lines) when profiling says so, not before.
- **Terrain and track never change during a night** — draw them once to an offscreen canvas at load and blit that layer.
- **Glyph blitting** is `drawImage` from the cache, never `fillText`.
- Round positions to whole device pixels when blitting; sub-pixel emoji looks blurry and costs more.
- Object-pool projectiles and particles. Do not pool enemies or towers; the churn is low and the bugs aren't worth it.

---

## 7. Testing

- **Vitest over `core/`.** Every system gets tests; the damage matrix, status stacking rules, crumb merge/rot, and the noise meter especially. These are the things that silently drift.
- **Scenario tests**: build a world from a fixture, run N ticks, assert. Deterministic, so they're stable.
- **No tests over `render/`.** Not worth it. Bugs there are visible.
- **The balance harness (step 22) is the real integration test** — it plays whole nights headless and will catch anything structurally broken long before a unit test would.

---

## 8. Saves and persistence

**Full design in [PERSISTENCE.md](PERSISTENCE.md).** The short version, because it constrains code you'll write long before the backend exists:

- All persistence goes through **ports** (interfaces) with swappable **adapters**. v1 ships a localStorage adapter and a deliberately-unreliable mock remote; a .NET 10 backend arrives later as one more adapter.
- **UI code imports only from `ui/composables/`** — never an adapter, never a port, never `localStorage` directly. Enforce with `no-restricted-imports`, the same way `core/` purity is enforced.
- **Every port method is `async` from the first line of code**, even though localStorage resolves instantly. This is the decision that makes the later swap free; getting it wrong means touching every call site.
- Every record is scoped by `userId` (locally a generated anonymous id) and carries `updatedAt` and `revision`. Nothing uses them in v1 — they exist so sync becomes an adapter change rather than a data migration.
- Records are zod-validated on read with an explicit `version` and a migration chain. A record failing validation is preserved under a `:corrupt:` key, never discarded.
- Contents: unlocked towers, owned installations, per-night results, loadouts, current difficulty, settings.

`core/` sits entirely outside this. **The simulation never touches persistence** — it produces and consumes plain serialisable data, and the world never `await`s anything. Persistence happens at boundaries only: night start, night end, purchase, settings change.

The save must never contain live world state. Nights are not resumable mid-play; that's a deliberate scope decision.
