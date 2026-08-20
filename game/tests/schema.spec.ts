import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { attack } from '@/core/content/behaviours.ts'
import type { Behaviour } from '@/core/content/behaviours.ts'
import { ContentValidationError, contentSchemas, validateContent } from '@/core/content/schema.ts'
import type { ContentSchemas, TowerDef } from '@/core/content/schema.ts'
import type { DamageType, EnemyTag, StatusKind, TargetingMode, TileEffectKind } from '@/core/types.ts'

/**
 * What these assert is that the schemas stay *loud*. A schema that quietly accepts a raw English
 * name, a millisecond duration or a second tower with the same id is worse than no schema, because
 * it buys the confidence without doing the work.
 */

type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

type Assert<T extends true> = T

/**
 * The vocabularies are declared as literal unions in `core/types.ts` and restated as value arrays
 * in the schema, because zod needs them at runtime. These are what stop the two copies drifting:
 * a tag added to one and forgotten in the other fails type-check.
 */
export type DamageTypesAgree = Assert<Exact<DamageType, z.infer<ContentSchemas['damageType']>>>
export type EnemyTagsAgree = Assert<Exact<EnemyTag, z.infer<ContentSchemas['enemyTag']>>>
export type StatusKindsAgree = Assert<Exact<StatusKind, z.infer<ContentSchemas['statusKind']>>>
export type TargetingModesAgree = Assert<Exact<TargetingMode, z.infer<ContentSchemas['targetingMode']>>>
export type TileEffectKindsAgree = Assert<Exact<TileEffectKind, z.infer<ContentSchemas['tileEffectKind']>>>

/** ...and the same for the behaviour union, which the tower schema validates against. */
export type BehaviourSchemaMatchesUnion = Assert<Exact<Behaviour, z.infer<ContentSchemas['behaviour']>>>

/**
 * A synthetic def, not a real tower -- step 2D authors the Salt Shaker. It is deliberately a plain
 * object literal so a schema change that breaks real content breaks this first.
 */
function validTower(): TowerDef {
	return {
		id: 'testTurret',
		nameKey: 'tower.testTurret.name',
		descriptionKey: 'tower.testTurret.description',
		glyph: '🧪',
		role: 'BASIC_DPS',
		cost: 50,
		maxHp: 100,
		placement: 'off_path',
		noise: 0,
		defaultTargetingMode: 'FIRST',
		behaviours: [
			attack({ damage: 5, damageType: 'physical', cooldownTicks: 60, rangeTiles: 3, targets: 'ground' }),
		],
	}
}

/** The message, not the stack: every assertion below is about what a developer reads at boot. */
function problemsFrom(run: () => unknown): string[] {
	try {
		run()
	} catch (error) {
		if (error instanceof ContentValidationError) {
			return [...error.problems]
		}
		throw error
	}

	throw new Error('expected content validation to fail, and it passed')
}

describe('towerDefSchema', () => {
	it('accepts a well-formed def', () => {
		const result = contentSchemas().tower.safeParse(validTower())

		expect(result.success).toBe(true)
	})

	it('rejects a misspelled damage type, and names the def and the field', () => {
		const broken = { ...validTower(), behaviours: [{ ...validTower().behaviours[0], damageType: 'chemcial' }] }

		const [problem] = problemsFrom(() => validateContent({ towers: [broken] }))

		expect(problem).toContain("tower 'testTurret'")
		expect(problem).toContain('behaviours.0.damageType')
	})

	it('rejects a raw English name where an i18n key belongs', () => {
		const broken = { ...validTower(), nameKey: 'Test Turret' }

		const [problem] = problemsFrom(() => validateContent({ towers: [broken] }))

		expect(problem).toContain("tower 'testTurret'")
		expect(problem).toContain('nameKey')
		expect(problem).toContain('i18n key')
	})

	it('rejects a duration that was written in milliseconds', () => {
		const broken = { ...validTower(), behaviours: [{ ...validTower().behaviours[0], cooldownTicks: 1500 }] }

		const [problem] = problemsFrom(() => validateContent({ towers: [broken] }))

		expect(problem).toContain('behaviours.0.cooldownTicks')
	})

	it('rejects a tower that does nothing', () => {
		const broken = { ...validTower(), behaviours: [] }

		const [problem] = problemsFrom(() => validateContent({ towers: [broken] }))

		expect(problem).toContain('behaviours')
	})
})

describe('validateContent', () => {
	it('returns the parsed collections when everything is well-formed', () => {
		const content = validateContent({ towers: [validTower()] })

		expect(content.towers).toHaveLength(1)
		expect(content.towers[0]?.id).toBe('testTurret')
		expect(content.enemies).toEqual([])
	})

	it('rejects a duplicate id within a collection', () => {
		const problems = problemsFrom(() => validateContent({ towers: [validTower(), validTower()] }))

		expect(problems).toHaveLength(1)
		expect(problems[0]).toContain("tower 'testTurret'")
		expect(problems[0]).toContain('duplicate id')
		expect(problems[0]).toContain('index 0')
	})

	it('reports every problem at once rather than the first', () => {
		const broken = { ...validTower(), nameKey: 'Test Turret', cost: 0 }

		const problems = problemsFrom(() => validateContent({ towers: [broken] }))

		expect(problems).toHaveLength(2)
	})

	it('falls back to the index when the entry has no usable id', () => {
		const [problem] = problemsFrom(() => validateContent({ towers: [{ nameKey: 'tower.x.name' }] }))

		expect(problem).toContain('tower #0')
	})
})

describe('the other def schemas', () => {
	it('requires a map buildable grid of exactly widthTiles * heightTiles', () => {
		const map = {
			id: 'counter',
			widthTiles: 4,
			heightTiles: 2,
			paths: [
				{
					id: 'main',
					waypoints: [
						{ x: 0, y: 0 },
						{ x: 3, y: 0 },
					],
					lengthTiles: 3,
				},
			],
			buildable: new Array(7).fill(true),
			fridge: { x: 3, y: 1 },
		}

		const [problem] = problemsFrom(() => validateContent({ maps: [map] }))

		expect(problem).toContain("map 'counter'")
		expect(problem).toContain('buildable')
	})

	it('requires a timed status to have a duration, and an untimed one not to', () => {
		const timedWithoutDuration = {
			id: 'burn',
			nameKey: 'status.burn.name',
			durationTicks: 0,
			magnitude: 5 / 60,
			stacking: { mode: 'stack', maxStacks: 3 },
		}

		const [problem] = problemsFrom(() => validateContent({ statuses: [timedWithoutDuration] }))

		expect(problem).toContain("status 'burn'")
		expect(problem).toContain('durationTicks')
	})

	it('accepts a rooted status that ends when its source is spent', () => {
		const rooted = {
			id: 'rooted',
			nameKey: 'status.rooted.name',
			durationTicks: 0,
			magnitude: 0,
			stacking: { mode: 'untilSourceSpent' },
		}

		expect(validateContent({ statuses: [rooted] }).statuses).toHaveLength(1)
	})

	it('rejects an enemy speed written in tiles per second', () => {
		const enemy = {
			id: 'testBug',
			nameKey: 'enemy.testBug.name',
			descriptionKey: 'enemy.testBug.description',
			glyph: '🐜',
			hp: 10,
			speedTilesPerTick: 1.0,
			reward: 3,
			steals: 1,
			tags: ['ground'],
		}

		const [problem] = problemsFrom(() => validateContent({ enemies: [enemy] }))

		expect(problem).toContain('speedTilesPerTick')
	})
})
