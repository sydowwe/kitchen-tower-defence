import { describe, expect, it } from 'vitest'
import {
	isAura,
	isBait,
	isCharge,
	isCleanse,
	isFiring,
	isPushback,
	isReveal,
	isTileEffect,
} from '@/core/content/behaviours.ts'
import { ant, beetle, ENEMIES, fly, fruitFly, mold, moth, mouse, roach } from '@/core/content/enemies.ts'
import { effectiveDef, getMapDef, unlockNightOf } from '@/core/content/index.ts'
import { MAP_SOURCES } from '@/core/content/maps/index.ts'
import { resolveDamage } from '@/core/content/matrix.ts'
import { NIGHT_MODIFIERS } from '@/core/content/modifiers.ts'
import { NIGHTS } from '@/core/content/nights.ts'
import { STATUS_DEFS } from '@/core/content/statuses.ts'
import { validateContent } from '@/core/content/schema.ts'
import {
	bakingSoda,
	candle,
	cardboardBox,
	cookieJar,
	fan,
	flyPaper,
	gasStoveBurner,
	honeyPot,
	iceCubeTray,
	mintPot,
	mousetrap,
	nightlight,
	POST_V1_TOWERS,
	saltShaker,
	sprayBottle,
	stickyTape,
	toaster,
	toasterCrumbTray,
	TOWERS,
	vinegarSpray,
} from '@/core/content/towers.ts'
import { startWave } from '@/core/systems/spawn.ts'
import { createWorld } from '@/core/world.ts'
import { en } from '@/ui/locales/en.ts'
import { compositionBreaks, moldReachableTiles, mouseBreaks } from './fixtures/nightRules.ts'
import type {
	AttackBehaviour,
	CollectBehaviour,
	ConeAttackBehaviour,
	IncomeBehaviour,
} from '@/core/content/behaviours.ts'
import type { NightDef } from '@/core/content/schema.ts'
import type { World } from '@/core/types.ts'

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
			validateContent({
				towers: TOWERS,
				enemies: ENEMIES,
				maps: MAP_SOURCES,
				nights: NIGHTS,
				modifiers: NIGHT_MODIFIERS,
			}),
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

describe('tower unlocks', () => {
	/** analytic-docs/CONTENT.md section 6's *Unlocks tower* column, transcribed by hand from the doc. */
	const SECTION_6: Record<number, string[]> = {
		1: ['saltShaker', 'toasterCrumbTray'],
		2: ['stickyTape'],
		3: ['mousetrap'],
		4: ['cookieJar'],
		5: ['sprayBottle'],
		6: ['cardboardBox'],
		7: ['iceCubeTray'],
		8: ['toaster'],
		9: ['nightlight'],
		10: ['candle'],
		11: ['vinegarSpray'],
		12: ['gasStoveBurner'],
		13: ['bayLeaf'],
		14: ['flyPaper'],
		15: ['bakingSoda'],
		16: ['honeyPot'],
		17: ['lemon'],
		18: ['fan'],
	}

	it('is section 6’s table, night by night', () => {
		const authored: Record<number, string[]> = {}
		for (const night of NIGHTS) {
			authored[night.index] = night.unlocksTowerIds ?? []
		}

		expect(authored).toEqual(SECTION_6)
	})

	it('unlocks every tower in the roster exactly once, and no post-v1 tower at all', () => {
		const unlocked = NIGHTS.flatMap(night => night.unlocksTowerIds ?? [])

		expect(unlocked).toHaveLength(19)
		expect([...unlocked].sort()).toEqual(TOWERS.map((def): string => def.id).sort())
		for (const def of POST_V1_TOWERS) {
			expect(unlocked).not.toContain(def.id)
			expect(unlockNightOf(def.id)).toBeNull()
		}
	})

	it('answers which night unlocks a tower', () => {
		expect(unlockNightOf('saltShaker')).toBe(1)
		expect(unlockNightOf('toasterCrumbTray')).toBe(1)
		expect(unlockNightOf('cookieJar')).toBe(4)
		expect(unlockNightOf('flyPaper')).toBe(14)
		expect(unlockNightOf('fan')).toBe(18)
	})

	it('rejects an unlock naming a tower that does not exist, and one named twice', () => {
		const [first, second] = NIGHTS
		if (first === undefined || second === undefined) {
			throw new Error('expected two nights')
		}

		expect(() =>
			validateContent({ towers: TOWERS, nights: [{ ...first, unlocksTowerIds: ['saltShakr'] }] }),
		).toThrow(/night 'night01': unlocksTowerIds: no tower 'saltShakr'/)
		expect(() =>
			validateContent({
				towers: TOWERS,
				nights: [first, { ...second, unlocksTowerIds: ['saltShaker'] }],
			}),
		).toThrow(/night 'night02': unlocksTowerIds: 'saltShaker' is already unlocked by 'night01'/)
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
		expect(NIGHTS.map(night => night.waves.length)).toEqual([
			6, 7, 8, 8, 9, 9, 10, 10, 10, 11, 11, 12, 12, 12, 13, 13, 14, 14,
		])
		// In index order, because Continue walks array positions.
		expect(NIGHTS.map(night => night.index)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
		])
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

describe('the campaign on its maps', () => {
	/** analytic-docs/CONTENT.md section 6's Map and Modifier columns, night by night. */
	const SECTION_6: [mapId: string, modifierId: string | undefined][] = [
		['counter', undefined],
		['counter', undefined],
		['counter', undefined],
		['sink', undefined],
		['sink', undefined],
		['sink', 'dishesLeftOut'],
		['pantry', undefined],
		['pantry', undefined],
		['pantry', undefined],
		['stove', undefined],
		['stove', 'dampNight'],
		['stove', undefined],
		['table', undefined],
		['table', undefined],
		['table', 'dinnerParty'],
		['floor', 'movingDay'],
		['floor', undefined],
		['floor', 'heatwave'],
	]

	/** Every campaign night is played at `GameView.vue`'s seed, so this is the board moving day leaves. */
	const SEED = 1234

	function worldFor(night: NightDef): World {
		return createWorld({ seed: SEED, mapId: night.mapId, nightId: night.id, difficulty: 'normal' })
	}

	it('puts every night on section 6’s map, with section 6’s modifier', () => {
		expect(NIGHTS.map(night => [night.mapId, night.modifierId])).toEqual(SECTION_6)
	})

	it('names only lanes its map has, and stands every mold short of its lane’s end', () => {
		for (const night of NIGHTS) {
			const paths = getMapDef(night.mapId).paths
			for (const entry of night.waves.flatMap(wave => wave.entries)) {
				if (entry.pathId === undefined) {
					expect(entry.startDistanceTiles, `${night.id} ${entry.enemyDefId}`).toBeUndefined()
					continue
				}
				const path = paths.find(candidate => candidate.id === entry.pathId)
				expect(path, `${night.id} names '${entry.pathId}'`).toBeDefined()
				expect(entry.startDistanceTiles ?? 0).toBeLessThan(path?.lengthTiles ?? 0)
			}
		}
	})

	it('starts every wave of every night on its own map, and walks every lane that map has', () => {
		for (const night of NIGHTS) {
			const world = worldFor(night)
			const walked = new Set<string>()
			night.waves.forEach((_, index) => {
				expect(() => startWave(world, night, index)).not.toThrow()
				for (const spawn of world.night.wave?.spawns ?? []) {
					walked.add(spawn.pathId)
				}
			})
			expect([...walked].sort(), night.id).toEqual(world.map.paths.map(path => path.id).sort())
		}
	})

	it('stands every mold in reach of a tile a tower can still be built on, boxes and all', () => {
		for (const night of NIGHTS) {
			const world = worldFor(night)
			for (const entry of night.waves.flatMap(wave => wave.entries)) {
				const reachable = moldReachableTiles(world.map, entry)
				if (reachable !== null) {
					expect(
						reachable,
						`${night.id}: a mold ${entry.startDistanceTiles} along '${entry.pathId}'`,
					).toBeGreaterThan(0)
				}
			}
		}
	})

	it('stands one mold per entry, and never sends a Silverfish-only wave', () => {
		for (const night of NIGHTS) {
			night.waves.forEach((wave, index) => {
				expect(compositionBreaks(wave), `${night.id} wave ${index}`).toEqual([])
			})
		}
	})

	it('authors night 15 plain: the dinner party doubles it, and the file does not', () => {
		function meanCountPerWave(index: number): number {
			const night = NIGHTS.find(entry => entry.index === index)
			const waves = night?.waves ?? []
			return waves.flatMap(wave => wave.entries).reduce((sum, entry) => sum + entry.count, 0) / waves.length
		}

		expect(meanCountPerWave(15)).toBeLessThanOrEqual(meanCountPerWave(14))
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
	})
})

describe('the Bay Leaf and the Lemon', () => {
	it('are the thirteenth and fourteenth towers in the shop, appended and not inserted', () => {
		expect(TOWERS[12]?.id).toBe('bayLeaf')
		expect(TOWERS[13]?.id).toBe('lemon')
	})
})

describe('the Candle', () => {
	it('matches analytic-docs/CONTENT.md section 1 to the number', () => {
		expect(candle.cost).toBe(130)
		expect(candle.role).toBe('DOT')
		expect(candle.glyph).toBe('🕯️')
		expect(candle.maxHp).toBe(100)
		expect(candle.placement).toBe('off_path')
		expect(candle.noise).toBe(0)
		expect(candle.defaultTargetingMode).toBe('CLOSEST')
	})

	it('is a 5/sec fire aura that applies nothing, and a light of the same radius', () => {
		const glow = candle.behaviours.find(isAura)
		expect(glow).toBeDefined()
		expect(glow?.radiusTiles).toBe(2)
		expect((glow?.damagePerTick ?? 0) * 60).toBeCloseTo(5, 10)
		expect(glow?.damageType).toBe('fire')
		expect(glow?.targets).toBe('both')
		expect(glow?.applies).toEqual([])

		expect(candle.behaviours.find(isReveal)).toEqual({ kind: 'reveal', radiusTiles: 2, attractsLightDrawn: true })
		expect(candle.behaviours).toHaveLength(2)
	})
})

describe('the Gas Stove Burner', () => {
	it('matches analytic-docs/CONTENT.md section 1 to the number', () => {
		expect(gasStoveBurner.cost).toBe(200)
		expect(gasStoveBurner.role).toBe('TILE_EFFECT')
		expect(gasStoveBurner.glyph).toBe('♨️')
		expect(gasStoveBurner.maxHp).toBe(100)
		expect(gasStoveBurner.placement).toBe('path_only')
		expect(gasStoveBurner.noise).toBe(2)
		expect(gasStoveBurner.behaviours).toHaveLength(1)
	})

	it('burns 14/sec as a per-TICK magnitude, which the schema would not catch as a bare 14', () => {
		const burner = gasStoveBurner.behaviours.find(isTileEffect)
		expect(burner).toBeDefined()
		expect(burner?.effect).toBe('heat')
		expect(burner?.radiusTiles).toBe(0)
		expect((burner?.magnitude ?? 0) * 60).toBeCloseTo(14, 10)
		expect(burner?.magnitude).toBeLessThan(1)
		// Rewritten every tick, each write living two: see decision 2 of step 17A.
		expect(burner?.durationTicks).toBe(2)
		expect(burner?.refreshIntervalTicks).toBe(1)
	})
})

describe('the Fly Paper', () => {
	it('matches analytic-docs/CONTENT.md section 1 to the number', () => {
		expect(flyPaper.cost).toBe(35)
		expect(flyPaper.role).toBe('CONTROL')
		expect(flyPaper.glyph).toBe('🎗️')
		expect(flyPaper.maxHp).toBe(100)
		expect(flyPaper.placement).toBe('off_path')
		expect(flyPaper.noise).toBe(0)
		expect(flyPaper.defaultTargetingMode).toBe('CLOSEST')

		const shot = attackOf(flyPaper.behaviours)
		expect(shot.damage).toBe(0)
		expect(shot.rangeTiles).toBe(2)
		expect(shot.targets).toBe('air')
		expect(shot.projectileSpeed).toBe(0)
		expect(shot.applies.map(application => application.kind)).toEqual(['rooted'])
	})

	it('holds two flyers at once and never rearms', () => {
		expect(flyPaper.behaviours.find(isCharge)).toEqual({
			kind: 'charge',
			charges: 2,
			rearmTicks: 0,
			maxOutstanding: 2,
		})
	})
})

describe('the Candle, the Gas Stove Burner and the Fly Paper', () => {
	it('are the fifteenth to seventeenth towers in the shop, appended and not inserted', () => {
		expect(TOWERS[14]?.id).toBe('candle')
		expect(TOWERS[15]?.id).toBe('gasStoveBurner')
		expect(TOWERS[16]?.id).toBe('flyPaper')
	})
})

describe('the Honey Pot', () => {
	it('matches analytic-docs/CONTENT.md section 1 to the number', () => {
		expect(honeyPot.cost).toBe(175)
		expect(honeyPot.role).toBe('ECONOMY')
		expect(honeyPot.glyph).toBe('🍯')
		expect(honeyPot.placement).toBe('off_path')
		expect(honeyPot.noise).toBe(0)
		expect(honeyPot.defaultTargetingMode).toBe('CLOSEST')
		expect(honeyPot.behaviours.some(isFiring)).toBe(false)
	})

	it('pays 7 crumbs a second, the Economy rates row, and owes the enemy side nothing', () => {
		const pay = incomeOf(honeyPot.behaviours)
		expect(pay.crumbsPerPayout).toBe(7)
		expect(pay.payoutIntervalTicks).toBe(60)
		expect(pay.enemyCrumbsOnDestroy).toBe(0)
	})

	it('baits ground enemies within 3 tiles for three seconds, in ticks', () => {
		expect(honeyPot.behaviours.find(isBait)).toEqual({
			kind: 'bait',
			radiusTiles: 3,
			targets: 'ground',
			durationTicks: 180,
		})
	})

	it('is the eighteenth tower in the shop, appended and not inserted', () => {
		expect(TOWERS[17]?.id).toBe('honeyPot')
	})
})

describe('the Fan', () => {
	it('matches analytic-docs/CONTENT.md section 1 to the number', () => {
		expect(fan.cost).toBe(170)
		expect(fan.role).toBe('CONTROL')
		expect(fan.glyph).toBe('🌀')
		expect(fan.placement).toBe('off_path')
		expect(fan.noise).toBe(1)
		expect(fan.maxHp).toBe(100)
		expect(fan.defaultTargetingMode).toBe('CLOSEST')
	})

	it('is a 1-damage, 1.5/sec, range-4 cone at flyers, in ticks', () => {
		const cone = coneOf(fan.behaviours)
		expect(cone.damage).toBe(1)
		expect(cone.cooldownTicks).toBe(40)
		expect(cone.rangeTiles).toBe(4)
		expect(cone.targets).toBe('air')
	})

	it('carries a pushback rider of 1.2 tiles at flyers, and no range or clock of its own', () => {
		expect(fan.behaviours.find(isPushback)).toEqual({
			kind: 'pushback',
			pushTiles: 1.2,
			targets: 'air',
			applies: [],
		})
	})

	it('widens its range at tiers 1 and 2 and never its push or its rate', () => {
		const tierTwo = effectiveDef('fan', 2)
		expect(coneOf(tierTwo.behaviours).rangeTiles).toBe(5)
		expect(coneOf(tierTwo.behaviours).cooldownTicks).toBe(coneOf(fan.behaviours).cooldownTicks)
		expect(tierTwo.behaviours.find(isPushback)?.pushTiles).toBe(1.2)
	})

	it('marks what the gust reaches at tier 3', () => {
		expect(
			effectiveDef('fan', 3)
				.behaviours.find(isPushback)
				?.applies.map(application => application.kind),
		).toEqual(['marked'])
	})

	it('is the nineteenth tower in the shop, appended and not inserted', () => {
		expect(TOWERS[18]?.id).toBe('fan')
		expect(TOWERS).toHaveLength(19)
	})
})

describe('the Mint Pot', () => {
	it('is authored in POST_V1_TOWERS and nowhere a player can buy it', () => {
		expect(POST_V1_TOWERS).toContain(mintPot)
		// Widened to `string`: the literal-id union already says it is absent, and this says it at runtime.
		expect(TOWERS.map((def): string => def.id)).not.toContain(mintPot.id)
	})

	it('validates, and is a whole-circle ground cone with a pushback rider', () => {
		expect(() => validateContent({ towers: [mintPot] })).not.toThrow()
		expect(coneOf(mintPot.behaviours).coneHalfAngleDeg).toBe(180)
		expect(coneOf(mintPot.behaviours).targets).toBe('ground')
		expect(mintPot.behaviours.find(isPushback)?.targets).toBe('ground')
	})
})

describe('the Mold', () => {
	it('is push-immune, because it does not walk', () => {
		expect(mold.speedTilesPerTick).toBe(0)
		expect(mold.tags).toContain('push-immune')
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

describe('night 13', () => {
	it('introduces the Weevil in wave 3 and nowhere earlier', () => {
		const scheduled = NIGHTS.filter(night => night.index < 13).flatMap(night =>
			night.waves.flatMap(wave => wave.entries.map(entry => entry.enemyDefId)),
		)
		expect(scheduled).not.toContain('weevil')

		// Two of them, in wave 3, the way night 8 introduced the Fly and night 10 the Moth.
		const night = NIGHTS.find(entry => entry.index === 13)
		const first = night?.waves.findIndex(wave => wave.entries.some(entry => entry.enemyDefId === 'weevil'))
		expect(first).toBe(2)
		expect(night?.waves[2]?.entries.find(entry => entry.enemyDefId === 'weevil')?.count).toBe(2)
	})
})

describe('night 17', () => {
	it('introduces the Silverfish in wave 3 and nowhere earlier', () => {
		const scheduled = NIGHTS.filter(night => night.index < 17).flatMap(night =>
			night.waves.flatMap(wave => wave.entries.map(entry => entry.enemyDefId)),
		)
		expect(scheduled).not.toContain('silverfish')

		const night = NIGHTS.find(entry => entry.index === 17)
		const first = night?.waves.findIndex(wave => wave.entries.some(entry => entry.enemyDefId === 'silverfish'))
		expect(first).toBe(2)
		expect(night?.waves[2]?.entries.find(entry => entry.enemyDefId === 'silverfish')?.count).toBe(2)
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

describe('the Mouse', () => {
	it('matches analytic-docs/CONTENT.md section 2 to the number', () => {
		expect(mouse.hp).toBe(200)
		expect(mouse.reward).toBe(40)
		expect(mouse.steals).toBe(5)
		expect(mouse.glyph).toBe('🐭')
		expect(mouse.tags).toEqual(['ground', 'thief', 'mammal'])
		expect(mouse.speedTilesPerTick * 60).toBeCloseTo(1.5, 10)
		expect(mouse.thief).toBeDefined()
	})

	it('takes 1.5x physical and 0.6x chemical, through the mammal row', () => {
		const target = { tags: mouse.tags, statuses: [] }

		expect(resolveDamage(10, 'physical', target)).toBeCloseTo(15, 10)
		expect(resolveDamage(10, 'chemical', target)).toBeCloseTo(6, 10)
	})

	it('is introduced on night 14 and nowhere earlier, and comes back once on night 17', () => {
		const scheduled = NIGHTS.filter(night => night.index < 14).flatMap(night =>
			night.waves.flatMap(wave => wave.entries.map(entry => entry.enemyDefId)),
		)
		expect(scheduled).not.toContain('mouse')

		function miceIn(index: number): { wave: number; count: number }[] {
			const night = NIGHTS.find(entry => entry.index === index)
			return (night?.waves ?? []).flatMap((wave, waveIndex) =>
				wave.entries
					.filter(entry => entry.enemyDefId === 'mouse')
					.map(entry => ({ wave: waveIndex, count: entry.count })),
			)
		}

		// One entry per Mouse, never `count: 2` -- nightmare's 1.25 rounds a 2 to a 3. Never wave 1:
		// the warning needs a wave in front of it.
		expect(miceIn(14)).toEqual([
			{ wave: 6, count: 1 },
			{ wave: 11, count: 1 },
		])
		expect(miceIn(15)).toEqual([])
		expect(miceIn(16)).toEqual([])
		// Night 17's, in a wave that also carries Silverfish; night 18 is 18C's and carries none.
		expect(miceIn(17)).toEqual([{ wave: 9, count: 1 }])
		const night17 = NIGHTS.find(entry => entry.index === 17)
		expect(night17?.waves[9]?.entries.some(entry => entry.enemyDefId === 'silverfish')).toBe(true)
		expect(miceIn(18)).toEqual([])
	})

	it('is never the whole of its wave, and is the last thing its wave releases', () => {
		for (const night of NIGHTS) {
			const lanes = getMapDef(night.mapId).paths.length
			night.waves.forEach((wave, index) => {
				expect(mouseBreaks(wave, lanes), `${night.id} wave ${index}`).toEqual([])
			})
		}
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
