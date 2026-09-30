import { ref } from 'vue'
import type { Ref } from 'vue'

export interface Tracker {
	loading: Readonly<Ref<boolean>>
	error: Readonly<Ref<Error | null>>
	run<T>(call: () => Promise<T>): Promise<T>
}

export function toError(cause: unknown): Error {
	return cause instanceof Error ? cause : new Error(String(cause))
}

/**
 * The `loading` and `error` every persistence composable exposes from day one. `run` rethrows, so
 * the caller still decides what a failure means; `error` is the last failure, cleared on a success.
 */
export function createTracker(): Tracker {
	let inFlight = 0
	const loading = ref(false)
	const error = ref<Error | null>(null)

	async function run<T>(call: () => Promise<T>): Promise<T> {
		inFlight++
		loading.value = true
		try {
			const value = await call()
			error.value = null
			return value
		} catch (cause) {
			error.value = toError(cause)
			throw error.value
		} finally {
			inFlight--
			loading.value = inFlight > 0
		}
	}

	return { loading, error, run }
}
