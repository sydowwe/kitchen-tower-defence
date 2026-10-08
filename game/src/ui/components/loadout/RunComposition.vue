<template>
	<section class="night">
		<h2 class="title">{{ t('endless.title', { map: t(run.mapNameKey) }) }}</h2>
		<p class="where">
			{{ run.best === null ? t('endless.noBest') : t('endless.best', { n: run.best }) }}
		</p>
		<MapShape :shape="run.map" />
		<p class="line">{{ t('endless.line') }}</p>

		<h3>{{ t('endless.coming') }}</h3>
		<EnemyList :enemies="run.enemies" />
	</section>
</template>

<script setup lang="ts">
	import { useI18n } from 'vue-i18n'
	import EnemyList from '@/ui/components/loadout/EnemyList.vue'
	import MapShape from '@/ui/components/MapShape.vue'
	import type { RunPreviewView } from '@/ui/loadoutView.ts'

	/**
	 * A long night on one map: the map, the best got on it at this tier, and everything that comes in,
	 * once each, with the wave it first does. No counts -- see `poolOf`.
	 */

	const { run } = defineProps<{
		run: RunPreviewView
	}>()

	const { t } = useI18n()
</script>

<style scoped>
	.night {
		display: grid;
		align-content: start;
		gap: 0.5rem;
		padding: 1rem 1.1rem;
		border: 1px solid var(--kd-day-card-edge);
		border-radius: 0.75rem;
		background: var(--kd-day-card);
		color: var(--kd-day-ink);
	}

	.title {
		margin: 0;
		font-size: 1.15rem;
		font-weight: 600;
	}

	.where,
	.line {
		margin: 0;
		color: var(--kd-day-ink-dim);
		font-size: 0.85rem;
	}

	.line {
		font-style: italic;
	}

	h3 {
		margin: 0.4rem 0 0;
		color: var(--kd-day-ink-dim);
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
</style>
