<template>
	<RouterView />
</template>

<script setup lang="ts">
	import { RouterView } from 'vue-router'
</script>

<style>
	/* The 2am kitchen palette from DECISIONS.md section 2: deep blues, warm pools of lamp light.
	   Functional colour only until the art pass in step 23. */
	:root {
		--kd-night: #10131f;
		--kd-night-soft: #1a1f33;
		--kd-lamp: #f5c66b;
		--kd-text: #e8e6f0;
		--kd-text-dim: #8b90a8;

		/* The HUD's own roles, added in step 8B. Named by what they are *for*, exactly as
		   render/palette.ts is, because step 23 retunes both sides at once and a variable called
		   `--kd-amber` would have to be renamed to be retuned. No hard whites anywhere: the board is
		   the brightest thing on screen (DECISIONS.md section 1). */
		--kd-panel: rgba(20, 24, 39, 0.82);
		--kd-panel-edge: rgba(245, 198, 107, 0.16);
		--kd-panel-raise: rgba(38, 44, 70, 0.9);
		/* Anything the player owns or earns: towers, crumbs, money. */
		--kd-owned: #f5c66b;
		--kd-owned-dim: rgba(245, 198, 107, 0.35);
		/* Anything coming for the food. Cold, so it never reads as yours. */
		--kd-threat: #7fa6d8;
		/* Losing something. Warm, but nothing like the lamp. */
		--kd-danger: #d97b62;
		/* What the type matrix did to a hit: the enemy tooltip's copy of render/palette.ts's three
		   DAMAGE_NUMBER colours. The tooltip is how the board's colours get learned, so the two must match. */
		--kd-hit-weak: #9a978c;
		--kd-hit-neutral: #ffe9a8;
		--kd-hit-strong: #ff9d4f;
		--kd-radius: 0.5rem;
	}

	* {
		box-sizing: border-box;
	}

	html,
	body,
	#app {
		height: 100%;
		margin: 0;
	}

	body {
		background: var(--kd-night);
		color: var(--kd-text);
		font-family: 'Segoe UI', system-ui, sans-serif;
		overflow: hidden;
	}
</style>
