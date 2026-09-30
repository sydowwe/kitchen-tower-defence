<template>
	<section class="night">
		<h2 class="title">{{ t('kitchen.preview.title', { n: preview.night }) }}</h2>
		<p class="where">
			{{ t('kitchen.preview.where', { map: t(preview.mapNameKey), waves: preview.waveCount }) }}
		</p>

		<h3>{{ t('loadout.coming') }}</h3>
		<ul class="enemies">
			<li
				v-for="enemy in preview.enemies"
				:key="enemy.id"
				class="enemy"
			>
				<span
					class="glyph"
					aria-hidden="true"
				>
					<EntityGlyph :glyph="enemy.glyph" />
				</span>
				<div class="about">
					<p class="line">
						<span class="name">{{ t(enemy.nameKey) }}</span>
						<span class="count">{{ t('loadout.count', { n: enemy.count }) }}</span>
						<span
							v-if="introduced.has(enemy.id)"
							class="new"
						>
							{{ t('loadout.new') }}
						</span>
					</p>
					<p class="wave">{{ t('loadout.fromWave', { n: enemy.firstWave }) }}</p>
					<ul class="tags">
						<li
							v-for="tagKey in enemy.tagKeys"
							:key="tagKey"
						>
							{{ t(tagKey) }}
						</li>
					</ul>
				</div>
			</li>
		</ul>
	</section>
</template>

<script setup lang="ts">
	import { computed } from 'vue'
	import { useI18n } from 'vue-i18n'
	import EntityGlyph from '@/ui/components/EntityGlyph.vue'
	import type { NightPreviewView } from '@/ui/kitchenView.ts'

	/**
	 * Everything tonight sends, once each, in the order it first turns up, with every tag the tooltip
	 * would print. This is what the counter is chosen from (DECISIONS.md section 10), so it is the
	 * whole night and not only what is new.
	 */

	const { preview } = defineProps<{
		preview: NightPreviewView
	}>()

	const { t } = useI18n()

	const introduced = computed(() => new Set(preview.introduces.map(entry => entry.id)))
</script>

<style scoped>
	.night {
		display: grid;
		align-content: start;
		gap: 0.5rem;
		padding: 1rem 1.1rem;
		border: 1px solid var(--kd-day-card-edge);
		border-radius: 0.75rem;
		background: var(--kd-day-card);
		color: var(--kd-day-ink);
	}

	.title {
		margin: 0;
		font-size: 1.15rem;
		font-weight: 600;
	}

	.where {
		margin: 0;
		color: var(--kd-day-ink-dim);
		font-size: 0.85rem;
	}

	h3 {
		margin: 0.4rem 0 0;
		color: var(--kd-day-ink-dim);
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.enemies {
		display: grid;
		gap: 0.7rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.enemy {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.6rem;
		align-items: start;
	}

	.glyph {
		font-size: 1.6rem;
		line-height: 1.1;
	}

	.about {
		display: grid;
		gap: 0.15rem;
	}

	.line,
	.wave {
		margin: 0;
	}

	.line {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.2rem 0.5rem;
	}

	.name {
		font-size: 0.92rem;
		font-weight: 600;
	}

	.count {
		color: var(--kd-day-ink-dim);
		font-size: 0.85rem;
		font-variant-numeric: tabular-nums;
	}

	.new {
		padding: 0.05rem 0.4rem;
		border-radius: 999px;
		background: var(--kd-day-danger);
		color: var(--kd-day-card);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.wave {
		color: var(--kd-day-ink-dim);
		font-size: 0.75rem;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin: 0.15rem 0 0;
		padding: 0;
		list-style: none;
	}

	.tags li {
		padding: 0.05rem 0.45rem;
		border: 1px solid var(--kd-day-card-edge);
		border-radius: 999px;
		color: var(--kd-day-ink);
		font-size: 0.7rem;
	}
</style>
