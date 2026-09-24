/**
 * Hands on the game: the pointer over the board, the hotkeys, and the ghost that follows the cursor.
 *
 * It replaces `dev/placement.ts`, which stood in for all of this from step 6 to step 8.
 *
 * **Plain TypeScript, no `vue` import.** It is DOM plumbing rather than markup, and it owns its own
 * listeners and its own `destroy()` -- the shape `createDebugController` has. A component owning
 * `window` listeners leaks them on a route change, and an `onBeforeUnmount` in five components is
 * five chances to forget one.
 *
 * **Everything here enqueues a command and never writes to `world`**
 * (analytic-docs/ARCHITECTURE.md section 3). The selection is UI state and is written directly.
 */

import { effectiveDefOf, TOWERS } from '@/core/content/index.ts'
import { isAttack, isCleanse, isConeAttack, isReveal, isSuppress } from '@/core/content/behaviours.ts'
import { nearestPath, samplePath } from '@/core/path.ts'
import { projectedNoisePerSecond } from '@/core/systems/noise.ts'
import { canPlaceTower, towerAt, towerById } from '@/core/systems/placement.ts'
import { enemyById, enemyPosition, queryEnemiesInRange } from '@/core/systems/spatial.ts'
import {
	gridToWaypoint,
	isOnBoard,
	LOGICAL_WIDTH,
	pickCrumb,
	toGridPoint,
	toTile,
	type OverlayReach,
	type OverlayView,
} from '@/render/index.ts'
import { isTypingTarget } from '@/ui/keyboard.ts'
import type { CommandQueue } from '@/core/commands.ts'
import type { TowerDef } from '@/core/content/index.ts'
import type { EntityId, Tower, Vec2, World } from '@/core/types.ts'
import type { Speed } from '@/loop.ts'
import type { Selection } from '@/ui/selection.ts'

/**
 * How far outside a pile's drawn edge still counts as clicking it, in logical pixels.
 *
 * A speck is 0.28 of a 48px tile, so its drawn radius is under 7px and an exact hit test makes the
 * most-repeated interaction in the game feel like a precision task. Named, because step 20's
 * Buy-a-Broom widens exactly this.
 */
const CRUMB_CLICK_FORGIVENESS_PX = 8

/**
 * The pointer's own half of the answer, so the tile is readable without tracking the tint.
 *
 * `copy` is the plus-sign cursor every canvas editor uses for "this drops here", and `not-allowed` is
 * the one browsers already give a refused drop -- both borrowed rather than invented, which is the
 * point. `pointer` means the click will pick something up rather than build.
 */
const CURSOR_PLACEABLE = 'copy'
const CURSOR_REFUSED = 'not-allowed'
const CURSOR_SELECTABLE = 'pointer'
/** The stylesheet's own cursor, restored by writing the empty string back. */
const CURSOR_DEFAULT = ''

/** How long a refusal stays on screen. Long enough to read eight words, short enough not to be nagged. */
const TOAST_LIFETIME_MS = 2600
/** How often expired toasts are swept. Only runs while there is something to sweep. */
const TOAST_SWEEP_MS = 200

const SPEED_MIN: Speed = 1
const SPEED_MAX: Speed = 3

export interface Toast {
	id: number
	messageKey: string
}

/**
 * The three things the board cannot do for itself.
 *
 * Pause and speed live in `loop.ts`, which `GameView.vue` owns, and the toast list has to reach a Vue
 * ref without this file importing `vue`. All three are handed in as functions rather than reached for.
 */
export interface InteractionHost {
	/** `pause()` / `resume()`, never `setSpeed(0)`: two ways to stop time means two lit buttons. */
	togglePause(): void
	/** Selects a speed, resumes if paused, and enqueues the `SetSpeed` the command log wants. */
	setSpeed(speed: Speed): void
	/** The speed the loop is running at, so `,` and `.` can step from it. */
	speed(): Speed
	/** Called whenever the toast list changes. Never on a frame where it did not. */
	onToasts(toasts: Toast[]): void
}

export interface Interaction {
	/** What `drawFrame` should draw over the board this frame. Null before there is a world. */
	overlay(): OverlayView | null
	destroy(): void
}

/**
 * Two tiles apart in tile space, as an angle, or null when they are the same point.
 *
 * `atan2(0, 0)` is 0 -- a cone that always points right -- so the zero-length case is turned away
 * here rather than being drawn. It cannot happen with an `off_path` tower on a one-lane map and it
 * will happen the first time something is `path_only` (step 9C).
 */
const FACING_EPSILON = 1e-6

function angleBetween(from: Vec2, to: { x: number; y: number }): number | null {
	const dx = to.x - from.x
	const dy = to.y - from.y
	return Math.hypot(dx, dy) < FACING_EPSILON ? null : Math.atan2(dy, dx)
}

/**
 * Where a cone tower is pointing.
 *
 * A placed tower aims at whatever `targetingSystem` chose this tick, which is the same answer
 * `fireCone` will use. With no target -- and for the ghost, which has none by definition -- it aims
 * at the nearest point on the nearest lane, so the wedge shows the traffic it is being bought to
 * cover. **There is no `facingAngle` on the world**: it would need a system to write it, would go
 * into every save and every replay, and would be a second answer to a question the targeting system
 * already answers every tick (step 9C, decision 3).
 */
function facingFor(world: World, tile: Vec2, tower: Tower | null): number {
	const targetId = tower === null ? null : tower.targetEnemyId
	const target = targetId === null ? null : enemyById(world, targetId)
	const at = target === null ? null : enemyPosition(world, target)
	const toTarget = at === null ? null : angleBetween(tile, at)
	if (toTarget !== null) {
		return toTarget
	}

	const nearest = nearestPath(world.map.paths, tile)
	const path = nearest === null ? undefined : world.map.paths.find(candidate => candidate.id === nearest.pathId)
	if (nearest === null || path === undefined) {
		return 0
	}

	// A tower standing *on* the lane it is nearest to has no vector to it. The lane's own heading
	// there is the honest answer: it sprays down the track it is sitting on.
	const point = samplePath(path, nearest.distance)
	return angleBetween(tile, point) ?? point.angle
}

/**
 * The shape of a def's reach, or null for one that has none -- both economy towers.
 *
 * Resolved here, including the facing, because the caller resolving it is what keeps `drawRangeCone`
 * a pure draw (step 9C, decision 4). `tower` is null for the ghost.
 *
 * A `reveal` radius is a reach like any other: it is the whole of what a Nightlight does, and a
 * 100-crumb tower whose only stat is a radius, aimed with no radius drawn, is the placement decision
 * made blind. It comes last because a tower that both fires and lights -- step 17's Candle, once it
 * has an aura -- should show what it covers, and the light pool on the board says where it reaches.
 *
 * A scrubber shows **the larger of its range and its cleanse radius**, as one circle (step 15B). A
 * tier-3 Vinegar Spray cleans twice as far as it shoots, and a ghost drawing only the smaller circle
 * lies about the headline feature; two circles would need a second overlay shape for one tower.
 *
 * A `suppress` radius is folded into both circles the same way (step 16B). The Bay Leaf has nothing
 * else to show, and a tower that someday both shoots and suppresses should show the larger reach.
 */
function reachOf(def: TowerDef, world: World, tile: Vec2, tower: Tower | null): OverlayReach | null {
	const leaf = def.behaviours.find(isSuppress)
	const shot = def.behaviours.find(isAttack)
	if (shot !== undefined) {
		const scrub = def.behaviours.find(isCleanse)
		return {
			kind: 'circle',
			radiusTiles: Math.max(shot.rangeTiles, scrub?.radiusTiles ?? 0, leaf?.radiusTiles ?? 0),
		}
	}

	const spray = def.behaviours.find(isConeAttack)
	if (spray === undefined) {
		const lamp = def.behaviours.find(isReveal)
		const radiusTiles = Math.max(lamp?.radiusTiles ?? 0, leaf?.radiusTiles ?? 0)
		return radiusTiles === 0 ? null : { kind: 'circle', radiusTiles }
	}

	return {
		kind: 'cone',
		radiusTiles: spray.rangeTiles,
		halfAngleDeg: spray.coneHalfAngleDeg,
		facingRad: facingFor(world, tile, tower),
	}
}

/** How close the pointer has to be to an enemy's centre to hover it. Half a tile: its own glyph. */
const HOVER_PICK_RADIUS_TILES = 0.5

/**
 * The enemy under `point`, keeping `current` for as long as the pointer is still on it.
 *
 * Called on pointermove and nowhere else -- the latch in `Selection.hoveredEnemyId` depends on it.
 * Burrowed enemies are picked like any other: hovering the mound is how the player learns why the
 * towers ignore it.
 */
function pickHoveredEnemy(world: World, point: Vec2 | null, current: EntityId | null): EntityId | null {
	if (point === null) {
		return null
	}

	const held = current === null ? null : enemyById(world, current)
	const heldAt = held === null ? null : enemyPosition(world, held)
	if (heldAt !== null && Math.hypot(heldAt.x - point.x, heldAt.y - point.y) <= HOVER_PICK_RADIUS_TILES) {
		return current
	}

	let nearest: EntityId | null = null
	let nearestSquared = Infinity
	for (const enemy of queryEnemiesInRange(world, point, HOVER_PICK_RADIUS_TILES)) {
		const at = enemyPosition(world, enemy)
		if (at === null) {
			continue
		}
		const squared = (at.x - point.x) ** 2 + (at.y - point.y) ** 2
		if (squared < nearestSquared) {
			nearest = enemy.id
			nearestSquared = squared
		}
	}
	return nearest
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

function clampSpeed(n: number): Speed {
	return Math.min(Math.max(n, SPEED_MIN), SPEED_MAX) as Speed
}

export function createInteraction(
	canvas: HTMLCanvasElement,
	queue: CommandQueue,
	selection: Selection,
	getWorld: () => World | null,
	host: InteractionHost,
): Interaction {
	let lastCursor = CURSOR_DEFAULT
	let nextToastId = 1
	const live: { id: number; messageKey: string; expiresAt: number }[] = []
	let sweepHandle: number | null = null

	function applyCursor(cursor: string): void {
		// Only when it changed: this runs once a frame, and a write every frame touches the DOM 60
		// times a second to say the same thing.
		if (lastCursor === cursor) {
			return
		}
		lastCursor = cursor
		canvas.style.cursor = cursor
	}

	function publishToasts(): void {
		host.onToasts(live.map(entry => ({ id: entry.id, messageKey: entry.messageKey })))
	}

	function sweep(): void {
		const now = performance.now()
		const before = live.length
		for (let i = live.length - 1; i >= 0; i--) {
			const entry = live[i]
			if (entry !== undefined && entry.expiresAt <= now) {
				live.splice(i, 1)
			}
		}
		if (live.length !== before) {
			publishToasts()
		}
		if (live.length === 0 && sweepHandle !== null) {
			window.clearInterval(sweepHandle)
			sweepHandle = null
		}
	}

	/**
	 * Says why, once. **Consecutive identical reasons are folded into the one toast** and its clock is
	 * restarted: dragging a ghost along the track and clicking fires `onTrack` on every click, and a
	 * stack of nine identical lines is noise rather than an explanation.
	 */
	function toast(messageKey: string): void {
		const newest = live[live.length - 1]
		if (newest !== undefined && newest.messageKey === messageKey) {
			newest.expiresAt = performance.now() + TOAST_LIFETIME_MS
			return
		}

		live.push({ id: nextToastId++, messageKey, expiresAt: performance.now() + TOAST_LIFETIME_MS })
		publishToasts()
		if (sweepHandle === null) {
			sweepHandle = window.setInterval(sweep, TOAST_SWEEP_MS)
		}
	}

	function armedDef(): TowerDef | null {
		const defId = selection.selectedDefId.value
		return defId === null ? null : (TOWERS.find(def => def.id === defId) ?? null)
	}

	function tileFor(grid: Vec2, world: World): Vec2 | null {
		const map = world.map
		const tile = toTile(grid)
		return isOnBoard(tile, map.widthTiles, map.heightTiles) ? tile : null
	}

	function crumbUnder(world: World): boolean {
		const point = selection.hoverPoint
		return point !== null && pickCrumb(world, point, tilePxFor(world), CRUMB_CLICK_FORGIVENESS_PX) !== null
	}

	/**
	 * One `canPlaceTower` answer into `tone` and `reason`, and the cursor off the same answer. The
	 * tint, the pointer and the toast therefore cannot disagree with each other or with the executor.
	 *
	 * Called on every pointermove **and** once per frame from `overlay()`. Per-move alone leaves a
	 * still pointer showing green over a tile another click just occupied, or over an unaffordable
	 * tower that has since become affordable -- the world moves without the mouse.
	 */
	function refreshHover(): void {
		const world = getWorld()
		const tile = selection.hoverTile
		const def = armedDef()

		if (world === null || tile === null || def === null) {
			selection.tone = null
			selection.reason = null
		} else {
			const result = canPlaceTower(world, def, tile)
			selection.tone = result.ok ? 'valid' : 'invalid'
			selection.reason = result.ok ? null : result.reason
		}

		// Cursor priority is click priority (decision 6): while a def is armed the click builds, so a
		// crumb under an armed ghost must not offer to be picked up.
		if (world === null || tile === null) {
			applyCursor(CURSOR_DEFAULT)
			return
		}
		if (def !== null) {
			applyCursor(selection.tone === 'valid' ? CURSOR_PLACEABLE : CURSOR_REFUSED)
			return
		}
		applyCursor(crumbUnder(world) || towerAt(world, tile) !== null ? CURSOR_SELECTABLE : CURSOR_DEFAULT)
	}

	function onPointerMove(event: PointerEvent): void {
		const world = getWorld()
		if (world === null) {
			selection.hoverTile = null
			selection.hoverPoint = null
			selection.hoveredEnemyId = null
			refreshHover()
			return
		}

		// Through `toGridPoint`, never `event.offsetX`: the canvas is CSS-scaled to the window, so
		// `offsetX / tilePx` is wrong by the scale factor -- invisible at the centre of the board and
		// a full tile at the corners. See `render/tileCoords.ts`.
		const grid = toGridPoint(canvas, event, world.map.widthTiles)
		const tile = tileFor(grid, world)
		selection.hoverTile = tile
		// Waypoint space, the space crumbs are in. `toGridPoint` puts integers on tile corners and
		// `Crumb.position` puts them on tile centres; the `- 0.5` is the whole of the difference, and
		// skipping it makes every pile feel like it has to be clicked up and to the left.
		selection.hoverPoint = tile === null ? null : gridToWaypoint(grid)
		selection.hoveredEnemyId = pickHoveredEnemy(world, selection.hoverPoint, selection.hoveredEnemyId)
		refreshHover()
	}

	function onPointerLeave(): void {
		selection.hoverTile = null
		selection.hoverPoint = null
		selection.hoveredEnemyId = null
		refreshHover()
	}

	/**
	 * **A plain click places and disarms; shift-click places and stays armed** (decision 5). Sticky by
	 * default buys a second tower every time the player clicks the board to deselect, and
	 * place-and-exit is what the genre trained them to expect.
	 *
	 * The order is: armed def builds, else a crumb is collected, else a tower is selected, else the
	 * selection is cleared. The armed def goes first because a green ghost that quietly collects a
	 * crumb instead of building reads as the placement being broken.
	 */
	function onPointerDown(event: PointerEvent): void {
		const world = getWorld()
		if (world === null || event.button !== 0) {
			return
		}

		const grid = toGridPoint(canvas, event, world.map.widthTiles)
		const tile = tileFor(grid, world)
		if (tile === null) {
			return
		}

		const def = armedDef()
		if (def !== null) {
			const result = canPlaceTower(world, def, tile)
			if (!result.ok) {
				// Refused clicks say why and **do not enqueue**. The executor re-validates anyway, so a
				// world that moved between the click and the tick boundary is a silent no-op -- which
				// is how every other command already behaves.
				toast(`hud.reject.${result.reason}`)
				return
			}

			queue.enqueue({ kind: 'PlaceTower', defId: def.id, tile: { x: tile.x, y: tile.y } })
			if (!event.shiftKey) {
				selection.selectedDefId.value = null
			}
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

		// Clicking empty floor with nothing armed closes the inspector. It is the only way out that is
		// not a key.
		const existing = towerAt(world, tile)
		selection.selectedTowerId.value = existing === null ? null : existing.id
	}

	/** Without the `preventDefault` the browser menu opens over the board and the cancel reads as nothing. */
	function onContextMenu(event: MouseEvent): void {
		event.preventDefault()
		selection.selectedDefId.value = null
		refreshHover()
	}

	function onKeyDown(event: KeyboardEvent): void {
		// The editor route has text fields, and this is the guard both tools share.
		if (isTypingTarget(event.target)) {
			return
		}

		if (event.code === 'Space') {
			event.preventDefault()
			host.togglePause()
			return
		}
		if (event.key === ',' || event.key === '.') {
			host.setSpeed(clampSpeed(host.speed() + (event.key === '.' ? 1 : -1)))
			return
		}
		if (event.key === 'n') {
			// A command, never a call into the wave system: player input enters the simulation at a
			// tick boundary and nowhere else (ARCHITECTURE.md section 3).
			queue.enqueue({ kind: 'CallWaveEarly' })
			return
		}
		if (event.key === 'Escape') {
			selection.selectedDefId.value = null
			selection.selectedTowerId.value = null
			refreshHover()
			return
		}
		if (event.key === 'x') {
			const towerId = selection.selectedTowerId.value
			if (towerId !== null) {
				queue.enqueue({ kind: 'SellTower', towerId })
				selection.selectedTowerId.value = null
			}
			return
		}
		// Beside `x`, and **keeps the selection** where selling drops it: the tower is still standing
		// and there may be two more tiers to buy. `upgradeTower` refuses silently at the top tier and
		// on an empty wallet, which is why this enqueues without asking first -- the same contract
		// every other command naming an entity has.
		if (event.key === 'u') {
			const towerId = selection.selectedTowerId.value
			if (towerId !== null) {
				queue.enqueue({ kind: 'UpgradeTower', towerId })
			}
			return
		}

		// 1-9 into the first nine of the roster and **0 into the tenth**, in `TOWERS` order -- the order
		// the shop panel renders and the number it prints on each button. The same key again disarms, so
		// there is a way out that is not Escape.
		//
		// `0` is the tenth rather than nothing because the badge on that button has to name a key that
		// works: `Number('0') - 1` is -1, so a roster of ten shipped a button reading `10` and no way to
		// press it (step 11C, decision 10). An eleventh tower gets no key at all until step 20 says what
		// the shop looks like at that size, and `TowerShop.vue` prints no badge on one.
		const typed = Number(event.key)
		const index = !Number.isInteger(typed) ? -1 : typed === 0 ? 9 : typed - 1
		if (index < 0 || index >= TOWERS.length) {
			return
		}
		const def = TOWERS[index]
		if (def === undefined) {
			return
		}
		selection.selectedDefId.value = selection.selectedDefId.value === def.id ? null : def.id
		selection.selectedTowerId.value = null
		refreshHover()
	}

	function overlay(): OverlayView | null {
		const world = getWorld()
		if (world === null) {
			return null
		}
		refreshHover()

		const towerId = selection.selectedTowerId.value
		const tower = towerId === null ? null : towerById(world, towerId)
		const def = armedDef()
		const tile = selection.hoverTile
		const tone = selection.tone

		return {
			selected:
				tower === null
					? null
					: { tile: tower.tile, reach: reachOf(effectiveDefOf(tower), world, tower.tile, tower) },
			ghost:
				def === null || tile === null || tone === null
					? null
					: {
							glyph: def.glyph,
							tile,
							reach: reachOf(def, world, tile, null),
							tone,
							// Resolved here like the reach and the tone, so `render/` never looks a def up
							// and never learns what a cooldown is (step 13B, decision on the ghost).
							noisePerSecond: projectedNoisePerSecond(def),
						},
		}
	}

	window.addEventListener('keydown', onKeyDown)
	canvas.addEventListener('pointermove', onPointerMove)
	canvas.addEventListener('pointerleave', onPointerLeave)
	canvas.addEventListener('pointerdown', onPointerDown)
	canvas.addEventListener('contextmenu', onContextMenu)

	function destroy(): void {
		window.removeEventListener('keydown', onKeyDown)
		canvas.removeEventListener('pointermove', onPointerMove)
		canvas.removeEventListener('pointerleave', onPointerLeave)
		canvas.removeEventListener('pointerdown', onPointerDown)
		canvas.removeEventListener('contextmenu', onContextMenu)
		if (sweepHandle !== null) {
			window.clearInterval(sweepHandle)
			sweepHandle = null
		}
		live.length = 0
		// The canvas outlives this controller on a route change, so the cursor has to be handed back.
		canvas.style.cursor = CURSOR_DEFAULT
		lastCursor = CURSOR_DEFAULT
	}

	return { overlay, destroy }
}
