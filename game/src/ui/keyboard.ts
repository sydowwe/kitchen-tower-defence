/**
 * The guard every keyboard shortcut in the app shares.
 *
 * It lived in `dev/debug/state.ts` until step 8C, next to the one tool that needed it. The game's own
 * hotkeys ship, and a shipping path importing `dev/` is exactly what `GameView.vue`'s dynamic-import
 * dance exists to avoid -- so the guard moved here and the two dev callers import it from `ui/`.
 * Two copies of it drift (step 4B), which is why there is only ever one.
 */

/** True while a text field has focus, so a shortcut key does not eat a keystroke. */
export function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) {
		return false
	}
	return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}
