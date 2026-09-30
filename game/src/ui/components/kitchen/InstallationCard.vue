<template>
	<article
		class="card"
		:class="card.state"
	>
		<span
			class="glyph"
			aria-hidden="true"
		>
			{{ card.glyph }}
		</span>
		<div class="text">
			<h3 class="name">{{ t(card.nameKey) }}</h3>
			<p class="description">{{ t(card.descriptionKey) }}</p>
			<p class="effect">{{ t(card.effect.textKey, card.effect.params) }}</p>
		</div>

		<div class="foot">
			<span class="cost">💵 {{ card.cost }}</span>
			<span
				v-if="card.state === 'owned'"
				class="owned"
			>
				{{ t('kitchen.owned') }}
			</span>
			<button
				v-else
				type="button"
				class="buy"
				:disabled="busy || card.state === 'unaffordable'"
				@click="emit('buy', card.id)"
			>
				{{ buttonLabel }}
			</button>
		</div>
	</article>
</template>

<script setup lang="ts">
	import { computed } from 'vue'
	import { useI18n } from 'vue-i18n'
	import type { InstallationCardView, InstallationId } from '@/ui/kitchenView.ts'

	/**
	 * One installation, owned, affordable or not yet.
	 *
	 * **Holds no save state of its own.** Whether a purchase is in flight is the progress store's
	 * `status`, handed down as `busy` and `buying`: a card with its own flag goes on showing a spinner
	 * after a failure the store has already moved past. And it never pre-fills as owned -- the store is
	 * pessimistic, so `card.state` moves only once the save has landed.
	 */

	const {
		card,
		busy = false,
		buying = false,
	} = defineProps<{
		card: InstallationCardView
		/** Any save in flight, this card's or not. Every card's button waits on it. */
		busy?: boolean
		/** This card's purchase is the save in flight. */
		buying?: boolean
	}>()

	const emit = defineEmits<{
		buy: [id: InstallationId]
	}>()

	const { t } = useI18n()

	const buttonLabel = computed(() => {
		if (buying) {
			return t('kitchen.buying')
		}
		return t(card.state === 'unaffordable' ? 'kitchen.notYet' : 'kitchen.buy')
	})
</script>

<style scoped>
	.card {
		display: grid;
		grid-template-columns: auto 1fr;
		grid-template-rows: 1fr auto;
		gap: 0.4rem 0.7rem;
		padding: 0.8rem 0.9rem;
		border: 1px solid var(--kd-day-card-edge);
		border-radius: 0.6rem;
		background: var(--kd-day-card);
		color: var(--kd-day-ink);
	}

	.card.owned {
		border-color: var(--kd-day-owned);
		background: var(--kd-day-owned-soft);
	}

	.glyph {
		font-size: 1.9rem;
		line-height: 1;
	}

	.card.unaffordable .glyph {
		opacity: 0.55;
	}

	.text {
		display: grid;
		gap: 0.25rem;
		align-content: start;
	}

	.name {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
	}

	.description {
		margin: 0;
		color: var(--kd-day-ink-dim);
		font-size: 0.8rem;
		line-height: 1.4;
	}

	.effect {
		margin: 0;
		color: var(--kd-day-owned);
		font-size: 0.8rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.foot {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.cost {
		font-size: 0.85rem;
		font-variant-numeric: tabular-nums;
	}

	.card.owned .cost {
		color: var(--kd-day-ink-dim);
		text-decoration: line-through;
	}

	.owned {
		color: var(--kd-day-owned);
		font-size: 0.8rem;
		font-weight: 600;
	}

	.buy {
		min-width: 6rem;
		padding: 0.35rem 0.8rem;
		border: 1px solid var(--kd-day-owned);
		border-radius: var(--kd-radius);
		background: var(--kd-day-owned);
		color: var(--kd-day-card);
		font: inherit;
		font-size: 0.8rem;
		cursor: pointer;
	}

	.buy:disabled {
		border-color: var(--kd-day-card-edge);
		background: transparent;
		color: var(--kd-day-ink-dim);
		cursor: default;
	}
</style>
