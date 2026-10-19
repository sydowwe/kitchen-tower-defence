/**
 * The night's sound: raw WebAudio, every cue synthesized unless a file replaces it. A lane beside
 * `render/` -- it reads `core/` and never writes it, and knows nothing of `ui/`, `data/` or `render/`.
 *
 * `GameView` is the only caller: `startAudio` on mount, `pushAudioEvents` and `updateAudio` in every
 * `draw()`, `resetAudio` on each new world, `stopAudio` on unmount. No other screen makes a sound.
 */

import { updateAmbience } from '@/audio/ambience.ts'
import { activate, deactivate, runningGraph } from '@/audio/engine.ts'
import { resetMeter, updateMeter } from '@/audio/meter.ts'
import type { World } from '@/core/types.ts'

export { AUDIO_DEFAULTS, setVolume, type Bus } from '@/audio/engine.ts'
export { pushAudioEvents } from '@/audio/events.ts'

export function startAudio(): void {
	activate()
}

export function stopAudio(): void {
	resetMeter()
	deactivate()
}

/** A new world: the meter's layer starts from silence, not from the last night's tension. */
export function resetAudio(): void {
	resetMeter()
}

/** Once a frame, paused or not: the room keeps going, and the meter's layer follows the meter. */
export function updateAudio(world: World | null): void {
	const graph = runningGraph()
	if (graph === null) {
		return
	}
	updateAmbience(graph)
	updateMeter(graph, world)
}
