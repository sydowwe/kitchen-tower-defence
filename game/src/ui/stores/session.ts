import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LoadoutDraft } from '@/ui/loadoutView.ts'

/**
 * What lasts for this visit and is never saved.
 *
 * `loadoutDraft` is the counter as the player is setting it out, replaced wholesale on every click and
 * cleared once Start's save lands. A store rather than the loadout screen's own `ref`, so the draft
 * survives a trip to the Kitchen to buy the Drying Rack. `selectionFor` ignores it once it is for
 * another night, or names a tower the progress no longer has.
 */
export const useSessionStore = defineStore('session', () => {
	const loadoutDraft = ref<LoadoutDraft | null>(null)

	return { loadoutDraft }
})
