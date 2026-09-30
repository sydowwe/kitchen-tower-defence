import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuth } from '@/ui/composables/useAuth.ts'
import { useSettings } from '@/ui/composables/useSettings.ts'
import type { Settings } from '@/ui/composables/useSettings.ts'

function defaultSettings(): Settings {
	return { speed: 1 }
}

/**
 * The player's settings. The one **optimistic** store: `update` assigns at once and `useSettings`
 * saves behind a debounce, because a speed button that waits on the network feels broken and a lost
 * preference is harmless.
 */
export const useSettingsStore = defineStore('settings', () => {
	const auth = useAuth()
	const io = useSettings()

	const settings = ref<Settings>(defaultSettings())

	let userId: string | null = null
	let loaded: Promise<void> | null = null
	/** An update that landed before the load did wins over the stored record, and is saved once known. */
	let touched = false

	async function load(): Promise<void> {
		try {
			userId = (await auth.ensureUser()).id
			const stored = await io.load(userId)
			if (touched) {
				io.saveDebounced(userId, settings.value)
			} else if (stored !== null) {
				settings.value = stored
			}
		} catch {
			// On the composable's `error`. The defaults, or what the player just chose, stand.
			loaded = null
		}
	}

	function ensureLoaded(): Promise<void> {
		loaded ??= load()
		return loaded
	}

	function update(patch: Partial<Settings>): void {
		settings.value = { ...settings.value, ...patch }
		touched = true
		if (userId !== null) {
			io.saveDebounced(userId, settings.value)
		}
	}

	return { settings, ensureLoaded, update }
})
