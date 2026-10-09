/**
 * `--jobs N` and `--shard i/N`, the half that would run in a page: which jobs a shard takes, the line
 * each job's rows travel as, and the merge. `cli.ts` owns the processes and the pipes.
 *
 * A shard writes **one line per job**, `{"job":<index>,"rows":[...]}`, so the merge can prove every job
 * arrived exactly once. A child that died half-way leaves a gap, and a gap fails the run rather than
 * becoming a CSV that looks complete.
 */

import { runJob } from '@/dev/harness/run.ts'
import type { Job, Row } from '@/dev/harness/types.ts'

/** What starts a job line, and nothing else on a shard's stdout. */
const JOB_LINE_PREFIX = '{"job":'

export interface Shard {
	index: number
	count: number
}

/** `i/N`, with `0 <= i < N`. Null when it isn't one. */
export function parseShard(text: string): Shard | null {
	const match = /^(\d+)\/(\d+)$/.exec(text)
	if (match === null) {
		return null
	}
	const index = Number(match[1])
	const count = Number(match[2])
	return count >= 1 && index < count ? { index, count } : null
}

/** Every job whose index modulo `count` is `index`, with that index. */
export function jobsOfShard(jobs: readonly Job[], shard: Shard): { index: number; job: Job }[] {
	return jobs.map((job, index) => ({ index, job })).filter(({ index }) => index % shard.count === shard.index)
}

/** What a failure names: enough to run the one job again on its own. */
export function describeJob(job: Job): string {
	const sweep = job.sweep === null ? '' : ` ${job.sweep.knob}=${job.sweep.value}`
	return `${job.kind} ${job.nights.join(',')} ${job.difficulty} ${job.policy}/${job.loadoutPolicy} seed ${job.seed}${sweep}`
}

/**
 * Runs a shard's jobs in index order, handing each job's line to `write` as soon as it is done. A job
 * that throws is rethrown naming the shard, the job's index and what the job was.
 */
export function runShard(jobs: readonly Job[], shard: Shard, write: (line: string) => void): void {
	for (const { index, job } of jobsOfShard(jobs, shard)) {
		let rows: Row[]
		try {
			rows = runJob(job)
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error)
			throw new Error(
				`shard ${shard.index}/${shard.count}: job ${index} (${describeJob(job)}) threw: ${reason}`,
				{ cause: error },
			)
		}
		write(`${JSON.stringify({ job: index, rows })}\n`)
	}
}

export function isJobLine(line: string): boolean {
	return line.startsWith(JOB_LINE_PREFIX)
}

/**
 * Every shard's output, as one list of rows -- in no particular order: `toCsv` sorts. Throws when a job
 * is missing or arrived twice, naming them, so a partial run never reaches the disk.
 */
export function mergeShards(outputs: readonly string[], jobCount: number): Row[] {
	const byJob = new Map<number, Row[]>()
	const repeated: number[] = []
	for (const output of outputs) {
		for (const line of output.split('\n')) {
			if (!isJobLine(line)) {
				continue
			}
			const { job, rows } = JSON.parse(line) as { job: number; rows: Row[] }
			if (byJob.has(job)) {
				repeated.push(job)
			}
			byJob.set(job, rows)
		}
	}

	const missing: number[] = []
	for (let index = 0; index < jobCount; index++) {
		if (!byJob.has(index)) {
			missing.push(index)
		}
	}
	if (missing.length > 0 || repeated.length > 0 || byJob.size !== jobCount) {
		throw new Error(
			`the shards' output is not the ${jobCount} jobs once each: missing [${missing.join(', ')}], ` +
				`repeated [${repeated.join(', ')}], ${byJob.size} distinct`,
		)
	}
	return [...byJob.values()].flat()
}
