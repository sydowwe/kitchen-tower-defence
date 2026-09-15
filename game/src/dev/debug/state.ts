/**
 * The debug overlay's toggle, marker, hover and tile brush, plus the listeners that drive them.
 *
 * Lives in `dev/` and not `render/` because it is a tool, not a system (CLAUDE.md, the layering
 * rule) -- `dev/` is exempt from `core/`'s determinism lint rules, so this is the one place allowed
 * to read `performance.now()` for the marker's hold-to-accelerate ramp.
 *
 * **The marker is not a command and not an entity.** It is a plain number nudged by arrow keys, never
 * enqueued through `core/commands.ts` and never written to `world` -- a replay must reproduce
 * identically whether or not someone had the overlay open (step 3C, decision 3).
 *
 * **The brush is the opposite, on purpose.** It writes `world.tiles` directly through
 * `core/tiles.ts` and is not a command: a `PaintTile` member of the `Command` union would ship in
 * every production build and sit in every command log, and the whole point of the tool is to produce
 * board states no command log would ever contain. `GameView.vue`'s `onDevWakeNow` has written
 * `world.noise.level` from a dev panel since step 13B for the same reason, and both are
 * `import.meta.env.DEV`-only by construction (step 14B, decision 1). It does not overturn the
 * marker's rule above: that one is about a tool which does *not* change the world pretending it
 * might.
 */

import { clearEffect, writeEffect } from '@/core/tiles.ts'
import { isOnBoard, LOGICAL_WIDTH, toGridPoint, toTile } from '@/render/index.ts'
import { isTypingTarget } from '@/ui/keyboard.ts'
import { totalLength } from '@/core/path.ts'
import type { MapDef, TileEffectKind, Vec2, World } from '@/core/types.ts'

/** Tiles per second at the instant a direction key is pressed. */
const BASE_SPEED_TILES_PER_SEC = 4
/** Ceiling the ramp accelerates toward while a direction key stays held. */
const MAX_SPEED_TILES_PER_SEC = 40
/** How fast the ramp climbs from base to max, in tiles/sec per second held. */
const ACCEL_TILES_PER_SEC2 = 36

/**
 * Which letter arms which kind, and the one place the binding is written.
 *
 * **Deliberately not the digit keys.** `ui/interaction.ts` maps `1`-`0` onto `TOWERS` on a `window`
 * listener, so a digit brush would arm a tower every time you painted. `Space`, `,`, `.`, `n`, `x`,
 * `u` and `Escape` are taken by the same file, and `` ` ``, `[` and `]` by this one.
 */
export const BRUSH_KEYS: ReadonlyArray<{ key: string; kind: TileEffectKind }> = [
	{ key: 'h', kind: 'heat' },
	{ key: 's', kind: 'slime' },
	{ key: 'm', kind: 'mold' },
	{ key: 'r', kind: 'residue' },
	{ key: 'c', kind: 'scorch' },
]

/** Every kind the brush can clear, which is every kind it can paint. */
const ALL_KINDS: readonly TileEffectKind[] = BRUSH_KEYS.map(binding => binding.kind)

/** Shift-h is still the heat brush. Both the down and the up handler go through this. */
function brushKindFor(key: string): TileEffectKind | null {
	const lowered = key.toLowerCase()
	return BRUSH_KEYS.find(binding => binding.key === lowered)?.kind ?? null
}

export interface DebugState {
	enabled: boolean
	/** Tiles travelled along the active path. Clamped to `[0, totalLength]` by the caller. */
	markerDistance: number
	/** Index into `MapDef.paths`. `[` and `]` cycle it for the multi-lane maps from night 10. */
	activePathIndex: number
	/** The tile under the pointer, or null while the pointer is off the board. */
	hoverTile: Vec2 | null
	/** The kind a held brush key paints, or null with nothing armed. See `BRUSH_KEYS`. */
	brush: TileEffectKind | null
	/**
	 * CSS pixels per logical pixel: what the board is being scaled by right now.
	 *
	 * `dev/debug/overlay.ts` needs it to place the legend clear of the HUD's DOM panels, which are
	 * laid out in CSS pixels while the canvas draws in logical ones. It is **kept here, off a
	 * `ResizeObserver`, rather than measured in the draw**: `getBoundingClientRect()` forces a
	 * synchronous layout, and the draw is the 60Hz path that ARCHITECTURE.md section 6 budgets. A
	 * resize is the only thing that can change this number, so it is read when one happens and not
	 * sixty times a second.
	 */
	boardScale: number
}

export interface DebugController {
	readonly state: DebugState
	/**
	 * Advances the marker by however much wall-clock time passed since the last call, and lays down
	 * one brush stroke if one is armed and held. Call once per drawn frame.
	 */
	update(): void
	destroy(): void
}

const FORWARD_KEYS = new Set(['ArrowRight', 'ArrowDown'])
const BACKWARD_KEYS = new Set(['ArrowLeft', 'ArrowUp'])

/**
 * `getWorld` is a **getter**, never the world, and matches
 * `createInteraction(canvasEl, queue, selection, () => world, ...)` for the same reason:
 * `GameView.vue`'s `restart()` replaces `world` wholesale on every retry, so a captured reference
 * paints into the previous night.
 */
export function createDebugController(
	canvas: HTMLCanvasElement,
	getMap: () => MapDef,
	getWorld: () => World | null,
): DebugController {
	const state: DebugState = {
		enabled: false,
		markerDistance: 0,
		activePathIndex: 0,
		hoverTile: null,
		brush: null,
		boardScale: 1,
	}

	/** Fires once on observe, so the initial scale needs no separate read. */
	const resizeObserver = new ResizeObserver(entries => {
		const width = entries[0]?.contentRect.width ?? 0
		if (width > 0) {
			state.boardScale = width / LOGICAL_WIDTH
		}
	})
	resizeObserver.observe(canvas)

	const held = new Set<string>()
	/**
	 * Brush letters currently down, kept apart from `held` above so a brush key never counts as a
	 * direction and never leaves the marker's acceleration ramp armed after the arrow is released.
	 */
	const brushHeld = new Set<TileEffectKind>()
	/** `performance.now()` timestamp the currently-held direction started at, or null when idle. */
	let heldSinceMs: number | null = null
	let lastUpdateMs: number | null = null

	function clampPathIndex(): void {
		const count = getMap().paths.length
		if (state.activePathIndex >= count) {
			state.activePathIndex = Math.max(0, count - 1)
		}
	}

	function onKeyDown(event: KeyboardEvent): void {
		if (isTypingTarget(event.target)) {
			return
		}

		if (event.key === '`') {
			event.preventDefault()
			state.enabled = !state.enabled
			return
		}

		if (!state.enabled) {
			return
		}

		if (event.key === '[' || event.key === ']') {
			event.preventDefault()
			clampPathIndex()
			const count = getMap().paths.length
			const direction = event.key === ']' ? 1 : -1
			state.activePathIndex = (state.activePathIndex + direction + count) % count
			state.markerDistance = 0
			return
		}

		if (FORWARD_KEYS.has(event.key) || BACKWARD_KEYS.has(event.key)) {
			event.preventDefault()
			if (!held.has(event.key)) {
				held.add(event.key)
				heldSinceMs ??= performance.now()
			}
			return
		}

		// Without it the browser navigates back and the session is over.
		if (event.key === 'Backspace') {
			event.preventDefault()
			clearHovered()
			return
		}

		const kind = brushKindFor(event.key)
		if (kind === null) {
			return
		}
		event.preventDefault()
		// Auto-repeat fires `keydown` every few tens of milliseconds while a key is down, and an
		// unguarded toggle would arm and disarm the brush the whole time it was held.
		if (brushHeld.has(kind)) {
			return
		}
		brushHeld.add(kind)
		state.brush = state.brush === kind ? null : kind
	}

	function onKeyUp(event: KeyboardEvent): void {
		held.delete(event.key)
		if (held.size === 0) {
			heldSinceMs = null
		}

		const kind = brushKindFor(event.key)
		if (kind !== null) {
			brushHeld.delete(kind)
		}
	}

	/**
	 * Every effect off the hovered cell, **one `clearEffect` per kind** rather than a splice of
	 * `world.tiles`. Going around the API is how the released-cell invariant 14A tests for -- a cell
	 * disappears with its last effect, it does not stay behind as an empty shell -- stops holding.
	 */
	function clearHovered(): void {
		const world = getWorld()
		if (!state.enabled || world === null || state.hoverTile === null) {
			return
		}
		for (const kind of ALL_KINDS) {
			clearEffect(world, state.hoverTile, kind)
		}
	}

	/**
	 * One write per drawn frame while the armed key is down and the pointer is on the board.
	 *
	 * `writeEffect` refreshes rather than stacking, so once a frame is the right rate and a held key
	 * is a drag-brush for free -- `hoverTile` is already tracked on `pointermove`. A click-brush was
	 * never an option: `ui/interaction.ts` owns the canvas `pointerdown` for placement and
	 * collection, so both listeners would fire and one click would paint a tile *and* build a tower
	 * on it (step 14B, decision 2).
	 */
	function paint(): void {
		const world = getWorld()
		if (!state.enabled || world === null || state.brush === null || state.hoverTile === null) {
			return
		}
		if (!brushHeld.has(state.brush)) {
			return
		}
		writeEffect(world, state.hoverTile, state.brush)
	}

	function onPointerMove(event: PointerEvent): void {
		const map = getMap()
		const tile = toTile(toGridPoint(canvas, event, map.widthTiles))
		state.hoverTile = isOnBoard(tile, map.widthTiles, map.heightTiles) ? tile : null
	}

	function onPointerLeave(): void {
		state.hoverTile = null
	}

	window.addEventListener('keydown', onKeyDown)
	window.addEventListener('keyup', onKeyUp)
	canvas.addEventListener('pointermove', onPointerMove)
	canvas.addEventListener('pointerleave', onPointerLeave)

	function update(): void {
		const now = performance.now()
		const dtSec = lastUpdateMs === null ? 0 : (now - lastUpdateMs) / 1000
		lastUpdateMs = now

		paint()

		if (!state.enabled || held.size === 0 || dtSec <= 0) {
			return
		}

		const direction =
			(Array.from(held).some(key => FORWARD_KEYS.has(key)) ? 1 : 0) -
			(Array.from(held).some(key => BACKWARD_KEYS.has(key)) ? 1 : 0)
		if (direction === 0) {
			return
		}

		const heldSec = heldSinceMs === null ? 0 : (now - heldSinceMs) / 1000
		const speed = Math.min(MAX_SPEED_TILES_PER_SEC, BASE_SPEED_TILES_PER_SEC + ACCEL_TILES_PER_SEC2 * heldSec)

		clampPathIndex()
		const path = getMap().paths[state.activePathIndex]
		const limit = path === undefined ? 0 : totalLength(path)
		state.markerDistance = Math.min(Math.max(state.markerDistance + direction * speed * dtSec, 0), limit)
	}

	function destroy(): void {
		resizeObserver.disconnect()
		window.removeEventListener('keydown', onKeyDown)
		window.removeEventListener('keyup', onKeyUp)
		canvas.removeEventListener('pointermove', onPointerMove)
		canvas.removeEventListener('pointerleave', onPointerLeave)
	}

	return { state, update, destroy }
}
