<template>
	<section class="section">
		<h3>{{ t('settings.screen') }}</h3>
		<label class="toggle">
			<input
				v-model="screenShake"
				type="checkbox"
			/>
			<span>{{ t('settings.screenShake') }}</span>
		</label>
		<label class="toggle">
			<input
				v-model="damageNumbers"
				type="checkbox"
			/>
			<span>{{ t('settings.damageNumbers') }}</span>
		</label>
		<label class="toggle">
			<input
				v-model="colourblind"
				type="checkbox"
			/>
			<span>
				{{ t('settings.palette') }}
				<small>{{ t('settings.paletteNote') }}</small>
			</span>
		</label>
	</section>
</template>

<script setup lang="ts">
	import { computed } from 'vue'
	import { useI18n } from 'vue-i18n'
	import { useSettingsStore } from '@/ui/stores/settings.ts'

	/** The three switches on what is drawn. Each writes the store; the applier in `ui/App.vue` does the rest. */

	const { t } = useI18n()
	const store = useSettingsStore()

	const screenShake = computed({
		get: () => store.settings.screenShake,
		set: value => store.update({ screenShake: value }),
	})

	const damageNumbers = computed({
		get: () => store.settings.damageNumbers,
		set: value => store.update({ damageNumbers: value }),
	})

	const colourblind = computed({
		get: () => store.settings.palette === 'colourblind',
		set: value => store.update({ palette: value ? 'colourblind' : 'standard' }),
	})
</script>

<style scoped>
	.toggle {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		font-size: 0.82rem;
		cursor: pointer;
	}

	input {
		accent-color: var(--kd-owned);
	}

	small {
		display: block;
		margin-top: 0.15rem;
		color: var(--kd-text-dim);
		font-size: 0.74rem;
	}
</style>
