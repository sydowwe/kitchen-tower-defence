<template>
	<section class="preview">
		<template v-if="preview !== null">
			<h2 class="title">{{ t('kitchen.preview.title', { n: preview.night }) }}</h2>
			<p class="where">
				{{ t('kitchen.preview.where', { map: t(preview.mapNameKey), waves: preview.waveCount }) }}
			</p>

			<div
				v-if="preview.unlocks.length > 0"
				class="group"
			>
				<h3>{{ t('kitchen.preview.unlocks') }}</h3>
				<ul>
					<li
						v-for="entry in preview.unlocks"
						:key="entry.id"
					>
						<span aria-hidden="true"><EntityGlyph :glyph="entry.glyph" /></span>
						{{ t(entry.nameKey) }}
					</li>
				</ul>
			</div>

			<div
				v-if="preview.introduces.length > 0"
				class="group"
			>
				<h3>{{ t('kitchen.preview.introduces') }}</h3>
				<ul>
					<li
						v-for="entry in preview.introduces"
						:key="entry.id"
					>
						<span aria-hidden="true"><EntityGlyph :glyph="entry.glyph" /></span>
						{{ t(entry.nameKey) }}
					</li>
				</ul>
			</div>

			<button
				type="button"
				class="start"
				:disabled="busy"
				@click="emit('start')"
			>
				{{ t('kitchen.preview.start') }}
			</button>
		</template>

		<p
			v-else
			class="finished"
		>
			{{ t('kitchen.preview.finished') }}
		</p>
	</section>
</template>

<script setup lang="ts">
	import { useI18n } from 'vue-i18n'
	import EntityGlyph from '@/ui/components/EntityGlyph.vue'
	import type { NightPreviewView } from '@/ui/kitchenView.ts'

	/**
	 * What tomorrow night brings, and the way to the counter before it. Only what is new: the loadout
	 * screen lists the whole night. A finished campaign has neither.
	 */

	const { preview, busy = false } = defineProps<{
		preview: NightPreviewView | null
		/** A save in flight. The loadout screen is built from progress, so it waits for the progress to land. */
		busy?: boolean
	}>()

	const emit = defineEmits<{
		start: []
	}>()

	const { t } = useI18n()
</script>

<style scoped>
	.preview {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
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

	.group h3 {
		margin: 0 0 0.25rem;
		color: var(--kd-day-ink-dim);
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.group ul {
		display: grid;
		gap: 0.2rem;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: 0.9rem;
	}

	.start {
		margin-top: auto;
		padding: 0.65rem 1rem;
		border: none;
		border-radius: var(--kd-radius);
		background: var(--kd-night);
		color: var(--kd-lamp);
		font: inherit;
		font-size: 0.95rem;
		cursor: pointer;
	}

	.start:hover,
	.start:focus-visible {
		background: var(--kd-night-soft);
	}

	.start:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.finished {
		margin: auto 0;
		color: var(--kd-day-ink);
		font-size: 1rem;
		line-height: 1.5;
	}
</style>
