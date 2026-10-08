/**
 * Rows to CSV, byte-identical for the same rows in any order: the order is a sort, never the order
 * jobs finished in, and nothing here knows what time it is. Elapsed time goes to stderr.
 */

import { DIFFICULTY_LADDER } from '@/core/campaign.ts'
import type { Row } from '@/dev/harness/types.ts'

type Format = 'text' | 'int' | 'float'

/** The column order, and how each is printed. Floats get three decimals; a null is an empty field. */
const COLUMNS: readonly (readonly [keyof Row, Format])[] = [
	['mode', 'text'],
	['night', 'text'],
	['nightIndex', 'int'],
	['map', 'text'],
	['difficulty', 'text'],
	['policy', 'text'],
	['loadoutPolicy', 'text'],
	['loadout', 'text'],
	['installations', 'text'],
	['seed', 'int'],
	['attempt', 'int'],
	['sweepKnob', 'text'],
	['sweepValue', 'float'],
	['outcome', 'text'],
	['ticks', 'int'],
	['wavesStarted', 'int'],
	['wavesCleared', 'int'],
	['waveCount', 'int'],
	['foodStart', 'int'],
	['foodRemaining', 'int'],
	['crumbsStart', 'int'],
	['crumbsEarned', 'int'],
	['crumbsSpent', 'int'],
	['crumbsWastedAtSunrise', 'int'],
	['crumbsDropped', 'int'],
	['crumbsCollected', 'int'],
	['crumbsForfeited', 'int'],
	['towersBuilt', 'int'],
	['towersSold', 'int'],
	['towersDestroyed', 'int'],
	['enemiesKilled', 'int'],
	['enemiesLeaked', 'int'],
	['thievesEscaped', 'int'],
	['peakNoise', 'float'],
	['wakeCount', 'int'],
	['groceryMoney', 'int'],
	['rosterMeanCost', 'float'],
	['towersAffordablePerWave', 'float'],
	['damageTotal', 'float'],
	['topDamageSource', 'text'],
	['topDamageShare', 'float'],
]

function compareNullable(a: number | null, b: number | null): number {
	if (a === b) {
		return 0
	}
	if (a === null) {
		return -1
	}
	if (b === null) {
		return 1
	}
	return a - b
}

function compareText(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Sweep value, difficulty (easiest first), night index, policy, loadout policy, seed, attempt -- then
 * the mode and installations, so no two distinct rows ever tie.
 */
function compareRows(a: Row, b: Row): number {
	return (
		compareNullable(a.sweepValue, b.sweepValue) ||
		DIFFICULTY_LADDER.indexOf(a.difficulty) - DIFFICULTY_LADDER.indexOf(b.difficulty) ||
		a.nightIndex - b.nightIndex ||
		compareText(a.policy, b.policy) ||
		compareText(a.loadoutPolicy, b.loadoutPolicy) ||
		a.seed - b.seed ||
		a.attempt - b.attempt ||
		compareText(a.mode, b.mode) ||
		compareText(a.installations, b.installations)
	)
}

function quoted(text: string): string {
	return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function field(value: Row[keyof Row], format: Format): string {
	if (value === null) {
		return ''
	}
	if (format === 'text' || typeof value === 'string') {
		return quoted(String(value))
	}
	if (format === 'int') {
		if (!Number.isInteger(value)) {
			throw new Error(`an integer column holds ${value}`)
		}
		return String(value)
	}
	return Number.isFinite(value) ? value.toFixed(3) : ''
}

export function toCsv(rows: readonly Row[]): string {
	const lines = [COLUMNS.map(([name]) => name).join(',')]
	for (const row of [...rows].sort(compareRows)) {
		lines.push(COLUMNS.map(([name, format]) => field(row[name], format)).join(','))
	}
	return `${lines.join('\n')}\n`
}
