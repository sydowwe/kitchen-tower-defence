<template>
	<!--
		The one wrapper in the HUD allowed to take pointer events. Every other panel opts in on the
		control itself, because a wrapper swallows the crumb clicks behind it -- which is exactly what
		this one is for: the night is over, and nothing on the board is clickable any more.
	-->
	<div class="backdrop">
		<section class="summary">
			<h2>{{ t(summary.won ? 'night.wonTitle' : 'night.lostTitle') }}</h2>
			<p class="subtitle">{{ t(summary.won ? 'night.wonSubtitle' : 'night.lostSubtitle') }}</p>

			<!-- The emotional payload (DECISIONS.md section 6): a sentence with the names in it. Not a
				 table row, and never collapsed into a count. -->
			<p class="lost">{{ lostSentence }}</p>

			<dl class="tally">
				<dt>{{ t('night.wavesSurvived', { survived: summary.wavesSurvived, total: summary.waveCount }) }}</dt>
				<dt>{{ t('night.foodRemaining', { n: summary.foodRemaining }) }}</dt>
				<dt>{{ t('night.enemiesKilled', { n: summary.enemiesKilled }) }}</dt>
				<dt>
					{{
						t('night.crumbsCollected', {
							collected: summary.crumbsCollected,
							dropped: summary.crumbsDropped,
						})
					}}
				</dt>
				<!-- Step 20 pays the night out and writes the breakdown behind this line. -->
				<dt class="stub">{{ t('night.groceryMoney', { n: 0 }) }}</dt>
			</dl>

			<div class="actions">
				<button
					type="button"
					class="action"
					@click="emit('retry')"
				>
					{{ t('night.retry') }}
				</button>
				<button
					type="button"
					class="action primary"
					@click="emit('continueNight')"
				>
					{{ t('night.continue') }}
				</button>
			</div>
		</section>
	</div>
</template>

<script setup lang="ts">
	import { computed } from 'vue'
	import { useI18n } from 'vue-i18n'
	import type { NightSummaryView } from '@/ui/viewModel.ts'

	const { summary } = defineProps<{ summary: NightSummaryView }>()

	const emit = defineEmits<{
		retry: []
		/** Not `continue`: it is a reserved word, and `@continue` would not compile. */
		continueNight: []
	}>()

	const { t } = useI18n()

	/** `a, b and c`. The separator and the word for "and" are both catalogue entries, not literals. */
	function joinNames(names: string[]): string {
		if (names.length <= 1) {
			return names[0] ?? ''
		}

		const head = names.slice(0, -1).join(t('night.listSeparator'))

		return `${head} ${t('general.and')} ${names[names.length - 1] ?? ''}`
	}

	const lostSentence = computed(() => {
		const names = summary.foodLostNameKeys.map(key => t(key))

		return names.length === 0 ? t('night.foodNothingLost') : t('night.foodLost', { items: joinNames(names) })
	})
</script>

<style scoped>
	.backdrop {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		background: rgba(16, 19, 31, 0.72);
		pointer-events: auto;
	}

	.summary {
		display: grid;
		gap: 0.6rem;
		width: min(26rem, 80%);
		padding: 1.4rem 1.6rem;
		border: 1px solid var(--kd-panel-edge);
		border-radius: 0.75rem;
		background: var(--kd-panel-raise);
	}

	h2 {
		margin: 0;
		color: var(--kd-owned);
		font-size: 1.3rem;
		font-weight: 600;
		letter-spacing: 0.01em;
	}

	.subtitle {
		margin: 0;
		color: var(--kd-text-dim);
		font-size: 0.85rem;
	}

	.lost {
		margin: 0.2rem 0;
		color: var(--kd-danger);
		font-size: 0.95rem;
		line-height: 1.5;
	}

	.tally {
		display: grid;
		gap: 0.2rem;
		margin: 0;
		color: var(--kd-text-dim);
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
	}

	.tally dt {
		margin: 0;
	}

	.tally .stub {
		opacity: 0.55;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.4rem;
	}

	.action {
		flex: 1;
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--kd-panel-edge);
		border-radius: var(--kd-radius);
		background: var(--kd-panel);
		color: var(--kd-text-dim);
		font: inherit;
		font-size: 0.8rem;
		cursor: pointer;
		pointer-events: auto;
	}

	.action:hover,
	.action:focus-visible {
		border-color: var(--kd-owned-dim);
		color: var(--kd-text);
	}

	.action.primary {
		border-color: var(--kd-owned-dim);
		color: var(--kd-owned);
	}
</style>
