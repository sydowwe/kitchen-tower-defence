<template>
	<div
		class="backdrop"
		@click.self="emit('close')"
	>
		<section
			ref="dialog"
			class="panel"
			role="dialog"
			aria-modal="true"
			:aria-label="t('settings.title')"
			tabindex="-1"
		>
			<header class="head">
				<h2>{{ t('settings.title') }}</h2>
				<button
					type="button"
					class="close"
					:title="t('settings.close')"
					:aria-label="t('settings.close')"
					@click="emit('close')"
				>
					<FontAwesomeIcon icon="xmark" />
				</button>
			</header>

			<SoundSettings />
			<ScreenSettings />
			<KeyBindings
				v-model:capturing="capturing"
				:swap="swap"
			/>

			<!-- The panel's one destructive control. Reset lives in the Kitchen with its save states, and a
				 second copy here would be a second failure path to keep honest (step 23D, decision 8). -->
			<footer class="foot">
				<button
					type="button"
					class="hints"
					:disabled="store.settings.seenHints.length === 0"
					@click="resetHints"
				>
					{{ t('settings.hints') }}
				</button>
				<span
					v-if="hintsReset"
					role="status"
				>
					{{ t('settings.hintsReset') }}
				</span>
			</footer>
		</section>
	</div>
</template>

<script setup lang="ts">
	import { onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
	import { useI18n } from 'vue-i18n'
	import KeyBindings from '@/ui/components/settings/KeyBindings.vue'
	import ScreenSettings from '@/ui/components/settings/ScreenSettings.vue'
	import SoundSettings from '@/ui/components/settings/SoundSettings.vue'
	import { ACTIONS, isBindable, type Action } from '@/ui/keys.ts'
	import { useSettingsStore } from '@/ui/stores/settings.ts'

	/**
	 * Every knob, in one record (step 23D). Mounted once by `ui/App.vue` over whatever is showing, and
	 * closed by Escape, the cross or a click outside it.
	 *
	 * **It owns the keyboard while it is up.** One keydown listener on `window` in the capture phase,
	 * which stops every key from going further: `ui/interaction.ts` listens on `window` too, and without
	 * this a key pressed to bind it to "sell" would also sell the selected tower, and Space would toggle a
	 * pause the night is holding for this panel. Stopping propagation leaves default actions alone, so
	 * Tab, the sliders' arrow keys and Space on a checkbox still work.
	 */

	const emit = defineEmits<{ close: [] }>()

	const { t } = useI18n()
	const store = useSettingsStore()
	const dialog = useTemplateRef<HTMLElement>('dialog')

	const capturing = ref<Action | null>(null)
	const swap = ref<{ action: Action; code: string } | null>(null)
	const hintsReset = ref(false)

	function capture(action: Action, code: string): void {
		const before = store.settings.bindings
		store.rebind(action, code)
		const after = store.settings.bindings
		const moved = ACTIONS.find(other => other !== action && before[other] !== after[other])
		swap.value = moved === undefined ? null : { action: moved, code: after[moved] }
	}

	function onKeyDown(event: KeyboardEvent): void {
		event.stopPropagation()
		const action = capturing.value
		if (action === null) {
			if (event.key === 'Escape') {
				emit('close')
			}
			return
		}

		// Listening: the key is the binding, and does nothing else -- not even scroll the page.
		event.preventDefault()
		if (event.key === 'Escape') {
			capturing.value = null
			return
		}
		// A modifier on its own is the start of a chord, not the key. Keep listening.
		if (!isBindable(event.code)) {
			return
		}
		capture(action, event.code)
		capturing.value = null
	}

	function resetHints(): void {
		store.resetHints()
		hintsReset.value = true
	}

	onMounted(() => {
		window.addEventListener('keydown', onKeyDown, { capture: true })
		dialog.value?.focus()
	})

	onBeforeUnmount(() => {
		window.removeEventListener('keydown', onKeyDown, { capture: true })
	})
</script>

<style scoped>
	/* Over everything, the board included: while it is up, nothing under it takes a click. */
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 10;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(8, 10, 18, 0.6);
	}

	.panel {
		display: grid;
		gap: 1.1rem;
		width: min(36rem, 100%);
		max-height: 100%;
		padding: 1rem 1.2rem 1.2rem;
		overflow-y: auto;
		border: 1px solid var(--kd-panel-edge);
		border-radius: var(--kd-radius);
		background: var(--kd-night-soft);
		color: var(--kd-text);
		outline: none;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	h2 {
		margin: 0;
		color: var(--kd-lamp);
		font-size: 1.1rem;
		font-weight: 600;
	}

	.close {
		padding: 0.25rem 0.5rem;
		border: 1px solid transparent;
		border-radius: var(--kd-radius);
		background: transparent;
		color: var(--kd-text-dim);
		font: inherit;
		cursor: pointer;
	}

	.close:hover,
	.close:focus-visible {
		border-color: var(--kd-panel-edge);
		color: var(--kd-text);
	}

	/* Shared by the three sections, which are this panel's pieces and nothing else's. */
	.panel :deep(.section) {
		display: grid;
		gap: 0.5rem;
	}

	.panel :deep(h3) {
		margin: 0;
		color: var(--kd-text-dim);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.foot {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		color: var(--kd-text-dim);
		font-size: 0.74rem;
	}

	.hints {
		padding: 0.35rem 0.7rem;
		border: 1px solid var(--kd-panel-edge);
		border-radius: var(--kd-radius);
		background: transparent;
		color: var(--kd-text);
		font: inherit;
		cursor: pointer;
	}

	.hints:enabled:hover,
	.hints:enabled:focus-visible {
		border-color: var(--kd-owned-dim);
	}

	.hints:disabled {
		opacity: 0.4;
		cursor: default;
	}
</style>
