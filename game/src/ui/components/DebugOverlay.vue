<template>
	<div class="overlay">
		<dl>
			<dt>{{ t('debug.fps') }}</dt>
			<dd>{{ Math.round(fps) }}</dd>
			<dt>{{ t('debug.ticks') }}</dt>
			<dd>{{ tickCount }}</dd>
			<dt>{{ t('debug.simTime') }}</dt>
			<dd>{{ simSeconds.toFixed(1) }}s</dd>
			<dt>{{ t('debug.entities') }}</dt>
			<dd>{{ entityCount }}</dd>
			<dt>{{ t('debug.speed') }}</dt>
			<dd :class="{ paused }">{{ paused ? t('debug.paused') : `${speed}×` }}</dd>
		</dl>
		<p class="hint">{{ t('debug.hint') }}</p>
	</div>
</template>

<script setup lang="ts">
	import { useI18n } from 'vue-i18n'

	const {
		fps = 0,
		tickCount = 0,
		simSeconds = 0,
		entityCount = 0,
		speed = 1,
		paused = false,
	} = defineProps<{
		fps?: number
		tickCount?: number
		simSeconds?: number
		entityCount?: number
		speed?: number
		paused?: boolean
	}>()

	const { t } = useI18n()
</script>

<style scoped>
	/* The HUD layer is pointer-events: none; this panel does not opt back in -- it is read-only. */
	.overlay {
		position: absolute;
		top: 0.75rem;
		left: 0.75rem;
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		background: rgba(16, 19, 31, 0.72);
		color: var(--kd-text-dim);
		font-family: ui-monospace, 'Cascadia Mono', monospace;
		font-size: 0.75rem;
		line-height: 1.4;
	}

	dl {
		display: grid;
		grid-template-columns: auto auto;
		gap: 0 0.75rem;
		margin: 0;
	}

	dt {
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	dd {
		margin: 0;
		color: var(--kd-lamp);
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	dd.paused {
		color: var(--kd-text-dim);
	}

	.hint {
		margin: 0.4rem 0 0;
		opacity: 0.7;
	}
</style>
