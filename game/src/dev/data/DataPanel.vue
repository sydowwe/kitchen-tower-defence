<template>
	<div class="dpn">
		<span class="dpn-head">Data · {{ mode }}</span>
		<template v-if="mode === 'mock'">
			<button
				v-for="option in RATES"
				:key="option"
				type="button"
				class="dpn-rate"
				:class="{ on: rate === option }"
				@click="pick(option)"
			>
				fail {{ Math.round(option * 100) }}%
			</button>
		</template>
		<span v-else>no failures outside mock</span>
	</div>
</template>

<script setup lang="ts">
	import { ref } from 'vue'
	import { dataLayer, setMockFailureRate } from '@/data/index.ts'

	/**
	 * The mock remote's failure rate, flipped between the default and always
	 * (analytic-docs/PERSISTENCE.md section 2, *Rule 2*). At 100% every screen's error state and retry
	 * can be walked through by hand; back at 5%, the retry should land.
	 *
	 * **Dev only, and it ships nothing** -- `TitleView.vue` and `KitchenView.vue` import it dynamically inside an
	 * `import.meta.env.DEV` branch, like `dev/noise/NoisePanel.vue`. Literals rather than i18n keys for
	 * that panel's reason.
	 */

	const RATES = [0.05, 1] as const

	const layer = dataLayer()
	const mode = layer.mode
	const rate = ref(layer.mock?.failureRate ?? 0)

	function pick(option: number): void {
		setMockFailureRate(option)
		rate.value = option
	}
</script>

<style scoped>
	.dpn {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0.5rem;
		border-radius: 0.5rem;
		background: rgba(16, 19, 31, 0.82);
		color: var(--kd-text-dim);
		font-family: ui-monospace, 'Cascadia Mono', monospace;
		font-size: 0.7rem;
	}

	.dpn-head {
		color: var(--kd-lamp);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.dpn-rate {
		border: 1px solid var(--kd-panel-edge);
		border-radius: var(--kd-radius);
		background: var(--kd-panel);
		color: var(--kd-text-dim);
		font: inherit;
		cursor: pointer;
	}

	.dpn-rate.on {
		border-color: var(--kd-lamp);
		color: var(--kd-lamp);
	}
</style>
