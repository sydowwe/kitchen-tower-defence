/**
 * The single requestAnimationFrame in the app. Nothing else may start one -- `@vueuse/core`'s
 * `useRafFn` is banned in eslint.config.js for exactly this reason.
 *
 * The accumulator pattern is the one in analytic-docs/ARCHITECTURE.md section 2. This file lives
 * outside `core/` on purpose: it is the only place allowed to read the wall clock, and it converts
 * milliseconds into whole ticks so that `core/` never sees either.
 */

/** Seconds of simulated time per tick. Durations in `core/` are counts of these, never ms. */
export const TICK = 1 / 60

export const TICK_MS = 1000 / 60

/** A tabbed-out window comes back with a huge delta. Clamp it instead of spiralling. */
export const MAX_FRAME_MS = 250

/** Ceiling on catch-up steps per frame, so a slow machine drops simulated time instead of locking. */
export const MAX_CATCHUP = 5

/**
 * Ticks run per catch-up step. A speed multiplier runs the simulation *more times*; it never
 * scales `dt`, which would rebalance the game at every speed (ARCHITECTURE.md section 2).
 */
export type Speed = 0 | 1 | 2 | 3

export interface LoopCallbacks {
	/** One fixed simulation step. */
	tick(): void
	/** Draw the current state. Called once per frame regardless of how many ticks ran. */
	draw(): void
	/** Publish the HUD snapshot. Called every 4th frame, so ~15Hz (ARCHITECTURE.md section 5). */
	publish(): void
}

export interface Loop {
	/** Frames elapsed since the loop was created. */
	readonly frameCount: number
	/** Simulation ticks run since the loop was created. */
	readonly tickCount: number
	/** Simulated seconds: `tickCount * TICK`. Not wall-clock time. */
	readonly simSeconds: number
	/** Smoothed frames per second, from the wall clock. Display only. */
	readonly fps: number
	readonly speed: Speed
	readonly paused: boolean
	start(): void
	stop(): void
	pause(): void
	resume(): void
	togglePause(): void
	setSpeed(n: Speed): void
	/**
	 * Runs one frame for the given wall-clock timestamp and returns how many ticks it ran.
	 * `start()` calls this from rAF; tests call it directly, which is why it is public.
	 */
	advance(now: number): number
	/** Discards the accumulator and re-bases the clock. Called on start and after a stop. */
	reset(now: number): void
}

const FPS_SMOOTHING = 0.1

/**
 * TICK_MS is not representable exactly, so an accumulator that has had it added and subtracted a
 * few hundred times lands a fraction of a nanosecond short of the next tick. Without this slack the
 * loop drops roughly one tick per second -- invisible on screen, fatal to a replay.
 */
const EPSILON_MS = 1e-9

export function createLoop(callbacks: LoopCallbacks): Loop {
	let accumulator = 0
	let last = 0
	let frameCount = 0
	let tickCount = 0
	let fps = 0
	let speed: Speed = 1
	let paused = false
	let rafHandle: number | null = null

	function advance(now: number): number {
		const elapsed = Math.min(Math.max(now - last, 0), MAX_FRAME_MS)
		last = now
		accumulator += elapsed

		if (elapsed > 0) {
			const instant = 1000 / elapsed
			fps = fps === 0 ? instant : fps + (instant - fps) * FPS_SMOOTHING
		}

		const ticksPerStep = paused ? 0 : speed
		// Paused (or speed 0) means time does not pass, rather than piling up to be caught up on
		// resume. A minute on the pause screen must not become a minute of fast-forward.
		if (ticksPerStep === 0) {
			accumulator = 0
		}

		let steps = 0
		let ticksRun = 0
		while (accumulator + EPSILON_MS >= TICK_MS && steps < MAX_CATCHUP) {
			for (let i = 0; i < ticksPerStep; i++) {
				callbacks.tick()
				ticksRun++
			}
			accumulator -= TICK_MS
			steps++
		}

		// Hitting the ceiling means the frame was too slow to keep up. Drop the backlog rather than
		// carrying it: keeping it guarantees the next frame is over budget too, and so on.
		if (steps === MAX_CATCHUP && accumulator > TICK_MS) {
			accumulator = 0
		}

		tickCount += ticksRun
		frameCount++
		callbacks.draw()
		if (frameCount % 4 === 0) {
			callbacks.publish()
		}
		return ticksRun
	}

	function reset(now: number): void {
		last = now
		accumulator = 0
	}

	function frame(now: number): void {
		advance(now)
		rafHandle = requestAnimationFrame(frame)
	}

	function start(): void {
		if (rafHandle !== null) {
			return
		}
		reset(performance.now())
		rafHandle = requestAnimationFrame(frame)
	}

	function stop(): void {
		if (rafHandle === null) {
			return
		}
		cancelAnimationFrame(rafHandle)
		rafHandle = null
	}

	function pause(): void {
		paused = true
	}

	function resume(): void {
		paused = false
	}

	function togglePause(): void {
		paused = !paused
	}

	function setSpeed(n: Speed): void {
		speed = n
	}

	return {
		get frameCount() {
			return frameCount
		},
		get tickCount() {
			return tickCount
		},
		get simSeconds() {
			return tickCount * TICK
		},
		get fps() {
			return fps
		},
		get speed() {
			return speed
		},
		get paused() {
			return paused
		},
		start,
		stop,
		pause,
		resume,
		togglePause,
		setSpeed,
		advance,
		reset,
	}
}
