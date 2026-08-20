import type { World } from '@/core/types.ts'

/**
 * Picks each ready tower's target according to its `targetingMode`. Separate from combat so the
 * choice can be tested without dealing damage. Stub: step 6 owns this.
 */
export function targetingSystem(_world: World): void {}
