<template>
	<div class="wave-control">
		<button
			type="button"
			class="call"
			:disabled="phase !== 'countdown'"
			@click="emit('callWave')"
		>
			<span class="call-label">{{ t('hud.callWave') }}</span>
			<span
				v-if="phase === 'countdown'"
				class="call-detail"
			>
				<span class="countdown">{{ t('hud.nextWaveIn', { seconds: countdownSeconds }) }}</span>
				<span
					v-if="earlyCallBonus > 0"
					class="bonus"
				>
					{{ t('hud.callWaveBonus', { n: earlyCallBonus }) }}
				</span>
			</span>
		</button>

		<div class="transport">
			<!-- Pause and speed are separate states in loop.ts, so the panel lights both: pausing at
				 3x and resuming has to come back at 3x, and a control that merged them would forget. -->
			<button
				type="button"
				class="chip"
				:class="{ on: paused }"
				:title="paused ? t('hud.resume') : t('hud.pause')"
				@click="emit('togglePause')"
			>
				<FontAwesomeIcon :icon="paused ? 'play' : 'pause'" />
			</button>
			<button
				v-for="option in SPEEDS"
				:key="option"
				type="button"
				class="chip"
				:class="{ on: option === speed }"
				:title="t('hud.speed', { n: option })"
				@click="emit('setSpeed', option)"
			>
				{{ t('hud.speedShort', { n: option }) }}
			</button>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { computed } from 'vue'
	import { useI18n } from 'vue-i18n'
	import type { NightPhase, Speed } from '@/ui/viewModel.ts'

	/**
	 * Calling the next wave in early, and the transport.
	 *
	 * The call button is **disabled outside `'countdown'`, never hidden**: it is the widest control on
	 * the panel, and a panel that changes size every time a wave starts is one the player has to find
	 * again each time.
	 */

	const { phase, countdownTicks, earlyCallBonus, speed, paused } = defineProps<{
		phase: NightPhase
		countdownTicks: number
		earlyCallBonus: number
		speed: Speed
		paused: boolean
	}>()

	const emit = defineEmits<{
		callWave: []
		setSpeed: [speed: Speed]
		togglePause: []
	}>()

	const { t } = useI18n()

	/** The three the player can pick. `Speed` also admits 0, which is what `paused` is for. */
	const SPEEDS: Speed[] = [1, 2, 3]

	/** Rounded **up**, so the last second of the countdown is shown as 1 and not as 0. */
	const countdownSeconds = computed(() => Math.ceil(countdownTicks / 60))
</script>

<style scoped>
	.wave-control {
		position: absolute;
		right: 0.75rem;
		bottom: 0.75rem;
		display: grid;
		justify-items: stretch;
		gap: 0.35rem;
		width: 15rem;
	}

	.call {
		display: grid;
		gap: 0.15rem;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--kd-panel-edge);
		border-radius: var(--kd-radius);
		background: var(--kd-panel);
		color: var(--kd-text);
		font: inherit;
		font-size: 0.8rem;
		cursor: pointer;
		pointer-events: auto;
	}

	.call:enabled:hover,
	.call:enabled:focus-visible {
		border-color: var(--kd-owned-dim);
		background: var(--kd-panel-raise);
	}

	.call:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.call-detail {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
	}

	.countdown {
		color: var(--kd-text-dim);
	}

	.bonus {
		color: var(--kd-owned);
	}

	.transport {
		display: flex;
		gap: 0.3rem;
	}

	.chip {
		flex: 1;
		padding: 0.3rem 0;
		border: 1px solid var(--kd-panel-edge);
		border-radius: var(--kd-radius);
		background: var(--kd-panel);
		color: var(--kd-text-dim);
		font: inherit;
		font-size: 0.72rem;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
		pointer-events: auto;
	}

	.chip:hover,
	.chip:focus-visible {
		border-color: var(--kd-owned-dim);
		color: var(--kd-text);
	}

	.chip.on {
		border-color: var(--kd-owned);
		background: var(--kd-panel-raise);
		color: var(--kd-owned);
	}
</style>
