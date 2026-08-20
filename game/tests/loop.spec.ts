import { describe, expect, it } from 'vitest'
import { createLoop, MAX_CATCHUP, TICK, TICK_MS, type Speed } from '@/loop.ts'

/**
 * The loop is the one piece of scaffolding with a rule that can silently break: a speed multiplier
 * must run *more ticks*, never a bigger step. If that ever regresses, every duration in the game is
 * balanced differently at each speed and nothing else fails loudly.
 */

interface Harness {
	readonly ticks: number
	readonly draws: number
	readonly publishes: number
	/** Wall-clock frames handed to the loop so far. Frame n happens at n * TICK_MS. */
	elapsedFrames: number
	loop: ReturnType<typeof createLoop>
}

function harness(speed: Speed): Harness {
	const counts = { ticks: 0, draws: 0, publishes: 0 }
	const loop = createLoop({
		tick() {
			counts.ticks++
		},
		draw() {
			counts.draws++
		},
		publish() {
			counts.publishes++
		},
	})
	loop.setSpeed(speed)
	loop.reset(0)
	return {
		get ticks() {
			return counts.ticks
		},
		get draws() {
			return counts.draws
		},
		get publishes() {
			return counts.publishes
		},
		elapsedFrames: 0,
		loop,
	}
}

/** Runs `frames` rAF frames, each exactly one tick of wall-clock time apart. */
function runFrames(h: Harness, frames: number): void {
	for (let frame = 0; frame < frames; frame++) {
		h.elapsedFrames++
		h.loop.advance(h.elapsedFrames * TICK_MS)
	}
}

describe('loop', () => {
	it('runs exactly one tick per elapsed tick of wall clock at 1x', () => {
		const h = harness(1)
		runFrames(h, 60)
		expect(h.ticks).toBe(60)
		expect(h.loop.tickCount).toBe(60)
	})

	it('multiplies ticks, not the step, at 2x and 3x', () => {
		for (const speed of [2, 3] as const) {
			const h = harness(speed)
			runFrames(h, 60)
			expect(h.ticks).toBe(60 * speed)
			expect(h.loop.simSeconds).toBeCloseTo(60 * speed * TICK)
		}
	})

	it('runs no ticks at speed 0 or while paused, but keeps drawing', () => {
		const stopped = harness(0)
		runFrames(stopped, 30)
		expect(stopped.ticks).toBe(0)
		expect(stopped.draws).toBe(30)

		const paused = harness(3)
		paused.loop.pause()
		runFrames(paused, 30)
		expect(paused.ticks).toBe(0)

		// And the paused frames are not owed back: resuming runs one tick per frame from here,
		// it does not fast-forward through the pause.
		paused.loop.resume()
		runFrames(paused, 60)
		expect(paused.ticks).toBe(60 * 3)
	})

	it('caps catch-up so a stalled frame cannot spiral', () => {
		const h = harness(1)
		// One frame that swallowed a whole second: clamped to 250ms, then capped at MAX_CATCHUP.
		h.loop.advance(1000)
		expect(h.ticks).toBe(MAX_CATCHUP)

		// And the backlog is dropped, so the next frame is back to one tick.
		h.loop.advance(1000 + TICK_MS)
		expect(h.ticks).toBe(MAX_CATCHUP + 1)
	})

	it('accumulates fractional frame time instead of dropping it', () => {
		const h = harness(1)
		// 10ms frames: three of them are less than two ticks, four are more.
		for (let frame = 1; frame <= 6; frame++) {
			h.loop.advance(frame * 10)
		}
		expect(h.ticks).toBe(Math.floor(60 / TICK_MS))
	})

	it('publishes the HUD snapshot every fourth frame, ~15Hz', () => {
		const h = harness(1)
		runFrames(h, 60)
		expect(h.draws).toBe(60)
		expect(h.publishes).toBe(15)
	})
})
