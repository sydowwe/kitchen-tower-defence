import { describe, expect, it } from 'vitest'
import { bindRng, createRng, createRngState, type RngState } from '@/core/rng.ts'

/**
 * The rng is the load-bearing half of the determinism guarantee: `(seed, mapId, nightId,
 * commandLog)` only reproduces a session if this file is reproducible first. The assertions below
 * are element-wise on purpose -- a generator that agrees on its first few values and drifts at
 * value 400 would pass a spot check and quietly break every replay.
 */

function take(rng: { next(): number }, count: number): number[] {
	const values: number[] = []
	for (let i = 0; i < count; i++) {
		values.push(rng.next())
	}
	return values
}

describe('rng', () => {
	it('produces an identical 1000-number sequence for the same seed', () => {
		expect(take(createRng(99), 1000)).toEqual(take(createRng(99), 1000))
	})

	it('produces a different sequence for a different seed', () => {
		expect(take(createRng(99), 100)).not.toEqual(take(createRng(100), 100))
	})

	it('stays diverged once two rngs from one seed are advanced differently', () => {
		const a = createRng(7)
		const b = createRng(7)
		a.next()

		const fromA = take(a, 1000)
		const fromB = take(b, 1000)

		// Not merely unequal as arrays: no position may re-sync, which is what a generator with a
		// short cycle or a state that gets clamped would do.
		const matches = fromA.filter((value, i) => value === fromB[i])
		expect(matches).toEqual([])
	})

	it('keeps every value in [0, 1)', () => {
		for (const value of take(createRng(3), 1000)) {
			expect(value).toBeGreaterThanOrEqual(0)
			expect(value).toBeLessThan(1)
		}
	})

	describe('fork', () => {
		it('does not disturb the parent, whether or not the child is consumed', () => {
			const untouched = createRng(42)
			const expected = take(untouched, 100)

			const forkedFrom = createRng(42)
			const child = forkedFrom.fork()
			take(child, 500)

			expect(take(forkedFrom, 100)).toEqual(expected)
		})

		it('gives each fork of the same parent a different stream', () => {
			const parent = createRng(42)
			expect(take(parent.fork(), 100)).not.toEqual(take(parent.fork(), 100))
		})

		it('forks reproducibly for the same seed', () => {
			expect(take(createRng(5).fork(), 100)).toEqual(take(createRng(5).fork(), 100))
		})
	})

	describe('serialisation', () => {
		it('continues the same sequence after a JSON round-trip and rehydration', () => {
			const original = createRng(2024)
			take(original, 37)

			const revived = bindRng(JSON.parse(JSON.stringify(original)) as RngState)

			expect(take(revived, 200)).toEqual(take(original, 200))
		})

		it('carries its whole state in plain numbers', () => {
			expect(JSON.parse(JSON.stringify(createRngState(1)))).toEqual({ state: expect.any(Number), forks: 0 })
		})

		it('writes through to the state object it was bound to', () => {
			const state = createRngState(11)
			const rng = bindRng(state)
			rng.next()
			expect(state.state).toBe(rng.state)
			expect(state.state).not.toBe(createRngState(11).state)
		})
	})

	describe('int', () => {
		it('stays within [0, max)', () => {
			const rng = createRng(8)
			for (let i = 0; i < 1000; i++) {
				const value = rng.int(6)
				expect(Number.isInteger(value)).toBe(true)
				expect(value).toBeGreaterThanOrEqual(0)
				expect(value).toBeLessThan(6)
			}
		})

		it('throws for a non-positive or non-integer max rather than returning NaN', () => {
			const rng = createRng(8)
			expect(() => rng.int(0)).toThrow(RangeError)
			expect(() => rng.int(-3)).toThrow(RangeError)
			expect(() => rng.int(2.5)).toThrow(RangeError)
		})
	})

	describe('pick', () => {
		it('throws on an empty array instead of returning undefined', () => {
			expect(() => createRng(1).pick([])).toThrow(/empty array/)
		})

		it('only ever returns members of the array', () => {
			const rng = createRng(4)
			const items = ['ant', 'roach', 'beetle']
			for (let i = 0; i < 200; i++) {
				expect(items).toContain(rng.pick(items))
			}
		})
	})

	describe('chance', () => {
		it('is never true at 0 and always true at 1', () => {
			const rng = createRng(6)
			for (let i = 0; i < 500; i++) {
				expect(rng.chance(0)).toBe(false)
				expect(rng.chance(1)).toBe(true)
			}
		})
	})
})
