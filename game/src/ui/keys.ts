/**
 * The keys: which action a key press is, and what to print for a binding.
 *
 * The bindings are `KeyboardEvent.code`, the physical key. `event.key` is the character the layout
 * puts there, and on an AZERTY keyboard the number row's are `&é"'…`, which is why reading it left the
 * digit hotkeys dead there. Everything on screen that names a key -- the shop's badges, the tooltips,
 * the debug hint -- prints `keyLabel` of a binding, so a rebound key is never shown under its old name.
 *
 * The model and the swap rule are `data/settings.ts`'s, reached through the composable.
 */

import { ACTIONS, defaultBindings, isBindable, rebind, TOWER_SLOTS } from '@/ui/composables/useSettings.ts'
import type { Action, Bindings, TowerSlot } from '@/ui/composables/useSettings.ts'

export { ACTIONS, defaultBindings, isBindable, rebind, TOWER_SLOTS }
export type { Action, Bindings, TowerSlot }

/** The `code`s that print as something other than their own name. */
const PUNCTUATION: Readonly<Record<string, string>> = {
	Comma: ',',
	Period: '.',
	Slash: '/',
	Semicolon: ';',
	Quote: "'",
	BracketLeft: '[',
	BracketRight: ']',
	Backslash: '\\',
	Minus: '-',
	Equal: '=',
	Backquote: '`',
	ArrowUp: '↑',
	ArrowDown: '↓',
	ArrowLeft: '←',
	ArrowRight: '→',
}

/**
 * `KeyN` is `N`, `Digit1` is `1`, `Comma` is `,`. Anything else is its own code -- `Space`, `Enter`,
 * `F2`, `Numpad1` -- which is near enough what the key has printed on it.
 */
export function keyLabel(code: string): string {
	if (/^Key[A-Z]$/.test(code)) {
		return code.slice(3)
	}
	if (/^Digit\d$/.test(code)) {
		return code.slice(5)
	}
	return PUNCTUATION[code] ?? code
}

/** The action bound to `code`, or null. */
export function actionFor(bindings: Readonly<Bindings>, code: string): Action | null {
	return ACTIONS.find(action => bindings[action] === code) ?? null
}

/** Every action but the ten tower slots. */
export type CommandAction = Exclude<Action, TowerSlot>

/**
 * What each action's key prints as, with the ten slots as one list in slot order: the shop indexes it
 * by position in `hotkeyTowers`, the way the keydown does `TOWER_SLOTS`.
 */
export interface KeyLabels extends Record<CommandAction, string> {
	towers: readonly string[]
}

export function keyLabels(bindings: Readonly<Bindings>): KeyLabels {
	return {
		pause: keyLabel(bindings.pause),
		speedDown: keyLabel(bindings.speedDown),
		speedUp: keyLabel(bindings.speedUp),
		callWave: keyLabel(bindings.callWave),
		sell: keyLabel(bindings.sell),
		upgrade: keyLabel(bindings.upgrade),
		towers: TOWER_SLOTS.map(slot => keyLabel(bindings[slot])),
	}
}
