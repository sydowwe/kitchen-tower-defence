/**
 * The noise meter, audible. On the `effects` bus and never `ambience`: it is information, and a
 * player who turns the atmosphere off must still hear the house stirring.
 *
 * **Everything keys on `level / cap`, never the raw level.** With Close the Door and the White-noise
 * Machine the cap is 155, and a sound keyed on the level would go tense at a third of the bar.
 *
 * Below `NOISE_TENSE_FRACTION` the house is a low drone that opens up as the meter fills, and a
 * floorboard settles now and then, more often the louder it gets. At it, the same point the HUD's bar
 * starts to pulse, the character turns: a heartbeat starts and quickens towards the cap, and two close
 * notes beat against each other over the drone.
 *
 * Read once a frame. Paused, no tick runs and the level does not move, so neither does any of this.
 */

import { playCue, type AudioGraph } from '@/audio/engine.ts'
import { noiseBuffer } from '@/audio/synth.ts'
import { NOISE_TENSE_FRACTION, noiseFraction } from '@/core/systems/noise.ts'
import type { World } from '@/core/types.ts'

/** Time constant of every level change, in seconds: fast enough to follow a shot, slow enough not to zipper. */
const SMOOTHING = 0.2
/** A fraction moved by less than this is not worth an automation event. */
const MIN_CHANGE = 0.002

/** Seconds between heartbeats at the threshold and at the cap. */
const BEAT_AT_THRESHOLD = 1.0
const BEAT_AT_CAP = 0.48

/** No creaks in a quiet kitchen. Above this, one every `CREAK_SLOWEST`..`CREAK_FASTEST` seconds, give or take. */
const CREAK_FROM = 0.2
const CREAK_SLOWEST = 9
const CREAK_FASTEST = 3

interface Layer {
	drone: GainNode
	droneFilter: BiquadFilterNode
	sub: GainNode
	tension: GainNode
	/** The fraction the gains were last aimed at. */
	fraction: number
	nextBeat: number
	nextCreak: number
}

let layer: Layer | null = null

function silentGain(ctx: AudioContext, out: AudioNode): GainNode {
	const gain = ctx.createGain()
	gain.gain.value = 0
	gain.connect(out)
	return gain
}

function build(graph: AudioGraph): Layer {
	const { ctx, buses } = graph

	const drone = silentGain(ctx, buses.effects)
	const droneFilter = ctx.createBiquadFilter()
	droneFilter.type = 'lowpass'
	droneFilter.frequency.value = 140
	droneFilter.Q.value = 0.7
	droneFilter.connect(drone)
	const rumble = ctx.createBufferSource()
	rumble.buffer = noiseBuffer(ctx)
	rumble.loop = true
	rumble.connect(droneFilter)

	const sub = silentGain(ctx, buses.effects)
	const subTone = ctx.createOscillator()
	subTone.frequency.value = 55
	subTone.connect(sub)

	// G3 and a shade above it: the two beat against each other two and a half times a second.
	const tension = silentGain(ctx, buses.effects)
	const tensionFilter = ctx.createBiquadFilter()
	tensionFilter.type = 'lowpass'
	tensionFilter.frequency.value = 900
	tensionFilter.connect(tension)
	const low = ctx.createOscillator()
	low.type = 'triangle'
	low.frequency.value = 196
	const high = ctx.createOscillator()
	high.type = 'triangle'
	high.frequency.value = 198.5
	low.connect(tensionFilter)
	high.connect(tensionFilter)

	for (const source of [rumble, subTone, low, high]) {
		source.start()
	}
	return { drone, droneFilter, sub, tension, fraction: 0, nextBeat: 0, nextCreak: 0 }
}

/** How full the meter sounds. A night that is over makes no noise, whatever the meter was left at. */
function heardFraction(world: World | null): number {
	if (world === null || world.night.phase === 'won' || world.night.phase === 'lost') {
		return 0
	}
	return Math.min(1, noiseFraction(world))
}

/** 0 at the threshold, 1 at the cap; 0 below it. */
function heatOf(fraction: number): number {
	return fraction < NOISE_TENSE_FRACTION ? 0 : (fraction - NOISE_TENSE_FRACTION) / (1 - NOISE_TENSE_FRACTION)
}

function aim(sound: Layer, fraction: number, now: number): void {
	const heat = heatOf(fraction)
	const tense = fraction >= NOISE_TENSE_FRACTION
	sound.drone.gain.setTargetAtTime(0.12 * fraction ** 1.5, now, SMOOTHING)
	sound.droneFilter.frequency.setTargetAtTime(140 + 460 * fraction + 900 * heat, now, SMOOTHING)
	sound.sub.gain.setTargetAtTime(0.14 * fraction ** 2, now, SMOOTHING)
	sound.tension.gain.setTargetAtTime(tense ? 0.035 + 0.05 * heat : 0, now, SMOOTHING)
}

function creakInterval(fraction: number): number {
	const spread = 0.6 + 0.8 * Math.random()
	return (CREAK_SLOWEST - (CREAK_SLOWEST - CREAK_FASTEST) * fraction) * spread
}

export function updateMeter(graph: AudioGraph, world: World | null): void {
	layer ??= build(graph)
	const sound = layer
	const now = graph.ctx.currentTime
	const fraction = heardFraction(world)

	if (Math.abs(fraction - sound.fraction) > MIN_CHANGE) {
		sound.fraction = fraction
		aim(sound, fraction, now)
	}

	const heat = heatOf(fraction)
	if (fraction >= NOISE_TENSE_FRACTION) {
		if (now >= sound.nextBeat) {
			playCue('heartbeat', 0.45 + 0.55 * heat)
			sound.nextBeat = now + BEAT_AT_THRESHOLD - (BEAT_AT_THRESHOLD - BEAT_AT_CAP) * heat
		}
	} else {
		// So the first beat lands the moment the meter crosses, not up to a second after.
		sound.nextBeat = now
	}

	if (fraction >= CREAK_FROM) {
		if (now >= sound.nextCreak) {
			playCue('creak', 0.35 + 0.65 * fraction)
			sound.nextCreak = now + creakInterval(fraction)
		}
	} else {
		// A first creak a while after the kitchen gets loud, not on the frame it does.
		sound.nextCreak = now + creakInterval(CREAK_FROM)
	}
}

/** A new night, or none: the house is quiet again at once, not over the next fifth of a second. */
export function resetMeter(): void {
	if (layer === null) {
		return
	}
	for (const param of [layer.drone.gain, layer.sub.gain, layer.tension.gain]) {
		param.cancelScheduledValues(0)
		param.value = 0
	}
	layer.fraction = 0
}
