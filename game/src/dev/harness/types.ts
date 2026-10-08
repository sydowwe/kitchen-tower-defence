/**
 * The balance harness's vocabulary: a job, the row it produces, and the two kinds of player a job
 * names -- a policy that plays the night and a loadout policy that chooses what it is played with.
 *
 * Everything here is plain TypeScript that would run in a page. `cli.ts` is the one file in this
 * directory allowed a `node:` import, and the lint config holds the rest to that.
 */

import { defaultLoadout } from '@/dev/harness/loadouts.ts'
import { idle } from '@/dev/harness/policies/idle.ts'
import type { Progress } from '@/core/campaign.ts'
import type { Command } from '@/core/commands.ts'
import type { DefId, DifficultyId, World } from '@/core/types.ts'

/** What a policy is told about tonight before tick 0. */
export interface NightContext {
	progress: Progress
	loadout: readonly DefId[]
}

/**
 * One player, for one night. **It writes nothing**: it reads the world and returns commands, which the
 * runner enqueues and logs. Its state lives on the object -- `runNight` makes a fresh one per night --
 * and never in module scope, or the same job gives different rows in a different order.
 *
 * `economy` is whether it wants economy towers brought, which is the loadout policy's question.
 */
export interface Policy {
	readonly name: string
	readonly economy: boolean
	/** Once, before tick 0. */
	begin(world: World, night: NightContext): void
	/** Every tick, before it runs. Commands only. */
	decide(world: World): readonly Command[]
}

export type PolicyFactory = (options: { seed: number }) => Policy

/**
 * What a night is played with. A list goes through `setLoadout`, and a refusal throws: it is a policy
 * bug. Null is what the loadout screen would have preselected, `tonightsLoadout`.
 */
export interface LoadoutPolicy {
	readonly name: string
	choose(progress: Progress, wants: { economy: boolean }): DefId[] | null
}

/** A command and the tick it was enqueued before. What `replayNight` replays. */
export interface LoggedCommand {
	tick: number
	command: Command
}

/** One knob of the content set to one value for a job. Step 22C fills it in; nothing here sets one. */
export interface Sweep {
	knob: string
	value: number
}

/**
 * The unit of work, and plain data: `runJob` depends on nothing else, so the same job gives the same
 * rows in any process and any order.
 *
 * - `'night'`: each of `nights` played on its own, from a progress built for it.
 * - `'campaign'`: played from night 1 through the last of `nights`, paying and buying in between.
 */
export interface Job {
	kind: 'night' | 'campaign'
	nights: DefId[]
	difficulty: DifficultyId
	seed: number
	policy: string
	loadoutPolicy: string
	/** Owned before the first night. A campaign buys more as it goes. */
	installations: DefId[]
	sweep: Sweep | null
	/** The stall cap. Absent is `MAX_NIGHT_TICKS`. */
	maxTicks?: number
}

/**
 * - `stalled`: still running at the tick cap. No Grocery Money: a night that has not ended has none.
 * - `stuck`: a campaign's loss whose retry would rebuild the identical world, so the campaign stopped.
 */
export type Outcome = 'won' | 'lost' | 'stalled' | 'stuck'

/** One night, as one CSV row. Column order is `csv.ts`'s; null is an empty field. */
export interface Row {
	mode: Job['kind']
	night: DefId
	nightIndex: number
	map: DefId
	difficulty: DifficultyId
	policy: string
	loadoutPolicy: string
	loadout: string
	installations: string
	seed: number
	attempt: number
	sweepKnob: string | null
	sweepValue: number | null
	outcome: Outcome
	ticks: number
	wavesStarted: number
	wavesCleared: number
	waveCount: number
	foodStart: number
	foodRemaining: number
	crumbsStart: number
	crumbsEarned: number
	crumbsSpent: number
	/** The wallet when the night ended, which evaporates at sunrise (analytic-docs/DECISIONS.md section 4). */
	crumbsWastedAtSunrise: number
	crumbsDropped: number
	crumbsCollected: number
	/** Both halves of every wake: the unbanked wallet and the piles swept off the board. */
	crumbsForfeited: number
	towersBuilt: number
	towersSold: number
	towersDestroyed: number
	enemiesKilled: number
	enemiesLeaked: number
	thievesEscaped: number
	peakNoise: number
	wakeCount: number
	groceryMoney: number | null
	/** The mean cost of every unlocked tower, tonight's loadout or not. */
	rosterMeanCost: number
	/** `crumbsEarned / wavesStarted / rosterMeanCost`. Null before a wave has started. */
	towersAffordablePerWave: number | null
	damageTotal: number
	/** A tower def id, a tile effect kind, or `unattributed`. Null when nothing was damaged. */
	topDamageSource: string | null
	topDamageShare: number | null
}

export const POLICIES: Readonly<Record<string, PolicyFactory>> = {
	idle,
}

export const LOADOUT_POLICIES: Readonly<Record<string, LoadoutPolicy>> = {
	default: defaultLoadout,
}
