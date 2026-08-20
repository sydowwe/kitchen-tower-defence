import type { World } from '@/core/types.ts'

/**
 * The one place entities are removed: deaths, leaks at the fridge, and the win/lose check. Runs
 * last so every earlier system this tick saw a consistent set of arrays.
 *
 * Whatever removes an entity here also rebuilds the affected `world.index` map -- see the comment
 * on `EntityIndex`. Stub: step 5 owns leaks, step 6 deaths, step 19 theft.
 */
export function resolveSystem(_world: World): void {}
