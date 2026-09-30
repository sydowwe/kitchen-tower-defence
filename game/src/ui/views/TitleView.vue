<template>
	<main class="title">
		<h1 class="name">{{ t('title.name') }}</h1>
		<p class="tagline">{{ t('title.tagline') }}</p>

		<button
			v-if="store.progress !== null"
			type="button"
			class="enter"
			@click="enter"
		>
			{{ t('title.enter') }}
		</button>
		<LoadState
			v-else
			:failed="store.status === 'error'"
			@retry="store.retry"
		/>

		<component
			:is="DataPanel"
			v-if="DataPanel !== null"
			class="dev"
		/>
	</main>
</template>

<script setup lang="ts">
	import { onBeforeUnmount, onMounted, shallowRef, type Component } from 'vue'
	import { useI18n } from 'vue-i18n'
	import { useRouter } from 'vue-router'
	import LoadState from '@/ui/components/LoadState.vue'
	import { useProgressStore } from '@/ui/stores/progress.ts'
	import { useSettingsStore } from '@/ui/stores/settings.ts'

	/**
	 * The game's name and one way in. Auth and progress load here first, so in mock mode this is the
	 * first screen that can fail -- and it says so, with a retry, rather than a button that goes nowhere.
	 */

	const { t } = useI18n()
	const router = useRouter()
	const store = useProgressStore()
	const settings = useSettingsStore()

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
