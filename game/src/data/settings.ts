/**
 * The settings model: its types, its defaults and the one rule about keys.
 *
 * Here rather than in `ui/` because `defaultSettings()` is what a new player starts with **and** what
 * the v1-to-v2 migration fills in, and two copies of it would start a migrated player on different
 * volumes than a new one. A store can't import `data/`, so `ui/composables/useSettings.ts` re-exports
 * all of it.
 *
 * `data/` imports neither `render/` nor `audio/`, so `Bus` and `Palette` restate their unions.
 * `ui/applySettings.ts` is where the two sides meet, and it asserts there that they agree.
 */

import type { Speed } from '@/loop.ts'

/** A speed the player chose. Never 0: pause is its own control, and a restored 0 opens frozen. */
export type PlaySpeed = Exclude<Speed, 0>

export const BUSES = ['master', 'effects', 'ambience'] as const
export type Bus = (typeof BUSES)[number]

export const PALETTES = ['standard', 'colourblind'] as const
export type Palette = (typeof PALETTES)[number]

/** The ten number keys' slots, in `hotkeyTowers` order. */
export const TOWER_SLOTS = [
	'tower1',
	'tower2',
	'tower3',
	'tower4',
	'tower5',
	'tower6',
	'tower7',
	'tower8',
	'tower9',
	'tower10',
] as const
export type TowerSlot = (typeof TOWER_SLOTS)[number]

/** Everything a key can be bound to. Escape is not here: it closes every panel, and can't be moved. */
export const ACTIONS = ['pause', 'speedDown', 'speedUp', 'callWave', 'sell', 'upgrade', ...TOWER_SLOTS] as const
export type Action = (typeof ACTIONS)[number]

/** Action to `KeyboardEvent.code`: the physical key, so a binding survives a change of keyboard layout. */
export type Bindings = Record<Action, string>

export interface Settings {
	speed: PlaySpeed
	/** 0 to 1 per bus. */
	volumes: Record<Bus, number>
	screenShake: boolean
	damageNumbers: boolean
	palette: Palette
	bindings: Bindings
	/** Ids of the first-night hints already shown. Never checked against a list: a stale id is inert. */
	seenHints: string[]
}

/**
 * Keys that can't be bound. Escape closes every panel; Tab moves focus; the modifiers alone are
 * half of a shift-click, and the panel waits for the key that comes with them.
 */
const UNBINDABLE = new Set([
	'Escape',
	'Tab',
	'ShiftLeft',
	'ShiftRight',
	'ControlLeft',
	'ControlRight',
	'AltLeft',
	'AltRight',
	'MetaLeft',
	'MetaRight',
	'CapsLock',
	'ContextMenu',
])

export function isBindable(code: string): boolean {
	return code !== '' && !UNBINDABLE.has(code)
}

export function defaultBindings(): Bindings {
	return {
		pause: 'Space',
		speedDown: 'Comma',
		speedUp: 'Period',
		callWave: 'KeyN',
		sell: 'KeyX',
		upgrade: 'KeyU',
		tower1: 'Digit1',
		tower2: 'Digit2',
		tower3: 'Digit3',
		tower4: 'Digit4',
		tower5: 'Digit5',
		tower6: 'Digit6',
		tower7: 'Digit7',
		tower8: 'Digit8',
		tower9: 'Digit9',
		tower10: 'Digit0',
	}
}

/** What a fresh profile starts with, and what the v1-to-v2 migration fills in. */
export function defaultSettings(): Settings {
	return {
		speed: 1,
		// `audio/engine.ts`'s `AUDIO_DEFAULTS`, copied: `data/` can't import `audio/`.
		volumes: { master: 0.8, effects: 1, ambience: 0.7 },
		screenShake: true,
		damageNumbers: true,
		palette: 'standard',
		bindings: defaultBindings(),
		seenHints: [],
	}
}

/**
 * `action` on `code`, and **a swap on a conflict**: whichever action had `code` takes over the key
 * `action` is leaving. A key never does two things, and a rebind never silently unbinds anything. An
 * unbindable code changes nothing.
 */
export function rebind(bindings: Readonly<Bindings>, action: Action, code: string): Bindings {
	const next = { ...bindings }
	if (!isBindable(code)) {
		return next
	}
	const holder = ACTIONS.find(other => other !== action && bindings[other] === code)
	if (holder !== undefined) {
		next[holder] = bindings[action]
	}
	next[action] = code
	return next
}
