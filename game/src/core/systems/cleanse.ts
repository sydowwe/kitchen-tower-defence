/**
 * Towers that take tile state off the board. Step 15B fills this in; its slot in `core/sim.ts` is
 * already taken, after `spread` and before `tiles`, so that step does not reorder the tick.
 */

import type { World } from '@/core/types.ts'

export function cleanseSystem(_world: World): void {}
