import { remoteRecordStore } from '@/data/adapters/mockRemote/record.ts'
import type { MockControl } from '@/data/adapters/mockRemote/remote.ts'
import type { ProgressStore } from '@/data/ports/index.ts'

export function createRemoteProgressStore(inner: ProgressStore, control: MockControl): ProgressStore {
	return remoteRecordStore(inner, control)
}
