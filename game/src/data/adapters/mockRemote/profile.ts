import { remoteRecordStore } from '@/data/adapters/mockRemote/record.ts'
import type { MockControl } from '@/data/adapters/mockRemote/remote.ts'
import type { ProfileStore } from '@/data/ports/index.ts'

export function createRemoteProfileStore(inner: ProfileStore, control: MockControl): ProfileStore {
	return remoteRecordStore(inner, control)
}
