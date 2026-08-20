import { describe, expect, it } from 'vitest'
import { DAMAGE_MATRIX, resolveDamage } from '@/core/content/matrix.ts'
import type { DamageTarget } from '@/core/content/matrix.ts'
import type { DamageType, EnemyTag } from '@/core/types.ts'

/**
 * The assertions here are about the shape of the arithmetic, not about "damage works": that two tags
 * multiply rather than average, and that a tag with no row is a 1.0 and not a `NaN`. Both of those
 * drift silently -- a wrong product still deals a plausible-looking number.
 */

const DAMAGE_TYPES: DamageType[] = ['physical', 'fire', 'cold', 'chemical', 'electric']

function target(...tags: EnemyTag[]): DamageTarget {
	return { tags, statuses: [] }
}

describe('resolveDamage', () => {
	it('multiplies the tag with a row and ignores the descriptive one', () => {
		// Ant: ground, swarm, bug. Only `swarm` has a row, at 1.5 chemical.
		const ant = target('ground', 'swarm', 'bug')

		expect(resolveDamage(10, 'chemical', ant)).toBe(15)
	})

	it('takes the product of two tags, not the average or the first match', () => {
		const armoredSlime = target('armored', 'slime')

		// Written out on purpose: these are the two factors the product is made of.
		expect(resolveDamage(10, 'physical', armoredSlime)).toBeCloseTo(10 * 0.4 * 1.0)
		expect(resolveDamage(10, 'chemical', armoredSlime)).toBeCloseTo(10 * 1.0 * 1.5)

		// An average would be 0.7 and 1.25, a first match 0.4 and 1.0 -- neither is what this is.
		expect(resolveDamage(10, 'physical', armoredSlime)).not.toBeCloseTo(7)
		expect(resolveDamage(10, 'chemical', armoredSlime)).not.toBeCloseTo(12.5)
	})

	it('leaves a tagless enemy on exactly base for every damage type', () => {
		const untagged = target()

		for (const damageType of DAMAGE_TYPES) {
			expect(resolveDamage(10, damageType, untagged)).toBe(10)
		}
	})

	it('defaults a tag with no row to 1.0 rather than NaN', () => {
		// Every tag on this one is descriptive; none has a row in the matrix.
		const descriptiveOnly = target('ground', 'fast', 'bug', 'burrows', 'thief')

		for (const damageType of DAMAGE_TYPES) {
			expect(resolveDamage(10, damageType, descriptiveOnly)).toBe(10)
		}
	})

	it('does not mutate the enemy it was passed', () => {
		const enemy = target('armored', 'slime')
		const before = structuredClone(enemy)

		for (const damageType of DAMAGE_TYPES) {
			resolveDamage(10, damageType, enemy)
		}

		expect(enemy).toEqual(before)
	})

	it('reads the physical-immune row as a true zero', () => {
		expect(resolveDamage(999, 'physical', target('physical-immune'))).toBe(0)
	})
})

describe('DAMAGE_MATRIX', () => {
	it('carries the ten rows of the doc and nothing else', () => {
		expect(Object.keys(DAMAGE_MATRIX).sort()).toEqual(
			[
				'air',
				'armored',
				'boss',
				'douses-fire',
				'fungal',
				'mammal',
				'physical-immune',
				'slime',
				'soft',
				'swarm',
			].sort(),
		)
	})

	it('gives every row a number for every damage type', () => {
		for (const row of Object.values(DAMAGE_MATRIX)) {
			for (const damageType of DAMAGE_TYPES) {
				expect(Number.isFinite(row[damageType])).toBe(true)
			}
		}
	})
})
