import { describe, expect, it } from 'vitest'
import {
	BEHAVIOUR_KINDS,
	attack,
	aura,
	bait,
	barricade,
	charge,
	collect,
	coneAttack,
	income,
	isAttack,
	pushback,
	reveal,
	suppress,
	tileEffect,
} from '@/core/content/behaviours.ts'
import type { Behaviour, BehaviourKind } from '@/core/content/behaviours.ts'
import type { Serialisable } from '@/core/types.ts'

/**
 * The behaviour vocabulary is only worth having if it stays data and stays exhaustive. Both of
 * those are type-level properties, so most of this file fails `npm run type-check` rather than
 * `npm run test` -- which is the point: the build breaks the moment a descriptor grows a callback.
 */

type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

type Assert<T extends true> = T

/**
 * The headline assertion, and the reason `attack({...})` returns a plain object rather than a
 * closure: a descriptor that captured a function could not be saved, diffed or replayed.
 */
export type BehavioursAreSerialisable = Assert<Exact<Behaviour, Serialisable<Behaviour>>>

/** `BEHAVIOUR_KINDS` and the union cannot drift apart -- a member missing from either fails here. */
export type KindListCoversUnion = Assert<Exact<BehaviourKind, (typeof BEHAVIOUR_KINDS)[number]>>

/**
 * A `switch` with a `never` default over the whole union. If a thirteenth behaviour is added and
 * this file is not updated, the assignment to `unreachable` stops compiling -- which is how a new
 * behaviour is stopped from being silently uninterpreted.
 */
function kindOf(behaviour: Behaviour): BehaviourKind {
	switch (behaviour.kind) {
		case 'attack':
		case 'coneAttack':
		case 'aura':
		case 'income':
		case 'collect':
		case 'charge':
		case 'barricade':
		case 'bait':
		case 'suppress':
		case 'pushback':
		case 'tileEffect':
		case 'reveal':
			return behaviour.kind
		default: {
			const unreachable: never = behaviour
			return unreachable
		}
	}
}

/** One of every member, built through its factory the way a tower def builds them. */
const everyBehaviour: Behaviour[] = [
	attack({ damage: 8, damageType: 'physical', cooldownTicks: 60, rangeTiles: 3, targets: 'ground' }),
	coneAttack({
		damage: 3,
		damageType: 'chemical',
		cooldownTicks: 50,
		rangeTiles: 3,
		coneHalfAngleDeg: 30,
		targets: 'both',
	}),
	aura({ radiusTiles: 2, damagePerTick: 4 / 60, damageType: 'fire', targets: 'both' }),
	income({ crumbsPerPayout: 4, payoutIntervalTicks: 60 }),
	collect({ radiusTiles: 2.5, travelTicks: 90 }),
	charge({ charges: 3, rearmTicks: 396 }),
	barricade(),
	bait({ radiusTiles: 3, targets: 'ground' }),
	suppress({ radiusTiles: 3, suppresses: 'burrow' }),
	pushback({ rangeTiles: 4, coneHalfAngleDeg: 35, pushTilesPerTick: 0.02, targets: 'air' }),
	tileEffect({ effect: 'heat', radiusTiles: 0, magnitude: 14 / 60, durationTicks: 120, refreshIntervalTicks: 30 }),
	reveal({ radiusTiles: 4, attractsLightDrawn: true }),
]

describe('behaviour descriptors', () => {
	it('are plain data that survives a JSON round-trip unchanged', () => {
		for (const behaviour of everyBehaviour) {
			expect(JSON.parse(JSON.stringify(behaviour))).toEqual(behaviour)
		}
	})

	it('hold no function-typed field at runtime either', () => {
		for (const behaviour of everyBehaviour) {
			for (const [key, value] of Object.entries(behaviour)) {
				expect(typeof value, `${behaviour.kind}.${key} is a function`).not.toBe('function')
			}
		}
	})

	it('covers the whole vocabulary once, in the documented order', () => {
		expect(everyBehaviour.map(kindOf)).toEqual([...BEHAVIOUR_KINDS])
	})

	it('defaults an attack to a hitscan single-target hit', () => {
		const shot = attack({ damage: 5, damageType: 'physical', cooldownTicks: 60, rangeTiles: 3, targets: 'ground' })

		expect(shot.projectileSpeed).toBe(0)
		expect(shot.splashRadiusTiles).toBe(0)
	})

	it('keeps a factory to exactly the descriptor keys', () => {
		const shot = attack({
			damage: 5,
			damageType: 'physical',
			cooldownTicks: 60,
			rangeTiles: 3,
			targets: 'ground',
			// @ts-expect-error -- an unknown param must not travel into the descriptor.
			splashRadius: 0.8,
		})

		expect(Object.keys(shot).sort()).toEqual([
			'cooldownTicks',
			'damage',
			'damageType',
			'kind',
			'projectileSpeed',
			'rangeTiles',
			'splashRadiusTiles',
			'targets',
		])
	})

	it('narrows to the one behaviour a system reads today', () => {
		const attacks = everyBehaviour.filter(isAttack)

		expect(attacks).toHaveLength(1)
		expect(attacks[0]?.damage).toBe(8)
	})
})
