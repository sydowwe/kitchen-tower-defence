import { createRecordStore } from '@/data/adapters/localStorage/record.ts'
import { profileCodec } from '@/data/dto/profile.ts'
import type { KeyValueStorage } from '@/data/adapters/localStorage/record.ts'
import type { ProfileStore } from '@/data/ports/index.ts'

export function createLocalProfileStore(storage: KeyValueStorage): ProfileStore {
	return createRecordStore(storage, profileCodec)
}
