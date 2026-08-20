import { TileFlags } from '@/core/map.ts'
import { createRngState } from '@/core/rng.ts'
import type { World } from '@/core/types.ts'

/**
 * A hand-built world, because `createWorld` is step 2D and the skeleton has to be testable before
 * it exists. Deliberately literal: every field spelled out, so adding one to `World` without
 * deciding its initial value fails `type-check` here.
 */
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
		groceryMoney: 0,
		noise: { level: 0, cap: 100, decayPerTick: 1.5 / 60, hasFilled: false },

		map: {
			id: 'test',
			widthTiles: 2,
			heightTiles: 1,
			paths: [
				{
					id: 'a',
					waypoints: [
						{ x: 0, y: 0 },
						{ x: 1, y: 0 },
					],
					lengthTiles: 1,
				},
			],
			// Buildable then blocked-and-track, so both branches of `canPlace` have a tile here.
			flags: [TileFlags.BUILDABLE, TileFlags.BUILDABLE | TileFlags.TRACK],
			fridge: { tile: { x: 1, y: 0 }, glyph: '🗄️' },
			decor: [],
		},
		night: {
			nightId: 'test',
			waveIndex: 0,
			waveCount: 1,
			phase: 'building',
			countdownTicks: 0,
			wave: null,
			food: [{ id: 1, nameKey: 'food.cheese', heldBy: null, lost: false }],
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

		events: [],
	}
}
