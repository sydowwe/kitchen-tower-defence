/**
 * The two building blocks every synthesized cue is made of: a pitched tone and a burst of filtered
 * noise, each under its own envelope. A cue's recipe in `cues.ts` is a handful of these.
 *
 * Every node made here is stopped by the time its envelope ends, and the voice's output gain has no
 * other input, so a finished cue leaves nothing behind for the audio thread to run.
 */

/** Where one cue plays: its context, the gain node it writes into, and the context time it starts at. */
export interface Voice {
	ctx: BaseAudioContext
	out: AudioNode
	at: number
}

interface Envelope {
	/** Seconds after the voice's start. */
	delay?: number
	attack?: number
	decay: number
	peak: number
}

export interface ToneParams extends Envelope {
	type?: OscillatorType
	freq: number
	/** A glide from `freq` to here, over `glide` seconds or the whole envelope. */
	to?: number
	glide?: number
	/** A low-pass over the tone, for the buzzy waveforms. */
	lowpass?: number
}

export interface HissParams extends Envelope {
	filter: BiquadFilterType
	freq: number
	/** A sweep of the filter from `freq` to here, over the whole envelope. */
	to?: number
	q?: number
}

/** The envelope's floor: `exponentialRamp` cannot reach 0. Well under anything audible. */
const SILENT = 0.0001
/** Past the envelope's end before the source stops, so the ramp is never cut short into a click. */
const TAIL = 0.02
const DEFAULT_ATTACK = 0.002

/** One buffer of white noise for the page, read from a random offset by every hiss. */
const NOISE_SECONDS = 2
let noise: AudioBuffer | null = null

export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
	if (noise === null || noise.sampleRate !== ctx.sampleRate) {
		noise = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate)
		const samples = noise.getChannelData(0)
		for (let i = 0; i < samples.length; i++) {
			samples[i] = Math.random() * 2 - 1
		}
	}
	return noise
}

/** `1 ± amount`, for the pitch variation that keeps a repeated cue from grating. */
export function vary(amount: number): number {
	return 1 + (Math.random() * 2 - 1) * amount
}

/** Seconds from the voice's start to the end of this envelope. */
function lengthOf(params: Envelope): number {
	return (params.delay ?? 0) + (params.attack ?? DEFAULT_ATTACK) + params.decay
}

function envelope(voice: Voice, params: Envelope): GainNode {
	const start = voice.at + (params.delay ?? 0)
	const peakAt = start + (params.attack ?? DEFAULT_ATTACK)
	const gain = voice.ctx.createGain()
	gain.gain.setValueAtTime(0, start)
	gain.gain.linearRampToValueAtTime(params.peak, peakAt)
	gain.gain.exponentialRampToValueAtTime(SILENT, peakAt + params.decay)
	gain.connect(voice.out)
	return gain
}

/** Returns the seconds it lasts, so a recipe can answer with the longest of its parts. */
export function tone(voice: Voice, params: ToneParams): number {
	const start = voice.at + (params.delay ?? 0)
	const length = lengthOf(params)
	const osc = voice.ctx.createOscillator()
	osc.type = params.type ?? 'sine'
	osc.frequency.setValueAtTime(params.freq, start)
	if (params.to !== undefined) {
		const glide = params.glide ?? length - (params.delay ?? 0)
		osc.frequency.exponentialRampToValueAtTime(params.to, start + glide)
	}

	const gain = envelope(voice, params)
	if (params.lowpass === undefined) {
		osc.connect(gain)
	} else {
		const filter = voice.ctx.createBiquadFilter()
		filter.type = 'lowpass'
		filter.frequency.value = params.lowpass
		osc.connect(filter)
		filter.connect(gain)
	}

	osc.start(start)
	osc.stop(voice.at + length + TAIL)
	return length
}

export function hiss(voice: Voice, params: HissParams): number {
	const start = voice.at + (params.delay ?? 0)
	const length = lengthOf(params)
	const buffer = noiseBuffer(voice.ctx)
	const source = voice.ctx.createBufferSource()
	source.buffer = buffer

	const filter = voice.ctx.createBiquadFilter()
	filter.type = params.filter
	filter.Q.value = params.q ?? 1
	filter.frequency.setValueAtTime(params.freq, start)
	if (params.to !== undefined) {
		filter.frequency.exponentialRampToValueAtTime(params.to, voice.at + length)
	}

	source.connect(filter)
	filter.connect(envelope(voice, params))
	// A random offset, so two hisses in a row are never the same grain of noise.
	source.start(start, Math.random() * Math.max(0, buffer.duration - length - TAIL))
	source.stop(voice.at + length + TAIL)
	return length
}
