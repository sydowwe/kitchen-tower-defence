<template>
	<!--
		Keyed on the id, so each card arrives with its own fade rather than swapping text under the last
		one's. The card owns no timer: `ui/hints.ts` decides how long it stays, in ticks, so a paused night
		holds it up.
	-->
	<aside
		:key="hint.id"
		class="hint"
		:class="{ prompt: isPrompt }"
		role="status"
	>
		<div class="text">
			<span class="title">{{ t(`hints.${hint.id}.title`) }}</span>
			<span class="line">{{ t(`hints.${hint.id}.line`) }}</span>
		</div>
		<button
			type="button"
			class="dismiss"
			:title="t('hints.dismiss')"
			:aria-label="t('hints.dismiss')"
			@click="emit('dismiss')"
		>
			<FontAwesomeIcon icon="xmark" />
		</button>
	</aside>
</template>

<script setup lang="ts">
	import { computed } from 'vue'
	import { useI18n } from 'vue-i18n'
	import type { ShowingHint } from '@/ui/hints.ts'

	/**
	 * One prompt or one first-time line (step 23F). Never modal: it sits in a corner of its own, nothing
	 * behind it stops taking clicks, and the only thing in it that takes a pointer is its own dismiss.
	 */

	const { hint } = defineProps<{ hint: ShowingHint }>()

	const emit = defineEmits<{ dismiss: [] }>()

	const { t } = useI18n()

	/** Night 1's prompts sit a little brighter than the lines that come after them. */
	const isPrompt = computed(() => hint.id.startsWith('tutorial.'))
</script>

<style scoped>
	/*
		Its own slot, on the left under the top bar's height: the wake card and the banner slot are in the
		middle, the inspector on the right, the shop and the toasts at the bottom.
	*/
	.hint {
		position: absolute;
		top: 3.5rem;
		left: 0.75rem;
		display: flex;
		align-items: flex-start;
		gap: 0.4rem;
		max-width: 17rem;
		padding: 0.5rem 0.4rem 0.55rem 0.75rem;
		border: 1px solid var(--kd-panel-edge);
		border-radius: var(--kd-radius);
		background: var(--kd-panel);
		animation: hint-in 0.4s ease-out both;
		pointer-events: none;
	}

	.prompt {
		border-color: var(--kd-lamp);
	}

	.text {
		display: grid;
		gap: 0.2rem;
	}

	.title {
		color: var(--kd-text);
		font-size: 0.85rem;
	}

	.prompt .title {
		color: var(--kd-lamp);
	}

	.line {
		color: var(--kd-text-dim);
		font-size: 0.76rem;
		line-height: 1.35;
	}

	.dismiss {
		flex: none;
		padding: 0.1rem 0.35rem;
		border: 1px solid transparent;
		border-radius: var(--kd-radius);
		background: transparent;
		color: var(--kd-text-dim);
		font: inherit;
		font-size: 0.75rem;
		cursor: pointer;
		pointer-events: auto;
	}

	.dismiss:hover,
	.dismiss:focus-visible {
		border-color: var(--kd-panel-edge);
		color: var(--kd-text);
	}

	@keyframes hint-in {
		from {
			opacity: 0;
			transform: translateX(-0.3rem);
		}

		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.hint {
			animation: none;
		}
	}
</style>
