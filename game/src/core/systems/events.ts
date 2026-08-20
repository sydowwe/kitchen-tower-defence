import type { World } from '@/core/types.ts'

/**
 * Closes out `world.events`. It holds one tick's worth, so the renderer and the HUD read it between
 * ticks and this system clears it at the top of the next one. Stub: step 8 is the first consumer.
 */
export function eventsSystem(_world: World): void {}
