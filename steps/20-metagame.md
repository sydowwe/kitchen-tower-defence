# Step 20 — Night flow, Grocery Money, installations, save/load

> Paste this entire file as your prompt into a fresh session.

**Read first:** `CLAUDE.md`, `../analytic-docs/DECISIONS.md` §7, `../analytic-docs/CONTENT.md` §8, `../analytic-docs/ARCHITECTURE.md` §8.
**Prereq:** step 19.

## Goal

The frame around the nights. Right now you play a night and it ends; after this, you play a *campaign* — with a reason to have played the last night well, and something to spend it on.

## Build

1. **Grocery Money scoring** (`core/systems/scoring.ts`). Exactly the formula in `../analytic-docs/CONTENT.md` §8, computed from stats already being tracked: items remaining, enemies killed, `crumbsCollected / crumbsDropped`, whether the noise meter ever filled, and total seconds skipped by calling waves early.

   **Crumbs do not convert.** This is deliberate (`../analytic-docs/DECISIONS.md` §7) — if leftovers banked, under-building would be optimal and it would fight the entire design. If it ever feels bad that crumbs evaporate, raise the cleanliness weighting instead.

2. **Night summary screen.** Replace step 8's stub with something worth reading:
   - The Grocery Money breakdown, line by line, so the player learns what's rewarded. Cleanliness as a percentage.
   - Food lost, **listed by name**. `"Lost: one slice of pizza, half a lemon, the good cheese."` This line is the emotional payload of the whole game — write the item names with care and never reduce it to a number.
   - Waves survived, peak noise, wake count.
   - Continue / retry.

3. **The Kitchen screen** — the between-nights hub, and the game's second location. Show the kitchen in daylight, quiet, with your installed improvements visible: the sealed crack, the fixed screen, the broom leaning by the door. Progress you can *see*.
   - All eleven installations from `../analytic-docs/CONTENT.md` §8, each with cost, description, owned state, and a plain-language effect.
   - Grocery Money balance, next night preview (map, new tower unlock, new enemy warning).
   - "Start night N" button.

4. **Installation effects** (`core/modifiers.ts`). Owned installations fold into a single `WorldModifiers` object at night start:
   `noiseCap`, `noiseDecay`, `sweepRadius`, `collectTravelTicks`, `spawnReduction`, `flyerDelayWaves`, `moldSpreadMultiplier`, `stealsReduction`, `foodBonus`, `snackStash`.

   Everything built in steps 7, 13, 15 and 19 already reads these from hooks — this step populates them for real. **If any installation requires editing a system to work, that hook was missed; add it now** rather than special-casing it here.

5. **Unlock progression.** Towers unlock by night per `../analytic-docs/CONTENT.md` §6. The shop shows locked towers greyed with their unlock night, so the player can see what's coming — anticipation is most of the metagame's pull.

6. **Persistence layer** — build it as ports and adapters, not as `localStorage.setItem` calls. **Read [PERSISTENCE.md](../analytic-docs/PERSISTENCE.md) in full before starting this item.** The backend is deliberately deferred, but the seam for it is built now, and it costs about half a day.

   - **`data/ports/`** — the six interfaces from `../analytic-docs/PERSISTENCE.md` §3: `AuthProvider`, `ProfileStore`, `ProgressStore`, `SettingsStore`, `LeaderboardService`, `StatsSink`.
   - **Every method returns a `Promise`**, even though localStorage resolves instantly. This is the single decision that makes swapping in the .NET backend a one-adapter change instead of a rewrite — get it wrong and every call site needs touching later.
   - **`data/adapters/localStorage/`** — the v1 implementation. Keys `kd:<userId>:<store>`, records shaped `{ version, updatedAt, revision, data }`, zod-validated on read, migration chain scaffolded with only v1 present. A record failing validation is preserved under `kd:<userId>:<store>:corrupt:<timestamp>` and the game starts fresh rather than crashing.
   - **`data/adapters/mockRemote/`** — same stores, but with **200–600ms injected latency and a 5% failure rate** (dev-toggleable to 100%). This is not optional busywork: it's what forces the UI to grow loading states, error toasts and retry paths now rather than in a panicked week after the backend lands. A mock that always succeeds instantly is worse than no mock.
   - **`data/dto/`** — versioned wire shapes plus mappers. The backend must never be coupled to internal types.
   - **`data/index.ts`** — adapter selection from `VITE_DATA_MODE` (`local` | `mock` | `http`).
   - **`ui/composables/`** — `useAuth`, `useProfile`, `useProgress`, `useSettings`, `useSync`. Each exposes `loading` and `error` refs from day one; each is a singleton per key. `useSync()` returns `'local'` throughout v1 and drives a small status indicator on the Kitchen screen — an hour's work now, and the sync UI exists before sync does.
   - **`AnonymousAuthProvider`** — generates and persists `local-<uuid>`. Everything is scoped by `userId` from day one so real accounts don't require a data migration later.
   - **ESLint**: `no-restricted-imports` forbidding `@/data/*` and `localStorage` anywhere under `ui/components/**`. Components import composables and nothing else. Verify the rule fails on a deliberate violation.

   Contents persisted: unlocked towers, owned installations, per-night results, loadouts, current night, difficulty, settings. **No live world state.**

   Autosave after every night and every purchase; debounce settings writes 500ms. Manual "reset progress" behind a confirmation.

7. **Campaign flow**: title → kitchen → night → summary → kitchen. Losing a night returns to the kitchen with installations intact and the night replayable. Grocery Money is awarded on a loss too, at a reduced rate (say 40%), so a hard night is never a total waste — this is the anti-frustration valve.

## Tests

- The scoring formula produces the documented value for a fixture night — assert every term separately, not just the total.
- Every installation's modifier reaches the system that consumes it: assert Better Tupperware reduces an ant's *and* the Mouse's effective steals; assert Fix the Window Screen actually delays flyer waves.
- Save round-trips losslessly; a v0 save missing a field migrates cleanly; a corrupt save is preserved under its `:corrupt:` key and the game starts fresh rather than crashing.
- **Swap `VITE_DATA_MODE` from `local` to `mock` and the game still works** — slower, occasionally failing, but every screen shows a loading state and every failure surfaces an error the player can retry. This is the real test of the persistence layer, and it's the one that proves the .NET swap will be painless.
- No file under `ui/components/**` imports `@/data` or touches `localStorage` — assert via the lint rule, not by inspection.
- Losing a night awards exactly 40% Grocery Money and does not consume the unlock.

## Acceptance

- [ ] Finishing a night and choosing an installation is a decision you look forward to.
- [ ] The kitchen visibly changes as you buy things.
- [ ] The night summary makes you want to play the night better.

## Do not

Add achievements, statistics screens, or a codex — step 23. Metagame loop only.
