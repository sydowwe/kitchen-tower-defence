<template>
	<li
		class="slot"
		:class="entry.state"
	>
		<!-- First in the markup and first in the reading order, because on a tier-0 tower this is the
			 sentence that has to land before the numbers do: the third tier is the reason to save 250%
			 of a tower's cost, and five of the six behaviours it can add show up in no diff row. -->
		<p
			v-if="entry.descriptionKey !== null"
			class="lead"
		>
			<span class="lead-label">{{ t('hud.tierThreeLead') }}</span>
			{{ t(entry.descriptionKey) }}
		</p>

		<header class="head">
			<span class="tier">{{ t('hud.tier', { n: entry.tier }) }}</span>
			<b class="name">{{ t(entry.nameKey) }}</b>
		</header>

		<dl
			v-if="entry.diff.length > 0"
			class="diff"
		>
			<template
				v-for="row in entry.diff"
				:key="row.labelKey"
			>
				<dt>{{ t(row.labelKey) }}</dt>
				<dd>
					<span class="was">{{ text(row.from) }}</span>
					<span class="arrow">{{ t('hud.diffArrow') }}</span>
					<span class="now">{{ text(row.to) }}</span>
				</dd>
			</template>
		</dl>

		<button
			v-if="entry.state === 'next'"
			type="button"
			class="buy"
			:class="{ poor: !entry.affordable }"
			:title="t('hud.upgradeKey')"
			@click="emit('upgrade')"
		>
			<FontAwesomeIcon icon="arrow-up" />
			{{ t('hud.upgradeFor', { n: entry.cost }) }}
		</button>
		<p
			v-else-if="entry.state === 'owned'"
			class="owned"
		>
			<FontAwesomeIcon icon="check" />
			{{ t('hud.tierOwned') }}
		</p>
		<p
			v-else
			class="later"
		>
			{{ t('hud.cost', { n: entry.cost }) }}
		</p>
	</li>
</template>

<script setup lang="ts">
	import { useI18n } from 'vue-i18n'
	import type { StatValueView, UpgradeSlotView } from '@/ui/viewModel.ts'

	/**
	 * One of the three tiers, in whichever of its three states it is in.
	 *
	 * The slot is rendered for every tier whatever the tower is standing on -- a locked tier shows its
	 * name, its diff and its price, which is what turns "save up" into a decision rather than a
	 * surprise (step 12C, decision 2).
	 *
	 * **An unaffordable Upgrade button dims but stays live**, exactly as `TowerShop.vue`'s buttons do:
	 * `upgradeTower` re-validates and is a silent no-op, and a disabled control is one the player
	 * cannot click to find out why.
	 */

	// `entry` and not `slot`: `slot` is a reserved attribute name in a Vue template, and a prop that
	// shadows one is a debugging session nobody enjoys. `TowerShop.vue` names its rows the same way.
	const { entry } = defineProps<{ entry: UpgradeSlotView }>()

	const emit = defineEmits<{ upgrade: [] }>()

	const { t } = useI18n()

	/**
	 * One side of a diff row. The view model already chose the key and the number (see
	 * `StatValueView`), so this is one `t()` call and never arithmetic or a unit decided here.
	 *
	 * Null is a stat the tower did not have at that tier -- an em dash, not a zero.
	 */
	function text(value: StatValueView | null): string {
		return value === null ? t('hud.diffNone') : t(value.textKey, value.params)
	}
</script>

<style scoped>
	.slot {
		display: grid;
		gap: 0.3rem;
		padding: 0.4rem 0.5rem;
		border: 1px solid var(--kd-panel-edge);
		border-radius: var(--kd-radius);
		background: var(--kd-panel-raise);
	}

	/* A tier already bought is a receipt, not an offer. It recedes and stops competing with the one
	   the player can actually act on. */
	.slot.owned {
		border-color: transparent;
		background: transparent;
		opacity: 0.55;
	}

	.slot.locked {
		opacity: 0.75;
	}

	.head {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
	}

	.tier {
		color: var(--kd-text-dim);
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.name {
		color: var(--kd-text);
		font-size: 0.78rem;
	}

	/* The loudest thing in the slot, and deliberately louder than the diff below it: brighter than
	   body text, on its own ground, above the tier's own name. */
	.lead {
		margin: 0;
		padding: 0.35rem 0.45rem;
		border-left: 2px solid var(--kd-owned);
		border-radius: 0 var(--kd-radius) var(--kd-radius) 0;
		background: var(--kd-panel);
		color: var(--kd-text);
		font-size: 0.75rem;
		line-height: 1.4;
	}

	.lead-label {
		display: block;
		color: var(--kd-owned);
		font-size: 0.58rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	.diff {
		display: grid;
		grid-template-columns: auto auto;
		gap: 0 0.7rem;
		margin: 0;
		font-size: 0.7rem;
	}

	.diff dt {
		color: var(--kd-text-dim);
	}

	.diff dd {
		display: flex;
		justify-content: flex-end;
		gap: 0.3rem;
		margin: 0;
		font-variant-numeric: tabular-nums;
	}

	/* The old number stays legible rather than being struck through: the point of the row is the pair,
	   and a struck number reads as one that stopped being true. */
	.was {
		color: var(--kd-text-dim);
	}

	.arrow {
		color: var(--kd-text-dim);
		opacity: 0.7;
	}

	.now {
		color: var(--kd-owned);
	}

	.buy {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		padding: 0.3rem 0.4rem;
		border: 1px solid var(--kd-owned-dim);
		border-radius: var(--kd-radius);
		background: var(--kd-panel);
		color: var(--kd-owned);
		font: inherit;
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
		pointer-events: auto;
	}

	.buy:hover,
	.buy:focus-visible {
		border-color: var(--kd-owned);
		background: var(--kd-panel-raise);
	}

	.buy.poor {
		border-color: var(--kd-panel-edge);
		color: var(--kd-danger);
	}

	.owned,
	.later {
		margin: 0;
		color: var(--kd-text-dim);
		font-size: 0.66rem;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
</style>
