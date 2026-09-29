<template>
	<TopBar
		:clock="snapshot.clock"
		:wave="snapshot.wave"
		:crumbs="snapshot.crumbs"
		:crumbsOnBoard="snapshot.crumbsOnBoard"
		:groceryMoney="snapshot.groceryMoney"
		:food="snapshot.food"
		:noise="snapshot.noise"
		:upcomingThief="snapshot.upcomingThief"
	/>

	<TowerShop
		:entries="snapshot.shop"
		:selectedDefId="armedDefId"
		@select="emit('select', $event)"
	/>

	<TowerInspector
		v-if="snapshot.inspector !== null"
		:inspector="snapshot.inspector"
		@sell="emit('sell', $event)"
		@upgrade="emit('upgrade', $event)"
		@setTargetingMode="(towerId, mode) => emit('setTargetingMode', towerId, mode)"
	/>

	<EnemyTooltip
		v-if="snapshot.enemyTooltip !== null"
		:tooltip="snapshot.enemyTooltip"
	/>

	<WaveControl
		:phase="snapshot.phase"
		:countdownTicks="snapshot.countdownTicks"
		:earlyCallBonus="snapshot.earlyCallBonus"
		:speed="snapshot.speed"
		:paused="snapshot.paused"
		@callWave="emit('callWave')"
		@setSpeed="emit('setSpeed', $event)"
		@togglePause="emit('togglePause')"
	/>

	<WakeCard
		v-if="wake !== null"
		:wake="wake"
	/>

	<ThiefCard
		v-if="thiefBanner !== null"
		:banner="thiefBanner"
	/>

	<ToastStack :toasts="toasts" />

	<NightSummary
		v-if="snapshot.summary !== null"
		:summary="snapshot.summary"
		:canContinue="canContinue"
		@retry="emit('retry')"
		@continueNight="emit('continueNight')"
	/>
</template>

<script setup lang="ts">
	import { computed } from 'vue'
	import EnemyTooltip from '@/ui/components/hud/EnemyTooltip.vue'
	import NightSummary from '@/ui/components/hud/NightSummary.vue'
	import ThiefCard from '@/ui/components/hud/ThiefCard.vue'
	import ToastStack from '@/ui/components/hud/ToastStack.vue'
	import TopBar from '@/ui/components/hud/TopBar.vue'
	import TowerInspector from '@/ui/components/hud/TowerInspector.vue'
	import TowerShop from '@/ui/components/hud/TowerShop.vue'
	import WakeCard from '@/ui/components/hud/WakeCard.vue'
	import WaveControl from '@/ui/components/hud/WaveControl.vue'
	import type { Selection } from '@/ui/selection.ts'
	import type {
		DefId,
		EntityId,
		HudSnapshot,
		Speed,
		TargetingMode,
		ThiefBannerView,
		WakeView,
	} from '@/ui/viewModel.ts'

	/**
	 * The whole interface, laid out over the board.
	 *
	 * It composes and re-emits, and does nothing else: no command queue, no world, no `core/` import
	 * anywhere under `ui/components/hud/`. Step 8C binds these events to the queue, which is the only
	 * write path into the simulation (ARCHITECTURE.md section 3).
	 *
	 * `GameView.vue` mounts this and nothing else -- it already owns the canvas, the loop, the world
	 * and the dev imports, and it is the most load-bearing file in the repo.
	 */

	const {
		snapshot,
		selection,
		toasts = [],
		wake = null,
		thiefBanner = null,
		canContinue = true,
	} = defineProps<{
		snapshot: HudSnapshot
		selection: Selection
		toasts?: { id: number; messageKey: string }[]
		/**
		 * The last wake, or null. A prop rather than a field of `snapshot` for the same reason `toasts`
		 * is one: it is a one-tick event with a payload the world no longer has, and the snapshot is
		 * rebuilt from the world at 15Hz (step 13B, decision 1).
		 */
		wake?: WakeView | null
		/** The Mouse's announcement, or null. A prop for `wake`'s reason: it is said once, off an event. */
		thiefBanner?: ThiefBannerView | null
		/** False on the last authored night. `GameView.vue` steps through `NIGHTS` and stops. */
		canContinue?: boolean
	}>()

	const emit = defineEmits<{
		select: [defId: DefId]
		sell: [towerId: EntityId]
		upgrade: [towerId: EntityId]
		setTargetingMode: [towerId: EntityId, mode: TargetingMode]
		callWave: []
		setSpeed: [speed: Speed]
		togglePause: []
		retry: []
		continueNight: []
	}>()

	/** The only reactive field of `Selection` the HUD reads. The hover fields are plain on purpose. */
	const armedDefId = computed(() => selection.selectedDefId.value)
</script>
