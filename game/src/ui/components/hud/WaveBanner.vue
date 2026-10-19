<template>
	<!--
		Keyed on the wave it announces, like `ThiefCard.vue`: each wave says itself once and fades, and a
		retry that reaches the same wave says it again.
	-->
	<p
		:key="banner.waveIndex"
		class="wave"
		:class="banner.moment"
	>
		<span
			v-if="lead !== null"
			class="lead"
		>
			{{ lead }}
		</span>
		<span class="title">{{ title }}</span>
		<span
			v-if="line !== null"
			class="line"
		>
			{{ line }}
		</span>
	</p>
</template>

<script setup lang="ts">
	import { computed } from 'vue'
	import { useI18n } from 'vue-i18n'
	import type { WaveBannerView } from '@/ui/viewModel.ts'

	/**
	 * A wave arriving (step 23B, decision 6). One slot with the thief's card and the modifier's: a wave
	 * that brings a thief puts up the thief's card instead of this one, and `HudLayer.vue` shows whichever
	 * went up last.
	 *
	 * No buttons and no pointer events, like the cards it shares the slot with.
	 */

	const { banner } = defineProps<{ banner: WaveBannerView }>()

	const { t } = useI18n()

	/** The hour, said the way the top bar says it -- except on the last wave, whose line is the hour. */
	const lead = computed(() => {
		if (banner.moment === 'last') {
			return t('waveBanner.lastLead')
		}
		if (banner.clock === null) {
			return null
		}
		const minute = String(banner.clock.minute).padStart(2, '0')
		return t('hud.clock', { hour: banner.clock.hour, minute })
	})

	const title = computed(() => {
		if (banner.moment === 'last') {
			return t('waveBanner.lastTitle')
		}
		const n = banner.waveIndex + 1
		return banner.waveCount === null
			? t('waveBanner.titleRun', { n })
			: t('waveBanner.title', { n, total: banner.waveCount })
	})

	const line = computed(() => {
		if (banner.moment === 'last') {
			return t('waveBanner.lastLine')
		}
		return banner.moment === 'first' ? t('waveBanner.firstLine') : null
	})
</script>

<style scoped>
	/* The thief card's slot and the thief card's shape, so the three cards that share it read as one thing. */
	.wave {
		position: absolute;
		top: 7.4rem;
		left: 50%;
		display: grid;
		justify-items: center;
		gap: 0.15rem;
		margin: 0;
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--kd-panel-edge);
		border-radius: var(--kd-radius);
		background: var(--kd-panel);
		text-align: center;
		white-space: nowrap;
		animation: wave-fade 3.2s ease-out forwards;
		pointer-events: none;
	}

	/* The night beginning is worth a little longer than a count. */
	.first {
		animation-duration: 4.5s;
	}

	.lead {
		color: var(--kd-text-dim);
		font-size: 0.65rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.title {
		color: var(--kd-text);
		font-size: 0.9rem;
	}

	.line {
		color: var(--kd-text-dim);
		font-size: 0.8rem;
	}

	/*
		The flourish: the last wave stays up longest, its line is in the lamp's colour, and a rule of the
		same light draws itself out under it from the middle. Warm and slow, the first grey of the morning,
		not a fanfare.
	*/
	.last {
		padding: 0.6rem 1.2rem 0.7rem;
		border-color: var(--kd-lamp);
		box-shadow: 0 0 1.2rem -0.2rem var(--kd-lamp);
		animation-duration: 6.5s;
	}

	.last .title {
		color: var(--kd-lamp);
		font-size: 1rem;
	}

	.last .title::after {
		display: block;
		height: 1px;
		margin-top: 0.35rem;
		background: var(--kd-lamp);
		content: '';
		transform-origin: center;
		animation: wave-rule 1.4s ease-out 0.3s both;
	}

	@keyframes wave-fade {
		0% {
			opacity: 0;
			transform: translateX(-50%) translateY(-0.3rem);
		}

		8% {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}

		75% {
			opacity: 1;
		}

		100% {
			opacity: 0;
			transform: translateX(-50%);
		}
	}

	@keyframes wave-rule {
		from {
			transform: scaleX(0);
		}

		to {
			transform: scaleX(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.last .title::after {
			animation: none;
		}
	}
</style>
