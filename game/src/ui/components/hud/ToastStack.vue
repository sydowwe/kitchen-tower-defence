<template>
	<TransitionGroup
		tag="ul"
		name="toast"
		class="toasts"
	>
		<li
			v-for="toast in toasts"
			:key="toast.id"
			class="toast"
		>
			<FontAwesomeIcon icon="ban" />
			{{ t(toast.messageKey) }}
		</li>
	</TransitionGroup>
</template>

<script setup lang="ts">
	import { useI18n } from 'vue-i18n'

	/**
	 * Why the last click did nothing, said once and briefly.
	 *
	 * This component **owns neither the queue nor the timer**. Step 8C's interaction layer is what
	 * refuses a click, and a message's lifetime belongs next to the thing that produced it -- a
	 * timeout in here would be a second clock, and it would keep counting down over a paused game.
	 */

	const { toasts = [] } = defineProps<{ toasts?: { id: number; messageKey: string }[] }>()

	const { t } = useI18n()
</script>

<style scoped>
	/* No pointer events anywhere in here: a toast is read, never clicked, and it sits over the middle
	   of the board where the crumbs are. */
	.toasts {
		position: absolute;
		bottom: 7.5rem;
		left: 50%;
		display: grid;
		justify-items: center;
		gap: 0.3rem;
		margin: 0;
		padding: 0;
		transform: translateX(-50%);
		list-style: none;
	}

	.toast {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.7rem;
		border: 1px solid var(--kd-panel-edge);
		border-radius: 999px;
		background: var(--kd-panel);
		color: var(--kd-danger);
		font-size: 0.78rem;
		white-space: nowrap;
	}

	.toast-enter-from,
	.toast-leave-to {
		opacity: 0;
		transform: translateY(0.4rem);
	}

	.toast-enter-active,
	.toast-leave-active {
		transition:
			opacity 140ms ease,
			transform 140ms ease;
	}

	.toast-leave-active {
		position: absolute;
	}
</style>
