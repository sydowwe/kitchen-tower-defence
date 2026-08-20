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
	import { createRenderer, LOGICAL_HEIGHT, LOGICAL_WIDTH, type Renderer } from '@/render/index.ts'
	import DebugOverlay from '@/ui/components/DebugOverlay.vue'

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

	interface Scene {
		update(): void
		draw(renderer: Renderer): void
		readonly entityCount: number
	}

	const DEMO_ENTITIES = 400

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
	let scene: Scene | null = null

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

	async function loadScene(): Promise<Scene | null> {
		// The bouncing-emoji load test is dev-only scaffolding. The dynamic import inside the DEV
		// branch is what keeps `dev/` out of a production bundle entirely.
		if (!import.meta.env.DEV) {
			return null
		}
		const demo = await import('@/dev/demo/bouncers.ts')
		const bouncers = demo.createBouncers(DEMO_ENTITIES)
		return {
			update() {
				demo.updateBouncers(bouncers)
			},
			draw(target: Renderer) {
				demo.drawBouncers(bouncers, target)
			},
			entityCount: bouncers.length,
		}
	}

	onMounted(async () => {
		if (board.value === null) {
			return
		}
		const activeRenderer = createRenderer(board.value)
		renderer = activeRenderer

		const activeLoop = createLoop({
			tick() {
				scene?.update()
			},
			draw() {
				activeRenderer.clear()
				scene?.draw(activeRenderer)
			},
			publish() {
				snapshot.value = {
					fps: activeLoop.fps,
					tickCount: activeLoop.tickCount,
					simSeconds: activeLoop.simSeconds,
					entityCount: scene?.entityCount ?? 0,
					speed: activeLoop.speed,
					paused: activeLoop.paused,
				}
			},
		})
		loop = activeLoop

		scene = await loadScene()

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
		scene = null
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
