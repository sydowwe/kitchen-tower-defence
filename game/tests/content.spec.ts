import { describe, expect, it } from 'vitest'
import { ant, beetle, ENEMIES, fruitFly } from '@/core/content/enemies.ts'
import { MAP_SOURCES } from '@/core/content/maps/index.ts'
import { resolveDamage } from '@/core/content/matrix.ts'
import { NIGHTS } from '@/core/content/nights.ts'
import { STATUS_DEFS } from '@/core/content/statuses.ts'
import { validateContent } from '@/core/content/schema.ts'
import {
	cookieJar,
	iceCubeTray,
	saltShaker,
	sprayBottle,
	stickyTape,
	toasterCrumbTray,
	TOWERS,
} from '@/core/content/towers.ts'
import { en } from '@/ui/locales/en.ts'
import type {
	AttackBehaviour,
	CollectBehaviour,
	ConeAttackBehaviour,
	IncomeBehaviour,
} from '@/core/content/behaviours.ts'

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

function coneOf(behaviours: readonly { kind: string }[]): ConeAttackBehaviour {
	const found = behaviours.find(behaviour => behaviour.kind === 'coneAttack')
	expect(found).toBeDefined()
	return found as ConeAttackBehaviour
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
		expect(toasterCrumbTray.glyph).toBe('🧺')
		expect(toasterCrumbTray.placement).toBe('off_path')
		expect(toasterCrumbTray.noise).toBe(0)
		expect(toasterCrumbTray.maxHp).toBe(100)

		expect(cookieJar.cost).toBe(150)
		expect(cookieJar.role).toBe('ECONOMY')
		expect(cookieJar.glyph).toBe('🫙')
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

describe('the two status towers', () => {
	it('match analytic-docs/CONTENT.md section 1 to the number', () => {
		expect(iceCubeTray.cost).toBe(110)
		expect(iceCubeTray.role).toBe('SLOW')
		expect(iceCubeTray.glyph).toBe('🧊')
		expect(iceCubeTray.placement).toBe('off_path')
		expect(iceCubeTray.noise).toBe(0)
		expect(iceCubeTray.maxHp).toBe(100)

		const ice = attackOf(iceCubeTray.behaviours)
		expect(ice.damage).toBe(2)
		expect(ice.damageType).toBe('cold')
		expect(ice.rangeTiles).toBe(3)
		expect(ice.targets).toBe('ground')
		/** 0.8 shots per second: 60 / 0.8 is 75 ticks. */
		expect(ice.cooldownTicks).toBe(75)
		/** Authored here, not in the doc -- the Salt Shaker's retuned 0.1 is the only precedent. */
		expect(ice.projectileSpeed).toBeCloseTo(0.1, 10)

		expect(stickyTape.cost).toBe(40)
		expect(stickyTape.role).toBe('CONTROL')
		expect(stickyTape.glyph).toBe('🧻')
		expect(stickyTape.placement).toBe('off_path')
		expect(stickyTape.noise).toBe(0)

		const tape = attackOf(stickyTape.behaviours)
		expect(tape.damage).toBe(0)
		expect(tape.rangeTiles).toBe(2)
		expect(tape.targets).toBe('ground')
		/** 0.5 shots per second: 60 / 0.5 is 120 ticks. */
		expect(tape.cooldownTicks).toBe(120)
		/** No projectile: a strip of tape lands the tick it is laid. */
		expect(tape.projectileSpeed).toBe(0)
	})

	it('carry the doc s status and defer its magnitude to the status table', () => {
		expect(attackOf(iceCubeTray.behaviours).applies).toEqual([{ kind: 'slow', magnitude: null }])
		expect(attackOf(stickyTape.behaviours).applies).toEqual([{ kind: 'rooted', magnitude: null }])
	})

	it('gives the tape the doc s three charges and no rearm', () => {
		const behaviour = stickyTape.behaviours.find(entry => entry.kind === 'charge')

		expect(behaviour).toEqual({ kind: 'charge', charges: 3, rearmTicks: 0 })
	})

	it('makes cold a control type rather than a damage one, through the matrix', () => {
		const ice = attackOf(iceCubeTray.behaviours)

		// section 3: cold is 0.5x against `soft` and 1.2x against `armored`. 2 damage is not the point.
		expect(resolveDamage(ice.damage, 'cold', { tags: ['soft'], statuses: [] })).toBeCloseTo(1, 10)
		expect(resolveDamage(ice.damage, 'cold', { tags: ['armored'], statuses: [] })).toBeCloseTo(2.4, 10)
	})
})

describe('the Spray Bottle', () => {
	it('matches analytic-docs/CONTENT.md section 1 to the number', () => {
		expect(sprayBottle.cost).toBe(120)
		expect(sprayBottle.role).toBe('DOT')
		expect(sprayBottle.glyph).toBe('🧴')
		expect(sprayBottle.placement).toBe('off_path')
		expect(sprayBottle.noise).toBe(0)
		expect(sprayBottle.maxHp).toBe(100)
		/** Section 5: `CLOSEST` for auras and cones. */
		expect(sprayBottle.defaultTargetingMode).toBe('CLOSEST')

		const spray = coneOf(sprayBottle.behaviours)
		expect(spray.damage).toBe(3)
		expect(spray.damageType).toBe('chemical')
		expect(spray.rangeTiles).toBe(3)
		expect(spray.targets).toBe('both')
		/** 1.2 sprays per second: 60 / 1.2 is 50 ticks. */
		expect(spray.cooldownTicks).toBe(50)
		/** The opening has no column in the doc, so it is authored in `towers.ts` and pinned here. */
		expect(spray.coneHalfAngleDeg).toBe(30)
	})

	it('poisons at the row s own 2/sec, as a per-tick magnitude and not a per-second one', () => {
		const applied = coneOf(sprayBottle.behaviours).applies

		expect(applied).toHaveLength(1)
		expect(applied[0]?.kind).toBe('poison')
		// The `x 60` form, like the Ant's speed: a `2` pasted straight out of the doc fails here as
		// well as against the schema's [0, 1] bound.
		expect((applied[0]?.magnitude ?? 0) * 60).toBeCloseTo(2, 10)
		// Section 4's status-wide 4/sec is what every other source takes, and it is untouched.
		expect(STATUS_DEFS.poison.magnitude * 60).toBeCloseTo(4, 10)
	})

	it('is the one def that has no attack behaviour and still fires', () => {
		expect(sprayBottle.behaviours.some(behaviour => behaviour.kind === 'attack')).toBe(false)
	})
})

describe('the Beetle', () => {
	it('matches analytic-docs/CONTENT.md section 2 to the number', () => {
		expect(beetle.hp).toBe(55)
		expect(beetle.reward).toBe(10)
		expect(beetle.steals).toBe(2)
		expect(beetle.glyph).toBe('🪲')
		expect(beetle.tags).toEqual(['ground', 'bug'])
	})

	it('walks 0.7 tiles a second, in ticks', () => {
		expect(beetle.speedTilesPerTick * 60).toBeCloseTo(0.7, 10)
	})

	it('takes every damage type at 1.0: neither of its tags has a matrix row', () => {
		const target = { tags: beetle.tags, statuses: [] }

		for (const damageType of ['physical', 'fire', 'cold', 'chemical', 'electric'] as const) {
			expect(resolveDamage(10, damageType, target)).toBeCloseTo(10, 10)
		}
	})

	it('crosses the Counter in about 44 seconds, which is what makes it a bruiser', () => {
		const counter = MAP_SOURCES.find(map => map.id === 'counter')
		const crack = counter?.paths.find(path => path.id === 'crack')
		expect(crack).toBeDefined()

		expect((crack?.lengthTiles ?? 0) / (beetle.speedTilesPerTick * 60)).toBeCloseTo(44.5, 0)
	})
})

describe('nights 4 to 7', () => {
	it('carries the wave counts of analytic-docs/CONTENT.md section 6', () => {
		expect(NIGHTS.map(night => night.waves.length)).toEqual([6, 7, 8, 8, 9, 9, 10])
		expect(NIGHTS.map(night => night.index)).toEqual([1, 2, 3, 4, 5, 6, 7])
	})

	it('is authored on the Counter, on the lane the Counter actually has', () => {
		for (const night of NIGHTS) {
			// Step 21 re-maps 4-7 onto the Sink and the Pantry; `createWorld` throws until it does.
			expect(night.mapId).toBe('counter')
			for (const wave of night.waves) {
				for (const entry of wave.entries) {
					// An unknown lane is what `startWave` throws on, and it would throw mid-night.
					expect(entry.pathId).toBe('crack')
				}
			}
		}
	})

	it('introduces the Beetle on night 5 and nowhere earlier', () => {
		function enemiesOf(index: number): string[] {
			const night = NIGHTS.find(entry => entry.index === index)
			return (night?.waves ?? []).flatMap(wave => wave.entries.map(entry => entry.enemyDefId))
		}

		expect(enemiesOf(4)).not.toContain('beetle')
		expect(enemiesOf(5)).toContain('beetle')
		// Two of them, in wave 3, the way night 3 introduced the Roach.
		const firstWaveWithBeetles = NIGHTS.find(night => night.index === 5)?.waves.findIndex(wave =>
			wave.entries.some(entry => entry.enemyDefId === 'beetle'),
		)
		expect(firstWaveWithBeetles).toBe(2)
	})

	it('schedules only enemies the roster has', () => {
		const known = ENEMIES.map(enemy => enemy.id)

		for (const night of NIGHTS) {
			for (const wave of night.waves) {
				for (const entry of wave.entries) {
					expect(known).toContain(entry.enemyDefId)
				}
			}
		}
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
