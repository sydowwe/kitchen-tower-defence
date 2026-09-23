import { describe, expect, it } from 'vitest'
import { isCleanse, isReveal } from '@/core/content/behaviours.ts'
import { ant, beetle, ENEMIES, fly, fruitFly, moth, roach } from '@/core/content/enemies.ts'
import { MAP_SOURCES } from '@/core/content/maps/index.ts'
import { resolveDamage } from '@/core/content/matrix.ts'
import { NIGHTS } from '@/core/content/nights.ts'
import { STATUS_DEFS } from '@/core/content/statuses.ts'
import { validateContent } from '@/core/content/schema.ts'
import {
	bakingSoda,
	cardboardBox,
	cookieJar,
	iceCubeTray,
	mousetrap,
	nightlight,
	saltShaker,
	sprayBottle,
	stickyTape,
	toaster,
	toasterCrumbTray,
	TOWERS,
	vinegarSpray,
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

	it('owes the doc s 200 crumbs to the enemy side when the jar is destroyed, and nothing for the tray', () => {
		expect(incomeOf(cookieJar.behaviours).enemyCrumbsOnDestroy).toBe(200)
		expect(incomeOf(toasterCrumbTray.behaviours).enemyCrumbsOnDestroy).toBe(0)
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

describe('the Mousetrap', () => {
	it('matches analytic-docs/CONTENT.md section 1 to the number', () => {
		expect(mousetrap.cost).toBe(90)
		expect(mousetrap.role).toBe('BURST_DPS')
		expect(mousetrap.glyph).toBe('🪤')
		expect(mousetrap.placement).toBe('off_path')
		expect(mousetrap.maxHp).toBe(100)
		/** The first tower in the game with a noise value at all. Step 13 is what reads it. */
		expect(mousetrap.noise).toBe(2)
		/** Section 1's behaviour note names STRONGEST explicitly, against section 5's default. */
		expect(mousetrap.defaultTargetingMode).toBe('STRONGEST')

		const snap = attackOf(mousetrap.behaviours)
		expect(snap.damage).toBe(60)
		expect(snap.damageType).toBe('physical')
		expect(snap.rangeTiles).toBe(1)
		expect(snap.targets).toBe('ground')
		/** No projectile: a trap snaps, and the hit lands the tick it fires. */
		expect(snap.projectileSpeed).toBe(0)
	})

	it('spends one charge per snap and takes the doc s 6.6 seconds to reset, on one number', () => {
		const behaviour = mousetrap.behaviours.find(entry => entry.kind === 'charge')

		// One outstanding: the trap holds nothing, and the tier that raises it is the Sticky Tape's.
		expect(behaviour).toEqual({ kind: 'charge', charges: 1, rearmTicks: 396, maxOutstanding: 1 })
		// The doc's 0.15/sec and its 6.6s rearm are the same interval written twice, so the cooldown
		// and the rearm are one number. `perSecond(0.15)` would be 400, and the four-tick difference
		// would make the rearm dead machinery.
		expect(attackOf(mousetrap.behaviours).cooldownTicks).toBe(396)
		expect(396 / 60).toBeCloseTo(6.6, 10)
		expect(Math.round((60 / 396) * 100) / 100).toBeCloseTo(0.15, 10)
	})
})

describe('the Cardboard Box', () => {
	it('matches analytic-docs/CONTENT.md section 1 to the number', () => {
		expect(cardboardBox.cost).toBe(25)
		expect(cardboardBox.role).toBe('WALL')
		expect(cardboardBox.glyph).toBe('📦')
		/** The one HP number the doc's table gives, and the only tower that is not the 100 default. */
		expect(cardboardBox.maxHp).toBe(200)
		/** The one tower in Act I that goes *on* the track. */
		expect(cardboardBox.placement).toBe('path_only')
		expect(cardboardBox.noise).toBe(0)
	})

	it('is a wall and nothing else: one behaviour, and it reflects nothing until its tier 3', () => {
		// How much it absorbs is `maxHp` and where it stands is `placement`; the only numbers on the
		// descriptor itself are what a chewing enemy gets back, and at tier 0 that is nothing.
		expect(cardboardBox.behaviours).toEqual([
			{ kind: 'barricade', reflectDamagePerTick: 0, reflectDamageType: 'physical' },
		])
	})
})

describe('every enemy s chew rate', () => {
	/**
	 * The `x 60` form, like the speeds: a per-second number pasted straight in fails here as well as
	 * failing the schema's `[0, 0.5]` bound. Every rate is the enemy's own `hp / 10` per second, which
	 * is the only thing tying the number to anything -- there is no column for it in
	 * analytic-docs/CONTENT.md section 2, and step 10C adds one only if the rate moves off that rule.
	 */
	it('is hp / 10 per second, authored in ticks', () => {
		expect(ant.meleeDamagePerTick * 60).toBeCloseTo(1.0, 10)
		expect(roach.meleeDamagePerTick * 60).toBeCloseTo(1.8, 10)
		expect(beetle.meleeDamagePerTick * 60).toBeCloseTo(5.5, 10)
		expect(fruitFly.meleeDamagePerTick * 60).toBeCloseTo(0.8, 10)
	})

	it('chews the Cardboard Box s 200 HP down in the number of seconds that implies', () => {
		// 200 / 1.0 per second for one Ant, and 200 / 5.5 for a Beetle.
		expect(cardboardBox.maxHp / (ant.meleeDamagePerTick * 60)).toBeCloseTo(200, 6)
		expect(cardboardBox.maxHp / (beetle.meleeDamagePerTick * 60)).toBeCloseTo(36.36, 2)
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

	it('carry the doc s status and defer every one of its numbers to the status table', () => {
		// All four overrides null: the bare form takes the def's magnitude, duration and stack count,
		// and lands on every hit. The Ice Cube Tray's tier 3 is what first fills two of them in.
		const deferred = { magnitude: null, durationTicks: null, stacks: null, everyNthHit: null }

		expect(attackOf(iceCubeTray.behaviours).applies).toEqual([{ kind: 'slow', ...deferred }])
		expect(attackOf(stickyTape.behaviours).applies).toEqual([{ kind: 'rooted', ...deferred }])
	})

	it('gives the tape the doc s three charges, no rearm, and one root at a time', () => {
		const behaviour = stickyTape.behaviours.find(entry => entry.kind === 'charge')

		// "Applies `Rooted` to one enemy at a time" is `maxOutstanding: 1` and not the charge count --
		// the tape has three strips and holds one of them stuck at once. Its tier 3 is what raises it.
		expect(behaviour).toEqual({ kind: 'charge', charges: 3, rearmTicks: 0, maxOutstanding: 1 })
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

describe('nights 4 to 9', () => {
	it('carries the wave counts of analytic-docs/CONTENT.md section 6', () => {
		expect(NIGHTS.map(night => night.waves.length)).toEqual([6, 7, 8, 8, 9, 9, 10, 10, 10, 11])
		expect(NIGHTS.map(night => night.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
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

	it('introduces the Fly on night 8 and nowhere earlier', () => {
		function enemiesOf(index: number): string[] {
			const night = NIGHTS.find(entry => entry.index === index)
			return (night?.waves ?? []).flatMap(wave => wave.entries.map(entry => entry.enemyDefId))
		}

		expect(enemiesOf(7)).not.toContain('fly')
		expect(enemiesOf(8)).toContain('fly')
		// Two of them, in wave 3, the way night 3 introduced the Roach and night 5 the Beetle.
		const firstWaveWithFlies = NIGHTS.find(night => night.index === 8)?.waves.findIndex(wave =>
			wave.entries.some(entry => entry.enemyDefId === 'fly'),
		)
		expect(firstWaveWithFlies).toBe(2)
	})

	it('calls one wave of night 8 that is nothing but flies', () => {
		const night = NIGHTS.find(entry => entry.index === 8)
		const pure = (night?.waves ?? []).filter(wave => wave.entries.every(entry => entry.enemyDefId === 'fly'))

		expect(pure).toHaveLength(1)
		// A board of ground-only towers watches all ten of them go past. It is also the wave a lost
		// Cookie Jar buys 33 more flies out of, at 6 crumbs each, which is why it is not also the wave
		// carrying the most ground pressure.
		expect(pure[0]?.entries[0]?.count).toBe(10)

		// And the wave after it is mixed, not a second pure one.
		const index = (night?.waves ?? []).findIndex(wave => wave.entries.every(entry => entry.enemyDefId === 'fly'))
		expect(night?.waves[index + 1]?.entries.map(entry => entry.enemyDefId)).toEqual([
			'ant',
			'roach',
			'beetle',
			'fly',
		])
	})

	it('introduces no enemy on night 9: it is night 8 with more of everything', () => {
		function enemiesOf(index: number): Set<string> {
			const night = NIGHTS.find(entry => entry.index === index)
			return new Set((night?.waves ?? []).flatMap(wave => wave.entries.map(entry => entry.enemyDefId)))
		}

		expect([...enemiesOf(9)].sort()).toEqual([...enemiesOf(8)].sort())
	})
})

describe('the Toaster', () => {
	it('matches analytic-docs/CONTENT.md section 1 to the number', () => {
		expect(toaster.cost).toBe(140)
		expect(toaster.role).toBe('BURST_DPS')
		expect(toaster.glyph).toBe('🔥')
		expect(toaster.maxHp).toBe(100)
		expect(toaster.placement).toBe('off_path')
		/** The loudest thing in the game. Nothing consumes it until step 13's noise meter. */
		expect(toaster.noise).toBe(3)
		/** Section 5 gives `STRONGEST` to a burst tower. */
		expect(toaster.defaultTargetingMode).toBe('STRONGEST')

		const shot = attackOf(toaster.behaviours)
		expect(shot.damage).toBe(35)
		expect(shot.damageType).toBe('fire')
		expect(shot.rangeTiles).toBe(4)
		/** The whole tower: the only def in the game that can touch nothing on the floor. */
		expect(shot.targets).toBe('air')
		/** 0.3 shots per second at 60 ticks per second, well under the schema's 600. */
		expect(shot.cooldownTicks).toBe(200)
		/** Section 1's T3 is "fires two projectiles", not splash. Upgrades are step 12. */
		expect(shot.splashRadiusTiles).toBe(0)
		/** Authored blind in 11A -- no column in the doc -- and re-tuned in 11C by watching one cross. */
		expect(shot.projectileSpeed).toBeCloseTo(0.12, 10)
	})

	it('is the ninth tower in the shop, appended and not inserted', () => {
		// `buildShop` prints `index + 1` on each button, so inserting a tower renumbers every hotkey.
		expect(TOWERS[8]?.id).toBe('toaster')
	})
})

describe('the Fly', () => {
	it('matches analytic-docs/CONTENT.md section 2 to the number', () => {
		expect(fly.hp).toBe(14)
		expect(fly.reward).toBe(6)
		expect(fly.steals).toBe(1)
		expect(fly.glyph).toBe('🪰')
		/** `air bug`, and deliberately **not** `swarm` -- that is the Fruit Fly's, and it multiplies. */
		expect(fly.tags).toEqual(['air', 'bug'])
	})

	it('walks 2.2 tiles a second, in ticks and under the schema cap', () => {
		expect(fly.speedTilesPerTick * 60).toBeCloseTo(2.2, 10)
		expect(fly.speedTilesPerTick).toBeLessThan(0.5)
	})

	it('crosses the Counter in about 14 seconds, the shortest window any tower gets', () => {
		const counter = MAP_SOURCES.find(map => map.id === 'counter')
		const crack = counter?.paths.find(path => path.id === 'crack')
		expect(crack).toBeDefined()

		expect((crack?.lengthTiles ?? 0) / (fly.speedTilesPerTick * 60)).toBeCloseTo(14.1, 0)
	})

	it('takes a Toaster shot at 42, and a Fruit Fly takes the same shot at 63', () => {
		const shot = attackOf(toaster.behaviours)

		// air x1.2 on 35, and the Fly's `bug` has no matrix row. One shot kills it four times over --
		// the Toaster's scarcity is its 0.3/sec rate and its range-4 circle, never its damage.
		expect(resolveDamage(shot.damage, shot.damageType, { tags: fly.tags, statuses: [] })).toBeCloseTo(42, 10)
		expect(fly.hp).toBeLessThan(42)

		// The Fruit Fly is `air swarm`, and section 3's rows multiply: 35 x 1.2 x 1.5.
		expect(resolveDamage(shot.damage, shot.damageType, { tags: fruitFly.tags, statuses: [] })).toBeCloseTo(63, 10)
	})
})

describe('the Nightlight', () => {
	it('matches analytic-docs/CONTENT.md section 1 to the number', () => {
		expect(nightlight.cost).toBe(100)
		expect(nightlight.role).toBe('DETECTION')
		expect(nightlight.glyph).toBe('💡')
		expect(nightlight.maxHp).toBe(100)
		expect(nightlight.placement).toBe('off_path')
		expect(nightlight.noise).toBe(0)
		/** Required by the schema and inert: it has nothing that picks a target. */
		expect(nightlight.defaultTargetingMode).toBe('CLOSEST')
	})

	it('is one `reveal` descriptor and nothing else -- no attack, no state, no plumbing', () => {
		expect(nightlight.behaviours).toHaveLength(1)

		const lamp = nightlight.behaviours.find(isReveal)
		expect(lamp).toBeDefined()
		/** Section 1's range 4. The five tiles a Moth sees it from is the light system's constant. */
		expect(lamp?.radiusTiles).toBe(4)
		expect(lamp?.attractsLightDrawn).toBe(true)
	})

	it('is the tenth tower in the shop, appended and not inserted', () => {
		expect(TOWERS[9]?.id).toBe('nightlight')
	})
})

describe('the Vinegar Spray', () => {
	it('matches analytic-docs/CONTENT.md section 1 to the number', () => {
		expect(vinegarSpray.cost).toBe(145)
		expect(vinegarSpray.role).toBe('DOT')
		expect(vinegarSpray.glyph).toBe('🧪')
		expect(vinegarSpray.maxHp).toBe(100)
		expect(vinegarSpray.placement).toBe('off_path')
		expect(vinegarSpray.noise).toBe(0)
		expect(vinegarSpray.defaultTargetingMode).toBe('FIRST')

		const shot = attackOf(vinegarSpray.behaviours)
		expect(shot.damage).toBe(4)
		expect(shot.damageType).toBe('chemical')
		expect(shot.cooldownTicks).toBe(60)
		expect(shot.rangeTiles).toBe(3)
		expect(shot.targets).toBe('both')
		expect(shot.projectileSpeed).toBeCloseTo(0.1, 10)
		expect(shot.splashRadiusTiles).toBe(0)
	})

	it('poisons at the status table s own 4/sec, with no override of its own', () => {
		const shot = attackOf(vinegarSpray.behaviours)

		expect(shot.applies).toEqual([
			{ kind: 'poison', magnitude: null, durationTicks: null, stacks: null, everyNthHit: null },
		])
		expect(STATUS_DEFS.poison.magnitude * 60).toBeCloseTo(4, 10)
	})

	it('scrubs one molded cell a pulse, within its own range, at its own rate', () => {
		expect(vinegarSpray.behaviours.find(isCleanse)).toEqual({
			kind: 'cleanse',
			radiusTiles: 3,
			clears: ['mold'],
			maxTilesPerPulse: 1,
			intervalTicks: 60,
		})
	})

	it('is the eleventh tower in the shop, appended and not inserted', () => {
		expect(TOWERS[10]?.id).toBe('vinegarSpray')
	})
})

describe('the Baking Soda', () => {
	it('matches analytic-docs/CONTENT.md section 1 to the number', () => {
		expect(bakingSoda.cost).toBe(80)
		expect(bakingSoda.role).toBe('AOE')
		/** Not the doc's original 🧂, which is the Salt Shaker's. */
		expect(bakingSoda.glyph).toBe('🥣')
		expect(bakingSoda.glyph).not.toBe(saltShaker.glyph)
		expect(bakingSoda.maxHp).toBe(100)
		expect(bakingSoda.placement).toBe('off_path')
		expect(bakingSoda.noise).toBe(0)
		expect(bakingSoda.defaultTargetingMode).toBe('CLOSEST')

		const shot = attackOf(bakingSoda.behaviours)
		expect(shot.damage).toBe(6)
		expect(shot.damageType).toBe('chemical')
		/** 0.6/sec is 100 ticks. */
		expect(shot.cooldownTicks).toBe(100)
		expect(shot.rangeTiles).toBe(2)
		expect(shot.targets).toBe('ground')
		/** The instant-AoE branch: no projectile, and a splash. */
		expect(shot.projectileSpeed).toBe(0)
		expect(shot.splashRadiusTiles).toBe(1.2)
		expect(shot.applies).toEqual([])
	})

	it('scrubs every slimed cell in the circle it splashes, at its own rate', () => {
		expect(bakingSoda.behaviours.find(isCleanse)).toEqual({
			kind: 'cleanse',
			radiusTiles: 1.2,
			clears: ['slime'],
			maxTilesPerPulse: 0,
			intervalTicks: 100,
		})
	})

	it('is the twelfth tower in the shop, appended and not inserted', () => {
		expect(TOWERS[11]?.id).toBe('bakingSoda')
		expect(TOWERS).toHaveLength(12)
	})
})

describe('the Moth', () => {
	it('matches analytic-docs/CONTENT.md section 2 to the number', () => {
		expect(moth.hp).toBe(25)
		expect(moth.reward).toBe(8)
		expect(moth.steals).toBe(1)
		expect(moth.glyph).toBe('🦋')
		/** The only tag in the roster a system reads by name: `core/systems/light.ts` pulls on it. */
		expect(moth.tags).toEqual(['air', 'light-drawn'])
	})

	it('walks 1.6 tiles a second, in ticks and under the schema cap', () => {
		expect(moth.speedTilesPerTick * 60).toBeCloseTo(1.6, 10)
		expect(moth.speedTilesPerTick).toBeLessThan(0.5)
	})

	it('takes a Toaster shot at 42, which one-shots it the way it one-shots a Fly', () => {
		const shot = attackOf(toaster.behaviours)

		// air x1.2 on 35, and `light-drawn` has no matrix row.
		expect(resolveDamage(shot.damage, shot.damageType, { tags: moth.tags, statuses: [] })).toBeCloseTo(42, 10)
		expect(moth.hp).toBeLessThan(42)
	})
})

describe('night 10', () => {
	it('introduces the Moth in wave 3 and nowhere earlier', () => {
		const scheduled = NIGHTS.filter(night => night.index < 10).flatMap(night =>
			night.waves.flatMap(wave => wave.entries.map(entry => entry.enemyDefId)),
		)
		expect(scheduled).not.toContain('moth')

		// Two of them, in wave 3, the way night 3 introduced the Roach and night 8 the Fly.
		const night = NIGHTS.find(entry => entry.index === 10)
		const first = night?.waves.findIndex(wave => wave.entries.some(entry => entry.enemyDefId === 'moth'))
		expect(first).toBe(2)
		expect(night?.waves[2]?.entries.find(entry => entry.enemyDefId === 'moth')?.count).toBe(2)
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
