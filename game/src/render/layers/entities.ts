/**
 * The per-frame layer: everything that moves, blitted from the glyph cache.
 *
 * This is the only layer in this file set that runs 60 times a second, so it does exactly one thing
 * per entity -- sample the path, blit a cached bitmap -- and nothing else. No `fillText`, no
 * gradients, no allocation (analytic-docs/ARCHITECTURE.md section 6).
 *
 * Enemies are mirrored, never rotated: the roster is drawn side-on, and a rotated bug on the
 * Counter's vertical runs reads as a dead one (step 5C, decision 3).
 */

import { getEnemyDef } from '@/core/content/index.ts'
import { samplePath } from '@/core/path.ts'
import { ENEMIES } from '@/core/content/enemies.ts'
import type { Enemy, MapDef, World } from '@/core/types.ts'
import { blitGlyph, preload } from '@/render/glyphCache.ts'
import { HP_BAR_BACK, HP_BAR_FILL } from '@/render/palette.ts'

/** An enemy is drawn a little under its tile, so a queue of them on the track stays countable. */
const ENEMY_SCALE = 0.7

/** The bar is a touch wider than the glyph, so a full one is visibly full rather than ambiguous. */
const HP_BAR_WIDTH_SCALE = 0.8
const HP_BAR_HEIGHT_PX = 3
/** Gap between the top of the glyph box and the bar, in logical pixels. */
const HP_BAR_GAP_PX = 2

/** Every enemy has a glyph on its def, so this cannot fail for a def the world could spawn. */
function glyphFor(enemy: Enemy): string {
	return getEnemyDef(enemy.defId).glyph
}

function pathFor(map: MapDef, pathId: string) {
	return map.paths.find(path => path.id === pathId) ?? null
}

/**
 * A thin two-tone bar above a damaged enemy. Never text, and never drawn at full health -- a board
 * of sixty ants each wearing a full bar is a board you cannot read.
 */
function drawHealthBar(ctx: CanvasRenderingContext2D, enemy: Enemy, tilePx: number, x: number, y: number): void {
	if (enemy.hp >= enemy.maxHp || enemy.maxHp <= 0) {
		return
	}

	const width = tilePx * HP_BAR_WIDTH_SCALE
	const left = x - width / 2
	const top = y - (tilePx * ENEMY_SCALE) / 2 - HP_BAR_GAP_PX - HP_BAR_HEIGHT_PX
	const fraction = Math.min(Math.max(enemy.hp / enemy.maxHp, 0), 1)

	ctx.fillStyle = HP_BAR_BACK
	ctx.fillRect(left, top, width, HP_BAR_HEIGHT_PX)
	ctx.fillStyle = HP_BAR_FILL
	ctx.fillRect(left, top, width * fraction, HP_BAR_HEIGHT_PX)
}

export function drawEntities(ctx: CanvasRenderingContext2D, world: World | null, tilePx: number, dpr: number): void {
	if (world === null) {
		return
	}

	for (const enemy of world.enemies) {
		const path = pathFor(world.map, enemy.pathId)
		if (path === null) {
			continue
		}
		const glyph = glyphFor(enemy)
		const at = samplePath(path, enemy.distance)
		const x = (at.x + 0.5) * tilePx
		const y = (at.y + 0.5) * tilePx
		blitGlyph(ctx, dpr, glyph, tilePx * ENEMY_SCALE, x, y, Math.cos(at.angle) < 0)
		drawHealthBar(ctx, enemy, tilePx, x, y)
	}
}

/**
 * Rasterises the roster at the one size this layer blits it at.
 *
 * The cache key is `emoji|sizePx|dpr`, so preloading at any other size fills the cache with entries
 * nothing ever reads and still pays for the real ones on the first frame. `tilePx` is 0 until
 * `Renderer.setMap` has run -- call this after it, never before.
 */
export function preloadEnemyGlyphs(tilePx: number): void {
	preload(ENEMIES.map(def => ({ emoji: def.glyph, sizePx: tilePx * ENEMY_SCALE })))
}
