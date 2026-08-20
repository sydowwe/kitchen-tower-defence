import type { World } from '@/core/types.ts'

/**
 * Ticks every enemy's `statuses` down and delivers per-tick effects. Runs *before* movement so a
 * slow applied this tick is felt this tick. Stub: step 9 owns this; step 2C owns the bookkeeping
 * it will call into.
 */
export function statusSystem(_world: World): void {}
