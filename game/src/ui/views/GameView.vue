<template>
	<main class="game">
		<h1>🌙 Kitchen Defense</h1>
		<p>
			Scaffold is up. The 1152 × 672 canvas, the HUD layer and the fixed-timestep loop land in the rest of step 1.
		</p>
		<p class="hint">Dev only: the map editor route lives at #/editor from step 4.</p>
	</main>
</template>

<script setup lang="ts"></script>

<style scoped>
	.game {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		height: 100%;
		text-align: center;
	}

	h1 {
		margin: 0;
		color: var(--kd-lamp);
		font-size: 2rem;
	}

	p {
		margin: 0;
		max-width: 40rem;
		color: var(--kd-text-dim);
	}

	.hint {
		font-size: 0.85rem;
	}
</style>
