# Decision Log

Every fork that was explicitly put to a choice, what was chosen, and **what was rejected**. The rejected column is the point of this file — it stops a future session re-proposing an option that was already weighed and turned down.

Decisions are recorded in the order they were made. Where a decision was later revised, the revision is noted inline.

---

## Round 1 — Technology

### D1 · Rendering + UI stack
**Chosen: Canvas 2D board + Vue 3 HUD + pure TypeScript core sim.**

| Rejected | Why |
|---|---|
| PixiJS 8 board + Vue HUD | Was the recommendation. Rejected because the emoji-sprite decision reduces rendering to blitting cached bitmaps, which Canvas 2D does fine. Kept as a one-file swap if entity counts demand it — likely Act III, not v1. |
| Phaser 3 all-in-one | Couples game logic to the engine, kills the headless balance harness, supplies physics a TD doesn't need, painful for shop/upgrade UI |
| Pixi + React HUD | Equivalent technically; Vue matches existing habits |

Full reasoning in [TECH-EVALUATION.md](TECH-EVALUATION.md).

### D2 · Platform and input
**Chosen: desktop web, mouse + keyboard only.**

Rejected: desktop + responsive touch (costs UI discipline throughout, deferred rather than refused); mobile-first (would force a small grid, huge buttons, and a meaningfully simpler tower roster).

**Implication:** hover tooltips, right-click, dense panels, and a 24×14 grid are all fair game.

### D3 · Plan scope
**Chosen: full v1 — Acts I & II, nights 1–18, plus the noise meter and the food-theft system.**

Rejected: prototype only (architecture decisions would get made ad hoc); Act I vertical slice only; everything through Act IV (later steps would be speculative and rewritten after playtesting).

Acts III & IV preserved in [ROADMAP-POST-V1.md](ROADMAP-POST-V1.md) with architectural hooks in v1 but no implementation steps.

### D4 · Art direction
**Chosen: emoji as actual game sprites.**

Rejected: colored rectangles (unreadable at a dozen tower types); pixel art from the start (art becomes a blocker on every new tower); AI-generated sprite sheets (style drift, animation frames unsolved).

---

## Round 2 — Core mechanics

### D5 · Path model
**Chosen: fixed track, BTD-style. Multiple spawn points on later maps.**

| Rejected | Why |
|---|---|
| Full mazing (Desktop TD) | Hardest to balance, levels feel samey because the player authors them, one optimal maze gets solved and shared |
| Semi-open with bendable routes | Was the recommendation before the BTD preference was stated |
| Multi-lane with junctions | Middle ground; superseded by "fixed with multiple spawn points" |

**Consequences:** all pathfinding deleted from the project. Three towers redesigned (Cardboard Box → on-track barricade; Mint Pot → pushback; ant pheromone memory → lane memory). Multi-spawn maps must merge into a shared final stretch. See [DECISIONS.md](DECISIONS.md) §3.

### D6 · Crumb collection
**Chosen: a mix — physical crumbs on the board, click to collect instantly, *and* some towers collect within a radius while most don't.**

Rejected: auto-credit on kill (destroys the "a dirty kitchen is a rich kitchen" hook entirely); click-only (frantic, punishes looking at the shop); collector-units-only (gates all income behind one tower category).

**Added on top:** crumbs merge within 0.7 tiles; rot at 20s; hatch a Fruit Fly at 35s. See [DECISIONS.md](DECISIONS.md) §4.

### D7 · What persists between nights
**Chosen: installations persist, towers don't.**

Rejected: everything persists with repair (decay spiral after a bad night, and an empty mid-game once the board is solved); nothing persists but unlocks (the "cleaning and fortifying" metagame becomes pure numbers); towers persist but need re-arming each night.

### D8 · Food permanence
**Chosen: resets nightly — food is lives — with the sting coming from named, specific items.**

Rejected: persistent stock with grocery runs (real spiral risk, needs a catch-up mechanic); partial carryover; persistent with per-item mechanical effects (richest, most authoring, deferred).

**The instruction this creates:** never reduce the night-end loss line to a number. `"Lost: one slice of pizza, half a lemon, the good cheese."`

---

## Round 3 — Structure

### D9 · Night structure
**Chosen: waves as hours on a 2am→6am clock, player-triggered, with a crumb bonus for calling early.**

Rejected: auto-advancing waves (removes the early-call skill expression); a continuous clock with no discrete waves (no build-phase breathing room, much harder to balance and author); pure waves with no clock (drops the fiction's spine).

The clock is a **derived display value**, not an independent timer.

### D10 · Metagame currency
**Chosen: Grocery Money 💵, a separate currency earned from performance. Crumbs never convert.**

Rejected: leftover crumbs carry over (under-building to bank crumbs becomes optimal, which fights the entire design); both with a poor conversion rate; no currency at all.

**Side benefit that justified it:** it makes cleanliness a *scored stat*, reinforcing the crumb hook at the metagame layer.

### D11 · Run structure
**Chosen: linear campaign + difficulty tiers + endless mode.**

Rejected: campaign only; campaign + endless without tiers; roguelite runs (would invalidate the persistent-kitchen metagame chosen in D7, and is a different game to balance).

Difficulty tiers are **global scalars only** — no bespoke content per tier.

### D12 · Noise meter
**Chosen: live from night 1, escalating stakes, with installation counterplay.**

*(Note: an initial answer of "live from night 1, harsh" was a misclick and was re-asked. The harsh variant — waking a human ends the night as a loss — is explicitly rejected.)*

| Rejected | Why |
|---|---|
| Harsh (wake = instant loss) | One mistimed Blender erases eight minutes; pushes loud Act IV towers toward unusable |
| Soft (income loss + brief stun only) | Loud towers become free power; the meter stops being a real cost |
| Unlocks in Act II | Better onboarding, but Act I noise values become inert data and Mousetrap/Toaster need rebalancing |

**Chosen consequence:** enemies flee (you keep the night), all uncollected crumbs forfeited, current wave's unbanked income forfeited, every tower takes 20% of max HP.

---

## Round 4 — Production

### D13 · Map count
**Chosen: 6 maps × night modifiers, each map replayed ~3 times across 18 nights.**

Rejected: 18 distinct maps (~18× the authoring); 3 maps with heavy modifiers (visual monotony over an 18-night campaign); 10 maps with light modifiers.

**Side benefit:** night modifiers become a reusable content lever forever.

### D14 · Map authoring
**Chosen: an in-app dev-only editor, built early at step 4.**

Rejected: hand-written JSON; JSON plus a live overlay preview; image-based authoring with colour-coded pixels.

### D15 · Board art treatment
**Chosen: flat illustrated tiles now, with a dedicated art pass at step 23.**

Rejected: committing to flat tiles permanently; AI-generated top-down kitchen backgrounds (rendered art clashes tonally with flat emoji, and the track must line up with a picture you didn't draw); near-abstract minimal.

### D16 · Plan granularity
**Chosen: ~20 medium steps plus a standing context file.**

Rejected: ~10 large steps (a single step can drift, mistakes cost a lot to unwind); ~35 small steps (context re-establishment overhead); medium steps without a standing context file.

**Result:** 23 steps, and step 1 writes `CLAUDE.md` plus the reference docs into the repo so every later prompt inherits conventions without restating them.

---

## Round 5 — Process

### D17 · When to write step prompts for Acts III & IV
**Chosen: not yet. Write each drop's steps immediately before building it, from a session that can read the actual codebase.**

Rejected: writing steps 24+ now, alongside steps 1–23.

Reasoning:
- It's the same speculation D3 already rejected. Steps written now would be authored against a codebase that doesn't exist.
- Step 22's balance harness rewrites `CONTENT.md`'s numbers. Every Act III cost is priced against Salt Shaker = 50 crumbs / 5 damage / 1.0 per sec; if that baseline moves, everything downstream moves with it.
- Step prompts reference real files and real abstractions. An adjacency-buff prompt wants to say "add to the existing eleven behaviours in `core/content/behaviours.ts`" — written today it can only gesture at a vocabulary that may not survive steps 6, 9 and 12 intact.
- Playtesting 18 nights will reorder the drops. The drop order in `ROADMAP-POST-V1.md` is a guess made before anyone played the game.

**What is durable and is already saved:** stats, engineering-tier dependencies, which v1 system each entry builds on, and the suggested drop order — all in [ROADMAP-POST-V1.md](ROADMAP-POST-V1.md). **What ages badly:** the step prompts themselves.

Format conventions for writing them later are in [steps/CONVENTIONS.md](../steps/CONVENTIONS.md).

### D18 · Loadouts — a fixed number of towers per night
**Chosen: in v1, as a v1 feature. Base 5 slots, max 8 via three installations. Added at step 20a.**

Rejected: adding it post-v1.

Reasoning:
- **Cheap as a system, expensive as a retrofit** — the same dependency shape as tile state and tower HP. Filtering the shop by a `TowerId[]` is trivial; but authoring and balancing all 18 nights in steps 21–22 assuming full tower access and *then* adding loadouts invalidates every one of those balance passes. Night difficulty depends entirely on whether a counter is guaranteed available or has to be anticipated.
- It fits the existing metagame fiction exactly: the loadout is **what you set out on the counter before you go to bed**, chosen on the Kitchen screen alongside installations, with slot count bought using Grocery Money like every other home improvement.
- It makes two already-planned features load-bearing instead of decorative — the next-night preview (step 20) and the codex (step 23).
- It creates a genuine metagame tension that didn't previously exist: spending Grocery Money on **breadth** (slots) versus **depth** (Better Tupperware, noise cap, Bigger Fridge).

**The balance constraint it imposes**, which step 21 must respect and step 22 must verify: every night has to be winnable by more than one loadout. A night with exactly one valid answer is a lockout, not a puzzle.

**To reverse this**, delete `DECISIONS.md` §10, `../steps/20a-loadouts.md`, the three counter-space installations from `CONTENT.md` §8, and this entry. Nothing else depends on it.

### D19 · Persistence behind ports and composables; backend deferred
**Chosen: all persistence goes through async ports with swappable adapters, surfaced to the UI only as composables. v1 ships localStorage + a deliberately-unreliable mock remote. A .NET 10 backend with real accounts arrives later as one more adapter.**

Rejected: calling `localStorage` directly from components and abstracting later (the common failure mode — twenty synchronous call sites with no error handling, where adding a backend means rewriting the UI layer); building the backend before the game is playable.

**Build order is explicit: playable game first, infrastructure second.**

The three decisions that make the later swap free, all of which are unfixable-in-place if skipped:
1. **Every port method is `async` from the first line of code**, even though localStorage resolves instantly. Otherwise every call site needs touching later.
2. **The mock remote injects latency and failures** (200–600ms, 5%). A mock that always succeeds instantly teaches the UI bad habits and hides exactly the work being deferred.
3. **Everything is scoped by `userId`** — locally an anonymous `local-<uuid>` — and every record carries `updatedAt` + `revision`. Unused in v1; they make sync an adapter change rather than a data migration.

Full design in [PERSISTENCE.md](PERSISTENCE.md). Built at step 20. Cost: about half a day.

**Unexpected payoff:** determinism (step 1) plus the balance harness (step 22) means leaderboard submissions can be **server-validated by headless replay** of `(seed, mapId, nightId, difficulty, loadout, commandLog)` — the verification service is essentially the harness with a different entry point.

### D20 · One monorepo, docs at the root
**Chosen: a single repository — reference docs at the root, `game/` for the frontend, `api/` for the .NET 10 backend when it arrives.**

```
kitchen-defense/
  README.md  DECISIONS.md  ARCHITECTURE.md  ...  steps/
  game/          ← Vite + Vue + TS
  api/           ← .NET 10, later
```

| Rejected | Why |
|---|---|
| **Separate docs repo** (three repos) | Every step prompt references docs by relative path, and an agent session working in the frontend needs to *read* them — a second checkout for routine work. Worse, docs drift: updating them becomes a separate commit in a separate place, which defeats the entire point of them being the source of truth. |
| **Separate frontend and backend repos** | The backend doesn't exist and won't for months — speculative structure. The one thing that genuinely spans the boundary is the DTO contract, and a wire-shape change should be **one commit** touching the TS adapter and the C# controller together, not two repos drifting with no compiler to catch it. The usual argument for splitting (independent deploys, separate CI) is solved by path-filtered workflows, and is a team problem that doesn't exist here. |

**Docs sit at the root, not in `docs/`,** because they're the artifact shared by both projects and by every step prompt. All paths in `ARCHITECTURE.md` §1 are relative to `game/`.

**Cost of this decision: one line in step 1.** It is also cheaply reversible in either direction — splitting later is a `git filter-repo`, merging later is a subtree add. Low stakes, which is itself an argument for the lower-friction option now.

---

## Decisions made without asking

Judgement calls taken directly, flagged at the time. Any of them can be reversed cheaply.

| Decision | Reasoning |
|---|---|
| **Fruit flies exist from night 1** as a rot consequence, becoming a scheduled wave enemy at night 20 | The crumb-rot system generates them from the start regardless; embracing it teaches the crumb hook by punishing it immediately |
| **The Mouse moves from night 42 to night 14** as the Act II mini-boss | v1 ships the theft system but the original roster's earliest thief was far outside v1; the system needs something to demonstrate it. The brief itself calls the Mouse a mini-boss. |
| **Towers carry `maxHp` from day 1** | Only the Cardboard Box and the noise penalty use it in v1; wasps, termites and carpet beetles arrive in Act III and retrofitting it then is the same class of pain the brief warned about for tile state |
| **Tile state ships in v1** (step 14) | The brief explicitly flagged this dependency and was right |
| **Pushback ships in v1** (step 18, for the Fan) | Mint Pot's redesign made it a Tier-1 system; building it now means Mint Pot arrives post-v1 as pure config |
| **Gas Stove Burner swapped to night 12, Fly Paper to night 14** | The 6-map rotation puts nights 10–12 on the Stove; the burner should unlock there. Purely thematic — revert with a one-line edit to the `CONTENT.md` §6 table if you prefer the original order. |
| **Armor Strip expressed as moving the `armored` multiplier halfway toward 1.0** (0.4 → 0.7 physical) | Keeps it meaningful without introducing a second armor number alongside the tag matrix |
| **`FIRST`/`LAST` targeting compares remaining distance to the fridge**, not raw path distance | On multi-path maps, raw distance makes towers prefer whichever lane is longer |
| **Moth light-attraction implemented as a lateral offset from the sampled path point**, not free movement | Keeps every distance-based system (targeting, barricades, pushback, theft) working unchanged. Same technique reused for the Honey Pot's bait. |
| **Grocery Money awarded at 40% on a lost night** | Anti-frustration valve; a hard night is never a total waste |
