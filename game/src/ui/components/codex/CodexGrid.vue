<template>
	<section class="grid">
		<h2>{{ t('codex.grid.title') }}</h2>
		<div class="scroll">
			<table>
				<thead>
					<tr>
						<td />
						<th
							v-for="damageType in grid.columns"
							:key="damageType"
							scope="col"
						>
							<FontAwesomeIcon :icon="DAMAGE_ICONS[damageType]" />
							<span class="column-name">{{ t(`hud.damage.${damageType}`) }}</span>
						</th>
					</tr>
				</thead>
				<tbody>
					<tr
						v-for="row in grid.rows"
						:key="row.tag"
					>
						<th scope="row">
							<span class="tag">{{ t(row.tagKey) }}</span>
							<span class="bugs">
								<span
									v-for="enemy in row.enemies"
									:key="enemy.id"
									:title="t(enemy.nameKey)"
								>
									<EntityGlyph :glyph="enemy.glyph" />
								</span>
							</span>
						</th>
						<td
							v-for="cell in row.cells"
							:key="cell.damageType"
							:class="cell.band"
						>
							{{ t('hud.enemyTooltip.multiplier', { n: cell.multiplier }) }}
						</td>
					</tr>
				</tbody>
			</table>
		</div>
		<p class="note">{{ t('codex.grid.note') }}</p>
	</section>
</template>

<script setup lang="ts">
	import { useI18n } from 'vue-i18n'
	import EntityGlyph from '@/ui/components/EntityGlyph.vue'
	import { DAMAGE_ICONS } from '@/ui/icons.ts'
	import type { CodexGridView } from '@/ui/codexView.ts'

	/**
	 * The matrix, as far as this kitchen has met it. Each row names the bugs it applies to, so it can be
	 * read as "which damage for which bug" without knowing the tags first.
	 *
	 * **On the night's own panel, in a daylight screen.** These are the board's colours, chosen for a dark
	 * background: on the day's paper `--kd-hit-neutral` all but disappears. This is where they get learned,
	 * so they stay exactly what the damage numbers are.
	 */

	const { grid } = defineProps<{
		grid: CodexGridView
	}>()

	const { t } = useI18n()
</script>

<style scoped>
	.grid {
		display: grid;
		gap: 0.6rem;
		padding: 0.9rem 1.1rem 1rem;
		border-radius: 0.75rem;
		background: var(--kd-night);
		color: var(--kd-text);
	}

	h2 {
		margin: 0;
		color: var(--kd-text-dim);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.scroll {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-variant-numeric: tabular-nums;
	}

	thead th {
		padding: 0.25rem 0.5rem 0.45rem;
		color: var(--kd-text-dim);
		font-size: 0.75rem;
		font-weight: 500;
	}

	.column-name {
		display: block;
		margin-top: 0.15rem;
	}

	tbody th {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.2rem 0.6rem;
		padding: 0.35rem 0.8rem 0.35rem 0;
		font-size: 0.85rem;
		font-weight: 500;
		text-align: left;
	}

	.bugs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem;
		font-size: 1rem;
	}

	tbody tr + tr {
		border-top: 1px solid var(--kd-panel-edge);
	}

	tbody td {
		padding: 0.35rem 0.5rem;
		font-size: 0.95rem;
		text-align: center;
	}

	.weak {
		color: var(--kd-hit-weak);
	}

	.neutral {
		color: var(--kd-hit-neutral);
	}

	/* Filled as well, so the good answers are what the eye lands on across a whole row. */
	.strong {
		background: color-mix(in srgb, var(--kd-hit-strong) 16%, transparent);
		color: var(--kd-hit-strong);
		font-weight: 600;
	}

	.note {
		margin: 0;
		color: var(--kd-text-dim);
		font-size: 0.78rem;
		font-style: italic;
	}
</style>
