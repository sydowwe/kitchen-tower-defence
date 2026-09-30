<template>
	<p
		class="sync"
		role="status"
	>
		<span
			class="dot"
			aria-hidden="true"
		/>
		{{ t(`kitchen.sync.${status}`) }}
	</p>
</template>

<script setup lang="ts">
	import { useI18n } from 'vue-i18n'
	import { useSync } from '@/ui/composables/useSync.ts'

	/**
	 * Where the save lives (analytic-docs/PERSISTENCE.md section 4). One state in v1, so one line. The
	 * key follows `useSync().status`, so each status sync adds needs its line in `kitchen.sync`.
	 */

	const { t } = useI18n()
	const { status } = useSync()
</script>

<style scoped>
	.sync {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0;
		color: var(--kd-day-ink-dim);
		font-size: 0.75rem;
	}

	.dot {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: var(--kd-day-owned);
	}
</style>
