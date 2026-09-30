import type { LeaderboardService, StatsSink } from '@/data/ports/index.ts'

/** Nothing in v1 submits a run. Endless mode and its leaderboard are post-v1. */
export function createNoopLeaderboard(): LeaderboardService {
	return {
		async submit() {},
		async top() {
			return []
		},
	}
}

/** Nothing in v1 records telemetry. */
export function createNoopStatsSink(): StatsSink {
	return {
		record() {},
	}
}
