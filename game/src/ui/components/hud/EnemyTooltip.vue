<template>
	<div
		class="tooltip"
		:style="placement"
	>
		<header>
			<span class="glyph">{{ tooltip.glyph }}</span>
			<span class="name">{{ t(tooltip.nameKey) }}</span>
			<span class="hp">{{ t('hud.enemyTooltip.hp', { hp: tooltip.hp, max: tooltip.maxHp }) }}</span>
		</header>
		<p class="tags">{{ tooltip.tagKeys.map(key => t(key)).join(' · ') }}</p>
		<ul class="matrix">
			<li
				v-for="row in tooltip.damage"
				:key="row.damageType"
				:class="row.band"
				:title="t(`hud.damage.${row.damageType}`)"
			>
				<FontAwesomeIcon
					:icon="ICONS[row.damageType]"
					:aria-label="t(`hud.damage.${row.damageType}`)"
				/>
				<span>{{ t('hud.enemyTooltip.multiplier', { n: row.multiplier }) }}</span>
			</li>
		</ul>
		<p
			v-if="tooltip.burrowed"
			class="state"
		>
			{{ t('hud.enemyTooltip.burrowed') }}
		</p>
		<!-- The same slot as the burrowed line: a stopped Ant is the one enemy a player hovers to ask why. -->
		<p
			v-else-if="tooltip.feeding"
			class="state"
		>
			{{ t('hud.enemyTooltip.feeding') }}
		</p>
		<!-- What a thief is doing: the one enemy whose errand changes halfway down the track. -->
		<p
			v-else-if="tooltip.thiefPhase !== null"
			class="state"
		>
			{{ t(`hud.enemyTooltip.thief.${tooltip.thiefPhase}`) }}
		</p>
	</div>
</template>

<script setup lang="ts">
	import { computed } from 'vue'
	import { useI18n } from 'vue-i18n'
	import type { DamageType, EnemyTooltipView } from '@/ui/viewModel.ts'

	/**
	 * The hovered enemy, and what each damage type does to it right now: the matrix, one enemy at a
	 * time, which is how the counter system gets learned without a tutorial.
	 *
	 * **It never takes pointer events.** It sits beside the cursor, and one that caught the pointer
	 * would fire `pointerleave` on the canvas, drop the latch, vanish, hand the pointer back and
	 * reappear: a flicker that looks like a hover bug.
	 *
	 * Placed as a percentage of the HUD layer, which is the board's exact size, so it lines up at any
	 * window size. Offset to the side of the glyph so it never covers what it describes, and flipped
	 * to the left in the right third of the board so it never runs off the edge.
	 */

	const { tooltip } = defineProps<{ tooltip: EnemyTooltipView }>()

	const { t } = useI18n()

	/** One per type, keyed by the literal, so a sixth type fails here rather than rendering blank. */
	const ICONS: Record<DamageType, string> = {
		physical: 'hand-fist',
		fire: 'fire',
		cold: 'snowflake',
		chemical: 'flask',
		electric: 'bolt',
	}

	/** Tiles between the enemy's centre and the near edge of the card: clear of its glyph. */
	const OFFSET_TILES = 0.6
	/** Past this fraction of the board's width the card goes on the enemy's left instead. */
	const FLIP_AT = 0.7

	const placement = computed(() => {
		const { at, widthTiles, heightTiles } = tooltip
		// Waypoint space puts tile centres on integers; the board's percentages run off tile corners.
		const x = at.x + 0.5
		const top = `${((at.y + 0.5) / heightTiles) * 100}%`

		if (x > widthTiles * FLIP_AT) {
			return { top, right: `${((widthTiles - x + OFFSET_TILES) / widthTiles) * 100}%` }
		}
		return { top, left: `${((x + OFFSET_TILES) / widthTiles) * 100}%` }
	})
</script>

<style scoped>
	.tooltip {
		position: absolute;
		/* Never opts back in. See the component header. */
		pointer-events: none;
		transform: translateY(-50%);
		/* One publish is 1/15s. Linear over the same, so an Ant walking at publish rate is followed
		   smoothly and not trailed. */
		transition:
			left 67ms linear,
			right 67ms linear,
			top 67ms linear;
		display: grid;
		gap: 0.3rem;
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--kd-panel-edge);
		border-radius: var(--kd-radius);
		background: var(--kd-panel);
		color: var(--kd-text);
		font-size: 0.72rem;
		line-height: 1.35;
		white-space: nowrap;
	}

	header {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
	}

	.name {
		color: var(--kd-threat);
		font-weight: 600;
	}

	.hp {
		margin-left: auto;
		padding-left: 0.6rem;
		font-variant-numeric: tabular-nums;
	}

	.tags {
		margin: 0;
		color: var(--kd-text-dim);
	}

	.matrix {
		display: grid;
		grid-template-columns: repeat(5, auto);
		gap: 0.55rem;
		margin: 0;
		padding: 0;
		list-style: none;
		font-variant-numeric: tabular-nums;
	}

	.matrix li {
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

	.state {
		margin: 0;
		color: var(--kd-text-dim);
		font-style: italic;
	}
</style>
