# Step 20C — Persistence

> Paste this entire file as your prompt into a fresh session.

**Read first:** `../../CLAUDE.md` (*What goes in a store*, and the libraries table),
`../../analytic-docs/PERSISTENCE.md` **in full** (the step requires it, and every section is used),
`../../analytic-docs/ARCHITECTURE.md` §8.
**Prereq:** step 20B.

## Goal

The seam the .NET backend will plug into, built now, with the game's progress going through it:
six ports, versioned DTOs, a localStorage adapter that never throws a save away, a mock remote that is
slow and sometimes fails on purpose, one switch that picks between them, and the composables and
stores the UI will use. Nothing on screen changes yet (D wires the screens). **This part carries the
persistence tests and the lint spec.**

## Already in the repo

| File | What's there now |
| --- | --- |
| `data/ports/index.ts`, `data/dto/index.ts`, `data/index.ts`, `data/adapters/localStorage.ts`, `data/adapters/mockRemote.ts`, `data/adapters/http/client.ts`, `data/adapters/http/index.ts` | **Seven empty files**, the scaffold from step 1 |
| `ui/composables/use{Auth,Profile,Progress,Settings,Sync}.ts`, `ui/stores/{profile,progress,session,settings}.ts` | **Nine empty files** |
| `main.ts` | Pinia is installed before the router. Its comment already says stores hold metagame, session and settings state and never the world |
| `eslint.config.js` | `dataBan` (`**/data`, `**/data/**`) on all of `src/ui/**`. Composables may import `@/data` but not an adapter or a DTO. Stores are banned from `data` **and** from `core/world.ts` / `core/sim.ts`. **No `localStorage` ban anywhere outside `core/`** |
| `vite.config.ts` | Vitest runs in `environment: 'node'`. **There is no `window` and no usable `localStorage` in a spec** |
| `tsconfig.json` | `types: ["node", "vite/client"]`, and there's no `env.d.ts`, so `import.meta.env.VITE_DATA_MODE` is an untyped string |
| `core/campaign.ts` (20B) | `Progress`, `newProgress`, `applyNightResult`, `buyInstallation`, all pure |
| `loop.ts` | `Speed` is `0 \| 1 \| 2 \| 3`. `GameView` never sets 0, because pause is `pause()`/`resume()` |

## Decisions already made

Reasons are given so you don't re-derive them. Override one only if the code proves it wrong, and
then edit this file. Don't leave it lying.

1. **`data/adapters/localStorage/` and `data/adapters/mockRemote/` are directories**, one file per
   store. Delete the two empty stub files. A `localStorage.ts` beside a `localStorage/` is two things
   with one name. `http/` stays as its empty stubs, and `VITE_DATA_MODE=http` throws at selection with
   a message pointing at `PERSISTENCE.md` §7, so a typo'd mode can't quietly fall back to local.
2. **The storage is injected.** The localStorage adapters take a `KeyValueStorage` (`getItem`,
   `setItem`, `removeItem`). `data/index.ts` hands them `window.localStorage` **lazily**, on the first
   `dataLayer()` call, never at module load. Specs pass an in-memory one from `tests/fixtures/`. A
   module that touches `window` at import breaks every spec that imports a composable.
3. **The mock remote is a decorator over the local adapters:** each method waits 200–600 ms, then
   rejects with a `RemoteUnavailableError` at `failureRate` or delegates. It uses `Math.random`
   (`data/` isn't `core/`). The rate comes from `VITE_MOCK_FAILURE_RATE`, default 0.05, and
   `setMockFailureRate(rate)` is exported from `@/data/index.ts` for D's dev toggle. It's a no-op
   outside mock mode. Auth is decorated the same way, and that's the "fake sign-in".
4. **Records are `{ version, updatedAt, revision, data }`**, where `data` is the **DTO**, never the
   internal type (PERSISTENCE.md rule 3). `revision` is the stored one plus 1, and `updatedAt` is
   `Date.now()`.
5. **One read pipeline, `readRecord(raw, codec)`:** `JSON.parse`, then the envelope schema, then the
   migrations up to the codec's current version, then the DTO schema, then the mapper to the internal
   type. **Any failure goes down the corrupt path:** copy the raw string to
   `kd:<userId>:<store>:corrupt:<Date.now()>`, **remove the original key**, return `null`. Without the
   remove, every boot re-reads the same bad record and writes another corrupt copy until storage is
   full. A version newer than the codec's also goes down the corrupt path. It's preserved, not
   guessed at.
6. **The migration chain is a field of the codec:** `migrations: Record<fromVersion, (data: unknown)
   => unknown>`. It's empty for every store at v1. The spec builds its own codec with a synthetic v0,
   which is how "a v0 save missing a field migrates" is tested while "only v1 present" stays true.
7. **The DTO mappers check ids against content.** `nightId` must be in `NIGHTS` or `null`. Every
   installation must be in `INSTALLATIONS`, with no duplicates. `difficulty` must be a tier. A failure
   is a corrupt record, preserved. A renamed id has to ship with a migration, and dropping unknown
   installations would silently take back something the player paid for. There are no loadouts in
   `ProgressDtoV1`: 20a adds them, as a v2 or as an optional field, its call.
8. **`AnonymousAuthProvider`:** `local-${crypto.randomUUID()}`, persisted under `kd:auth:anonymousId`.
   That key isn't user-scoped, because it's what produces the user. `signIn()` returns the same user.
   `signOut()` is a no-op in v1, because a new anonymous id would orphan every save. `onChange` is
   wired anyway.
9. **`LeaderboardService` and `StatsSink` are interfaces plus one no-op adapter**, with no
   composable, since nothing in v1 submits or records. The telemetry payload is `StatsEvent`, **not**
   `GameEvent`: that name is core's, and the two would be auto-imported for each other.
10. **The store holds the state and the composable holds the I/O.** `CLAUDE.md` and
    `PERSISTENCE.md` §4 disagreed. `useProgress()` (the composable) is a singleton with `loading`,
    `error`, `load(userId)` and `save(userId, progress)`, and it holds no game state.
    `useProgressStore()` holds `progress` and runs the campaign. **Every store write is pessimistic:**
    run the `core/campaign.ts` reducer on the current state, save the result, and assign it only when
    the save resolves. On failure, keep the old state, set `status: 'error'`, keep the unsaved state as
    `pending`, and have `retry()` re-send exactly that state. No rollback code exists, a failed save
    never shows as progress, and a retry can't award a night twice, because the reducer ran once on an
    unchanged base. One save is in flight at a time, and a commit during one is refused as `'busy'`.
    Edit `PERSISTENCE.md` §4's composable table to say this split.
11. **Settings v1 is `{ speed: 1 | 2 | 3 }`**, the last speed chosen, which D restores at night
    start. The DTO refuses 0, because a restored 0 is a night that opens frozen with no pause shown.
    Settings is the one **optimistic** store: assign now, then save through a 500 ms debounce in
    `useSettings`. A lost speed preference is harmless, and a speed button that waits up to 600 ms of
    mock latency feels broken. Step 23 adds the rest.
12. **Profile v1 is `{ displayName: string | null }`.** It's loaded and nothing renders it yet.
13. **`ui/stores/session.ts` stays empty.** 20a's loadout-in-progress is its first tenant.
14. **The lint rule:** add `no-restricted-globals` for `localStorage` / `sessionStorage` and
    `no-restricted-properties` for `window.localStorage` / `window.sessionStorage` to the `src/ui/**`
    scope. `no-restricted-globals` doesn't see `window.localStorage`, and that's the spelling someone
    will use. Those two rules are new keys in that scope, so the later composables and stores blocks,
    which only set `no-restricted-imports`, don't switch them off.

## Build

### 1. Ports, DTOs, adapters and selection

Decisions 1–9. `data/ports/index.ts` holds the six interfaces from PERSISTENCE.md §3, every method
returning a `Promise` (`StatsSink.record` is fire-and-forget, per the doc). `data/dto/` holds one
file per store with the zod schema, the `…DtoV1` type and `to…Dto` / `from…Dto`. `data/index.ts`
exports `createDataLayer(mode, storage)`, a lazy `dataLayer()`, `setDataLayer(layer)` for specs, and
`setMockFailureRate`. Add `src/env.d.ts` typing `VITE_DATA_MODE` (`'local' | 'mock' | 'http'`) and
`VITE_MOCK_FAILURE_RATE`.

Gotcha: **zod here ships.** `core/`'s schemas tree-shake out of production because
`validateContentInDev` is dead there. `data/`'s run on every read in a player's browser, so they must
not import a `core/content/schema.ts` schema. Check ids against the exported content arrays instead.

### 2. Composables and stores

Decisions 10–13. `useAuth`, `useProfile`, `useProgress`, `useSettings` and `useSync`, each a
module-level singleton exposing `loading` and `error`. `useSync()` is
`{ status: 'local', lastSyncedAt: null, retry }` for the whole of v1. `useProgressStore`,
`useSettingsStore` and `useProfileStore`, each with `ensureLoaded()`. A first run with no record is a
`newProgress()` held in memory and saved on its first change.

### 3. The lint rule

Decision 14.

## Tests

`tests/persistence.spec.ts`, `tests/progressStore.spec.ts` and `tests/lint.spec.ts`. None of them
touches the global `localStorage`: Node 22+ ships one that warns or throws without a backing file.

- **Round trip:** a `Progress` with installations, three night records and `nightId: 'night04'`
  saves and loads deep-equal under `kd:<userId>:progress`. `revision` is 1, then 2.
- **v0 migrates:** a codec with a synthetic v0 schema missing `difficulty`, and a v0-to-v1 migration
  that adds `'normal'`, reads a stored v0 record as a valid v1 `Progress`.
- **Corrupt is preserved:** unparseable JSON, a record failing its schema, and one naming an unknown
  installation each load as `null`. Each leaves the raw string under exactly one `:corrupt:` key and
  removes the original. A second load returns `null` and writes no second copy.
- **Mock:** with fake timers, a call at failure rate 0 resolves after 200–600 ms. At rate 1, every
  method of every store rejects with `RemoteUnavailableError` and never resolves.
- **The store is pessimistic:** on a mock at rate 1, `buyInstallation` leaves `progress` exactly as
  it was, sets `status: 'error'`, and `retry()` at rate 0 assigns the bought state with the money
  taken **once**. `recordNightResult` during a save in flight is refused.
- **Lint:** through ESLint's Node API (`new ESLint({ cwd })`, then `lintText(code, { filePath })`), a
  file under `src/ui/components/` importing `@/data/index.ts` errors, and so do `localStorage.getItem`
  and `window.localStorage.getItem`. The same import under `src/ui/composables/` doesn't error. Give
  the spec a long timeout: building an `ESLint` with the Vue and TypeScript configs takes seconds,
  and vitest's default 5 s fails it on a cold run.

## Acceptance

- [ ] `grep -rn localStorage src/ui` finds nothing.
- [ ] Every port method returns a `Promise`. `PERSISTENCE.md` §4 describes the store and composable
      split as built.
- [ ] Loading a save written by a build with an extra field, or with a hand-edited bad value, starts
      fresh and leaves the old record under `:corrupt:`.
- [ ] `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are green.

## Hands to 20D

```
ui/stores/progress.ts      useProgressStore(): progress: Progress | null; status: 'idle' | 'loading' | 'saving' | 'error';
                             error: Error | null; ensureLoaded(): Promise<void>; retry(): Promise<void>;
                             buyInstallation(id): Promise<'ok' | 'owned' | 'tooExpensive' | 'busy' | 'failed'>;
                             recordNightResult(result: NightResult): Promise<'ok' | 'busy' | 'failed'>;
                             resetProgress(): Promise<'ok' | 'busy' | 'failed'>
ui/stores/settings.ts      useSettingsStore(): settings: Settings; ensureLoaded(); update(patch: Partial<Settings>): void
ui/composables/useSync.ts  useSync(): { status: Readonly<Ref<'local'>>; lastSyncedAt: Readonly<Ref<number | null>>; retry(): Promise<void> }
data/index.ts              setMockFailureRate(rate: number): void   // mock mode only; no-op otherwise
```

## Do not

Touch a screen, a route or `GameView.vue` (D). Build the HTTP adapter, a sync queue or a claim flow
(post-v1, PERSISTENCE.md §7), `useLeaderboard` (post-v1), a settings screen (step 23), or loadouts
in the record (20a). Never put the world, or any part of it, in a store or a save.
