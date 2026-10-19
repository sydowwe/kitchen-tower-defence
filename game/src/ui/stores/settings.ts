import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuth } from '@/ui/composables/useAuth.ts'
import { defaultSettings, rebind as rebindKey, useSettings } from '@/ui/composables/useSettings.ts'
import type { Action, Bus, Settings } from '@/ui/composables/useSettings.ts'

/**
 * The player's settings. The one **optimistic** store: `update` assigns at once and `useSettings`
 * saves behind a debounce, because a speed button that waits on the network feels broken and a lost
 * preference is harmless.
 *
 * Every write replaces `settings` wholesale, so `ui/App.vue`'s one watch sees each of them.
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

	function setVolume(bus: Bus, value: number): void {
		update({ volumes: { ...settings.value.volumes, [bus]: value } })
	}

	/** Swaps on a conflict -- see `rebind` in `data/settings.ts`. */
	function rebind(action: Action, code: string): void {
		update({ bindings: rebindKey(settings.value.bindings, action, code) })
	}

	function markHintSeen(id: string): void {
		if (!settings.value.seenHints.includes(id)) {
			update({ seenHints: [...settings.value.seenHints, id] })
		}
	}

	function resetHints(): void {
		update({ seenHints: [] })
	}

	return { settings, ensureLoaded, update, setVolume, rebind, markHintSeen, resetHints }
})
