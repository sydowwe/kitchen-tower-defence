import { remoteRecordStore } from '@/data/adapters/mockRemote/record.ts'
import type { MockControl } from '@/data/adapters/mockRemote/remote.ts'
import type { SettingsStore } from '@/data/ports/index.ts'

export function createRemoteSettingsStore(inner: SettingsStore, control: MockControl): SettingsStore {
	return remoteRecordStore(inner, control)
}
