/**
 * The night schedule.
 *
 * One placeholder night, for the same reason as the placeholder map: `createWorld` has to resolve a
 * `nightId` into a wave count and there is nothing to spawn with yet. Step 5 authors nights 1-3
 * against the real schedule in analytic-docs/CONTENT.md section 6 and owns the spawn system that
 * reads these entries.
 *
 * Difficulty scalars are applied at runtime by the spawn system and are never baked in here.
 */

import type { NightDef } from '@/core/content/schema.ts'

export const night01: NightDef = {
	id: 'night01',
	index: 1,
	mapId: 'counter',
	waves: [
		{
			entries: [{ enemyDefId: 'ant', count: 5, spacingTicks: 45, startDelayTicks: 0, pathId: 'crack' }],
			countdownTicks: 12 * 60,
		},
	],
}

export const NIGHTS = [night01]
