<template>
	<div class="stage">
		<canvas
			ref="board"
			class="board"
			:width="LOGICAL_WIDTH"
			:height="LOGICAL_HEIGHT"
		/>
		<div class="hud">
			<HudLayer
				v-if="hud !== null"
				:snapshot="hud"
				:selection="selection"
				:toasts="toasts"
				:wake="wake"
				:thiefBanner="thiefBanner"
				:saveState="saveState"
				@select="onSelect"
				@sell="onSell"
				@upgrade="onUpgrade"
				@setTargetingMode="onSetTargetingMode"
				@callWave="onCallWave"
				@setSpeed="applySpeed"
				@togglePause="togglePause"
				@retry="retryNight"
				@continueNight="toKitchen"
				@retrySave="progressStore.retry"
			/>
			<div
				v-if="progressStore.progress === null"
				class="waiting"
			>
				<LoadState
					:failed="progressStore.status === 'error'"
					@retry="retryLoad"
				/>
			</div>
			<DebugOverlay
				:visible="snapshot.debugEnabled"
				:fps="snapshot.fps"
				:tickCount="snapshot.tickCount"
				:simSeconds="snapshot.simSeconds"
				:entityCount="snapshot.entityCount"
				:speed="snapshot.speed"
				:paused="snapshot.paused"
			/>
			<component
				:is="NoisePanel"
				v-if="NoisePanel !== null && noiseDev !== null"
				:readout="noiseDev"
				@restart="onDevModifiers"
				@wakeNow="onDevWakeNow"
			/>
			<component
				:is="NightPanel"
				v-if="NightPanel !== null"
				:current="nightId"
				@pick="onDevPickNight"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch, type Component } from 'vue'
	import { useRouter } from 'vue-router'
	import { createLoop, type Loop, type Speed } from '@/loop.ts'
	import { nightResultOf, worldOptionsFor, type Progress } from '@/core/campaign.ts'
	import { getMapDef, getNightDef, NIGHTS, resolveModifiers } from '@/core/content/index.ts'
	import { createCommandQueue } from '@/core/commands.ts'
	import { tick as stepWorld } from '@/core/sim.ts'
	import { createWorld, type CreateWorldOptions } from '@/core/world.ts'
	import {
		createRenderer,
		LOGICAL_HEIGHT,
		LOGICAL_WIDTH,
		preloadCrumbGlyphs,
		preloadEnemyGlyphs,
		preloadFoodGlyphs,
		preloadTowerGlyphs,
		pushEvents,
		resetEffects,
		type Renderer,
	} from '@/render/index.ts'
	import DebugOverlay from '@/ui/components/DebugOverlay.vue'
	import HudLayer from '@/ui/components/hud/HudLayer.vue'
	import LoadState from '@/ui/components/LoadState.vue'
	import { useProgressStore } from '@/ui/stores/progress.ts'
	import { useSettingsStore } from '@/ui/stores/settings.ts'
	import { createInteraction, type Interaction, type Toast } from '@/ui/interaction.ts'
	import { createSelection } from '@/ui/selection.ts'
	import {
		buildEnemyTooltip,
		buildHudSnapshot,
		buildLossView,
		buildThiefBanner,
		buildTowerInspector,
		buildWakeView,
	} from '@/ui/viewModel.ts'
	import type {
		EnemyTooltipView,
		HudSnapshot,
		LossView,
		ThiefBannerView,
		TowerInspectorView,
		WakeView,
	} from '@/ui/viewModel.ts'
	import type { DefId, EntityId, GameEvent, MapDef, TargetingMode, World, WorldModifiers } from '@/core/types.ts'
	import type { DebugController } from '@/dev/debug/state.ts'
	import type { drawDebugOverlay } from '@/dev/debug/overlay.ts'

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
		/** The `` ` `` toggle. False outside dev, where the debug controller is never built. */
		debugEnabled: boolean
	}

	/** The debug controller's map before the first world exists. Every night after is built from progress. */
	const MAP_ID = 'counter'
	/** Fixed, so retrying a night reopens the same one: same ants, same fridge, same order. */
	const SEED = 1234
	/** `core/` holds ticks; the dev panel reads a decay a human can compare against a tower. */
	const TICKS_PER_SECOND = 60

	const router = useRouter()
	const progressStore = useProgressStore()
	const settingsStore = useSettingsStore()

	/** The night on the board, for the dev picker. Null until the first world. */
	const nightId = ref<DefId | null>(null)

	/**
	 * Whether this world is the campaign's night, so its result is saved. False under any dev override
	 * -- an editor preview, a picked night, the noise panel's modifiers -- none of which is the night the
	 * progress would have built.
	 */
	let records = false
	/**
	 * Set in `tick()` the first time this world's `nightEnded` is seen, and **reset in `restart`**. A flag
	 * that is never cleared records the first night and silently no retry after it.
	 */
	let recorded = false
	/** `onMounted` awaits the store; a view that has gone by then must not build a world. */
	let unmounted = false

	/**
	 * Where the night's result is on its way to the save. Both summary buttons wait on `'saving'`: leaving
	 * before the save lands is how a night's money disappears.
	 */
	const saveState = computed(() => {
		if (progressStore.status === 'saving') {
			return 'saving'
		}
		return progressStore.status === 'error' ? 'failed' : 'saved'
	})

	let world: World | null = null
	const queue = createCommandQueue()

	/**
	 * This frame's events, accumulated across however many ticks ran. `tick()` clears `world.events`
	 * at the top, so at 3x speed a consumer reading it once per frame would see one tick's worth and
	 * silently drop the other two (step 5C, decision 2).
	 */
	const frameEvents: GameEvent[] = []

	/**
	 * Loud shots so far tonight, and the last wake.
	 *
	 * Both are read out of `world.events` inside `tick()` rather than from `frameEvents` in `draw()`,
	 * because that is the one place every tick is seen: `frameEvents` is drained and cleared by the
	 * renderer, and at 3x speed a wake and the shot that caused it can land in the same frame.
	 *
	 * `loudShots` only ever goes up -- it is a key for a CSS animation, not a statistic
	 * (see `HudSnapshot.noise.loudShots`).
	 */
	let loudShots = 0
	const wake = shallowRef<WakeView | null>(null)

	/**
	 * The last thing that left the fridge for good, and how many losses tonight. Read off events in
	 * `tick()` for the reason `loudShots` is: the shelf can no longer say which loss was the latest once a
	 * Mouse is taking from the front (see `LossView`). And the Mouse's announcement, off `waveStarted`.
	 */
	let lossCount = 0
	let lastLoss: LossView | null = null
	const thiefBanner = shallowRef<ThiefBannerView | null>(null)

	/** Dev only: the editor's preview map, stashed until there is a world to hang it on. */
	let previewMap: MapDef | null = null

	/**
	 * Dev only: the noise panel, dynamically imported below so none of it reaches production, plus the
	 * readout it draws and the installation modifiers it restarts the night with.
	 *
	 * `devModifiers` is `undefined` for the whole of a production build -- nothing ever assigns it there
	 * -- so `createWorld` sees exactly the options it saw before this panel existed.
	 */
	const NoisePanel = shallowRef<Component | null>(null)
	const noiseDev = shallowRef<{ level: number; cap: number; decayPerSecond: number; wakeCount: number } | null>(null)
	let devModifiers: CreateWorldOptions['modifiers']

	/**
	 * Dev only: the night picker, imported the same way as `NoisePanel`, and the night it picked. A
	 * picked night is played instead of the campaign's, with every tower available, and records nothing.
	 */
	const NightPanel = shallowRef<Component | null>(null)
	let devNightId: DefId | null = null

	/**
	 * The map the debug controller works against: **the world's clone**, not the authored def. It
	 * would otherwise hit-test a different object than the one being simulated -- which looks right
	 * today and stops matching the board the first time a night modifier writes to a tile.
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
		debugEnabled: false,
	})

	/**
	 * The HUD's own snapshot: a second `shallowRef` off the same `publish()`, replaced wholesale.
	 *
	 * Two objects rather than one because they have different audiences -- `Snapshot` above is fps and
	 * tick counters for `DebugOverlay`, and this one is everything the chrome shows. Null until the
	 * first publish: there is no world to build it from before `onMounted` runs.
	 */
	const hud = shallowRef<HudSnapshot | null>(null)

	/**
	 * Refused clicks, in the player's words. Replaced wholesale by `interaction.ts`'s callback rather
	 * than mutated, and never on a frame where nothing changed -- the interaction layer owns the queue
	 * and the lifetime, because that is where the refusal happens.
	 */
	const toasts = shallowRef<Toast[]>([])

	/**
	 * What the player has armed and what they are inspecting. It lives in `ui/selection.ts` rather
	 * than in a component because the HUD, the pointer handlers and the key bindings all need the same
	 * answer.
	 */
	const selection = createSelection()

	/**
	 * Rebuilt on selection change *and* on every publish: the change is what makes picking a tower feel
	 * instant, and the republish is what keeps its refund honest as the phase moves.
	 */
	let inspector: TowerInspectorView | null = null

	function refreshInspector(): void {
		const towerId = selection.selectedTowerId.value
		inspector = towerId === null || world === null ? null : buildTowerInspector(world, towerId)
	}

	watch(selection.selectedTowerId, refreshInspector)

	/**
	 * Rebuilt on every publish, because the hovered enemy's HP moves. An enemy that is gone drops the
	 * latch here: pointermove is the only other place it changes, and a still cursor never fires one.
	 */
	function buildTooltip(): EnemyTooltipView | null {
		const enemyId = selection.hoveredEnemyId
		const tooltip = enemyId === null || world === null ? null : buildEnemyTooltip(world, enemyId)
		if (tooltip === null) {
			selection.hoveredEnemyId = null
		}
		return tooltip
	}

	let renderer: Renderer | null = null
	let loop: Loop | null = null
	let interaction: Interaction | null = null
	/** Dev-only: dynamically imported below, so none of these modules enters the production bundle. */
	let debug: DebugController | null = null
	let drawOverlay: typeof drawDebugOverlay | null = null

	function onResize(): void {
		renderer?.resize()
	}

	/**
	 * What to build tonight, and whether its result counts. The campaign's night is
	 * `worldOptionsFor(progress)` and nothing else; null once the campaign is finished.
	 *
	 * Every override below is dev only -- nothing assigns `devNightId`, `devModifiers` or `previewMap`
	 * in a production build -- and each one makes a night that is not the campaign's, so none records.
	 */
	function optionsFor(progress: Progress): { options: CreateWorldOptions; records: boolean } | null {
		const campaign = progress.nightId === null ? null : worldOptionsFor(progress, SEED)
		if (devNightId === null && devModifiers === undefined && previewMap === null) {
			return campaign === null ? null : { options: campaign, records: true }
		}

		const id = devNightId ?? campaign?.nightId ?? NIGHTS[0]?.id
		if (id === undefined) {
			return null
		}
		return {
			records: false,
			options: {
				seed: SEED,
				mapId: getNightDef(id).mapId,
				nightId: id,
				difficulty: progress.difficulty,
				modifiers: devModifiers ?? resolveModifiers(progress.installations),
				loadout: devNightId === null ? (campaign?.loadout ?? null) : null,
			},
		}
	}

	/**
	 * A fresh night on the same seed, built from the progress, plus the things that are not part of the
	 * world: the bake (the new world's map is a different object, so it re-fires exactly once), the
	 * transient effects, which would otherwise keep flying items out of the night that just ended, the
	 * selection, whose tower id points at nothing once the world is replaced, and the player's speed.
	 *
	 * A finished campaign has no night to build, and goes back to the Kitchen.
	 */
	function restart(): void {
		const progress = progressStore.progress
		if (progress === null) {
			return
		}
		const built = optionsFor(progress)
		if (built === null) {
			void router.replace({ name: 'kitchen' })
			return
		}

		const next = createWorld(built.options)
		// A world cannot be built from an unregistered map, so the editor's preview is assigned on
		// afterwards. A preview whose paths were renamed has no 'crack', and `startWave` throws with
		// both ids in the message -- the right failure for a dev-only route.
		if (previewMap !== null) {
			next.map = previewMap
		}

		world = next
		records = built.records
		recorded = false
		nightId.value = next.night.nightId
		loop?.setSpeed(settingsStore.settings.speed)
		frameEvents.length = 0
		loudShots = 0
		// Without this a retry opens with last night's card still fading and the ripple replaying off a
		// count that belongs to a world that no longer exists -- the same reason `resetEffects` is here.
		wake.value = null
		lossCount = 0
		lastLoss = null
		thiefBanner.value = null
		resetEffects()
		// Both selections point at a world that no longer exists.
		selection.clear()
		inspector = null

		if (renderer !== null) {
			renderer.setMap(next.map)
			// After `setMap`, never before: `tilePx` is 0 until a map is set, and the cache key
			// includes the size, so preloading early rasterises entries nothing ever reads.
			preloadEnemyGlyphs(renderer.tilePx)
			preloadFoodGlyphs(renderer.tilePx)
			preloadTowerGlyphs(renderer.tilePx)
			preloadCrumbGlyphs(renderer.tilePx)
		}
	}

	/**
	 * The summary's Retry. A campaign night goes back to the counter with what was brought still on it
	 * (DECISIONS.md section 10). A dev override rebuilds in place: the loadout screen builds tonight
	 * from progress, and would silently drop the picked night.
	 */
	function retryNight(): void {
		if (records) {
			void router.push({ name: 'loadout' })
			return
		}
		restart()
	}

	/** The summary's Continue. The result was saved before the button was enabled. */
	function toKitchen(): void {
		void router.push({ name: 'kitchen' })
	}

	/** The first world waits on the store: auth and progress, either of which can be slow or fail. */
	async function begin(): Promise<void> {
		await Promise.all([progressStore.ensureLoaded(), settingsStore.ensureLoaded()])
		if (!unmounted && world === null) {
			restart()
		}
	}

	async function retryLoad(): Promise<void> {
		await progressStore.retry()
		if (!unmounted && world === null) {
			restart()
		}
	}

	/**
	 * Pause is `pause()` / `resume()` and never `setSpeed(0)`: two ways to stop time means the pause
	 * button and the speed buttons disagree about which one is lit. Picking a speed therefore resumes.
	 *
	 * Every change also enqueues `SetSpeed`. The simulation ignores it by design -- the command log is
	 * the whole reason the command exists, and nothing has ever enqueued one. A playing speed is also
	 * the player's setting, which `restart` applies to the next night; the store debounces the save.
	 */
	function applySpeed(speed: Speed): void {
		queue.enqueue({ kind: 'SetSpeed', speed })
		loop?.setSpeed(speed)
		loop?.resume()
		if (speed !== 0) {
			settingsStore.update({ speed })
		}
	}

	function togglePause(): void {
		loop?.togglePause()
	}

	/** The shop's toggle: the same tower again disarms, and arming one closes the inspector. */
	function onSelect(defId: DefId): void {
		selection.selectedDefId.value = selection.selectedDefId.value === defId ? null : defId
		selection.selectedTowerId.value = null
	}

	function onSell(towerId: EntityId): void {
		queue.enqueue({ kind: 'SellTower', towerId })
		selection.selectedTowerId.value = null
	}

	/**
	 * The selection is kept, unlike `onSell`: the tower is still there, and the panel has two more
	 * tiers to offer. The next `publish()` rebuilds the inspector, so the slot the player just bought
	 * flips to `'owned'` on the same frame the ring and the range circle change on the board.
	 */
	function onUpgrade(towerId: EntityId): void {
		queue.enqueue({ kind: 'UpgradeTower', towerId })
	}

	function onSetTargetingMode(towerId: EntityId, mode: TargetingMode): void {
		queue.enqueue({ kind: 'SetTargetingMode', towerId, mode })
	}

	function onCallWave(): void {
		queue.enqueue({ kind: 'CallWaveEarly' })
	}

	/**
	 * Dev only. A different set of installations is a differently-built world, so it rebuilds the night
	 * rather than writing to `world.modifiers` -- what a night was built with is part of what
	 * `(seed, mapId, nightId, commandLog)` has to reproduce.
	 */
	function onDevModifiers(modifiers: WorldModifiers): void {
		devModifiers = modifiers
		restart()
	}

	/** Dev only. The picked night stays picked for Retry, until the view is left. */
	function onDevPickNight(id: DefId): void {
		devNightId = id
		restart()
	}

	/**
	 * Dev only. One over the cap, and `noiseSystem` is still the only thing that knows what a wake is.
	 *
	 * **Not `cap` exactly.** The system accumulates, *then* decays, *then* tests, so a level parked on
	 * the cap is a tick's decay under it by the time the cap is read and nothing happens. Any
	 * comfortable overshoot works, because the decay clamps back to the cap before the test.
	 */
	function onDevWakeNow(): void {
		if (world !== null) {
			world.noise.level = world.noise.cap + 1
		}
	}

	onMounted(async () => {
		if (board.value === null) {
			return
		}
		const canvasEl = board.value

		if (import.meta.env.DEV) {
			// Dynamic import keeps dev/ entirely out of the production bundle -- the same pattern
			// router.ts uses for the step 4 editor route.
			const [
				{ createDebugController },
				{ drawDebugOverlay: draw },
				{ takePreviewMap },
				{ default: noisePanel },
				{ default: nightPanel },
			] = await Promise.all([
				import('@/dev/debug/state.ts'),
				import('@/dev/debug/overlay.ts'),
				import('@/dev/editor/preview.ts'),
				import('@/dev/noise/NoisePanel.vue'),
				import('@/dev/night/NightPanel.vue'),
			])

			NoisePanel.value = noisePanel
			NightPanel.value = nightPanel

			// One-shot: the editor's preview slot is read and cleared here, so a stale preview
			// cannot hijack this route on the next visit. It is stashed rather than used, because
			// the world is built from a registered map id and the preview is assigned on after.
			previewMap = takePreviewMap()

			// A getter, never the world: `restart()` replaces it wholesale, and a captured reference
			// would paint step 14B's tile brush into the previous night. Same shape as the
			// `() => world` handed to `createInteraction` below.
			debug = createDebugController(canvasEl, currentMap, () => world)
			drawOverlay = draw
		}

		const activeRenderer = createRenderer(canvasEl)
		renderer = activeRenderer

		// The queue and a getter, never the world itself: everything it does to the simulation is a
		// command drained at a tick boundary (ARCHITECTURE.md section 3).
		const activeInteraction = createInteraction(canvasEl, queue, selection, () => world, {
			togglePause,
			setSpeed: applySpeed,
			speed: () => activeLoop.speed,
			onToasts(next) {
				toasts.value = next
			},
		})
		interaction = activeInteraction

		const activeLoop = createLoop({
			tick() {
				if (world === null) {
					return
				}
				stepWorld(world, queue)
				frameEvents.push(...world.events)

				for (const event of world.events) {
					if (event.kind === 'towerFired' && event.noise > 0) {
						loudShots++
						continue
					}
					if (event.kind === 'humanWoke') {
						// `wakeCount` is already incremented on the world by the time this runs, and it is
						// the one number that is exactly "which wake is this" -- so the card's key comes
						// off the simulation rather than off a counter here that could drift from it.
						wake.value = buildWakeView(world.noise.wakeCount, event)
						continue
					}
					if (event.kind === 'enemyLeaked' || event.kind === 'thiefEscaped') {
						const loss = buildLossView(lossCount + 1, world, event)
						if (loss !== null) {
							lossCount = loss.id
							lastLoss = loss
						}
						continue
					}
					if (event.kind === 'waveStarted') {
						const banner = buildThiefBanner(world, event.waveIndex)
						if (banner !== null) {
							thiefBanner.value = banner
						}
						continue
					}
					// Recorded here, once per world, and never on a button: Retry or closing the tab
					// would skip a button, and a second click would pay the night twice. The store
					// answers `'failed'` rather than rejecting, and the summary reads its `status`.
					if (event.kind === 'nightEnded' && !recorded) {
						recorded = true
						if (records) {
							void progressStore.recordNightResult(nightResultOf(world))
						}
					}
				}
			},
			draw() {
				// Before `drawFrame`, which is what runs the effects layer: pushing after it puts
				// every theft one frame late.
				if (world !== null) {
					pushEvents(frameEvents, world)
					frameEvents.length = 0
				}

				activeRenderer.drawFrame(world, activeInteraction.overlay())
				debug?.update()
				if (import.meta.env.DEV && debug !== null && debug.state.enabled && drawOverlay !== null) {
					drawOverlay(activeRenderer.ctx, currentMap(), debug.state, activeRenderer.tilePx, world)
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
					debugEnabled: debug?.state.enabled ?? false,
				}

				if (import.meta.env.DEV && world !== null) {
					noiseDev.value = {
						level: world.noise.level,
						cap: world.noise.cap,
						decayPerSecond: world.noise.decayPerTick * TICKS_PER_SECOND,
						wakeCount: world.noise.wakeCount,
					}
				}

				if (world !== null) {
					refreshInspector()
					hud.value = buildHudSnapshot(
						world,
						{ speed: activeLoop.speed, paused: activeLoop.paused, loudShots, lastLost: lastLoss },
						inspector,
						buildTooltip(),
					)
				}
			},
		})
		loop = activeLoop

		window.addEventListener('resize', onResize)
		activeLoop.start()

		// The loop runs on an empty board until there is a night to put on it.
		await begin()
	})

	onBeforeUnmount(() => {
		unmounted = true
		records = false
		recorded = false
		devNightId = null
		window.removeEventListener('resize', onResize)
		loop?.stop()
		loop = null
		renderer = null
		world = null
		hud.value = null
		toasts.value = []
		inspector = null
		selection.clear()
		frameEvents.length = 0
		loudShots = 0
		wake.value = null
		lossCount = 0
		lastLoss = null
		thiefBanner.value = null
		resetEffects()
		interaction?.destroy()
		interaction = null
		debug?.destroy()
		debug = null
		drawOverlay = null
		NoisePanel.value = null
		NightPanel.value = null
		noiseDev.value = null
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

	/* Over the empty board until the progress store has something to build a night from. */
	.waiting {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
	}
</style>
