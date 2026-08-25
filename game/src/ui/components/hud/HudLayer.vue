<template>
	<TopBar
		:clock="snapshot.clock"
		:wave="snapshot.wave"
		:crumbs="snapshot.crumbs"
		:crumbsOnBoard="snapshot.crumbsOnBoard"
		:groceryMoney="snapshot.groceryMoney"
		:food="snapshot.food"
		:noise="snapshot.noise"
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
		@setTargetingMode="(towerId, mode) => emit('setTargetingMode', towerId, mode)"
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
	import NightSummary from '@/ui/components/hud/NightSummary.vue'
	import ToastStack from '@/ui/components/hud/ToastStack.vue'
	import TopBar from '@/ui/components/hud/TopBar.vue'
	import TowerInspector from '@/ui/components/hud/TowerInspector.vue'
	import TowerShop from '@/ui/components/hud/TowerShop.vue'
	import WaveControl from '@/ui/components/hud/WaveControl.vue'
	import type { Selection } from '@/ui/selection.ts'
	import type { DefId, EntityId, HudSnapshot, Speed, TargetingMode } from '@/ui/viewModel.ts'

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
		canContinue = true,
	} = defineProps<{
		snapshot: HudSnapshot
		selection: Selection
		toasts?: { id: number; messageKey: string }[]
		/** False on the last authored night. `GameView.vue` steps through `NIGHTS` and stops. */
		canContinue?: boolean
	}>()

	const emit = defineEmits<{
		select: [defId: DefId]
		sell: [towerId: EntityId]
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
