<template>
	<div class="shop">
		<p class="heading">{{ t('hud.shop') }}</p>
		<ul class="row">
			<li
				v-for="(entry, index) in entries"
				:key="entry.id"
				class="entry"
			>
				<button
					type="button"
					class="tower"
					:class="{ armed: entry.id === selectedDefId, poor: !entry.affordable }"
					:disabled="!entry.unlocked"
					:title="t(entry.nameKey)"
					@click="emit('select', entry.id)"
				>
					<span class="key">{{ index + 1 }}</span>
					<span class="glyph">{{ entry.glyph }}</span>
					<span class="cost">
						<FontAwesomeIcon
							v-if="!entry.unlocked"
							icon="lock"
						/>
						<template v-else>🍞 {{ entry.cost }}</template>
					</span>
				</button>

				<!-- Absolute, above the row, and rendered for every entry: hover is CSS here, so the
					 card costs no state and an unaffordable tower reads exactly like an affordable one. -->
				<div class="card-slot">
					<StatCard
						:stats="entry.stats"
						:descriptionKey="entry.descriptionKey"
					/>
				</div>
			</li>
		</ul>
	</div>
</template>

<script setup lang="ts">
	import { useI18n } from 'vue-i18n'
	import StatCard from '@/ui/components/hud/StatCard.vue'
	import type { DefId, ShopEntry } from '@/ui/viewModel.ts'

	/**
	 * The counter's worth of towers, in `TOWERS` order -- which is the order the number keys bind to,
	 * so the badge on a button is the key that arms it.
	 *
	 * An unaffordable tower **dims but stays live**: the player is saving for it and wants to read it,
	 * and arming one costs nothing because step 8C's click check refuses the placement with a reason.
	 * A locked tower is the one that is genuinely disabled.
	 */

	const { selectedDefId = null } = defineProps<{
		entries: ShopEntry[]
		selectedDefId?: DefId | null
	}>()

	const emit = defineEmits<{ select: [defId: DefId] }>()

	const { t } = useI18n()
</script>

<style scoped>
	.shop {
		position: absolute;
		bottom: 0.75rem;
		left: 50%;
		display: grid;
		justify-items: center;
		gap: 0.3rem;
		transform: translateX(-50%);
	}

	.heading {
		margin: 0;
		color: var(--kd-text-dim);
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	.row {
		display: flex;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* Deliberately not positioned: the card below anchors to `.shop` and stays centred over the row,
	   so the rightmost tower's card cannot hang off the edge of the board. */
	.entry {
		position: static;
	}

	/* The one place in this component that opts back into input. Never the wrapper: a wrapper with
	   pointer events swallows every crumb click behind it. */
	.tower {
		display: grid;
		justify-items: center;
		gap: 0.1rem;
		width: 4.25rem;
		padding: 0.4rem 0.3rem 0.35rem;
		border: 1px solid var(--kd-panel-edge);
		border-radius: var(--kd-radius);
		background: var(--kd-panel);
		color: var(--kd-text-dim);
		font: inherit;
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
		pointer-events: auto;
		transition:
			background 120ms ease,
			border-color 120ms ease;
	}

	.tower:hover,
	.tower:focus-visible {
		border-color: var(--kd-owned-dim);
		background: var(--kd-panel-raise);
	}

	.tower.armed {
		border-color: var(--kd-owned);
		background: var(--kd-panel-raise);
		color: var(--kd-text);
	}

	.tower.poor {
		opacity: 0.5;
	}

	.tower:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.key {
		color: var(--kd-text-dim);
		font-size: 0.6rem;
		opacity: 0.7;
	}

	.glyph {
		font-size: 1.5rem;
		line-height: 1.1;
	}

	.cost {
		color: var(--kd-owned);
	}

	.tower.poor .cost {
		color: var(--kd-danger);
	}

	.card-slot {
		position: absolute;
		bottom: calc(100% + 0.5rem);
		left: 50%;
		opacity: 0;
		transform: translateX(-50%);
		transition: opacity 100ms ease;
	}

	.tower:hover + .card-slot,
	.tower:focus-visible + .card-slot {
		opacity: 1;
	}
</style>
