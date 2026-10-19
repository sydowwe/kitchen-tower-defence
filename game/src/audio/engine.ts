/**
 * The page's one `AudioContext`, its three buses, and cue playback.
 *
 * **One context for the page, never one per night.** `GameView` mounts once per night and once per
 * Retry, browsers cap how many contexts may be live, and a context per mount is how the sound goes
 * after a few Retries. `activate` and `deactivate` resume and suspend the same one.
 *
 * **It is created and resumed only by a user gesture.** A context made before the page has had one
 * starts suspended and stays that way, which on a reload straight onto `#/night` is a silent night.
 * So while a night is up, the first `pointerdown`, `pointerup` or `keydown` anywhere wakes it.
 *
 * A hidden tab suspends it, so a tabbed-away kitchen does not hum to itself.
 */

import { CUES, type Cue, type CueSpec } from '@/audio/cues.ts'

export type Bus = 'master' | 'effects' | 'ambience'

/** What a fresh profile hears. Step 23D copies these into the settings record's defaults. */
export const AUDIO_DEFAULTS: Readonly<Record<Bus, number>> = { master: 0.8, effects: 1, ambience: 0.7 }

/**
 * Past this many sounding voices, only `cutsThrough` cues still start. The per-cue limits in
 * `cues.ts` do the real work; this keeps a night 15 at 3x from pegging the audio thread.
 */
const MAX_VOICES = 28

/** What a recording may be called: a cue's name, or the fridge's hum, which is a loop and not a cue. */
export type Recording = Cue | 'fridgeHum'

/**
 * `assets/audio/<cue>.mp3` replaces that cue's recipe. MP3 only: it is the one format every engine's
 * `decodeAudioData` takes, Safari included.
 */
const FILES = import.meta.glob<string>('@/assets/audio/*.mp3', { eager: true, query: '?url', import: 'default' })
const FILE_PATTERN = /\/audio\/([A-Za-z]+)\.mp3$/

export interface AudioGraph {
	ctx: AudioContext
	buses: Record<Bus, GainNode>
}

let graph: AudioGraph | null = null
/** Whether a night is up. A gesture on any other screen wakes nothing: the daytime is a different room. */
let active = false
const volumes: Record<Bus, number> = { ...AUDIO_DEFAULTS }
const recordings = new Map<Recording, AudioBuffer>()

/** Per cue: the context time it last started, and when each of its sounding voices ends. */
const lastStart = new Map<Cue, number>()
const endings = new Map<Cue, number[]>()
let allEndings: number[] = []

function isRecording(name: string): name is Recording {
	return name === 'fridgeHum' || name in CUES
}

async function loadRecording(ctx: AudioContext, name: Recording, url: string): Promise<void> {
	try {
		const response = await fetch(url)
		recordings.set(name, await ctx.decodeAudioData(await response.arrayBuffer()))
	} catch {
		console.error(`[audio] recording failed to load, keeping the recipe: ${url}`)
	}
}

function loadRecordings(ctx: AudioContext): void {
	for (const [path, url] of Object.entries(FILES)) {
		const name = FILE_PATTERN.exec(path)?.[1] ?? ''
		if (!isRecording(name)) {
			if (import.meta.env.DEV) {
				console.warn(`[audio] recording matches no cue, ignored: ${path}`)
			}
			continue
		}
		void loadRecording(ctx, name, url)
	}
}

function create(): AudioGraph {
	const ctx = new AudioContext()
	// effects and ambience -> compressor -> master -> speakers. The compressor catches a frame's worth
	// of shots summing past full scale, which is the crackle; master after it is a plain fader.
	const compressor = ctx.createDynamicsCompressor()
	compressor.threshold.value = -14
	compressor.knee.value = 12
	compressor.ratio.value = 6
	compressor.attack.value = 0.003
	compressor.release.value = 0.2

	const master = ctx.createGain()
	const effects = ctx.createGain()
	const ambience = ctx.createGain()
	effects.connect(compressor)
	ambience.connect(compressor)
	compressor.connect(master)
	master.connect(ctx.destination)

	const created = { ctx, buses: { master, effects, ambience } }
	for (const bus of ['master', 'effects', 'ambience'] as const) {
		created.buses[bus].gain.value = volumes[bus]
	}
	loadRecordings(ctx)
	return created
}

/** Resumes the context, creating it the first time -- but only once the page has had a gesture. */
function wake(): void {
	if (!active || document.visibilityState === 'hidden') {
		return
	}
	if (graph === null) {
		if (navigator.userActivation?.hasBeenActive === false) {
			return
		}
		graph = create()
	}
	if (graph.ctx.state !== 'running' && graph.ctx.state !== 'closed') {
		void graph.ctx.resume()
	}
}

function onVisibilityChange(): void {
	if (document.visibilityState === 'hidden') {
		void graph?.ctx.suspend()
	} else {
		wake()
	}
}

const GESTURES = ['pointerdown', 'pointerup', 'keydown'] as const

/** A night is up: sound on, and listening for the gesture that is allowed to start it. */
export function activate(): void {
	if (!active) {
		active = true
		for (const gesture of GESTURES) {
			window.addEventListener(gesture, wake, { capture: true, passive: true })
		}
		document.addEventListener('visibilitychange', onVisibilityChange)
	}
	wake()
}

/** The night is gone. The context is suspended, not closed, so the next one reuses it. */
export function deactivate(): void {
	active = false
	for (const gesture of GESTURES) {
		window.removeEventListener(gesture, wake, { capture: true })
	}
	document.removeEventListener('visibilitychange', onVisibilityChange)
	void graph?.ctx.suspend()
}

/** The context and its buses while one is running, otherwise null: nothing should be scheduled into a stopped clock. */
export function runningGraph(): AudioGraph | null {
	return graph !== null && graph.ctx.state === 'running' ? graph : null
}

export function recording(name: Recording): AudioBuffer | undefined {
	return recordings.get(name)
}

/** 0..1, applied at once. Persisted by step 23D, not here. */
export function setVolume(bus: Bus, value: number): void {
	volumes[bus] = Math.min(1, Math.max(0, value))
	if (graph !== null) {
		const gain = graph.buses[bus].gain
		gain.cancelScheduledValues(0)
		gain.setValueAtTime(volumes[bus], graph.ctx.currentTime)
	}
}

function sounding(ends: readonly number[], now: number): number[] {
	return ends.filter(end => end > now)
}

/**
 * Starts `cue` at `gain`, `delay` seconds from now, unless its own limits or the overall ceiling say
 * no. A refused cue is dropped, never queued: a shot heard late is worse than one not heard.
 */
export function playCue(cue: Cue, gain = 1, delay = 0): void {
	const running = runningGraph()
	if (running === null) {
		return
	}
	const { ctx, buses } = running
	const spec: CueSpec = CUES[cue]
	const now = ctx.currentTime

	const last = lastStart.get(cue)
	if (last !== undefined && now - last < spec.minGapMs / 1000) {
		return
	}
	const ends = sounding(endings.get(cue) ?? [], now)
	allEndings = sounding(allEndings, now)
	if (ends.length >= spec.maxVoices || (spec.cutsThrough !== true && allEndings.length >= MAX_VOICES)) {
		endings.set(cue, ends)
		return
	}

	const out = ctx.createGain()
	out.gain.value = gain
	out.connect(buses[spec.bus])
	const at = now + delay

	let length: number
	const file = recordings.get(cue)
	if (file === undefined) {
		length = spec.play({ ctx, out, at })
	} else {
		const source = ctx.createBufferSource()
		source.buffer = file
		source.playbackRate.value = spec.rate?.() ?? 1
		source.connect(out)
		source.start(at)
		length = file.duration / source.playbackRate.value
	}

	lastStart.set(cue, now)
	ends.push(at + length)
	endings.set(cue, ends)
	allEndings.push(at + length)
}
