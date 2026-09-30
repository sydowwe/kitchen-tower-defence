<template>
	<figure
		class="scene"
		:aria-label="t('kitchen.sceneLabel')"
	>
		<!-- The room itself: nothing here is bought, so nothing here moves. -->
		<div class="wall" />
		<div class="window">
			<div class="pane" />
			<div class="pane" />
		</div>
		<div class="shelf" />
		<div class="fridge" />
		<div class="door" />
		<div class="counter" />
		<div class="floor" />
		<div class="skirting" />

		<!-- What has been bought, standing where it belongs. -->
		<TransitionGroup name="arrive">
			<span
				v-for="item in owned"
				:key="item.id"
				class="thing"
				:style="{ left: `${SPOTS[item.id].x}%`, top: `${SPOTS[item.id].y}%` }"
				:title="t(item.nameKey)"
			>
				{{ item.glyph }}
			</span>
		</TransitionGroup>
	</figure>
</template>

<script setup lang="ts">
	import { useI18n } from 'vue-i18n'
	import type { InstallationId, OwnedInstallationView } from '@/ui/kitchenView.ts'

	/**
	 * The Kitchen by day: a backdrop in CSS and a glyph per owned installation (step 20D, decision 6).
	 * Not the canvas -- the loop and the renderer belong to the night.
	 */

	const { owned } = defineProps<{
		owned: OwnedInstallationView[]
	}>()

	const { t } = useI18n()

	/**
	 * Where each installation stands, as a percentage of the scene. A `Record` over every id, so a new
	 * installation fails `type-check` here until somebody decides where it goes.
	 *
	 * The last three are what made room on the counter, and each stands where the room came from: the
	 * rack at the counter's far end, the socket the toaster used to be plugged into on
	 * the splashback, and the second shelf on the wall between the first one and the counter.
	 */
	const SPOTS: Record<InstallationId, { x: number; y: number }> = {
		fixTheWindowScreen: { x: 30, y: 27 },
		pantryShelfLiner: { x: 58, y: 25 },
		emergencySnackStash: { x: 68, y: 25 },
		oilTheHinges: { x: 48, y: 25 },
		biggerFridge: { x: 10, y: 50 },
		betterTupperware: { x: 30, y: 63 },
		nightShiftDustpan: { x: 44, y: 63 },
		whiteNoiseMachine: { x: 60, y: 63 },
		closeTheKitchenDoor: { x: 88, y: 50 },
		buyABroom: { x: 82, y: 72 },
		sealTheBaseboardCrack: { x: 22, y: 89 },
		clearTheDryingRack: { x: 75, y: 62 },
		takeTheToasterOffTheCounter: { x: 38, y: 54 },
		secondShelf: { x: 59, y: 46 },
	}
</script>

<style scoped>
	.scene {
		position: relative;
		margin: 0;
		min-height: 15rem;
		aspect-ratio: 16 / 9;
		overflow: hidden;
		border: 1px solid var(--kd-day-card-edge);
		border-radius: 0.75rem;
		background: var(--kd-day-wall);
	}

	.scene > div {
		position: absolute;
	}

	/* Tiled splashback, faint enough to stay a wall. */
	.wall {
		inset: 0 0 34% 0;
		background:
			linear-gradient(var(--kd-day-tile) 1px, transparent 1px) 0 0 / 2.2rem 2.2rem,
			linear-gradient(90deg, var(--kd-day-tile) 1px, transparent 1px) 0 0 / 2.2rem 2.2rem;
	}

	.window {
		left: 20%;
		top: 10%;
		width: 20%;
		height: 32%;
		display: flex;
		gap: 4%;
		padding: 1.2%;
		border-radius: 0.3rem;
		background: var(--kd-day-frame);
	}

	.pane {
		flex: 1;
		border-radius: 0.15rem;
		background: linear-gradient(160deg, var(--kd-day-sky), var(--kd-day-wall));
	}

	.shelf {
		left: 44%;
		top: 32%;
		width: 30%;
		height: 2.2%;
		border-radius: 0.2rem;
		background: var(--kd-day-counter);
	}

	.fridge {
		left: 3%;
		top: 22%;
		width: 14%;
		height: 58%;
		border: 2px solid var(--kd-day-card-edge);
		border-radius: 0.5rem;
		background: linear-gradient(var(--kd-day-card) 0 38%, var(--kd-day-card-edge) 38% 39%, var(--kd-day-card) 39%);
	}

	.door {
		right: 3%;
		top: 18%;
		width: 13%;
		height: 62%;
		border: 3px solid var(--kd-day-frame);
		border-bottom: none;
		border-radius: 0.3rem 0.3rem 0 0;
		background: linear-gradient(var(--kd-day-tile), var(--kd-day-wall));
	}

	.counter {
		left: 20%;
		right: 20%;
		top: 66%;
		height: 14%;
		border-top: 0.45rem solid var(--kd-day-counter-top);
		background: var(--kd-day-counter);
	}

	.floor {
		inset: 80% 0 0 0;
		background: var(--kd-day-floor);
	}

	.skirting {
		left: 0;
		right: 0;
		top: 80%;
		height: 2.5%;
		background: var(--kd-day-frame);
	}

	.thing {
		position: absolute;
		font-size: clamp(1.4rem, 3.2vw, 2.4rem);
		line-height: 1;
		transform: translate(-50%, -50%);
		filter: drop-shadow(0 0.15rem 0.1rem rgba(59, 49, 41, 0.25));
		cursor: default;
		user-select: none;
	}

	.arrive-enter-active {
		transition:
			transform 0.5s cubic-bezier(0.2, 1.4, 0.4, 1),
			opacity 0.3s ease-out;
	}

	.arrive-enter-from {
		opacity: 0;
		transform: translate(-50%, -20%) scale(0.6);
	}
</style>
