<template>
	<label class="npk">
		<span class="npk-head">Night</span>
		<select
			class="npk-select"
			:value="current"
			@change="onChange"
		>
			<option
				v-for="night in NIGHTS"
				:key="night.id"
				:value="night.id"
			>
				{{ night.index }}
			</option>
		</select>
	</label>
</template>

<script setup lang="ts">
	import { NIGHTS } from '@/core/content/index.ts'

	/**
	 * Jump straight to any authored night instead of clicking Continue through every one before it.
	 *
	 * **Dev only, and it ships nothing** -- `GameView.vue` imports it dynamically inside an
	 * `import.meta.env.DEV` branch, exactly like `dev/noise/NoisePanel.vue`. Literals rather than i18n
	 * keys for the same reason that panel gives.
	 *
	 * A picked night is an override of the campaign's: `GameView.vue` builds it with every tower
	 * available and records nothing, so jumping to night 14 costs the save nothing.
	 */

	const { current } = defineProps<{
		/** The id of the night on the board, so Retry keeps the picker honest. Null before the first world. */
		current: string | null
	}>()

	const emit = defineEmits<{
		pick: [nightId: string]
	}>()

	function onChange(event: Event): void {
		emit('pick', (event.target as HTMLSelectElement).value)
	}
</script>

<style scoped>
	/*
		Top-right corner: the only one nothing else owns. The debug overlay and the noise panel hold the
		left edge, the top bar is centred, and the tower inspector starts at 3.5rem on the right. On the
		Counter this sits over the wall row, above the fridge.

		The HUD layer is `pointer-events: none`, so the control opts back in.
	*/
	.npk {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0.5rem;
		border-radius: 0.5rem;
		background: rgba(16, 19, 31, 0.82);
		color: var(--kd-text-dim);
		font-family: ui-monospace, 'Cascadia Mono', monospace;
		font-size: 0.7rem;
		pointer-events: auto;
	}

	.npk-head {
		color: var(--kd-lamp);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.npk-select {
		border: 1px solid var(--kd-panel-edge);
		border-radius: var(--kd-radius);
		background: var(--kd-panel);
		color: var(--kd-text);
		font: inherit;
		cursor: pointer;
	}
</style>
