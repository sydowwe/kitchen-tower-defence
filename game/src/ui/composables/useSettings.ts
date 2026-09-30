import { dataLayer } from '@/data/index.ts'
import { createTracker } from '@/ui/composables/tracked.ts'
import type { Ref } from 'vue'
import type { Settings } from '@/data/index.ts'

export type { PlaySpeed, Settings } from '@/data/index.ts'

/** Settings writes are debounced (analytic-docs/PERSISTENCE.md section 6). */
export const SETTINGS_SAVE_DEBOUNCE_MS = 500

/** Settings I/O. `useSettingsStore` holds the settings, and assigns before this saves. */
const tracker = createTracker()
let timer: ReturnType<typeof setTimeout> | null = null
let queued: { userId: string; settings: Settings } | null = null

function load(userId: string): Promise<Settings | null> {
	return tracker.run(() => dataLayer().settings.load(userId))
}

/** Sends whatever is queued now. A failure is left on `error`: a lost speed preference is harmless. */
async function flush(): Promise<void> {
	if (timer !== null) {
		clearTimeout(timer)
		timer = null
	}
	const next = queued
	queued = null
	if (next === null) {
		return
	}
	try {
		await tracker.run(() => dataLayer().settings.save(next.userId, next.settings))
	} catch {
		// Kept on `error` by the tracker. The settings in memory stay as the player set them.
	}
}

/** Saves after 500 ms without another call. Only the last settings of a burst are written. */
function saveDebounced(userId: string, settings: Settings): void {
	queued = { userId, settings }
	if (timer !== null) {
		clearTimeout(timer)
	}
	timer = setTimeout(function saveQueued() {
		void flush()
	}, SETTINGS_SAVE_DEBOUNCE_MS)
}

export interface UseSettings {
	loading: Readonly<Ref<boolean>>
	error: Readonly<Ref<Error | null>>
	load(userId: string): Promise<Settings | null>
	saveDebounced(userId: string, settings: Settings): void
	flush(): Promise<void>
}

export function useSettings(): UseSettings {
	return { loading: tracker.loading, error: tracker.error, load, saveDebounced, flush }
}
