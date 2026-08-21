<template>
	<section class="ed-panel">
		<h2>Paths</h2>
		<ul class="ed-list">
			<li
				v-for="(path, index) in paths"
				:key="path.id"
			>
				<button
					type="button"
					class="ed-row-btn"
					:class="{ on: index === activePathIndex }"
					@click="activePathIndex = index"
				>
					<span
						class="swatch"
						:style="{ background: pathColor(index) }"
					/>
					<span class="mono">{{ path.id }}</span>
					<span class="ed-value">{{ path.lengthTiles.toFixed(1) }}t</span>
				</button>
				<button
					type="button"
					class="ed-btn small"
					title="Delete this path"
					@click="emit('deletePath', index)"
				>
					×
				</button>
			</li>
		</ul>
		<div class="ed-row">
			<button
				type="button"
				class="ed-btn"
				@click="emit('addPath')"
			>
				Add path
			</button>
		</div>
		<p class="ed-hint">Waypoint 0 of each path is its spawn crack. There is no separate spawn list.</p>
	</section>
</template>

<script setup lang="ts">
	import { pathColor } from '@/dev/editor/overlay.ts'

	const { paths } = defineProps<{
		paths: { id: string; lengthTiles: number }[]
	}>()

	const emit = defineEmits<{ addPath: []; deletePath: [index: number] }>()

	const activePathIndex = defineModel<number>('activePathIndex', { required: true })
</script>

<style scoped>
	.swatch {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 0.15rem;
		flex: none;
	}
</style>
