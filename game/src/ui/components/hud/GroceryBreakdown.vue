<template>
	<section class="pay">
		<h3>{{ t('night.pay.heading') }}</h3>
		<dl>
			<template
				v-for="line in lines"
				:key="line.id"
			>
				<dt :class="line.kind">{{ line.label }}</dt>
				<dd :class="[line.kind, { nothing: line.nothing }]">{{ line.amount }}</dd>
			</template>
		</dl>
	</section>
</template>

<script setup lang="ts">
	import { computed } from 'vue'
	import { useI18n } from 'vue-i18n'
	import type { GroceryMoneyBreakdown } from '@/ui/viewModel.ts'

	/**
	 * Tonight's Grocery Money, a line per thing the player did and the number it paid, then the total.
	 *
	 * **Prints `night.pay` and computes nothing.** Every amount is a field of the breakdown, so the
	 * lines add up to the subtotal because `groceryMoneyFor` made them add up, and the total is the one
	 * the Kitchen's balance moved by (step 20E, decision 1).
	 *
	 * A term worth 0 still gets its line, dimmed: "Somebody woke up +0" teaches what quiet was worth,
	 * and a line that vanished would teach nothing.
	 */

	const { grocery, crumbsDropped } = defineProps<{
		grocery: GroceryMoneyBreakdown
		/** A floor nothing fell on is 100% clean, and says so as a sentence rather than as "100%". */
		crumbsDropped: number
	}>()

	const { t } = useI18n()

	interface Line {
		id: string
		label: string
		amount: string
		kind: 'term' | 'subtotal' | 'factor' | 'total'
		nothing: boolean
	}

	function term(id: string, label: string, n: number): Line {
		return { id, label, amount: t('night.pay.amount', { n }), kind: 'term', nothing: n === 0 }
	}

	function foodLabel(items: number): string {
		if (items === 0) {
			return t('night.pay.foodSavedNone')
		}
		return items === 1 ? t('night.pay.foodSavedOne') : t('night.pay.foodSaved', { n: items })
	}

	const lines = computed(() => {
		const g = grocery
		const result: Line[] = [
			term('base', t('night.pay.base'), g.base),
			term('foodSaved', foodLabel(g.itemsRemaining), g.foodSaved),
			term('kills', t('night.pay.kills', { n: g.enemiesKilled }), g.kills),
			term(
				'cleanliness',
				crumbsDropped === 0
					? t('night.pay.cleanlinessNothingDropped')
					: t('night.pay.cleanliness', { percent: Math.round(g.cleanlinessRatio * 100) }),
				g.cleanliness,
			),
			term('noWake', t(g.woke ? 'night.pay.woke' : 'night.pay.noWake'), g.noWake),
			term(
				'earlyCall',
				g.secondsSkipped === 0
					? t('night.pay.earlyCallNone')
					: t('night.pay.earlyCall', { n: g.secondsSkipped }),
				g.earlyCall,
			),
			{
				id: 'subtotal',
				label: t('night.pay.subtotal'),
				amount: String(g.subtotal),
				kind: 'subtotal',
				nothing: false,
			},
		]

		if (g.difficultyMult !== 1) {
			result.push({
				id: 'difficulty',
				label: t('night.pay.difficulty'),
				amount: t('night.pay.times', { n: g.difficultyMult }),
				kind: 'factor',
				nothing: false,
			})
		}
		if (g.lossMult !== 1) {
			result.push({
				id: 'loss',
				label: t('night.pay.loss'),
				amount: t('night.pay.percent', { n: Math.round(g.lossMult * 100) }),
				kind: 'factor',
				nothing: false,
			})
		}

		result.push({
			id: 'total',
			label: t('night.pay.total'),
			amount: `💵 ${g.total}`,
			kind: 'total',
			nothing: false,
		})
		return result
	})
</script>

<style scoped>
	.pay {
		display: grid;
		gap: 0.35rem;
	}

	h3 {
		margin: 0;
		color: var(--kd-text-dim);
		font-size: 0.65rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	dl {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.2rem 1rem;
		margin: 0;
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
	}

	dt,
	dd {
		margin: 0;
	}

	dt {
		color: var(--kd-text-dim);
	}

	dd {
		color: var(--kd-owned);
		text-align: right;
	}

	dd.nothing {
		color: var(--kd-text-dim);
		opacity: 0.6;
	}

	/* A rule above the subtotal, and above the total: where the adding up happens. */
	dt.subtotal,
	dd.subtotal,
	dt.total,
	dd.total {
		margin-top: 0.15rem;
		padding-top: 0.3rem;
		border-top: 1px solid var(--kd-panel-edge);
	}

	dt.subtotal,
	dd.subtotal {
		color: var(--kd-text);
	}

	dd.factor {
		color: var(--kd-text);
	}

	dt.total {
		color: var(--kd-text);
		font-weight: 600;
	}

	dd.total {
		color: var(--kd-owned);
		font-size: 1rem;
		font-weight: 600;
	}
</style>
