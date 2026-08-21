<template>
	<div class="stage">
		<canvas
			ref="board"
			class="board"
			:width="LOGICAL_WIDTH"
			:height="LOGICAL_HEIGHT"
		/>
		<div class="hud">
			<DebugOverlay
				:fps="snapshot.fps"
				:tickCount="snapshot.tickCount"
				:simSeconds="snapshot.simSeconds"
				:entityCount="snapshot.entityCount"
				:speed="snapshot.speed"
				:paused="snapshot.paused"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'
	import { createLoop, type Loop, type Speed } from '@/loop.ts'
	import { getMapDef } from '@/core/content/index.ts'
	import { createRenderer, LOGICAL_HEIGHT, LOGICAL_WIDTH, type Renderer } from '@/render/index.ts'
	import DebugOverlay from '@/ui/components/DebugOverlay.vue'
	import type { MapDef } from '@/core/types.ts'
	import type { DebugController } from '@/dev/debug/state.ts'
	import type { drawDebugOverlay } from '@/dev/debug/overlay.ts'

	/**
	 * The one place the canvas, the loop and the HUD meet.
	 *
	 * The snapshot is a `shallowRef` replaced wholesale from the loop's publish callback at ~15Hz.
	 * It is a handful of numbers and it never contains world state -- see ARCHITECTURE.md section 5
	 * for why the alternative (reactive world) is the trap this whole layout exists to avoid.
	 */

	interface Snapshot {
		fps: number
		tickCount: number
		simSeconds: number
		entityCount: number
		speed: Speed
		paused: boolean
	}

	/** The only map there is until step 3C authors the real one. */
	const MAP_ID = 'counter'

	/**
	 * What the board is showing. Normally the authored map; in dev it is whatever the editor's
	 * preview slot handed over (step 4B, decision 6).
	 */
	let activeMap: MapDef = getMapDef(MAP_ID)

	function currentMap(): MapDef {
		return activeMap
	}

	const board = useTemplateRef<HTMLCanvasElement>('board')

	const snapshot = shallowRef<Snapshot>({
		fps: 0,
		tickCount: 0,
		simSeconds: 0,
		entityCount: 0,
		speed: 1,
		paused: false,
	})

	let renderer: Renderer | null = null
	let loop: Loop | null = null
	/** Dev-only: dynamically imported below, so neither module ever enters the production bundle. */
	let debug: DebugController | null = null
	let drawOverlay: typeof drawDebugOverlay | null = null

	function onResize(): void {
		renderer?.resize()
	}

	function onKeyDown(event: KeyboardEvent): void {
		if (loop === null) {
			return
		}
		if (event.code === 'Space') {
			event.preventDefault()
			loop.togglePause()
			return
		}
		if (event.key === '1' || event.key === '2' || event.key === '3') {
			loop.setSpeed(Number(event.key) as Speed)
		}
	}

	onMounted(async () => {
		if (board.value === null) {
			return
		}
		const canvasEl = board.value

		if (import.meta.env.DEV) {
			// Dynamic import keeps dev/debug entirely out of the production bundle -- the same
			// pattern router.ts uses for the step 4 editor route.
			const [{ createDebugController }, { drawDebugOverlay: draw }, { takePreviewMap }] = await Promise.all([
				import('@/dev/debug/state.ts'),
				import('@/dev/debug/overlay.ts'),
				import('@/dev/editor/preview.ts'),
			])

			// One-shot: the editor's preview slot is read and cleared here, so a stale preview
			// cannot hijack this route on the next visit. It shows the board on the real renderer
			// and nothing else -- step 5 is what makes this a playtest, because that is the step
			// that puts a simulation behind it.
			const preview = takePreviewMap()
			if (preview !== null) {
				activeMap = preview
			}

			debug = createDebugController(canvasEl, currentMap)
			drawOverlay = draw
		}

		const activeRenderer = createRenderer(canvasEl)
		renderer = activeRenderer
		activeRenderer.setMap(activeMap)

		const activeLoop = createLoop({
			tick() {
				// Step 5 runs the simulation here.
			},
			draw() {
				// Null world: there is nothing simulated behind the board yet, so the frame is the
				// baked map and an empty entity pass. Step 5 hands it a real one.
				activeRenderer.drawFrame(null)
				debug?.update()
				if (import.meta.env.DEV && debug !== null && debug.state.enabled && drawOverlay !== null) {
					drawOverlay(activeRenderer.ctx, activeMap, debug.state, activeRenderer.tilePx)
				}
			},
			publish() {
				snapshot.value = {
					fps: activeLoop.fps,
					tickCount: activeLoop.tickCount,
					simSeconds: activeLoop.simSeconds,
					entityCount: 0,
					speed: activeLoop.speed,
					paused: activeLoop.paused,
				}
			},
		})
		loop = activeLoop

		window.addEventListener('resize', onResize)
		window.addEventListener('keydown', onKeyDown)
		activeLoop.start()
	})

	onBeforeUnmount(() => {
		window.removeEventListener('resize', onResize)
		window.removeEventListener('keydown', onKeyDown)
		loop?.stop()
		loop = null
		renderer = null
		debug?.destroy()
		debug = null
		drawOverlay = null
	})
</script>

<style scoped>
	.stage {
		display: grid;
		place-items: center;
		height: 100%;
	}

	/* Logical 1152 x 672, CSS-scaled to whichever of the two window axes runs out first. */
	.board {
		grid-area: 1 / 1;
		width: min(100%, calc(100vh * (1152 / 672)));
		max-height: 100%;
		aspect-ratio: 1152 / 672;
		background: var(--kd-night);
	}

	/* The HUD is a layer over the board. Nothing in it takes input unless it opts back in. */
	.hud {
		position: relative;
		grid-area: 1 / 1;
		width: min(100%, calc(100vh * (1152 / 672)));
		max-height: 100%;
		aspect-ratio: 1152 / 672;
		pointer-events: none;
	}
</style>
