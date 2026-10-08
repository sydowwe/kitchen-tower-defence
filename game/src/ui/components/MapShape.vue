<template>
	<svg
		class="map-shape"
		:viewBox="`0 0 ${shape.widthTiles} ${shape.heightTiles}`"
		preserveAspectRatio="xMidYMid meet"
		aria-hidden="true"
	>
		<rect
			v-for="tile in tiles"
			:key="tile.index"
			:x="tile.x"
			:y="tile.y"
			width="1"
			height="1"
			:class="tile.cell"
		/>
		<polyline
			v-for="(points, index) in lanes"
			:key="`lane-${index}`"
			class="lane"
			:points="points"
		/>
		<circle
			v-for="(spawn, index) in spawns"
			:key="`spawn-${index}`"
			class="spawn"
			:cx="spawn.x + 0.5"
			:cy="spawn.y + 0.5"
			r="0.42"
		/>
		<rect
			class="fridge"
			:x="shape.fridge.x + 0.1"
			:y="shape.fridge.y + 0.1"
			width="0.8"
			height="0.8"
			rx="0.15"
		/>
	</svg>
</template>

<script setup lang="ts">
	import { computed } from 'vue'
	import type { MapCell, MapShapeView } from '@/ui/kitchenView.ts'

	/**
	 * A map's shape, drawn small: where you can build, where the lanes run, where they start and where
	 * the fridge is. An SVG in tile units rather than a canvas, so it scales with its container and
	 * draws from a view model a spec can check (step 21F, decision 3). The name is printed beside it, so
	 * it is hidden from the accessibility tree.
	 */

	const { shape } = defineProps<{ shape: MapShapeView }>()

	const tiles = computed(() =>
		shape.cells.map((cell: MapCell, index) => ({
			index,
			cell,
			x: index % shape.widthTiles,
			y: Math.floor(index / shape.widthTiles),
		})),
	)

	/** Waypoints sit on tile centres, and a tile's rect starts at its corner. */
	const lanes = computed(() =>
		shape.lanes.map(lane => lane.map(point => `${point.x + 0.5},${point.y + 0.5}`).join(' ')),
	)

	const spawns = computed(() => shape.lanes.flatMap(lane => (lane[0] === undefined ? [] : [lane[0]])))
</script>

<style scoped>
	.map-shape {
		display: block;
		width: 100%;
		height: auto;
		border-radius: 0.4rem;
		background: var(--kd-day-frame);
	}

	rect {
		shape-rendering: crispEdges;
	}

	.buildable {
		fill: var(--kd-day-tile);
	}

	.blocked {
		fill: var(--kd-day-counter);
	}

	.decor {
		fill: var(--kd-day-counter-top);
	}

	.track {
		fill: var(--kd-day-floor);
	}

	.lane {
		fill: none;
		stroke: var(--kd-day-ink);
		stroke-width: 0.18;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-dasharray: 0.5 0.3;
		opacity: 0.7;
	}

	.spawn {
		fill: var(--kd-day-danger);
	}

	.fridge {
		fill: var(--kd-day-card);
		stroke: var(--kd-day-owned);
		stroke-width: 0.14;
		shape-rendering: auto;
	}
</style>
