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
				 table row, and never collapsed into a count. What a thief got away with goes first and on
				 its own line: carried off is a different loss from eaten. -->
			<p
				v-if="escapedSentence !== null"
				class="lost"
			>
				{{ escapedSentence }}
			</p>
			<p
				v-if="lostSentence !== null"
				class="lost"
			>
				{{ lostSentence }}
			</p>

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

			<!-- Saved before either button goes anywhere: leaving mid-save is how a night's money
				 disappears (step 20D, decision 9). -->
			<p
				v-if="saveState === 'saving'"
				class="save"
				role="status"
			>
				{{ t('night.saving') }}
			</p>
			<p
				v-else-if="saveState === 'failed'"
				class="save failed"
				role="alert"
			>
				{{ t('night.saveFailed') }}
				<button
					type="button"
					class="action inline"
					@click="emit('retrySave')"
				>
					{{ t('night.retrySave') }}
				</button>
			</p>

			<div class="actions">
				<!-- A lost night only. A won one has already moved the campaign on, and a won night is
					 not replayed (core/campaign.ts, applyNightResult). -->
				<button
					v-if="!summary.won"
					type="button"
					class="action"
					:disabled="saveState === 'saving'"
					@click="emit('retry')"
				>
					{{ t('night.retry') }}
				</button>
				<button
					type="button"
					class="action primary"
					:disabled="saveState === 'saving'"
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
	import { joinNames } from '@/ui/joinNames.ts'
	import type { NightSummaryView } from '@/ui/viewModel.ts'

	/**
	 * `saveState` is the progress store's, for the night's result: both buttons wait on `'saving'`, and
	 * `'failed'` offers the store's retry. A night that records nothing (a dev override) is `'saved'`.
	 */
	const { summary, saveState = 'saved' } = defineProps<{
		summary: NightSummaryView
		saveState?: 'saving' | 'saved' | 'failed'
	}>()

	const emit = defineEmits<{
		retry: []
		/** Not `continue`: it is a reserved word, and `@continue` would not compile. Goes to the Kitchen. */
		continueNight: []
		retrySave: []
	}>()

	const { t } = useI18n()

	function names(keys: string[]): string {
		return joinNames(
			keys.map(key => t(key)),
			t('night.listSeparator'),
			t('general.and'),
		)
	}

	const escapedSentence = computed(() =>
		summary.foodEscapedNameKeys.length === 0
			? null
			: t('night.foodEscaped', { items: names(summary.foodEscapedNameKeys) }),
	)

	/** "Nothing was taken" only when nothing was: a night that lost only to the Mouse says that line alone. */
	const lostSentence = computed(() => {
		if (summary.foodLostNameKeys.length > 0) {
			return t('night.foodLost', { items: names(summary.foodLostNameKeys) })
		}
		return summary.foodEscapedNameKeys.length === 0 ? t('night.foodNothingLost') : null
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

	.save {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin: 0;
		color: var(--kd-text-dim);
		font-size: 0.8rem;
	}

	.save.failed {
		color: var(--kd-danger);
	}

	.action.inline {
		flex: none;
		padding: 0.25rem 0.6rem;
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

	.action:disabled {
		border-color: var(--kd-panel-edge);
		opacity: 0.4;
		cursor: default;
	}
</style>
