import { describe, expect, it } from 'vitest'
import { addToLoadout, checkLoadout, removeFromLoadout } from '@/core/loadout.ts'

/**
 * The list rules, Progress-free: what a click on a full counter drops, and the order a loadout's
 * problems are named in. The campaign's use of them is `campaign.spec.ts`.
 */

const FIVE = ['saltShaker', 'toasterCrumbTray', 'stickyTape', 'mousetrap', 'cookieJar']
const SIX = [...FIVE, 'sprayBottle']

describe('addToLoadout', () => {
	it('drops the oldest choice and appends when the counter is full', () => {
		expect(addToLoadout(FIVE, 'sprayBottle', 5)).toEqual([
			'toasterCrumbTray',
			'stickyTape',
			'mousetrap',
			'cookieJar',
			'sprayBottle',
		])
	})

	it('appends with room, and leaves the list it was given alone', () => {
		const three = FIVE.slice(0, 3)
		const added = addToLoadout(three, 'cookieJar', 5)

		expect(added).toEqual(['saltShaker', 'toasterCrumbTray', 'stickyTape', 'cookieJar'])
		expect(three).toHaveLength(3)
	})

	it('gives an unchanged copy of a list that already has it, full or not', () => {
		const same = addToLoadout(FIVE, 'stickyTape', 5)

		expect(same).toEqual(FIVE)
		expect(same).not.toBe(FIVE)
	})
})

describe('removeFromLoadout', () => {
	it('takes the one id out and keeps the rest in selection order', () => {
		expect(removeFromLoadout(FIVE, 'stickyTape')).toEqual([
			'saltShaker',
			'toasterCrumbTray',
			'mousetrap',
			'cookieJar',
		])
		expect(removeFromLoadout(FIVE, 'fan')).toEqual(FIVE)
	})
})

describe('checkLoadout', () => {
	it('names each problem, one at a time, in the order empty, duplicate, notUnlocked, tooMany', () => {
		expect(checkLoadout([], SIX, 5)).toBe('empty')
		// Duplicated, not unlocked and too many at once: the duplicate is named.
		expect(checkLoadout(['fan', 'fan', ...FIVE], SIX, 5)).toBe('duplicate')
		// Not unlocked and too many: the lock is named.
		expect(checkLoadout(['fan', ...FIVE], SIX, 5)).toBe('notUnlocked')
		expect(checkLoadout(SIX, SIX, 5)).toBe('tooMany')
	})

	it('passes three of six unlocked with five slots, and five with exactly five', () => {
		expect(checkLoadout(['mousetrap', 'saltShaker', 'sprayBottle'], SIX, 5)).toBeNull()
		expect(checkLoadout(FIVE, SIX, 5)).toBeNull()
		expect(checkLoadout(SIX, SIX, 6)).toBeNull()
	})
})
