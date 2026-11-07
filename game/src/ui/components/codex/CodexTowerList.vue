<template>
	<section class="towers">
		<header class="head">
			<h2>{{ t('codex.towers') }}</h2>
			<p class="count">{{ t('codex.count', { seen, total: towers.length }) }}</p>
		</header>
		<ul class="entries">
			<li
				v-for="tower in towers"
				:key="tower.id"
			>
				<CodexCard
					v-if="tower.discovered"
					:glyph="tower.glyph"
				>
					<h3>{{ t(tower.nameKey) }}</h3>
					<p class="kind">
						{{ t(`loadout.role.${tower.role}`) }} · {{ t(`codex.placement.${tower.placement}`) }} ·
						{{ t('hud.cost', { n: tower.cost }) }}
					</p>
					<StatCard
						:stats="tower.stats"
						:descriptionKey="tower.descriptionKey"
						tone="day"
					/>
					<div class="tiers">
						<span class="tiers-label">{{ t('codex.tiers') }}</span>
						<ol>
							<li
								v-for="tierKey in tower.tierNameKeys"
								:key="tierKey"
							>
								{{ t(tierKey) }}
							</li>
						</ol>
					</div>
				</CodexCard>
				<CodexCard
					v-else
					:glyph="tower.glyph"
					unknown
				>
					<p class="unseen">
						{{
							tower.arrivesNight === null
								? t('codex.unseen')
								: t('codex.arrives', { n: tower.arrivesNight })
						}}
					</p>
				</CodexCard>
			</li>
		</ul>
	</section>
</template>

<script setup lang="ts">
	import { computed } from 'vue'
	import { useI18n } from 'vue-i18n'
	import CodexCard from '@/ui/components/codex/CodexCard.vue'
	import StatCard from '@/ui/components/hud/StatCard.vue'
	import type { CodexTowerView } from '@/ui/codexView.ts'

	/** Every tower in the order it arrives, the ones not seen yet as a shape and a night. */

	const { towers } = defineProps<{
		towers: CodexTowerView[]
	}>()

	const { t } = useI18n()

	const seen = computed(() => towers.filter(tower => tower.discovered).length)
</script>

<style scoped>
	.towers {
		display: grid;
		gap: 0.6rem;
	}

	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
	}

	h2 {
		margin: 0;
		color: var(--kd-day-ink-dim);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.count {
		margin: 0;
		color: var(--kd-day-ink-dim);
		font-size: 0.85rem;
		font-variant-numeric: tabular-nums;
	}

	.entries {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(19rem, 1fr));
		gap: 0.7rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}

	.kind {
		margin: 0;
		color: var(--kd-day-ink-dim);
		font-size: 0.75rem;
	}

	.tiers {
		display: grid;
		gap: 0.15rem;
		font-size: 0.75rem;
	}

	.tiers-label {
		color: var(--kd-day-ink-dim);
	}

	.tiers ol {
		margin: 0;
		padding-left: 1.2rem;
	}

	.unseen {
		margin: 0;
		color: var(--kd-day-ink-dim);
		font-size: 0.85rem;
		font-style: italic;
	}
</style>
