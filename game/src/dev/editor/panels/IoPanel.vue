<template>
	<section class="ed-panel">
		<h2>Map</h2>
		<label class="ed-field">
			id
			<input
				class="mono grow"
				:value="mapId"
				@change="onRename"
			/>
		</label>

		<div class="ed-row">
			<button
				type="button"
				class="ed-btn"
				@click="emit('newMap')"
			>
				New empty
			</button>
			<select
				class="ed-btn grow"
				value=""
				@change="onPickRegistered"
			>
				<option
					value=""
					disabled
				>
					Import registered…
				</option>
				<option
					v-for="id in registeredIds"
					:key="id"
					:value="id"
				>
					{{ id }}
				</option>
			</select>
		</div>

		<details>
			<summary>Paste JSON</summary>
			<textarea
				v-model="pasted"
				class="mono"
				rows="6"
				spellcheck="false"
				placeholder='{ "id": … }'
			/>
			<div class="ed-row">
				<button
					type="button"
					class="ed-btn"
					:disabled="pasted.trim() === ''"
					@click="onPaste"
				>
					Import pasted
				</button>
			</div>
		</details>

		<div class="ed-row">
			<button
				type="button"
				class="ed-btn"
				@click="emit('export')"
			>
				Export
			</button>
			<button
				type="button"
				class="ed-btn"
				@click="emit('preview')"
			>
				Preview in game
			</button>
		</div>

		<p
			v-if="status !== ''"
			class="ed-status"
			:class="{ bad: statusIsError }"
		>
			{{ status }}
		</p>
	</section>
</template>

<script setup lang="ts">
	import { ref } from 'vue'

	const {
		mapId,
		registeredIds = [],
		status = '',
		statusIsError = false,
	} = defineProps<{
		mapId: string
		registeredIds?: string[]
		status?: string
		statusIsError?: boolean
	}>()

	const emit = defineEmits<{
		newMap: []
		renameMap: [id: string]
		importRegistered: [id: string]
		importJson: [text: string]
		export: []
		preview: []
	}>()

	const pasted = ref('')

	function onRename(event: Event): void {
		const input = event.target
		if (input instanceof HTMLInputElement) {
			emit('renameMap', input.value.trim())
		}
	}

	/**
	 * The select is reset to its placeholder every time, so importing the same map twice in a row is
	 * two clicks rather than a change event that never fires.
	 */
	function onPickRegistered(event: Event): void {
		const select = event.target
		if (!(select instanceof HTMLSelectElement) || select.value === '') {
			return
		}
		const id = select.value
		select.value = ''
		emit('importRegistered', id)
	}

	function onPaste(): void {
		emit('importJson', pasted.value)
	}
</script>

<style scoped>
	textarea {
		width: 100%;
		resize: vertical;
	}

	summary {
		cursor: pointer;
		color: var(--kd-text-dim);
		font-size: 0.75rem;
		margin: 0.25rem 0;
	}
</style>
