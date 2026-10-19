<template>
	<main class="title">
		<h1 class="name">{{ t('title.name') }}</h1>
		<p class="tagline">{{ t('title.tagline') }}</p>

		<template v-if="picker !== null">
			<button
				type="button"
				class="enter"
				@click="enter"
			>
				{{ t('title.enter') }}
			</button>
			<TierPicker
				v-model:asking="asking"
				:picker="picker"
				:busy="busy"
				:saving="store.status === 'saving' && pickedTier !== null"
				:failed="store.status === 'error' && pickedTier !== null"
				@start="startTier"
				@retry="retryTier"
			/>
		</template>
		<LoadState
			v-else
			:failed="store.status === 'error'"
			@retry="store.retry"
		/>

		<SettingsButton class="settings" />

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
	import LoadState from '@/ui/components/LoadState.vue'
	import SettingsButton from '@/ui/components/SettingsButton.vue'
	import TierPicker from '@/ui/components/title/TierPicker.vue'
	import { buildTierPicker } from '@/ui/kitchenView.ts'
	import { useProgressStore } from '@/ui/stores/progress.ts'
	import { useSettingsStore } from '@/ui/stores/settings.ts'
	import type { DifficultyId } from '@/ui/kitchenView.ts'

	/**
	 * The game's name, one way in, and the tier the campaign is played on. Auth and progress load here
	 * first, so in mock mode this is the first screen that can fail -- and it says so, with a retry,
	 * rather than a button that goes nowhere. Starting a new tier can fail too, and says so the same way.
	 */

	const { t } = useI18n()
	const router = useRouter()
	const store = useProgressStore()
	const settings = useSettingsStore()

	const picker = computed(() => (store.progress === null ? null : buildTierPicker(store.progress)))
	const busy = computed(() => store.status === 'saving' || store.status === 'loading')

	/**
	 * The tier the last new campaign was for: which control shows the save, never whether it failed --
	 * that is the store's `status`. Null until one is picked, so a failed load is not a failed start.
	 */
	const pickedTier = ref<DifficultyId | null>(null)
	const asking = ref<DifficultyId | null>(null)

	async function startTier(tier: DifficultyId): Promise<void> {
		pickedTier.value = tier
		if ((await store.startCampaign(tier)) === 'ok') {
			asking.value = null
		}
	}

	async function retryTier(): Promise<void> {
		await store.retry()
		if (store.status !== 'error') {
			asking.value = null
		}
	}

	function enter(): void {
		void router.push({ name: 'kitchen' })
	}

	/**
	 * Dev only: the mock failure toggle, as on the Kitchen. Here too because the title's load is the
	 * first call that can fail, and its retry needs the rate turned back down to land.
	 */
	const DataPanel = shallowRef<Component | null>(null)

	onMounted(async () => {
		void store.ensureLoaded()
		// Settings never fail loudly: the defaults stand, and the night applies whatever is there.
		void settings.ensureLoaded()
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
	.title {
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 0.8rem;
		height: 100%;
		background: radial-gradient(circle at 50% 38%, var(--kd-night-soft), var(--kd-night) 70%);
	}

	.name {
		margin: 0;
		color: var(--kd-lamp);
		font-size: 2.6rem;
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	.tagline {
		margin: 0 0 1.4rem;
		color: var(--kd-text-dim);
		font-size: 1rem;
	}

	.enter {
		padding: 0.7rem 1.6rem;
		border: 1px solid var(--kd-owned-dim);
		border-radius: var(--kd-radius);
		background: var(--kd-panel);
		color: var(--kd-owned);
		font: inherit;
		font-size: 1rem;
		cursor: pointer;
	}

	.settings {
		position: fixed;
		top: 0.75rem;
		right: 0.75rem;
	}

	.dev {
		position: fixed;
		top: 0.75rem;
		left: 0.75rem;
	}

	.enter:hover,
	.enter:focus-visible {
		border-color: var(--kd-owned);
		color: var(--kd-text);
	}
</style>
