<template>
	<div class="card">
		<p
			v-if="descriptionKey !== null"
			class="desc"
		>
			{{ t(descriptionKey) }}
		</p>
		<dl>
			<template v-if="stats.damage !== null">
				<dt>{{ t('hud.stat.damage') }}</dt>
				<dd>{{ stats.damage }}</dd>
			</template>
			<template v-if="stats.ratePerSecond !== null">
				<dt>{{ t('hud.stat.rate') }}</dt>
				<dd>{{ t('hud.stat.perSecond', { n: stats.ratePerSecond }) }}</dd>
			</template>
			<template v-if="stats.dps !== null">
				<dt>{{ t('hud.stat.dps') }}</dt>
				<dd>{{ stats.dps }}</dd>
			</template>
			<template v-if="stats.rangeTiles !== null">
				<dt>{{ t('hud.stat.range') }}</dt>
				<dd>{{ t('hud.stat.tiles', { n: stats.rangeTiles }) }}</dd>
			</template>
			<template v-if="stats.damageType !== null">
				<dt>{{ t('hud.stat.damageType') }}</dt>
				<dd>{{ t(`hud.damage.${stats.damageType}`) }}</dd>
			</template>
			<template v-if="stats.targets !== null">
				<dt>{{ t('hud.stat.targets') }}</dt>
				<dd>{{ t(`hud.targetClass.${stats.targets}`) }}</dd>
			</template>
			<template v-if="stats.crumbsPerSecond !== null">
				<dt>{{ t('hud.stat.income') }}</dt>
				<dd>{{ t('hud.stat.perSecond', { n: stats.crumbsPerSecond }) }}</dd>
			</template>
			<template v-if="stats.collectRadiusTiles !== null">
				<dt>{{ t('hud.stat.collect') }}</dt>
				<dd>{{ t('hud.stat.tiles', { n: stats.collectRadiusTiles }) }}</dd>
			</template>
			<dt>{{ t('hud.stat.noise') }}</dt>
			<dd>{{ stats.noise === 0 ? t('hud.stat.silent') : stats.noise }}</dd>
		</dl>
	</div>
</template>

<script setup lang="ts">
	import { useI18n } from 'vue-i18n'
	import type { TowerStatsView } from '@/ui/viewModel.ts'

	/**
	 * The tower stat block, shared by the shop's hover card and the inspector.
	 *
	 * Every line is `v-if`'d on a **null**, never on a zero: `TowerStatsView` hands out nulls for the
	 * stats a tower does not have precisely so a Cookie Jar shows no damage row rather than a damage
	 * row reading 0 (see ui/viewModel.ts). `noise` is the exception -- every tower has one and silence
	 * is genuinely zero, so that row is always drawn and reads as a word.
	 */

	const { descriptionKey = null } = defineProps<{
		stats: TowerStatsView
		descriptionKey?: string | null
	}>()

	const { t } = useI18n()
</script>

<style scoped>
	.card {
		display: grid;
		gap: 0.4rem;
		padding: 0.55rem 0.7rem;
		border: 1px solid var(--kd-panel-edge);
		border-radius: var(--kd-radius);
		background: var(--kd-panel);
		font-size: 0.75rem;
		line-height: 1.45;
	}

	.desc {
		margin: 0;
		max-width: 18rem;
		color: var(--kd-text-dim);
		font-style: italic;
	}

	dl {
		display: grid;
		grid-template-columns: auto auto;
		gap: 0 0.9rem;
		margin: 0;
	}

	dt {
		color: var(--kd-text-dim);
	}

	dd {
		margin: 0;
		color: var(--kd-text);
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
</style>
