<template>
	<section class="roster">
		<header class="head">
			<h2>{{ t('loadout.cupboard') }}</h2>
			<div
				class="filter"
				role="group"
			>
				<button
					type="button"
					class="chip"
					:class="{ on: active === null }"
					:aria-pressed="active === null"
					@click="filter = null"
				>
					{{ t('loadout.filterAll') }}
				</button>
				<button
					v-for="role in roles"
					:key="role"
					type="button"
					class="chip"
					:class="{ on: active === role }"
					:aria-pressed="active === role"
					@click="filter = role"
				>
					{{ t(`loadout.role.${role}`) }}
				</button>
			</div>
		</header>

		<ul class="entries">
			<li
				v-for="entry in shown"
				:key="entry.id"
				class="entry"
			>
				<button
					type="button"
					class="tower"
					:class="{ chosen: entry.chosen }"
					:aria-pressed="entry.chosen"
					@click="emit('toggle', entry.id)"
				>
					<span
						class="glyph"
						aria-hidden="true"
					>
						<EntityGlyph :glyph="entry.glyph" />
					</span>
					<span class="text">
						<span class="name">{{ t(entry.nameKey) }}</span>
						<span class="role">{{ t(`loadout.role.${entry.role}`) }}</span>
					</span>
					<span class="marks">
						<span
							v-if="entry.isNew"
							class="new"
						>
							{{ t('loadout.new') }}
						</span>
						<FontAwesomeIcon
							v-if="entry.chosen"
							class="check"
							icon="check"
						/>
					</span>
				</button>

				<!-- Rendered for every entry and shown by CSS on hover or focus: the shop's idiom, so the
					 card costs no state. -->
				<div class="card-slot">
					<StatCard
						:stats="entry.stats"
						:descriptionKey="entry.descriptionKey"
					/>
				</div>
			</li>
		</ul>
	</section>
</template>

<script setup lang="ts">
	import { computed, ref } from 'vue'
	import { useI18n } from 'vue-i18n'
	import EntityGlyph from '@/ui/components/EntityGlyph.vue'
	import StatCard from '@/ui/components/hud/StatCard.vue'
	import type { DefId, RosterTowerView, TowerRole } from '@/ui/loadoutView.ts'

	/**
	 * Every tower the player owns, in the shop's order, and the role filter over them. The filter is
	 * this component's own state and never the draft: a chosen tower it hides stays on the counter.
	 */

	const { roster, roles } = defineProps<{
		roster: RosterTowerView[]
		roles: TowerRole[]
	}>()

	const emit = defineEmits<{
		toggle: [id: DefId]
	}>()

	const { t } = useI18n()

	/** Null is everything. */
	const filter = ref<TowerRole | null>(null)

	/** A role that is no longer on the roster reads as everything, rather than as an empty list. */
	const active = computed(() => (filter.value !== null && roles.includes(filter.value) ? filter.value : null))

	const shown = computed(() => (active.value === null ? roster : roster.filter(entry => entry.role === active.value)))
</script>

<style scoped>
	.roster {
		display: grid;
		align-content: start;
		gap: 0.7rem;
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem 1rem;
	}

	h2 {
		margin: 0;
		color: var(--kd-day-ink-dim);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.filter {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.chip {
		padding: 0.2rem 0.6rem;
		border: 1px solid var(--kd-day-card-edge);
		border-radius: 999px;
		background: var(--kd-day-card);
		color: var(--kd-day-ink-dim);
		font: inherit;
		font-size: 0.75rem;
		cursor: pointer;
	}

	.chip:hover,
	.chip:focus-visible {
		color: var(--kd-day-ink);
	}

	.chip.on {
		border-color: var(--kd-day-owned);
		background: var(--kd-day-owned-soft);
		color: var(--kd-day-ink);
	}

	.entries {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.entry {
		position: relative;
	}

	.tower {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--kd-day-card-edge);
		border-radius: var(--kd-radius);
		background: var(--kd-day-card);
		color: var(--kd-day-ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition:
			border-color 120ms ease,
			background 120ms ease;
	}

	.tower:hover,
	.tower:focus-visible {
		border-color: var(--kd-day-owned);
	}

	.tower.chosen {
		border-color: var(--kd-day-owned);
		background: var(--kd-day-owned-soft);
	}

	.glyph {
		font-size: 1.7rem;
		line-height: 1;
	}

	.text {
		display: grid;
		min-width: 0;
	}

	.name {
		font-size: 0.9rem;
	}

	.role {
		color: var(--kd-day-ink-dim);
		font-size: 0.72rem;
	}

	.marks {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.new {
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
		background: var(--kd-day-owned);
		color: var(--kd-day-card);
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.check {
		color: var(--kd-day-owned);
	}

	.card-slot {
		position: absolute;
		top: calc(100% + 0.35rem);
		left: 0;
		z-index: 2;
		opacity: 0;
		pointer-events: none;
		transition: opacity 100ms ease;
	}

	.tower:hover + .card-slot,
	.tower:focus-visible + .card-slot {
		opacity: 1;
	}
</style>
