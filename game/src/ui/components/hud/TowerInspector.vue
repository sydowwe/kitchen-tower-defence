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

		<ul class="slots">
			<UpgradeSlot
				v-for="slot in inspector.upgrades"
				:key="slot.tier"
				:entry="slot"
				@upgrade="emit('upgrade', inspector.towerId)"
			/>
		</ul>
		<p
			v-if="maxed"
			class="maxed"
		>
			{{ t('hud.tierMaxed') }}
		</p>

		<div class="field">
			<span class="label">{{ t('hud.targeting') }}</span>
			<TargetingControl
				:mode="inspector.targetingMode"
				@change="mode => emit('setTargetingMode', inspector.towerId, mode)"
			/>
		</div>

		<button
			type="button"
			class="action sell"
			:title="t('hud.sellKey')"
			@click="emit('sell', inspector.towerId)"
		>
			<FontAwesomeIcon icon="trash" />
			{{ t('hud.sellFor', { n: inspector.refund }) }}
		</button>
		<p
			v-if="inspector.refundIsPenalised"
			class="penalty"
		>
			{{ t('hud.sellPenalty') }}
		</p>
	</section>
</template>

<script setup lang="ts">
	import { computed } from 'vue'
	import { useI18n } from 'vue-i18n'
	import StatCard from '@/ui/components/hud/StatCard.vue'
	import TargetingControl from '@/ui/components/hud/TargetingControl.vue'
	import UpgradeSlot from '@/ui/components/hud/UpgradeSlot.vue'
	import type { EntityId, TargetingMode, TowerInspectorView } from '@/ui/viewModel.ts'

	/**
	 * The selected tower, while it is selected: what it does now, what the three tiers would do to it,
	 * what it shoots at, and what it is worth sold.
	 *
	 * It composes and re-emits. The three slots are `UpgradeSlot.vue` and the mode is
	 * `TargetingControl.vue`, because three slots written inline is three copies of the same markup and
	 * this component was already at the size CLAUDE.md's "split larger components" is about.
	 *
	 * `upgrade` takes the same path `sell` does -- up through `HudLayer.vue` to the command queue. No
	 * component here writes to the world (ARCHITECTURE.md section 3).
	 *
	 * The number under the sell button is `inspector.refund`, which came out of `refundFor`, never a
	 * percentage recomputed here. A button that says 70% while the sale pays 50% is worse than one with
	 * no number on it, and the penalty line says *why* rather than leaving the player to notice.
	 */

	const { inspector } = defineProps<{ inspector: TowerInspectorView }>()

	const emit = defineEmits<{
		sell: [towerId: EntityId]
		upgrade: [towerId: EntityId]
		setTargetingMode: [towerId: EntityId, mode: TargetingMode]
	}>()

	const { t } = useI18n()

	/** Every slot bought. Said once, where the button was, so the panel does not just lose a row. */
	const maxed = computed(() => inspector.upgrades.every(slot => slot.state === 'owned'))
</script>

<style scoped>
	.inspector {
		position: absolute;
		right: 0.75rem;
		/* Above the wave control, and scrollable rather than tall: three slots plus a stat card can
		   outgrow a short window, and a panel that runs off the bottom of the board hides the sell
		   button rather than the thing the player stopped reading. */
		top: 3.5rem;
		bottom: 5.5rem;
		display: grid;
		align-content: start;
		gap: 0.5rem;
		width: 15rem;
		padding: 0.6rem;
		overflow-y: auto;
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

	.slots {
		display: grid;
		gap: 0.3rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.maxed {
		margin: 0;
		color: var(--kd-text-dim);
		font-size: 0.66rem;
		text-align: right;
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
