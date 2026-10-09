/**
 * `npm run balance`: arguments to jobs, jobs to rows, rows to a CSV on disk. Loaded by
 * `scripts/balance.mjs` through Vite, so content is validated at boot exactly as under `npm run dev`.
 *
 * **The only file in `dev/harness/` that may import a `node:` module.** Everything it calls would run
 * in a page; this is where the disk and the clock are.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DIFFICULTY_LADDER } from '@/core/campaign.ts'
import { INSTALLATIONS, NIGHTS, TOWERS } from '@/core/content/index.ts'
import { toCsv } from '@/dev/harness/csv.ts'
import { parseFixed } from '@/dev/harness/loadouts.ts'
import { runJob } from '@/dev/harness/run.ts'
import { LOADOUT_POLICIES, POLICIES } from '@/dev/harness/types.ts'
import type { DefId, DifficultyId } from '@/core/types.ts'
import type { Job, Row } from '@/dev/harness/types.ts'

const HELP = `npm run balance -- [options]

  --nights 1-18          night indices or ids, comma-separated, ranges allowed (default 1-18)
  --difficulty normal    cozy, normal, nightmare, comma-separated, or all (default normal)
  --runs 1               runs per night (campaign mode: per campaign); run i plays seed + i
  --seed 1234            the first seed. 1234 is the game's own, so run 0 is the night a player gets
  --policy idle          who plays: ${Object.keys(POLICIES).join(', ')}
  --loadout default      what they bring: ${Object.keys(LOADOUT_POLICIES).join(', ')}, or
                         fixed=saltShaker|lemon|cookieJar for exactly that list every night
  --installations a,b    owned from the start
  --campaign             play night 1 through the last of --nights in order, paying Grocery Money and
                         buying installations between nights, retrying losses on the same seed
  --out .balance/results.csv

Night mode (the default) plays each night from a fresh progress, so it stores no "last night": there
'default' brings the oldest towers unlocked. In campaign mode 'default' brings last night's plus
tonight's unlock. Don't compare 'default' rows across the two modes.
`

/** A mistake in the arguments: printed as a message, not a stack. */
class UsageError extends Error {}

interface Options {
	nights: DefId[]
	difficulties: DifficultyId[]
	runs: number
	seed: number
	policies: string[]
	loadouts: string[]
	installations: DefId[]
	campaign: boolean
	out: string
	help: boolean
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

function installationsOf(value: string): DefId[] {
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
		difficulties: ['normal'],
		runs: 1,
		seed: 1234,
		policies: ['idle'],
		loadouts: ['default'],
		installations: [],
		campaign: false,
		out: '.balance/results.csv',
		help: false,
	}

	for (let at = 0; at < argv.length; at++) {
		const flag = argv[at]
		if (flag === '--campaign') {
			options.campaign = true
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
			case '--out':
				options.out = value
				break
			default:
				throw new UsageError(`unknown option '${flag}'`)
		}
	}

	if (options.nights.length === 0) {
		throw new UsageError('--nights names no night')
	}
	return options
}

function jobsFor(options: Options): Job[] {
	const jobs: Job[] = []
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
						sweep: null,
					}
					if (options.campaign) {
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

/** Returns the process exit code. */
export function main(argv: readonly string[]): number {
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

	const started = performance.now()
	const jobs = jobsFor(options)
	const rows = jobs.flatMap(runJob)

	const out = resolve(options.out)
	mkdirSync(dirname(out), { recursive: true })
	writeFileSync(out, toCsv(rows))

	const seconds = ((performance.now() - started) / 1000).toFixed(1)
	process.stderr.write(
		`balance: ${rows.length} rows (${outcomes(rows)}) from ${jobs.length} jobs -> ${options.out} in ${seconds}s\n`,
	)
	return 0
}
