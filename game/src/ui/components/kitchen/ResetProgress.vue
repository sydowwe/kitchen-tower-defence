<template>
	<div class="reset">
		<button
			v-if="!open"
			type="button"
			class="link"
			:disabled="busy"
			@click="open = true"
		>
			{{ t('kitchen.reset.open') }}
		</button>

		<div
			v-else
			class="confirm"
			role="alertdialog"
			:aria-label="t('kitchen.reset.question')"
		>
			<p class="question">{{ t('kitchen.reset.question') }}</p>

			<p
				v-if="failed"
				class="failed"
			>
				{{ t('kitchen.reset.failed') }}
			</p>

			<div class="actions">
				<button
					type="button"
					class="action"
					:disabled="saving"
					@click="open = false"
				>
					{{ t('kitchen.reset.cancel') }}
				</button>
				<button
					type="button"
					class="action danger"
					:disabled="busy"
					@click="onConfirm"
				>
					{{ confirmLabel }}
				</button>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { computed } from 'vue'
	import { useI18n } from 'vue-i18n'

	/**
	 * Starting the campaign over, behind an inline confirmation rather than `window.confirm`, which
	 * blocks the tab and cannot be styled. Its saving and failed states come from the store through the
	 * parent, like a card's; `open` is the parent's so it can close the question once the reset lands.
	 */

	const {
		busy = false,
		saving = false,
		failed = false,
	} = defineProps<{
		/** Any save in flight. */
		busy?: boolean
		/** The reset is the save in flight. */
		saving?: boolean
		/** The reset is the save that failed. */
		failed?: boolean
	}>()

	const emit = defineEmits<{
		reset: []
		retry: []
	}>()

	const open = defineModel<boolean>('open', { default: false })

	const { t } = useI18n()

	/** After a failure the same button re-sends the unsaved reset rather than building a second one. */
	function onConfirm(): void {
		if (failed) {
			emit('retry')
		} else {
			emit('reset')
		}
	}

	const confirmLabel = computed(() => {
		if (saving) {
			return t('kitchen.reset.saving')
		}
		return t(failed ? 'kitchen.reset.retry' : 'kitchen.reset.confirm')
	})
</script>

<style scoped>
	.reset {
		color: var(--kd-day-ink);
	}

	.link {
		padding: 0;
		border: none;
		background: none;
		color: var(--kd-day-ink-dim);
		font: inherit;
		font-size: 0.8rem;
		text-decoration: underline;
		cursor: pointer;
	}

	.link:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.confirm {
		display: grid;
		gap: 0.5rem;
		max-width: 22rem;
		padding: 0.8rem 0.9rem;
		border: 1px solid var(--kd-day-danger);
		border-radius: 0.6rem;
		background: var(--kd-day-card);
	}

	.question {
		margin: 0;
		font-size: 0.9rem;
	}

	.failed {
		margin: 0;
		color: var(--kd-day-danger);
		font-size: 0.8rem;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	.action {
		flex: 1;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--kd-day-card-edge);
		border-radius: var(--kd-radius);
		background: transparent;
		color: var(--kd-day-ink);
		font: inherit;
		font-size: 0.8rem;
		cursor: pointer;
	}

	.action.danger {
		border-color: var(--kd-day-danger);
		background: var(--kd-day-danger);
		color: var(--kd-day-card);
	}

	.action:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
