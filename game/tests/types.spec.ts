import { describe, expect, it } from 'vitest'
import type { Serialisable, World } from '@/core/types.ts'
import { createTestWorld } from './fixtures/world.ts'

/**
 * `World` has to survive `JSON.parse(JSON.stringify(world))` unchanged, or replays, the balance
 * harness and crash reports all stop working. The assertions in this file are mostly type-level:
 * they fail `npm run type-check`, not `npm run test`, and that is the point -- the moment somebody
 * puts a method on an entity, the build breaks rather than a save silently losing it.
 */

/** True only for types that are identical, not merely mutually assignable. */
type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

type Assert<T extends true> = T

/** The headline assertion. Stops compiling if any member of `World` becomes function-typed. */
export type WorldIsSerialisable = Assert<Exact<World, Serialisable<World>>>

/** ...and the proof that the guard actually bites, rather than being `Exact<T, T>` in disguise. */
export type GuardRejectsMethods = Assert<Exact<Exact<Serialisable<{ hit(): void }>, { hit(): void }>, false>>

export type GuardRejectsCallbackFields = Assert<
	Exact<Exact<Serialisable<{ onDeath: () => void }>, { onDeath: () => void }>, false>
>

/** A `Map` is the other way this goes wrong, and it is caught for the same reason. */
export type GuardRejectsMaps = Assert<Exact<Exact<Serialisable<Map<string, number>>, Map<string, number>>, false>>

describe('World', () => {
	it('survives a JSON round-trip deeply equal', () => {
		const world = createTestWorld()
		expect(JSON.parse(JSON.stringify(world))).toEqual(world)
	})

	it('has no function-typed values anywhere in its object graph', () => {
		const seen = new Set<unknown>()

		function walk(value: unknown, path: string): void {
			expect(typeof value, `${path} is a function`).not.toBe('function')
			if (typeof value !== 'object' || value === null || seen.has(value)) {
				return
			}
			seen.add(value)
			for (const [key, child] of Object.entries(value)) {
				walk(child, `${path}.${key}`)
			}
		}

		walk(createTestWorld(), 'world')
	})
})
