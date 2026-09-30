import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newProgress } from '@/core/campaign.ts'
import { getInstallationDef } from '@/core/content/index.ts'
import { createLocalProgressStore } from '@/data/adapters/localStorage/progress.ts'
import { createDataLayer, setDataLayer, setMockFailureRate } from '@/data/index.ts'
import { useAuth } from '@/ui/composables/useAuth.ts'
import { SETTINGS_SAVE_DEBOUNCE_MS } from '@/ui/composables/useSettings.ts'
import { useProgressStore } from '@/ui/stores/progress.ts'
import { useSettingsStore } from '@/ui/stores/settings.ts'
import { createMemoryStorage } from './fixtures/memoryStorage.ts'
import type { Progress } from '@/core/campaign.ts'
import type { MemoryStorage } from './fixtures/memoryStorage.ts'

/**
 * The progress store over the mock remote: a failed save never shows as progress, a retry sends
 * exactly what failed, and nothing is ever applied twice.
 */

let storage: MemoryStorage

beforeEach(() => {
	vi.useFakeTimers()
	setActivePinia(createPinia())
	storage = createMemoryStorage()
	setDataLayer(createDataLayer('mock', storage))
	setMockFailureRate(0)
})

afterEach(() => {
	setDataLayer(null)
	vi.useRealTimers()
})

/** Runs the mock remote's latency out, however many calls are chained. */
async function settle<T>(pending: Promise<T>): Promise<T> {
	await vi.runAllTimersAsync()
	return pending
}

function storedRecord(store: string): unknown {
	const raw = [...storage.entries].find(([key]) => key.endsWith(`:${store}`))?.[1]
	return raw === undefined ? null : JSON.parse(raw)
}

function progressRecord(): {
	revision: number
	data: { groceryMoney: number; installations: string[]; loadouts: Record<string, string[]> }
} | null {
	return storedRecord('progress') as ReturnType<typeof progressRecord>
}

function settingsRecord(): unknown {
	return storedRecord('settings')
}

const HINGES = 'oilTheHinges'
const HINGES_COST = getInstallationDef(HINGES).cost

async function loadedWithMoney(groceryMoney: number): Promise<ReturnType<typeof useProgressStore>> {
	const store = useProgressStore()
	await settle(store.ensureLoaded())
	expect(await settle(store.recordNightResult({ nightId: 'night01', won: true, groceryMoney }))).toBe('ok')
	return store
}

/** A store loaded from a save already on disk at revision 1. */
async function loadedFrom(saved: Progress): Promise<ReturnType<typeof useProgressStore>> {
	// The signed-in user outlives a spec, so the save goes under whoever that is.
	const user = await settle(useAuth().ensureUser())
	await createLocalProgressStore(storage).save(user.id, saved)
	const store = useProgressStore()
	await settle(store.ensureLoaded())
	expect(store.progress).toEqual(saved)
	return store
}

/** Night 18 on Normal, a broom owned and money in hand: one win from the clear. */
function onNight18(): Progress {
	return { ...newProgress(), nightId: 'night18', groceryMoney: 90, installations: ['buyABroom'] }
}

/** The campaign won on Normal. */
function clearedNormal(): Progress {
	return { ...onNight18(), nightId: null, cleared: ['normal'] }
}

const NIGHT_18_WIN = { nightId: 'night18', won: true, groceryMoney: 300 }

describe('the progress store', () => {
	it('starts a first run from newProgress() in memory and writes nothing until the first change', async () => {
		const store = useProgressStore()
		await settle(store.ensureLoaded())

		expect(store.progress).toEqual(newProgress())
		expect(store.status).toBe('idle')
		expect(progressRecord()).toBeNull()
	})

	it('assigns a change only once its save resolved', async () => {
		const store = await loadedWithMoney(150)

		expect(store.progress?.groceryMoney).toBe(150)
		expect(store.progress?.nightId).toBe('night02')
		expect(progressRecord()).toMatchObject({ revision: 1, data: { groceryMoney: 150 } })
	})

	it('keeps progress exactly as it was when a purchase fails to save, and retry takes the money once', async () => {
		const store = await loadedWithMoney(150)
		const before = store.progress
		const snapshot = structuredClone(before)

		setMockFailureRate(1)
		expect(await settle(store.buyInstallation(HINGES))).toBe('failed')
		expect(store.progress).toBe(before)
		expect(store.progress).toEqual(snapshot)
		expect(store.status).toBe('error')
		expect(store.error?.name).toBe('RemoteUnavailableError')
		expect(progressRecord()).toMatchObject({ revision: 1, data: { groceryMoney: 150, installations: [] } })

		// A second failed retry changes nothing either.
		await settle(store.retry())
		expect(store.progress).toBe(before)

		setMockFailureRate(0)
		await settle(store.retry())
		expect(store.status).toBe('idle')
		expect(store.error).toBeNull()
		expect(store.progress?.groceryMoney).toBe(150 - HINGES_COST)
		expect(store.progress?.installations).toEqual([HINGES])
		expect(progressRecord()).toMatchObject({
			revision: 2,
			data: { groceryMoney: 150 - HINGES_COST, installations: [HINGES] },
		})

		// Nothing is pending any more, so a further retry sends nothing and takes nothing.
		await settle(store.retry())
		expect(store.progress?.groceryMoney).toBe(150 - HINGES_COST)
		expect(progressRecord()?.revision).toBe(2)
	})

	it('refuses a change while a save is in flight', async () => {
		const store = useProgressStore()
		await settle(store.ensureLoaded())

		const first = store.recordNightResult({ nightId: 'night01', won: false, groceryMoney: 20 })
		expect(store.status).toBe('saving')
		expect(await store.recordNightResult({ nightId: 'night01', won: false, groceryMoney: 20 })).toBe('busy')
		expect(await store.buyInstallation(HINGES)).toBe('busy')
		expect(await store.chooseLoadout(['saltShaker'])).toBe('busy')
		expect(await store.startCampaign('cozy')).toBe('busy')
		expect(await store.chooseEndlessLoadout('sink', ['saltShaker'])).toBe('busy')
		expect(await store.recordEndlessResult({ mapId: 'sink', difficulty: 'normal', waves: 3 })).toBe('busy')
		expect(await store.resetProgress()).toBe('busy')

		expect(await settle(first)).toBe('ok')
		expect(store.progress?.nightResults['night01']?.attempts).toBe(1)
		expect(store.progress?.groceryMoney).toBe(20)
	})

	it('builds a change after a failed save on the unsaved state, so the failed night is not dropped', async () => {
		const store = await loadedWithMoney(150)

		setMockFailureRate(1)
		expect(await settle(store.recordNightResult({ nightId: 'night02', won: true, groceryMoney: 40 }))).toBe(
			'failed',
		)
		expect(store.progress?.groceryMoney).toBe(150)

		setMockFailureRate(0)
		expect(await settle(store.buyInstallation(HINGES))).toBe('ok')
		expect(store.progress?.groceryMoney).toBe(150 + 40 - HINGES_COST)
		expect(store.progress?.nightId).toBe('night03')
		expect(store.progress?.nightResults['night02']?.wins).toBe(1)
	})

	it('names a refusal without saving anything', async () => {
		const store = await loadedWithMoney(HINGES_COST - 1)

		expect(await store.buyInstallation(HINGES)).toBe('tooExpensive')
		expect(store.status).toBe('idle')
		expect(progressRecord()?.revision).toBe(1)
	})

	it('saves a chosen loadout for tonight only once the save resolves', async () => {
		const store = await loadedWithMoney(0)
		const before = store.progress

		setMockFailureRate(1)
		expect(await settle(store.chooseLoadout(['stickyTape', 'saltShaker']))).toBe('failed')
		expect(store.progress).toBe(before)
		expect(store.progress?.loadouts).toEqual({})

		setMockFailureRate(0)
		await settle(store.retry())
		expect(store.progress?.loadouts).toEqual({ night02: ['stickyTape', 'saltShaker'] })
		expect(progressRecord()).toMatchObject({
			revision: 2,
			data: { loadouts: { night02: ['stickyTape', 'saltShaker'] } },
		})
	})

	it('names a loadout it refuses without saving anything', async () => {
		const store = await loadedWithMoney(0)

		expect(await store.chooseLoadout([])).toBe('empty')
		expect(await store.chooseLoadout(['saltShaker', 'cookieJar'])).toBe('notUnlocked')
		expect(store.status).toBe('idle')
		expect(progressRecord()?.revision).toBe(1)
	})

	it('carries a failed night save with the loadout chosen after it, and lands both once', async () => {
		const store = await loadedWithMoney(150)

		setMockFailureRate(1)
		expect(await settle(store.recordNightResult({ nightId: 'night02', won: false, groceryMoney: 40 }))).toBe(
			'failed',
		)
		// The Retry: tonight's loadout is chosen with the lost night still unsaved.
		expect(await settle(store.chooseLoadout(['stickyTape']))).toBe('failed')
		expect(store.progress?.groceryMoney).toBe(150)

		setMockFailureRate(0)
		await settle(store.retry())
		expect(store.progress?.groceryMoney).toBe(190)
		expect(store.progress?.nightResults['night02']?.attempts).toBe(1)
		expect(store.progress?.loadouts).toEqual({ night02: ['stickyTape'] })
		expect(progressRecord()).toMatchObject({
			revision: 2,
			data: { groceryMoney: 190, loadouts: { night02: ['stickyTape'] } },
		})

		await settle(store.retry())
		expect(store.progress?.groceryMoney).toBe(190)
		expect(progressRecord()?.revision).toBe(2)
	})

	it('starts a new campaign only once its save resolved, keeping the clear and dropping the kitchen', async () => {
		const store = await loadedFrom(clearedNormal())
		const before = store.progress

		setMockFailureRate(1)
		expect(await settle(store.startCampaign('nightmare'))).toBe('failed')
		expect(store.progress).toBe(before)
		expect(progressRecord()?.revision).toBe(1)

		setMockFailureRate(0)
		await settle(store.retry())
		expect(store.progress).toEqual({ ...newProgress(), difficulty: 'nightmare', cleared: ['normal'] })
		expect(progressRecord()).toMatchObject({
			revision: 2,
			data: { difficulty: 'nightmare', groceryMoney: 0, installations: [], cleared: ['normal'] },
		})
	})

	it('names a locked tier without saving anything', async () => {
		const store = await loadedFrom(onNight18())

		expect(await store.startCampaign('nightmare')).toBe('locked')
		expect(store.status).toBe('idle')
		expect(progressRecord()?.revision).toBe(1)
	})

	it('starts Nightmare on a night-18 win whose save failed, and lands the clear once', async () => {
		const store = await loadedFrom(onNight18())

		setMockFailureRate(1)
		expect(await settle(store.recordNightResult(NIGHT_18_WIN))).toBe('failed')
		// Shown, the campaign is still on night 18 with nothing cleared; pending, Nightmare is open.
		expect(store.progress?.cleared).toEqual([])
		expect(await settle(store.startCampaign('nightmare'))).toBe('failed')
		expect(store.progress?.nightId).toBe('night18')

		setMockFailureRate(0)
		await settle(store.retry())
		expect(store.progress).toEqual({ ...newProgress(), difficulty: 'nightmare', cleared: ['normal'] })
		expect(progressRecord()).toMatchObject({ revision: 2, data: { difficulty: 'nightmare', cleared: ['normal'] } })

		await settle(store.retry())
		expect(store.progress?.cleared).toEqual(['normal'])
		expect(progressRecord()?.revision).toBe(2)
	})

	it('saves an endless loadout and an endless best, and names a refused loadout without saving', async () => {
		const store = await loadedFrom(clearedNormal())

		expect(await store.chooseEndlessLoadout('sink', [])).toBe('empty')
		expect(progressRecord()?.revision).toBe(1)

		expect(await settle(store.chooseEndlessLoadout('sink', ['fan', 'saltShaker']))).toBe('ok')
		expect(await settle(store.recordEndlessResult({ mapId: 'sink', difficulty: 'normal', waves: 17 }))).toBe('ok')
		expect(await settle(store.recordEndlessResult({ mapId: 'sink', difficulty: 'normal', waves: 11 }))).toBe('ok')

		expect(store.progress?.loadouts).toEqual({ endlessSink: ['fan', 'saltShaker'] })
		expect(store.progress?.endlessBests).toEqual({ normal: { sink: 17 } })
		expect(store.progress?.groceryMoney).toBe(90)
		expect(progressRecord()).toMatchObject({
			revision: 4,
			data: { loadouts: { endlessSink: ['fan', 'saltShaker'] }, endlessBests: { normal: { sink: 17 } } },
		})
	})

	it('reports a failed load as an error, and retry loads it', async () => {
		setMockFailureRate(1)
		const store = useProgressStore()
		await settle(store.ensureLoaded())
		expect(store.status).toBe('error')
		expect(store.progress).toBeNull()

		setMockFailureRate(0)
		await settle(store.retry())
		expect(store.status).toBe('idle')
		expect(store.progress).toEqual(newProgress())
	})
})

describe('the settings store', () => {
	it('assigns at once and saves the last value of a burst once, 500 ms later', async () => {
		const store = useSettingsStore()
		await settle(store.ensureLoaded())

		store.update({ speed: 2 })
		store.update({ speed: 3 })
		expect(store.settings).toEqual({ speed: 3 })

		await vi.advanceTimersByTimeAsync(SETTINGS_SAVE_DEBOUNCE_MS - 1)
		expect(settingsRecord()).toBeNull()

		await settle(Promise.resolve())
		expect(settingsRecord()).toMatchObject({ revision: 1, data: { speed: 3 } })
	})
})
