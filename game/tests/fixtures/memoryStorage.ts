import type { KeyValueStorage } from '@/data/index.ts'

/**
 * An in-memory `KeyValueStorage`. Specs never touch the global `localStorage`: Node 22+ ships one
 * that warns or throws without a backing file.
 */
export interface MemoryStorage extends KeyValueStorage {
	readonly entries: Map<string, string>
}

export function createMemoryStorage(initial: Record<string, string> = {}): MemoryStorage {
	const entries = new Map(Object.entries(initial))
	return {
		entries,
		getItem(key) {
			return entries.get(key) ?? null
		},
		setItem(key, value) {
			entries.set(key, value)
		},
		removeItem(key) {
			entries.delete(key)
		},
	}
}
