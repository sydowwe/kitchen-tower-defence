/**
 * The contact shadow under everything that stands on the floor.
 *
 * One ellipse, offset down and to the right -- away from the lamp at the upper left that the sprites'
 * rim light comes from (analytic-docs/SPRITES.md) -- and a flyer's own shadow (`entities.ts`) is the
 * same colour family, so a walker and a flyer read as cast by one light.
 *
 * **These add to a path the caller owns.** A layer opens one `beginPath`, traces every shadow it has,
 * and fills once: a `fill` per enemy is two hundred fills (`drawFlyerShadows` is the precedent).
 *
 * The radius is taken from the *object*, never from the rasterised bitmap: `SPRITE_FILL` in
 * `glyphCache.ts` frames a sprite 18% larger than the object so the object comes out at `sizePx`, and a
 * shadow sized off the bitmap is 18% too wide.
 */

/** How far the shadow is thrown, in tiles. Small: it is contact, not a long evening shadow. */
const SHADOW_OFFSET_X_TILES = 0.06
const SHADOW_OFFSET_Y_TILES = 0.08

/** An ellipse rather than a disc, because the board is drawn from a little above. */
const SHADOW_SQUASH = 0.4

/**
 * Adds one shadow to the open path. `footY` is where the object meets the floor -- below the glyph's
 * centre, by a fraction of its size -- and `radiusPx` is the shadow's half-width.
 */
export function traceShadow(
	ctx: CanvasRenderingContext2D,
	tilePx: number,
	x: number,
	footY: number,
	radiusPx: number,
): void {
	const centreX = x + SHADOW_OFFSET_X_TILES * tilePx
	const centreY = footY + SHADOW_OFFSET_Y_TILES * tilePx
	ctx.moveTo(centreX + radiusPx, centreY)
	ctx.ellipse(centreX, centreY, radiusPx, radiusPx * SHADOW_SQUASH, 0, 0, Math.PI * 2)
}
