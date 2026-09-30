import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnonymousAuthProvider } from '@/data/adapters/localStorage/auth.ts'
import { createLocalProgressStore } from '@/data/adapters/localStorage/progress.ts'
import { createRecordStore } from '@/data/adapters/localStorage/record.ts'
import { MAX_LATENCY_MS, MIN_LATENCY_MS } from '@/data/adapters/mockRemote/remote.ts'
import { progressCodec, progressSchemaV1 } from '@/data/dto/progress.ts'
import { settingsCodec } from '@/data/dto/settings.ts'
import { createDataLayer, RemoteUnavailableError } from '@/data/index.ts'
import { createMemoryStorage } from './fixtures/memoryStorage.ts'
import type { Progress } from '@/core/campaign.ts'
import type { Codec, ProgressDtoV1 } from '@/data/dto/index.ts'
import type { MemoryStorage } from './fixtures/memoryStorage.ts'
import type { z } from 'zod'

/**
 * The save seam: a record written is the record read, an old one migrates, a bad one is kept aside
 * and never thrown away, and the mock remote is as slow and unreliable as it promises.
 */

const USER = 'local-spec'
const KEY = `kd:${USER}:progress`

function sampleProgress(): Progress {
	return {
		nightId: 'night04',
		groceryMoney: 37,
		installations: ['oilTheHinges', 'buyABroom'],
		nightResults: {
			night01: { attempts: 1, wins: 1, bestGroceryMoney: 40 },
			night02: { attempts: 3, wins: 1, bestGroceryMoney: 55 },
			night03: { attempts: 2, wins: 1, bestGroceryMoney: 62 },
		},
		difficulty: 'nightmare',
	}
}

function storedRecord(storage: MemoryStorage, key: string): { version: number; revision: number; data: unknown } {
	const raw = storage.getItem(key)
	if (raw === null) {
		throw new Error(`nothing stored under ${key}`)
	}
	return JSON.parse(raw)
}

function corruptKeys(storage: MemoryStorage): string[] {
	return [...storage.entries.keys()].filter(key => key.includes(':corrupt:'))
}

function envelope(version: number, data: unknown): string {
	return JSON.stringify({ version, updatedAt: 1_700_000_000_000, revision: 3, data })
}

describe('a progress record', () => {
	it('saves and loads deep-equal under kd:<userId>:progress, revision 1 then 2', async () => {
		const storage = createMemoryStorage()
		const store = createLocalProgressStore(storage)

		await store.save(USER, sampleProgress())
		expect([...storage.entries.keys()]).toEqual([KEY])
		expect(storedRecord(storage, KEY)).toMatchObject({ version: 1, revision: 1 })
		expect(await store.load(USER)).toEqual(sampleProgress())

		await store.save(USER, sampleProgress())
		expect(storedRecord(storage, KEY).revision).toBe(2)
		expect(await store.load(USER)).toEqual(sampleProgress())
	})

	it('stores the DTO, not the internal object', async () => {
		const storage = createMemoryStorage()
		await createLocalProgressStore(storage).save(USER, sampleProgress())

		expect(storedRecord(storage, KEY).data).toEqual(progressCodec.toDto(sampleProgress()))
	})

	it('loads null when nothing was ever saved, and writes nothing', async () => {
		const storage = createMemoryStorage()

		expect(await createLocalProgressStore(storage).load(USER)).toBeNull()
		expect(storage.entries.size).toBe(0)
	})

	it('ships at v1 with an empty migration chain', () => {
		expect(progressCodec.version).toBe(1)
		expect(Object.keys(progressCodec.migrations)).toEqual([])
		expect(settingsCodec.version).toBe(1)
	})
})

describe('the migration chain', () => {
	const progressSchemaV0 = progressSchemaV1.omit({ difficulty: true })
	const codecWithV0: Codec<Progress, ProgressDtoV1> = {
		...progressCodec,
		migrations: {
			0: data => ({ ...progressSchemaV0.parse(data), difficulty: 'normal' }),
		},
	}
	const v0Data: z.infer<typeof progressSchemaV0> = {
		nightId: 'night02',
		groceryMoney: 50,
		installations: ['biggerFridge'],
		nightResults: { night01: { attempts: 2, wins: 1, bestGroceryMoney: 48 } },
	}

	it('reads a v0 record missing difficulty as a valid v1 Progress', async () => {
		const storage = createMemoryStorage({ [KEY]: envelope(0, v0Data) })

		expect(await createRecordStore(storage, codecWithV0).load(USER)).toEqual({ ...v0Data, difficulty: 'normal' })
		expect(corruptKeys(storage)).toEqual([])
	})

	it('writes the migrated record back as v1, one revision on', async () => {
		const storage = createMemoryStorage({ [KEY]: envelope(0, v0Data) })
		const store = createRecordStore(storage, codecWithV0)

		const loaded = await store.load(USER)
		if (loaded === null) {
			throw new Error('the v0 record did not load')
		}
		await store.save(USER, loaded)

		expect(storedRecord(storage, KEY)).toMatchObject({ version: 1, revision: 4, data: { difficulty: 'normal' } })
	})

	it('treats a v0 record as corrupt when the codec has no v0 migration', async () => {
		const storage = createMemoryStorage({ [KEY]: envelope(0, v0Data) })

		expect(await createLocalProgressStore(storage).load(USER)).toBeNull()
		expect(corruptKeys(storage)).toHaveLength(1)
	})
})

describe('a corrupt record', () => {
	const valid = progressCodec.toDto(sampleProgress())
	const cases: [string, string][] = [
		['unparseable JSON', '{"version":1,"updatedAt":'],
		['a record failing its schema', envelope(1, { ...valid, groceryMoney: -5 })],
		['an unknown installation', envelope(1, { ...valid, installations: ['oilTheHinges', 'goldenToaster'] })],
		['an installation owned twice', envelope(1, { ...valid, installations: ['buyABroom', 'buyABroom'] })],
		['an unknown night', envelope(1, { ...valid, nightId: 'night99' })],
		['an unknown difficulty', envelope(1, { ...valid, difficulty: 'impossible' })],
		['an extra field from another build', envelope(1, { ...valid, loadouts: [] })],
		['a version newer than this build', envelope(2, valid)],
	]

	it.each(cases)('%s loads null, is kept under one :corrupt: key, and the original is removed', async (_, raw) => {
		const storage = createMemoryStorage({ [KEY]: raw })
		const store = createLocalProgressStore(storage)

		expect(await store.load(USER)).toBeNull()

		const keys = corruptKeys(storage)
		expect(keys).toHaveLength(1)
		expect(keys[0]).toMatch(/^kd:local-spec:progress:corrupt:\d+$/)
		expect(storage.getItem(keys[0] ?? '')).toBe(raw)
		expect(storage.getItem(KEY)).toBeNull()

		expect(await store.load(USER)).toBeNull()
		expect(corruptKeys(storage)).toHaveLength(1)
		expect(storage.entries.size).toBe(1)
	})

	it('is preserved, not overwritten, by a save that never loaded it', async () => {
		const raw = '{ not json'
		const storage = createMemoryStorage({ [KEY]: raw })

		await createLocalProgressStore(storage).save(USER, sampleProgress())

		const keys = corruptKeys(storage)
		expect(keys).toHaveLength(1)
		expect(storage.getItem(keys[0] ?? '')).toBe(raw)
		expect(storedRecord(storage, KEY).revision).toBe(1)
	})

	it('never collides with an earlier copy taken in the same millisecond', async () => {
		vi.useFakeTimers({ now: 1_700_000_000_000 })
		try {
			const storage = createMemoryStorage({ [KEY]: 'first' })
			const store = createLocalProgressStore(storage)
			await store.load(USER)
			storage.setItem(KEY, 'second')
			await store.load(USER)

			expect(corruptKeys(storage).map(key => storage.getItem(key))).toEqual(['first', 'second'])
		} finally {
			vi.useRealTimers()
		}
	})
})

describe('the anonymous user', () => {
	it('is local-<uuid>, persisted, and the same on every sign-in', async () => {
		const storage = createMemoryStorage()
		const auth = createAnonymousAuthProvider(storage)

		expect(await auth.currentUser()).toBeNull()
		const user = await auth.signIn()
		expect(user.id).toMatch(/^local-[0-9a-f-]{36}$/)
		expect(user.isAnonymous).toBe(true)
		expect(storage.getItem('kd:auth:anonymousId')).toBe(user.id)

		expect(await auth.signIn()).toEqual(user)
		await auth.signOut()
		expect(await createAnonymousAuthProvider(storage).currentUser()).toEqual(user)
	})
})

describe('the mock remote', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	function mockLayer(failureRate: number): { layer: ReturnType<typeof createDataLayer>; storage: MemoryStorage } {
		const storage = createMemoryStorage()
		const layer = createDataLayer('mock', storage)
		if (layer.mock === null) {
			throw new Error('a mock layer has no control')
		}
		layer.mock.failureRate = failureRate
		return { layer, storage }
	}

	it('at failure rate 0, resolves no sooner than 200 ms and no later than 600 ms', async () => {
		const { layer } = mockLayer(0)
		const settled: boolean[] = []
		for (let i = 0; i < 20; i++) {
			void layer.progress.load(USER).then(() => (settled[i] = true))
		}

		await vi.advanceTimersByTimeAsync(MIN_LATENCY_MS - 1)
		expect(settled.filter(Boolean)).toHaveLength(0)

		await vi.advanceTimersByTimeAsync(MAX_LATENCY_MS - MIN_LATENCY_MS + 1)
		expect(settled.filter(Boolean)).toHaveLength(20)
	})

	it('at failure rate 0, delegates to the local adapters', async () => {
		const { layer, storage } = mockLayer(0)

		const saved = layer.progress.save(USER, sampleProgress())
		await vi.advanceTimersByTimeAsync(MAX_LATENCY_MS)
		await saved
		expect(storedRecord(storage, KEY).revision).toBe(1)
	})

	it('at failure rate 1, rejects every method of every store with RemoteUnavailableError', async () => {
		const { layer, storage } = mockLayer(1)
		const calls: [string, () => Promise<unknown>][] = [
			['auth.currentUser', () => layer.auth.currentUser()],
			['auth.signIn', () => layer.auth.signIn()],
			['auth.signOut', () => layer.auth.signOut()],
			['profile.load', () => layer.profile.load(USER)],
			['profile.save', () => layer.profile.save(USER, { displayName: 'Mara' })],
			['progress.load', () => layer.progress.load(USER)],
			['progress.save', () => layer.progress.save(USER, sampleProgress())],
			['settings.load', () => layer.settings.load(USER)],
			['settings.save', () => layer.settings.save(USER, { speed: 2 })],
		]

		const outcomes = calls.map(([name, call]) =>
			call().then(
				() => `${name} resolved`,
				(error: unknown) =>
					error instanceof RemoteUnavailableError ? 'rejected' : `${name}: ${String(error)}`,
			),
		)
		await vi.advanceTimersByTimeAsync(MAX_LATENCY_MS)

		expect(await Promise.all(outcomes)).toEqual(calls.map(() => 'rejected'))
		expect(storage.entries.size).toBe(0)
	})

	it('refuses the http mode by pointing at the backend plan', () => {
		expect(() => createDataLayer('http', createMemoryStorage())).toThrow(/PERSISTENCE\.md section 7/)
	})

	it('has no failure knob in local mode', () => {
		expect(createDataLayer('local', createMemoryStorage()).mock).toBeNull()
	})
})
