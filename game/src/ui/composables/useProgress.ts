import { dataLayer } from '@/data/index.ts'
import { createTracker } from '@/ui/composables/tracked.ts'
import type { Ref } from 'vue'
import type { Progress } from '@/data/index.ts'

/**
 * Progress I/O, and nothing else: it holds no game state. `useProgressStore` holds the progress and
 * runs the campaign through this (analytic-docs/PERSISTENCE.md section 4).
 */
const tracker = createTracker()

function load(userId: string): Promise<Progress | null> {
	return tracker.run(() => dataLayer().progress.load(userId))
}

function save(userId: string, progress: Progress): Promise<void> {
	return tracker.run(() => dataLayer().progress.save(userId, progress))
}

export interface UseProgress {
	loading: Readonly<Ref<boolean>>
	error: Readonly<Ref<Error | null>>
	load(userId: string): Promise<Progress | null>
	save(userId: string, progress: Progress): Promise<void>
}

export function useProgress(): UseProgress {
	return { loading: tracker.loading, error: tracker.error, load, save }
}
