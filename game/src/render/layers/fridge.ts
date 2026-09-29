/**
 * The shelf: what is still in the fridge, drawn as itself.
 *
 * This is the health bar (analytic-docs/DECISIONS.md section 6), so it is counted at a glance rather
 * than read. The fridge *glyph* is in the terrain bake where `track.ts` put it; the items on the
 * shelf change every time one is stolen, so they are drawn per frame.
 *
 * **A slot belongs to an index in `night.food`, not to a surviving item.** Theft always takes from
 * the front of the shelf, so packing the survivors would shuffle every remaining glyph one place left
 * each time one went -- a shelf that re-flows is a shelf nobody can count. Skipping the lost ones
 * instead means the row empties from one end and every survivor stays where it was.
 *
 * Positions here are tile-space floats in the same convention as `samplePath`: a slot is drawn at
 * `(x + 0.5) * tilePx`, like every other position in `render/layers/`.
 */

import { FOODS } from '@/core/content/food.ts'
import { getFoodDef } from '@/core/content/index.ts'
import { isOnShelf } from '@/core/systems/fridge.ts'
import type { EntityId, MapDef, Vec2, World } from '@/core/types.ts'
import { blitGlyph, preload } from '@/render/glyphCache.ts'
import { droppedFoodGlyphSize } from '@/render/layers/food.ts'
import { SHELF_BACKDROP, SHELF_EDGE } from '@/render/palette.ts'

/** Items per row. Eighteen-odd items is three rows, and a fourth has room below it. */
const COLUMNS = 6
/** Centre-to-centre spacing, in tiles. */
const PITCH_TILES = 0.6
/** Drawn size of one item, in tiles. Smaller than the pitch so neighbours do not touch. */
const ITEM_SCALE = 0.5
/** How far right of the fridge tile's centre the last column sits -- the shelf hangs off its edge. */
const LAST_COLUMN_OFFSET_TILES = 0.9
/** How far below the fridge tile's centre the first row sits. */
const FIRST_ROW_OFFSET_TILES = 1.2
/** Padding around the outermost slots, in tiles. */
const PANEL_PADDING_TILES = 0.1

/**
 * The centre of slot `index`, right-aligned under the fridge -- the Counter's fridge is against the
 * right edge of the board, and a row centred on it would run off it.
 *
 * Exported because `effects.ts` launches a stolen item from the slot it was sitting in, and a second
 * copy of this arithmetic would drift from the drawn shelf the first time either changed.
 */
export function shelfSlot(map: MapDef, index: number): Vec2 {
	const column = index % COLUMNS
	const row = Math.floor(index / COLUMNS)
	const firstColumnX = map.fridge.tile.x + LAST_COLUMN_OFFSET_TILES - (COLUMNS - 1) * PITCH_TILES

	return {
		x: firstColumnX + column * PITCH_TILES,
		y: map.fridge.tile.y + FIRST_ROW_OFFSET_TILES + row * PITCH_TILES,
	}
}

/**
 * The panel behind the slots, sized off the same arithmetic so the two cannot disagree.
 *
 * Its width is a full row even when the last row is half full: a panel that narrowed as the shelf
 * emptied would move, and the point of the shelf is that nothing on it moves.
 */
function drawBackdrop(ctx: CanvasRenderingContext2D, map: MapDef, count: number, tilePx: number): void {
	if (count === 0) {
		return
	}

	const first = shelfSlot(map, 0)
	const rows = Math.floor((count - 1) / COLUMNS) + 1
	const columns = Math.min(count, COLUMNS)
	const margin = ITEM_SCALE / 2 + PANEL_PADDING_TILES

	const left = (first.x + 0.5 - margin) * tilePx
	const top = (first.y + 0.5 - margin) * tilePx
	const width = ((columns - 1) * PITCH_TILES + margin * 2) * tilePx
	const height = ((rows - 1) * PITCH_TILES + margin * 2) * tilePx

	ctx.fillStyle = SHELF_BACKDROP
	ctx.fillRect(left, top, width, height)
	ctx.strokeStyle = SHELF_EDGE
	ctx.lineWidth = 1
	ctx.strokeRect(left, top, width, height)
}

/**
 * `inFlight` is `effects.ts`'s answer to "is this item still in the air on its way home". A returned
 * item is on the shelf in `core/` the tick it is fetched, and drawn here as well as mid-flight it
 * would be on the shelf twice until the flight lands. Handed in by `drawFrame` rather than imported,
 * because `effects.ts` imports `shelfSlot` from this file.
 */
export function drawFridge(
	ctx: CanvasRenderingContext2D,
	world: World,
	tilePx: number,
	dpr: number,
	inFlight: (foodId: EntityId) => boolean,
): void {
	const food = world.night.food
	drawBackdrop(ctx, world.map, food.length, tilePx)

	food.forEach((item, index) => {
		if (!isOnShelf(item) || inFlight(item.id)) {
			return
		}
		const at = shelfSlot(world.map, index)
		blitGlyph(
			ctx,
			dpr,
			getFoodDef(item.defId).glyph,
			foodGlyphSize(tilePx),
			(at.x + 0.5) * tilePx,
			(at.y + 0.5) * tilePx,
		)
	})
}

/** The size the shelf, the theft animation and a thief's carry all blit a food glyph at. */
export function foodGlyphSize(tilePx: number): number {
	return tilePx * ITEM_SCALE
}

/**
 * Rasterises the twelve foods at both sizes they are drawn at: the shelf's, and the floor's larger one
 * for food a thief dropped. See `preloadEnemyGlyphs` on why the size matters and why this runs after
 * `Renderer.setMap`.
 */
export function preloadFoodGlyphs(tilePx: number): void {
	preload(FOODS.map(def => ({ emoji: def.glyph, sizePx: foodGlyphSize(tilePx) })))
	preload(FOODS.map(def => ({ emoji: def.glyph, sizePx: droppedFoodGlyphSize(tilePx) })))
}
