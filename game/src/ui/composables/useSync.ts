import { ref } from 'vue'
import type { Ref } from 'vue'

/**
 * Sync state. There is no sync in v1, so this is `'local'` throughout, but the indicator that reads
 * it exists now (analytic-docs/PERSISTENCE.md section 4). The status widens when sync arrives.
 */
const status = ref<'local'>('local')
const lastSyncedAt = ref<number | null>(null)

async function retry(): Promise<void> {}

export interface UseSync {
	status: Readonly<Ref<'local'>>
	lastSyncedAt: Readonly<Ref<number | null>>
	retry(): Promise<void>
}

export function useSync(): UseSync {
	return { status, lastSyncedAt, retry }
}
