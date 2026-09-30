<template>
	<img
		v-if="src !== undefined"
		class="sprite"
		:src="src"
		alt=""
		draggable="false"
	/>
	<span v-else>{{ glyph }}</span>
</template>

<script setup lang="ts">
	import { computed } from 'vue'
	import { spriteUrl } from '@/render/index.ts'

	/**
	 * A tower or an enemy as the HUD shows it: its sprite where one exists, the emoji where not -- the
	 * same rule the board follows (`render/sprites.ts`). Sized in `em`, so it takes whatever font size
	 * the emoji it replaces was given and every existing `.glyph` rule keeps working.
	 *
	 * Towers and enemies only. An installation's glyph can equal a tower's (the Bigger Fridge is 🧊),
	 * so passing one here would draw an Ice Cube Tray.
	 */

	const { glyph } = defineProps<{ glyph: string }>()

	const src = computed(() => spriteUrl(glyph))
</script>

<style scoped>
	/* The frame is 1/0.85 of an em so the object inside it, which fills 85% of the frame, comes out the
	   size the emoji was (analytic-docs/SPRITES.md, the same factor as `SPRITE_FILL` in glyphCache.ts).

	   The halo is four hard-edged drop shadows, one a side, rather than one blurred one: a blur reads
	   as a glow, and on the board the halo is a crisp line. Chained, each shadows the last, so the
	   corners fill in. */
	.sprite {
		display: inline-block;
		width: calc(1em / 0.85);
		height: calc(1em / 0.85);
		vertical-align: middle;
		filter: drop-shadow(1px 0 0 var(--kd-sprite-halo)) drop-shadow(-1px 0 0 var(--kd-sprite-halo))
			drop-shadow(0 1px 0 var(--kd-sprite-halo)) drop-shadow(0 -1px 0 var(--kd-sprite-halo));
		user-select: none;
	}
</style>
