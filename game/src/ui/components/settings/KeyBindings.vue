<template>
	<section class="section">
		<h3>{{ t('settings.keys') }}</h3>
		<p class="note">{{ t('settings.keysNote') }}</p>
		<ul class="bindings">
			<li
				v-for="action in ACTIONS"
				:key="action"
			>
				<span class="label">{{ actionName(action) }}</span>
				<button
					type="button"
					class="key"
					:class="{ listening: capturing === action }"
					@click="capturing = capturing === action ? null : action"
				>
					{{ capturing === action ? t('settings.pressKey') : keyLabel(store.settings.bindings[action]) }}
				</button>
			</li>
		</ul>
		<p
			v-if="swap !== null"
			class="swapped"
			role="status"
		>
			{{ t('settings.swapped', { action: actionName(swap.action), key: keyLabel(swap.code) }) }}
		</p>
	</section>
</template>

<script setup lang="ts">
	import { useI18n } from 'vue-i18n'
	import { ACTIONS, keyLabel, TOWER_SLOTS, type Action } from '@/ui/keys.ts'
	import { useSettingsStore } from '@/ui/stores/settings.ts'

	/**
	 * Every action and its key. Clicking one starts listening; the key itself is caught by
	 * `SettingsPanel.vue`, which owns the one keydown listener while the panel is up -- so the game's own
	 * handler never sees the press, and binding a key to sell does not sell the selected tower.
	 */

	const { swap = null } = defineProps<{
		/** The action the last rebind moved off its key, and where it went. */
		swap?: { action: Action; code: string } | null
	}>()

	/** The action waiting for a key, or null. */
	const capturing = defineModel<Action | null>('capturing', { default: null })

	const { t } = useI18n()
	const store = useSettingsStore()

	function actionName(action: Action): string {
		const slot = TOWER_SLOTS.findIndex(candidate => candidate === action)
		return slot === -1 ? t(`settings.action.${action}`) : t('settings.towerSlot', { n: slot + 1 })
	}
</script>

<style scoped>
	.note {
		margin: 0;
		color: var(--kd-text-dim);
		font-size: 0.74rem;
	}

	.bindings {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.3rem 1.2rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		font-size: 0.8rem;
	}

	.key {
		min-width: 4.2rem;
		padding: 0.2rem 0.5rem;
		border: 1px solid var(--kd-panel-edge);
		border-radius: var(--kd-radius);
		background: var(--kd-panel-raise);
		color: var(--kd-owned);
		font: inherit;
		font-size: 0.78rem;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
	}

	.key:hover,
	.key:focus-visible {
		border-color: var(--kd-owned-dim);
	}

	.key.listening {
		border-color: var(--kd-owned);
		color: var(--kd-text);
	}

	.swapped {
		margin: 0;
		color: var(--kd-text-dim);
		font-size: 0.74rem;
	}
</style>
