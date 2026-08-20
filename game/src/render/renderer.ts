import { getGlyph } from '@/render/glyphCache.ts'

/**
 * The frame entry point, and the only place that knows the canvas exists.
 *
 * The board is a fixed logical 1152 x 672. The backing store is that multiplied by the device pixel
 * ratio, and the context is scaled once so every other file can work in logical units. CSS scales
 * the element to the window, preserving aspect ratio -- see GameView.vue.
 *
 * Layer draws (terrain, track, crumbs, entities, towers, effects) arrive in step 3. Until then this
 * hands out the primitives they will be built from.
 */

export const LOGICAL_WIDTH = 1152
export const LOGICAL_HEIGHT = 672

/** Matches --kd-night in App.vue. render/ cannot read CSS variables from core state, so it is duplicated here. */
const BACKGROUND = '#10131f'

export interface Renderer {
	readonly ctx: CanvasRenderingContext2D
	/** Device pixel ratio the backing store is currently sized for. */
	readonly dpr: number
	/** Re-sizes the backing store if the device pixel ratio changed. Cheap to call on every resize event. */
	resize(): void
	clear(): void
	/** Blits a cached glyph centred on (x, y), in logical units. */
	drawGlyph(emoji: string, sizePx: number, x: number, y: number): void
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
	const maybeCtx = canvas.getContext('2d', { alpha: false })
	if (maybeCtx === null) {
		throw new Error('2d canvas context unavailable')
	}
	const ctx: CanvasRenderingContext2D = maybeCtx

	let dpr = 0

	function resize(): void {
		const next = window.devicePixelRatio || 1
		if (next === dpr) {
			return
		}
		dpr = next
		canvas.width = Math.round(LOGICAL_WIDTH * dpr)
		canvas.height = Math.round(LOGICAL_HEIGHT * dpr)
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
		ctx.imageSmoothingEnabled = false
	}

	function clear(): void {
		ctx.fillStyle = BACKGROUND
		ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT)
	}

	function drawGlyph(emoji: string, sizePx: number, x: number, y: number): void {
		const glyph = getGlyph(emoji, sizePx)
		const width = glyph.width / dpr
		const height = glyph.height / dpr
		// Snap to whole device pixels: sub-pixel emoji is blurry and costs more to composite.
		const left = Math.round((x - width / 2) * dpr) / dpr
		const top = Math.round((y - height / 2) * dpr) / dpr
		ctx.drawImage(glyph, left, top, width, height)
	}

	resize()

	return {
		ctx,
		get dpr() {
			return dpr
		},
		resize,
		clear,
		drawGlyph,
	}
}
