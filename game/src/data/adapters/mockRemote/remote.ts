/**
 * The deliberately unreliable remote (analytic-docs/PERSISTENCE.md section 2, rule 2): a decorator
 * over the local adapters that waits, then fails on purpose or delegates. It exists so the UI grows
 * its spinners and retry buttons against something that behaves like a network.
 */

export const MIN_LATENCY_MS = 200
export const MAX_LATENCY_MS = 600

export class RemoteUnavailableError extends Error {
	override name = 'RemoteUnavailableError'
}

/** Shared by every decorated adapter of one data layer, so one dev toggle moves them all. */
export interface MockControl {
	failureRate: number
}

/** Waits 200-600 ms, then rejects at the control's failure rate or runs `call`. */
export function viaRemote<T>(control: MockControl, call: () => Promise<T>): Promise<T> {
	const latency = MIN_LATENCY_MS + Math.random() * (MAX_LATENCY_MS - MIN_LATENCY_MS)
	return new Promise((resolve, reject) => {
		setTimeout(function arrive() {
			if (Math.random() < control.failureRate) {
				reject(new RemoteUnavailableError('the mock remote dropped this request on purpose'))
				return
			}
			call().then(resolve, reject)
		}, latency)
	})
}
