import { createRecordStore } from '@/data/adapters/localStorage/record.ts'
import { settingsCodec } from '@/data/dto/settings.ts'
import type { KeyValueStorage } from '@/data/adapters/localStorage/record.ts'
import type { SettingsStore } from '@/data/ports/index.ts'

export function createLocalSettingsStore(storage: KeyValueStorage): SettingsStore {
	return createRecordStore(storage, settingsCodec)
}
