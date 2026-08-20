import { describe, expect, it } from 'vitest'
import { resolveDamage } from '@/core/content/matrix.ts'
import type { DamageTarget } from '@/core/content/matrix.ts'
import {
	STATUS_DEFS,
	applyStatus,
	createStatus,
	damageTakenMultiplier,
	findStatus,
	speedMultiplier,
	tickStatuses,
} from '@/core/content/statuses.ts'
import type { StatusHolder } from '@/core/content/statuses.ts'
import type { EnemyTag, StatusKind } from '@/core/types.ts'

/**
 * These are assertions about the bookkeeping that drifts unnoticed: a cap that lets a fourth stack
 * through, a duration measured in frames, an effect that gets one tick more than it was given.
 */

function holder(...tags: EnemyTag[]): DamageTarget {
	return { tags, statuses: [] }
}

function advance(target: StatusHolder, ticks: number): void {
	for (let i = 0; i < ticks; i++) {
		tickStatuses(target)
	}
}

function stacksOf(target: StatusHolder, kind: StatusKind): number {
	return findStatus(target, kind)?.stacks ?? 0
}

describe('applyStatus', () => {
	it('stacks burn to exactly 3, and a fourth application refreshes without a fourth stack', () => {
		const enemy = holder()
		const burnTicks = STATUS_DEFS.burn.durationTicks

		applyStatus(enemy, createStatus('burn'))
		applyStatus(enemy, createStatus('burn'))
		applyStatus(enemy, createStatus('burn'))
		expect(stacksOf(enemy, 'burn')).toBe(3)

		advance(enemy, 60)
		expect(findStatus(enemy, 'burn')?.remainingTicks).toBe(burnTicks - 60)

		applyStatus(enemy, createStatus('burn'))
		expect(stacksOf(enemy, 'burn')).toBe(3)
		expect(findStatus(enemy, 'burn')?.remainingTicks).toBe(burnTicks)
		expect(enemy.statuses).toHaveLength(1)
	})

	it('refreshes slow rather than stacking it', () => {
		const enemy = holder()

		applyStatus(enemy, createStatus('slow'))
		advance(enemy, 30)
		applyStatus(enemy, createStatus('slow'))

		expect(enemy.statuses).toHaveLength(1)
		expect(stacksOf(enemy, 'slow')).toBe(1)
		expect(findStatus(enemy, 'slow')?.remainingTicks).toBe(STATUS_DEFS.slow.durationTicks)
	})

	it('suppresses slow re-application while frozen, and allows it once the freeze expires', () => {
		const enemy = holder()

		applyStatus(enemy, createStatus('freeze'))
		expect(applyStatus(enemy, createStatus('slow'))).toBe(false)
		expect(findStatus(enemy, 'slow')).toBeUndefined()

		advance(enemy, STATUS_DEFS.freeze.durationTicks)
		expect(findStatus(enemy, 'freeze')).toBeUndefined()

		expect(applyStatus(enemy, createStatus('slow'))).toBe(true)
		expect(findStatus(enemy, 'slow')?.remainingTicks).toBe(STATUS_DEFS.slow.durationTicks)
	})
})

describe('tickStatuses', () => {
	it('ticks a status with one tick left exactly once more, then drops it', () => {
		const enemy = holder()
		applyStatus(enemy, createStatus('marked'))

		advance(enemy, STATUS_DEFS.marked.durationTicks - 1)
		expect(findStatus(enemy, 'marked')?.remainingTicks).toBe(1)

		tickStatuses(enemy)
		expect(findStatus(enemy, 'marked')).toBeUndefined()
		expect(enemy.statuses).toHaveLength(0)
	})

	it('never expires a root, which lasts until its source is spent', () => {
		const enemy = holder()
		applyStatus(enemy, createStatus('rooted', 7))

		advance(enemy, 600)

		expect(findStatus(enemy, 'rooted')?.sourceId).toBe(7)
		expect(speedMultiplier(enemy)).toBe(0)
	})
})

describe('speedMultiplier', () => {
	it('is exactly 1 for an unafflicted enemy', () => {
		expect(speedMultiplier(holder())).toBe(1)
	})

	it('is 0.6 under slow and 0 under freeze, with freeze overriding a running slow', () => {
		const slowed = holder()
		applyStatus(slowed, createStatus('slow'))
		expect(speedMultiplier(slowed)).toBeCloseTo(0.6)

		applyStatus(slowed, createStatus('freeze'))
		expect(speedMultiplier(slowed)).toBe(0)
	})
})

describe('damageTakenMultiplier', () => {
	it('is exactly 1 for an unafflicted enemy', () => {
		expect(damageTakenMultiplier(holder())).toBe(1)
	})

	it('applies Marked after the tag product', () => {
		const ant = holder('ground', 'swarm', 'bug')
		applyStatus(ant, createStatus('marked'))

		// 10 base x 1.5 swarm-chemical x 1.25 marked.
		expect(resolveDamage(10, 'chemical', ant)).toBeCloseTo(10 * 1.5 * 1.25)
	})
})

describe('armor strip', () => {
	it('moves the armored physical multiplier from 0.4 to 0.7, through resolveDamage', () => {
		const silverfish = holder('ground', 'armored', 'bug')

		expect(resolveDamage(10, 'physical', silverfish)).toBeCloseTo(10 * 0.4)

		applyStatus(silverfish, createStatus('armorStrip'))
		expect(resolveDamage(10, 'physical', silverfish)).toBeCloseTo(10 * 0.7)

		advance(silverfish, STATUS_DEFS.armorStrip.durationTicks)
		expect(resolveDamage(10, 'physical', silverfish)).toBeCloseTo(10 * 0.4)
	})

	it('leaves a row already at 1.0 alone, and does not touch untagged enemies', () => {
		const roach = holder('ground', 'fast', 'bug')
		applyStatus(roach, createStatus('armorStrip'))

		expect(resolveDamage(10, 'physical', roach)).toBe(10)
	})
})
