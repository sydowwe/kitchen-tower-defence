/**
 * Playing nights headless, as fast as the sim goes.
 *
 * **Every night is built the game's way**: the loadout through `setLoadout`, the world through
 * `worldOptionsFor` and `createWorld`, the result through `nightResultOf` and `applyNightResult`. The
 * harness adds no rule of its own to a night; it only decides who plays it and when to stop watching.
 */

import {
	applyNightResult,
	buyInstallation,
	currentNight,
	newProgress,
	nightResultOf,
	setLoadout,
	tonightsLoadout,
	worldOptionsFor,
} from '@/core/campaign.ts'
import { createCommandQueue } from '@/core/commands.ts'
import { getNightDef, INSTALLATIONS } from '@/core/content/index.ts'
import { tick } from '@/core/sim.ts'
import { createWorld } from '@/core/world.ts'
import { createTally, rowOf, tallyEvents } from '@/dev/harness/row.ts'
import { LOADOUT_POLICIES, POLICIES } from '@/dev/harness/types.ts'
import type { Progress } from '@/core/campaign.ts'
import type { DefId, World } from '@/core/types.ts'
import type { CreateWorldOptions } from '@/core/world.ts'
import type { Job, LoadoutPolicy, LoggedCommand, Policy, PolicyFactory, Row, Sweep } from '@/dev/harness/types.ts'

/**
 * Twenty game-minutes. A night still running here is `stalled` rather than a hang: a mold nobody can
 * shoot is a night that never ends. The longest defended night measured while writing step 22 was
 * 22,219 ticks.
 */
export const MAX_NIGHT_TICKS = 72_000

/** What `runNight` hands back: the row, and everything a replay of it needs. */
export interface NightRun {
	row: Row
	log: LoggedCommand[]
	world: World
	options: CreateWorldOptions
	/** The progress the night was built from, with tonight's loadout stored as the game stores it. */
	progress: Progress
}

/** The row's labels that are not the night's own, and the cap. */
export interface NightLabels {
	mode: Job['kind']
	sweep: Sweep | null
	attempt: number
	maxTicks: number
}

const NIGHT_MODE: NightLabels = { mode: 'night', sweep: null, attempt: 1, maxTicks: MAX_NIGHT_TICKS }

/** A night ready to play: its player, its stored loadout and the options the world is built from. */
interface PreparedNight {
	player: Policy
	progress: Progress
	options: CreateWorldOptions
}

function isOver(world: World): boolean {
	return world.night.phase === 'won' || world.night.phase === 'lost'
}

/**
 * The game's Start button. A list goes through `setLoadout`, and so does a null -- as the preselection,
 * `tonightsLoadout`, which is what the loadout screen stores when nobody touches it. That stored list is
 * what tomorrow's "last night's" reads in a campaign.
 */
function prepareNight(
	progress: Progress,
	seed: number,
	policy: PolicyFactory,
	loadoutPolicy: LoadoutPolicy,
): PreparedNight {
	const player = policy({ seed })
	const chosen = loadoutPolicy.choose(progress, { economy: player.economy }) ?? tonightsLoadout(progress)
	const stored = setLoadout(progress, chosen)
	if (!stored.ok) {
		throw new Error(
			`loadout policy '${loadoutPolicy.name}' chose [${chosen.join(', ')}] for '${progress.nightId}': ${stored.reason}`,
		)
	}
	return { player, progress: stored.progress, options: worldOptionsFor(stored.progress, seed) }
}

function playNight(
	prepared: PreparedNight,
	loadoutPolicy: LoadoutPolicy,
	patch: ((world: World) => void) | undefined,
	labels: NightLabels,
): NightRun {
	const { player, progress, options } = prepared
	const world = createWorld(options)
	patch?.(world)

	const crumbsStart = world.crumbs
	const foodStart = world.night.food.length
	player.begin(world, { progress, loadout: world.night.loadout ?? [] })

	const queue = createCommandQueue()
	const log: LoggedCommand[] = []
	const tally = createTally()

	while (!isOver(world) && world.tick < labels.maxTicks) {
		for (const command of player.decide(world)) {
			queue.enqueue(command)
			// A copy: the log is a record, and a policy reusing its command objects must not rewrite it.
			log.push({ tick: world.tick, command: structuredClone(command) })
		}
		tick(world, queue)
		// Now and not after the loop: `tick` truncates `world.events` at its top.
		tallyEvents(tally, world.events)
	}

	const outcome = world.night.phase === 'won' ? 'won' : world.night.phase === 'lost' ? 'lost' : 'stalled'
	const row = rowOf(
		world,
		tally,
		{
			mode: labels.mode,
			policy: player.name,
			loadoutPolicy: loadoutPolicy.name,
			sweep: labels.sweep,
			attempt: labels.attempt,
			progress,
			crumbsStart,
			foodStart,
		},
		outcome,
	)

	return { row, log, world, options, progress }
}

/**
 * One night from `progress`, played by a fresh `policy` until it ends or reaches the cap. `patch` runs
 * on the built world before tick 0; step 22C's sweep is its only caller.
 */
export function runNight(
	progress: Progress,
	seed: number,
	policy: PolicyFactory,
	loadoutPolicy: LoadoutPolicy,
	patch?: (world: World) => void,
	labels: NightLabels = NIGHT_MODE,
): NightRun {
	return playNight(prepareNight(progress, seed, policy, loadoutPolicy), loadoutPolicy, patch, labels)
}

/**
 * The logged commands, enqueued at their ticks into a fresh world built from the same options, run to
 * the same end. A policy that wrote the world or drew on `world.rng` ends somewhere else.
 */
export function replayNight(
	options: CreateWorldOptions,
	patch: ((world: World) => void) | undefined,
	log: readonly LoggedCommand[],
	maxTicks = MAX_NIGHT_TICKS,
): World {
	const world = createWorld(options)
	patch?.(world)
	const queue = createCommandQueue()

	let next = 0
	while (!isOver(world) && world.tick < maxTicks) {
		for (let entry = log[next]; entry !== undefined && entry.tick === world.tick; entry = log[++next]) {
			queue.enqueue(entry.command)
		}
		tick(world, queue)
	}

	return world
}

/** Counter space first, cheapest first; then the rest in `INSTALLATIONS` order. */
const PURCHASE_ORDER: readonly DefId[] = [
	...INSTALLATIONS.filter(def => def.effect.kind === 'loadoutSlots')
		.sort((a, b) => a.cost - b.cost)
		.map(def => def.id),
	...INSTALLATIONS.filter(def => def.effect.kind !== 'loadoutSlots').map(def => def.id),
]

/** Buys down the fixed order while the next one is affordable, and saves up for the one that is not. */
function buyInstallations(progress: Progress): Progress {
	let bought = progress
	for (const id of PURCHASE_ORDER) {
		if (bought.installations.includes(id)) {
			continue
		}
		const result = buyInstallation(bought, id)
		if (!result.ok) {
			break
		}
		bought = result.progress
	}
	return bought
}

/** What makes two attempts the same world: the options it is built from, and what is owned. */
function attemptKey(prepared: PreparedNight): string {
	return JSON.stringify([prepared.options, prepared.progress.installations])
}

/**
 * From `start` through the night with index `lastNightIndex`, every night on `seed`: each result paid
 * through `applyNightResult`, installations bought after it, and a loss retried the way the game
 * retries -- same seed, the loadout policy asked again. A retry that would rebuild the world it just
 * lost is the same night again, so the campaign stops there and that loss's row is `stuck`. A stall
 * ends the run: it has no result to apply.
 */
export function runCampaign(
	start: Progress,
	seed: number,
	policy: PolicyFactory,
	loadoutPolicy: LoadoutPolicy,
	lastNightIndex: number,
	sweep: Sweep | null = null,
	maxTicks = MAX_NIGHT_TICKS,
): { rows: Row[]; progress: Progress } {
	const rows: Row[] = []
	let progress = start
	let attempt = 1
	let lastAttempt: string | null = null

	for (let night = currentNight(progress); night !== null && night.index <= lastNightIndex;) {
		const prepared = prepareNight(progress, seed, policy, loadoutPolicy)
		const key = attemptKey(prepared)
		const lost = rows[rows.length - 1]
		if (key === lastAttempt && lost !== undefined) {
			lost.outcome = 'stuck'
			break
		}

		const run = playNight(prepared, loadoutPolicy, undefined, { mode: 'campaign', sweep, attempt, maxTicks })
		rows.push(run.row)
		if (run.row.outcome === 'stalled') {
			break
		}

		progress = buyInstallations(applyNightResult(run.progress, nightResultOf(run.world)))
		const next = currentNight(progress)
		if (next?.id === night.id) {
			attempt++
			lastAttempt = key
		} else {
			attempt = 1
			lastAttempt = null
		}
		night = next
	}

	return { rows, progress }
}

function policyNamed(name: string): PolicyFactory {
	const policy = POLICIES[name]
	if (policy === undefined) {
		throw new Error(`unknown policy '${name}'`)
	}
	return policy
}

function loadoutPolicyNamed(name: string): LoadoutPolicy {
	const loadoutPolicy = LOADOUT_POLICIES[name]
	if (loadoutPolicy === undefined) {
		throw new Error(`unknown loadout policy '${name}'`)
	}
	return loadoutPolicy
}

/** A job's rows. Depends on the job and nothing else. */
export function runJob(job: Job): Row[] {
	const policy = policyNamed(job.policy)
	const loadoutPolicy = loadoutPolicyNamed(job.loadoutPolicy)
	const maxTicks = job.maxTicks ?? MAX_NIGHT_TICKS
	// Set directly, never through `startCampaign`: that refuses Nightmare until Normal is cleared, and
	// the harness plays every tier from night 1.
	const start: Progress = { ...newProgress(), difficulty: job.difficulty, installations: [...job.installations] }

	if (job.kind === 'campaign') {
		const last = Math.max(...job.nights.map(id => getNightDef(id).index))
		return runCampaign(start, job.seed, policy, loadoutPolicy, last, job.sweep, maxTicks).rows
	}

	return job.nights.map(
		nightId =>
			runNight({ ...start, nightId }, job.seed, policy, loadoutPolicy, undefined, {
				mode: 'night',
				sweep: job.sweep,
				attempt: 1,
				maxTicks,
			}).row,
	)
}
