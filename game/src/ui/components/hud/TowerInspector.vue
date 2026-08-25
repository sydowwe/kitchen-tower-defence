<template>
	<section class="inspector">
		<header class="head">
			<span class="glyph">{{ inspector.glyph }}</span>
			<span class="naming">
				<b>{{ t(inspector.nameKey) }}</b>
				<i>{{ t('hud.tier', { n: inspector.tier }) }}</i>
			</span>
		</header>

		<StatCard :stats="inspector.stats" />

		<div class="field">
			<span class="label">{{ t('hud.targeting') }}</span>
			<div class="modes">
				<button
					v-for="mode in TARGETING_MODES"
					:key="mode"
					type="button"
					class="chip"
					:class="{ on: mode === inspector.targetingMode }"
					@click="emit('setTargetingMode', inspector.towerId, mode)"
				>
					{{ t(`hud.mode.${mode}`) }}
				</button>
			</div>
		</div>

		<div class="actions">
			<!-- Step 12 adds the upgrade mechanic. `TowerDef` has no `upgrades` field to read yet, so
				 this is a disabled button and a tier readout, not a stub that half-works. -->
			<button
				type="button"
				class="action"
				disabled
				:title="t('hud.upgradeUnavailable')"
			>
				<FontAwesomeIcon icon="arrow-up" />
				{{ t('hud.upgrade') }}
			</button>
			<button
				type="button"
				class="action sell"
				:title="t('hud.sellKey')"
				@click="emit('sell', inspector.towerId)"
			>
				<FontAwesomeIcon icon="trash" />
				{{ t('hud.sellFor', { n: inspector.refund }) }}
			</button>
		</div>
		<p
			v-if="inspector.refundIsPenalised"
			class="penalty"
		>
			{{ t('hud.sellPenalty') }}
		</p>
	</section>
</template>

<script setup lang="ts">
	import { useI18n } from 'vue-i18n'
	import StatCard from '@/ui/components/hud/StatCard.vue'
	import type { EntityId, TargetingMode, TowerInspectorView } from '@/ui/viewModel.ts'

	/**
	 * The selected tower, while it is selected.
	 *
	 * The number under the sell button is `inspector.refund`, which came out of `refundFor` -- never a
	 * percentage recomputed here. A button that says 70% while the sale pays 50% is worse than one
	 * with no number on it, and the penalty line says *why* rather than leaving the player to notice.
	 */

	const { inspector } = defineProps<{ inspector: TowerInspectorView }>()

	const emit = defineEmits<{
		sell: [towerId: EntityId]
		setTargetingMode: [towerId: EntityId, mode: TargetingMode]
	}>()

	const { t } = useI18n()

	/**
	 * The `TargetingMode` union, written out in the order the inspector offers it. All six have been
	 * implemented in `core/systems/targeting.ts` since step 6B, so this selector is real -- the
	 * upgrade button above is the stub.
	 */
	const TARGETING_MODES: TargetingMode[] = ['FIRST', 'LAST', 'STRONGEST', 'WEAKEST', 'CLOSEST', 'RANDOM']
</script>

<style scoped>
	.inspector {
		position: absolute;
		right: 0.75rem;
		bottom: 5.5rem;
		display: grid;
		gap: 0.5rem;
		width: 15rem;
		padding: 0.6rem;
		border: 1px solid var(--kd-panel-edge);
		border-radius: var(--kd-radius);
		background: var(--kd-panel);
		font-size: 0.75rem;
		pointer-events: auto;
	}

	.head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.glyph {
		font-size: 1.6rem;
		line-height: 1;
	}

	.naming {
		display: grid;
	}

	.naming b {
		color: var(--kd-text);
		font-size: 0.85rem;
	}

	.naming i {
		color: var(--kd-text-dim);
		font-size: 0.7rem;
		font-style: normal;
	}

	.field {
		display: grid;
		gap: 0.25rem;
	}

	.label {
		color: var(--kd-text-dim);
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.modes {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.chip {
		padding: 0.2rem 0.45rem;
		border: 1px solid var(--kd-panel-edge);
		border-radius: 999px;
		background: transparent;
		color: var(--kd-text-dim);
		font: inherit;
		font-size: 0.68rem;
		cursor: pointer;
		pointer-events: auto;
	}

	.chip:hover,
	.chip:focus-visible {
		border-color: var(--kd-owned-dim);
		color: var(--kd-text);
	}

	.chip.on {
		border-color: var(--kd-owned);
		background: var(--kd-panel-raise);
		color: var(--kd-owned);
	}

	.actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.35rem;
	}

	.action {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		padding: 0.35rem 0.4rem;
		border: 1px solid var(--kd-panel-edge);
		border-radius: var(--kd-radius);
		background: var(--kd-panel-raise);
		color: var(--kd-text-dim);
		font: inherit;
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
		pointer-events: auto;
	}

	.action:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.action.sell {
		color: var(--kd-owned);
	}

	.action.sell:hover,
	.action.sell:focus-visible {
		border-color: var(--kd-owned-dim);
	}

	.penalty {
		margin: 0;
		color: var(--kd-danger);
		font-size: 0.68rem;
	}
</style>
