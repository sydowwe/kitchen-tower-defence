/**
 * `--sweep knob=from:to:step`: one global number set across a range, and the whole matrix re-run at
 * each value. What each knob moves, and why crumb rot is not one, is step 22C's decisions 1-3.
 *
 * **A sweep patches the world's own copies, between `createWorld` and tick 0.** `world.difficulty` is
 * `resolveDifficulty`'s copy and `world.noise` is built per world, so a patch dies with its world.
 * `DIFFICULTIES` has the same shape and is one import away: written to, it compounds across every later
 * job in the process, and a sharded CSV stops matching an unsharded one.
 */

import type { World } from '@/core/types.ts'
import type { Sweep } from '@/dev/harness/types.ts'

/** The one conversion `noiseDecay` does: its value is per second, the meter's is per tick. */
const TICKS_PER_SECOND = 60

const PATCHES = {
	income(world: World, value: number) {
		world.difficulty.crumbIncomeMult *= value
	},
	enemyHp(world: World, value: number) {
		world.difficulty.enemyHpMult *= value
	},
	enemyCount(world: World, value: number) {
		world.difficulty.enemyCountMult *= value
	},
	// Rounded: the wallet is whole crumbs, and the CSV's `crumbsStart` is an integer column.
	startingCrumbs(world: World, value: number) {
		world.crumbs = Math.round(world.crumbs * value)
	},
	// Sets the base and keeps what the installations add to it.
	noiseDecay(world: World, value: number) {
		world.noise.decayPerTick = value / TICKS_PER_SECOND + world.modifiers.noiseDecayPerTickDelta
	},
	// Every price times v, as every crumb over v: the early-call bonus is not scaled and small rewards
	// round, which the report's legend says.
	towerCost(world: World, value: number) {
		world.difficulty.crumbIncomeMult /= value
		world.crumbs = Math.round(world.crumbs / value)
	},
} as const satisfies Record<string, (world: World, value: number) => void>

export type SweepKnob = keyof typeof PATCHES

export const SWEEP_KNOBS = Object.keys(PATCHES) as SweepKnob[]

function isKnob(name: string): name is SweepKnob {
	return name in PATCHES
}

/** The patch a job's sweep applies, or undefined for an unswept job. */
export function sweepPatch(sweep: Sweep | null): ((world: World) => void) | undefined {
	if (sweep === null) {
		return undefined
	}
	const { knob, value } = sweep
	if (!isKnob(knob)) {
		throw new Error(`unknown sweep knob '${knob}'`)
	}
	const patch = PATCHES[knob]
	return world => patch(world, value)
}

const DECIMAL = /^\d+(?:\.\d+)?$/

function decimalsOf(text: string): number {
	const dot = text.indexOf('.')
	return dot === -1 ? 0 : text.length - dot - 1
}

function numberIn(spec: string, text: string): number {
	if (!DECIMAL.test(text)) {
		throw new Error(`'${text}' in '${spec}' is not a plain decimal`)
	}
	return Number(text)
}

/**
 * `knob=from:to:step` as one sweep per value, inclusive, or `knob=value` as one. Each value is built by
 * index, `from + i * step`, and rounded to the most decimals `from` or `step` was written with -- never
 * by adding `step` in a loop, which ends `0.6:1.6:0.1` at 1.5000000000000002 and loses the 1.6.
 */
export function parseSweep(spec: string): Sweep[] {
	const at = spec.indexOf('=')
	const knob = at === -1 ? spec : spec.slice(0, at)
	if (!isKnob(knob)) {
		throw new Error(`unknown sweep knob '${knob}'; known: ${SWEEP_KNOBS.join(', ')}`)
	}
	if (at === -1) {
		throw new Error(`'${spec}' wants a value: ${knob}=from:to:step, or ${knob}=value`)
	}

	const parts = spec.slice(at + 1).split(':')
	let values: number[]
	if (parts.length === 1) {
		values = [numberIn(spec, parts[0] ?? '')]
	} else if (parts.length === 3) {
		const [fromText = '', toText = '', stepText = ''] = parts
		const from = numberIn(spec, fromText)
		const to = numberIn(spec, toText)
		const step = numberIn(spec, stepText)
		if (step <= 0 || to < from) {
			throw new Error(`'${spec}' wants from <= to and a step above 0`)
		}
		const decimals = Math.max(decimalsOf(fromText), decimalsOf(stepText))
		// The epsilon only stops (1.6 - 0.6) / 0.1 = 9.999999999999998 flooring to 9.
		const count = Math.floor((to - from) / step + 1e-9) + 1
		values = Array.from({ length: count }, (_, index) => Number((from + index * step).toFixed(decimals)))
	} else {
		throw new Error(`'${spec}' wants ${knob}=from:to:step, or ${knob}=value`)
	}

	if (values.some(value => value === 0) && knob !== 'noiseDecay') {
		throw new Error(`'${spec}' sets ${knob} to 0; only noiseDecay may be 0`)
	}
	return values.map(value => ({ knob, value }))
}
