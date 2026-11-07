<template>
	<section class="enemies">
		<header class="head">
			<h2>{{ t('codex.enemies') }}</h2>
			<p class="count">{{ t('codex.count', { seen, total: enemies.length }) }}</p>
		</header>
		<ul class="entries">
			<li
				v-for="enemy in enemies"
				:key="enemy.id"
			>
				<CodexCard
					v-if="enemy.discovered"
					:glyph="enemy.glyph"
					:focused="enemy.id === focusId"
				>
					<h3>{{ t(enemy.nameKey) }}</h3>
					<ul class="tags">
						<li
							v-for="tagKey in enemy.tagKeys"
							:key="tagKey"
						>
							{{ t(tagKey) }}
						</li>
					</ul>
					<p class="desc">{{ t(enemy.descriptionKey) }}</p>
					<dl>
						<dt>{{ t('hud.stat.hitPoints') }}</dt>
						<dd>{{ enemy.hp }}</dd>
						<dt>{{ t('codex.enemy.speed') }}</dt>
						<dd>
							{{
								enemy.speedTilesPerSecond === 0
									? t('codex.enemy.stationary')
									: enemy.speedTilesPerSecond
							}}
						</dd>
						<dt>{{ t('codex.enemy.worth') }}</dt>
						<dd>{{ enemy.reward }}</dd>
						<dt>{{ t('codex.enemy.steals') }}</dt>
						<dd>{{ enemy.steals === 0 ? t('codex.enemy.stealsNothing') : enemy.steals }}</dd>
						<dt>{{ t('codex.enemy.firstSeen') }}</dt>
						<dd>{{ t('codex.enemy.firstSeenValue', { n: enemy.firstNight }) }}</dd>
					</dl>
					<!-- The grid's colours on the grid's dark, for its reason: see CodexGrid.vue. -->
					<ul class="hits">
						<li
							v-for="row in enemy.damage"
							:key="row.damageType"
							:class="row.band"
							:title="t(`hud.damage.${row.damageType}`)"
						>
							<FontAwesomeIcon
								:icon="DAMAGE_ICONS[row.damageType]"
								:aria-label="t(`hud.damage.${row.damageType}`)"
							/>
							<span>{{ t('hud.enemyTooltip.multiplier', { n: row.multiplier }) }}</span>
						</li>
					</ul>
				</CodexCard>
				<CodexCard
					v-else
					:glyph="enemy.glyph"
					unknown
				>
					<p class="unseen">{{ t('codex.unseen') }}</p>
				</CodexCard>
			</li>
		</ul>
	</section>
</template>

<script setup lang="ts">
	import { computed } from 'vue'
	import { useI18n } from 'vue-i18n'
	import CodexCard from '@/ui/components/codex/CodexCard.vue'
	import { DAMAGE_ICONS } from '@/ui/icons.ts'
	import type { CodexEnemyView, DefId } from '@/ui/codexView.ts'

	/**
	 * Every enemy in the order it first turns up, each with its own five multipliers: the grid's rows,
	 * multiplied out for this one bug. The ones not seen yet are a shape and nothing else.
	 */

	const { enemies, focusId = null } = defineProps<{
		enemies: CodexEnemyView[]
		/** The enemy the notebook was opened on, off the route. A silhouette ignores it. */
		focusId?: DefId | null
	}>()

	const { t } = useI18n()

	const seen = computed(() => enemies.filter(enemy => enemy.discovered).length)
</script>

<style scoped>
	.enemies {
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

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.tags li {
		padding: 0.05rem 0.45rem;
		border: 1px solid var(--kd-day-card-edge);
		border-radius: 999px;
		font-size: 0.7rem;
	}

	.desc {
		margin: 0;
		color: var(--kd-day-ink-dim);
		font-size: 0.75rem;
		font-style: italic;
		line-height: 1.45;
	}

	dl {
		display: grid;
		grid-template-columns: auto auto;
		gap: 0 0.9rem;
		margin: 0;
		font-size: 0.75rem;
		line-height: 1.45;
	}

	dt {
		color: var(--kd-day-ink-dim);
	}

	dd {
		margin: 0;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.hits {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.3rem 0.5rem;
		margin: 0.15rem 0 0;
		padding: 0.35rem 0.55rem;
		border-radius: var(--kd-radius);
		background: var(--kd-night);
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		list-style: none;
	}

	.hits li {
		display: flex;
		align-items: center;
		gap: 0.2rem;
	}

	.weak {
		color: var(--kd-hit-weak);
	}

	.neutral {
		color: var(--kd-hit-neutral);
	}

	.strong {
		color: var(--kd-hit-strong);
		font-weight: 600;
	}

	.unseen {
		margin: 0;
		color: var(--kd-day-ink-dim);
		font-size: 0.85rem;
		font-style: italic;
	}
</style>
