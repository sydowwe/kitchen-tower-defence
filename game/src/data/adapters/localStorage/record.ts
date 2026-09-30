/**
 * The one read pipeline and the one write every localStorage store goes through
 * (analytic-docs/PERSISTENCE.md section 6).
 */

import { z } from 'zod'
import type { Codec } from '@/data/dto/codec.ts'

/** The slice of the Web Storage API the adapters use. Injected, so a spec passes an in-memory one. */
export interface KeyValueStorage {
	getItem(key: string): string | null
	setItem(key: string, value: string): void
	removeItem(key: string): void
}

/** What a store reads and writes. `updatedAt` and `revision` are unused in v1; sync will use them. */
export interface StoredRecord {
	version: number
	updatedAt: number
	revision: number
	data: unknown
}

const envelopeSchema = z.strictObject({
	version: z.number().int().nonnegative(),
	updatedAt: z.number(),
	revision: z.number().int().nonnegative(),
	data: z.unknown(),
})

export function recordKey(userId: string, store: string): string {
	return `kd:${userId}:${store}`
}

/**
 * Parse, envelope, migrations up to the codec's version, DTO schema, mapper. Throws on any failure,
 * including a version newer than the codec knows: that record is from a later build, and it is
 * preserved rather than guessed at.
 */
export function readRecord<T, Dto>(raw: string, codec: Codec<T, Dto>): { value: T; revision: number } {
	const record = envelopeSchema.parse(JSON.parse(raw))
	if (record.version > codec.version) {
		throw new Error(`${codec.store} record is v${record.version}, newer than v${codec.version}`)
	}

	let data = record.data
	for (let version = record.version; version < codec.version; version++) {
		const migrate = codec.migrations[version]
		if (migrate === undefined) {
			throw new Error(`no ${codec.store} migration from v${version}`)
		}
		data = migrate(data)
	}

	return { value: codec.fromDto(codec.schema.parse(data)), revision: record.revision }
}

/**
 * Moves a record that failed to read aside, under a `:corrupt:` key, and removes the original. The
 * remove matters: without it every boot re-reads the same bad record and writes another copy until
 * storage is full.
 */
function preserveCorrupt(storage: KeyValueStorage, key: string, raw: string): void {
	const base = `${key}:corrupt:${Date.now()}`
	let corruptKey = base
	for (let n = 1; storage.getItem(corruptKey) !== null; n++) {
		corruptKey = `${base}-${n}`
	}
	storage.setItem(corruptKey, raw)
	storage.removeItem(key)
}

export interface RecordStore<T> {
	load(userId: string): Promise<T | null>
	save(userId: string, value: T): Promise<void>
}

export function createRecordStore<T, Dto>(storage: KeyValueStorage, codec: Codec<T, Dto>): RecordStore<T> {
	/** The stored record, or null when there is none or it just went down the corrupt path. */
	function readStored(key: string): { value: T; revision: number } | null {
		const raw = storage.getItem(key)
		if (raw === null) {
			return null
		}
		try {
			return readRecord(raw, codec)
		} catch {
			preserveCorrupt(storage, key, raw)
			return null
		}
	}

	async function load(userId: string): Promise<T | null> {
		return readStored(recordKey(userId, codec.store))?.value ?? null
	}

	// Reads before writing, so a bad record nobody loaded is still preserved rather than overwritten.
	async function save(userId: string, value: T): Promise<void> {
		const key = recordKey(userId, codec.store)
		const record: StoredRecord = {
			version: codec.version,
			updatedAt: Date.now(),
			revision: (readStored(key)?.revision ?? 0) + 1,
			data: codec.toDto(value),
		}
		storage.setItem(key, JSON.stringify(record))
	}

	return { load, save }
}
