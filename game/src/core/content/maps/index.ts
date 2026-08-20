/**
 * The map roster.
 *
 * One placeholder, deliberately: step 3 authors the six real 24 x 14 kitchens
 * (analytic-docs/CONTENT.md section 6) with the map editor, one file per map in this directory.
 * What lives here is only enough for `createWorld` to build a valid world and for a test to walk a
 * straight line.
 */

import type { MapDef } from '@/core/types.ts'

/**
 * Six by four tiles, one straight lane along row 2 from the left edge to the fridge.
 *
 * The `buildable` grid is written out row by row rather than generated, so it reads as the picture
 * it is: the track row is unbuildable, everything else is free.
 */
export const counter: MapDef = {
	id: 'counter',
	widthTiles: 6,
	heightTiles: 4,
	paths: [
		{
			id: 'crack',
			waypoints: [
				{ x: 0, y: 2 },
				{ x: 5, y: 2 },
			],
			lengthTiles: 5,
		},
	],
	// prettier-ignore
	buildable: [
		true, true, true, true, true, true,
		true, true, true, true, true, true,
		false, false, false, false, false, false,
		true, true, true, true, true, true,
	],
	fridge: { x: 5, y: 2 },
}

export const MAPS = [counter]
