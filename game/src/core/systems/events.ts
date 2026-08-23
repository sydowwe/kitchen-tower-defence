import type { World } from '@/core/types.ts'

/**
 * The last slot of the tick, for anything that has to happen after every other system has published
 * what it did.
 *
 * It does **not** clear `world.events`. `tick()` does, at the *top* of the next tick: a system
 * running last cannot both publish this tick's events and clear them, because anything it cleared
 * would never be seen by a consumer -- consumers only get to look between two ticks. Stub: step 8
 * is the first consumer.
 */
export function eventsSystem(_world: World): void {}
