import { createRecordStore } from '@/data/adapters/localStorage/record.ts'
import { progressCodec } from '@/data/dto/progress.ts'
import type { KeyValueStorage } from '@/data/adapters/localStorage/record.ts'
import type { ProgressStore } from '@/data/ports/index.ts'

export function createLocalProgressStore(storage: KeyValueStorage): ProgressStore {
	return createRecordStore(storage, progressCodec)
}
