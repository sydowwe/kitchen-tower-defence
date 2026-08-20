import { describe, expect, it } from 'vitest'
import { ant, ENEMIES } from '@/core/content/enemies.ts'
import { MAPS } from '@/core/content/maps/index.ts'
import { resolveDamage } from '@/core/content/matrix.ts'
import { NIGHTS } from '@/core/content/nights.ts'
import { validateContent } from '@/core/content/schema.ts'
import { saltShaker, TOWERS } from '@/core/content/towers.ts'
import { en } from '@/ui/locales/en.ts'
import type { AttackBehaviour } from '@/core/content/behaviours.ts'

/**
 * Two real defs, so this is the first check that the pipeline of steps 2B and 2C actually accepts
 * content rather than only itself: the schemas validate a def written from the doc, and the Ant's
 * tags produce the doc's multipliers through `resolveDamage`.
 *
 * The Salt Shaker's numbers are asserted literally. They are the calibration baseline the whole
 * economy is priced against (analytic-docs/CONTENT.md section 1), so a balance change has to be
 * made here and in the doc on purpose.
 */

function attackOf(behaviours: readonly { kind: string }[]): AttackBehaviour {
	const found = behaviours.find(behaviour => behaviour.kind === 'attack')
	expect(found).toBeDefined()
	return found as AttackBehaviour
}

describe('the authored content', () => {
	it('validates in full, every collection at once', () => {
		expect(() => validateContent({ towers: TOWERS, enemies: ENEMIES, maps: MAPS, nights: NIGHTS })).not.toThrow()
	})

	it('names every def with an i18n key that has an English entry', () => {
		for (const tower of TOWERS) {
			expect(tower.nameKey).toBe(`tower.${tower.id}.name`)
			expect(en.tower[tower.id].name.length).toBeGreaterThan(0)
			expect(en.tower[tower.id].description.length).toBeGreaterThan(0)
		}
		for (const enemy of ENEMIES) {
			expect(enemy.nameKey).toBe(`enemy.${enemy.id}.name`)
			expect(en.enemy[enemy.id].name.length).toBeGreaterThan(0)
			expect(en.enemy[enemy.id].description.length).toBeGreaterThan(0)
		}
	})
})

describe('the Salt Shaker', () => {
	it('matches analytic-docs/CONTENT.md section 1 to the number', () => {
		expect(saltShaker.cost).toBe(50)
		expect(saltShaker.role).toBe('BASIC_DPS')
		expect(saltShaker.glyph).toBe('🧂')
		expect(saltShaker.placement).toBe('off_path')
		expect(saltShaker.noise).toBe(0)
		expect(saltShaker.defaultTargetingMode).toBe('FIRST')

		const shot = attackOf(saltShaker.behaviours)
		expect(shot.damage).toBe(5)
		expect(shot.damageType).toBe('physical')
		expect(shot.rangeTiles).toBe(3)
		expect(shot.targets).toBe('ground')
		/** 1.0 shots per second at 60 ticks per second. A `1000` here would be milliseconds. */
		expect(shot.cooldownTicks).toBe(60)
		/** Splash is what the T3 upgrade adds (step 12), not something the base tower has. */
		expect(shot.splashRadiusTiles).toBe(0)
	})

	it('fails validation with its own id in the message when a field is wrong', () => {
		const broken = { ...saltShaker, cost: -50 }

		expect(() => validateContent({ towers: [broken] })).toThrow(/saltShaker/)
		expect(() => validateContent({ towers: [broken] })).toThrow(/cost/)
	})
})

describe('the Ant', () => {
	it('matches analytic-docs/CONTENT.md section 2 to the number', () => {
		expect(ant.hp).toBe(10)
		expect(ant.reward).toBe(3)
		expect(ant.steals).toBe(1)
		expect(ant.glyph).toBe('🐜')
		expect(ant.tags).toEqual(['ground', 'swarm', 'bug'])
	})

	it('walks exactly one tile per second, in ticks', () => {
		expect(ant.speedTilesPerTick * 60).toBeCloseTo(1.0, 10)
	})

	it('takes damage at the product of its tags, end to end through resolveDamage', () => {
		const target = { tags: ant.tags, statuses: [] }

		// ground x1.0 (no row), swarm x1.5, bug x1.0 (no row).
		expect(resolveDamage(10, 'chemical', target)).toBeCloseTo(10 * 1.0 * 1.5 * 1.0, 10)
		expect(resolveDamage(10, 'fire', target)).toBeCloseTo(10 * 1.0 * 1.5 * 1.0, 10)
		// swarm has no bonus against the other three: the multiplier is exactly 1.
		expect(resolveDamage(10, 'physical', target)).toBeCloseTo(10, 10)
		expect(resolveDamage(10, 'cold', target)).toBeCloseTo(10, 10)
		expect(resolveDamage(10, 'electric', target)).toBeCloseTo(10, 10)
	})
})
