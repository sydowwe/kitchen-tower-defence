import { viaRemote } from '@/data/adapters/mockRemote/remote.ts'
import type { MockControl } from '@/data/adapters/mockRemote/remote.ts'

interface RecordPort<T> {
	load(userId: string): Promise<T | null>
	save(userId: string, value: T): Promise<void>
}

/** Any load/save store, behind the mock remote. */
export function remoteRecordStore<T>(inner: RecordPort<T>, control: MockControl): RecordPort<T> {
	return {
		load(userId) {
			return viaRemote(control, () => inner.load(userId))
		},
		save(userId, value) {
			return viaRemote(control, () => inner.save(userId, value))
		},
	}
}
