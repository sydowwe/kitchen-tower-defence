/**
 * `npm run balance`: arguments to jobs, jobs to rows, rows to a CSV on disk. Loaded by
 * `scripts/balance.mjs` through Vite, so content is validated at boot exactly as under `npm run dev`.
 *
 * **The only file in `dev/harness/` that may import a `node:` module.** Everything it calls would run
 * in a page; this is where the disk and the clock are.
 */

import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { DIFFICULTY_LADDER } from '@/core/campaign.ts'
import { INSTALLATIONS, MAPS, NIGHTS, TOWERS } from '@/core/content/index.ts'
import { fromCsv, toCsv } from '@/dev/harness/csv.ts'
import { parseFixed } from '@/dev/harness/loadouts.ts'
import { buildReport } from '@/dev/harness/report.ts'
import { runJob } from '@/dev/harness/run.ts'
import { isJobLine, mergeShards, parseShard, runShard } from '@/dev/harness/shard.ts'
import { parseSweep, SWEEP_KNOBS } from '@/dev/harness/sweep.ts'
import { LOADOUT_POLICIES, POLICIES } from '@/dev/harness/types.ts'
import type { DefId, DifficultyId } from '@/core/types.ts'
import type { Shard } from '@/dev/harness/shard.ts'
import type { Job, Row, Sweep } from '@/dev/harness/types.ts'

const HELP = `npm run balance -- [options]

  --nights 1-18          night indices or ids, comma-separated, ranges allowed (default 1-18)
  --endless counter,sink the endless run on these maps, or all, instead of --nights: each plays on a
                         campaign already cleared on the tier, and scores the waves it survived
  --max-waves N          with --endless: stop, stalled, once N waves have started (default: no cap, the
                         run ends on the food or on the last generated wave)
  --difficulty normal    cozy, normal, nightmare, comma-separated, or all (default normal)
  --runs 1               runs per night (campaign mode: per campaign); run i plays seed + i
  --seed 1234            the first seed. 1234 is the game's own, so run 0 is the night a player gets
  --policy idle          who plays: ${Object.keys(POLICIES).join(', ')}
  --loadout default      what they bring: ${Object.keys(LOADOUT_POLICIES).join(', ')}, or
                         fixed=saltShaker|lemon|cookieJar for exactly that list every night
  --installations a,b    owned from the start, or all
  --campaign             play night 1 through the last of --nights in order, paying Grocery Money and
                         buying installations between nights, retrying losses on the same seed
  --sweep knob=0.6:1.6:0.1
                         run everything once per value, from:to:step inclusive, or knob=value.
                         knobs: ${SWEEP_KNOBS.join(', ')}
  --jobs N               processes to spread the jobs over (default: cores - 1)
  --out .balance/results.csv
  --report               also write report.html beside the CSV
  --report-only a.csv    rebuild report.html beside a.csv from it, running nothing

Night mode (the default) plays each night from a fresh progress, so it stores no "last night": there
'default' brings the oldest towers unlocked. In campaign mode 'default' brings last night's plus
tonight's unlock. Don't compare 'default' rows across the two modes.
`

/** A mistake in the arguments: printed as a message, not a stack. */
class UsageError extends Error {}

interface Options {
	nights: DefId[]
	/** Whether `--nights` was typed: it and `--endless` are two answers to which nights. */
	nightsGiven: boolean
	/** Map ids, or null for the nights. */
	endless: DefId[] | null
	maxWaves: number | null
	difficulties: DifficultyId[]
	runs: number
	seed: number
	policies: string[]
	loadouts: string[]
	installations: DefId[]
	campaign: boolean
	/** One per value, or null for an unswept run. */
	sweeps: Sweep[] | null
	jobs: number
	/** Set on a child of `--jobs`: run this shard and write job lines to stdout. */
	shard: Shard | null
	out: string
	report: boolean
	reportOnly: string | null
	help: boolean
}

/** What `--jobs` forks: the launcher, `scripts/balance.mjs`. */
export interface Launch {
	launcher: string
}

function list(value: string): string[] {
	return value
		.split(',')
		.map(entry => entry.trim())
		.filter(entry => entry.length > 0)
}

function integer(flag: string, value: string, min: number): number {
	const parsed = Number(value)
	if (!Number.isInteger(parsed) || parsed < min) {
		throw new UsageError(`${flag} wants an integer of at least ${min}, not '${value}'`)
	}
	return parsed
}

function nightIdsOf(value: string): DefId[] {
	const ids: DefId[] = []
	for (const token of list(value)) {
		const range = /^(\d+)(?:-(\d+))?$/.exec(token)
		if (range === null) {
			if (!NIGHTS.some(night => night.id === token)) {
				throw new UsageError(`unknown night '${token}'`)
			}
			ids.push(token)
			continue
		}
		const from = Number(range[1])
		const to = range[2] === undefined ? from : Number(range[2])
		for (let index = from; index <= to; index++) {
			const night = NIGHTS.find(candidate => candidate.index === index)
			if (night === undefined) {
				throw new UsageError(`unknown night '${index}' (in '${token}')`)
			}
			ids.push(night.id)
		}
	}
	return [...new Set(ids)]
}

function difficultiesOf(value: string): DifficultyId[] {
	if (value === 'all') {
		return [...DIFFICULTY_LADDER]
	}
	return list(value).map(token => {
		const tier = DIFFICULTY_LADDER.find(candidate => candidate === token)
		if (tier === undefined) {
			throw new UsageError(`unknown difficulty '${token}'`)
		}
		return tier
	})
}

function namesIn(kind: string, value: string, known: Readonly<Record<string, unknown>>): string[] {
	const names = list(value)
	for (const name of names) {
		if (!(name in known)) {
			throw new UsageError(`unknown ${kind} '${name}'; known: ${Object.keys(known).join(', ')}`)
		}
	}
	return names
}

/** Registered names, and `fixed=a|b|c` lists of known towers. Whether a list is legal is each night's to say. */
function loadoutsOf(value: string): string[] {
	const names = list(value)
	for (const name of names) {
		const fixed = parseFixed(name)
		if (fixed === null) {
			namesIn('loadout policy', name, LOADOUT_POLICIES)
			continue
		}
		if (fixed.length === 0) {
			throw new UsageError(`'${name}' names no tower`)
		}
		for (const id of fixed) {
			if (!TOWERS.some(def => def.id === id)) {
				throw new UsageError(`unknown tower '${id}' (in '${name}')`)
			}
		}
	}
	return names
}

function mapIdsOf(value: string): DefId[] {
	if (value === 'all') {
		return MAPS.map(map => map.id)
	}
	const ids = list(value).map(token => {
		if (!MAPS.some(map => map.id === token)) {
			throw new UsageError(`unknown map '${token}'; known: ${MAPS.map(map => map.id).join(', ')}`)
		}
		return token
	})
	return [...new Set(ids)]
}

function installationsOf(value: string): DefId[] {
	if (value === 'all') {
		return INSTALLATIONS.map(def => def.id)
	}
	return list(value).map(token => {
		if (!INSTALLATIONS.some(def => def.id === token)) {
			throw new UsageError(`unknown installation '${token}'`)
		}
		return token
	})
}

function parse(argv: readonly string[]): Options {
	const options: Options = {
		nights: nightIdsOf('1-18'),
		nightsGiven: false,
		endless: null,
		maxWaves: null,
		difficulties: ['normal'],
		runs: 1,
		seed: 1234,
		policies: ['idle'],
		loadouts: ['default'],
		installations: [],
		campaign: false,
		sweeps: null,
		jobs: Math.max(1, availableParallelism() - 1),
		shard: null,
		out: '.balance/results.csv',
		report: false,
		reportOnly: null,
		help: false,
	}

	for (let at = 0; at < argv.length; at++) {
		const flag = argv[at]
		if (flag === '--campaign') {
			options.campaign = true
			continue
		}
		if (flag === '--report') {
			options.report = true
			continue
		}
		if (flag === '--help' || flag === '-h') {
			options.help = true
			continue
		}
		const value = argv[at + 1]
		if (value === undefined || value.startsWith('--')) {
			throw new UsageError(`${flag} wants a value`)
		}
		at++
		switch (flag) {
			case '--nights':
				options.nights = nightIdsOf(value)
				options.nightsGiven = true
				break
			case '--endless':
				options.endless = mapIdsOf(value)
				break
			case '--max-waves':
				options.maxWaves = integer(flag, value, 1)
				break
			case '--difficulty':
				options.difficulties = difficultiesOf(value)
				break
			case '--runs':
				options.runs = integer(flag, value, 1)
				break
			case '--seed':
				options.seed = integer(flag, value, 0)
				break
			case '--policy':
				options.policies = namesIn('policy', value, POLICIES)
				break
			case '--loadout':
				options.loadouts = loadoutsOf(value)
				break
			case '--installations':
				options.installations = installationsOf(value)
				break
			case '--sweep':
				try {
					options.sweeps = parseSweep(value)
				} catch (error) {
					throw new UsageError(error instanceof Error ? error.message : String(error))
				}
				break
			case '--jobs':
				options.jobs = integer(flag, value, 1)
				break
			case '--shard': {
				const shard = parseShard(value)
				if (shard === null) {
					throw new UsageError(`--shard wants i/N with 0 <= i < N, not '${value}'`)
				}
				options.shard = shard
				break
			}
			case '--out':
				options.out = value
				break
			case '--report-only':
				options.reportOnly = value
				break
			default:
				throw new UsageError(`unknown option '${flag}'`)
		}
	}

	if (options.nights.length === 0) {
		throw new UsageError('--nights names no night')
	}
	if (options.endless !== null && (options.nightsGiven || options.campaign)) {
		throw new UsageError('--endless replaces --nights, and has no campaign: it cannot be combined with either')
	}
	if (options.maxWaves !== null && options.endless === null) {
		throw new UsageError('--max-waves caps an endless run: it wants --endless')
	}
	return options
}

function jobsFor(options: Options): Job[] {
	const jobs: Job[] = []
	for (const sweep of options.sweeps ?? [null]) {
		for (const difficulty of options.difficulties) {
			for (const policy of options.policies) {
				for (const loadoutPolicy of options.loadouts) {
					for (let run = 0; run < options.runs; run++) {
						const shared = {
							difficulty,
							seed: options.seed + run,
							policy,
							loadoutPolicy,
							installations: [...options.installations],
							sweep: sweep === null ? null : { ...sweep },
						}
						if (options.endless !== null) {
							for (const mapId of options.endless) {
								jobs.push({
									kind: 'endless',
									nights: [mapId],
									...shared,
									...(options.maxWaves === null ? {} : { maxWaves: options.maxWaves }),
								})
							}
						} else if (options.campaign) {
							jobs.push({ kind: 'campaign', nights: [...options.nights], ...shared })
						} else {
							for (const night of options.nights) {
								jobs.push({ kind: 'night', nights: [night], ...shared })
							}
						}
					}
				}
			}
		}
	}
	return jobs
}

function outcomes(rows: readonly Row[]): string {
	const counts = new Map<string, number>()
	for (const row of rows) {
		counts.set(row.outcome, (counts.get(row.outcome) ?? 0) + 1)
	}
	return [...counts]
		.sort(([a], [b]) => (a < b ? -1 : 1))
		.map(([outcome, count]) => `${count} ${outcome}`)
		.join(', ')
}

/** A shard that failed: it said why on its own stderr, which the parent shares. */
class ShardError extends Error {}

/** What a finished child left on stdout, or a `ShardError`. */
function runChild(
	launch: Launch,
	argv: readonly string[],
	shard: Shard,
	onJob: () => void,
	children: Set<ReturnType<typeof spawn>>,
): Promise<string> {
	return new Promise((resolveChild, reject) => {
		const child = spawn(process.execPath, [launch.launcher, ...argv, '--shard', `${shard.index}/${shard.count}`], {
			stdio: ['ignore', 'pipe', 'inherit'],
		})
		children.add(child)
		let output = ''
		let pending = ''
		child.stdout.setEncoding('utf8')
		child.stdout.on('data', (chunk: string) => {
			output += chunk
			pending += chunk
			const lines = pending.split('\n')
			pending = lines.pop() ?? ''
			for (const line of lines) {
				if (isJobLine(line)) {
					onJob()
				} else if (line.trim().length > 0) {
					process.stderr.write(`[shard ${shard.index}] ${line}\n`)
				}
			}
		})
		child.on('error', error => {
			children.delete(child)
			reject(new ShardError(`shard ${shard.index}/${shard.count} could not start: ${error.message}`))
		})
		child.on('close', (code, signal) => {
			children.delete(child)
			if (code === 0) {
				resolveChild(output)
			} else {
				reject(new ShardError(`shard ${shard.index}/${shard.count} exited with ${code ?? signal}`))
			}
		})
	})
}

/**
 * The jobs over `count` children, each the launcher again with `--shard i/count`. The first child to
 * fail stops the others, and nothing is written: a CSV from some of the shards would look complete.
 */
async function runForked(launch: Launch, argv: readonly string[], jobs: readonly Job[], count: number): Promise<Row[]> {
	const children = new Set<ReturnType<typeof spawn>>()
	let done = 0
	let reported = 0
	function onJob(): void {
		done++
		const tenth = Math.floor((done * 10) / jobs.length)
		if (tenth > reported) {
			reported = tenth
			process.stderr.write(`balance: ${done}/${jobs.length} jobs\n`)
		}
	}

	const running = Array.from({ length: count }, (_, index) =>
		runChild(launch, argv, { index, count }, onJob, children),
	)
	try {
		const outputs = await Promise.all(running)
		return mergeShards(outputs, jobs.length)
	} catch (error) {
		for (const child of children) {
			child.kill()
		}
		await Promise.allSettled(running)
		throw error
	}
}

function writeReport(csvPath: string, csv: string): string {
	const path = join(dirname(csvPath), 'report.html')
	writeFileSync(path, buildReport(fromCsv(csv), basename(csvPath)))
	return path
}

/** A child of `--jobs`: one line per job on stdout, and a failure names its shard and job on stderr. */
function runAsShard(jobs: readonly Job[], shard: Shard): number {
	try {
		runShard(jobs, shard, line => process.stdout.write(line))
		return 0
	} catch (error) {
		process.stderr.write(`balance: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
		return 1
	}
}

/** Returns the process exit code. */
export async function main(argv: readonly string[], launch: Launch): Promise<number> {
	let options: Options
	try {
		options = parse(argv)
	} catch (error) {
		if (error instanceof UsageError) {
			process.stderr.write(`balance: ${error.message}\n\n${HELP}`)
			return 2
		}
		throw error
	}
	if (options.help) {
		process.stdout.write(HELP)
		return 0
	}

	if (options.reportOnly !== null) {
		const csvPath = resolve(options.reportOnly)
		const report = writeReport(csvPath, readFileSync(csvPath, 'utf8'))
		process.stderr.write(`balance: ${report}\n`)
		return 0
	}

	const jobs = jobsFor(options)
	if (options.shard !== null) {
		return runAsShard(jobs, options.shard)
	}

	const started = performance.now()
	const count = Math.min(options.jobs, jobs.length)
	let rows: Row[]
	if (count <= 1) {
		rows = jobs.flatMap(runJob)
	} else {
		try {
			rows = await runForked(launch, argv, jobs, count)
		} catch (error) {
			if (error instanceof ShardError) {
				process.stderr.write(`balance: ${error.message}; no CSV written\n`)
				return 1
			}
			throw error
		}
	}

	const out = resolve(options.out)
	const csv = toCsv(rows)
	mkdirSync(dirname(out), { recursive: true })
	writeFileSync(out, csv)
	const report = options.report ? ` and ${writeReport(out, csv)}` : ''

	const seconds = ((performance.now() - started) / 1000).toFixed(1)
	process.stderr.write(
		`balance: ${rows.length} rows (${outcomes(rows)}) from ${jobs.length} jobs on ${Math.max(1, count)} processes -> ${options.out}${report} in ${seconds}s\n`,
	)
	return 0
}
