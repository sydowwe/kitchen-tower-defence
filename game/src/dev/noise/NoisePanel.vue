<template>
	<!--
		`<details>` rather than a toggle key: collapsing is one line of markup with no listener, and
		every key that could plausibly mean "noise" is already bound (`` ` ``, `[`, `]`, the arrows,
		`n`, `x`, `u`, `0`-`9`, space, `,` and `.`).
	-->
	<details
		class="np"
		open
	>
		<summary class="np-head">Noise</summary>

		<dl class="np-readout">
			<dt>Level</dt>
			<dd>{{ readout.level.toFixed(1) }}</dd>
			<dt>Cap</dt>
			<dd>{{ readout.cap }}</dd>
			<dt>Decay</dt>
			<dd>{{ readout.decayPerSecond.toFixed(2) }}/sec</dd>
			<dt>Wakes</dt>
			<dd>{{ readout.wakeCount }}</dd>
		</dl>

		<label
			v-for="def in INSTALLATIONS"
			:key="def.id"
			class="np-check"
		>
			<input
				v-model="owned"
				type="checkbox"
				:value="def.id"
			/>
			{{ t(def.nameKey) }}
		</label>

		<!-- Said out loud, because a night that silently restarts mid-play reads as a crash. -->
		<p class="np-hint">Ticking a box restarts the night.</p>

		<button
			type="button"
			class="np-btn"
			@click="emit('wakeNow')"
		>
			Wake now
		</button>
	</details>
</template>

<script setup lang="ts">
	import { ref, watch } from 'vue'
	import { useI18n } from 'vue-i18n'
	import { INSTALLATIONS, resolveNoiseModifiers } from '@/core/content/index.ts'
	import type { DefId } from '@/core/types.ts'

	/**
	 * The instrument the rest of step 13B was tuned against: a live reading of `world.noise`, the three
	 * installations as checkboxes, and a button that fills the meter now.
	 *
	 * **Dev only, and it ships nothing.** `GameView.vue` imports it dynamically inside an
	 * `import.meta.env.DEV` branch, the same way it imports the debug controller and the editor's
	 * preview, so none of this reaches the production bundle.
	 *
	 * It is deliberately not a settings screen. Step 20 is what sells installations for Grocery Money;
	 * this panel exists so that step can arrive later without the noise curve having been tuned blind.
	 *
	 * The chrome is written as literals, the way `dev/editor/panels/*.vue` write theirs -- the
	 * catalogue in `ui/locales/en.ts` is for strings a player reads. The **installation names** are the
	 * exception and come from the i18n keys, because those are player-facing content that step 20 will
	 * show verbatim.
	 */

	const { readout } = defineProps<{
		readout: { level: number; cap: number; decayPerSecond: number; wakeCount: number }
	}>()

	const emit = defineEmits<{
		/**
		 * Already resolved through `resolveNoiseModifiers`, so `GameView.vue` hands the pair straight to
		 * `createWorld` and never imports the fold. Keeping that import in here is also what keeps it out
		 * of the production bundle.
		 */
		restart: [noise: { capDelta: number; decayPerSecondDelta: number }]
		wakeNow: []
	}>()

	const { t } = useI18n()

	const owned = ref<DefId[]>([])

	/**
	 * A tick rebuilds the night. It deliberately does **not** write to `world.noise` mid-night: the cap
	 * a night was built with is part of what `(seed, mapId, nightId, commandLog)` has to reproduce, and
	 * a dev tool reaching inside that guarantee is how a bug report stops being reproducible.
	 *
	 * Checkbox `v-model` replaces the array rather than mutating it, so no `deep` is needed here.
	 */
	watch(owned, next => emit('restart', resolveNoiseModifiers(next)))
</script>

<style scoped>
	/* The HUD layer is `pointer-events: none`, so anything with a control in it has to opt back in. */
	.np {
		position: absolute;
		bottom: 0.75rem;
		left: 0.75rem;
		width: 11rem;
		padding: 0.5rem 0.65rem;
		border-radius: 0.5rem;
		background: rgba(16, 19, 31, 0.82);
		color: var(--kd-text-dim);
		font-family: ui-monospace, 'Cascadia Mono', monospace;
		font-size: 0.7rem;
		line-height: 1.4;
		pointer-events: auto;
	}

	.np-head {
		color: var(--kd-lamp);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		cursor: pointer;
	}

	.np-readout {
		display: grid;
		grid-template-columns: auto auto;
		gap: 0 0.6rem;
		margin: 0.45rem 0;
	}

	.np-readout dd {
		margin: 0;
		color: var(--kd-lamp);
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.np-check {
		display: flex;
		align-items: start;
		gap: 0.35rem;
		margin-bottom: 0.15rem;
		cursor: pointer;
	}

	.np-hint {
		margin: 0.35rem 0;
		opacity: 0.6;
	}

	.np-btn {
		width: 100%;
		padding: 0.3rem;
		border: 1px solid var(--kd-panel-edge);
		border-radius: var(--kd-radius);
		background: var(--kd-panel);
		color: var(--kd-text-dim);
		font: inherit;
		cursor: pointer;
	}

	.np-btn:hover,
	.np-btn:focus-visible {
		border-color: var(--kd-owned-dim);
		color: var(--kd-text);
	}
</style>
