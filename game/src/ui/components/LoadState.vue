<template>
	<div
		class="load"
		:role="failed ? 'alert' : 'status'"
	>
		<p class="line">{{ t(failed ? 'load.failed' : 'load.loading') }}</p>
		<button
			v-if="failed"
			type="button"
			class="retry"
			@click="emit('retry')"
		>
			{{ t('load.retry') }}
		</button>
	</div>
</template>

<script setup lang="ts">
	import { useI18n } from 'vue-i18n'

	/**
	 * What every screen shows while the progress store loads, and when it fails. The screens call
	 * `ensureLoaded()` themselves (step 20D, decision 2), so this is the one place the two states look
	 * alike.
	 */

	const { failed = false } = defineProps<{
		failed?: boolean
	}>()

	const emit = defineEmits<{
		retry: []
	}>()

	const { t } = useI18n()
</script>

<style scoped>
	.load {
		display: grid;
		justify-items: center;
		gap: 0.7rem;
		padding: 1.2rem 1.6rem;
		border: 1px solid var(--kd-panel-edge);
		border-radius: 0.75rem;
		background: var(--kd-panel-raise);
		color: var(--kd-text-dim);
		pointer-events: auto;
	}

	.line {
		margin: 0;
		font-size: 0.9rem;
	}

	.retry {
		padding: 0.45rem 1rem;
		border: 1px solid var(--kd-owned-dim);
		border-radius: var(--kd-radius);
		background: var(--kd-panel);
		color: var(--kd-owned);
		font: inherit;
		font-size: 0.8rem;
		cursor: pointer;
	}

	.retry:hover,
	.retry:focus-visible {
		color: var(--kd-text);
	}
</style>
