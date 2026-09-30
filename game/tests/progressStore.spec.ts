import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newProgress } from '@/core/campaign.ts'
import { getInstallationDef } from '@/core/content/index.ts'
import { createDataLayer, setDataLayer, setMockFailureRate } from '@/data/index.ts'
import { SETTINGS_SAVE_DEBOUNCE_MS } from '@/ui/composables/useSettings.ts'
import { useProgressStore } from '@/ui/stores/progress.ts'
import { useSettingsStore } from '@/ui/stores/settings.ts'
import { createMemoryStorage } from './fixtures/memoryStorage.ts'
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

function progressRecord(): { revision: number; data: { groceryMoney: number; installations: string[] } } | null {
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
