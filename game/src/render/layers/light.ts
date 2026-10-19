/**
 * The dark, and the holes in it.
 *
 * The kitchen at 2am is dark by default, and what the player places makes it less so. That is a
 * **layer** and not a darker palette: each time the board's lights change, an offscreen light map is
 * filled with the night, has a hole cut for every light with `destination-out`, and gets a warm tint
 * on top of the lamps' holes. The frame is then one `drawImage` of it over the terrain bake.
 *
 * It sits between the bake and the tile effects, so it darkens the floor and the track and nothing
 * else. Everything standing on or written onto the floor draws over it at full strength, which is how
 * "the kitchen looks dark" and "the board is the brightest thing on screen" are both true.
 *
 * **Light sources come from behaviours, never from ids** (so a lamp tower added as config arrives
 * already lit): a `reveal` is a lamp, warm; a `tileEffect` of kind `heat` is a flame, which lifts the
 * dark without the amber -- `TILE_HEAT_PULSE` in `palette.ts` explains why heat is kept out of the
 * lamp family. The fridge is the one fixed light, and it is in the bake, so its hole clears its tile
 * completely or the warmest object on the board draws as a dark lump.
 *
 * **Rebuilt when its source signature changes**, not every frame: each source's pixel position and
 * effective radius, plus the dpr. Keyed by tower id alone, an upgraded Nightlight would keep its old
 * pool until something else was placed. The signature is compared number by number against the last
 * one, so a quiet frame allocates nothing.
 *
 * One instance per renderer. The map is the editor's as well as the game's: with no world it is lit by
 * the fridge alone, so a map is authored under the light it will be played in.
 */

import { isReveal, isTileEffect } from '@/core/content/behaviours.ts'
import { effectiveDefOf } from '@/core/content/index.ts'
import type { MapDef, World } from '@/core/types.ts'
import { DARKNESS, LAMP_CORE, LAMP_EDGE, TOWER_LIGHT_CORE, TOWER_LIGHT_EDGE } from '@/render/palette.ts'

/** The fridge's reach. Big and steady: it is the one light the room has before the player does anything. */
const FRIDGE_LIGHT_TILES = 3.4

/** A flame's hole, before its own radius is added. A Burner at tier 3 reaches a tile further. */
const FLAME_LIGHT_TILES = 1.5

/**
 * How much of a light's radius is cut clean through, and how it falls off after. A plateau and not a
 * point: the fridge's whole tile, glyph and shelf edge included, has to be inside the clear part.
 */
const CLEAR_PLATEAU = 0.4
const FALLOFF_MIDDLE_AT = 0.7
const FALLOFF_MIDDLE_CUT = 0.45

/** The numbers each source contributes to the signature, in order. */
const LAMP = 0
const FLAME = 1
const FIXED = 2
const STRIDE = 4

export interface LightLayer {
	/** Draws the dark over what is already on `ctx`. `widthPx` and `heightPx` are the logical board. */
	draw(
		ctx: CanvasRenderingContext2D,
		map: MapDef,
		world: World | null,
		tilePx: number,
		dpr: number,
		widthPx: number,
		heightPx: number,
	): void
}

/** Writes `x, y, radius, kind` for every light on the board into `out`, which is cleared first. */
function collectSources(out: number[], map: MapDef, world: World | null, tilePx: number): void {
	out.length = 0
	out.push((map.fridge.tile.x + 0.5) * tilePx, (map.fridge.tile.y + 0.5) * tilePx, FRIDGE_LIGHT_TILES * tilePx, FIXED)

	if (world === null) {
		return
	}
	for (const tower of world.towers) {
		const x = (tower.tile.x + 0.5) * tilePx
		const y = (tower.tile.y + 0.5) * tilePx
		for (const behaviour of effectiveDefOf(tower).behaviours) {
			if (isReveal(behaviour)) {
				out.push(x, y, behaviour.radiusTiles * tilePx, LAMP)
			} else if (isTileEffect(behaviour) && behaviour.effect === 'heat') {
				out.push(x, y, (FLAME_LIGHT_TILES + behaviour.radiusTiles) * tilePx, FLAME)
			}
		}
	}
}

function sameSources(a: readonly number[], b: readonly number[]): boolean {
	if (a.length !== b.length) {
		return false
	}
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
			return false
		}
	}
	return true
}

/** The hole: fully clear to `CLEAR_PLATEAU` of the radius, then falling to nothing at the edge. */
function cutGradient(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): CanvasGradient {
	const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
	gradient.addColorStop(0, 'rgba(0, 0, 0, 1)')
	gradient.addColorStop(CLEAR_PLATEAU, 'rgba(0, 0, 0, 1)')
	gradient.addColorStop(FALLOFF_MIDDLE_AT, `rgba(0, 0, 0, ${FALLOFF_MIDDLE_CUT})`)
	gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
	return gradient
}

function fillDisc(ctx: CanvasRenderingContext2D, fill: CanvasGradient, x: number, y: number, radius: number): void {
	ctx.fillStyle = fill
	ctx.beginPath()
	ctx.arc(x, y, radius, 0, Math.PI * 2)
	ctx.fill()
}

export function createLightLayer(): LightLayer {
	let canvas: HTMLCanvasElement | null = null
	let lightCtx: CanvasRenderingContext2D | null = null
	/** What `canvas` currently holds. Swapped with `scratch` on a rebuild, so neither is ever reallocated. */
	let built: number[] = []
	let scratch: number[] = []
	let builtDpr = 0

	function ensureCanvas(dpr: number, widthPx: number, heightPx: number): CanvasRenderingContext2D {
		const width = Math.round(widthPx * dpr)
		const height = Math.round(heightPx * dpr)
		if (canvas === null || lightCtx === null) {
			canvas = document.createElement('canvas')
			const created = canvas.getContext('2d')
			if (created === null) {
				throw new Error('2d canvas context unavailable')
			}
			lightCtx = created
		}
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width
			canvas.height = height
			// Forces a rebuild: a resize clears the canvas, and `built` would still say it was current.
			builtDpr = 0
		}
		return lightCtx
	}

	function rebuild(
		target: CanvasRenderingContext2D,
		sources: readonly number[],
		dpr: number,
		widthPx: number,
		heightPx: number,
	): void {
		// The offscreen canvas is sized in device pixels and does not inherit the live context's
		// transform: without this every pool draws at 1/dpr scale in the top-left corner.
		target.setTransform(1, 0, 0, 1, 0, 0)
		target.globalCompositeOperation = 'source-over'
		target.clearRect(0, 0, target.canvas.width, target.canvas.height)
		target.setTransform(dpr, 0, 0, dpr, 0, 0)

		target.fillStyle = DARKNESS
		target.fillRect(0, 0, widthPx, heightPx)

		target.globalCompositeOperation = 'destination-out'
		for (let i = 0; i < sources.length; i += STRIDE) {
			const x = sources[i] ?? 0
			const y = sources[i + 1] ?? 0
			const radius = sources[i + 2] ?? 0
			fillDisc(target, cutGradient(target, x, y, radius), x, y, radius)
		}

		// The warmth goes in the lamps' holes only. A flame's hole stays the colour of the floor.
		target.globalCompositeOperation = 'source-over'
		for (let i = 0; i < sources.length; i += STRIDE) {
			const kind = sources[i + 3]
			if (kind === FLAME) {
				continue
			}
			const x = sources[i] ?? 0
			const y = sources[i + 1] ?? 0
			const radius = sources[i + 2] ?? 0
			const tint = target.createRadialGradient(x, y, 0, x, y, radius)
			tint.addColorStop(0, kind === FIXED ? LAMP_CORE : TOWER_LIGHT_CORE)
			tint.addColorStop(1, kind === FIXED ? LAMP_EDGE : TOWER_LIGHT_EDGE)
			fillDisc(target, tint, x, y, radius)
		}
	}

	function draw(
		ctx: CanvasRenderingContext2D,
		map: MapDef,
		world: World | null,
		tilePx: number,
		dpr: number,
		widthPx: number,
		heightPx: number,
	): void {
		const target = ensureCanvas(dpr, widthPx, heightPx)

		collectSources(scratch, map, world, tilePx)
		if (builtDpr !== dpr || !sameSources(scratch, built)) {
			rebuild(target, scratch, dpr, widthPx, heightPx)
			const previous = built
			built = scratch
			scratch = previous
			builtDpr = dpr
		}

		if (canvas !== null) {
			ctx.drawImage(canvas, 0, 0, widthPx, heightPx)
		}
	}

	return { draw }
}
