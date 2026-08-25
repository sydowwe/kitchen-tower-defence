/**
 * The ghost, the range circle and the tile tint -- the slot step 3C reserved at the end of the draw
 * order, filled by step 8C.
 *
 * **It takes a plain `OverlayView` it declares itself**, never a Vue ref and never `ui/selection.ts`
 * by import. Everything in the view is already resolved: the caller looked the def up, asked
 * `canPlaceTower` once and turned the answer into a `PlacementTone`. That is what keeps `render/`
 * one-way, and it is what lets the map editor call the same functions with a view of its own.
 *
 * The cursor deliberately did **not** come across from `dev/placement.ts` with the rest of it.
 * `canvas.style.cursor` is DOM state rather than pixels, so it lives in `ui/interaction.ts` beside
 * the pointer handler that already knows the tone.
 */

import { blitGlyph } from '@/render/glyphCache.ts'
import { drawPlacementTile, drawRangeCircle, towerGlyphSize } from '@/render/layers/towers.ts'
import type { PlacementTone } from '@/render/layers/towers.ts'
import type { Vec2 } from '@/core/types.ts'

/** How solid the tower-to-be is drawn under the cursor. Solid enough to identify, faint enough to read as not-yet. */
const GHOST_ALPHA = 0.45

/** The tower being inspected. `rangeTiles` is null for an economy tower: it has no reach to show. */
export interface OverlaySelected {
	tile: Vec2
	rangeTiles: number | null
}

/** The tower-to-be under the cursor, with the one `canPlaceTower` answer already folded into `tone`. */
export interface OverlayGhost {
	glyph: string
	tile: Vec2
	rangeTiles: number | null
	tone: PlacementTone
}

export interface OverlayView {
	selected: OverlaySelected | null
	ghost: OverlayGhost | null
}

/**
 * Drawn last, over everything. Null view and null members are all normal -- nothing selected, nothing
 * armed, pointer off the board -- and each is a draw that does not happen.
 */
export function drawOverlay(
	ctx: CanvasRenderingContext2D,
	view: OverlayView | null,
	tilePx: number,
	dpr: number,
): void {
	if (view === null) {
		return
	}

	const selected = view.selected
	if (selected !== null) {
		if (selected.rangeTiles === null) {
			// An economy tower has no reach to show, so the square is the whole of the selection.
			drawPlacementTile(ctx, tilePx, selected.tile, 'neutral')
		} else {
			drawRangeCircle(ctx, tilePx, selected.tile, selected.rangeTiles, 'neutral')
		}
	}

	const ghost = view.ghost
	if (ghost === null) {
		return
	}

	if (ghost.rangeTiles !== null) {
		drawRangeCircle(ctx, tilePx, ghost.tile, ghost.rangeTiles, ghost.tone)
	}
	drawPlacementTile(ctx, tilePx, ghost.tile, ghost.tone)

	ctx.globalAlpha = GHOST_ALPHA
	blitGlyph(
		ctx,
		dpr,
		ghost.glyph,
		towerGlyphSize(tilePx),
		(ghost.tile.x + 0.5) * tilePx,
		(ghost.tile.y + 0.5) * tilePx,
	)
	ctx.globalAlpha = 1
}
