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
import { drawPlacementTile, drawRangeCircle, drawRangeCone, towerGlyphSize } from '@/render/layers/towers.ts'
import { GHOST_NOISE } from '@/render/palette.ts'
import type { PlacementTone } from '@/render/layers/towers.ts'
import type { Vec2 } from '@/core/types.ts'

/** How solid the tower-to-be is drawn under the cursor. Solid enough to identify, faint enough to read as not-yet. */
const GHOST_ALPHA = 0.45

/**
 * The noise a loud tower is about to start making, under the tile it would stand on.
 *
 * A speaker glyph and a number, and **no words**: `render/` cannot translate, and the one thing it is
 * allowed to draw is what the damage numbers and the floating `+N` already draw -- a rounded numeral.
 * The glyph is what says which number it is, the way every other entity on this board is an emoji.
 *
 * Rounded to one decimal before it becomes a cache key, for `getGlyph`'s reason: the key space has to
 * stay finite, and an unrounded rate is a fresh rasterised bitmap per pointer move.
 */
const GHOST_NOISE_GLYPH = '🔊'
const GHOST_NOISE_SIZE_SCALE = 0.3
/** Tiles below the tile's centre, so it clears the ghost rather than sitting under its feet. */
const GHOST_NOISE_OFFSET_TILES = 0.62

/**
 * What shape a tower's reach is, already resolved.
 *
 * The caller works out the facing -- from the tower's target, or from the lane it will cover -- the
 * same way it already works out the `PlacementTone`, so `drawRangeCone` stays a pure draw like every
 * other function in this file set (step 9C, decision 4).
 */
export type OverlayReach =
	| { kind: 'circle'; radiusTiles: number }
	| { kind: 'cone'; radiusTiles: number; halfAngleDeg: number; facingRad: number }

/** The tower being inspected. `reach` is null for an economy tower: it has none to show. */
export interface OverlaySelected {
	tile: Vec2
	reach: OverlayReach | null
}

/** The tower-to-be under the cursor, with the one `canPlaceTower` answer already folded into `tone`. */
export interface OverlayGhost {
	glyph: string
	tile: Vec2
	reach: OverlayReach | null
	tone: PlacementTone
	/**
	 * What this tower would add to the meter per second of continuous fire, **already resolved** by the
	 * caller out of `projectedNoisePerSecond` -- the same number the shop card shows.
	 *
	 * 0 for the eight towers that make none, and nothing is drawn for those: a silent tower announcing
	 * its silence on every tile the cursor crosses is noise of a different kind.
	 */
	noisePerSecond: number
}

export interface OverlayView {
	selected: OverlaySelected | null
	ghost: OverlayGhost | null
	/**
	 * The broom's reach, round the hovered pile. `at` is the pile's floor position in waypoint space,
	 * which is a tower's `tile` space, so it goes to `drawRangeCircle` unconverted.
	 */
	sweep: { at: Vec2; radiusTiles: number } | null
}

/** One switch over the union, shared by the selection and the ghost so the two cannot disagree. */
function drawReach(
	ctx: CanvasRenderingContext2D,
	tilePx: number,
	tile: Vec2,
	reach: OverlayReach,
	tone: PlacementTone,
): void {
	if (reach.kind === 'cone') {
		drawRangeCone(ctx, tilePx, tile, reach.radiusTiles, reach.halfAngleDeg, reach.facingRad, tone)
		return
	}
	drawRangeCircle(ctx, tilePx, tile, reach.radiusTiles, tone)
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
		if (selected.reach === null) {
			// An economy tower has no reach to show, so the square is the whole of the selection.
			drawPlacementTile(ctx, tilePx, selected.tile, 'neutral')
		} else {
			drawReach(ctx, tilePx, selected.tile, selected.reach, 'neutral')
		}
	}

	if (view.sweep !== null) {
		drawRangeCircle(ctx, tilePx, view.sweep.at, view.sweep.radiusTiles, 'neutral')
	}

	const ghost = view.ghost
	if (ghost === null) {
		return
	}

	if (ghost.reach !== null) {
		drawReach(ctx, tilePx, ghost.tile, ghost.reach, ghost.tone)
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

	if (ghost.noisePerSecond > 0) {
		blitGlyph(
			ctx,
			dpr,
			`${GHOST_NOISE_GLYPH}${ghost.noisePerSecond.toFixed(1)}`,
			tilePx * GHOST_NOISE_SIZE_SCALE,
			(ghost.tile.x + 0.5) * tilePx,
			(ghost.tile.y + 0.5 + GHOST_NOISE_OFFSET_TILES) * tilePx,
			false,
			GHOST_NOISE,
		)
	}
}
