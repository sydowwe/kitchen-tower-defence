<template>
	<main class="loadout">
		<div
			v-if="view === null"
			class="waiting"
		>
			<LoadState
				:failed="store.status === 'error'"
				@retry="store.retry"
			/>
		</div>

		<div
			v-else
			class="room"
		>
			<header class="head">
				<button
					type="button"
					class="back"
					@click="toKitchen"
				>
					{{ t('loadout.back') }}
				</button>
				<h1 class="title">{{ t('loadout.title') }}</h1>
			</header>

			<section class="bench">
				<div class="bench-head">
					<h2>{{ t('loadout.counter') }}</h2>
					<p class="room-line">{{ t('loadout.room', { used: view.counter.length, slots: view.slots }) }}</p>
				</div>

				<LoadoutCounter
					:counter="view.counter"
					:slots="view.slots"
					:blocked="view.blocked"
					@remove="toggle"
				/>

				<p
					class="note"
					aria-live="polite"
				>
					<template v-if="displacedName !== null">
						{{ t('loadout.displaced', { name: displacedName }) }}
					</template>
					<template v-else-if="view.problem !== null">
						{{ t(`loadout.problem.${view.problem}`) }}
					</template>
				</p>

				<div class="actions">
					<button
						v-if="view.lastNight !== null"
						type="button"
						class="preset"
						:disabled="busy"
						@click="setOut(view.lastNight.map(tower => tower.id))"
					>
						{{ t('loadout.lastNight') }}
						<span
							class="preset-glyphs"
							aria-hidden="true"
						>
							<EntityGlyph
								v-for="tower in view.lastNight"
								:key="tower.id"
								:glyph="tower.glyph"
							/>
						</span>
					</button>
					<button
						type="button"
						class="start"
						:disabled="busy || view.problem !== null"
						@click="start"
					>
						{{ t(saving ? 'loadout.starting' : 'loadout.start') }}
					</button>
				</div>
			</section>

			<p
				v-if="saveFailed"
				class="save-failed"
				role="alert"
			>
				{{ t('kitchen.saveFailed') }}
				<button
					type="button"
					class="retry"
					@click="store.retry"
				>
					{{ t('kitchen.retrySave') }}
				</button>
			</p>

			<div class="lower">
				<LoadoutRoster
					:roster="view.roster"
					:roles="view.roles"
					@toggle="toggle"
				/>
				<NightComposition :preview="view.preview" />
			</div>
		</div>

		<component
			:is="DataPanel"
			v-if="DataPanel !== null"
			class="dev"
		/>
	</main>
</template>

<script setup lang="ts">
	import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Component } from 'vue'
	import { useI18n } from 'vue-i18n'
	import { useRouter } from 'vue-router'
	import EntityGlyph from '@/ui/components/EntityGlyph.vue'
	import LoadState from '@/ui/components/LoadState.vue'
	import LoadoutCounter from '@/ui/components/loadout/LoadoutCounter.vue'
	import LoadoutRoster from '@/ui/components/loadout/LoadoutRoster.vue'
	import NightComposition from '@/ui/components/loadout/NightComposition.vue'
	import { buildLoadoutView, selectionFor, toggleTower } from '@/ui/loadoutView.ts'
	import { useProgressStore } from '@/ui/stores/progress.ts'
	import { useSessionStore } from '@/ui/stores/session.ts'
	import type { DefId } from '@/ui/loadoutView.ts'

	/**
	 * What you set out on the counter before bed: tomorrow night in full, the counter, and the towers
	 * in the cupboard. Start saves the choice through the progress store and goes into the night; the
	 * store owns the one `status`, so the button reads it and holds no flag of its own.
	 */

	const { t } = useI18n()
	const router = useRouter()
	const store = useProgressStore()
	const session = useSessionStore()

	/**
	 * Computed off the store, never taken once at setup: on the slow adapter this screen mounts before
	 * the progress arrives, and a selection built from nothing would stay empty.
	 */
	const selection = computed(() =>
		store.progress === null ? null : selectionFor(store.progress, session.loadoutDraft),
	)

	const view = computed(() =>
		store.progress === null || selection.value === null ? null : buildLoadoutView(store.progress, selection.value),
	)

	const saving = computed(() => store.status === 'saving')
	const busy = computed(() => store.status === 'saving' || store.status === 'loading')

	/** Any failed save, this screen's or a night's carried in from the summary: one line, and the retry. */
	const saveFailed = computed(() => store.status === 'error' && store.progress !== null)

	/** The tower a full counter just put back, so the swap is said as well as seen. */
	const displaced = ref<DefId | null>(null)

	const displacedName = computed(() => {
		const id = displaced.value
		const entry = id === null ? undefined : view.value?.roster.find(candidate => candidate.id === id)
		return entry === undefined || entry.chosen ? null : t(entry.nameKey)
	})

	function setOut(towerIds: DefId[]): void {
		const nightId = store.progress?.nightId
		if (nightId === null || nightId === undefined) {
			return
		}
		session.loadoutDraft = { nightId, towerIds }
	}

	function toggle(id: DefId): void {
		const progress = store.progress
		const current = selection.value
		if (progress === null || current === null) {
			return
		}
		const next = toggleTower(progress, current, id)
		displaced.value = current.find(existing => existing !== id && !next.includes(existing)) ?? null
		setOut(next)
	}

	async function start(): Promise<void> {
		const chosen = selection.value
		if (chosen === null) {
			return
		}
		if ((await store.chooseLoadout(chosen)) === 'ok') {
			session.loadoutDraft = null
			void router.push({ name: 'night' })
		}
	}

	function toKitchen(): void {
		void router.push({ name: 'kitchen' })
	}

	/** A finished campaign has no night to set out for. */
	watch(
		() => store.progress,
		progress => {
			if (progress !== null && progress.nightId === null) {
				void router.replace({ name: 'kitchen' })
			}
		},
		{ immediate: true },
	)

	/** Dev only: the mock failure toggle, as on the Kitchen, so Start's failure can be walked through here. */
	const DataPanel = shallowRef<Component | null>(null)

	onMounted(async () => {
		void store.ensureLoaded()
		if (import.meta.env.DEV) {
			const { default: dataPanel } = await import('@/dev/data/DataPanel.vue')
			DataPanel.value = dataPanel
		}
	})

	onBeforeUnmount(() => {
		DataPanel.value = null
	})
</script>

<style scoped>
	.loadout {
		position: relative;
		height: 100%;
		overflow-y: auto;
		background: var(--kd-day-wall);
		color: var(--kd-day-ink);
	}

	.waiting {
		display: grid;
		place-items: center;
		height: 100%;
	}

	.room {
		display: grid;
		gap: 1rem;
		max-width: 72rem;
		margin: 0 auto;
		padding: 1.2rem 1.5rem 2rem;
	}

	.head {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.title {
		margin: 0;
		font-size: 1.4rem;
		font-weight: 600;
	}

	.back {
		padding: 0.35rem 0.8rem;
		border: 1px solid var(--kd-day-card-edge);
		border-radius: var(--kd-radius);
		background: var(--kd-day-card);
		color: var(--kd-day-ink-dim);
		font: inherit;
		font-size: 0.85rem;
		cursor: pointer;
	}

	.back:hover,
	.back:focus-visible {
		color: var(--kd-day-ink);
	}

	.bench {
		display: grid;
		gap: 0.6rem;
	}

	.bench-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
	}

	.bench-head h2 {
		margin: 0;
		color: var(--kd-day-ink-dim);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.room-line {
		margin: 0;
		color: var(--kd-day-ink-dim);
		font-size: 0.85rem;
		font-variant-numeric: tabular-nums;
	}

	/* Holds its line when empty, so the buttons below do not jump as the sentence comes and goes. */
	.note {
		min-height: 1lh;
		margin: 0;
		color: var(--kd-day-ink-dim);
		font-size: 0.85rem;
		font-style: italic;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.6rem;
	}

	.preset {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.55rem 0.9rem;
		border: 1px solid var(--kd-day-card-edge);
		border-radius: var(--kd-radius);
		background: var(--kd-day-card);
		color: var(--kd-day-ink);
		font: inherit;
		font-size: 0.85rem;
		cursor: pointer;
	}

	.preset:hover,
	.preset:focus-visible {
		border-color: var(--kd-day-owned);
	}

	.preset-glyphs {
		display: flex;
		gap: 0.15rem;
		font-size: 1rem;
	}

	.start {
		padding: 0.65rem 1.4rem;
		border: none;
		border-radius: var(--kd-radius);
		background: var(--kd-night);
		color: var(--kd-lamp);
		font: inherit;
		font-size: 0.95rem;
		cursor: pointer;
	}

	.start:hover,
	.start:focus-visible {
		background: var(--kd-night-soft);
	}

	.start:disabled,
	.preset:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.save-failed {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		margin: 0;
		padding: 0.6rem 0.9rem;
		border: 1px solid var(--kd-day-danger);
		border-radius: var(--kd-radius);
		background: var(--kd-day-card);
		color: var(--kd-day-danger);
		font-size: 0.85rem;
	}

	.retry {
		padding: 0.3rem 0.7rem;
		border: 1px solid var(--kd-day-danger);
		border-radius: var(--kd-radius);
		background: transparent;
		color: var(--kd-day-danger);
		font: inherit;
		cursor: pointer;
	}

	.lower {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(16rem, 1fr);
		gap: 1rem;
		align-items: start;
	}

	/* Bottom rather than the Kitchen's top: the back button is up there. */
	.dev {
		position: fixed;
		bottom: 0.75rem;
		left: 0.75rem;
	}
</style>
