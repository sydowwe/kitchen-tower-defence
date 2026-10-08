<template>
	<section class="tiers">
		<h2 class="question">{{ t('title.tier.question') }}</h2>

		<ul class="list">
			<li
				v-for="tier in picker.tiers"
				:key="tier.id"
			>
				<button
					type="button"
					class="tier"
					:class="{ current: tier.current, picked: asking === tier.id }"
					:disabled="tier.current || !tier.unlocked || busy"
					:aria-pressed="tier.current"
					@click="pick(tier.id)"
				>
					<span class="name">{{ t(tier.nameKey) }}</span>
					<span class="line">{{ t(tier.descriptionKey) }}</span>
					<span
						v-if="tier.current"
						class="state"
					>
						{{ t('title.tier.current') }}
					</span>
					<span
						v-else-if="tier.opensOnNameKey !== null"
						class="state locked"
					>
						{{ t('title.tier.locked', { tier: t(tier.opensOnNameKey) }) }}
					</span>
				</button>
			</li>
		</ul>

		<div
			v-if="askingTier !== null"
			class="confirm"
			role="alertdialog"
			:aria-label="t('title.tier.ask', { tier: t(askingTier.nameKey) })"
		>
			<p class="ask">{{ t('title.tier.ask', { tier: t(askingTier.nameKey) }) }}</p>
			<p
				v-if="failed"
				class="failed"
			>
				{{ t('title.tier.failed') }}
			</p>
			<div class="actions">
				<button
					type="button"
					class="action"
					:disabled="saving"
					@click="asking = null"
				>
					{{ t('title.tier.cancel') }}
				</button>
				<button
					type="button"
					class="action go"
					:disabled="busy"
					@click="onConfirm"
				>
					{{ confirmLabel }}
				</button>
			</div>
		</div>

		<p
			v-else-if="saving"
			class="status"
		>
			{{ t('title.tier.saving') }}
		</p>
		<p
			v-else-if="failed"
			class="failed"
		>
			{{ t('title.tier.failed') }}
			<button
				type="button"
				class="retry"
				:disabled="busy"
				@click="emit('retry')"
			>
				{{ t('title.tier.retry') }}
			</button>
		</p>
	</section>
</template>

<script setup lang="ts">
	import { computed } from 'vue'
	import { useI18n } from 'vue-i18n'
	import type { DifficultyId, TierPickerView } from '@/ui/kitchenView.ts'

	/**
	 * The three tiers, on the title (step 21F, decision 7). The current one is marked and a locked one
	 * says what opens it. Picking another asks first when the campaign has anything to lose, in
	 * `ResetProgress.vue`'s idiom. Its saving and failed states are the store's, through the parent: a
	 * tier is only shown as chosen once the save has taken it.
	 */

	const {
		picker,
		busy = false,
		saving = false,
		failed = false,
	} = defineProps<{
		picker: TierPickerView
		/** Any save or load in flight. */
		busy?: boolean
		/** A new campaign is the save in flight. */
		saving?: boolean
		/** A new campaign is the save that failed. */
		failed?: boolean
	}>()

	const emit = defineEmits<{
		start: [tier: DifficultyId]
		retry: []
	}>()

	/** The tier whose question is open. The parent's, so it can close it once the save lands. */
	const asking = defineModel<DifficultyId | null>('asking', { default: null })

	const { t } = useI18n()

	const askingTier = computed(() => picker.tiers.find(tier => tier.id === asking.value) ?? null)

	function pick(tier: DifficultyId): void {
		if (picker.campaignStarted) {
			asking.value = tier
		} else {
			emit('start', tier)
		}
	}

	/** After a failure the same button re-sends the unsaved campaign rather than building a second one. */
	function onConfirm(): void {
		if (failed) {
			emit('retry')
		} else if (asking.value !== null) {
			emit('start', asking.value)
		}
	}

	const confirmLabel = computed(() => {
		if (saving) {
			return t('title.tier.saving')
		}
		return t(failed ? 'title.tier.retry' : 'title.tier.confirm')
	})
</script>

<style scoped>
	.tiers {
		display: grid;
		justify-items: center;
		gap: 0.7rem;
		width: min(40rem, 90vw);
	}

	.question {
		margin: 0;
		color: var(--kd-text-dim);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.list {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.6rem;
		width: 100%;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.tier {
		display: grid;
		align-content: start;
		gap: 0.3rem;
		width: 100%;
		height: 100%;
		padding: 0.7rem 0.8rem;
		border: 1px solid var(--kd-panel-edge);
		border-radius: var(--kd-radius);
		background: var(--kd-panel);
		color: var(--kd-text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.tier:hover:not(:disabled),
	.tier:focus-visible,
	.tier.picked {
		border-color: var(--kd-owned-dim);
		background: var(--kd-panel-raise);
	}

	.tier:disabled {
		cursor: default;
	}

	.tier.current {
		border-color: var(--kd-owned);
	}

	.tier:disabled:not(.current) {
		opacity: 0.55;
	}

	.name {
		color: var(--kd-lamp);
		font-size: 0.95rem;
		font-weight: 600;
	}

	.line {
		color: var(--kd-text-dim);
		font-size: 0.78rem;
		line-height: 1.4;
	}

	.state {
		margin-top: 0.2rem;
		color: var(--kd-owned);
		font-size: 0.7rem;
		letter-spacing: 0.04em;
	}

	.state.locked {
		color: var(--kd-text-dim);
	}

	.confirm {
		display: grid;
		gap: 0.5rem;
		max-width: 26rem;
		padding: 0.8rem 0.9rem;
		border: 1px solid var(--kd-danger);
		border-radius: var(--kd-radius);
		background: var(--kd-panel);
	}

	.ask,
	.status,
	.failed {
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.4;
	}

	.ask {
		color: var(--kd-text);
	}

	.status {
		color: var(--kd-text-dim);
	}

	.failed {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		color: var(--kd-danger);
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	.action,
	.retry {
		flex: 1;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--kd-panel-edge);
		border-radius: var(--kd-radius);
		background: transparent;
		color: var(--kd-text);
		font: inherit;
		font-size: 0.8rem;
		cursor: pointer;
	}

	.action.go {
		border-color: var(--kd-danger);
		background: var(--kd-danger);
		color: var(--kd-night);
	}

	.retry {
		flex: none;
		border-color: var(--kd-danger);
		color: var(--kd-danger);
	}

	.action:disabled,
	.retry:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
