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
				:title="t('hud.noiseLevel', { level: Math.round(noise.level), cap: noise.cap })"
			>
				<FontAwesomeIcon
					:icon="noise.level > 0 ? 'volume-high' : 'volume-xmark'"
					:class="{ loud }"
				/>
				<span class="meter-wrap">
					<span class="meter">
						<span
							class="meter-fill"
							:class="{ pulsing: loud }"
							:style="{ width: `${noiseFraction}%`, background: noiseColour }"
						/>
						<!-- The creak mark: the meter has a top, and this is where it is. -->
						<span class="cap-mark" />
					</span>
					<!--
						Keyed on the count, never on a timer: a changed key remounts the element and replays
						the CSS animation, the same trick `food.lastLost` uses below. One ripple per
						publish rather than one per shot -- see `HudSnapshot.noise.loudShots`.
					-->
					<span
						v-if="noise.loudShots > 0"
						:key="noise.loudShots"
						class="ripple"
					/>
				</span>
				<span
					class="creak"
					:class="{ showing: loud }"
				>
					{{ t('hud.noiseCreak') }}
				</span>
			</span>

			<span class="divider" />

			<!-- The health bar. Nothing else in this bar is allowed to compete with it. -->
			<span class="food">
				<span class="food-label">{{ t('hud.food') }}</span>
				<b class="food-count">
					{{ t('hud.foodCount', { remaining: food.remaining, total: food.total }) }}
					<!-- Off the shelf and not gone yet: carried, or on the floor. Still yours to win back. -->
					<i
						v-if="food.atRisk > 0"
						class="at-risk"
						:title="t('hud.foodAtRiskTitle')"
					>
						{{ t('hud.foodAtRisk', { n: food.atRisk }) }}
					</i>
				</b>
				<span class="meter food-meter">
					<span
						class="meter-fill owned"
						:style="{ width: `${foodFraction}%` }"
					/>
					<span
						class="meter-fill at-risk-fill"
						:style="{ width: `${atRiskFraction}%` }"
					/>
				</span>
			</span>
		</div>

		<!--
			Keyed on the loss's running count, not on a timer and not on a name: a changed key remounts the
			element and replays the CSS fade, so the sting says itself once and this component owns no
			state at all. Two cheeses lost in a row are two keys; a name key would never replay the second.
		-->
		<p
			v-if="food.lastLost !== null"
			:key="food.lastLost.id"
			class="lost"
		>
			{{ lostLine }}
		</p>

		<!-- A wave ahead, like the mini-boss it is: says who, and leaves the rest to the player. -->
		<p
			v-if="upcomingThief !== null"
			class="warning"
		>
			{{ t('hud.thiefWarning', { thief: t(upcomingThief.nameKey) }) }}
		</p>
	</div>
</template>

<script setup lang="ts">
	import { computed } from 'vue'
	import { useI18n } from 'vue-i18n'
	import { joinNames } from '@/ui/joinNames.ts'
	import type { HudSnapshot } from '@/ui/viewModel.ts'

	/**
	 * Clock, wave, wallet, noise and food, in one floating panel rather than a full-width bar: the
	 * board is the brightest thing on screen and chrome floats at its edges (DECISIONS.md section 1).
	 *
	 * There is exactly one shelf of food glyphs and it is the canvas one -- `render/layers/fridge.ts`
	 * has drawn it since step 5C and `effects.ts` animates a theft out of its slot. This bar shows the
	 * count and **the name of what just went**, which is the half the canvas cannot say.
	 */

	const { clock, wave, crumbs, crumbsOnBoard, groceryMoney, food, noise, upcomingThief } = defineProps<{
		clock: HudSnapshot['clock']
		wave: HudSnapshot['wave']
		crumbs: number
		crumbsOnBoard: HudSnapshot['crumbsOnBoard']
		groceryMoney: number
		food: HudSnapshot['food']
		noise: HudSnapshot['noise']
		upcomingThief: HudSnapshot['upcomingThief']
	}>()

	const { t } = useI18n()

	/** Every item the loss took, by name; and who carried them off, when something did. */
	const lostLine = computed(() => {
		const loss = food.lastLost
		if (loss === null) {
			return ''
		}
		const items = joinNames(
			loss.nameKeys.map(key => t(key)),
			t('night.listSeparator'),
			t('general.and'),
		)
		return loss.thiefNameKey === null
			? t('hud.lastLost', { item: items })
			: t('hud.thiefGotAway', { thief: t(loss.thiefNameKey), items })
	})

	/**
	 * Where the meter stops being a reading and starts being the thing you are looking at, as a
	 * percentage. Past it the bar warms, pulses, and says so in a word (step 13B, decision 4).
	 */
	const PULSE_AT = 70

	/** `2:5am` is a typo on screen; the clock is the one place a raw number needs padding. */
	const minute = computed(() => String(clock.minute).padStart(2, '0'))

	const foodFraction = computed(() => (food.total === 0 ? 0 : (food.remaining / food.total) * 100))
	/** Drawn after the shelf's fill in a dimmer, striped band: gone from the fridge, not yet gone for good. */
	const atRiskFraction = computed(() => (food.total === 0 ? 0 : (food.atRisk / food.total) * 100))
	const noiseFraction = computed(() => (noise.cap === 0 ? 0 : (noise.level / noise.cap) * 100))

	const loud = computed(() => noiseFraction.value >= PULSE_AT)

	/**
	 * Calm below the threshold and continuously warmer above it: amber at 70%, and all the way over to
	 * the danger colour at the cap.
	 *
	 * **Rounded to whole percent** so the string only changes when the colour visibly does. It is
	 * rebuilt at 15Hz, and an unrounded mix writes a new `style` attribute to the DOM every publish for
	 * a difference nobody can see.
	 *
	 * Deliberately not red: this is a kitchen at 2am, not a fail state (DECISIONS.md section 1).
	 */
	const noiseColour = computed(() => {
		if (!loud.value) {
			return 'var(--kd-threat)'
		}
		const hot = Math.round(Math.min(1, (noiseFraction.value - PULSE_AT) / (100 - PULSE_AT)) * 100)
		return `color-mix(in oklab, var(--kd-lamp), var(--kd-danger) ${hot}%)`
	})
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
		position: relative;
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

	.meter-fill.owned {
		background: var(--kd-owned);
	}

	/* The noise meter, and the ripple that has to be able to leave its edges. */
	.meter-wrap {
		position: relative;
		display: block;
	}

	/*
		Slow enough to read as tension rather than as an alarm, and a dip in opacity rather than a jump
		in size: the board is the brightest thing on screen and the chrome floats at its edges, so this
		bar must never become the brightest object on it (DECISIONS.md section 1).
	*/
	.meter-fill.pulsing {
		animation: noise-pulse 1.7s ease-in-out infinite;
	}

	@keyframes noise-pulse {
		0%,
		100% {
			opacity: 1;
		}

		50% {
			opacity: 0.55;
		}
	}

	/* Understated on purpose: it says the meter has a top, it does not shout about it. */
	.cap-mark {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		width: 1px;
		background: rgba(232, 230, 240, 0.45);
	}

	.ripple {
		position: absolute;
		inset: -0.22rem;
		border: 1px solid var(--kd-lamp);
		border-radius: 999px;
		opacity: 0;
		animation: noise-ripple 460ms ease-out forwards;
		pointer-events: none;
	}

	@keyframes noise-ripple {
		0% {
			opacity: 0.75;
			transform: scaleX(0.92) scaleY(0.6);
		}

		100% {
			opacity: 0;
			transform: scaleX(1.06) scaleY(1.9);
		}
	}

	/*
		Rendered at every level and only *shown* past the threshold: appearing would reflow the whole
		bar, and a top bar that jumps sideways at 70% is worse than the word it was trying to add.
	*/
	.creak {
		color: var(--kd-danger);
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		opacity: 0;
		transition: opacity 600ms ease;
	}

	.creak.showing {
		opacity: 0.85;
	}

	.noise .loud {
		color: var(--kd-danger);
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

	/* Flex, so the at-risk band sits after the shelf's fill instead of under it. */
	.food-meter {
		display: flex;
		grid-column: 1 / -1;
		width: 100%;
		margin-top: 0.15rem;
	}

	.food-meter .meter-fill {
		flex: none;
	}

	.at-risk-fill {
		background: repeating-linear-gradient(-45deg, var(--kd-danger) 0 0.18rem, transparent 0.18rem 0.36rem);
		opacity: 0.8;
	}

	.at-risk {
		margin-left: 0.3rem;
		color: var(--kd-danger);
		font-size: 0.75rem;
		font-style: normal;
		font-weight: 500;
	}

	/*
		Standing, not fading: it is true for the whole of the wave before and its countdown, and the
		player may want to read it again after placing something. The slow breath is the only thing that
		says it is a warning rather than a label.
	*/
	.warning {
		margin: 0;
		padding: 0.25rem 0.7rem;
		border: 1px solid var(--kd-panel-edge);
		border-radius: 999px;
		background: var(--kd-panel);
		color: var(--kd-lamp);
		font-size: 0.78rem;
		letter-spacing: 0.02em;
		animation: warning-breath 2.4s ease-in-out infinite;
	}

	@keyframes warning-breath {
		0%,
		100% {
			opacity: 1;
		}

		50% {
			opacity: 0.6;
		}
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
