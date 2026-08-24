import { describe, expect, it } from 'vitest'
import { ant, ENEMIES, fruitFly } from '@/core/content/enemies.ts'
import { MAP_SOURCES } from '@/core/content/maps/index.ts'
import { resolveDamage } from '@/core/content/matrix.ts'
import { NIGHTS } from '@/core/content/nights.ts'
import { validateContent } from '@/core/content/schema.ts'
import { cookieJar, saltShaker, toasterCrumbTray, TOWERS } from '@/core/content/towers.ts'
import { en } from '@/ui/locales/en.ts'
import type { AttackBehaviour, CollectBehaviour, IncomeBehaviour } from '@/core/content/behaviours.ts'

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

function incomeOf(behaviours: readonly { kind: string }[]): IncomeBehaviour {
	const found = behaviours.find(behaviour => behaviour.kind === 'income')
	expect(found).toBeDefined()
	return found as IncomeBehaviour
}

function collectOf(behaviours: readonly { kind: string }[]): CollectBehaviour {
	const found = behaviours.find(behaviour => behaviour.kind === 'collect')
	expect(found).toBeDefined()
	return found as CollectBehaviour
}

describe('the authored content', () => {
	it('validates in full, every collection at once', () => {
		// `MAP_SOURCES`, not `MAPS`: what is authored and validated is the JSON, and `MAPS` is what
		// `loadMap` derives from it.
		expect(() =>
			validateContent({ towers: TOWERS, enemies: ENEMIES, maps: MAP_SOURCES, nights: NIGHTS }),
		).not.toThrow()
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
		/**
		 * 0.1 tiles per tick is 6 tiles/sec, retuned from 6B's 0.2 in step 6C -- the first session
		 * with a shot on screen to judge. The doc has no projectile-speed column, so this is
		 * authored in `towers.ts` and pinned here like every other Salt Shaker number. A 0 would
		 * mean the hit lands the same tick with no projectile at all.
		 */
		expect(shot.projectileSpeed).toBeCloseTo(0.1, 10)
	})

	it('fails validation with its own id in the message when a field is wrong', () => {
		const broken = { ...saltShaker, cost: -50 }

		expect(() => validateContent({ towers: [broken] })).toThrow(/saltShaker/)
		expect(() => validateContent({ towers: [broken] })).toThrow(/cost/)
	})
})

describe('the economy towers', () => {
	it('match analytic-docs/CONTENT.md section 1 to the number', () => {
		expect(toasterCrumbTray.cost).toBe(75)
		expect(toasterCrumbTray.role).toBe('ECONOMY')
		expect(toasterCrumbTray.glyph).toBe('🍞')
		expect(toasterCrumbTray.placement).toBe('off_path')
		expect(toasterCrumbTray.noise).toBe(0)
		expect(toasterCrumbTray.maxHp).toBe(100)

		expect(cookieJar.cost).toBe(150)
		expect(cookieJar.role).toBe('ECONOMY')
		expect(cookieJar.glyph).toBe('🍪')
		expect(cookieJar.placement).toBe('off_path')
		expect(cookieJar.noise).toBe(0)
		expect(cookieJar.maxHp).toBe(100)
	})

	it('pay the doc rate as a whole number of crumbs every 60 ticks', () => {
		const tray = incomeOf(toasterCrumbTray.behaviours)
		expect(tray.crumbsPerPayout).toBe(4)
		expect(tray.payoutIntervalTicks).toBe(60)

		const jar = incomeOf(cookieJar.behaviours)
		expect(jar.crumbsPerPayout).toBe(9)
		expect(jar.payoutIntervalTicks).toBe(60)
	})

	it('draws piles in from the doc radius, in ticks and not milliseconds', () => {
		const tray = collectOf(toasterCrumbTray.behaviours)
		expect(tray.radiusTiles).toBe(2.5)
		expect(tray.travelTicks).toBe(90)

		const jar = collectOf(cookieJar.behaviours)
		expect(jar.radiusTiles).toBe(3)
		expect(jar.travelTicks).toBe(90)

		// 1.5 seconds, and the assertion that catches 1500 being pasted in from the doc.
		expect(tray.travelTicks / 60).toBeCloseTo(1.5, 10)
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

describe('the Fruit Fly', () => {
	it('matches analytic-docs/CONTENT.md section 2 to the number', () => {
		expect(fruitFly.hp).toBe(8)
		expect(fruitFly.reward).toBe(2)
		expect(fruitFly.steals).toBe(1)
		expect(fruitFly.glyph).toBe('🦟')
		expect(fruitFly.tags).toEqual(['air', 'swarm', 'self-spawning'])
	})

	it('walks two tiles per second, in ticks and well under the schema cap', () => {
		expect(fruitFly.speedTilesPerTick * 60).toBeCloseTo(2.0, 10)
		expect(fruitFly.speedTilesPerTick).toBeLessThan(0.5)
	})

	it('is scheduled by no night in v1: it is a rot consequence, not a wave enemy', () => {
		const scheduled = NIGHTS.flatMap(night =>
			night.waves.flatMap(wave => wave.entries.map(entry => entry.enemyDefId)),
		)

		expect(scheduled).not.toContain('fruitFly')
	})
})
