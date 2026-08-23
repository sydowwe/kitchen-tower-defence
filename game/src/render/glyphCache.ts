/**
 * Emoji are rasterised once and blitted forever after.
 *
 * `fillText` with a colour emoji font is one of the most expensive calls in a 2d context; at ~500
 * entities a frame it is the whole budget. Every glyph therefore becomes a tight offscreen canvas
 * the first time it is asked for, and every draw after that is a `drawImage`
 * (ARCHITECTURE.md section 6).
 */

/** Shared with `dev/debug/overlay.ts`, which draws a rotated glyph `blitGlyph` cannot express. */
export const EMOJI_FONT = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif"

/** Breathing room around the measured box, so antialiased edges are not clipped. */
const PADDING_PX = 2

export interface GlyphRequest {
	emoji: string
	sizePx: number
	/** See `getGlyph`. Omitted for emoji, which ignore it. */
	color?: string
}

const cache = new Map<string, HTMLCanvasElement>()

let measureContext: CanvasRenderingContext2D | null = null

function getMeasureContext(): CanvasRenderingContext2D {
	if (measureContext === null) {
		const context = document.createElement('canvas').getContext('2d')
		if (context === null) {
			throw new Error('2d canvas context unavailable')
		}
		measureContext = context
	}
	return measureContext
}

function fontFor(pixelSize: number): string {
	return `${pixelSize}px ${EMOJI_FONT}`
}

function rasterise(emoji: string, sizePx: number, dpr: number, color: string | undefined): HTMLCanvasElement {
	const pixelSize = sizePx * dpr
	const font = fontFor(pixelSize)

	const measure = getMeasureContext()
	measure.font = font
	measure.textAlign = 'left'
	measure.textBaseline = 'alphabetic'
	const metrics = measure.measureText(emoji)

	// Fall back to the em box when a browser omits the actual bounding box metrics.
	const left = metrics.actualBoundingBoxLeft || 0
	const right = metrics.actualBoundingBoxRight || metrics.width || pixelSize
	const ascent = metrics.actualBoundingBoxAscent || pixelSize * 0.8
	const descent = metrics.actualBoundingBoxDescent || pixelSize * 0.2

	const canvas = document.createElement('canvas')
	canvas.width = Math.max(1, Math.ceil(left + right) + PADDING_PX * 2)
	canvas.height = Math.max(1, Math.ceil(ascent + descent) + PADDING_PX * 2)

	const context = canvas.getContext('2d')
	if (context === null) {
		throw new Error('2d canvas context unavailable')
	}
	context.font = font
	context.textAlign = 'left'
	context.textBaseline = 'alphabetic'
	if (color !== undefined) {
		context.fillStyle = color
	}
	context.fillText(emoji, PADDING_PX + left, PADDING_PX + ascent)

	return canvas
}

/**
 * The rasterised glyph, memoised on `emoji|sizePx|devicePixelRatio|color`. The dpr is part of the key
 * because dragging the window to a second monitor changes it, and a glyph baked at 1x looks soft
 * on a 2x display.
 *
 * **`emoji` is any string, and `color` is what makes that useful.** A colour emoji font ignores
 * `fillStyle`, so every existing call here is unaffected by the parameter; what it buys is the
 * damage numbers of step 6C and the floating `+N` of step 7 going through this cache instead of
 * `fillText`, which `render/` has nowhere outside `rasterise` above.
 *
 * The cost of that is a key space the caller has to keep finite: a caller rasterising *text* must
 * round it first. `'5'` is one entry forever; `'5.000000001'` is a fresh entry per hit, and the
 * symptom is memory climbing all night with nothing else visibly wrong.
 */
export function getGlyph(emoji: string, sizePx: number, color?: string): HTMLCanvasElement {
	const dpr = window.devicePixelRatio || 1
	const key = `${emoji}|${sizePx}|${dpr}|${color ?? ''}`
	const cached = cache.get(key)
	if (cached !== undefined) {
		return cached
	}
	const canvas = rasterise(emoji, sizePx, dpr, color)
	cache.set(key, canvas)
	return canvas
}

/**
 * Blits a cached glyph centred on (x, y) in the logical units of a context already scaled by `dpr`.
 *
 * The `dpr` is a parameter rather than `window.devicePixelRatio` because there are two contexts
 * with two of them: the live canvas, and the offscreen terrain bake. Both need the same
 * divide-then-round, and two copies of it drift.
 *
 * `flipX` mirrors the glyph about its own centre, which is how an enemy heading left is drawn: every
 * enemy in the roster is side-on, and rotating one to follow a vertical run of track reads as a dead
 * bug (step 5C, decision 3). It lives here rather than in the caller so there is one copy of the
 * device-pixel rounding above, not two.
 */
export function blitGlyph(
	ctx: CanvasRenderingContext2D,
	dpr: number,
	emoji: string,
	sizePx: number,
	x: number,
	y: number,
	flipX = false,
	color?: string,
): void {
	const glyph = getGlyph(emoji, sizePx, color)
	const width = glyph.width / dpr
	const height = glyph.height / dpr
	// Snap to whole device pixels: sub-pixel emoji is blurry and costs more to composite.
	const left = Math.round((x - width / 2) * dpr) / dpr
	const top = Math.round((y - height / 2) * dpr) / dpr

	if (!flipX) {
		ctx.drawImage(glyph, left, top, width, height)
		return
	}

	ctx.save()
	ctx.translate(left + width / 2, 0)
	ctx.scale(-1, 1)
	ctx.drawImage(glyph, -width / 2, top, width, height)
	ctx.restore()
}

/** Rasterise ahead of time, so the first frame of a night is not the one paying for forty glyphs. */
export function preload(glyphs: readonly GlyphRequest[]): void {
	for (const glyph of glyphs) {
		getGlyph(glyph.emoji, glyph.sizePx, glyph.color)
	}
}

/** Drops every entry. Only useful for tests and for a hot reload in dev. */
export function clearGlyphCache(): void {
	cache.clear()
}

export function glyphCacheSize(): number {
	return cache.size
}
