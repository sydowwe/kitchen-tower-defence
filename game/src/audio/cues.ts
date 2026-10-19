/**
 * Every sound the night makes, by name, with the recipe that synthesizes it and the limits it plays
 * under.
 *
 * **The name is also the file name that replaces it**: `assets/audio/snap.mp3` plays instead of the
 * `snap` recipe, the way a PNG replaces a glyph in `render/sprites.ts`. A recording is a file drop and
 * its licence goes in a file beside it.
 *
 * The limits are per cue, never global, which is what keeps the Mousetrap's snap audible under forty
 * Salt Shakers at 3x: the shakers fill their own four voices and stop there. `cutsThrough` cues also
 * ignore the engine's overall voice ceiling, which is only there to keep the audio thread off the floor.
 */

import { hiss, tone, vary, type Voice } from '@/audio/synth.ts'

export interface CueSpec {
	bus: 'effects' | 'ambience'
	/** The least time between two starts of this cue. A start inside it is dropped, not queued. */
	minGapMs: number
	/** How many of this cue may sound at once. */
	maxVoices: number
	/** Plays even when the engine's overall ceiling is full. For the sounds that are information. */
	cutsThrough?: boolean
	/** A recording's playback rate, for the cues whose recipe varies its pitch. 1 when absent. */
	rate?: () => number
	/** Schedules the cue at `voice.at` and returns how long it sounds, in seconds. */
	play(voice: Voice): number
}

/** Five notes of a pentatonic scale: a random pick of these never makes an interval that grates. */
const CRUMB_NOTES = [1568, 1760, 2093, 2349, 2637]

function crumbNote(): number {
	return CRUMB_NOTES[Math.floor(Math.random() * CRUMB_NOTES.length)] ?? 2093
}

/** One footfall on a kitchen floor: a low knock and the scuff under it. */
function footstep(voice: Voice, delay: number): number {
	tone(voice, { freq: 90, to: 55, delay, decay: 0.14, peak: 0.55 })
	return hiss(voice, { filter: 'lowpass', freq: 450, delay, decay: 0.09, peak: 0.3 })
}

/** One squeak: a fast upward chirp, high enough to be nothing in the kitchen but a mouse. */
function squeak(voice: Voice, delay: number, freq: number, peak: number): number {
	return tone(voice, { freq, to: freq * 1.28, glide: 0.06, delay, attack: 0.008, decay: 0.09, peak })
}

export const CUES = {
	// --- shots, by the kind of shot -----------------------------------------------------------

	/** Salt, bay leaf, anything physical that throws: a dry double shake. */
	shake: {
		bus: 'effects',
		minGapMs: 45,
		maxVoices: 4,
		rate: () => vary(0.12),
		play(voice) {
			const pitch = vary(0.15)
			hiss(voice, { filter: 'highpass', freq: 5200 * pitch, q: 0.8, decay: 0.03, peak: 0.28 })
			return hiss(voice, { filter: 'highpass', freq: 4400 * pitch, q: 0.8, delay: 0.045, decay: 0.03, peak: 0.2 })
		},
	},
	/** Cold: ice on ice. */
	clink: {
		bus: 'effects',
		minGapMs: 60,
		maxVoices: 3,
		rate: () => vary(0.08),
		play(voice) {
			const pitch = vary(0.06)
			tone(voice, { freq: 2600 * pitch, decay: 0.12, peak: 0.16 })
			return tone(voice, { freq: 3950 * pitch, decay: 0.07, peak: 0.07 })
		},
	},
	/** A trigger spray: any cone. */
	spray: {
		bus: 'effects',
		minGapMs: 70,
		maxVoices: 3,
		play(voice) {
			return hiss(voice, {
				filter: 'bandpass',
				freq: 2600 * vary(0.1),
				q: 0.8,
				attack: 0.015,
				decay: 0.14,
				peak: 0.3,
			})
		},
	},
	/** Chemical that lands wet: a lemon, a baking-soda puff. */
	splat: {
		bus: 'effects',
		minGapMs: 60,
		maxVoices: 3,
		rate: () => vary(0.1),
		play(voice) {
			const pitch = vary(0.12)
			tone(voice, { freq: 340 * pitch, to: 110, decay: 0.09, peak: 0.25 })
			return hiss(voice, { filter: 'lowpass', freq: 1300, decay: 0.07, peak: 0.16 })
		},
	},
	/** Quiet fire: a soft breath of flame. */
	flick: {
		bus: 'effects',
		minGapMs: 70,
		maxVoices: 3,
		play(voice) {
			tone(voice, { type: 'triangle', freq: 180, to: 120, decay: 0.08, peak: 0.08 })
			return hiss(voice, { filter: 'lowpass', freq: 950, to: 320, attack: 0.012, decay: 0.12, peak: 0.22 })
		},
	},
	/** The Mousetrap. The loudest shot in the kitchen, and the one that must never be lost. */
	snap: {
		bus: 'effects',
		minGapMs: 30,
		maxVoices: 4,
		cutsThrough: true,
		play(voice) {
			hiss(voice, { filter: 'highpass', freq: 1800, attack: 0.001, decay: 0.02, peak: 0.95 })
			tone(voice, { type: 'square', freq: 1400, to: 240, attack: 0.001, decay: 0.05, peak: 0.22, lowpass: 3500 })
			tone(voice, { freq: 150, to: 68, decay: 0.13, peak: 0.7 })
			return tone(voice, { type: 'triangle', freq: 610, delay: 0.01, decay: 0.26, peak: 0.06 })
		},
	},
	/** The Toaster: the clack of the lever, the spring, and the ding everybody knows. */
	toast: {
		bus: 'effects',
		minGapMs: 40,
		maxVoices: 3,
		cutsThrough: true,
		play(voice) {
			hiss(voice, { filter: 'bandpass', freq: 1400, q: 2, attack: 0.001, decay: 0.03, peak: 0.55 })
			tone(voice, { type: 'triangle', freq: 520, to: 790, glide: 0.05, decay: 0.32, peak: 0.16 })
			tone(voice, { type: 'triangle', freq: 532, to: 800, glide: 0.05, decay: 0.32, peak: 0.1 })
			tone(voice, { freq: 3520, delay: 0.05, decay: 0.2, peak: 0.04 })
			return tone(voice, { freq: 1760, delay: 0.05, decay: 0.55, peak: 0.13 })
		},
	},
	/** The Gas Stove Burner, once a second while it burns: the igniter's tick and the whump. */
	burner: {
		bus: 'effects',
		minGapMs: 120,
		maxVoices: 3,
		play(voice) {
			tone(voice, { type: 'square', freq: 3000, attack: 0.001, decay: 0.008, peak: 0.18, lowpass: 6000 })
			tone(voice, { freq: 90, delay: 0.02, decay: 0.2, peak: 0.22 })
			return hiss(voice, {
				filter: 'lowpass',
				freq: 500,
				to: 1500,
				delay: 0.02,
				attack: 0.04,
				decay: 0.26,
				peak: 0.34,
			})
		},
	},
	/** The Fan: a push of air. */
	gust: {
		bus: 'effects',
		minGapMs: 120,
		maxVoices: 2,
		play(voice) {
			return hiss(voice, { filter: 'bandpass', freq: 380, to: 900, q: 1, attack: 0.06, decay: 0.3, peak: 0.34 })
		},
	},

	// --- the board -----------------------------------------------------------------------------

	/** An enemy dies: small and soft, because it happens hundreds of times a night. */
	kill: {
		bus: 'effects',
		minGapMs: 35,
		maxVoices: 4,
		rate: () => vary(0.15),
		play(voice) {
			tone(voice, { freq: 720 * vary(0.2), to: 180, decay: 0.07, peak: 0.16 })
			return hiss(voice, { filter: 'highpass', freq: 3000, decay: 0.015, peak: 0.07 })
		},
	},
	/** Something left the fridge for good. A sting -- two notes a semitone apart, falling -- not a crunch. */
	leak: {
		bus: 'effects',
		minGapMs: 220,
		maxVoices: 2,
		cutsThrough: true,
		play(voice) {
			tone(voice, { type: 'triangle', freq: 659, to: 622, decay: 0.75, peak: 0.15, lowpass: 2400 })
			tone(voice, { type: 'triangle', freq: 698, to: 659, decay: 0.75, peak: 0.12, lowpass: 2400 })
			return tone(voice, { freq: 1318, to: 1245, decay: 0.4, peak: 0.05 })
		},
	},
	/** A tower set down on the counter. */
	place: {
		bus: 'effects',
		minGapMs: 60,
		maxVoices: 2,
		play(voice) {
			tone(voice, { freq: 155, to: 55, decay: 0.15, peak: 0.7 })
			return hiss(voice, { filter: 'lowpass', freq: 700, decay: 0.05, peak: 0.25 })
		},
	},
	/** Three notes up and a glint. */
	upgrade: {
		bus: 'effects',
		minGapMs: 80,
		maxVoices: 2,
		play(voice) {
			tone(voice, { freq: 1047, decay: 0.22, peak: 0.13 })
			tone(voice, { freq: 1319, delay: 0.06, decay: 0.22, peak: 0.13 })
			tone(voice, { freq: 1568, delay: 0.12, decay: 0.3, peak: 0.13 })
			return hiss(voice, { filter: 'highpass', freq: 7000, delay: 0.12, decay: 0.2, peak: 0.04 })
		},
	},
	/** Picked up and paid for. Falls where the upgrade rises, and lifts where the placement lands. */
	sell: {
		bus: 'effects',
		minGapMs: 80,
		maxVoices: 2,
		play(voice) {
			hiss(voice, { filter: 'bandpass', freq: 700, to: 2200, q: 1.2, attack: 0.03, decay: 0.12, peak: 0.16 })
			tone(voice, { type: 'triangle', freq: 784, delay: 0.03, decay: 0.12, peak: 0.13 })
			return tone(voice, { type: 'triangle', freq: 523, delay: 0.11, decay: 0.22, peak: 0.13 })
		},
	},
	/** A tower broken by what it was holding back. */
	broke: {
		bus: 'effects',
		minGapMs: 120,
		maxVoices: 2,
		play(voice) {
			tone(voice, { freq: 120, to: 45, decay: 0.22, peak: 0.45 })
			return hiss(voice, { filter: 'lowpass', freq: 1000, to: 200, attack: 0.003, decay: 0.3, peak: 0.5 })
		},
	},
	/**
	 * The most repeated sound in the game. Short, quiet and on a different note of a pentatonic
	 * scale each time, or it grates by wave 3.
	 */
	crumb: {
		bus: 'effects',
		minGapMs: 40,
		maxVoices: 3,
		rate: () => vary(0.15),
		play(voice) {
			return tone(voice, { freq: crumbNote(), decay: 0.05, peak: 0.07 })
		},
	},
	/** A thief's grab landed: one squeak. */
	grab: {
		bus: 'effects',
		minGapMs: 200,
		maxVoices: 2,
		play(voice) {
			return squeak(voice, 0, 2700, 0.1)
		},
	},

	// --- the house -----------------------------------------------------------------------------

	/** Somebody woke up: three footsteps down the hall, then the light switch. */
	woke: {
		bus: 'effects',
		minGapMs: 1000,
		maxVoices: 1,
		cutsThrough: true,
		play(voice) {
			footstep(voice, 0)
			footstep(voice, 0.45)
			footstep(voice, 0.9)
			hiss(voice, { filter: 'highpass', freq: 2500, delay: 1.35, attack: 0.001, decay: 0.012, peak: 0.75 })
			tone(voice, {
				type: 'square',
				freq: 1800,
				delay: 1.35,
				attack: 0.001,
				decay: 0.01,
				peak: 0.12,
				lowpass: 5000,
			})
			return hiss(voice, { filter: 'highpass', freq: 2000, delay: 1.38, attack: 0.001, decay: 0.02, peak: 0.35 })
		},
	},
	/** The Mouse arrives: claws on the skirting, then three squeaks. Nothing else in the kitchen is up there. */
	mouse: {
		bus: 'effects',
		minGapMs: 1000,
		maxVoices: 1,
		cutsThrough: true,
		play(voice) {
			for (let i = 0; i < 9; i++) {
				hiss(voice, {
					filter: 'highpass',
					freq: 3600,
					delay: i * 0.055 + Math.random() * 0.02,
					decay: 0.01,
					peak: 0.22,
				})
			}
			squeak(voice, 0.6, 2900, 0.2)
			squeak(voice, 0.76, 3300, 0.18)
			return squeak(voice, 0.9, 3100, 0.22)
		},
	},
	/** First light: a slow major chord and a bird outside. */
	won: {
		bus: 'effects',
		minGapMs: 1000,
		maxVoices: 1,
		cutsThrough: true,
		play(voice) {
			let length = 0
			for (const [i, freq] of [523, 659, 784, 1047].entries()) {
				length = tone(voice, { freq, delay: i * 0.08, attack: 0.6, decay: 1.8, peak: 0.07 })
			}
			tone(voice, { freq: 3200, to: 4300, glide: 0.05, delay: 1.3, decay: 0.07, peak: 0.05 })
			tone(voice, { freq: 3400, to: 4500, glide: 0.05, delay: 1.45, decay: 0.07, peak: 0.05 })
			return length
		},
	},
	/** The fridge is empty: its door swings shut, and two notes fall. */
	lost: {
		bus: 'effects',
		minGapMs: 1000,
		maxVoices: 1,
		cutsThrough: true,
		play(voice) {
			tone(voice, { freq: 75, to: 40, decay: 0.32, peak: 0.6 })
			hiss(voice, { filter: 'lowpass', freq: 320, decay: 0.2, peak: 0.3 })
			tone(voice, { type: 'triangle', freq: 440, delay: 0.35, decay: 0.6, peak: 0.12, lowpass: 2000 })
			return tone(voice, { type: 'triangle', freq: 370, delay: 0.7, decay: 1.0, peak: 0.12, lowpass: 2000 })
		},
	},

	// --- the meter's layer (`meter.ts`). On `effects`: it is information, not atmosphere --------

	/** A floorboard settling somewhere upstairs. More often the louder the kitchen gets. */
	creak: {
		bus: 'effects',
		minGapMs: 1500,
		maxVoices: 1,
		cutsThrough: true,
		rate: () => vary(0.1),
		play(voice) {
			const pitch = vary(0.15)
			tone(voice, {
				type: 'sawtooth',
				freq: 95 * pitch,
				to: 78 * pitch,
				attack: 0.08,
				decay: 0.4,
				peak: 0.05,
				lowpass: 900,
			})
			return hiss(voice, {
				filter: 'bandpass',
				freq: 320 * pitch,
				to: 240 * pitch,
				q: 14,
				attack: 0.08,
				decay: 0.4,
				peak: 0.9,
			})
		},
	},
	/** Past the threshold: a heartbeat, faster as the meter fills. */
	heartbeat: {
		bus: 'effects',
		minGapMs: 300,
		maxVoices: 2,
		cutsThrough: true,
		play(voice) {
			tone(voice, { freq: 62, to: 44, decay: 0.12, peak: 0.6 })
			return tone(voice, { freq: 56, to: 40, delay: 0.17, decay: 0.15, peak: 0.42 })
		},
	},

	// --- ambience (`ambience.ts`) --------------------------------------------------------------

	clockTick: {
		bus: 'ambience',
		minGapMs: 400,
		maxVoices: 1,
		play(voice) {
			return hiss(voice, { filter: 'bandpass', freq: 3300, q: 5, attack: 0.001, decay: 0.012, peak: 0.3 })
		},
	},
	clockTock: {
		bus: 'ambience',
		minGapMs: 400,
		maxVoices: 1,
		play(voice) {
			return hiss(voice, { filter: 'bandpass', freq: 2500, q: 5, attack: 0.001, decay: 0.014, peak: 0.3 })
		},
	},
} satisfies Record<string, CueSpec>

export type Cue = keyof typeof CUES
