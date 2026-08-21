<template>
	<main class="editor">
		<div class="stage">
			<canvas
				ref="board"
				class="board"
				:width="LOGICAL_WIDTH"
				:height="LOGICAL_HEIGHT"
				@pointerdown="onPointerDown"
				@pointermove="onPointerMove"
				@pointerup="onPointerUp"
				@pointercancel="onPointerCancel"
				@pointerleave="onPointerLeave"
				@contextmenu.prevent
			/>
		</div>

		<aside class="panels">
			<ToolPanel
				v-model:tool="tool"
				v-model:brushChar="brushChar"
				v-model:brushSize="brushSize"
				v-model:snapToTile="snapToTile"
				v-model:showGrid="showGrid"
				:canUndo="snap.canUndo"
				:canRedo="snap.canRedo"
				@undo="onUndo"
				@redo="onRedo"
			/>
			<PathPanel
				v-model:activePathIndex="activePathIndex"
				:paths="snap.paths"
				@addPath="onAddPath"
				@deletePath="onDeletePath"
			/>
			<DecorPanel
				v-model:decorGlyph="decorGlyph"
				:fridgeGlyph="fridgeGlyph"
				@setFridgeGlyph="onSetFridgeGlyph"
			/>
			<ValidationPanel
				:problems="snap.problems"
				:convergence="convergence"
				:buildablePercent="snap.buildablePercent"
				@focus="onFocusProblem"
			/>
			<IoPanel
				:mapId="mapId"
				:registeredIds="registeredIds"
				:status="status"
				:statusIsError="statusIsError"
				@newMap="onNewMap"
				@renameMap="onRenameMap"
				@importRegistered="onImportRegistered"
				@importJson="onImportJson"
				@export="onExport"
				@preview="onPreview"
			/>
		</aside>
	</main>
</template>

<script setup lang="ts">
	import { onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef } from 'vue'
	import { useRouter } from 'vue-router'
	import { MAP_SOURCES } from '@/core/content/maps/index.ts'
	import { createRenderer, LOGICAL_HEIGHT, LOGICAL_WIDTH, type Renderer } from '@/render/index.ts'
	import { isTypingTarget } from '@/dev/debug/state.ts'
	import { gridToWaypoint, isOnBoard, toGridPoint, toTile } from '@/dev/tileCoords.ts'
	import { createDocument, type EditorDoc, type EditorSnapshot } from '@/dev/editor/document.ts'
	import { hitSegment, hitWaypoint } from '@/dev/editor/hitTest.ts'
	import { drawEditorOverlay, type OverlayPath } from '@/dev/editor/overlay.ts'
	import { setPreviewMap } from '@/dev/editor/preview.ts'
	import { emptyMap, fromJson, toJson } from '@/dev/editor/serialize.ts'
	import { convergenceOf, type Convergence, type Problem } from '@/dev/editor/validate.ts'
	import {
		addPath,
		appendWaypoint,
		brushFootprint,
		deletePath,
		deleteWaypoint,
		ERASE_CHAR,
		insertWaypoint,
		isTooCloseToAppend,
		moveFridge,
		moveWaypoint,
		nextPathId,
		paintTiles,
		placeDecor,
		removeDecor,
		tilesBetween,
		type BrushChar,
	} from '@/dev/editor/edits.ts'
	import { DECOR_PALETTE, type EditorTool } from '@/dev/editor/tools.ts'
	import DecorPanel from '@/dev/editor/panels/DecorPanel.vue'
	import IoPanel from '@/dev/editor/panels/IoPanel.vue'
	import PathPanel from '@/dev/editor/panels/PathPanel.vue'
	import ToolPanel from '@/dev/editor/panels/ToolPanel.vue'
	import ValidationPanel from '@/dev/editor/panels/ValidationPanel.vue'
	import type { MapSource } from '@/core/content/schema.ts'
	import type { Vec2 } from '@/core/types.ts'

	/**
	 * The tool: the real renderer with the editor's overlay on top, and a document nothing reactive
	 * ever touches.
	 *
	 * `doc`, the renderer and every scrap of gesture state below are plain `let` bindings, **not**
	 * refs. Only the snapshot crosses into Vue (step 4A, `snapshot()`), and that is a handful of
	 * numbers replaced wholesale. There is no animation loop either: `loop.ts` owns the single rAF
	 * and nothing here moves on its own, so a redraw is a pending flag plus one
	 * `requestAnimationFrame` (step 4B, decision 2).
	 */

	/** The id `New empty` falls back to when the current one is not a def id. */
	const DEFAULT_MAP_ID = 'newMap'

	const DEF_ID = /^[a-z][a-zA-Z0-9]*$/

	const router = useRouter()
	const board = useTemplateRef<HTMLCanvasElement>('board')

	// --- reactive: the panels, and nothing else -------------------------------------------------

	const tool = ref<EditorTool>('brush')
	const brushChar = ref<BrushChar>('#')
	const brushSize = ref(1)
	const snapToTile = ref(true)
	const showGrid = ref(true)
	const activePathIndex = ref(0)
	const decorGlyph = ref<string>(DECOR_PALETTE[0] ?? '🧽')
	const status = ref('')
	const statusIsError = ref(false)
	const mapId = ref('')
	const fridgeGlyph = ref('')
	const snap = shallowRef<EditorSnapshot>({
		revision: 0,
		problems: [],
		paths: [],
		buildablePercent: 0,
		canUndo: false,
		canRedo: false,
	})
	const convergence = shallowRef<Convergence[]>([])
	const registeredIds = MAP_SOURCES.map(source => source.id)

	// --- plain state: the document, the canvas, the gesture in flight ---------------------------

	let doc: EditorDoc = createDocument(emptyMap(DEFAULT_MAP_ID))
	let renderer: Renderer | null = null

	/**
	 * What the pointer is currently doing. One gesture is one `doc.edit()`, committed on pointerup:
	 * anything else means 60 undo entries and 60 terrain bakes per drag (decision 1).
	 */
	type Gesture =
		| { kind: 'brush'; char: BrushChar }
		| { kind: 'moveWaypoint'; pathIndex: number; waypointIndex: number; point: Vec2 }
		| { kind: 'insertWaypoint'; pathIndex: number; insertAt: number; point: Vec2 }
		| { kind: 'appendWaypoint'; pathIndex: number; point: Vec2 }
		| { kind: 'fridge'; tile: Vec2 }

	let gesture: Gesture | null = null
	let hoverGrid: Vec2 | null = null
	let brushTiles: Vec2[] = []
	let brushKeys = new Set<string>()
	let lastBrushTile: Vec2 | null = null
	let focusTile: Vec2 | null = null
	let insertPoint: Vec2 | null = null

	let drawPending = false
	let rafHandle = 0

	function setStatus(message: string, isError = false): void {
		status.value = message
		statusIsError.value = isError
	}

	// --- redraw ---------------------------------------------------------------------------------

	function overlayPaths(): OverlayPath[] {
		return doc.source.paths.map((path, pathIndex) => {
			const active = gesture
			if (active === null || active.kind === 'brush' || active.kind === 'fridge') {
				return { id: path.id, waypoints: path.waypoints }
			}
			if (active.pathIndex !== pathIndex) {
				return { id: path.id, waypoints: path.waypoints }
			}
			if (active.kind === 'moveWaypoint') {
				const waypoints = path.waypoints.map((waypoint, index) =>
					index === active.waypointIndex ? active.point : waypoint,
				)
				return { id: path.id, waypoints }
			}
			if (active.kind === 'insertWaypoint') {
				return {
					id: path.id,
					waypoints: [
						...path.waypoints.slice(0, active.insertAt),
						active.point,
						...path.waypoints.slice(active.insertAt),
					],
				}
			}
			return { id: path.id, waypoints: [...path.waypoints, active.point] }
		})
	}

	/** Which handle the overlay should draw fat, whichever of the three path gestures is live. */
	function draggingHandle(): { pathIndex: number; waypointIndex: number } | null {
		const active = gesture
		if (active === null || active.kind === 'brush' || active.kind === 'fridge') {
			return null
		}
		if (active.kind === 'moveWaypoint') {
			return { pathIndex: active.pathIndex, waypointIndex: active.waypointIndex }
		}
		if (active.kind === 'insertWaypoint') {
			return { pathIndex: active.pathIndex, waypointIndex: active.insertAt }
		}
		const length = doc.source.paths[active.pathIndex]?.waypoints.length ?? 0
		return { pathIndex: active.pathIndex, waypointIndex: length }
	}

	function draw(): void {
		const active = renderer
		if (active === null) {
			return
		}

		// Identity-keyed inside the renderer, so this is free until an edit produces a new MapDef.
		active.setMap(doc.map)
		active.drawFrame(null)

		drawEditorOverlay(
			active.ctx,
			{
				paths: overlayPaths(),
				activePathIndex: activePathIndex.value,
				hoverGrid,
				brushTiles,
				brushChar: gesture?.kind === 'brush' ? gesture.char : brushChar.value,
				fridgeTile: gesture?.kind === 'fridge' ? gesture.tile : doc.source.fridge.tile,
				problems: doc.problems,
				focusTile,
				insertPoint,
				draggingWaypoint: draggingHandle(),
				showGrid: showGrid.value,
			},
			doc.map.widthTiles,
			doc.map.heightTiles,
			active.tilePx,
		)
	}

	function requestDraw(): void {
		if (drawPending) {
			return
		}
		drawPending = true
		rafHandle = requestAnimationFrame(() => {
			drawPending = false
			draw()
		})
	}

	function publish(): void {
		snap.value = doc.snapshot()
		convergence.value = convergenceOf(doc.map)
		mapId.value = doc.source.id
		fridgeGlyph.value = doc.source.fridge.glyph
		if (activePathIndex.value >= doc.source.paths.length) {
			activePathIndex.value = Math.max(0, doc.source.paths.length - 1)
		}
		requestDraw()
	}

	/**
	 * One edit, one undo entry, one bake. `doc.edit` applies atomically, so a mutation `loadMap`
	 * refuses leaves the document exactly as it was -- which is why this reports rather than throws.
	 */
	function commit(mutate: (draft: MapSource) => void): void {
		try {
			doc.edit(mutate)
		} catch (cause) {
			setStatus(`edit rejected: ${(cause as Error).message}`, true)
		}
		publish()
	}

	function replaceDocument(source: MapSource): void {
		doc = createDocument(source)
		activePathIndex.value = 0
		focusTile = null
		publish()
	}

	// --- pointer --------------------------------------------------------------------------------

	function clampToBoard(point: Vec2): Vec2 {
		return {
			x: Math.min(Math.max(point.x, 0), doc.map.widthTiles - 1),
			y: Math.min(Math.max(point.y, 0), doc.map.heightTiles - 1),
		}
	}

	/** Waypoint-space position of the pointer, snapped to tile centres unless the author said not to. */
	function waypointAt(grid: Vec2): Vec2 {
		const raw = gridToWaypoint(grid)
		const snapped = snapToTile.value ? { x: Math.round(raw.x), y: Math.round(raw.y) } : raw
		return clampToBoard(snapped)
	}

	function addBrushTiles(tile: Vec2): void {
		const walked = lastBrushTile === null ? [tile] : tilesBetween(lastBrushTile, tile)
		for (const step of walked) {
			for (const painted of brushFootprint(step, brushSize.value, doc.map.widthTiles, doc.map.heightTiles)) {
				const key = `${painted.x},${painted.y}`
				if (!brushKeys.has(key)) {
					brushKeys.add(key)
					brushTiles.push(painted)
				}
			}
		}
		lastBrushTile = tile
	}

	function beginBrush(tile: Vec2, isErase: boolean): void {
		gesture = { kind: 'brush', char: isErase ? ERASE_CHAR : brushChar.value }
		brushTiles = []
		brushKeys = new Set<string>()
		lastBrushTile = null
		addBrushTiles(tile)
	}

	function beginPathGesture(grid: Vec2, isErase: boolean): void {
		const at = gridToWaypoint(grid)

		const hit = hitWaypoint(doc.source, at, activePathIndex.value)
		if (hit !== null) {
			activePathIndex.value = hit.pathIndex
			if (isErase) {
				commit(draft => deleteWaypoint(draft, hit.pathIndex, hit.waypointIndex))
				setStatus(`deleted waypoint ${hit.waypointIndex}`)
				return
			}
			gesture = { ...hit, kind: 'moveWaypoint', point: waypointAt(grid) }
			return
		}

		// A right-click that hits nothing does nothing at all -- it must never append.
		if (isErase) {
			return
		}

		const segment = hitSegment(doc.source, at, activePathIndex.value)
		if (segment !== null) {
			activePathIndex.value = segment.pathIndex
			gesture = {
				kind: 'insertWaypoint',
				pathIndex: segment.pathIndex,
				insertAt: segment.insertAt,
				point: snapToTile.value
					? clampToBoard({ x: Math.round(segment.point.x), y: Math.round(segment.point.y) })
					: segment.point,
			}
			return
		}

		if (doc.source.paths.length === 0) {
			setStatus('no path to append to — add one first', true)
			return
		}
		gesture = { kind: 'appendWaypoint', pathIndex: activePathIndex.value, point: waypointAt(grid) }
	}

	function onPointerDown(event: PointerEvent): void {
		const canvas = board.value
		if (canvas === null || (event.button !== 0 && event.button !== 2)) {
			return
		}

		const grid = toGridPoint(canvas, event, doc.map.widthTiles)
		const tile = toTile(grid)
		if (!isOnBoard(tile, doc.map.widthTiles, doc.map.heightTiles)) {
			return
		}

		canvas.setPointerCapture(event.pointerId)
		hoverGrid = grid
		focusTile = null
		const isErase = event.button === 2

		if (tool.value === 'brush') {
			beginBrush(tile, isErase)
		} else if (tool.value === 'path') {
			beginPathGesture(grid, isErase)
		} else if (tool.value === 'fridge') {
			gesture = { kind: 'fridge', tile }
		} else if (isErase) {
			commit(draft => removeDecor(draft, tile))
		} else {
			commit(draft => placeDecor(draft, decorGlyph.value, tile))
		}

		requestDraw()
	}

	function onPointerMove(event: PointerEvent): void {
		const canvas = board.value
		if (canvas === null) {
			return
		}

		const grid = toGridPoint(canvas, event, doc.map.widthTiles)
		hoverGrid = grid
		const tile = toTile(grid)

		if (gesture === null) {
			// The "+" that says a click here inserts rather than appends.
			insertPoint =
				tool.value === 'path'
					? (hitSegment(doc.source, gridToWaypoint(grid), activePathIndex.value)?.point ?? null)
					: null
			requestDraw()
			return
		}

		insertPoint = null

		if (gesture.kind === 'brush') {
			addBrushTiles(tile)
		} else if (gesture.kind === 'fridge') {
			if (isOnBoard(tile, doc.map.widthTiles, doc.map.heightTiles)) {
				gesture = { kind: 'fridge', tile }
			}
		} else {
			gesture = { ...gesture, point: waypointAt(grid) }
		}

		requestDraw()
	}

	function commitGesture(): void {
		const active = gesture
		gesture = null
		if (active === null) {
			return
		}

		if (active.kind === 'brush') {
			const painted = brushTiles
			brushTiles = []
			brushKeys = new Set<string>()
			lastBrushTile = null
			if (painted.length > 0) {
				commit(draft => paintTiles(draft, painted, active.char))
			}
			return
		}

		if (active.kind === 'moveWaypoint') {
			commit(draft => moveWaypoint(draft, active.pathIndex, active.waypointIndex, active.point))
			return
		}

		if (active.kind === 'insertWaypoint') {
			commit(draft => insertWaypoint(draft, active.pathIndex, active.insertAt, active.point))
			return
		}

		if (active.kind === 'appendWaypoint') {
			// The double-click guard: two clicks in the same spot are one waypoint, not a
			// zero-length segment the validator then complains about (section 4).
			if (isTooCloseToAppend(doc.source, active.pathIndex, active.point)) {
				setStatus('ignored: that is on top of the last waypoint', true)
				requestDraw()
				return
			}
			commit(draft => appendWaypoint(draft, active.pathIndex, active.point))
			return
		}

		commit(draft => moveFridge(draft, active.tile))
	}

	function onPointerUp(event: PointerEvent): void {
		board.value?.releasePointerCapture(event.pointerId)
		commitGesture()
	}

	function onPointerCancel(event: PointerEvent): void {
		board.value?.releasePointerCapture(event.pointerId)
		gesture = null
		brushTiles = []
		brushKeys = new Set<string>()
		lastBrushTile = null
		requestDraw()
	}

	function onPointerLeave(): void {
		if (gesture === null) {
			hoverGrid = null
			insertPoint = null
			requestDraw()
		}
	}

	// --- panels ---------------------------------------------------------------------------------

	function onUndo(): void {
		doc.undo()
		publish()
	}

	function onRedo(): void {
		doc.redo()
		publish()
	}

	function onAddPath(): void {
		const id = nextPathId(doc.source)
		commit(draft => addPath(draft, id))
		activePathIndex.value = doc.source.paths.length - 1
		setStatus(`added path '${id}'`)
	}

	function onDeletePath(index: number): void {
		commit(draft => deletePath(draft, index))
	}

	function onSetFridgeGlyph(glyph: string): void {
		commit(draft => {
			draft.fridge.glyph = glyph
		})
	}

	/**
	 * A clicked problem row highlights what it names. There is no camera to move: the board is a
	 * fixed logical 1152 x 672 and the whole map is always on screen, so "centre on it" is a ring
	 * around the tile plus selecting the lane it belongs to.
	 */
	function onFocusProblem(problem: Problem): void {
		focusTile = problem.tile ?? null
		if (problem.pathId !== undefined) {
			const index = doc.source.paths.findIndex(path => path.id === problem.pathId)
			if (index >= 0) {
				activePathIndex.value = index
			}
		}
		requestDraw()
	}

	function onNewMap(): void {
		const id = DEF_ID.test(mapId.value) ? mapId.value : DEFAULT_MAP_ID
		replaceDocument(emptyMap(id))
		setStatus(`new empty map '${id}'`)
	}

	function onRenameMap(id: string): void {
		if (!DEF_ID.test(id)) {
			setStatus(`'${id}' is not a def id: camelCase, e.g. counterTop`, true)
			mapId.value = doc.source.id
			return
		}
		commit(draft => {
			draft.id = id
		})
		setStatus(`renamed to '${id}'`)
	}

	function onImportRegistered(id: string): void {
		const source = MAP_SOURCES.find(entry => entry.id === id)
		if (source === undefined) {
			setStatus(`no registered map '${id}'`, true)
			return
		}
		replaceDocument(structuredClone(source))
		setStatus(`imported '${id}'`)
	}

	function onImportJson(text: string): void {
		const result = fromJson(text)
		if ('problems' in result) {
			setStatus(result.problems.map(problem => problem.message).join('; '), true)
			return
		}
		replaceDocument(result.source)
		setStatus(`imported '${result.source.id}'`)
	}

	/** The schema is the hard gate on the way out, exactly as it is on the way in (step 4A, decision 5). */
	function exportable(): string | null {
		const json = toJson(doc.source)
		const check = fromJson(json)
		if ('problems' in check) {
			setStatus(`not exportable — ${check.problems.map(problem => problem.message).join('; ')}`, true)
			return null
		}
		return json
	}

	function download(name: string, json: string): void {
		const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
		const link = document.createElement('a')
		link.href = url
		link.download = name
		link.click()
		// Revoked on the next macrotask rather than inline: revoking in the same task as the click
		// cancels the download in some browsers, and never revoking leaks the blob per export.
		setTimeout(() => URL.revokeObjectURL(url), 0)
	}

	function onExport(): void {
		const json = exportable()
		if (json === null) {
			return
		}

		// Written synchronously inside the click handler. `navigator.clipboard.writeText` needs a
		// live user gesture, and an `await` on anything else first expires it.
		const name = `${doc.source.id}.json`
		navigator.clipboard
			.writeText(json)
			.catch((cause: unknown) => setStatus(`clipboard refused: ${String(cause)}`, true))
		download(name, json)

		setStatus(
			`copied and downloaded ${name}. Last step is manual: drop it in core/content/maps/ and add one line to maps/index.ts`,
		)
	}

	function onPreview(): void {
		const json = exportable()
		if (json === null) {
			return
		}
		setPreviewMap(json)
		void router.push('/')
	}

	// --- keyboard -------------------------------------------------------------------------------

	function onKeyDown(event: KeyboardEvent): void {
		if (isTypingTarget(event.target)) {
			return
		}

		if (event.ctrlKey || event.metaKey) {
			const key = event.key.toLowerCase()
			if (key === 'z' && !event.shiftKey) {
				event.preventDefault()
				onUndo()
			} else if ((key === 'z' && event.shiftKey) || key === 'y') {
				event.preventDefault()
				onRedo()
			}
			return
		}

		if (event.key === '[' || event.key === ']') {
			event.preventDefault()
			const count = doc.source.paths.length
			if (count > 0) {
				const direction = event.key === ']' ? 1 : -1
				activePathIndex.value = (activePathIndex.value + direction + count) % count
				requestDraw()
			}
			return
		}

		if (event.key === 'g') {
			showGrid.value = !showGrid.value
			requestDraw()
		}
	}

	function onResize(): void {
		renderer?.resize()
		requestDraw()
	}

	onMounted(() => {
		const canvas = board.value
		if (canvas === null) {
			return
		}
		renderer = createRenderer(canvas)
		window.addEventListener('resize', onResize)
		window.addEventListener('keydown', onKeyDown)
		publish()
	})

	onBeforeUnmount(() => {
		window.removeEventListener('resize', onResize)
		window.removeEventListener('keydown', onKeyDown)
		cancelAnimationFrame(rafHandle)
		drawPending = false
		renderer = null
	})
</script>

<style scoped>
	.editor {
		display: grid;
		grid-template-columns: 1fr 22rem;
		height: 100%;
		overflow: hidden;
	}

	.stage {
		display: grid;
		place-items: center;
		min-width: 0;
		padding: 0.5rem;
	}

	/* Same logical 1152 x 672 CSS-scaled box as GameView.vue -- the hit tests depend on it. */
	.board {
		width: min(100%, calc((100vh - 1rem) * (1152 / 672)));
		max-height: 100%;
		aspect-ratio: 1152 / 672;
		background: var(--kd-night);
		touch-action: none;
		cursor: crosshair;
	}

	.panels {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.5rem;
		overflow-y: auto;
		background: var(--kd-night-soft);
		font-size: 0.8rem;
	}
</style>

<style>
	/* Unscoped on purpose: the panels under dev/editor/panels/ share this chrome, and the editor is
	   a whole route rather than a widget, so there is nothing else on the page to leak into. */
	.ed-panel {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.5rem;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 0.4rem;
	}

	.ed-panel h2 {
		display: flex;
		justify-content: space-between;
		margin: 0;
		color: var(--kd-lamp);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.ed-panel h3 {
		margin: 0.25rem 0 0;
		color: var(--kd-text-dim);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.ed-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.ed-btn {
		padding: 0.2rem 0.45rem;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 0.3rem;
		background: transparent;
		color: var(--kd-text);
		font: inherit;
		cursor: pointer;
	}

	.ed-btn:hover:not(:disabled) {
		border-color: var(--kd-lamp);
	}

	.ed-btn:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.ed-btn.on {
		border-color: var(--kd-lamp);
		background: rgba(245, 198, 107, 0.18);
		color: var(--kd-lamp);
	}

	.ed-btn.small {
		padding: 0.1rem 0.35rem;
	}

	.ed-btn.glyph {
		font-size: 1rem;
		line-height: 1.1;
	}

	.ed-btn.grow,
	.grow {
		flex: 1;
		min-width: 0;
	}

	.ed-list {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.ed-list li {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.ed-row-btn {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 0.4rem;
		padding: 0.2rem 0.35rem;
		border: 1px solid transparent;
		border-radius: 0.3rem;
		background: rgba(255, 255, 255, 0.04);
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.ed-row-btn.on {
		border-color: var(--kd-lamp);
	}

	.ed-static {
		justify-content: space-between;
		padding: 0.15rem 0.35rem;
	}

	.ed-field {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--kd-text-dim);
	}

	.ed-check {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--kd-text-dim);
	}

	.ed-value {
		margin-left: auto;
		color: var(--kd-lamp);
		font-variant-numeric: tabular-nums;
	}

	.ed-value.good {
		color: #9dff8a;
	}

	.ed-hint {
		margin: 0;
		color: var(--kd-text-dim);
		font-size: 0.7rem;
		line-height: 1.3;
	}

	.ed-status {
		margin: 0.2rem 0 0;
		color: #9dff8a;
		font-size: 0.7rem;
		line-height: 1.3;
	}

	.ed-status.bad {
		color: #ff8a8a;
	}

	.editor .mono,
	.ed-panel input,
	.ed-panel textarea,
	.ed-panel select {
		font-family: ui-monospace, 'Cascadia Mono', monospace;
	}

	.ed-panel input[type='text'],
	.ed-panel input:not([type]),
	.ed-panel textarea,
	.ed-panel select {
		padding: 0.15rem 0.3rem;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 0.3rem;
		background: rgba(0, 0, 0, 0.25);
		color: var(--kd-text);
		font-size: 0.75rem;
	}
</style>
