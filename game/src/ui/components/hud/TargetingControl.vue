<template>
	<button
		type="button"
		class="mode"
		:title="`${t('hud.targetingCycle')}\n${t('hud.targetingOrder')}`"
		@click="cycle"
	>
		<FontAwesomeIcon :icon="ICONS[mode]" />
		<span class="name">{{ t(`hud.mode.${mode}`) }}</span>
	</button>
</template>

<script setup lang="ts">
	import { useI18n } from 'vue-i18n'
	import type { TargetingMode } from '@/ui/viewModel.ts'

	/**
	 * Which enemy the selected tower shoots at, as **one button that cycles** rather than six chips.
	 *
	 * Six chips plus three upgrade slots is a panel taller than the board, and the mode is a setting a
	 * player changes rarely and reads often -- so the current one gets the whole control and the other
	 * five live in the tooltip (step 12C, decision 3). Shift-click steps backwards, which is what makes
	 * a six-long cycle usable when the one you want is behind you.
	 *
	 * The icons are FontAwesome per `ui/icons.ts`, never emoji: this is HUD chrome, and
	 * analytic-docs/DECISIONS.md section 2 keeps emoji for things standing on the board.
	 */

	const { mode } = defineProps<{ mode: TargetingMode }>()

	const emit = defineEmits<{ change: [mode: TargetingMode] }>()

	const { t } = useI18n()

	/**
	 * The `TargetingMode` union in the order the control walks it, which is
	 * analytic-docs/CONTENT.md section 5's own order. All six have worked in
	 * `core/systems/targeting.ts` since step 6B -- this control is being re-shaped, not built.
	 */
	const MODES: TargetingMode[] = ['FIRST', 'LAST', 'STRONGEST', 'WEAKEST', 'CLOSEST', 'RANDOM']

	/** One per mode, keyed by the literal, so a seventh mode fails here rather than rendering blank. */
	const ICONS: Record<TargetingMode, string> = {
		FIRST: 'angles-right',
		LAST: 'angles-left',
		STRONGEST: 'dumbbell',
		WEAKEST: 'feather',
		CLOSEST: 'crosshairs',
		RANDOM: 'shuffle',
	}

	function cycle(event: MouseEvent): void {
		const at = MODES.indexOf(mode)
		// `+ MODES.length` before the modulo: -1 % 6 is -1 in JavaScript, and the shift-click off the
		// first mode would land on `undefined` rather than on RANDOM.
		const next = MODES[(at + (event.shiftKey ? -1 : 1) + MODES.length) % MODES.length]
		if (next !== undefined) {
			emit('change', next)
		}
	}
</script>

<style scoped>
	.mode {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0.5rem;
		border: 1px solid var(--kd-panel-edge);
		border-radius: var(--kd-radius);
		background: var(--kd-panel-raise);
		color: var(--kd-text);
		font: inherit;
		font-size: 0.7rem;
		cursor: pointer;
		pointer-events: auto;
	}

	.mode:hover,
	.mode:focus-visible {
		border-color: var(--kd-owned-dim);
	}

	.name {
		color: var(--kd-text);
	}
</style>
