/**
 * Rows to `report.html`: the flag list, the income curve against its target, and win rates per night
 * and policy. One static file with no dependency and no script, read in a browser and never committed.
 *
 * Built from the CSV read back (`fromCsv`), never the rows in memory, so `--report` and
 * `--report-only` give the same page for the same CSV. Nothing here knows what time it is.
 */

import { DIFFICULTY_LADDER } from '@/core/campaign.ts'
import { MAPS } from '@/core/content/index.ts'
import { FIXED_PREFIX } from '@/dev/harness/loadouts.ts'
import { LOADOUT_POLICIES, POLICIES } from '@/dev/harness/types.ts'
import type { Row } from '@/dev/harness/types.ts'

// --- the flag rules ------------------------------------------------------------------------------------

/**
 * `greedy` loses a night in more than this share of its runs. It buys the best damage per crumb it can
 * afford and sweeps every pile, so a night it loses that often is lost by a player who knows the matrix.
 */
export const TOO_HARD_LOSS_RATE = 0.1

/** `casual` keeps at least this share of the shelf... */
export const TOO_EASY_FOOD_KEPT = 0.75
/**
 * ...in at least this share of its runs. `casual` buys late and sweeps little, so a night it wins that
 * cleanly that often asks nothing of anyone.
 */
export const TOO_EASY_WIN_RATE = 0.9
/** Cozy is meant to be won by anyone, so too easy is only a flag on the tiers above it. */
export const TOO_EASY_DIFFICULTIES: readonly string[] = ['normal', 'nightmare']

/** One source does more than this share of a run's damage... */
export const DOMINANT_SHARE = 0.6
/** ...in at least this share of a night's runs: then the rest of the roster is decoration there. */
export const DOMINANT_RUN_RATE = 0.5

/**
 * DECISIONS.md section 10: every night winnable by more than one loadout. Read under the policy that
 * plays best, so a loss is the loadout's and not the hands'. Only judged where all three were run.
 */
export const LOCKOUT_POLICY = 'greedy'
export const LOCKOUT_LOADOUTS: readonly string[] = ['optimal', 'blind', 'default']

export type FlagKind = 'tooHard' | 'tooEasy' | 'dominant' | 'lockout' | 'stalled'

const FLAG_KINDS: readonly FlagKind[] = ['tooHard', 'tooEasy', 'dominant', 'lockout', 'stalled']

/** A row as a flag names it: what `npm run balance` needs to play it again. */
export interface RunRef {
	policy: string
	loadoutPolicy: string
	seed: number
}

export interface Flag {
	kind: FlagKind
	mode: Row['mode']
	sweepKnob: string | null
	sweepValue: number | null
	difficulty: Row['difficulty']
	night: string
	nightIndex: number
	/** Null when the flag is about the night across every policy. */
	policy: string | null
	loadoutPolicy: string | null
	/** The numbers behind it, as a sentence. */
	numbers: string
	/** The rows that tripped it, to replay. */
	runs: RunRef[]
}

/** Everything that makes two rows the same night of the same experiment. */
function nightKey(row: Row): string {
	return JSON.stringify([row.mode, row.sweepKnob, row.sweepValue, row.difficulty, row.night])
}

function groupBy(rows: readonly Row[], key: (row: Row) => string): Row[][] {
	const groups = new Map<string, Row[]>()
	for (const row of rows) {
		const name = key(row)
		const group = groups.get(name)
		if (group === undefined) {
			groups.set(name, [row])
		} else {
			group.push(row)
		}
	}
	return [...groups.values()]
}

function isLoss(row: Row): boolean {
	return row.outcome === 'lost' || row.outcome === 'stuck'
}

function runsOf(rows: readonly Row[]): RunRef[] {
	return rows.map(row => ({ policy: row.policy, loadoutPolicy: row.loadoutPolicy, seed: row.seed }))
}

function percent(share: number): string {
	return `${Math.round(share * 100)}%`
}

function flagOf(
	kind: FlagKind,
	sample: Row,
	who: { policy: string | null; loadoutPolicy: string | null },
	numbers: string,
	rows: readonly Row[],
): Flag {
	return {
		kind,
		mode: sample.mode,
		sweepKnob: sample.sweepKnob,
		sweepValue: sample.sweepValue,
		difficulty: sample.difficulty,
		night: sample.night,
		nightIndex: sample.nightIndex,
		...who,
		numbers,
		runs: runsOf(rows),
	}
}

function tooHard(rows: readonly Row[]): Flag[] {
	const flags: Flag[] = []
	// Not endless: a run with no end is lost by every player, so a loss there says nothing.
	const greedy = rows.filter(row => row.policy === LOCKOUT_POLICY && row.mode !== 'endless')
	for (const group of groupBy(greedy, row => nightKey(row) + row.loadoutPolicy)) {
		const [sample] = group
		const losses = group.filter(isLoss)
		if (sample !== undefined && losses.length / group.length > TOO_HARD_LOSS_RATE) {
			const numbers = `lost ${losses.length} of ${group.length} runs (${percent(losses.length / group.length)})`
			flags.push(flagOf('tooHard', sample, sample, numbers, losses))
		}
	}
	return flags
}

function tooEasy(rows: readonly Row[]): Flag[] {
	const flags: Flag[] = []
	const casual = rows.filter(row => row.policy === 'casual' && TOO_EASY_DIFFICULTIES.includes(row.difficulty))
	for (const group of groupBy(casual, row => nightKey(row) + row.loadoutPolicy)) {
		const [sample] = group
		const easy = group.filter(
			row =>
				row.outcome === 'won' && row.foodStart > 0 && row.foodRemaining / row.foodStart >= TOO_EASY_FOOD_KEPT,
		)
		if (sample !== undefined && easy.length / group.length >= TOO_EASY_WIN_RATE) {
			const numbers = `won with ${percent(TOO_EASY_FOOD_KEPT)}+ of the shelf in ${easy.length} of ${group.length} runs (${percent(easy.length / group.length)})`
			flags.push(flagOf('tooEasy', sample, sample, numbers, easy))
		}
	}
	return flags
}

/** Across every policy, over the runs that damaged anything at all: an idle run has no top source. */
function dominant(rows: readonly Row[]): Flag[] {
	const flags: Flag[] = []
	const damaged = rows.filter(row => row.topDamageSource !== null)
	for (const group of groupBy(damaged, nightKey)) {
		const [sample] = group
		for (const source of [...new Set(group.map(row => row.topDamageSource))].sort()) {
			const over = group.filter(
				row =>
					row.topDamageSource === source &&
					row.topDamageShare !== null &&
					row.topDamageShare > DOMINANT_SHARE,
			)
			if (sample !== undefined && over.length / group.length >= DOMINANT_RUN_RATE) {
				const numbers = `${source ?? ''} did over ${percent(DOMINANT_SHARE)} of the damage in ${over.length} of ${group.length} runs (${percent(over.length / group.length)})`
				flags.push(flagOf('dominant', sample, { policy: null, loadoutPolicy: null }, numbers, over))
			}
		}
	}
	return flags
}

function lockout(rows: readonly Row[]): Flag[] {
	const flags: Flag[] = []
	const greedy = rows.filter(row => row.policy === LOCKOUT_POLICY && LOCKOUT_LOADOUTS.includes(row.loadoutPolicy))
	for (const group of groupBy(greedy, nightKey)) {
		const [sample] = group
		const played = new Set(group.map(row => row.loadoutPolicy))
		if (sample === undefined || !LOCKOUT_LOADOUTS.every(name => played.has(name))) {
			continue
		}
		const wins = group.filter(row => row.outcome === 'won')
		const winners = [...new Set(wins.map(row => row.loadoutPolicy))]
		const [winner] = winners
		if (winners.length === 1 && winner !== undefined) {
			const tally = LOCKOUT_LOADOUTS.map(name => {
				const of = group.filter(row => row.loadoutPolicy === name)
				return `${name} ${of.filter(row => row.outcome === 'won').length}/${of.length}`
			})
			const numbers = `only ${winner} ever won (wins: ${tally.join(', ')})`
			flags.push(flagOf('lockout', sample, { policy: LOCKOUT_POLICY, loadoutPolicy: winner }, numbers, wins))
		}
	}
	return flags
}

function stalled(rows: readonly Row[]): Flag[] {
	const flags: Flag[] = []
	for (const group of groupBy(rows, row => nightKey(row) + JSON.stringify([row.policy, row.loadoutPolicy]))) {
		const [sample] = group
		const bad = group.filter(row => row.outcome === 'stalled' || row.outcome === 'stuck')
		if (sample !== undefined && bad.length > 0) {
			const stuck = bad.filter(row => row.outcome === 'stuck').length
			const numbers = `${bad.length - stuck} stalled and ${stuck} stuck of ${group.length} runs`
			flags.push(flagOf('stalled', sample, sample, numbers, bad))
		}
	}
	return flags
}

function compareText(a: string | null, b: string | null): number {
	const left = a ?? ''
	const right = b ?? ''
	return left < right ? -1 : left > right ? 1 : 0
}

/** Kind, then the CSV's own order: sweep value, difficulty, night, policy, loadout. */
function compareFlags(a: Flag, b: Flag): number {
	return (
		FLAG_KINDS.indexOf(a.kind) - FLAG_KINDS.indexOf(b.kind) ||
		compareText(a.mode, b.mode) ||
		(a.sweepValue ?? -Infinity) - (b.sweepValue ?? -Infinity) ||
		DIFFICULTY_LADDER.indexOf(a.difficulty) - DIFFICULTY_LADDER.indexOf(b.difficulty) ||
		a.nightIndex - b.nightIndex ||
		compareText(a.policy, b.policy) ||
		compareText(a.loadoutPolicy, b.loadoutPolicy) ||
		compareText(a.numbers, b.numbers)
	)
}

/** Every flag the rows raise, in a fixed order. */
export function flagsOf(rows: readonly Row[]): Flag[] {
	return [...tooHard(rows), ...tooEasy(rows), ...dominant(rows), ...lockout(rows), ...stalled(rows)].sort(
		compareFlags,
	)
}

// --- the income target ---------------------------------------------------------------------------------

/** CONTENT.md's preamble: ~1.5 towers affordable a wave through Act I... */
const TARGET_ACT_ONE = 1.5
const ACT_ONE_LAST_NIGHT = 8
/** ...falling to ~0.5 by the last night of Act II. */
const TARGET_LAST = 0.5
const LAST_NIGHT = 18
/** "~" in the doc, drawn as this either side. */
const TARGET_BAND = 0.25

export function incomeTarget(nightIndex: number): number {
	if (nightIndex <= ACT_ONE_LAST_NIGHT) {
		return TARGET_ACT_ONE
	}
	const fall = (nightIndex - ACT_ONE_LAST_NIGHT) / (LAST_NIGHT - ACT_ONE_LAST_NIGHT)
	return TARGET_ACT_ONE + (TARGET_LAST - TARGET_ACT_ONE) * Math.min(1, fall)
}

// --- html ----------------------------------------------------------------------------------------------

function esc(text: string | number): string {
	return String(text)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
}

function mean(values: readonly number[]): number | null {
	return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length
}

function distinct<T>(values: readonly T[]): T[] {
	return [...new Set(values)]
}

const POLICY_ORDER = Object.keys(POLICIES)
const LOADOUT_ORDER = Object.keys(LOADOUT_POLICIES)

function orderOf(order: readonly string[], name: string): number {
	const at = order.indexOf(name)
	return at === -1 ? order.length : at
}

function comparePlayers(a: RunRef, b: RunRef): number {
	return (
		orderOf(POLICY_ORDER, a.policy) - orderOf(POLICY_ORDER, b.policy) ||
		compareText(a.policy, b.policy) ||
		orderOf(LOADOUT_ORDER, a.loadoutPolicy) - orderOf(LOADOUT_ORDER, b.loadoutPolicy) ||
		compareText(a.loadoutPolicy, b.loadoutPolicy)
	)
}

function isFixed(loadoutPolicy: string): boolean {
	return loadoutPolicy.startsWith(FIXED_PREFIX)
}

function loadoutLabel(loadoutPolicy: string): string {
	return isFixed(loadoutPolicy) ? loadoutPolicy.slice(FIXED_PREFIX.length).split('|').join(' · ') : loadoutPolicy
}

function sweepLabel(row: { sweepKnob: string | null; sweepValue: number | null }): string {
	return row.sweepKnob === null || row.sweepValue === null ? '' : `${row.sweepKnob} ${row.sweepValue}`
}

function nightLabel(row: { night: string; nightIndex: number }): string {
	return `${row.nightIndex} <span class="muted">${esc(row.night)}</span>`
}

/** `greedy/default: 1234, 1240; casual/blind: 1234` -- the seeds, by who played them. */
function runsLabel(runs: readonly RunRef[]): string {
	const players = groupRuns(runs)
	return players
		.map(({ player, seeds }) => {
			const who = `${player.policy}/${loadoutLabel(player.loadoutPolicy)}`
			return `<span class="who">${esc(who)}</span> ${esc(seeds.join(', '))}`
		})
		.join('; ')
}

function groupRuns(runs: readonly RunRef[]): { player: RunRef; seeds: number[] }[] {
	const byPlayer = new Map<string, { player: RunRef; seeds: Set<number> }>()
	for (const run of runs) {
		const key = JSON.stringify([run.policy, run.loadoutPolicy])
		const entry = byPlayer.get(key) ?? { player: run, seeds: new Set<number>() }
		entry.seeds.add(run.seed)
		byPlayer.set(key, entry)
	}
	return [...byPlayer.values()]
		.sort((a, b) => comparePlayers(a.player, b.player))
		.map(({ player, seeds }) => ({ player, seeds: [...seeds].sort((a, b) => a - b) }))
}

const FLAG_TITLES: Record<FlagKind, string> = {
	tooHard: 'Too hard',
	tooEasy: 'Too easy',
	dominant: 'Dominant source',
	lockout: 'Lockout',
	stalled: 'Stalled or stuck',
}

const FLAG_RULES: Record<FlagKind, string> = {
	tooHard: `${LOCKOUT_POLICY} loses in more than ${percent(TOO_HARD_LOSS_RATE)} of its runs. Never read on endless, which is lost by design.`,
	tooEasy: `casual wins with at least ${percent(TOO_EASY_FOOD_KEPT)} of the shelf left in at least ${percent(TOO_EASY_WIN_RATE)} of its runs, on ${TOO_EASY_DIFFICULTIES.join(' or ')}.`,
	dominant: `one source does over ${percent(DOMINANT_SHARE)} of the damage in at least ${percent(DOMINANT_RUN_RATE)} of the night's runs that damaged anything, every policy together.`,
	lockout: `under ${LOCKOUT_POLICY}, exactly one of ${LOCKOUT_LOADOUTS.join(', ')} ever wins. Judged only where all three were run.`,
	stalled: 'any row at all.',
}

function flagsSection(flags: readonly Flag[]): string {
	const parts = [`<h2 id="flags">Flags <span class="count">${flags.length}</span></h2>`]
	for (const kind of FLAG_KINDS) {
		const ofKind = flags.filter(flag => flag.kind === kind)
		parts.push(
			`<h3>${FLAG_TITLES[kind]} <span class="count">${ofKind.length}</span></h3>`,
			`<p class="rule">${esc(FLAG_RULES[kind])}</p>`,
		)
		if (ofKind.length === 0) {
			parts.push('<p class="muted">None.</p>')
			continue
		}
		parts.push('<ul class="flags">')
		for (const flag of ofKind) {
			const where = [
				flag.mode === 'night' ? '' : flag.mode,
				flag.difficulty,
				sweepLabel(flag),
				flag.policy === null ? 'every policy' : `${flag.policy}/${loadoutLabel(flag.loadoutPolicy ?? '')}`,
			]
				.filter(part => part.length > 0)
				.map(esc)
				.join(' · ')
			parts.push(
				`<li><b>Night ${nightLabel(flag)}</b> <span class="where">${where}</span><br>${esc(flag.numbers)}` +
					`<div class="seeds">seeds: ${runsLabel(flag.runs)}</div></li>`,
			)
		}
		parts.push('</ul>')
	}
	return parts.join('\n')
}

// --- the income curve ----------------------------------------------------------------------------------

interface Series {
	name: string
	/** A CSS custom property holding its colour, light and dark. */
	color: string
	/** Mean `towersAffordablePerWave` by night index, and the rows behind it. */
	points: { night: number; value: number; runs: number }[]
}

const CATEGORICAL_SLOTS = 8

function policyColor(policy: string): string {
	const at = orderOf(POLICY_ORDER, policy)
	return at < CATEGORICAL_SLOTS ? `var(--series-${at + 1})` : 'var(--text-muted)'
}

/** Ordinal steps of the one sequential hue, from the step nearest the surface outwards. */
const SEQUENTIAL_STEPS = 10

function sequentialColor(index: number, count: number): string {
	const step = count <= 1 ? SEQUENTIAL_STEPS - 1 : Math.round((index * (SEQUENTIAL_STEPS - 1)) / (count - 1))
	return `var(--seq-${step})`
}

function seriesOf(name: string, color: string, rows: readonly Row[]): Series {
	const points: Series['points'] = []
	for (const group of groupBy(rows, row => String(row.nightIndex))) {
		const values = group.map(row => row.towersAffordablePerWave).filter((value): value is number => value !== null)
		const value = mean(values)
		const [sample] = group
		if (value !== null && sample !== undefined) {
			points.push({ night: sample.nightIndex, value, runs: values.length })
		}
	}
	return { name, color, points: points.sort((a, b) => a.night - b.night) }
}

const CHART = { width: 760, height: 300, left: 44, right: 132, top: 14, bottom: 34 }
/** Direct labels closer than this are pushed apart. */
const LABEL_GAP = 13
/** Up to this many series are named at their line's end as well as in the legend. */
const DIRECT_LABELS_MAX = 4
/** About this many gridlines, whatever the peak: one policy can earn twenty times another. */
const GRIDLINES = 5
/**
 * The axis stops here, twice the band's top: a policy hoarding forty towers' worth a wave would
 * otherwise flatten every other line onto the band. Points above it are pinned to the edge as ▲.
 */
const CEILING = 4

/** The smallest 1, 2, 2.5 or 5 times a power of ten that is at least `raw`. */
function niceStep(raw: number): number {
	const magnitude = 10 ** Math.floor(Math.log10(raw))
	return ([1, 2, 2.5, 5, 10].find(nice => nice * magnitude >= raw) ?? 10) * magnitude
}

/** `id` names the chart's clip path, unique within the page. */
function lineChart(id: string, title: string, series: readonly Series[]): string {
	const nights = series.flatMap(line => line.points.map(point => point.night))
	if (nights.length === 0) {
		return `<p class="muted">${esc(title)}: no wave was started, so there is no curve.</p>`
	}
	const first = Math.min(...nights)
	const last = Math.max(...nights, first + 1)
	const highest = Math.max(...series.flatMap(line => line.points.map(point => point.value)))
	const peak = Math.min(CEILING, Math.max(2, highest))
	const step = niceStep(peak / GRIDLINES)
	const top = Math.ceil(peak / step - 1e-9) * step
	// As many as the step has: 2.5 is 1, 0.25 is 2, 20 is 0.
	let decimals = 0
	while (decimals < 4 && Math.abs(step * 10 ** decimals - Math.round(step * 10 ** decimals)) > 1e-9) {
		decimals++
	}

	const plotWidth = CHART.width - CHART.left - CHART.right
	const plotHeight = CHART.height - CHART.top - CHART.bottom
	function x(night: number): number {
		return CHART.left + ((night - first) / (last - first)) * plotWidth
	}
	function y(value: number): number {
		return CHART.top + (1 - value / top) * plotHeight
	}
	function at(night: number, value: number): string {
		return `${x(night).toFixed(1)},${y(value).toFixed(1)}`
	}

	const parts: string[] = []
	for (let index = 0; index * step <= top + 1e-9; index++) {
		const value = index * step
		parts.push(
			`<line class="grid" x1="${CHART.left}" x2="${CHART.left + plotWidth}" y1="${y(value).toFixed(1)}" y2="${y(value).toFixed(1)}"/>`,
			`<text class="tick" x="${CHART.left - 6}" y="${(y(value) + 4).toFixed(1)}" text-anchor="end">${value.toFixed(decimals)}</text>`,
		)
	}
	for (let night = first; night <= last; night++) {
		parts.push(
			`<text class="tick" x="${x(night).toFixed(1)}" y="${CHART.top + plotHeight + 16}" text-anchor="middle">${night}</text>`,
		)
	}
	parts.push(
		`<text class="tick" x="${CHART.left + plotWidth / 2}" y="${CHART.height - 2}" text-anchor="middle">night</text>`,
		`<clipPath id="${id}"><rect x="${CHART.left}" y="${CHART.top}" width="${plotWidth}" height="${plotHeight}"/></clipPath>`,
	)

	const span = Array.from({ length: last - first + 1 }, (_, index) => first + index)
	const upper = span.map(night => at(night, Math.min(top, incomeTarget(night) + TARGET_BAND)))
	const lower = span.map(night => at(night, Math.max(0, incomeTarget(night) - TARGET_BAND))).reverse()
	parts.push(
		`<polygon class="band" points="${[...upper, ...lower].join(' ')}"><title>target: ~1.5 through Act I, ~0.5 by night 18</title></polygon>`,
		`<polyline class="target" points="${span.map(night => at(night, incomeTarget(night))).join(' ')}"/>`,
	)

	const ends: { name: string; y: number }[] = []
	for (const line of series) {
		let path = ''
		let previous: number | null = null
		for (const point of line.points) {
			path += `${previous !== null && point.night === previous + 1 ? 'L' : 'M'}${at(point.night, point.value)}`
			previous = point.night
		}
		parts.push(`<path class="line" d="${path}" style="stroke:${line.color}" clip-path="url(#${id})"/>`)
		for (const point of line.points) {
			const tip = `<title>${esc(line.name)}, night ${point.night}: ${point.value.toFixed(2)} (${point.runs} runs)</title>`
			const cx = x(point.night).toFixed(1)
			parts.push(
				point.value > top
					? `<path class="dot" d="M${cx},${CHART.top - 2}l5,9h-10z" style="fill:${line.color}">${tip}</path>`
					: `<circle class="dot" cx="${cx}" cy="${y(point.value).toFixed(1)}" r="4" style="fill:${line.color}">${tip}</circle>`,
			)
		}
		const end = line.points[line.points.length - 1]
		if (end !== undefined) {
			ends.push({ name: line.name, y: y(Math.min(top, end.value)) })
		}
	}

	if (series.length <= DIRECT_LABELS_MAX) {
		ends.sort((a, b) => a.y - b.y)
		for (let index = 1; index < ends.length; index++) {
			const above = ends[index - 1]
			const here = ends[index]
			if (above !== undefined && here !== undefined && here.y - above.y < LABEL_GAP) {
				here.y = above.y + LABEL_GAP
			}
		}
		for (const end of ends) {
			parts.push(
				`<text class="label" x="${CHART.left + plotWidth + 8}" y="${(end.y + 4).toFixed(1)}">${esc(end.name)}</text>`,
			)
		}
	}

	const legend =
		series.length < 2
			? ''
			: `<ul class="legend">${series
					.map(
						line =>
							`<li><span class="swatch" style="background:${line.color}"></span>${esc(line.name)}</li>`,
					)
					.join('')}<li><span class="swatch band"></span>target band</li></ul>`

	const table = `<details><summary>Values</summary><table><thead><tr><th>night</th>${series
		.map(line => `<th>${esc(line.name)}</th>`)
		.join('')}<th>target</th></tr></thead><tbody>${span
		.map(
			night =>
				`<tr><td>${night}</td>${series
					.map(line => {
						const point = line.points.find(entry => entry.night === night)
						return `<td>${point === undefined ? '' : point.value.toFixed(2)}</td>`
					})
					.join('')}<td>${incomeTarget(night).toFixed(2)}</td></tr>`,
		)
		.join('')}</tbody></table></details>`

	const pinned =
		highest > top
			? `<p class="muted">Above ${top.toFixed(decimals)} is pinned to the top edge as ▲, up to ${highest.toFixed(1)}: see Values.</p>`
			: ''

	return (
		`<figure><figcaption>${esc(title)}</figcaption>${legend}` +
		`<svg viewBox="0 0 ${CHART.width} ${CHART.height}" role="img" aria-label="${esc(title)}">${parts.join('')}</svg>` +
		`${pinned}${table}</figure>`
	)
}

function sortedDifficulties(rows: readonly Row[]): Row['difficulty'][] {
	return distinct(rows.map(row => row.difficulty)).sort(
		(a, b) => DIFFICULTY_LADDER.indexOf(a) - DIFFICULTY_LADDER.indexOf(b),
	)
}

function sortedPolicies(rows: readonly Row[]): string[] {
	return distinct(rows.map(row => row.policy)).sort(
		(a, b) => orderOf(POLICY_ORDER, a) - orderOf(POLICY_ORDER, b) || compareText(a, b),
	)
}

function sortedSweepValues(rows: readonly Row[]): (number | null)[] {
	return distinct(rows.map(row => row.sweepValue)).sort((a, b) => (a ?? -Infinity) - (b ?? -Infinity))
}

const MODES: readonly Row['mode'][] = ['night', 'campaign']

function modeLabel(mode: Row['mode']): string {
	return mode === 'night' ? 'Night mode' : 'Campaign'
}

/**
 * Unswept: one chart per mode and tier, a line per policy. Swept: one per mode, tier and policy, a line
 * per value, so the line that sits in the band is the answer. Every loadout policy is averaged in.
 */
function curveSection(rows: readonly Row[]): string {
	const parts = [
		'<h2 id="curve">Income curve</h2>',
		'<p class="rule">Crumbs earned per wave started, over the mean price of the unlocked roster: <code>towersAffordablePerWave</code>, averaged over every loadout policy. The band is CONTENT.md\'s target.</p>',
	]
	const swept = rows.some(row => row.sweepKnob !== null)
	let charts = 0
	for (const mode of MODES) {
		const ofMode = rows.filter(row => row.mode === mode)
		for (const difficulty of sortedDifficulties(ofMode)) {
			const ofTier = ofMode.filter(row => row.difficulty === difficulty)
			if (!swept) {
				const series = sortedPolicies(ofTier).map(policy =>
					seriesOf(
						policy,
						policyColor(policy),
						ofTier.filter(row => row.policy === policy),
					),
				)
				parts.push(lineChart(`curve-${charts++}`, `${modeLabel(mode)} · ${difficulty}`, series))
				continue
			}
			const values = sortedSweepValues(ofTier)
			for (const policy of sortedPolicies(ofTier)) {
				const ofPolicy = ofTier.filter(row => row.policy === policy)
				const knob = ofTier.find(row => row.sweepKnob !== null)?.sweepKnob ?? ''
				const series = values.map((value, index) =>
					seriesOf(
						value === null ? 'unswept' : `${knob} ${value}`,
						sequentialColor(index, values.length),
						ofPolicy.filter(row => row.sweepValue === value),
					),
				)
				parts.push(lineChart(`curve-${charts++}`, `${modeLabel(mode)} · ${difficulty} · ${policy}`, series))
			}
		}
	}
	return parts.join('\n')
}

// --- the tables ----------------------------------------------------------------------------------------

function players(rows: readonly Row[]): RunRef[] {
	return groupRuns(runsOf(rows)).map(entry => entry.player)
}

function ofPlayer(rows: readonly Row[], player: RunRef): Row[] {
	return rows.filter(row => row.policy === player.policy && row.loadoutPolicy === player.loadoutPolicy)
}

/** Win rate, tinted by it, with the mean share of the shelf kept and the run count under it. */
function winCell(rows: readonly Row[]): string {
	if (rows.length === 0) {
		return '<td></td>'
	}
	const wins = rows.filter(row => row.outcome === 'won').length / rows.length
	const kept = mean(rows.map(row => (row.foodStart > 0 ? row.foodRemaining / row.foodStart : 0))) ?? 0
	return (
		`<td class="win" style="--p:${Math.round(wins * 100)}%">` +
		`<b>${percent(wins)}</b><span class="sub">${percent(kept)} kept · ${rows.length}</span></td>`
	)
}

function playerHeader(player: RunRef): string {
	return `<th>${esc(player.policy)}<span class="sub">${esc(loadoutLabel(player.loadoutPolicy))}</span></th>`
}

function nightTable(rows: readonly Row[], columns: readonly RunRef[]): string {
	const nights = groupBy(
		[...rows].sort((a, b) => a.nightIndex - b.nightIndex),
		row => row.night,
	)
	const body = nights
		.map(group => {
			const [sample] = group
			return sample === undefined
				? ''
				: `<tr><th class="night">${nightLabel(sample)}</th>${columns.map(player => winCell(ofPlayer(group, player))).join('')}</tr>`
		})
		.join('')
	return `<table class="wins"><thead><tr><th>night</th>${columns.map(playerHeader).join('')}</tr></thead><tbody>${body}</tbody></table>`
}

function winSection(rows: readonly Row[]): string {
	const parts = [
		'<h2 id="wins">Win rates</h2>',
		'<p class="rule">Each cell: share of runs won, then the mean share of the shelf kept and the number of runs.</p>',
	]
	let open = true
	for (const mode of MODES) {
		const ofMode = rows.filter(row => row.mode === mode)
		for (const value of sortedSweepValues(ofMode)) {
			const ofValue = ofMode.filter(row => row.sweepValue === value)
			for (const difficulty of sortedDifficulties(ofValue)) {
				const ofTier = ofValue.filter(row => row.difficulty === difficulty)
				const [sample] = ofTier
				const title = [modeLabel(mode), difficulty, sample === undefined ? '' : sweepLabel(sample)]
					.filter(part => part.length > 0)
					.join(' · ')
				const named = players(ofTier.filter(row => !isFixed(row.loadoutPolicy)))
				const fixed = players(ofTier.filter(row => isFixed(row.loadoutPolicy)))
				parts.push(`<details${open ? ' open' : ''}><summary>${esc(title)}</summary>`)
				if (named.length > 0) {
					parts.push(nightTable(ofTier, named))
				}
				if (fixed.length > 0) {
					parts.push('<h4>Fixed lists</h4>', nightTable(ofTier, fixed))
				}
				parts.push('</details>')
				open = false
			}
		}
	}
	return parts.join('\n')
}

/** Swept only: every night together, a row per value, so the knob's effect reads down a column. */
function sweepSection(rows: readonly Row[]): string {
	const knob = rows.find(row => row.sweepKnob !== null)?.sweepKnob ?? null
	if (knob === null) {
		return ''
	}
	const parts = [
		`<h2 id="sweep">Sweep: ${esc(knob)}</h2>`,
		'<p class="rule">Every night together. Each cell: share of runs won, then the mean share of the shelf kept and the number of runs.</p>',
	]
	for (const mode of MODES) {
		const ofMode = rows.filter(row => row.mode === mode)
		for (const difficulty of sortedDifficulties(ofMode)) {
			const ofTier = ofMode.filter(row => row.difficulty === difficulty)
			const columns = players(ofTier)
			const body = sortedSweepValues(ofTier)
				.map(value => {
					const ofValue = ofTier.filter(row => row.sweepValue === value)
					return `<tr><th>${value === null ? 'unswept' : esc(value)}</th>${columns.map(player => winCell(ofPlayer(ofValue, player))).join('')}</tr>`
				})
				.join('')
			parts.push(
				`<h3>${esc(modeLabel(mode))} · ${esc(difficulty)}</h3>`,
				`<table class="wins"><thead><tr><th>${esc(knob)}</th>${columns.map(playerHeader).join('')}</tr></thead><tbody>${body}</tbody></table>`,
			)
		}
	}
	return parts.join('\n')
}

// --- the endless tables --------------------------------------------------------------------------------

/** The `fraction` quantile of an ascending list, interpolating between the two nearest. */
function quantile(sorted: readonly number[], fraction: number): number {
	const at = (sorted.length - 1) * fraction
	const below = Math.floor(at)
	const low = sorted[below] ?? 0
	const high = sorted[Math.ceil(at)] ?? low
	return low + (high - low) * (at - below)
}

function waves(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/**
 * The waves survived, as the game scores them: the median, then the middle half and the extremes. A run
 * that cleared every generated wave is counted apart, because that is the finding, and one that stalled
 * has no score.
 */
function scoreCell(rows: readonly Row[]): string {
	if (rows.length === 0) {
		return '<td></td>'
	}
	const scores = rows
		.map(row => row.score)
		.filter((score): score is number => score !== null)
		.sort((a, b) => a - b)
	const cleared = rows.filter(row => row.outcome === 'won').length
	const stalledRuns = rows.filter(row => row.outcome === 'stalled').length
	const notes = [`${rows.length} runs`]
	if (cleared > 0) {
		notes.push(`${cleared} cleared every wave`)
	}
	if (stalledRuns > 0) {
		notes.push(`${stalledRuns} stalled`)
	}
	if (scores.length === 0) {
		return `<td><span class="sub">${notes.join(' · ')}</span></td>`
	}
	const spread = `${waves(quantile(scores, 0.25))}–${waves(quantile(scores, 0.75))} middle half · ${scores[0]}–${scores[scores.length - 1]}`
	return `<td><b>${waves(quantile(scores, 0.5))}</b><span class="sub">${spread}</span><span class="sub">${notes.join(' · ')}</span></td>`
}

function installationsLabel(installations: string): string {
	return installations === '' ? 'no installations' : `${installations.split('|').length} installations`
}

/**
 * A table per tier, owned kitchen and sweep value: maps down the side in `MAPS` order, who played across,
 * the waves survived in each cell. A score is the waves a run got through, so a run that scores N lost
 * its food during wave N + 1.
 */
function endlessSection(rows: readonly Row[]): string {
	const ofMode = rows.filter(row => row.mode === 'endless')
	if (ofMode.length === 0) {
		return ''
	}
	const parts = [
		'<h2 id="endless">Endless</h2>',
		'<p class="rule">Waves survived per run, by map and who played. Each cell: the median, then the middle half and the extremes, then the run count. A run that scores N lost its food during wave N + 1.</p>',
	]
	for (const value of sortedSweepValues(ofMode)) {
		const ofValue = ofMode.filter(row => row.sweepValue === value)
		for (const difficulty of sortedDifficulties(ofValue)) {
			const ofTier = ofValue.filter(row => row.difficulty === difficulty)
			for (const installations of distinct(ofTier.map(row => row.installations)).sort()) {
				const ofKitchen = ofTier.filter(row => row.installations === installations)
				const [sample] = ofKitchen
				const title = [
					difficulty,
					installationsLabel(installations),
					sample === undefined ? '' : sweepLabel(sample),
				]
					.filter(part => part.length > 0)
					.join(' · ')
				const columns = players(ofKitchen)
				const body = MAPS.filter(map => ofKitchen.some(row => row.map === map.id))
					.map(
						map =>
							`<tr><th>${esc(map.id)}</th>${columns
								.map(player => scoreCell(ofPlayer(ofKitchen, player).filter(row => row.map === map.id)))
								.join('')}</tr>`,
					)
					.join('')
				parts.push(
					`<h3>${esc(title)}</h3>`,
					`<table class="wins"><thead><tr><th>map</th>${columns.map(playerHeader).join('')}</tr></thead><tbody>${body}</tbody></table>`,
				)
			}
		}
	}
	return parts.join('\n')
}

const LEGEND = [
	"<b>What the flags can't see.</b> The Cardboard Box never appears in greedy's rows: it has no DPS, and greedy buys by damage per crumb (step 22B, decision 9). In night mode <code>default</code> is the oldest towers unlocked, not a player's last loadout (step 22A), so night mode's default and the campaign's are different players.",
	"<b>Lockout needs the named answers too.</b> A night's two intended loadouts live in comments in <code>nights.ts</code> (step 21C); run them as <code>fixed=</code> lists and read the fixed tables. The report can't flag them itself.",
	'<b>towerCost is an approximation.</b> It divides income and the starting wallet by the value rather than multiplying every price. The early-call bonus is not scaled, and small rewards round (a 3-crumb Ant at towerCost 1.5 drops 2). The sell refund stays exact.',
	"<b>Crumb rot is not sweepable.</b> <code>ROT_TICKS</code> and <code>HATCH_TICKS</code> are module constants a patch can't reach, so OPEN-QUESTIONS.md section 3's rot question stays open.",
	"<b>Lost includes stuck.</b> A campaign's stuck row is a loss whose retry would have been the same night again.",
]

const STYLE = `
:root {
	color-scheme: light;
	--surface: #fcfcfb; --raised: #f4f3f0; --text: #0b0b0b; --text-secondary: #52514e; --text-muted: #8a8984;
	--grid: #e4e3de; --band: #e9e7e1; --target: #a8a69f; --tint: #2a78d6;
	--series-1: #2a78d6; --series-2: #eb6834; --series-3: #1baf7a; --series-4: #eda100;
	--series-5: #e87ba4; --series-6: #008300; --series-7: #4a3aa7; --series-8: #e34948;
	--seq-0: #86b6ef; --seq-1: #6da7ec; --seq-2: #5598e7; --seq-3: #3987e5; --seq-4: #2a78d6;
	--seq-5: #256abf; --seq-6: #1c5cab; --seq-7: #184f95; --seq-8: #104281; --seq-9: #0d366b;
}
@media (prefers-color-scheme: dark) {
	:root {
		color-scheme: dark;
		--surface: #1a1a19; --raised: #242423; --text: #ffffff; --text-secondary: #c3c2b7; --text-muted: #8f8e86;
		--grid: #33332f; --band: #2f2f2c; --target: #6b6a64; --tint: #3987e5;
		--series-1: #3987e5; --series-2: #d95926; --series-3: #199e70; --series-4: #c98500;
		--series-5: #d55181; --series-6: #008300; --series-7: #9085e9; --series-8: #e66767;
		--seq-0: #184f95; --seq-1: #1c5cab; --seq-2: #256abf; --seq-3: #2a78d6; --seq-4: #3987e5;
		--seq-5: #5598e7; --seq-6: #6da7ec; --seq-7: #86b6ef; --seq-8: #9ec5f4; --seq-9: #cde2fb;
	}
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--surface); color: var(--text); font: 14px/1.45 system-ui, sans-serif; }
main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { margin: 0 0 4px; font-size: 24px; }
h2 { margin: 40px 0 8px; font-size: 19px; border-bottom: 1px solid var(--grid); padding-bottom: 4px; }
h3 { margin: 22px 0 4px; font-size: 15px; }
h4 { margin: 16px 0 6px; font-size: 13px; color: var(--text-secondary); }
nav a { color: var(--text-secondary); margin-right: 14px; }
code { font-size: 12px; background: var(--raised); padding: 1px 4px; border-radius: 3px; }
.muted, .tick, .where { color: var(--text-muted); }
.count { color: var(--text-muted); font-weight: 400; }
.rule { color: var(--text-secondary); margin: 0 0 8px; }
.flags { padding-left: 18px; margin: 0; }
.flags li { margin: 0 0 8px; }
.seeds { color: var(--text-secondary); font-size: 12px; font-family: ui-monospace, monospace; }
.who { color: var(--text); }
figure { margin: 18px 0 28px; }
figcaption { font-weight: 600; margin-bottom: 6px; }
svg { display: block; width: 100%; max-width: 760px; height: auto; }
svg text { font: 11px system-ui, sans-serif; fill: var(--text-secondary); }
svg .label { fill: var(--text); font-size: 12px; }
.grid { stroke: var(--grid); stroke-width: 1; }
.band { fill: var(--band); }
.target { fill: none; stroke: var(--target); stroke-width: 1; stroke-dasharray: 4 4; }
.line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.dot { stroke: var(--surface); stroke-width: 2; }
.legend { list-style: none; padding: 0; margin: 0 0 6px; display: flex; flex-wrap: wrap; gap: 4px 14px; color: var(--text-secondary); }
.swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
.swatch.band { background: var(--band); outline: 1px dashed var(--target); }
details { margin: 6px 0 10px; }
summary { cursor: pointer; color: var(--text-secondary); }
.scroll, table { display: block; overflow-x: auto; max-width: 100%; }
table { border-collapse: collapse; margin: 6px 0; font-variant-numeric: tabular-nums; }
th, td { padding: 4px 8px; text-align: right; border-bottom: 1px solid var(--grid); white-space: nowrap; }
thead th { vertical-align: bottom; font-weight: 600; }
th.night, tbody th { text-align: left; font-weight: 500; }
.sub { display: block; font-size: 11px; color: var(--text-muted); font-weight: 400; }
td.win { background: color-mix(in oklab, var(--tint) calc(var(--p) * 0.28), transparent); }
.legend-notes li { margin-bottom: 8px; color: var(--text-secondary); }
`

/** The whole page. `source` is the CSV's name, which is all it says about where the rows came from. */
export function buildReport(rows: readonly Row[], source: string): string {
	const flags = flagsOf(rows)
	const knob = rows.find(row => row.sweepKnob !== null)?.sweepKnob ?? null
	const facts = [
		`${rows.length} rows from <code>${esc(source)}</code>`,
		`modes: ${distinct(rows.map(row => row.mode)).join(', ')}`,
		`tiers: ${sortedDifficulties(rows).join(', ')}`,
		`policies: ${sortedPolicies(rows).map(esc).join(', ')}`,
		knob === null
			? 'unswept'
			: `sweep: ${esc(knob)} over ${sortedSweepValues(rows)
					.map(value => (value === null ? 'unswept' : String(value)))
					.join(', ')}`,
	]
	const nav = [
		'<a href="#flags">Flags</a>',
		'<a href="#curve">Income curve</a>',
		knob === null ? '' : '<a href="#sweep">Sweep</a>',
		'<a href="#wins">Win rates</a>',
		rows.some(row => row.mode === 'endless') ? '<a href="#endless">Endless</a>' : '',
		'<a href="#legend">Legend</a>',
	].join('')

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Balance report</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>Balance report</h1>
<p class="muted">${facts.join(' · ')}</p>
<nav>${nav}</nav>
${flagsSection(flags)}
${curveSection(rows)}
${sweepSection(rows)}
${winSection(rows)}
${endlessSection(rows)}
<h2 id="legend">Legend</h2>
<ul class="legend-notes">${LEGEND.map(note => `<li>${note}</li>`).join('')}</ul>
</main>
</body>
</html>
`
}
