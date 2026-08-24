/**
 * Placing and selling towers with the mouse. Scaffolding, and step 8 deletes it.
 *
 * It lives in `dev/` for the same reason `dev/nightHud.ts` does: the real shop panel, tower
 * inspector and sell button are step 8's, in Vue, over this canvas. `render/` ships, and none of the
 * selection state below belongs in something that ships (step 6C, decision 2).
 *
 * **It enqueues commands and never writes to `world`** (analytic-docs/ARCHITECTURE.md section 3). It
 * owns its own listeners and its own `destroy()`, the way `createDebugController` does, and the two
 * sets of listeners are live at the same time -- so nothing here touches the keys that one owns.
 */

import { TOWERS } from '@/core/content/index.ts'
import { canPlaceTower, towerAt, towerById } from '@/core/systems/placement.ts'
import { isAttack } from '@/core/content/behaviours.ts'
import { isTypingTarget } from '@/dev/debug/state.ts'
import { gridToWaypoint, isOnBoard, toGridPoint, toTile } from '@/dev/tileCoords.ts'
import {
	blitGlyph,
	drawPlacementTile,
	drawRangeCircle,
	LOGICAL_WIDTH,
	pickCrumb,
	towerGlyphSize,
} from '@/render/index.ts'
import type { CommandQueue } from '@/core/commands.ts'
import type { TowerDef } from '@/core/content/index.ts'
import type { DefId, EntityId, Vec2, World } from '@/core/types.ts'

/** How solid the tower-to-be is drawn under the cursor. Solid enough to identify, faint enough to read as not-yet. */
const GHOST_ALPHA = 0.45

/**
 * The pointer's own half of the answer, so the tile is readable without tracking the tint.
 *
 * `copy` is the plus-sign cursor every canvas editor uses for "this drops here", and `not-allowed`
 * is the one browsers already give a refused drop -- both are borrowed rather than invented, which
 * is the point. `pointer` wins over either whenever there is a tower to select underneath, because
 * that is what the click will actually do.
 */
const CURSOR_PLACEABLE = 'copy'
const CURSOR_REFUSED = 'not-allowed'
const CURSOR_SELECTABLE = 'pointer'
/** The stylesheet's own cursor, restored by writing the empty string back. */
const CURSOR_DEFAULT = ''

/**
 * How far outside a pile's drawn edge still counts as clicking it, in logical pixels.
 *
 * A speck is 0.28 of a 48px tile, so its drawn radius is under 7px and an exact hit test makes the
 * most-repeated interaction in the game feel like a precision task. Named, because step 20's
 * Buy-a-Broom widens exactly this.
 */
const CRUMB_CLICK_FORGIVENESS_PX = 8

export interface PlacementState {
	/** The tower type the number keys selected, or null. Survives a placement, so four in a row is four clicks. */
	selectedDefId: DefId | null
	/** A tower already on the board, selected by clicking it. Null after it is sold or the night restarts. */
	selectedTowerId: EntityId | null
	/** The tile under the pointer, or null while the pointer is off the board. */
	hoverTile: Vec2 | null
	/**
	 * The same pointer position, fractional and in waypoint space, or null.
	 *
	 * Kept beside the tile rather than derived from it: a crumb sits anywhere on a tile, so the hit
	 * test needs the sub-tile position the floored tile has already thrown away.
	 */
	hoverPoint: Vec2 | null
}

export interface PlacementController {
	readonly state: PlacementState
	/** Both selections. `restart()` calls it: a tower id from the night that just ended points at nothing. */
	clearSelection(): void
	destroy(): void
}

/** The attack range of a def, or null for one with no attack behaviour -- both economy towers. */
function rangeOf(def: TowerDef): number | null {
	const shot = def.behaviours.find(isAttack)
	return shot === undefined ? null : shot.rangeTiles
}

function defFor(defId: DefId): TowerDef | null {
	return TOWERS.find(def => def.id === defId) ?? null
}

/**
 * The same derivation `Renderer.setMap` does, from the world's own map.
 *
 * Derived rather than passed in because this controller is built before the first frame and holds no
 * renderer; the map is the thing both of them read, so the two cannot disagree.
 */
function tilePxFor(world: World): number {
	return LOGICAL_WIDTH / world.map.widthTiles
}

export function createPlacementController(
	canvas: HTMLCanvasElement,
	queue: CommandQueue,
	getWorld: () => World | null,
): PlacementController {
	const state: PlacementState = {
		selectedDefId: null,
		selectedTowerId: null,
		hoverTile: null,
		hoverPoint: null,
	}

	function clearSelection(): void {
		state.selectedDefId = null
		state.selectedTowerId = null
	}

	/**
	 * Through `toGridPoint`, never `event.offsetX`: the canvas is CSS-scaled to the window, so
	 * `offsetX / tilePx` is wrong by the scale factor -- see `dev/tileCoords.ts`.
	 */
	function gridUnder(event: PointerEvent, world: World): Vec2 {
		return toGridPoint(canvas, event, world.map.widthTiles)
	}

	function tileFor(grid: Vec2, world: World): Vec2 | null {
		const map = world.map
		const tile = toTile(grid)
		return isOnBoard(tile, map.widthTiles, map.heightTiles) ? tile : null
	}

	function onPointerMove(event: PointerEvent): void {
		const world = getWorld()
		if (world === null) {
			state.hoverTile = null
			state.hoverPoint = null
			return
		}
		const grid = gridUnder(event, world)
		state.hoverTile = tileFor(grid, world)
		// Waypoint space, the space crumbs are in. `toGridPoint` puts integers on tile corners and
		// `Crumb.position` puts them on tile centres; the `- 0.5` is the whole of the difference, and
		// skipping it makes every pile feel like it has to be clicked up and to the left.
		state.hoverPoint = state.hoverTile === null ? null : gridToWaypoint(grid)
	}

	function onPointerLeave(): void {
		state.hoverTile = null
		state.hoverPoint = null
	}

	/**
	 * **One click, one rule, and no modifier key.** A crumb under the pointer is collected; else a
	 * tower on the tile is selected; else a selected tower type builds there. Nothing here reads
	 * shift, alt or the right button, and the next session should not invent one -- step 8's HUD
	 * makes the shop panel the mode switch.
	 *
	 * The crumb goes first because enemies die on the track and `off_path` towers stand beside it, so
	 * a pile and a buildable tile almost never coincide -- and a click that landed inside a pile's
	 * forgiving radius was aimed at the pile (step 7C, decision 5).
	 */
	function onPointerDown(event: PointerEvent): void {
		const world = getWorld()
		if (world === null || event.button !== 0) {
			return
		}

		const grid = gridUnder(event, world)
		const tile = tileFor(grid, world)
		if (tile === null) {
			return
		}

		const crumb = pickCrumb(world, gridToWaypoint(grid), tilePxFor(world), CRUMB_CLICK_FORGIVENESS_PX)
		if (crumb !== null) {
			// A command, never a write: the pile is credited at the next tick boundary, which is also
			// why a pile already delivered between the click and the tick is a silent no-op rather
			// than a double payout (ARCHITECTURE.md section 3).
			queue.enqueue({ kind: 'CollectCrumb', crumbId: crumb.id })
			return
		}

		const existing = towerAt(world, tile)
		if (existing !== null) {
			// Selecting a tower unequips the build cursor. Inspecting and building are two modes,
			// and staying armed leaves a ghost trailing the pointer over a board you are reading.
			state.selectedTowerId = existing.id
			state.selectedDefId = null
			return
		}

		state.selectedTowerId = null
		if (state.selectedDefId === null) {
			return
		}
		// Validity is not re-checked here. `canPlaceTower` runs inside the command executor at the
		// tick boundary, and asking twice is how the tint and the command start disagreeing.
		queue.enqueue({ kind: 'PlaceTower', defId: state.selectedDefId, tile: { x: tile.x, y: tile.y } })
	}

	function onKeyDown(event: KeyboardEvent): void {
		// The editor route has text inputs, and this is the guard both tools share.
		if (isTypingTarget(event.target)) {
			return
		}

		if (event.key === 'Escape') {
			clearSelection()
			return
		}

		if (event.key === 'x') {
			if (state.selectedTowerId !== null) {
				queue.enqueue({ kind: 'SellTower', towerId: state.selectedTowerId })
				state.selectedTowerId = null
			}
			return
		}

		// 1-9 into the roster, in `TOWERS` order, which is the order step 8's shop panel inherits.
		// The same key again deselects, so there is a way out that is not the Escape key.
		const index = Number(event.key) - 1
		if (!Number.isInteger(index) || index < 0 || index >= TOWERS.length) {
			return
		}
		const def = TOWERS[index]
		if (def === undefined) {
			return
		}
		state.selectedDefId = state.selectedDefId === def.id ? null : def.id
		state.selectedTowerId = null
	}

	window.addEventListener('keydown', onKeyDown)
	canvas.addEventListener('pointermove', onPointerMove)
	canvas.addEventListener('pointerleave', onPointerLeave)
	canvas.addEventListener('pointerdown', onPointerDown)

	function destroy(): void {
		window.removeEventListener('keydown', onKeyDown)
		canvas.removeEventListener('pointermove', onPointerMove)
		canvas.removeEventListener('pointerleave', onPointerLeave)
		canvas.removeEventListener('pointerdown', onPointerDown)
		// The canvas outlives this controller on a route change, so the cursor has to be handed
		// back. `lastCursor` goes with it, or the next mount skips its first write and starts wrong.
		canvas.style.cursor = CURSOR_DEFAULT
		lastCursor = CURSOR_DEFAULT
	}

	return { state, clearSelection, destroy }
}

/**
 * What the canvas is currently showing, so a frame that changes nothing does not touch the DOM.
 *
 * Module-local rather than per-controller because the cursor belongs to the one canvas this route
 * has, and `drawPlacementOverlay` is a free function -- the same shape `effects.ts` uses for its
 * module-local animation state, and for the same reason.
 */
let lastCursor = CURSOR_DEFAULT

function applyCursor(canvas: HTMLCanvasElement, cursor: string): void {
	if (lastCursor === cursor) {
		return
	}
	lastCursor = cursor
	canvas.style.cursor = cursor
}

/**
 * Drawn straight onto the live context after `drawFrame`, the way `drawDebugOverlay` and
 * `drawNightHud` are.
 *
 * **This is the one place dev selection state and `render/` meet.** The primitives it calls know
 * nothing about selection and the tint comes from `canPlaceTower` -- the same function the command
 * executor asks, so the colour under the cursor and the answer after the click cannot drift.
 */
export function drawPlacementOverlay(
	ctx: CanvasRenderingContext2D,
	world: World,
	state: PlacementState,
	tilePx: number,
	dpr: number,
): void {
	const selected = state.selectedTowerId === null ? null : towerById(world, state.selectedTowerId)
	if (selected !== null) {
		const selectedDef = defFor(selected.defId)
		const range = selectedDef === null ? null : rangeOf(selectedDef)
		if (range === null) {
			// An economy tower has no reach to show, so the square is the whole of the selection.
			drawPlacementTile(ctx, tilePx, selected.tile, 'neutral')
		} else {
			drawRangeCircle(ctx, tilePx, selected.tile, range, 'neutral')
		}
	}

	const def = state.selectedDefId === null ? null : defFor(state.selectedDefId)
	const hover = state.hoverTile

	// A pile under the pointer wins over everything, because `onPointerDown` collects it whatever is
	// armed. Same call, same forgiveness: the cursor and the click cannot disagree about what is
	// clickable, which is the only way the forgiving radius can be tuned by feel.
	if (state.hoverPoint !== null && pickCrumb(world, state.hoverPoint, tilePx, CRUMB_CLICK_FORGIVENESS_PX) !== null) {
		applyCursor(ctx.canvas, CURSOR_SELECTABLE)
		return
	}

	// A tower under the pointer wins over an armed def, because `onPointerDown` selects it whatever
	// is armed. Tinting the tile red for `occupied` while the click quietly does something useful is
	// the one way these two can disagree, so the tower case returns before the tint is computed.
	if (hover !== null && towerAt(world, hover) !== null) {
		applyCursor(ctx.canvas, CURSOR_SELECTABLE)
		return
	}

	if (def === null || hover === null) {
		applyCursor(ctx.canvas, CURSOR_DEFAULT)
		return
	}

	const tone = canPlaceTower(world, def, hover).ok ? 'valid' : 'invalid'
	// The same `canPlaceTower` answer drives the tint and the pointer: one call, so the two halves
	// of the feedback cannot drift from each other or from the command.
	applyCursor(ctx.canvas, tone === 'valid' ? CURSOR_PLACEABLE : CURSOR_REFUSED)

	const range = rangeOf(def)
	if (range !== null) {
		drawRangeCircle(ctx, tilePx, hover, range, tone)
	}
	drawPlacementTile(ctx, tilePx, hover, tone)

	ctx.globalAlpha = GHOST_ALPHA
	blitGlyph(ctx, dpr, def.glyph, towerGlyphSize(tilePx), (hover.x + 0.5) * tilePx, (hover.y + 0.5) * tilePx)
	ctx.globalAlpha = 1
}
