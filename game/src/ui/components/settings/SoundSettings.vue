<template>
	<section class="section">
		<h3>{{ t('settings.sound') }}</h3>
		<label
			v-for="bus in BUSES"
			:key="bus"
			class="slider"
		>
			<span>{{ t(`settings.volume.${bus}`) }}</span>
			<input
				type="range"
				min="0"
				max="100"
				step="1"
				:value="Math.round(store.settings.volumes[bus] * 100)"
				@input="onInput(bus, $event)"
			/>
		</label>
	</section>
</template>

<script setup lang="ts">
	import { useI18n } from 'vue-i18n'
	import { BUSES, type Bus } from '@/ui/composables/useSettings.ts'
	import { useSettingsStore } from '@/ui/stores/settings.ts'

	/**
	 * One slider per bus. On `input`, not `change`, so the sound follows the drag: the store assigns at
	 * once and debounces the save, and the applier in `ui/App.vue` does the rest.
	 */

	const { t } = useI18n()
	const store = useSettingsStore()

	function onInput(bus: Bus, event: Event): void {
		if (event.target instanceof HTMLInputElement) {
			store.setVolume(bus, Number(event.target.value) / 100)
		}
	}
</script>

<style scoped>
	.slider {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 9rem;
		align-items: center;
		gap: 0.8rem;
		font-size: 0.82rem;
	}

	input {
		width: 100%;
		accent-color: var(--kd-owned);
	}
</style>
