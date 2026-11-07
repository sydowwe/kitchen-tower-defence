<template>
	<article
		ref="root"
		class="entry"
		:class="{ focused, shape: unknown }"
	>
		<span
			class="glyph"
			:class="{ unknown }"
			aria-hidden="true"
		>
			<EntityGlyph :glyph="glyph" />
		</span>
		<div class="about">
			<slot />
		</div>
	</article>
</template>

<script setup lang="ts">
	import { onMounted, ref } from 'vue'
	import EntityGlyph from '@/ui/components/EntityGlyph.vue'

	/**
	 * One entry in the notebook: a tower or an enemy, seen or not, and whatever the list has to say about
	 * it in the slot.
	 *
	 * The silhouette's filter is on the wrapper rather than on the glyph, so it works the same on a sprite
	 * `<img>` and an emoji, and blackens the sprite's own light halo along with it.
	 */

	const {
		glyph,
		unknown = false,
		focused = false,
	} = defineProps<{
		glyph: string
		/** Not seen yet: its shape and nothing else. */
		unknown?: boolean
		/** The entry the notebook was opened on. Scrolled to, once, when it mounts. */
		focused?: boolean
	}>()

	const root = ref<HTMLElement | null>(null)

	onMounted(() => {
		if (focused) {
			root.value?.scrollIntoView({ block: 'center' })
		}
	})
</script>

<style scoped>
	.entry {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.7rem;
		align-items: start;
		height: 100%;
		padding: 0.8rem 0.9rem;
		border: 1px solid var(--kd-day-card-edge);
		border-radius: var(--kd-radius);
		background: var(--kd-day-card);
		color: var(--kd-day-ink);
	}

	/* Its own height: a shape beside a full entry is not stretched into a tall empty card. */
	.entry.shape {
		height: auto;
	}

	.entry.focused {
		border-color: var(--kd-day-owned);
		background: var(--kd-day-owned-soft);
	}

	.glyph {
		font-size: 1.9rem;
		line-height: 1.1;
	}

	.glyph.unknown {
		filter: brightness(0);
		opacity: 0.35;
		user-select: none;
	}

	.about {
		display: grid;
		gap: 0.4rem;
		min-width: 0;
	}
</style>
