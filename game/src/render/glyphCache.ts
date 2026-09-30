/**
 * Emoji are rasterised once and blitted forever after.
 *
 * `fillText` with a colour emoji font is one of the most expensive calls in a 2d context; at ~500
 * entities a frame it is the whole budget. Every glyph therefore becomes a tight offscreen canvas
 * the first time it is asked for, and every draw after that is a `drawImage`
 * (ARCHITECTURE.md section 6).
 *
 * A glyph with a drawn sprite (`render/sprites.ts`) is rasterised from the image instead, with its
 * halo, into the same kind of offscreen canvas -- so the per-frame cost is the same one `drawImage`.
 */

import { SPRITE_HALO } from '@/render/palette.ts'
import { getSprite } from '@/render/sprites.ts'

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
 * How much of its frame a sprite's object fills (analytic-docs/SPRITES.md asks for 85%). The frame is
 * drawn larger by the same factor so the *object* comes out at `sizePx`, the size the emoji was:
 * every `*_SCALE` in `layers/` was tuned by eye against emoji.
 */
const SPRITE_FILL = 0.85

/** The halo's width in logical pixels, so it is the same thickness at every device pixel ratio. */
const HALO_PX = 1.5

/** Directions the silhouette is stamped in to build the halo. 16 keeps a 4.5-device-pixel ring round at 3x. */
const HALO_STEPS = 16

function createContext(width: number, height: number): CanvasRenderingContext2D {
	const canvas = document.createElement('canvas')
	canvas.width = width
	canvas.height = height
	const context = canvas.getContext('2d')
	if (context === null) {
		throw new Error('2d canvas context unavailable')
	}
	return context
}

/**
 * The sprite scaled once to its device size, then a halo built behind it: the silhouette stamped in a
 * ring of `HALO_STEPS` offsets, recoloured with `source-in`, and the sprite drawn back over the middle.
 *
 * The scale is done here with smoothing on, not by `drawImage` at blit time: the live context runs
 * with `imageSmoothingEnabled = false` for the emoji, and a 128px sprite squeezed to ~80 without
 * smoothing is jagged.
 */
function rasteriseSprite(image: HTMLImageElement, sizePx: number, dpr: number): HTMLCanvasElement {
	const frame = (sizePx / SPRITE_FILL) * dpr
	const longest = Math.max(image.naturalWidth, image.naturalHeight, 1)
	const width = Math.max(1, Math.round((frame * image.naturalWidth) / longest))
	const height = Math.max(1, Math.round((frame * image.naturalHeight) / longest))

	const scaled = createContext(width, height)
	scaled.imageSmoothingEnabled = true
	scaled.imageSmoothingQuality = 'high'
	scaled.drawImage(image, 0, 0, width, height)

	const halo = HALO_PX * dpr
	const inset = Math.ceil(halo) + PADDING_PX
	const out = createContext(width + inset * 2, height + inset * 2)
	for (let step = 0; step < HALO_STEPS; step++) {
		const angle = (step / HALO_STEPS) * Math.PI * 2
		out.drawImage(scaled.canvas, inset + Math.cos(angle) * halo, inset + Math.sin(angle) * halo)
	}
	out.globalCompositeOperation = 'source-in'
	out.fillStyle = SPRITE_HALO
	out.fillRect(0, 0, out.canvas.width, out.canvas.height)
	out.globalCompositeOperation = 'source-over'
	out.drawImage(scaled.canvas, inset, inset)

	return out.canvas
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
 *
 * **Whether a sprite is in play is part of the key.** Sprites decode asynchronously, and a glyph
 * asked for before its file is ready is cached as the emoji. The key changes the moment the sprite
 * lands, so the next frame rasterises it with no eviction step -- the emoji entry just stays behind,
 * one per sprited glyph and size.
 */
export function getGlyph(emoji: string, sizePx: number, color?: string): HTMLCanvasElement {
	const dpr = window.devicePixelRatio || 1
	const sprite = getSprite(emoji)
	const key = `${emoji}|${sizePx}|${dpr}|${color ?? ''}|${sprite === undefined ? '' : 'sprite'}`
	const cached = cache.get(key)
	if (cached !== undefined) {
		return cached
	}
	const canvas = sprite === undefined ? rasterise(emoji, sizePx, dpr, color) : rasteriseSprite(sprite, sizePx, dpr)
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
