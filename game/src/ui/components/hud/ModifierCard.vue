<template>
	<!--
		Keyed on the world it was built for, like `ThiefCard.vue` on its wave: the card says itself once and
		fades, and a Retry that builds the night again says it again.
	-->
	<p
		:key="banner.worldCount"
		class="modifier"
	>
		<span class="lead">{{ t('nightModifier.lead') }}</span>
		<span class="title">
			<span aria-hidden="true">{{ banner.glyph }}</span>
			{{ t(banner.nameKey) }}
		</span>
		<span class="line">{{ t(banner.descriptionKey) }}</span>
	</p>
</template>

<script setup lang="ts">
	import { useI18n } from 'vue-i18n'
	import type { ModifierBannerView } from '@/ui/viewModel.ts'

	/**
	 * Tonight's modifier, said once as the night opens (step 21F, decision 4). In `ThiefCard.vue`'s spot:
	 * `HudLayer.vue` hides this one when the thief's card goes up, so the two never sit on each other.
	 * Step 23B folds both into one banner slot. The `TopBar` chip says it for the rest of the night.
	 */

	const { banner } = defineProps<{ banner: ModifierBannerView }>()

	const { t } = useI18n()
</script>

<style scoped>
	.modifier {
		position: absolute;
		top: 7.4rem;
		left: 50%;
		display: grid;
		justify-items: center;
		gap: 0.15rem;
		max-width: 26rem;
		margin: 0;
		padding: 0.55rem 1rem;
		border: 1px solid var(--kd-panel-edge);
		border-radius: var(--kd-radius);
		background: var(--kd-panel);
		text-align: center;
		animation: modifier-fade 6s ease-out forwards;
		pointer-events: none;
	}

	.lead {
		color: var(--kd-text-dim);
		font-size: 0.65rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.title {
		color: var(--kd-lamp);
		font-size: 0.95rem;
	}

	.line {
		color: var(--kd-text-dim);
		font-size: 0.8rem;
		line-height: 1.4;
	}

	@keyframes modifier-fade {
		0% {
			opacity: 0;
			transform: translateX(-50%) translateY(-0.3rem);
		}

		8% {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}

		80% {
			opacity: 1;
		}

		100% {
			opacity: 0;
			transform: translateX(-50%);
		}
	}
</style>
