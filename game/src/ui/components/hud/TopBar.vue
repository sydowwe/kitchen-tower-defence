<template>
	<div class="top-bar">
		<div class="panel">
			<span class="clock">{{ t('hud.clock', { hour: clock.hour, minute: minute }) }}</span>
			<span class="wave">{{ t('hud.wave', { current: wave.index + 1, total: wave.count }) }}</span>

			<span class="divider" />

			<span
				class="reading"
				:title="t('hud.crumbs')"
			>
				<span class="glyph">🍞</span>
				<b>{{ crumbs }}</b>
				<i v-if="crumbsOnBoard.value > 0">+{{ crumbsOnBoard.value }}</i>
			</span>
			<span
				class="reading"
				:title="t('hud.groceryMoney')"
			>
				<span class="glyph">💵</span>
				<b>{{ groceryMoney }}</b>
			</span>

			<span
				class="reading noise"
				:title="t('hud.noiseLevel', { level: noise.level, cap: noise.cap })"
			>
				<FontAwesomeIcon :icon="noise.level > 0 ? 'volume-high' : 'volume-xmark'" />
				<span class="meter">
					<span
						class="meter-fill threat"
						:style="{ width: `${noiseFraction}%` }"
					/>
				</span>
			</span>

			<span class="divider" />

			<!-- The health bar. Nothing else in this bar is allowed to compete with it. -->
			<span class="food">
				<span class="food-label">{{ t('hud.food') }}</span>
				<b class="food-count">{{ t('hud.foodCount', { remaining: food.remaining, total: food.total }) }}</b>
				<span class="meter food-meter">
					<span
						class="meter-fill owned"
						:style="{ width: `${foodFraction}%` }"
					/>
				</span>
			</span>
		</div>

		<!--
			Keyed on the name, not on a timer: a changed key remounts the element and replays the CSS
			fade, so the sting says itself once and this component owns no state at all. A `setTimeout`
			here would be a second clock in a codebase whose whole point is that there is one.
		-->
		<p
			v-if="food.lastLostNameKey !== null"
			:key="food.lastLostNameKey"
			class="lost"
		>
			{{ t('hud.lastLost', { item: t(food.lastLostNameKey) }) }}
		</p>
	</div>
</template>

<script setup lang="ts">
	import { computed } from 'vue'
	import { useI18n } from 'vue-i18n'
	import type { HudSnapshot } from '@/ui/viewModel.ts'

	/**
	 * Clock, wave, wallet, noise and food, in one floating panel rather than a full-width bar: the
	 * board is the brightest thing on screen and chrome floats at its edges (DECISIONS.md section 1).
	 *
	 * There is exactly one shelf of food glyphs and it is the canvas one -- `render/layers/fridge.ts`
	 * has drawn it since step 5C and `effects.ts` animates a theft out of its slot. This bar shows the
	 * count and **the name of what just went**, which is the half the canvas cannot say.
	 */

	const { clock, wave, crumbs, crumbsOnBoard, groceryMoney, food, noise } = defineProps<{
		clock: HudSnapshot['clock']
		wave: HudSnapshot['wave']
		crumbs: number
		crumbsOnBoard: HudSnapshot['crumbsOnBoard']
		groceryMoney: number
		food: HudSnapshot['food']
		noise: HudSnapshot['noise']
	}>()

	const { t } = useI18n()

	/** `2:5am` is a typo on screen; the clock is the one place a raw number needs padding. */
	const minute = computed(() => String(clock.minute).padStart(2, '0'))

	const foodFraction = computed(() => (food.total === 0 ? 0 : (food.remaining / food.total) * 100))
	const noiseFraction = computed(() => (noise.cap === 0 ? 0 : (noise.level / noise.cap) * 100))
</script>

<style scoped>
	.top-bar {
		position: absolute;
		top: 0.6rem;
		left: 50%;
		display: grid;
		justify-items: center;
		gap: 0.3rem;
		transform: translateX(-50%);
		text-align: center;
	}

	.panel {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--kd-panel-edge);
		border-radius: 999px;
		background: var(--kd-panel);
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.clock {
		color: var(--kd-text);
		letter-spacing: 0.04em;
	}

	.wave {
		color: var(--kd-text-dim);
	}

	.divider {
		width: 1px;
		height: 1.4rem;
		background: var(--kd-panel-edge);
	}

	.reading {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		color: var(--kd-text-dim);
	}

	.glyph {
		font-size: 0.9rem;
	}

	.reading b {
		color: var(--kd-owned);
		font-weight: 600;
	}

	/* The crumbs still lying on the floor: yours, but not yet in the wallet. */
	.reading i {
		color: var(--kd-owned-dim);
		font-style: normal;
	}

	.meter {
		display: block;
		overflow: hidden;
		width: 3.5rem;
		height: 0.3rem;
		border-radius: 999px;
		background: rgba(139, 144, 168, 0.25);
	}

	.meter-fill {
		display: block;
		height: 100%;
		border-radius: 999px;
	}

	.meter-fill.threat {
		background: var(--kd-threat);
	}

	.meter-fill.owned {
		background: var(--kd-owned);
	}

	.food {
		display: grid;
		grid-template-columns: auto auto;
		align-items: baseline;
		gap: 0 0.5rem;
	}

	.food-label {
		color: var(--kd-text-dim);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.food-count {
		color: var(--kd-owned);
		font-size: 1.35rem;
		font-weight: 600;
		line-height: 1.1;
	}

	.food-meter {
		grid-column: 1 / -1;
		width: 100%;
		margin-top: 0.15rem;
	}

	.lost {
		margin: 0;
		color: var(--kd-danger);
		font-size: 0.8rem;
		letter-spacing: 0.02em;
		animation: lost-fade 4s ease-out forwards;
	}

	@keyframes lost-fade {
		0% {
			opacity: 0;
			transform: translateY(-0.25rem);
		}

		12% {
			opacity: 1;
			transform: translateY(0);
		}

		70% {
			opacity: 1;
		}

		100% {
			opacity: 0;
		}
	}
</style>
