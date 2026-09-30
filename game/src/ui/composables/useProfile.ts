import { dataLayer } from '@/data/index.ts'
import { createTracker } from '@/ui/composables/tracked.ts'
import type { Ref } from 'vue'
import type { Profile } from '@/data/index.ts'

export type { Profile } from '@/data/index.ts'

/** Profile I/O. `useProfileStore` holds the profile. */
const tracker = createTracker()

function load(userId: string): Promise<Profile | null> {
	return tracker.run(() => dataLayer().profile.load(userId))
}

function save(userId: string, profile: Profile): Promise<void> {
	return tracker.run(() => dataLayer().profile.save(userId, profile))
}

export interface UseProfile {
	loading: Readonly<Ref<boolean>>
	error: Readonly<Ref<Error | null>>
	load(userId: string): Promise<Profile | null>
	save(userId: string, profile: Profile): Promise<void>
}

export function useProfile(): UseProfile {
	return { loading: tracker.loading, error: tracker.error, load, save }
}
