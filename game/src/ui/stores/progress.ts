import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { applyNightResult, buyInstallation as buy, newProgress, setLoadout } from '@/core/campaign.ts'
import { toError } from '@/ui/composables/tracked.ts'
import { useAuth } from '@/ui/composables/useAuth.ts'
import { useProgress } from '@/ui/composables/useProgress.ts'
import type { NightResult, Progress } from '@/core/campaign.ts'
import type { LoadoutProblem } from '@/core/loadout.ts'
import type { DefId } from '@/core/types.ts'

export type ProgressStatus = 'idle' | 'loading' | 'saving' | 'error'

/**
 * The campaign's progress, and the only way to change it. **Every write is pessimistic:** the
 * reducer runs on the current state, the result is saved, and only a resolved save assigns it. A
 * failed save keeps the old progress and holds the unsaved one as `pending`, which `retry()` sends
 * again unchanged -- so no rollback exists, and a retry can never award a night twice.
 *
 * A change made while a failed save is pending builds on the pending state rather than the shown one,
 * so a purchase after a failed night save carries that night with it instead of dropping it.
 */
export const useProgressStore = defineStore('progress', () => {
	const auth = useAuth()
	const io = useProgress()

	// Replaced wholesale by a reducer's result, never mutated in place.
	const progress = shallowRef<Progress | null>(null)
	const status = ref<ProgressStatus>('idle')
	const error = ref<Error | null>(null)

	let userId: string | null = null
	let pending: Progress | null = null
	let loaded: Promise<void> | null = null

	async function load(): Promise<void> {
		status.value = 'loading'
		try {
			userId = (await auth.ensureUser()).id
			// A first run has no record: a fresh campaign, held in memory and saved on its first change.
			progress.value = (await io.load(userId)) ?? newProgress()
			status.value = 'idle'
			error.value = null
		} catch (cause) {
			loaded = null
			status.value = 'error'
			error.value = toError(cause)
		}
	}

	function ensureLoaded(): Promise<void> {
		loaded ??= load()
		return loaded
	}

	function isBusy(): boolean {
		return status.value === 'saving' || status.value === 'loading'
	}

	/** The state the next change builds on: the unsaved one if a save failed, else the shown one. */
	function base(): Progress {
		const current = pending ?? progress.value
		if (current === null) {
			throw new Error('progress is not loaded: await ensureLoaded() first')
		}
		return current
	}

	async function commit(next: Progress): Promise<'ok' | 'failed'> {
		if (userId === null) {
			throw new Error('progress is not loaded: await ensureLoaded() first')
		}
		pending = next
		status.value = 'saving'
		try {
			await io.save(userId, next)
			progress.value = next
			pending = null
			status.value = 'idle'
			error.value = null
			return 'ok'
		} catch (cause) {
			status.value = 'error'
			error.value = toError(cause)
			return 'failed'
		}
	}

	async function buyInstallation(id: DefId): Promise<'ok' | 'owned' | 'tooExpensive' | 'busy' | 'failed'> {
		if (isBusy()) {
			return 'busy'
		}
		const bought = buy(base(), id)
		if (!bought.ok) {
			return bought.reason
		}
		return commit(bought.progress)
	}

	/**
	 * Saves tonight's loadout, as the night starts. On `base()` like every change: a Retry after a
	 * failed night save reaches this with that night's result still pending, and has to carry it.
	 */
	async function chooseLoadout(ids: DefId[]): Promise<'ok' | LoadoutProblem | 'busy' | 'failed'> {
		if (isBusy()) {
			return 'busy'
		}
		const chosen = setLoadout(base(), ids)
		if (!chosen.ok) {
			return chosen.reason
		}
		return commit(chosen.progress)
	}

	async function recordNightResult(result: NightResult): Promise<'ok' | 'busy' | 'failed'> {
		if (isBusy()) {
			return 'busy'
		}
		return commit(applyNightResult(base(), result))
	}

	async function resetProgress(): Promise<'ok' | 'busy' | 'failed'> {
		if (isBusy()) {
			return 'busy'
		}
		return commit(newProgress())
	}

	/** Re-sends the unsaved state exactly, or retries a failed load. */
	async function retry(): Promise<void> {
		if (isBusy()) {
			return
		}
		if (pending !== null) {
			await commit(pending)
		} else if (progress.value === null) {
			await ensureLoaded()
		}
	}

	return {
		progress,
		status,
		error,
		ensureLoaded,
		retry,
		buyInstallation,
		chooseLoadout,
		recordNightResult,
		resetProgress,
	}
})
