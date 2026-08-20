/**
 * The per-frame layer: everything that moves, blitted from the glyph cache.
 *
 * This is the only layer in this file set that runs 60 times a second, so it does exactly one thing
 * per entity -- sample the path, blit a cached bitmap -- and nothing else. No `fillText`, no
 * gradients, no allocation (analytic-docs/ARCHITECTURE.md section 6).
 *
 * **It draws nothing yet.** Step 5 owns enemies; what exists here is the loop, the tile-to-pixel
 * conversion and the device-pixel rounding, so that step has one function to fill in rather than a
 * file to invent. `glyphFor` is the seam: it returns null for everything today.
 */

import { samplePath } from '@/core/path.ts'
import type { Enemy, MapDef, World } from '@/core/types.ts'
import { blitGlyph } from '@/render/glyphCache.ts'

/** An enemy is drawn a little under its tile, so a queue of them on the track stays countable. */
const ENEMY_SCALE = 0.7

/**
 * Step 5 resolves this through the enemy roster. Until it does, nothing has a glyph and the loop
 * below draws nothing -- which is deliberate, not an oversight.
 */
function glyphFor(_enemy: Enemy): string | null {
	return null
}

function pathFor(map: MapDef, pathId: string) {
	return map.paths.find(path => path.id === pathId) ?? null
}

export function drawEntities(ctx: CanvasRenderingContext2D, world: World | null, tilePx: number, dpr: number): void {
	if (world === null) {
		return
	}

	for (const enemy of world.enemies) {
		const glyph = glyphFor(enemy)
		if (glyph === null) {
			continue
		}
		const path = pathFor(world.map, enemy.pathId)
		if (path === null) {
			continue
		}
		const at = samplePath(path, enemy.distance)
		blitGlyph(ctx, dpr, glyph, tilePx * ENEMY_SCALE, (at.x + 0.5) * tilePx, (at.y + 0.5) * tilePx)
	}
}
