# Persistence and Backend

**Build order: playable game first, infrastructure second.** v1 ships with localStorage and a mocked remote. A .NET 10 backend with real accounts arrives later, and swapping it in must not touch a single call site.

That constraint is what this document exists to guarantee.

---

## 1. The shape

```
ui/composables/     ← the ONLY thing UI code ever imports
      ↓
data/ports/         ← interfaces. async, adapter-agnostic
      ↓
data/adapters/      ← LocalStorage (now) · MockRemote (now) · Http (later)
```

`core/` sits outside this entirely. **The simulation never touches persistence.** It produces plain serialisable data and consumes plain serialisable data; someone else decides where that data lives. Persistence happens only at boundaries — night start, night end, purchase, settings change — and **never mid-tick**. The world must never `await` anything.

---

## 2. The three rules that make the swap painless

### Rule 1 — Everything is async from day one

```ts
// correct, even though localStorage is synchronous
async function loadProfile(): Promise<Profile | null>

// wrong. this decision is unfixable without touching every caller
function loadProfile(): Profile | null
```

The localStorage adapter resolves immediately. That's fine. What matters is that every call site already has a `try`/`catch`, a loading state, and an error path on the day the HTTP adapter appears.

### Rule 2 — The mock backend is deliberately unreliable

`MockRemoteAdapter` injects **200–600ms of latency** and a configurable failure rate (default 5%, dev-toggleable to 100%). This exists so the UI grows loading spinners, error toasts, retry buttons and optimistic updates *while you're building the game*, not in a panicked week after the backend lands.

A mock that always succeeds instantly is worse than no mock at all — it teaches the UI bad habits and hides exactly the work you're deferring.

### Rule 3 — Wire DTOs are not internal types

The backend must never be coupled to internal shapes. Define explicit versioned DTOs plus mappers:

```ts
interface ProfileDtoV1 { version: 1; id: string; displayName: string; /* ... */ }

function toProfileDto(p: Profile): ProfileDtoV1
function fromProfileDto(d: ProfileDtoV1): Profile
```

Zod-validate on the way in, always — a localStorage blob and an HTTP response are equally untrusted. This also means the .NET side gets a stable contract to build against rather than a moving target.

---

## 3. Ports

```ts
interface AuthProvider {
  currentUser(): Promise<User | null>
  signIn(): Promise<User>
  signOut(): Promise<void>
  onChange(fn: (u: User | null) => void): Unsubscribe
}

interface ProfileStore {
  load(userId: string): Promise<Profile | null>
  save(userId: string, p: Profile): Promise<void>
}

interface ProgressStore {                    // unlocks, installations, night results, current night, difficulty
  load(userId: string): Promise<Progress | null>
  save(userId: string, p: Progress): Promise<void>
}

interface SettingsStore {
  load(userId: string): Promise<Settings | null>
  save(userId: string, s: Settings): Promise<void>
}

interface LeaderboardService {               // endless mode, post-v1
  submit(entry: RunResult): Promise<void>
  top(mapId: string, limit: number): Promise<LeaderboardEntry[]>
}

interface StatsSink {                        // telemetry. fire-and-forget, never blocks
  record(event: GameEvent): void
}
```

**Everything is scoped by `userId` from day one.** Locally that's a generated anonymous id (`local-<uuid>`, persisted). When real accounts arrive the schema doesn't change and existing local saves can be claimed by the first account that signs in on that device.

Every stored record carries `updatedAt: number` and `revision: number`. Nothing uses them in v1. They exist so that last-write-wins sync is a change to the adapter rather than a data migration — the same retrofit-avoidance argument as tile state and tower HP.

---

## 4. Composables — the only UI-facing surface

UI components import **only** from `ui/composables/`. No component ever imports an adapter, a port, or `localStorage` directly. Enforce it with an ESLint `no-restricted-imports` rule, the same way `core/` purity is enforced.

```ts
useAuth()        // { user, isAuthenticated, isAnonymous, signIn, signOut, loading, error }
useProfile()     // { profile, save, loading, error }
useProgress()    // { progress, unlockedTowers, installations, buyInstallation, recordNightResult, loading, error }
useSettings()    // { settings, update, loading, error }
useLeaderboard() // { entries, submit, refresh, loading, error }
useSync()        // { status: 'local' | 'syncing' | 'synced' | 'offline' | 'error', lastSyncedAt, retry }
```

Each returns `loading` and `error` refs **from day one**, and each is a singleton per key — call `useProgress()` from three components and get one shared state, not three fetches.

`useSync()` returns `'local'` for the whole of v1 and drives a small status indicator in the corner of the Kitchen screen. It costs an hour now and means the sync UI already exists when sync does.

---

## 5. Adapter selection

One switch, one place:

```ts
// data/index.ts
const mode = import.meta.env.VITE_DATA_MODE ?? 'local'   // 'local' | 'mock' | 'http'
```

| Mode | Auth | Stores | Use |
|---|---|---|---|
| `local` | Anonymous | localStorage | **v1 default.** Fast, offline, no ceremony |
| `mock` | Fake sign-in | localStorage + injected latency/failures | Developing UI states, testing error paths |
| `http` | Real | .NET 10 API | Later |

Composables never know which is active.

---

## 6. localStorage specifics (v1)

- Keys namespaced `kd:<userId>:<store>` — e.g. `kd:local-a1b2:progress`.
- Every record: `{ version, updatedAt, revision, data }`, zod-validated on read.
- A record that fails validation is **preserved** under `kd:<userId>:<store>:corrupt:<timestamp>`, never discarded, and the game starts fresh rather than crashing.
- An explicit migration chain keyed on `version`. Write the chain scaffolding at step 20 with only v1 present — retrofitting migrations is precisely the pain this avoids.
- Autosave after every night and every purchase. Debounce settings writes by 500ms.
- **Never store live world state.** Nights are not resumable mid-play (`DECISIONS.md`, scope decision).

---

## 7. When the .NET 10 backend arrives

The work, in order — none of it should touch a component or a composable:

0. **It lands in `api/` in this same repo.** The one thing that genuinely spans the frontend/backend boundary is the DTO contract, and a monorepo means a wire-shape change is one commit touching both the TS adapter and the C# controller — rather than two repos drifting with no compiler to catch it. See [DECISION-LOG.md](DECISION-LOG.md) D20.
1. **Generate the contract, don't hand-maintain it.** Emit an OpenAPI document from the .NET side into `api/openapi.yaml`, generate TS types from it into `game/src/data/dto/generated/`, and commit both. The hand-written mappers in `data/dto/` then translate generated wire types to internal types, so a backend change that breaks the contract fails the frontend build instead of failing at runtime.
2. **Implement `HttpAdapter`** against the ports. Endpoints follow the DTO contract in §3.
3. **Auth.** Replace `AnonymousAuthProvider` with the real one. Prefer an **httpOnly cookie** over a token in localStorage — a token in localStorage is readable by any XSS, and this is a decision to make *with* the backend, not after it. Note it in `OPEN-QUESTIONS.md` until settled.
4. **Claim flow.** On first sign-in, offer to upload the local anonymous profile. `userId` scoping from day one is what makes this a straightforward copy rather than a merge.
5. **Sync.** Local stays the source of truth during play; push on change; last-write-wins on `revision`. `useSync()` already exists to surface state.
6. **Offline.** Queue failed writes, replay on reconnect. The mock adapter's failure injection means this path has been exercised for months by then.

### What should be server-authoritative, and what shouldn't

**Don't validate single-player progression on the server.** It's a single-player game; a player who edits their own save is only cheating themselves, and enforcing it costs far more than it's worth.

**Do validate leaderboard submissions**, if endless-mode leaderboards ever ship. This is where the determinism work from step 1 pays off unexpectedly: a run is fully described by `(seed, mapId, nightId, difficulty, loadout, commandLog)`, so the server can **replay it headlessly and verify the score**. That requires the sim to run on .NET or the verification service to run the TypeScript sim in Node — the latter is far less work, since step 22's harness is already exactly that program.

---

## 8. What this costs in v1

Roughly half a day at step 20: six interfaces, two adapters, six composables, and an ESLint rule. In exchange, adding the backend later is writing one adapter class and flipping an env var, with zero changes to game code.

The failure mode this prevents is the common one — `localStorage.getItem` scattered across twenty components, synchronously, with no error handling — where adding a backend means rewriting the entire UI layer.
