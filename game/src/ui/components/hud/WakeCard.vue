<template>
	<!--
		Keyed on the wake's id, not on a timer: a second wake in one night replaces this card and
		replays its fade rather than stacking another one under it, and the component owns no state.
		The same trick `TopBar.vue` uses for `food.lastLost`.
	-->
	<p
		:key="wake.id"
		class="wake"
	>
		<span class="title">{{ t('wake.title') }}</span>
		<span class="cost">{{ costSentence }}</span>
	</p>
</template>

<script setup lang="ts">
	import { computed } from 'vue'
	import { useI18n } from 'vue-i18n'
	import { joinNames } from '@/ui/joinNames.ts'
	import type { WakeView } from '@/ui/viewModel.ts'

	/**
	 * What the light coming on cost, in one sentence with the names in it.
	 *
	 * **No buttons and no pointer events.** The night is still running and there is a board to look at;
	 * this is the top bar's `lastLost` line, not `NightSummary.vue`'s backdrop. It says itself once and
	 * goes, and the player should be finished reacting after it has left.
	 *
	 * The list is joined by `joinNames`, the one house pattern for a list of names read as a sentence.
	 */

	const { wake } = defineProps<{ wake: WakeView }>()

	const { t } = useI18n()

	/**
	 * The crumbs first and the towers after, because the crumbs are the part every wake costs and a
	 * tower is the part that only sometimes goes.
	 *
	 * A wake with an empty board and no unbanked income really does cost nothing, and saying so is
	 * better than a sentence trailing off after the colon.
	 */
	const costSentence = computed(() => {
		const items: string[] = []

		if (wake.crumbs > 0) {
			items.push(t('wake.crumbs', { n: wake.crumbs }))
		}
		for (const tower of wake.towers) {
			const name = t(tower.nameKey)
			items.push(tower.count === 1 ? t('wake.tower', { name }) : t('wake.towers', { n: tower.count, name }))
		}

		return items.length === 0
			? t('wake.nothingLost')
			: t('wake.lost', { items: joinNames(items, t('night.listSeparator'), t('general.and')) })
	})
</script>

<style scoped>
	/*
		Under the top bar, so it reads as the consequence of the meter directly above it. It takes no
		pointer events: the board behind it is still being played.
	*/
	.wake {
		position: absolute;
		top: 4.6rem;
		left: 50%;
		display: grid;
		justify-items: center;
		gap: 0.15rem;
		margin: 0;
		padding: 0.5rem 0.9rem;
		border: 1px solid var(--kd-panel-edge);
		border-radius: var(--kd-radius);
		background: var(--kd-panel);
		text-align: center;
		white-space: nowrap;
		animation: wake-fade 5s ease-out forwards;
		pointer-events: none;
	}

	.title {
		color: var(--kd-text);
		font-size: 0.88rem;
	}

	.cost {
		color: var(--kd-danger);
		font-size: 0.8rem;
	}

	/* Arrives quickly, holds long enough to be read twice, and leaves without being dismissed. */
	@keyframes wake-fade {
		0% {
			opacity: 0;
			transform: translateX(-50%) translateY(-0.3rem);
		}

		8% {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}

		75% {
			opacity: 1;
		}

		100% {
			opacity: 0;
		}
	}
</style>
