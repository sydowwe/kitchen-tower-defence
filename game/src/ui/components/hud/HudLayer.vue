<template>
	<TopBar
		:clock="snapshot.clock"
		:difficulty="snapshot.difficulty"
		:modifier="snapshot.modifier"
		:wave="snapshot.wave"
		:crumbs="snapshot.crumbs"
		:crumbsOnBoard="snapshot.crumbsOnBoard"
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
		:sellKey="snapshot.keys.sell"
		:upgradeKey="snapshot.keys.upgrade"
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
		:callWaveKey="snapshot.keys.callWave"
		@callWave="emit('callWave')"
		@setSpeed="emit('setSpeed', $event)"
		@togglePause="emit('togglePause')"
		@openSettings="emit('openSettings')"
	/>

	<WakeCard
		v-if="wake !== null"
		:wake="wake"
	/>

	<!--
		One banner slot (step 23B, decision 6). `GameView.vue` keeps at most one of the thief's and the wave's
		set, so a wave's card replaces the one before it; either replaces the modifier's, which has said its
		piece at the night's start and lives on in the top bar's chip.
	-->
	<ThiefCard
		v-if="thiefBanner !== null"
		:banner="thiefBanner"
	/>
	<WaveBanner
		v-else-if="waveBanner !== null"
		:banner="waveBanner"
	/>
	<ModifierCard
		v-else-if="modifierBanner !== null"
		:banner="modifierBanner"
	/>

	<HintCard
		v-if="hint !== null && snapshot.summary === null"
		:hint="hint"
		@dismiss="emit('dismissHint')"
	/>

	<ToastStack :toasts="toasts" />

	<NightSummary
		v-if="snapshot.summary !== null"
		:summary="snapshot.summary"
		:previousBest="previousBest"
		:saveState="saveState"
		@retry="emit('retry')"
		@continueNight="emit('continueNight')"
		@retrySave="emit('retrySave')"
	/>
</template>

<script setup lang="ts">
	import { computed } from 'vue'
	import EnemyTooltip from '@/ui/components/hud/EnemyTooltip.vue'
	import HintCard from '@/ui/components/hud/HintCard.vue'
	import ModifierCard from '@/ui/components/hud/ModifierCard.vue'
	import NightSummary from '@/ui/components/hud/NightSummary.vue'
	import ThiefCard from '@/ui/components/hud/ThiefCard.vue'
	import ToastStack from '@/ui/components/hud/ToastStack.vue'
	import TopBar from '@/ui/components/hud/TopBar.vue'
	import TowerInspector from '@/ui/components/hud/TowerInspector.vue'
	import TowerShop from '@/ui/components/hud/TowerShop.vue'
	import WakeCard from '@/ui/components/hud/WakeCard.vue'
	import WaveBanner from '@/ui/components/hud/WaveBanner.vue'
	import WaveControl from '@/ui/components/hud/WaveControl.vue'
	import type { ShowingHint } from '@/ui/hints.ts'
	import type { Selection } from '@/ui/selection.ts'
	import type {
		DefId,
		EntityId,
		HudSnapshot,
		ModifierBannerView,
		Speed,
		TargetingMode,
		ThiefBannerView,
		WakeView,
		WaveBannerView,
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
		waveBanner = null,
		modifierBanner = null,
		hint = null,
		previousBest = null,
		saveState = 'saved',
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
		/** Every other wave's line as it starts, or null. A prop for `thiefBanner`'s reason. */
		waveBanner?: WaveBannerView | null
		/** Tonight's modifier, said as the night opens, or null on a plain night. Built once per world. */
		modifierBanner?: ModifierBannerView | null
		/** Night 1's prompt or a first-time line, or null. A prop for `wake`'s reason: `ui/hints.ts` picks it. */
		hint?: ShowingHint | null
		/**
		 * In a run, this tier's best on the map from before it started, or null for none. A prop because it
		 * is the save's, not the world's -- and read before this run's best lands on it.
		 */
		previousBest?: number | null
		/** Where the night's result is on its way to the save. Only the summary reads it. */
		saveState?: 'saving' | 'saved' | 'failed'
	}>()

	const emit = defineEmits<{
		select: [defId: DefId]
		sell: [towerId: EntityId]
		upgrade: [towerId: EntityId]
		setTargetingMode: [towerId: EntityId, mode: TargetingMode]
		callWave: []
		setSpeed: [speed: Speed]
		togglePause: []
		openSettings: []
		retry: []
		continueNight: []
		retrySave: []
		dismissHint: []
	}>()

	/** The only reactive field of `Selection` the HUD reads. The hover fields are plain on purpose. */
	const armedDefId = computed(() => selection.selectedDefId.value)
</script>
