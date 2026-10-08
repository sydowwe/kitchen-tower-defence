import type { Command } from '@/core/commands.ts'
import type { Policy } from '@/dev/harness/types.ts'

const NOTHING: readonly Command[] = []

/**
 * Builds nothing and calls nothing: the undefended baseline, how fast a night falls with no answer at
 * all. Every night it plays is lost.
 */
export function idle(): Policy {
	return {
		name: 'idle',
		economy: false,
		begin() {
			// Nothing to plan.
		},
		decide() {
			return NOTHING
		},
	}
}
