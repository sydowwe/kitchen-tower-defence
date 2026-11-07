<template>
	<main class="codex">
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
					@click="goBack"
				>
					{{ t('general.back') }}
				</button>
				<h1 class="title">{{ t('codex.title') }}</h1>
			</header>
			<p class="lede">{{ t('codex.lede') }}</p>

			<CodexGrid :grid="view.grid" />
			<CodexEnemyList
				:enemies="view.enemies"
				:focusId="focusId"
			/>
			<CodexTowerList :towers="view.towers" />
		</div>
	</main>
</template>

<script setup lang="ts">
	import { computed, onMounted } from 'vue'
	import { useI18n } from 'vue-i18n'
	import { useRoute, useRouter } from 'vue-router'
	import { buildCodexView } from '@/ui/codexView.ts'
	import CodexEnemyList from '@/ui/components/codex/CodexEnemyList.vue'
	import CodexGrid from '@/ui/components/codex/CodexGrid.vue'
	import CodexTowerList from '@/ui/components/codex/CodexTowerList.vue'
	import LoadState from '@/ui/components/LoadState.vue'
	import { useProgressStore } from '@/ui/stores/progress.ts'

	/**
	 * The kitchen's notebook: the matrix and everything met so far. A place to read and nothing else, so
	 * it saves nothing, and a trip here from the counter loses nothing: the draft is the session store's.
	 */

	const { t } = useI18n()
	const route = useRoute()
	const router = useRouter()
	const store = useProgressStore()

	const view = computed(() => (store.progress === null ? null : buildCodexView(store.progress)))

	/** `?enemy=<id>`, from a name in the loadout screen's composition. */
	const focusId = computed(() => (typeof route.query.enemy === 'string' ? route.query.enemy : null))

	/**
	 * Back to wherever it was opened from, so the counter comes back as the counter. A first load has
	 * nothing behind it inside the app, and `router.back()` there would leave the site. `state.back`
	 * survives a reload, so a reload still goes back to where the player really came from.
	 */
	function goBack(): void {
		if (router.options.history.state.back === null) {
			void router.replace({ name: 'kitchen' })
			return
		}
		router.back()
	}

	onMounted(() => {
		void store.ensureLoaded()
	})
</script>

<style scoped>
	.codex {
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

	.lede {
		margin: -0.5rem 0 0;
		color: var(--kd-day-ink-dim);
		font-size: 0.9rem;
		font-style: italic;
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
</style>
