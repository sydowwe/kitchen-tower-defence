/**
 * Whether the settings panel is open. One flag for the page: `ui/App.vue` mounts the one panel over
 * whatever route is showing, and the title, the Kitchen and the night's HUD each open it.
 *
 * **A panel, not a route** (step 23D, decision 5): a route away from `/night` unmounts `GameView` and
 * the world with it, and nights are not resumable. `GameView.vue` watches `open` to pause the night
 * while it is up, and puts back whatever pause state it found.
 */

import { readonly, ref, type Ref } from 'vue'

export interface SettingsPanel {
	open: Readonly<Ref<boolean>>
	show(): void
	hide(): void
}

const open = ref(false)

function show(): void {
	open.value = true
}

function hide(): void {
	open.value = false
}

export function useSettingsPanel(): SettingsPanel {
	return { open: readonly(open), show, hide }
}
