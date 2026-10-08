<template>
	<div class="modifier">
		<span
			class="glyph"
			aria-hidden="true"
		>
			<EntityGlyph :glyph="modifier.glyph" />
		</span>
		<p class="text">
			<span class="lead">{{ t('nightModifier.lead') }}</span>
			<b class="name">{{ t(modifier.nameKey) }}</b>
			<span class="line">{{ t(modifier.descriptionKey) }}</span>
		</p>
	</div>
</template>

<script setup lang="ts">
	import { useI18n } from 'vue-i18n'
	import EntityGlyph from '@/ui/components/EntityGlyph.vue'
	import type { ModifierView } from '@/ui/kitchenView.ts'

	/**
	 * Tomorrow night's modifier, on the Kitchen's preview and the loadout screen's: glyph, name and its
	 * one line. One component, so the two screens cannot word it differently.
	 */

	const { modifier } = defineProps<{ modifier: ModifierView }>()

	const { t } = useI18n()
</script>

<style scoped>
	.modifier {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.6rem;
		align-items: start;
		padding: 0.55rem 0.7rem;
		border: 1px solid var(--kd-day-owned);
		border-radius: var(--kd-radius);
		background: var(--kd-day-owned-soft);
		color: var(--kd-day-ink);
	}

	.glyph {
		font-size: 1.5rem;
		line-height: 1.1;
	}

	.text {
		display: grid;
		gap: 0.1rem;
		margin: 0;
	}

	.lead {
		color: var(--kd-day-ink-dim);
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.name {
		font-size: 0.95rem;
		font-weight: 600;
	}

	.line {
		font-size: 0.82rem;
		line-height: 1.4;
	}
</style>
