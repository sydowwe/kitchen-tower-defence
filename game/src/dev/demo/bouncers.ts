import { TICK } from '@/loop.ts'
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, preload, type Renderer } from '@/render/index.ts'

/**
 * Four hundred emoji bouncing off the walls: the load test that proves the loop, the glyph cache
 * and the canvas hold 60fps before a single line of game logic exists.
 *
 * It lives in `dev/` because it is not the game -- `Math.random` and mutable state with no seed
 * would be a determinism violation anywhere under `core/`. Step 5 replaces it with real enemies on
 * a real track, and this file goes away.
 */

const KITCHEN_GLYPHS = ['🐜', '🪳', '🦟', '🐁', '🕷️', '🧂', '🕯️', '🍯', '🧀', '🍞'] as const

const SIZE_PX = 24

/** Logical units per second. Fast enough that a 3x speed-up is unmistakable. */
const MIN_SPEED = 60
const MAX_SPEED = 220

export interface Bouncer {
	emoji: string
	x: number
	y: number
	vx: number
	vy: number
}

function randomBetween(min: number, max: number): number {
	return min + Math.random() * (max - min)
}

function randomVelocity(): number {
	const magnitude = randomBetween(MIN_SPEED, MAX_SPEED)
	return Math.random() < 0.5 ? -magnitude : magnitude
}

export function createBouncers(count: number): Bouncer[] {
	preload(KITCHEN_GLYPHS.map(emoji => ({ emoji, sizePx: SIZE_PX })))

	const bouncers: Bouncer[] = []
	for (let i = 0; i < count; i++) {
		bouncers.push({
			emoji: KITCHEN_GLYPHS[i % KITCHEN_GLYPHS.length] ?? '🐜',
			x: randomBetween(SIZE_PX, LOGICAL_WIDTH - SIZE_PX),
			y: randomBetween(SIZE_PX, LOGICAL_HEIGHT - SIZE_PX),
			vx: randomVelocity(),
			vy: randomVelocity(),
		})
	}
	return bouncers
}

/**
 * One fixed step. Note the absence of a `dt` parameter: the step is always `TICK`, and a speed
 * multiplier means this runs more often -- never that the step gets bigger.
 */
export function updateBouncers(bouncers: readonly Bouncer[]): void {
	const half = SIZE_PX / 2
	for (const bouncer of bouncers) {
		bouncer.x += bouncer.vx * TICK
		bouncer.y += bouncer.vy * TICK

		if (bouncer.x < half) {
			bouncer.x = half
			bouncer.vx = Math.abs(bouncer.vx)
		} else if (bouncer.x > LOGICAL_WIDTH - half) {
			bouncer.x = LOGICAL_WIDTH - half
			bouncer.vx = -Math.abs(bouncer.vx)
		}

		if (bouncer.y < half) {
			bouncer.y = half
			bouncer.vy = Math.abs(bouncer.vy)
		} else if (bouncer.y > LOGICAL_HEIGHT - half) {
			bouncer.y = LOGICAL_HEIGHT - half
			bouncer.vy = -Math.abs(bouncer.vy)
		}
	}
}

export function drawBouncers(bouncers: readonly Bouncer[], renderer: Renderer): void {
	for (const bouncer of bouncers) {
		renderer.drawGlyph(bouncer.emoji, SIZE_PX, bouncer.x, bouncer.y)
	}
}
