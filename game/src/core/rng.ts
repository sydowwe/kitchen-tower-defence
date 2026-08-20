/**
 * Mulberry32, seeded. The only source of randomness the simulation is allowed to use
 * (analytic-docs/ARCHITECTURE.md section 3).
 *
 * The generator is split into two halves on purpose. `RngState` is plain data and is what lives on
 * the world; `bindRng` wraps a state in the callable surface. A closed-over counter would vanish
 * through `JSON.stringify` and take the replay guarantee with it, so there isn't one anywhere in
 * this file -- every method reads and writes the state object it was handed.
 *
 * `int`, `pick` and `chance` are all expressed in terms of `next()`. The raw arithmetic lives in
 * exactly one place.
 */

/**
 * The serialisable half of a generator: two 32-bit integers, and nothing a JSON round-trip can
 * lose. `World.rng` is one of these, not a bound `Rng`.
 */
export interface RngState {
	/** Mulberry32's counter. Advanced by `next()` and by nothing else. */
	state: number
	/** How many children `fork()` has handed out. Read by `fork()` only; `next()` never sees it. */
	forks: number
}

/** A state plus the operations over it. Assignable to `RngState`, but do not store one on the world. */
export interface Rng extends RngState {
	/** Uniform in `[0, 1)`. Every other method is built on this one. */
	next(): number
	/** Uniform integer in `[0, max)`. Throws for a non-integer or non-positive `max`. */
	int(max: number): number
	/** Uniform element. Throws on an empty array -- see the note on `pick` below. */
	pick<T>(items: readonly T[]): T
	/** True with the given probability. `chance(0)` is never, `chance(1)` is always. */
	chance(probability: number): boolean
	/**
	 * A child stream derived from this one. Forking does **not** advance the parent's value
	 * sequence: the parent produces the same numbers whether or not a fork was ever taken. Each
	 * fork of the same parent is a different stream, which is what `forks` is counting.
	 */
	fork(): Rng
}

const MULBERRY_INCREMENT = 0x6d2b79f5
const GOLDEN = 0x9e3779b9
const UINT32 = 0x100000000

/** Avalanche, so that seeds 0, 1 and 2 open onto unrelated streams instead of adjacent ones. */
function mix32(value: number): number {
	let x = value | 0
	x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
	x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
	return (x ^ (x >>> 16)) | 0
}

/** The plain state a seed opens onto. This is what `createWorld` stores (step 2D). */
export function createRngState(seed: number): RngState {
	return { state: mix32(seed), forks: 0 }
}

/**
 * Wraps a state in the callable surface. The returned `Rng` writes *through* to `holder`, so
 * `bindRng(world.rng)` is a view over the world's generator rather than a copy of it.
 */
export function bindRng(holder: RngState): Rng {
	function next(): number {
		holder.state = (holder.state + MULBERRY_INCREMENT) | 0
		let t = Math.imul(holder.state ^ (holder.state >>> 15), 1 | holder.state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / UINT32
	}

	function int(max: number): number {
		if (!Number.isInteger(max) || max < 1) {
			throw new RangeError(`rng.int: max must be a positive integer, got ${max}.`)
		}
		return Math.floor(next() * max)
	}

	/**
	 * Throws rather than returning `undefined`. A silent `undefined` here surfaces as a blank enemy
	 * on night 9, three systems away from the array that was empty.
	 */
	function pick<T>(items: readonly T[]): T {
		if (items.length === 0) {
			throw new RangeError('rng.pick: cannot pick from an empty array.')
		}
		const index = int(items.length)
		const chosen = items[index]
		if (chosen === undefined) {
			throw new RangeError(`rng.pick: array has a hole at index ${index}.`)
		}
		return chosen
	}

	function chance(probability: number): boolean {
		return next() < probability
	}

	function fork(): Rng {
		const childSeed = mix32(holder.state ^ mix32(Math.imul(holder.forks + 1, GOLDEN)))
		holder.forks = (holder.forks + 1) | 0
		return bindRng({ state: childSeed, forks: 0 })
	}

	return {
		get state() {
			return holder.state
		},
		set state(value: number) {
			holder.state = value
		},
		get forks() {
			return holder.forks
		},
		set forks(value: number) {
			holder.forks = value
		},
		next,
		int,
		pick,
		chance,
		fork,
	}
}

/** A generator opened fresh from a seed. Equivalent to `bindRng(createRngState(seed))`. */
export function createRng(seed: number): Rng {
	return bindRng(createRngState(seed))
}
