/**
 * The room: the fridge's compressor and a clock on the wall. On the `ambience` bus, so a player who
 * turns the atmosphere off loses these and keeps every sound that carries information.
 *
 * No music (analytic-docs/OPEN-QUESTIONS.md section 6).
 *
 * Built on the first frame a running context exists and never torn down: it lasts as long as the
 * context, which is suspended between nights. Paced by the context's clock, not the simulation's, so
 * a paused night is still a kitchen at 2am.
 */

import { playCue, recording, type AudioGraph } from '@/audio/engine.ts'
import { noiseBuffer } from '@/audio/synth.ts'

/** The synthesized hum's level. A recording plays at its own. */
const HUM_GAIN = 0.05
/** A fridge runs, rests and runs again. Seconds of each, and the fade between, as a time constant. */
const HUM_ON_SECONDS = 48
const HUM_OFF_SECONDS = 22
const HUM_FADE = 1.2

const CLOCK_GAIN = 0.4
/** How far ahead of the context's clock a tick is scheduled, so a slow frame never makes it late. */
const CLOCK_LOOKAHEAD = 0.1

interface Ambience {
	hum: GainNode
	sources: AudioScheduledSourceNode[]
	recorded: boolean
	humOn: boolean
	nextHumChange: number
	nextTick: number
	tock: boolean
}

let ambience: Ambience | null = null

/** Mains hum and its first harmonic under a low-pass, a little air, and a slow wobble in the motor. */
function synthesizeHum(ctx: AudioContext, out: AudioNode): AudioScheduledSourceNode[] {
	const filter = ctx.createBiquadFilter()
	filter.type = 'lowpass'
	filter.frequency.value = 220
	filter.connect(out)

	const motor = ctx.createGain()
	motor.gain.value = 0.6
	motor.connect(filter)
	const mains = ctx.createOscillator()
	mains.type = 'sawtooth'
	mains.frequency.value = 50
	mains.connect(motor)

	const harmonic = ctx.createOscillator()
	harmonic.frequency.value = 100
	const harmonicGain = ctx.createGain()
	harmonicGain.gain.value = 0.35
	harmonic.connect(harmonicGain)
	harmonicGain.connect(filter)

	const wobble = ctx.createOscillator()
	wobble.frequency.value = 0.17
	const wobbleDepth = ctx.createGain()
	wobbleDepth.gain.value = 0.15
	wobble.connect(wobbleDepth)
	wobbleDepth.connect(motor.gain)

	const air = ctx.createBufferSource()
	air.buffer = noiseBuffer(ctx)
	air.loop = true
	const airFilter = ctx.createBiquadFilter()
	airFilter.type = 'lowpass'
	airFilter.frequency.value = 380
	const airGain = ctx.createGain()
	airGain.gain.value = 0.25
	air.connect(airFilter)
	airFilter.connect(airGain)
	airGain.connect(out)

	const sources = [mains, harmonic, wobble, air]
	for (const source of sources) {
		source.start()
	}
	return sources
}

function build(graph: AudioGraph): Ambience {
	const hum = graph.ctx.createGain()
	hum.gain.value = 0
	hum.connect(graph.buses.ambience)
	const now = graph.ctx.currentTime
	return {
		hum,
		sources: synthesizeHum(graph.ctx, hum),
		recorded: false,
		// Off and due, so the first frame fades the hum in rather than starting on it.
		humOn: false,
		nextHumChange: now,
		nextTick: now + CLOCK_LOOKAHEAD,
		tock: false,
	}
}

/** `assets/audio/fridgeHum.mp3`, once it has decoded, replaces the synthesized hum as a loop. */
function useRecording(ctx: AudioContext, room: Ambience, file: AudioBuffer): void {
	for (const source of room.sources) {
		source.stop()
	}
	const loop = ctx.createBufferSource()
	loop.buffer = file
	loop.loop = true
	loop.connect(room.hum)
	loop.start()
	room.sources = [loop]
	room.recorded = true
}

export function updateAmbience(graph: AudioGraph): void {
	const ctx = graph.ctx
	ambience ??= build(graph)
	const room = ambience
	const now = ctx.currentTime

	const file = recording('fridgeHum')
	if (file !== undefined && !room.recorded) {
		useRecording(ctx, room, file)
	}

	if (now >= room.nextHumChange) {
		room.humOn = !room.humOn
		room.hum.gain.setTargetAtTime(room.humOn ? (room.recorded ? 1 : HUM_GAIN) : 0, now, HUM_FADE)
		room.nextHumChange = now + (room.humOn ? HUM_ON_SECONDS : HUM_OFF_SECONDS)
	}

	// A stalled frame leaves the next tick in the past. Start again from now rather than firing a burst.
	if (room.nextTick < now) {
		room.nextTick = now + CLOCK_LOOKAHEAD
	}
	if (room.nextTick - now <= CLOCK_LOOKAHEAD) {
		playCue(room.tock ? 'clockTock' : 'clockTick', CLOCK_GAIN, room.nextTick - now)
		room.tock = !room.tock
		room.nextTick += 1
	}
}
