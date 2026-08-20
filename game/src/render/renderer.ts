import { blitGlyph } from '@/render/glyphCache.ts'
import { drawEntities, drawTerrain, drawTrack } from '@/render/layers/index.ts'
import { BACKGROUND } from '@/render/palette.ts'
import type { MapDef, World } from '@/core/types.ts'

/**
 * The frame entry point, and the only place that knows the canvas exists.
 *
 * The board is a fixed logical 1152 x 672. The backing store is that multiplied by the device pixel
 * ratio, and the context is scaled once so every other file can work in logical units. CSS scales
 * the element to the window, preserving aspect ratio -- see GameView.vue.
 *
 * Terrain and track never change during a night, so they are baked once into an offscreen canvas
 * and the frame is a single `drawImage` of it (analytic-docs/ARCHITECTURE.md section 6).
 */

export const LOGICAL_WIDTH = 1152
export const LOGICAL_HEIGHT = 672

export interface Renderer {
	readonly ctx: CanvasRenderingContext2D
	/** Device pixel ratio the backing store is currently sized for. */
	readonly dpr: number
	/** Logical pixels per tile for the current map, or 0 before one is set. */
	readonly tilePx: number
	/** Re-sizes the backing store if the device pixel ratio changed. Cheap to call on every resize event. */
	resize(): void
	clear(): void
	/** Blits a cached glyph centred on (x, y), in logical units. */
	drawGlyph(emoji: string, sizePx: number, x: number, y: number): void
	/** The map to draw. Bakes terrain and track; cheap to call again with the same map. */
	setMap(map: MapDef): void
	/** One frame. `world` is null until step 5 puts a simulation behind the board. */
	drawFrame(world: World | null): void
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
	const maybeCtx = canvas.getContext('2d', { alpha: false })
	if (maybeCtx === null) {
		throw new Error('2d canvas context unavailable')
	}
	const ctx: CanvasRenderingContext2D = maybeCtx

	let dpr = 0
	let map: MapDef | null = null
	let tilePx = 0

	let bake: HTMLCanvasElement | null = null
	/** What `bake` currently holds. The pair, not just the map -- see `ensureBake`. */
	let bakedMap: MapDef | null = null
	let bakedDpr = 0

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
		blitGlyph(ctx, dpr, emoji, sizePx, x, y)
	}

	/**
	 * Tile size is derived, never a constant. It comes out at 48 for every authored map, but step
	 * 4's editor hands out half-finished maps of other sizes, and a hard-coded 48 turns that into a
	 * silent misalignment instead of a visibly smaller board.
	 */
	function rebake(target: MapDef, atDpr: number): void {
		if (import.meta.env.DEV) {
			// Acceptance criterion for step 3B: once per (map, dpr) pair, never per frame.
			console.count('[render] terrain bake')
		}

		const offscreen = document.createElement('canvas')
		offscreen.width = Math.round(LOGICAL_WIDTH * atDpr)
		offscreen.height = Math.round(LOGICAL_HEIGHT * atDpr)

		const bakeCtx = offscreen.getContext('2d', { alpha: false })
		if (bakeCtx === null) {
			throw new Error('2d canvas context unavailable')
		}
		// The offscreen canvas is sized in device pixels and does *not* inherit the live context's
		// transform. Without this the whole map draws at 1/dpr scale in the top-left corner.
		bakeCtx.setTransform(atDpr, 0, 0, atDpr, 0, 0)
		bakeCtx.imageSmoothingEnabled = false

		bakeCtx.fillStyle = BACKGROUND
		bakeCtx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT)

		drawTerrain(bakeCtx, target, tilePx, atDpr)
		drawTrack(bakeCtx, target, tilePx, atDpr)

		bake = offscreen
		bakedMap = target
		bakedDpr = atDpr
	}

	/**
	 * The bake is keyed by `(map, dpr)` and not by map alone: the offscreen canvas is backed at
	 * device resolution, so a window dragged to a display with a different `devicePixelRatio` needs
	 * a fresh one or it blits soft and mis-scaled.
	 */
	function ensureBake(): void {
		if (map === null) {
			return
		}
		if (bakedMap === map && bakedDpr === dpr) {
			return
		}
		rebake(map, dpr)
	}

	function setMap(next: MapDef): void {
		map = next
		tilePx = LOGICAL_WIDTH / next.widthTiles
		ensureBake()
	}

	function drawFrame(world: World | null): void {
		// Draw order, documented the way sim.ts documents its system order. Everything before
		// `entities` is in the bake; everything after it is a later step's, and is named here so
		// none of them can quietly insert itself in the wrong place.
		//
		//   terrain -> track -> tile effects -> crumbs -> towers -> enemies -> projectiles
		//   -> particles -> overlay

		ensureBake()
		clear()

		// terrain + track
		if (bake !== null) {
			ctx.drawImage(bake, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT)
		}

		// tile effects: step 15
		// crumbs: step 7
		// towers: step 6
		drawEntities(ctx, world, tilePx, dpr)
		// projectiles: step 6
		// particles: step 12
		// overlay: step 3C
	}

	resize()

	return {
		ctx,
		get dpr() {
			return dpr
		},
		get tilePx() {
			return tilePx
		},
		resize,
		clear,
		drawGlyph,
		setMap,
		drawFrame,
	}
}
