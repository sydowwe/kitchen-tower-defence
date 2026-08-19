# Technology Evaluation — what was considered and rejected

The reasoning behind [ARCHITECTURE.md](ARCHITECTURE.md). Read this before proposing a stack change; most obvious alternatives were already weighed and rejected for reasons that still hold.

---

## 1. The decision that mattered most

Not the library — **splitting the simulation from the renderer**. Everything else follows from it.

Four reasons, in order of how much they're worth:

1. **The balance spec becomes executable.** The brief's own instruction is that crumbs-per-wave versus tower-cost is the one number that can't be fixed later. With a DOM-free sim you can play 500 nights headless at thousands of times real speed with a scripted player and dump a CSV. This is impossible if the sim touches a canvas. It's the single highest-leverage decision in the project and it's architectural, not a feature.
2. **Every mechanic becomes a unit test.** "A snail is armored + slime, so physical hits for 0.4× and electric for 1.8×" is a three-line test rather than something you squint at on screen.
3. **Bugs reproduce from `(seed + command log)`.** Worth a great deal when an agent is generating systems you didn't hand-write.
4. Replays, pause/speed control, and later leaderboard validation all fall out for free.

---

## 2. Renderer

**Chosen: hand-rolled Canvas 2D.**

| Option | Ceiling | Verdict |
|---|---|---|
| **Canvas 2D** | ~1–2k sprites at 60fps; per-sprite state changes hurt | **Chosen.** Zero dependencies, total control. The emoji decision (below) means we're blitting cached bitmaps, which is the fast path anyway. |
| **PixiJS 8** | 10k+ sprites, WebGL/WebGPU batching, atlases, filters, particle containers, ~120KB gz | Rejected as unnecessary given cached-bitmap emoji rendering. Was the original recommendation; the emoji choice removed most of its advantage. |
| **Phaser 3** | Full framework: scenes, input, tweens, audio, arcade physics, cameras | **Rejected.** Its value is concentrated in parts a TD doesn't need — a tower defence uses zero physics. Worse, its Scene/GameObject inheritance model pulls game logic *into the engine*, which would kill the headless harness. Building a 40-tower shop with stat tooltips inside Phaser is miserable. |
| **Excalibur.ts** | TS-native, decent design | **Rejected.** Much smaller corpus, so AI-assisted output quality drops noticeably. A real consideration for how this project is being built. |

**The escape hatch:** because the sim/render split is real, swapping Canvas 2D for Pixi is a one-file change behind the renderer interface. Do it if the entity count ever demands it — the likely trigger is Act III's particle load, not v1.

**Worst realistic v1 frame:** ~200 enemies, ~40 towers, ~120 projectiles, ~60 crumb piles, ~300 tile-state cells, ~150 particles. Canvas 2D handles this. Where it would die is full-board tile effects plus heavy particles — which is exactly the Act III/IV load.

---

## 3. Emoji sprites

**Chosen** over programmer rectangles, hand-drawn pixel art, and AI-generated sprite sheets.

Rectangles are unreadable once a dozen tower types are on screen. Pixel art makes art a blocker on every new tower and enemy. AI-generated sheets drift in style and don't solve animation frames. Emoji are instantly readable, thematically perfect for a kitchen, cost nothing, and are honestly shippable as a style.

Two non-obvious requirements this creates:

- **Pre-render every glyph.** `ctx.fillText` per entity per frame is the slow path — text shaping and colour-font rasterisation on every draw. Rasterise once into an offscreen canvas keyed by `emoji|size|dpr`, then `drawImage`. This is what makes Canvas 2D sufficient.
- **Bundle the font.** Segoe UI Emoji (Windows) and Apple Color Emoji render the same codepoint differently enough to change which insect the player thinks they're looking at. Subset Noto Color Emoji to the ~80 glyphs used (~200KB) and ship it, so glyphs can be chosen by how they render in exactly one font.

---

## 4. UI framework

**Chosen: Vue 3, DOM/CSS, overlaid on the canvas.**

A tower defence is 60% menus — a 40-tower shop, stat tooltips, the damage matrix, three upgrade tiers each, night summaries, and the home-improvement metagame. HTML/CSS does this in a tenth of the code, with text layout, scrolling and focus handling for free. React was equally viable; Vue was chosen because it matches existing habits.

**Building the UI inside the canvas was rejected outright** — it's the single most expensive way to build a tower defence.

**The trap this creates**, and the reason `ARCHITECTURE.md` §5 exists: Vue reactivity must never touch simulation state. Deep proxies over hundreds of entities mutated 60 times a second will destroy the frame budget. The contract is that the renderer reads raw world state at 60Hz with no reactivity, and the UI reads a hand-built snapshot published into a `shallowRef` at ~15Hz.

---

## 5. Pathfinding — deleted entirely

Originally planned as **flow fields** (one Dijkstra integration field per goal, recomputed on board change, each enemy reading the vector under its feet) rather than per-enemy A*, chosen to handle 150 ants plus dynamic repathing from walls and repellents.

**The fixed-path decision deleted this whole system.** No A*, no flow fields, no repath-on-place, no "is the maze fully blocked" validation, no spatial navigation of any kind. An enemy is `{ pathId, distance }` and its position is `samplePath(distance)`.

This was the largest single reduction in scope in the project. Three towers needed redesign as a result — see [DECISIONS.md](DECISIONS.md) §3.

---

## 6. Entity architecture

**Chosen: plain objects in arrays, plus systems.**

A full ECS (`bitecs`) was considered and rejected — at ~500 entities the performance argument doesn't apply, and it costs legibility, which matters more here than microseconds. `Miniplex` (lighter, TS-friendly) was also rejected for the same reason.

State libraries (Pinia, Zustand) were rejected: the world *is* the state, and it must stay plain and serialisable. A hand-built view model is the only bridge to the UI.

---

## 7. Map authoring

**Chosen: an in-app editor, built early (step 4).**

Alternatives considered: hand-written JSON (tedious, blind coordinate editing, every track adjustment is a reload); JSON plus a live debug overlay (cheaper, gets most of the feedback but no direct manipulation); image-based authoring where pixel colours encode tile flags (fast to paint, but track *ordering* still has to come from somewhere else).

The editor costs about half a day and pays for itself by the third map. Step 21 authors five maps in one sitting because of it. Its `Playtest` button — launching the in-memory map into the real game without saving — is the feature that actually justifies it.

---

## 8. Everything else

| Concern | Choice | Note |
|---|---|---|
| Build | Vite | |
| Tests | Vitest over `core/` only | Renderer bugs are visible; testing them isn't worth it |
| Validation | Zod | All content and save data, validated at boot in dev |
| RNG | mulberry32, seeded | Serialisable state, `fork()` for independent streams |
| Audio | Howler or raw WebAudio | The noise meter is a *sound* mechanic; this matters more than it looks |
| Saves | localStorage, versioned, zod-validated, migration chain | Never contains live world state |
| Platform | Desktop web, mouse + keyboard | Touch rejected for v1 — it would force a smaller grid and simplified panels, cutting the tower roster's complexity |
| Deploy | Static → itch.io / GitHub Pages | No backend anywhere in v1 |

**Sim rate: 60Hz fixed.** Speed multipliers run *more ticks per frame*, never a larger `dt`. Scaling `dt` would change projectile travel, status durations and crumb rot timing — the game would be balanced differently at each speed and the harness would measure something the player never experiences.

**Grid: 24 × 14 tiles at 48px = 1152 × 672 logical**, CSS-scaled to the window, dpr-aware backing store.
