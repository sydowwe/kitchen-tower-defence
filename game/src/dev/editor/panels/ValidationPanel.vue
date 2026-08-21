<template>
	<section class="ed-panel">
		<h2>
			Validation
			<span
				class="ed-value"
				:class="{ good: errors.length === 0 && warnings.length === 0 }"
			>
				{{ errors.length }}e / {{ warnings.length }}w
			</span>
		</h2>

		<p
			v-if="errors.length === 0 && warnings.length === 0"
			class="ed-hint quiet"
		>
			Nothing to report. The map loads and plays.
		</p>

		<ul class="ed-list problems">
			<li
				v-for="(problem, index) in ordered"
				:key="`${problem.severity}-${index}-${problem.message}`"
			>
				<button
					type="button"
					class="ed-row-btn"
					:class="problem.severity"
					@click="emit('focus', problem)"
				>
					{{ problem.message }}
				</button>
			</li>
		</ul>

		<template v-if="convergence.length > 0">
			<h3>Convergence</h3>
			<ul class="ed-list">
				<li
					v-for="entry in convergence"
					:key="entry.pathIds.join('+')"
					class="ed-static"
				>
					<span class="mono">{{ entry.pathIds[0] }} + {{ entry.pathIds[1] }}</span>
					<span
						class="ed-value"
						:class="{ good: entry.sharedTiles >= MIN_SHARED_TILES }"
					>
						{{ entry.sharedTiles }} shared
					</span>
				</li>
			</ul>
			<p class="ed-hint">Step 21 wants a shared final stretch of at least {{ MIN_SHARED_TILES }} tiles.</p>
		</template>

		<p class="ed-hint">Buildable: {{ buildablePercent.toFixed(0) }}% of the board</p>
	</section>
</template>

<script setup lang="ts">
	import { computed } from 'vue'
	import type { Convergence, Problem } from '@/dev/editor/validate.ts'

	const {
		problems = [],
		convergence = [],
		buildablePercent = 0,
	} = defineProps<{
		problems?: Problem[]
		convergence?: Convergence[]
		buildablePercent?: number
	}>()

	const emit = defineEmits<{ focus: [problem: Problem] }>()

	/**
	 * The shared final stretch step 21 authors against. Restated here rather than imported, because
	 * `validate.ts` does not warn on it -- a single-lane map has no convergence to be short of, and
	 * the number is only ever read while looking at this panel.
	 */
	const MIN_SHARED_TILES = 6

	const errors = computed(() => problems.filter(problem => problem.severity === 'error'))
	const warnings = computed(() => problems.filter(problem => problem.severity === 'warn'))

	/** Errors above warnings: the first thing in the list is always the thing that blocks export. */
	const ordered = computed(() => [...errors.value, ...warnings.value])
</script>

<style scoped>
	.problems button {
		text-align: left;
		white-space: normal;
	}

	.problems .error {
		color: #ff8a8a;
	}

	.problems .warn {
		color: #ffca6b;
	}

	.quiet {
		opacity: 0.6;
	}
</style>
