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
