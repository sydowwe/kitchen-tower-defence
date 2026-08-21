<template>
	<section class="ed-panel">
		<h2>Decor</h2>
		<div class="palette">
			<button
				v-for="glyph in DECOR_PALETTE"
				:key="glyph"
				type="button"
				class="ed-btn glyph"
				:class="{ on: decorGlyph === glyph }"
				@click="decorGlyph = glyph"
			>
				{{ glyph }}
			</button>
		</div>
		<p class="ed-hint">
			A glyph is scenery drawn on top. The
			<code>~</code>
			brush is what makes a tile unbuildable — they are two different things.
		</p>

		<h3>Fridge glyph</h3>
		<div class="palette">
			<button
				v-for="glyph in FRIDGE_GLYPHS"
				:key="glyph"
				type="button"
				class="ed-btn glyph"
				:class="{ on: fridgeGlyph === glyph }"
				@click="emit('setFridgeGlyph', glyph)"
			>
				{{ glyph }}
			</button>
		</div>
	</section>
</template>

<script setup lang="ts">
	import { DECOR_PALETTE, FRIDGE_GLYPHS } from '@/dev/editor/tools.ts'

	const { fridgeGlyph } = defineProps<{ fridgeGlyph: string }>()

	const emit = defineEmits<{ setFridgeGlyph: [glyph: string] }>()

	const decorGlyph = defineModel<string>('decorGlyph', { required: true })
</script>

<style scoped>
	.palette {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 0.25rem;
	}
</style>
