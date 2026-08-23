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
	import { createCommandQueue } from '@/core/commands.ts'
	import { tick as stepWorld } from '@/core/sim.ts'
	import { createWorld } from '@/core/world.ts'
	import {
		createRenderer,
		LOGICAL_HEIGHT,
		LOGICAL_WIDTH,
		preloadEnemyGlyphs,
		preloadFoodGlyphs,
		pushEvents,
		resetEffects,
		type Renderer,
	} from '@/render/index.ts'
	import DebugOverlay from '@/ui/components/DebugOverlay.vue'
	import type { GameEvent, MapDef, World } from '@/core/types.ts'
	import type { DebugController, isTypingTarget } from '@/dev/debug/state.ts'
	import type { drawDebugOverlay } from '@/dev/debug/overlay.ts'
	import type { drawNightHud } from '@/dev/nightHud.ts'

	/**
	 * The one place the canvas, the loop, the world and the HUD meet.
	 *
	 * `world` is a plain `let` -- never a `ref`, never a store. Deep reactivity over hundreds of
	 * entities mutated 60 times a second is the trap this whole layout exists to avoid
	 * (ARCHITECTURE.md section 5). What the HUD sees is the snapshot below: a handful of numbers in a
	 * `shallowRef`, replaced wholesale from the loop's publish callback at ~15Hz.
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
	const NIGHT_ID = 'night01'
	/** Fixed in dev, so `r` reopens the same night: same ants, same fridge, same order. */
	const SEED = 1234

	let world: World | null = null
	const queue = createCommandQueue()

	/**
	 * This frame's events, accumulated across however many ticks ran. `tick()` clears `world.events`
	 * at the top, so at 3x speed a consumer reading it once per frame would see one tick's worth and
	 * silently drop the other two (step 5C, decision 2).
	 */
	const frameEvents: GameEvent[] = []

	/** Dev only: the editor's preview map, stashed until there is a world to hang it on. */
	let previewMap: MapDef | null = null

	/**
	 * The map the overlay and the debug controller work against: **the world's clone**, not the
	 * authored def. They would otherwise tint and hit-test a different object than the one being
	 * simulated -- which looks right today and stops matching the board the first time a night
	 * modifier writes to a tile.
	 */
	function currentMap(): MapDef {
		return world?.map ?? getMapDef(MAP_ID)
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
	/** Dev-only: dynamically imported below, so none of these modules enters the production bundle. */
	let debug: DebugController | null = null
	let drawOverlay: typeof drawDebugOverlay | null = null
	let drawHud: typeof drawNightHud | null = null
	/** Null outside dev, which is also how `n` and `r` know they are not available. */
	let typingGuard: typeof isTypingTarget | null = null

	function onResize(): void {
		renderer?.resize()
	}

	/**
	 * A fresh night on the same seed, plus the two things that are not part of the world: the bake
	 * (the new world's map is a different object, so it re-fires exactly once) and the theft
	 * animation, which would otherwise keep flying items out of the night that just ended.
	 */
	function restart(): void {
		const next = createWorld({ seed: SEED, mapId: MAP_ID, nightId: NIGHT_ID, difficulty: 'normal' })
		// A world cannot be built from an unregistered map, so the editor's preview is assigned on
		// afterwards. A preview whose paths were renamed has no 'crack', and `startWave` throws with
		// both ids in the message -- the right failure for a dev-only route.
		if (previewMap !== null) {
			next.map = previewMap
		}

		world = next
		frameEvents.length = 0
		resetEffects()

		if (renderer !== null) {
			renderer.setMap(next.map)
			// After `setMap`, never before: `tilePx` is 0 until a map is set, and the cache key
			// includes the size, so preloading early rasterises entries nothing ever reads.
			preloadEnemyGlyphs(renderer.tilePx)
			preloadFoodGlyphs(renderer.tilePx)
		}
	}

	function onKeyDown(event: KeyboardEvent): void {
		if (loop === null) {
			return
		}
		if (typingGuard !== null && typingGuard(event.target)) {
			return
		}
		if (event.code === 'Space') {
			event.preventDefault()
			loop.togglePause()
			return
		}
		if (event.key === '1' || event.key === '2' || event.key === '3') {
			loop.setSpeed(Number(event.key) as Speed)
			return
		}

		// `n` and `r` are dev keys, and a null guard means the dev modules were never loaded.
		if (typingGuard === null) {
			return
		}
		if (event.key === 'n') {
			// A command, never a call into the wave system: player input enters the simulation at a
			// tick boundary and nowhere else (ARCHITECTURE.md section 3).
			queue.enqueue({ kind: 'CallWaveEarly' })
			return
		}
		if (event.key === 'r') {
			restart()
		}
	}

	onMounted(async () => {
		if (board.value === null) {
			return
		}
		const canvasEl = board.value

		if (import.meta.env.DEV) {
			// Dynamic import keeps dev/ entirely out of the production bundle -- the same pattern
			// router.ts uses for the step 4 editor route. `isTypingTarget` comes through here for
			// that reason too: a static import of it would drag the debug controller in with it.
			const [
				{ createDebugController, isTypingTarget: guard },
				{ drawDebugOverlay: draw },
				{ takePreviewMap },
				{ drawNightHud: hud },
			] = await Promise.all([
				import('@/dev/debug/state.ts'),
				import('@/dev/debug/overlay.ts'),
				import('@/dev/editor/preview.ts'),
				import('@/dev/nightHud.ts'),
			])

			// One-shot: the editor's preview slot is read and cleared here, so a stale preview
			// cannot hijack this route on the next visit. It is stashed rather than used, because
			// the world is built from a registered map id and the preview is assigned on after.
			previewMap = takePreviewMap()

			debug = createDebugController(canvasEl, currentMap)
			drawOverlay = draw
			drawHud = hud
			typingGuard = guard
		}

		const activeRenderer = createRenderer(canvasEl)
		renderer = activeRenderer
		restart()

		const activeLoop = createLoop({
			tick() {
				if (world === null) {
					return
				}
				stepWorld(world, queue)
				frameEvents.push(...world.events)
			},
			draw() {
				// Before `drawFrame`, which is what runs the effects layer: pushing after it puts
				// every theft one frame late.
				if (world !== null) {
					pushEvents(frameEvents, world)
					frameEvents.length = 0
				}

				activeRenderer.drawFrame(world)
				debug?.update()
				if (import.meta.env.DEV && debug !== null && debug.state.enabled && drawOverlay !== null) {
					drawOverlay(activeRenderer.ctx, currentMap(), debug.state, activeRenderer.tilePx)
				}
				if (import.meta.env.DEV && drawHud !== null && world !== null) {
					drawHud(activeRenderer.ctx, world)
				}
			},
			publish() {
				snapshot.value = {
					fps: activeLoop.fps,
					tickCount: activeLoop.tickCount,
					simSeconds: activeLoop.simSeconds,
					entityCount: world?.enemies.length ?? 0,
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
		world = null
		frameEvents.length = 0
		resetEffects()
		debug?.destroy()
		debug = null
		drawOverlay = null
		drawHud = null
		typingGuard = null
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
