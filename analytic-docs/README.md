# Kitchen Defense — Build Plan

**The pitch.** It's 2am. The humans are asleep. The objects on the counter defend the fridge until sunrise. You place a salt shaker, a mousetrap, and a lit candle; ants, roaches and flies come in from the baseboard crack, and every leak walks off with a specific item of food. Kill things and they leave crumbs — crumbs are your money, but crumbs left lying around attract more bugs. Powerful towers are loud, and if the noise meter fills, someone wakes up and turns on the light.

Cozy-but-tense, dry humour, no googly eyes. The objects just quietly do their jobs.

---

## Repository layout

A monorepo. Docs live at the root because they're shared by both projects and referenced by every step prompt.

```
kitchen-defense/
  *.md  steps/     ← the plan. source of truth. shared.
  game/            ← Vite + Vue 3 + TypeScript. created at step 1.
  api/             ← .NET 10 backend. does not exist yet; arrives long after v1.
```

All paths in `ARCHITECTURE.md` are relative to `game/`. Reasoning in [DECISION-LOG.md](DECISION-LOG.md) D20.

## Starting a fresh session?

Everything needed to continue this project from zero context is in this folder. Nothing lives only in a chat history.

**Read in this order:** `DECISIONS.md` → `ARCHITECTURE.md` → the step you're on. That's enough to work. The rest is reference for when you need it.

## How to use this plan

Eight reference documents plus 23 step files. Each step file in `../steps` is a **complete, self-contained prompt** — open it, paste the whole thing into a fresh Claude Code session, done. Steps deliberately do *not* restate the design; each one opens by telling the agent which reference docs to read first, which keeps the prompts short and keeps a single source of truth.

### Core — read these

| Document | What's in it | When to read |
|---|---|---|
| [DECISIONS.md](DECISIONS.md) | Every settled design decision and why. The canonical answer to "how does X work". | Before step 1, and any time a step is ambiguous |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Code layout, the sim/render split, determinism rules, performance budget | Before step 1 |
| [CONTENT.md](CONTENT.md) | All v1 tower/enemy stat tables, damage matrix, status effects, installations, night schedule | Whenever a step adds content |
| [PERSISTENCE.md](PERSISTENCE.md) | Ports/adapters/composables, localStorage now, .NET 10 backend later | Before step 20, and before writing any code that saves anything |
| [steps/](steps/) | 23 executable prompts | One at a time, in order |
| [steps/RUNNING-A-STEP.md](../steps/RUNNING-A-STEP.md) | Pre-flight check before building a step: is it stale, self-contradictory, or too wide for one session — and what to do about each | Every time you pick up a step, before writing code |
| [steps/CONVENTIONS.md](../steps/CONVENTIONS.md) | How a step file is built — its sections, and the rules that make the format work | Only when *writing* a step file: a new one (24+), or the part files of a split. Never when building one |

### Reference — read when relevant

| Document | What's in it | When to read |
|---|---|---|
| [ORIGINAL-BRIEF.md](ORIGINAL-BRIEF.md) | The design brief this started from, preserved unedited. Fiction, tone, the two core hooks, the original build order. | When you need to know *why* something exists, or before writing any game copy |
| [DECISION-LOG.md](DECISION-LOG.md) | Every fork that was put to a choice, what won, and **what was rejected and why** | Before proposing a design change — it was probably already weighed |
| [TECH-EVALUATION.md](TECH-EVALUATION.md) | Stack alternatives considered and rejected, with reasoning | Before proposing a stack change |
| [ROADMAP-POST-V1.md](ROADMAP-POST-V1.md) | Acts III & IV in full — all stats, the engineering-cost tiers, bosses, suggested drop order | After v1 ships, or when checking that a v1 decision doesn't block later content |
| [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) | What's genuinely undecided, what was assumed silently, and the balance/technical risks | Whenever something feels underspecified — check here before inventing an answer |

**Keep these current.** If you change a design decision mid-build, update `DECISIONS.md` and add a row to `DECISION-LOG.md`. If you resolve something in `OPEN-QUESTIONS.md`, move it into `DECISIONS.md` and delete the row. The step prompts reference these files by name, so a stale doc quietly poisons every later prompt.

**Rules for running the steps**

1. **Run them in order.** Each assumes everything before it exists. The order was chosen so that no step forces a refactor of an earlier one.
2. **Stop at each milestone and actually play it.** Milestones exist at steps 8, 13, 19 and 23. Step 8 is the "is this fun at all" checkpoint — if it isn't fun there, nothing later in this plan saves it.
3. **Step 1 writes `CLAUDE.md` and `docs/` into the repo.** Every later step inherits conventions from it without restating them. Don't skip it.
4. **Deviate freely, but update `DECISIONS.md` when you do.** The steps reference it by name; a stale decisions doc will quietly poison later prompts.

---

## Phases and milestones

| Phase | Steps | Ends with |
|---|---|---|
| **0 · Foundation** | 1–4 | Empty board renders, map editor works, nothing moves |
| **1 · Playable loop** | 5–8 | **MILESTONE: playable night 1.** Ants, salt shakers, crumbs, HUD. The fun check. |
| **2 · Act I systems** | 9–13 | **MILESTONE: Act I (nights 1–8).** 9 towers, 5 enemies, statuses, flyers, upgrades, noise meter. |
| **3 · Act II content** | 14–19 | **MILESTONE: Act II (nights 1–18).** 19 towers, 11 enemies, tile state, food theft, the Mouse. |
| **4 · Production** | 20–23 | **MILESTONE: v1 shippable.** Metagame, 6 maps, difficulty tiers, endless, balance harness, polish. |

## Step index

**Phase 0 — Foundation**
1. [Scaffold, conventions, game loop](../steps/01-scaffold.md)
2. [Core data model and content pipeline](../steps/02-core-model.md)
3. [Map format, path sampling, board renderer](../steps/03-map-and-renderer.md)
4. [Map editor (dev route)](../steps/04-map-editor.md)

**Phase 1 — Playable loop**
5. [Waves, spawning, movement, food loss](../steps/05-waves-and-movement.md)
6. [Tower placement, targeting, projectiles, damage](../steps/06-towers-and-combat.md)
7. [Crumb economy](../steps/07-crumbs.md)
8. [Vue HUD v1](../steps/08-hud.md) — **MILESTONE**

**Phase 2 — Act I systems**
9. [Status effects](../steps/09-status-effects.md)
10. [Charge state, tower HP, barricades](../steps/10-charges-and-barricades.md)
11. [Flyers and light attraction](../steps/11-flyers.md)
12. [Upgrades and targeting modes](../steps/12-upgrades.md)
13. [Noise meter](../steps/13-noise.md) — **MILESTONE: Act I**

**Phase 3 — Act II content**
14. [Tile state system](../steps/14-tile-state.md)
15. [Mold and slime](../steps/15-mold-and-slime.md)
16. [Burrowing and armor](../steps/16-burrow-and-armor.md)
17. [Auras and zone towers](../steps/17-auras-and-zones.md)
18. [Pushback](../steps/18-pushback.md)
19. [Food theft and the Mouse](../steps/19-theft.md) — **MILESTONE: Act II**

**Phase 4 — Production**
20. [Night flow, metagame, save/load](../steps/20-metagame.md)
20a. [Loadouts](../steps/20a-loadouts.md)
21. [Maps, night modifiers, difficulty, endless](../steps/21-maps-and-modes.md)
22. [Headless balance harness](../steps/22-balance-harness.md)
23. [Polish pass](../steps/23-polish.md) — **MILESTONE: v1**

---

## Stack, in one block

```
Vite · TypeScript (strict) · Vue 3 (HUD only) · Canvas 2D (board) · Vitest · Zod
```

No game engine, no ECS library, no state library. The simulation is plain TypeScript with zero DOM dependencies — that is the load-bearing decision of this whole plan, because it is what makes step 22 (playing 500 nights headless to tune the income curve) possible. See [ARCHITECTURE.md](ARCHITECTURE.md).
