<template>
	<section class="night">
		<h2 class="title">{{ t('kitchen.preview.title', { n: preview.night }) }}</h2>
		<p class="where">
			{{ t('kitchen.preview.where', { map: t(preview.mapNameKey), waves: preview.waveCount }) }}
		</p>
		<MapShape :shape="preview.map" />

		<ModifierNote
			v-if="preview.modifier !== null"
			:modifier="preview.modifier"
		/>

		<h3>{{ t('loadout.coming') }}</h3>
		<EnemyList
			:enemies="preview.enemies"
			:newIds="introduced"
		/>
	</section>
</template>

<script setup lang="ts">
	import { computed } from 'vue'
	import { useI18n } from 'vue-i18n'
	import EnemyList from '@/ui/components/loadout/EnemyList.vue'
	import MapShape from '@/ui/components/MapShape.vue'
	import ModifierNote from '@/ui/components/ModifierNote.vue'
	import type { NightPreviewView } from '@/ui/kitchenView.ts'

	/**
	 * Everything tonight sends, once each, in the order it first turns up, with every tag the tooltip
	 * would print, the map's shape and the night's modifier. This is what the counter is chosen from
	 * (DECISIONS.md section 10), so it is the whole night and not only what is new.
	 */

	const { preview } = defineProps<{
		preview: NightPreviewView
	}>()

	const { t } = useI18n()

	const introduced = computed(() => preview.introduces.map(entry => entry.id))
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

	.where {
		margin: 0;
		color: var(--kd-day-ink-dim);
		font-size: 0.85rem;
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
