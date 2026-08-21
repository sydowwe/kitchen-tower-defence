<template>
	<section class="ed-panel">
		<h2>Tool</h2>
		<div class="ed-row">
			<button
				v-for="name in EDITOR_TOOLS"
				:key="name"
				type="button"
				class="ed-btn"
				:class="{ on: tool === name }"
				@click="tool = name"
			>
				{{ TOOL_LABELS[name] }}
			</button>
		</div>
		<p class="ed-hint">{{ TOOL_HINTS[tool] }}</p>

		<template v-if="tool === 'brush'">
			<div class="ed-row">
				<button
					v-for="char in BRUSH_CHARS"
					:key="char"
					type="button"
					class="ed-btn mono"
					:class="{ on: brushChar === char }"
					@click="brushChar = char"
				>
					{{ char }} {{ CHAR_LABELS[char] }}
				</button>
			</div>
			<label class="ed-field">
				Size
				<input
					v-model.number="brushSize"
					type="range"
					:min="MIN_BRUSH_TILES"
					:max="MAX_BRUSH_TILES"
					step="1"
				/>
				<span class="ed-value">{{ brushSize }}×{{ brushSize }}</span>
			</label>
		</template>

		<label class="ed-check">
			<input
				v-model="snapToTile"
				type="checkbox"
			/>
			Snap waypoints to tile centres
		</label>
		<label class="ed-check">
			<input
				v-model="showGrid"
				type="checkbox"
			/>
			Grid and coordinates
		</label>

		<div class="ed-row">
			<button
				type="button"
				class="ed-btn"
				:disabled="!canUndo"
				@click="emit('undo')"
			>
				Undo
			</button>
			<button
				type="button"
				class="ed-btn"
				:disabled="!canRedo"
				@click="emit('redo')"
			>
				Redo
			</button>
		</div>
		<p class="ed-hint">Ctrl+Z / Ctrl+Shift+Z · [ ] cycles the active path</p>
	</section>
</template>

<script setup lang="ts">
	import { BRUSH_CHARS, MAX_BRUSH_TILES, MIN_BRUSH_TILES, type BrushChar } from '@/dev/editor/edits.ts'
	import { EDITOR_TOOLS, TOOL_HINTS, TOOL_LABELS, type EditorTool } from '@/dev/editor/tools.ts'

	const { canUndo = false, canRedo = false } = defineProps<{
		canUndo?: boolean
		canRedo?: boolean
	}>()

	const emit = defineEmits<{ undo: []; redo: [] }>()

	const tool = defineModel<EditorTool>('tool', { required: true })
	const brushChar = defineModel<BrushChar>('brushChar', { required: true })
	const brushSize = defineModel<number>('brushSize', { required: true })
	const snapToTile = defineModel<boolean>('snapToTile', { required: true })
	const showGrid = defineModel<boolean>('showGrid', { required: true })

	const CHAR_LABELS: Record<BrushChar, string> = {
		'.': 'floor',
		'#': 'blocked',
		'~': 'decor',
	}
</script>
