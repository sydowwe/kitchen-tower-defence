import { describe, expect, it } from 'vitest'
import { ACTIONS, actionFor, defaultBindings, keyLabel, rebind } from '@/ui/keys.ts'
import type { Action } from '@/ui/keys.ts'

/**
 * The rebind rule: a key never does two things, and a rebind never silently unbinds anything. And the
 * labels, which are what the shop's badges and the tooltips print.
 */

/** The actions whose key differs between two sets of bindings. */
function moved(before: Record<Action, string>, after: Record<Action, string>): Action[] {
	return ACTIONS.filter(action => before[action] !== after[action])
}

describe('rebind', () => {
	it('gives call-wave X, and gives sell the N call-wave had. Nothing else moves', () => {
		const before = defaultBindings()
		const after = rebind(before, 'callWave', 'KeyX')

		expect(after.callWave).toBe('KeyX')
		expect(after.sell).toBe('KeyN')
		expect(moved(before, after)).toEqual(['callWave', 'sell'])
	})

	it('moves only the one action onto a free key', () => {
		const after = rebind(defaultBindings(), 'callWave', 'KeyW')

		expect(after.callWave).toBe('KeyW')
		expect(moved(defaultBindings(), after)).toEqual(['callWave'])
	})

	it('changes nothing for Escape, Tab or a modifier on its own', () => {
		for (const code of ['Escape', 'Tab', 'ShiftLeft', 'ControlRight', '']) {
			expect(rebind(defaultBindings(), 'pause', code)).toEqual(defaultBindings())
		}
	})

	it('leaves the bindings it was given alone', () => {
		const before = defaultBindings()
		rebind(before, 'callWave', 'KeyX')

		expect(before).toEqual(defaultBindings())
	})

	it('ships sixteen actions on sixteen different keys', () => {
		const codes = Object.values(defaultBindings())

		expect(Object.keys(defaultBindings())).toEqual([...ACTIONS])
		expect(new Set(codes).size).toBe(16)
	})
})

describe('the keys on screen', () => {
	it('labels a digit, a letter and the punctuation by what is printed on the key', () => {
		expect(keyLabel('Digit0')).toBe('0')
		expect(keyLabel('Digit7')).toBe('7')
		expect(keyLabel('KeyN')).toBe('N')
		expect(keyLabel('Comma')).toBe(',')
		expect(keyLabel('Period')).toBe('.')
		expect(keyLabel('Space')).toBe('Space')
	})

	it('reads a press by its code, so a layout that types & on the 1 key still arms slot 1', () => {
		expect(actionFor(defaultBindings(), 'Digit1')).toBe('tower1')
		expect(actionFor(defaultBindings(), 'Digit0')).toBe('tower10')
		expect(actionFor(rebind(defaultBindings(), 'callWave', 'KeyW'), 'KeyN')).toBeNull()
	})
})
