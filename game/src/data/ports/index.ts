/**
 * The six ports every adapter implements (analytic-docs/PERSISTENCE.md section 3). Every method is
 * async, even where localStorage answers synchronously: the HTTP adapter will not, and its callers
 * already await.
 *
 * The types a port speaks are the **internal** ones. Wire shapes are `data/dto/`'s, and only an
 * adapter ever sees them.
 */

import type { Progress } from '@/core/campaign.ts'
import type { Speed } from '@/loop.ts'

export type { Progress } from '@/core/campaign.ts'

export interface User {
	id: string
	isAnonymous: boolean
}

export interface Profile {
	displayName: string | null
}

/** A speed the player chose. Never 0: pause is its own control, and a restored 0 opens frozen. */
export type PlaySpeed = Exclude<Speed, 0>

export interface Settings {
	speed: PlaySpeed
}

/** One endless-mode run, submitted for ranking. Post-v1: nothing submits one yet. */
export interface RunResult {
	mapId: string
	score: number
}

export interface LeaderboardEntry {
	userId: string
	displayName: string | null
	score: number
}

/** A telemetry event. Not core's `GameEvent`, which is a different thing with a colliding name. */
export interface StatsEvent {
	name: string
	payload: Record<string, string | number | boolean>
}

export type Unsubscribe = () => void

export interface AuthProvider {
	currentUser(): Promise<User | null>
	signIn(): Promise<User>
	signOut(): Promise<void>
	onChange(fn: (user: User | null) => void): Unsubscribe
}

export interface ProfileStore {
	load(userId: string): Promise<Profile | null>
	save(userId: string, profile: Profile): Promise<void>
}

export interface ProgressStore {
	load(userId: string): Promise<Progress | null>
	save(userId: string, progress: Progress): Promise<void>
}

export interface SettingsStore {
	load(userId: string): Promise<Settings | null>
	save(userId: string, settings: Settings): Promise<void>
}

export interface LeaderboardService {
	submit(entry: RunResult): Promise<void>
	top(mapId: string, limit: number): Promise<LeaderboardEntry[]>
}

/** Fire-and-forget: telemetry never blocks, so this is the one method that returns nothing. */
export interface StatsSink {
	record(event: StatsEvent): void
}
