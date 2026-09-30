/**
 * Adapter selection: one switch, one place (analytic-docs/PERSISTENCE.md section 5). Composables
 * reach persistence through `dataLayer()` and never learn which mode is live.
 */

import { createAnonymousAuthProvider } from '@/data/adapters/localStorage/auth.ts'
import { createLocalProfileStore } from '@/data/adapters/localStorage/profile.ts'
import { createLocalProgressStore } from '@/data/adapters/localStorage/progress.ts'
import { createLocalSettingsStore } from '@/data/adapters/localStorage/settings.ts'
import { createRemoteAuthProvider } from '@/data/adapters/mockRemote/auth.ts'
import { createRemoteProfileStore } from '@/data/adapters/mockRemote/profile.ts'
import { createRemoteProgressStore } from '@/data/adapters/mockRemote/progress.ts'
import { createRemoteSettingsStore } from '@/data/adapters/mockRemote/settings.ts'
import { createNoopLeaderboard, createNoopStatsSink } from '@/data/adapters/noop.ts'
import type { KeyValueStorage } from '@/data/adapters/localStorage/record.ts'
import type { MockControl } from '@/data/adapters/mockRemote/remote.ts'
import type {
	AuthProvider,
	LeaderboardService,
	ProfileStore,
	ProgressStore,
	SettingsStore,
	StatsSink,
} from '@/data/ports/index.ts'

export type * from '@/data/ports/index.ts'
export type { KeyValueStorage } from '@/data/adapters/localStorage/record.ts'
export { RemoteUnavailableError } from '@/data/adapters/mockRemote/remote.ts'

export type DataMode = 'local' | 'mock' | 'http'

export interface DataLayer {
	mode: DataMode
	auth: AuthProvider
	profile: ProfileStore
	progress: ProgressStore
	settings: SettingsStore
	leaderboard: LeaderboardService
	stats: StatsSink
	/** Present in mock mode only: the knob `setMockFailureRate` turns. */
	mock: MockControl | null
}

const DEFAULT_FAILURE_RATE = 0.05

function selectMode(): DataMode {
	const mode = import.meta.env.VITE_DATA_MODE ?? 'local'
	if (mode === 'local' || mode === 'mock') {
		return mode
	}
	if (mode === 'http') {
		throw new Error(
			"VITE_DATA_MODE=http: the HTTP adapter doesn't exist yet. It arrives with the backend (analytic-docs/PERSISTENCE.md section 7).",
		)
	}
	throw new Error(`VITE_DATA_MODE='${String(mode)}' is not one of 'local', 'mock' or 'http'.`)
}

function configuredFailureRate(): number {
	const raw = import.meta.env.VITE_MOCK_FAILURE_RATE
	if (raw === undefined || raw === '') {
		return DEFAULT_FAILURE_RATE
	}
	const rate = Number(raw)
	if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
		throw new Error(`VITE_MOCK_FAILURE_RATE='${raw}' is not a number from 0 to 1.`)
	}
	return rate
}

export function createDataLayer(mode: DataMode, storage: KeyValueStorage): DataLayer {
	const local = {
		auth: createAnonymousAuthProvider(storage),
		profile: createLocalProfileStore(storage),
		progress: createLocalProgressStore(storage),
		settings: createLocalSettingsStore(storage),
		leaderboard: createNoopLeaderboard(),
		stats: createNoopStatsSink(),
	}

	if (mode === 'local') {
		return { mode, ...local, mock: null }
	}
	if (mode === 'http') {
		throw new Error("the HTTP adapter doesn't exist yet (analytic-docs/PERSISTENCE.md section 7)")
	}

	const control: MockControl = { failureRate: configuredFailureRate() }
	return {
		mode,
		auth: createRemoteAuthProvider(local.auth, control),
		profile: createRemoteProfileStore(local.profile, control),
		progress: createRemoteProgressStore(local.progress, control),
		settings: createRemoteSettingsStore(local.settings, control),
		leaderboard: local.leaderboard,
		stats: local.stats,
		mock: control,
	}
}

let active: DataLayer | null = null

/**
 * The live data layer, built on first call rather than at import: `window` doesn't exist in a spec,
 * and a module that touched it at load would break every spec importing a composable.
 */
export function dataLayer(): DataLayer {
	active ??= createDataLayer(selectMode(), window.localStorage)
	return active
}

/** For specs: install a layer over an in-memory storage, or null to go back to lazy selection. */
export function setDataLayer(layer: DataLayer | null): void {
	active = layer
}

/** The dev toggle for the mock remote's failure rate, 0 to 1. Does nothing outside mock mode. */
export function setMockFailureRate(rate: number): void {
	const control = dataLayer().mock
	if (control !== null) {
		control.failureRate = rate
	}
}
