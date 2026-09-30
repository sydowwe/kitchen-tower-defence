<template>
	<div class="shop">
		<p class="heading">{{ t('hud.shop') }}</p>
		<ul class="row">
			<li
				v-for="entry in entries"
				:key="entry.id"
				class="entry"
			>
				<button
					type="button"
					class="tower"
					:class="{ armed: entry.id === selectedDefId, poor: entry.unlocked && !entry.affordable }"
					:disabled="!entry.unlocked"
					:title="t(entry.nameKey)"
					@click="emit('select', entry.id)"
				>
					<!-- An empty badge still holds its line, so a locked button is the same height. -->
					<span class="key">{{ entry.hotkey ?? '' }}</span>
					<span class="glyph">{{ entry.glyph }}</span>
					<span class="cost">
						<template v-if="entry.unlocked">🍞 {{ entry.cost }}</template>
						<template v-else-if="entry.unlockNight !== null">
							{{ t('hud.unlocksOnNight', { n: entry.unlockNight }) }}
						</template>
						<FontAwesomeIcon
							v-else
							icon="lock"
						/>
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
	 * The counter's worth of towers, in the order they unlock -- `shopOrder` in `viewModel.ts` -- so a
	 * new tower lands at the end and never moves a key the player has already learned. The badge is
	 * `entry.hotkey`, off the same list the keydown handler indexes; nothing here counts positions.
	 *
	 * An unaffordable tower **dims but stays live**: the player is saving for it and wants to read it,
	 * and arming one costs nothing because step 8C's click check refuses the placement with a reason.
	 * A locked tower is the one that is genuinely disabled, with the night it arrives where its price
	 * would be.
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
		/* `max-content` and not the shrink-to-fit default: from `left: 50%` that default is half the
		   board, and the row would wrap at seven towers. The cap is what wraps it on a narrow window
		   instead of running fourteen off both edges (step 16B). */
		width: max-content;
		max-width: calc(100% - 1.5rem);
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
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.4rem;
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
		width: 3.9rem;
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
		min-height: 1lh;
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

	.tower:disabled .cost {
		color: var(--kd-text-dim);
		white-space: nowrap;
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
