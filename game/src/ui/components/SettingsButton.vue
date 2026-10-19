<template>
	<button
		type="button"
		class="settings-button"
		:class="tone"
		:title="t('settings.title')"
		:aria-label="t('settings.title')"
		@click="panel.show"
	>
		<FontAwesomeIcon icon="gear" />
	</button>
</template>

<script setup lang="ts">
	import { useI18n } from 'vue-i18n'
	import { useSettingsPanel } from '@/ui/settingsPanel.ts'

	/** The way into settings from the title and the Kitchen. The night's is a chip in `hud/WaveControl.vue`. */

	const { tone = 'night' } = defineProps<{
		/** The title is the night's palette, the Kitchen the day's. */
		tone?: 'night' | 'day'
	}>()

	const { t } = useI18n()
	const panel = useSettingsPanel()
</script>

<style scoped>
	.settings-button {
		display: grid;
		place-items: center;
		width: 2.2rem;
		height: 2.2rem;
		border-radius: var(--kd-radius);
		font: inherit;
		font-size: 0.95rem;
		cursor: pointer;
	}

	.night {
		border: 1px solid var(--kd-panel-edge);
		background: var(--kd-panel);
		color: var(--kd-text-dim);
	}

	.night:hover,
	.night:focus-visible {
		border-color: var(--kd-owned-dim);
		color: var(--kd-text);
	}

	.day {
		border: 1px solid var(--kd-day-card-edge);
		background: var(--kd-day-card);
		color: var(--kd-day-ink-dim);
	}

	.day:hover,
	.day:focus-visible {
		border-color: var(--kd-day-frame);
		color: var(--kd-day-ink);
	}
</style>
