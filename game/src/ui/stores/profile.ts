import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import { useAuth } from '@/ui/composables/useAuth.ts'
import { useProfile } from '@/ui/composables/useProfile.ts'
import type { Profile } from '@/ui/composables/useProfile.ts'

/** The player's profile. Loaded, and nothing renders it yet. */
export const useProfileStore = defineStore('profile', () => {
	const auth = useAuth()
	const io = useProfile()

	const profile = shallowRef<Profile | null>(null)
	let loaded: Promise<void> | null = null

	async function load(): Promise<void> {
		try {
			const userId = (await auth.ensureUser()).id
			profile.value = (await io.load(userId)) ?? { displayName: null }
		} catch {
			// On the composable's `error`; the next ensureLoaded() tries again.
			loaded = null
		}
	}

	function ensureLoaded(): Promise<void> {
		loaded ??= load()
		return loaded
	}

	return { profile, ensureLoaded }
})
