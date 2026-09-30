import { NO_MODIFIERS } from '@/core/content/installations.ts'
import { TileFlags } from '@/core/map.ts'
import { createRngState } from '@/core/rng.ts'
import type { World } from '@/core/types.ts'

/**
 * A hand-built world, because `createWorld` is step 2D and the skeleton has to be testable before
 * it exists. Deliberately literal: every field spelled out, so adding one to `World` without
 * deciding its initial value fails `type-check` here.
 *
 * Two things it is on purpose, both of which a spec may override:
 *
 * - **the night is already over.** Its `nightId` is synthetic, so a wave system that tried to start
 *   wave 0 would throw looking the night up. Terminal phases run nothing (step 5B), which is what
 *   keeps this a skeleton for tick-mechanics tests. A world that drives a night is `night.spec.ts`.
 *   A spec that makes this one live and plays it to an end sets a real `nightId`: `resolveSystem`
 *   scores the night it ends, and scoring looks the night up.
 * - **the lane is long.** An enemy past the end of its path is eaten at the fridge and removed, so
 *   a one-tile track would delete every enemy a spawn or movement spec put on it.
 */
const WIDTH_TILES = 40

export function createTestWorld(): World {
	return {
		tick: 0,
		seed: 1234,
		rng: createRngState(1234),

		enemies: [],
		towers: [],
		projectiles: [],
		crumbPiles: [],
		tiles: [],
		index: { enemies: {}, towers: {}, projectiles: {}, crumbPiles: {} },
		nextEntityId: 2,

		crumbs: 200,
		unbankedCrumbs: 0,
		noise: { level: 0, cap: 100, decayPerTick: 1.5 / 60, wakeCount: 0, peakLevel: 0 },

		map: {
			id: 'test',
			widthTiles: WIDTH_TILES,
			heightTiles: 1,
			paths: [
				{
					id: 'a',
					waypoints: [
						{ x: 0, y: 0 },
						{ x: WIDTH_TILES - 1, y: 0 },
					],
					lengthTiles: WIDTH_TILES - 1,
				},
			],
			trackWidthTiles: 1,
			// Tile 0 is buildable-only and every other tile is track, so both branches of `canPlace`
			// have a tile here.
			flags: [
				TileFlags.BUILDABLE,
				...Array.from({ length: WIDTH_TILES - 1 }, () => TileFlags.BUILDABLE | TileFlags.TRACK),
			],
			fridge: { tile: { x: WIDTH_TILES - 1, y: 0 }, glyph: '🗄️' },
			decor: [],
		},
		night: {
			nightId: 'test',
			waveIndex: 0,
			waveCount: 1,
			phase: 'won',
			countdownTicks: 0,
			wave: null,
			food: [
				{
					id: 1,
					defId: 'cheese',
					nameKey: 'food.cheese.name',
					heldBy: null,
					droppedAt: null,
					lostTo: null,
				},
			],
			snackStashUsed: false,
			ticksSkippedTotal: 0,
			crumbsDropped: 0,
			crumbsCollected: 0,
			enemiesKilled: 0,
			clearedThroughWaveIndex: -1,
			availableTowerIds: null,
			// Null even though the night is `'won'`: `'test'` is no night, so there is no pay to compute.
			pay: null,
		},
		difficulty: {
			id: 'normal',
			enemyHpMult: 1,
			enemyCountMult: 1,
			crumbIncomeMult: 1,
			startingCrumbs: 200,
			foodItemsMult: 1,
			noiseCap: 100,
			groceryMoneyMult: 1,
		},
		modifiers: { ...NO_MODIFIERS },

		events: [],
	}
}
