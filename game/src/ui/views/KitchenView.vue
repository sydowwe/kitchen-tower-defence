<template>
	<main class="kitchen">
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
				<p class="money">
					<span class="money-label">{{ t('kitchen.groceryMoney') }}</span>
					<b>💵 {{ view.groceryMoney }}</b>
				</p>
			</header>

			<div class="top">
				<KitchenScene :owned="view.owned" />
				<NightPreview
					:preview="view.preview"
					:busy="busy"
					@start="startNight"
				/>
			</div>

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

			<section class="installations">
				<h2>{{ t('kitchen.installations') }}</h2>
				<div class="cards">
					<InstallationCard
						v-for="card in view.cards"
						:key="card.id"
						:card="card"
						:busy="busy"
						:buying="saving && lastAction === 'buy' && buyingId === card.id"
						@buy="buy"
					/>
				</div>
			</section>

			<footer class="foot">
				<ResetProgress
					v-model:open="resetOpen"
					:busy="busy"
					:saving="saving && lastAction === 'reset'"
					:failed="store.status === 'error' && lastAction === 'reset'"
					@reset="reset"
					@retry="retryReset"
				/>
				<SyncIndicator />
			</footer>
		</div>

		<component
			:is="DataPanel"
			v-if="DataPanel !== null"
			class="dev"
		/>
	</main>
</template>

<script setup lang="ts">
	import { computed, onBeforeUnmount, onMounted, ref, shallowRef, type Component } from 'vue'
	import { useI18n } from 'vue-i18n'
	import { useRouter } from 'vue-router'
	import InstallationCard from '@/ui/components/kitchen/InstallationCard.vue'
	import KitchenScene from '@/ui/components/kitchen/KitchenScene.vue'
	import NightPreview from '@/ui/components/kitchen/NightPreview.vue'
	import ResetProgress from '@/ui/components/kitchen/ResetProgress.vue'
	import SyncIndicator from '@/ui/components/kitchen/SyncIndicator.vue'
	import LoadState from '@/ui/components/LoadState.vue'
	import { buildKitchenView } from '@/ui/kitchenView.ts'
	import { useProgressStore } from '@/ui/stores/progress.ts'
	import type { InstallationId } from '@/ui/kitchenView.ts'

	/**
	 * The game's second place: the room by day, what has been bought for it, the Grocery Money, and
	 * tomorrow night. Everything on it waits on the progress store, which can be slow or fail, and says
	 * so -- the store owns the one `status`, and this view only remembers *which* action started the
	 * save in flight, so the right control shows it.
	 */

	const { t } = useI18n()
	const router = useRouter()
	const store = useProgressStore()

	/** Rebuilt when the store's progress is replaced, not at 15Hz: nothing runs on this screen. */
	const view = computed(() => (store.progress === null ? null : buildKitchenView(store.progress)))

	const saving = computed(() => store.status === 'saving')
	const busy = computed(() => store.status === 'saving' || store.status === 'loading')

	/** Which control started the last save. Where the failure is shown, never whether it failed. */
	const lastAction = ref<'buy' | 'reset' | null>(null)
	const buyingId = ref<InstallationId | null>(null)
	const resetOpen = ref(false)

	/**
	 * A failed save that is not the reset's -- a purchase, or a night's result carried in from the
	 * summary -- is said once, above the cards, with the store's retry.
	 */
	const saveFailed = computed(
		() => store.status === 'error' && store.progress !== null && lastAction.value !== 'reset',
	)

	async function buy(id: InstallationId): Promise<void> {
		lastAction.value = 'buy'
		buyingId.value = id
		await store.buyInstallation(id)
	}

	async function reset(): Promise<void> {
		lastAction.value = 'reset'
		if ((await store.resetProgress()) === 'ok') {
			resetOpen.value = false
		}
	}

	async function retryReset(): Promise<void> {
		await store.retry()
		if (store.status !== 'error') {
			resetOpen.value = false
		}
	}

	function startNight(): void {
		void router.push({ name: 'night' })
	}

	/** Dev only: the mock failure toggle, dynamically imported so none of it reaches production. */
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
	.kitchen {
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
		justify-content: flex-end;
	}

	.money {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		margin: 0;
		padding: 0.4rem 0.8rem;
		border: 1px solid var(--kd-day-card-edge);
		border-radius: var(--kd-radius);
		background: var(--kd-day-card);
		font-variant-numeric: tabular-nums;
	}

	.money-label {
		color: var(--kd-day-ink-dim);
		font-size: 0.8rem;
	}

	.money b {
		color: var(--kd-day-owned);
		font-size: 1.1rem;
	}

	.top {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(15rem, 1fr);
		gap: 1rem;
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

	.installations h2 {
		margin: 0 0 0.6rem;
		color: var(--kd-day-ink-dim);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: 0.7rem;
	}

	.foot {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;
	}

	.dev {
		position: fixed;
		top: 0.75rem;
		left: 0.75rem;
	}
</style>
