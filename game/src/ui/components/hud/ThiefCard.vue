<template>
	<!--
		Keyed on the wave it announces, not on a timer, like `WakeCard.vue` on the wake's id: the card says
		itself once and fades, and a retry that reaches the same wave says it again.
	-->
	<p
		:key="banner.waveIndex"
		class="thief"
	>
		<span class="title">{{ t('thief.bannerTitle', { thief: t(banner.nameKey) }) }}</span>
		<span class="line">{{ t('thief.bannerLine') }}</span>
	</p>
</template>

<script setup lang="ts">
	import { useI18n } from 'vue-i18n'
	import type { ThiefBannerView } from '@/ui/viewModel.ts'

	/**
	 * The Mouse's announcement, when the wave carrying it starts (step 19C, decision 9). Only the thief's:
	 * the general wave-start banner is step 23's.
	 *
	 * No buttons and no pointer events, like the wake card. The wave is running and the player's eyes
	 * belong on the track; this says what is coming down it and gets out of the way.
	 */

	const { banner } = defineProps<{ banner: ThiefBannerView }>()

	const { t } = useI18n()
</script>

<style scoped>
	/* Below the wake card's slot, so a wake and a Mouse in the same few seconds do not sit on each other. */
	.thief {
		position: absolute;
		top: 7.4rem;
		left: 50%;
		display: grid;
		justify-items: center;
		gap: 0.15rem;
		margin: 0;
		padding: 0.5rem 0.9rem;
		border: 1px solid var(--kd-panel-edge);
		border-radius: var(--kd-radius);
		background: var(--kd-panel);
		text-align: center;
		white-space: nowrap;
		animation: thief-fade 4.5s ease-out forwards;
		pointer-events: none;
	}

	.title {
		color: var(--kd-lamp);
		font-size: 0.9rem;
	}

	.line {
		color: var(--kd-text-dim);
		font-size: 0.8rem;
	}

	@keyframes thief-fade {
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
		}
	}
</style>
