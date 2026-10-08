<template>
	<section class="offer">
		<h2 class="title">{{ t('endless.offerTitle') }}</h2>
		<p class="line">{{ t('endless.offerLine') }}</p>

		<ul class="maps">
			<li
				v-for="entry in entries"
				:key="entry.mapId"
			>
				<button
					type="button"
					class="map"
					:disabled="busy"
					@click="emit('pick', entry.mapId)"
				>
					<span class="shape">
						<MapShape :shape="entry.map" />
					</span>
					<span class="name">{{ t(entry.mapNameKey) }}</span>
					<span class="best">
						{{ entry.best === null ? t('endless.noBest') : t('endless.best', { n: entry.best }) }}
					</span>
				</button>
			</li>
		</ul>
	</section>
</template>

<script setup lang="ts">
	import { useI18n } from 'vue-i18n'
	import MapShape from '@/ui/components/MapShape.vue'
	import type { DefId, EndlessEntryView } from '@/ui/kitchenView.ts'

	/**
	 * A long night on any of the six maps, once the kitchen has been beaten: each map drawn small, with
	 * the best this tier has managed on it. Picking one opens that map's counter.
	 */

	const { entries, busy = false } = defineProps<{
		entries: EndlessEntryView[]
		/** A save in flight. The counter is built from progress, so it waits for the progress to land. */
		busy?: boolean
	}>()

	const emit = defineEmits<{
		pick: [mapId: DefId]
	}>()

	const { t } = useI18n()
</script>

<style scoped>
	.offer {
		display: grid;
		gap: 0.6rem;
		padding: 1rem 1.1rem;
		border: 1px solid var(--kd-day-card-edge);
		border-radius: 0.75rem;
		background: var(--kd-day-card);
		color: var(--kd-day-ink);
	}

	.title {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 600;
	}

	.line {
		margin: 0;
		color: var(--kd-day-ink-dim);
		font-size: 0.85rem;
	}

	.maps {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
		gap: 0.6rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.map {
		display: grid;
		gap: 0.25rem;
		width: 100%;
		padding: 0.5rem;
		border: 1px solid var(--kd-day-card-edge);
		border-radius: var(--kd-radius);
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.map:hover,
	.map:focus-visible {
		border-color: var(--kd-day-owned);
	}

	.map:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.name {
		font-size: 0.85rem;
		font-weight: 600;
	}

	.best {
		color: var(--kd-day-ink-dim);
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
	}
</style>
