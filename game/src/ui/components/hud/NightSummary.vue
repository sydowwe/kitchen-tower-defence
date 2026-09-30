<template>
	<!--
		The one wrapper in the HUD allowed to take pointer events. Every other panel opts in on the
		control itself, because a wrapper swallows the crumb clicks behind it -- which is exactly what
		this one is for: the night is over, and nothing on the board is clickable any more.
	-->
	<div class="backdrop">
		<section class="summary">
			<!-- The part that grows scrolls; the save line and the buttons below it never leave the panel,
				 whatever the window's height (step 20E, the scroll gotcha). -->
			<div class="body">
				<h2>{{ t(summary.won ? 'night.wonTitle' : 'night.lostTitle') }}</h2>
				<p class="subtitle">{{ t(summary.won ? 'night.wonSubtitle' : 'night.lostSubtitle') }}</p>

				<!-- The emotional payload (DECISIONS.md section 6): a sentence with the names in it. Not a
					 table row, and never collapsed into a count. What a thief got away with goes first and
					 on its own line: carried off is a different loss from eaten. -->
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

				<ul class="story">
					<li>
						{{ t('night.wavesSurvived', { survived: summary.wavesSurvived, total: summary.waveCount }) }}
					</li>
					<li>{{ noiseSentence }}</li>
					<li v-if="summary.snackStashUsed">{{ t('night.snackStash') }}</li>
				</ul>

				<GroceryBreakdown
					v-if="summary.grocery !== null"
					:grocery="summary.grocery"
					:crumbsDropped="summary.crumbsDropped"
				/>
				<!-- No pay behind it -- a spec's world, or a dev night -- so the raw counts instead. -->
				<ul
					v-else
					class="story"
				>
					<li>{{ t('night.foodRemaining', { n: summary.foodRemaining }) }}</li>
					<li>{{ t('night.enemiesKilled', { n: summary.enemiesKilled }) }}</li>
					<li>
						{{
							t('night.crumbsCollected', {
								collected: summary.crumbsCollected,
								dropped: summary.crumbsDropped,
							})
						}}
					</li>
				</ul>
			</div>

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
					 not replayed (core/campaign.ts, applyNightResult). On a campaign night it goes to the
					 loadout screen; enabled on 'failed', because Start there saves on top of the pending
					 night and shows the store's retry. -->
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
	import GroceryBreakdown from '@/ui/components/hud/GroceryBreakdown.vue'
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

	/** "Peaked at 84 of 100", and whether that woke anyone -- a night that did not is worth 50. */
	const noiseSentence = computed(() => {
		const params = { level: Math.round(summary.peakNoise.level), cap: summary.peakNoise.cap, n: summary.wakeCount }
		if (summary.wakeCount === 0) {
			return t('night.noiseQuiet', params)
		}
		return t(summary.wakeCount === 1 ? 'night.noiseWokeOnce' : 'night.noiseWokeTimes', params)
	})
</script>

<style scoped>
	/* Flex rather than grid centring: a flex item's percentage `max-height` resolves against this box,
	   which is the board's height, where a grid item's resolves against an auto row and caps nothing. */
	.backdrop {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background: rgba(16, 19, 31, 0.72);
		pointer-events: auto;
	}

	.summary {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		width: min(26rem, 80%);
		max-height: 100%;
		padding: 1.4rem 1.6rem;
		border: 1px solid var(--kd-panel-edge);
		border-radius: 0.75rem;
		background: var(--kd-panel-raise);
	}

	.body {
		display: grid;
		gap: 0.6rem;
		min-height: 0;
		overflow-y: auto;
		/* Room for the scrollbar, so it does not sit on the amounts. */
		padding-right: 0.3rem;
		margin-right: -0.3rem;
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

	.story {
		display: grid;
		gap: 0.2rem;
		margin: 0;
		padding: 0;
		list-style: none;
		color: var(--kd-text-dim);
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
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
		flex: none;
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
