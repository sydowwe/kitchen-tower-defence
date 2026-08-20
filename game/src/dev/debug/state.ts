/**
 * The debug overlay's toggle, marker and hover state, plus the listeners that drive them.
 *
 * Lives in `dev/` and not `render/` because it is a tool, not a system (CLAUDE.md, the layering
 * rule) -- `dev/` is exempt from `core/`'s determinism lint rules, so this is the one place allowed
 * to read `performance.now()` for the marker's hold-to-accelerate ramp.
 *
 * **The marker is not a command and not an entity.** It is a plain number nudged by arrow keys, never
 * enqueued through `core/commands.ts` and never written to `world` -- a replay must reproduce
 * identically whether or not someone had the overlay open (step 3C, decision 3).
 */

import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '@/render/renderer.ts'
import { totalLength } from '@/core/path.ts'
import type { MapDef, Vec2 } from '@/core/types.ts'

/** Tiles per second at the instant a direction key is pressed. */
const BASE_SPEED_TILES_PER_SEC = 4
/** Ceiling the ramp accelerates toward while a direction key stays held. */
const MAX_SPEED_TILES_PER_SEC = 40
/** How fast the ramp climbs from base to max, in tiles/sec per second held. */
const ACCEL_TILES_PER_SEC2 = 36

export interface DebugState {
	enabled: boolean
	/** Tiles travelled along the active path. Clamped to `[0, totalLength]` by the caller. */
	markerDistance: number
	/** Index into `MapDef.paths`. `[` and `]` cycle it for the multi-lane maps from night 10. */
	activePathIndex: number
	/** The tile under the pointer, or null while the pointer is off the board. */
	hoverTile: Vec2 | null
}

export interface DebugController {
	readonly state: DebugState
	/** Advances the marker by however much wall-clock time passed since the last call. Call once per drawn frame. */
	update(): void
	destroy(): void
}

/** True while a text field has focus, so `` ` `` toggling the overlay does not eat a keystroke. */
function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) {
		return false
	}
	return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

const FORWARD_KEYS = new Set(['ArrowRight', 'ArrowDown'])
const BACKWARD_KEYS = new Set(['ArrowLeft', 'ArrowUp'])

export function createDebugController(canvas: HTMLCanvasElement, getMap: () => MapDef): DebugController {
	const state: DebugState = {
		enabled: false,
		markerDistance: 0,
		activePathIndex: 0,
		hoverTile: null,
	}

	const held = new Set<string>()
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
		}
	}

	function onKeyUp(event: KeyboardEvent): void {
		held.delete(event.key)
		if (held.size === 0) {
			heldSinceMs = null
		}
	}

	function onPointerMove(event: PointerEvent): void {
		const map = getMap()
		const tilePx = LOGICAL_WIDTH / map.widthTiles

		const rect = canvas.getBoundingClientRect()
		const scaleX = LOGICAL_WIDTH / rect.width
		const scaleY = LOGICAL_HEIGHT / rect.height
		const logicalX = (event.clientX - rect.left) * scaleX
		const logicalY = (event.clientY - rect.top) * scaleY

		const tileX = Math.floor(logicalX / tilePx)
		const tileY = Math.floor(logicalY / tilePx)

		if (tileX < 0 || tileX >= map.widthTiles || tileY < 0 || tileY >= map.heightTiles) {
			state.hoverTile = null
			return
		}
		state.hoverTile = { x: tileX, y: tileY }
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
		window.removeEventListener('keydown', onKeyDown)
		window.removeEventListener('keyup', onKeyUp)
		canvas.removeEventListener('pointermove', onPointerMove)
		canvas.removeEventListener('pointerleave', onPointerLeave)
	}

	return { state, update, destroy }
}
