/**
 * Food on the floor: what a thief was carrying when it died, lying where it fell until a click or a
 * `collect` radius sends it home.
 *
 * **`core/` drops every item from one death on one exact point** (`dropCarried`), so the fan is drawn
 * here and never simulated -- the chew queue's and the feeding fan's rule. And the fan is one exported
 * function that both the draw and `pickFood` go through, which is `crumbPosition`'s rule: the thing
 * clicked is the thing drawn, and two copies of the arithmetic is how a click lands on where the
 * cheese would have been.
 *
 * Positions are waypoint space, the space `FoodItem.droppedAt` and `Crumb.position` are in.
 *
 * The pulse ages in **frames**, like every other treatment in `render/`: at 3x a pulse aged in ticks
 * is a strobe.
 */

import { getFoodDef } from '@/core/content/index.ts'
import type { FoodItem, Vec2, World } from '@/core/types.ts'
import { blitGlyph } from '@/render/glyphCache.ts'
import { DROPPED_FOOD_GLOW, DROPPED_FOOD_RING } from '@/render/palette.ts'

/**
 * Bigger than the shelf's 0.5 and than the fattest crumb pile's 0.56: the two share the track, and the
 * food is the one that matters.
 */
const FLOOR_ITEM_SCALE = 0.62
/** Tiles from the drop point each item of a fan sits. Enough that five do not overlap, few enough to read as one spill. */
const FAN_RADIUS_TILES = 0.34

const GLOW_MIN_RADIUS_TILES = 0.36
const GLOW_MAX_RADIUS_TILES = 0.5
const RING_RADIUS_TILES = 0.42
const RING_WIDTH_PX = 2
/** Radians per frame. ~0.7 of a pulse a second: slower than a flicker, faster than the mold's breath. */
const GLOW_PER_FRAME = 0.075

let ageFrames = 0

/** The size a dropped item is blitted at. `preloadFoodGlyphs` rasterises the roster at it. */
export function droppedFoodGlyphSize(tilePx: number): number {
	return tilePx * FLOOR_ITEM_SCALE
}

/**
 * Where a dropped item is drawn, fanned round its drop point, or null for one not on the floor.
 *
 * Its slot in the fan is its rank among the items lying at the **same** point, in `night.food` order,
 * so the fan does not reshuffle when a neighbour from another drop is fetched. A lone item sits on
 * the point itself. Items from two deaths on the same spot share one fan, which is what a pile is.
 */
export function droppedFoodPosition(food: readonly FoodItem[], item: FoodItem): Vec2 | null {
	const at = item.droppedAt
	if (at === null) {
		return null
	}

	let count = 0
	let rank = 0
	for (const other of food) {
		const there = other.droppedAt
		if (there === null || there.x !== at.x || there.y !== at.y) {
			continue
		}
		if (other === item) {
			rank = count
		}
		count++
	}

	if (count <= 1) {
		return at
	}

	// From the top, clockwise: the first item taken is the one at twelve o'clock.
	const angle = -Math.PI / 2 + (rank / count) * Math.PI * 2
	return { x: at.x + Math.cos(angle) * FAN_RADIUS_TILES, y: at.y + Math.sin(angle) * FAN_RADIUS_TILES }
}

/**
 * Drawn on the floor with the crumbs, and **after** them: a pile beside a dropped pizza sits under it.
 * Under the towers and the enemies, like everything else lying on the track.
 */
export function drawDroppedFood(ctx: CanvasRenderingContext2D, world: World | null, tilePx: number, dpr: number): void {
	if (world === null) {
		return
	}

	ageFrames++
	const food = world.night.food
	const size = droppedFoodGlyphSize(tilePx)

	for (const item of food) {
		const at = droppedFoodPosition(food, item)
		if (at === null) {
			continue
		}

		const x = (at.x + 0.5) * tilePx
		const y = (at.y + 0.5) * tilePx
		// Offset by position, so a fan breathes as a ripple round the spill rather than in unison.
		const pulse = 0.5 + 0.5 * Math.sin(ageFrames * GLOW_PER_FRAME + at.x * 2 + at.y)

		ctx.fillStyle = DROPPED_FOOD_GLOW
		ctx.beginPath()
		ctx.arc(
			x,
			y,
			(GLOW_MIN_RADIUS_TILES + (GLOW_MAX_RADIUS_TILES - GLOW_MIN_RADIUS_TILES) * pulse) * tilePx,
			0,
			Math.PI * 2,
		)
		ctx.fill()

		ctx.globalAlpha = 0.45 + 0.55 * pulse
		ctx.strokeStyle = DROPPED_FOOD_RING
		ctx.lineWidth = RING_WIDTH_PX
		ctx.beginPath()
		ctx.arc(x, y, RING_RADIUS_TILES * tilePx, 0, Math.PI * 2)
		ctx.stroke()
		ctx.globalAlpha = 1

		blitGlyph(ctx, dpr, getFoodDef(item.defId).glyph, size, x, y)
	}
}

/**
 * Every dropped item under the pointer -- all of them, not the nearest, so one click on a spill sends
 * the whole of it home. `pickCrumb`'s contract otherwise: `atTiles` in waypoint space, the drawn radius
 * plus a margin in logical pixels.
 */
export function pickFood(world: World, atTiles: Vec2, tilePx: number, forgivenessPx: number): FoodItem[] {
	const food = world.night.food
	const reach = RING_RADIUS_TILES * tilePx + forgivenessPx
	const picked: FoodItem[] = []

	for (const item of food) {
		const at = droppedFoodPosition(food, item)
		if (at === null) {
			continue
		}
		const dx = (at.x - atTiles.x) * tilePx
		const dy = (at.y - atTiles.y) * tilePx
		if (dx * dx + dy * dy <= reach * reach) {
			picked.push(item)
		}
	}

	return picked
}
