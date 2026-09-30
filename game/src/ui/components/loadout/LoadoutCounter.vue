<template>
	<!-- One list for all eight spaces, so a tower making way and one arriving are a single animation:
		 the leaving space folds shut while the new one opens, and the rest slide rather than jump. -->
	<TransitionGroup
		tag="ol"
		name="space"
		class="counter"
		:aria-label="t('loadout.counter')"
	>
		<li
			v-for="tower in counter"
			:key="tower.id"
			class="space"
		>
			<button
				type="button"
				class="tower"
				:title="t('loadout.takeBack', { name: t(tower.nameKey) })"
				@click="emit('remove', tower.id)"
			>
				<span
					class="glyph"
					aria-hidden="true"
				>
					<EntityGlyph :glyph="tower.glyph" />
				</span>
				<span class="name">{{ t(tower.nameKey) }}</span>
			</button>
		</li>
		<!-- Keyed by position, so a tower coming off opens the space at the end and one going on closes it. -->
		<li
			v-for="index in emptyCount"
			:key="`empty-${counter.length + index}`"
			class="space empty"
			:aria-label="t('loadout.emptySpace')"
		/>
		<!-- The installation standing in the space: plain text, because its glyph can be a tower's. -->
		<li
			v-for="space in blocked"
			:key="space.id"
			class="space blocked"
			:title="t(space.nameKey)"
			:aria-label="t(space.nameKey)"
		>
			<span
				class="glyph"
				aria-hidden="true"
			>
				{{ space.glyph }}
			</span>
		</li>
	</TransitionGroup>
</template>

<script setup lang="ts">
	import { computed } from 'vue'
	import { useI18n } from 'vue-i18n'
	import EntityGlyph from '@/ui/components/EntityGlyph.vue'
	import type { BlockedSpaceView, CounterTowerView, DefId } from '@/ui/loadoutView.ts'

	/**
	 * The counter itself: the chosen towers left to right in the order they were chosen, the empty
	 * spaces after them, and the spaces an installation is still standing in (step 20aB, decision 6).
	 * No key badges: this is selection order, and the night's keys follow the shop's order.
	 */

	const { counter, slots, blocked } = defineProps<{
		counter: CounterTowerView[]
		slots: number
		blocked: BlockedSpaceView[]
	}>()

	const emit = defineEmits<{
		remove: [id: DefId]
	}>()

	const { t } = useI18n()

	const emptyCount = computed(() => Math.max(0, slots - counter.length))
</script>

<style scoped>
	/* The counter top, in the room's own wood, with the front edge under it. */
	.counter {
		display: flex;
		flex-wrap: wrap;
		row-gap: 0.5rem;
		margin: 0;
		padding: 0.7rem 0.45rem 0.8rem;
		border-bottom: 0.7rem solid var(--kd-day-counter);
		border-radius: var(--kd-radius) var(--kd-radius) 0 0;
		background: var(--kd-day-counter-top);
		list-style: none;
	}

	/* A margin rather than the row's gap: a gap stays put while a space folds to nothing, and the row
	   would jump by it at the end of every swap. */
	.space {
		flex: none;
		width: 6.2rem;
		height: 5.6rem;
		margin: 0 0.25rem;
		border-radius: var(--kd-radius);
	}

	.empty {
		border: 2px dashed rgba(59, 49, 41, 0.28);
	}

	.blocked {
		display: grid;
		place-items: center;
		background: rgba(59, 49, 41, 0.1);
		cursor: help;
	}

	.blocked .glyph {
		font-size: 2.1rem;
		opacity: 0.5;
		filter: grayscale(0.5);
	}

	.tower {
		display: grid;
		grid-template-rows: 1fr auto;
		justify-items: center;
		align-items: center;
		width: 100%;
		height: 100%;
		padding: 0.35rem 0.3rem 0.4rem;
		border: 1px solid var(--kd-day-card-edge);
		border-radius: var(--kd-radius);
		background: var(--kd-day-card);
		color: var(--kd-day-ink);
		font: inherit;
		cursor: pointer;
		box-shadow: 0 0.15rem 0.2rem rgba(59, 49, 41, 0.18);
		transition: border-color 120ms ease;
	}

	.tower:hover,
	.tower:focus-visible {
		border-color: var(--kd-day-danger);
	}

	.tower .glyph {
		font-size: 2rem;
		line-height: 1;
	}

	.name {
		font-size: 0.68rem;
		line-height: 1.2;
		text-align: center;
	}

	/* The swap. A leaving tower lifts off as its space folds shut; an arriving one sets down as its
	   space opens. Both at once, so the row keeps its length. */
	.space-enter-active,
	.space-leave-active {
		overflow: hidden;
		transition:
			width 280ms ease,
			margin 280ms ease,
			opacity 220ms ease,
			transform 280ms ease;
	}

	.space-enter-from,
	.space-leave-to {
		width: 0;
		margin: 0;
		opacity: 0;
	}

	.space-enter-from {
		transform: translateY(0.9rem);
	}

	.space-leave-to {
		transform: translateY(-0.9rem);
	}
</style>
