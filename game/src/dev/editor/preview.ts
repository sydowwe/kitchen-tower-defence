/**
 * The one-shot handover from the editor to the game route.
 *
 * A `sessionStorage` slot holding exported JSON, written by the preview button and **taken** (read
 * and cleared) by `GameView.vue` inside its existing DEV branch. It lives in `dev/` so that `ui/`
 * does not acquire a second, ad-hoc save path next to the one `data/` owns (step 4B, decision 6),
 * and it is one-shot so a preview left over from yesterday cannot hijack the game route today.
 *
 * The JSON goes through `fromJson`, so what comes out the other side has been through the same hard
 * schema gate as a map on disk. A slot that fails it is dropped with a warning rather than thrown:
 * the game route is not the place to die of a bad editor state.
 */

import { loadMap } from '@/core/map.ts'
import { fromJson } from '@/dev/editor/serialize.ts'
import type { MapDef } from '@/core/types.ts'

const SLOT = 'kd.editor.preview'

/** Called from the editor's preview button, immediately before navigating to `/`. */
export function setPreviewMap(json: string): void {
	sessionStorage.setItem(SLOT, json)
}

/**
 * The pending preview map, or null. Clears the slot whether or not the JSON was usable.
 *
 * Returns a `MapDef` rather than a `MapSource` because the caller feeds `Renderer.setMap`, and
 * `loadMap` is where a half-finished map is finally refused.
 */
export function takePreviewMap(): MapDef | null {
	const raw = sessionStorage.getItem(SLOT)
	sessionStorage.removeItem(SLOT)
	if (raw === null) {
		return null
	}

	const result = fromJson(raw)
	if ('problems' in result) {
		console.warn('[editor] preview map rejected:', result.problems.map(problem => problem.message).join('; '))
		return null
	}

	try {
		return loadMap(result.source)
	} catch (cause) {
		console.warn('[editor] preview map would not load:', cause)
		return null
	}
}
