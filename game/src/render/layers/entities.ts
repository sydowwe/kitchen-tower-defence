/**
 * The per-frame layer: everything that moves, blitted from the glyph cache.
 *
 * This is the only layer in this file set that runs 60 times a second, so it does exactly one thing
 * per entity -- sample the path, blit a cached bitmap -- and nothing else. No `fillText`, no
 * gradients, no allocation (analytic-docs/ARCHITECTURE.md section 6).
 *
 * Enemies are mirrored, never rotated: the roster is drawn side-on, and a rotated bug on the
 * Counter's vertical runs reads as a dead one (step 5C, decision 3).
 *
 * **The status treatments age in frames, in module-local state** -- the same rule `effects.ts` is
 * built on, for the same reason. At 3x speed three ticks run between two frames, so a flicker aged in
 * `world.tick` triples its rate and reads as a strobe, which fails the one thing the treatments exist
 * for (step 9C, decision 1). `render/` reads core state and never writes it.
 */

import { getEnemyDef } from '@/core/content/index.ts'
import { samplePath } from '@/core/path.ts'
import { ENEMIES } from '@/core/content/enemies.ts'
import type { Enemy, MapDef, World } from '@/core/types.ts'
import { blitGlyph, preload } from '@/render/glyphCache.ts'
import {
	HP_BAR_BACK,
	HP_BAR_FILL,
	STATUS_BURN_FLAME,
	STATUS_POISON_BUBBLE,
	STATUS_ROOTED_SHIMMER,
	STATUS_SLOW_DISC,
	STATUS_SLOW_SPECK,
} from '@/render/palette.ts'

/** An enemy is drawn a little under its tile, so a queue of them on the track stays countable. */
const ENEMY_SCALE = 0.7

/** The bar is a touch wider than the glyph, so a full one is visibly full rather than ambiguous. */
const HP_BAR_WIDTH_SCALE = 0.8
const HP_BAR_HEIGHT_PX = 3
/** Gap between the top of the glyph box and the bar, in logical pixels. */
const HP_BAR_GAP_PX = 2

/** Slow: a disc a little wider than the glyph, so it reads as standing in something cold. */
const SLOW_DISC_TILES = 0.42
const SLOW_SPECKS = 3
const SLOW_SPECK_RADIUS_PX = 1.7
const SLOW_SPECK_ORBIT_TILES = 0.36
/** Radians per frame the specks turn. Slow enough to read as drifting rather than spinning. */
const SLOW_SPIN_PER_FRAME = 0.035

/** Burn: one blob over the head whose size is the flicker. Stacks widen it; they do not add blobs. */
const BURN_RADIUS_TILES = 0.11
const BURN_STACK_GROWTH = 0.18
const BURN_GAP_TILES = 0.06
/** Radians per frame of the flicker. Fast enough to read as fire, slow enough not to strobe. */
const BURN_FLICKER_PER_FRAME = 0.42

/** Poison: bubbles leaving the glyph and rising. Three is a stream; more is a cloud. */
const POISON_BUBBLES = 3
const POISON_BUBBLE_RADIUS_TILES = 0.055
const POISON_RISE_TILES = 0.55
const POISON_WOBBLE_TILES = 0.1
/** Fraction of the rise covered per frame. ~1.1s for one bubble to make the trip. */
const POISON_RISE_PER_FRAME = 0.015

/** Rooted: a ring at the feet that breathes. Stroked, so it never fights the slow disc's fill. */
const ROOTED_RADIUS_TILES = 0.34
const ROOTED_FOOT_OFFSET_TILES = 0.26
const ROOTED_LINE_WIDTH_PX = 2
const ROOTED_SHIMMER_PER_FRAME = 0.16

/**
 * One enemy's frame, kept so the layer can draw in treatment order without sampling a path twice.
 *
 * The slow disc goes **under** the glyph and the flicker over it, which needs three passes over the
 * same positions. Re-walking `world.enemies` for each would re-run `samplePath` three times per
 * enemy per frame; this pool is filled once and reused every frame, so it allocates only when the
 * board grows past its high-water mark.
 */
interface EnemyFrame {
	x: number
	y: number
	glyph: string
	mirrored: boolean
	hp: number
	maxHp: number
	/** Freeze reuses the slow treatment at full strength: both read as "cold and stopped". */
	slow: boolean
	/** Stack counts, not booleans -- three burns are a bigger flame than one. */
	burn: number
	poison: number
	rooted: boolean
}

const frames: EnemyFrame[] = []
/** How many of `frames` this frame filled. The pool is longer whenever the board has shrunk. */
let liveCount = 0

/** Ages with the display, never with the simulation. See the file header. */
let ageFrames = 0

/** Every enemy has a glyph on its def, so this cannot fail for a def the world could spawn. */
function glyphFor(enemy: Enemy): string {
	return getEnemyDef(enemy.defId).glyph
}

function pathFor(map: MapDef, pathId: string) {
	return map.paths.find(path => path.id === pathId) ?? null
}

/** Reuses the entry at `index`, or grows the pool by one. The only allocation in the file. */
function frameAt(index: number): EnemyFrame {
	const existing = frames[index]
	if (existing !== undefined) {
		return existing
	}
	const created: EnemyFrame = {
		x: 0,
		y: 0,
		glyph: '',
		mirrored: false,
		hp: 0,
		maxHp: 0,
		slow: false,
		burn: 0,
		poison: 0,
		rooted: false,
	}
	frames.push(created)
	return created
}

/** Reads `enemy.statuses` onto the frame. Every field is written, so a reused entry cannot be stale. */
function readStatuses(entry: EnemyFrame, enemy: Enemy): void {
	entry.slow = false
	entry.burn = 0
	entry.poison = 0
	entry.rooted = false

	for (const status of enemy.statuses) {
		if (status.kind === 'slow' || status.kind === 'freeze') {
			entry.slow = true
		} else if (status.kind === 'burn') {
			entry.burn = status.stacks
		} else if (status.kind === 'poison') {
			entry.poison = status.stacks
		} else if (status.kind === 'rooted') {
			entry.rooted = true
		}
	}
}

/**
 * A thin two-tone bar above a damaged enemy. Never text, and never drawn at full health -- a board
 * of sixty ants each wearing a full bar is a board you cannot read.
 */
function drawHealthBar(ctx: CanvasRenderingContext2D, entry: EnemyFrame, tilePx: number): void {
	if (entry.hp >= entry.maxHp || entry.maxHp <= 0) {
		return
	}

	const width = tilePx * HP_BAR_WIDTH_SCALE
	const left = entry.x - width / 2
	const top = entry.y - (tilePx * ENEMY_SCALE) / 2 - HP_BAR_GAP_PX - HP_BAR_HEIGHT_PX
	const fraction = Math.min(Math.max(entry.hp / entry.maxHp, 0), 1)

	ctx.fillStyle = HP_BAR_BACK
	ctx.fillRect(left, top, width, HP_BAR_HEIGHT_PX)
	ctx.fillStyle = HP_BAR_FILL
	ctx.fillRect(left, top, width * fraction, HP_BAR_HEIGHT_PX)
}

/**
 * The cold half, drawn before the glyphs so the disc sits under them.
 *
 * Batched the way `drawSpecks` batches: one `beginPath`, many `arc`s, one `fill`. A path per enemy is
 * what turns forty afflicted ants into a frame budget problem.
 */
function drawSlow(ctx: CanvasRenderingContext2D, count: number, tilePx: number): void {
	const radius = SLOW_DISC_TILES * tilePx
	let any = false

	ctx.fillStyle = STATUS_SLOW_DISC
	ctx.beginPath()
	for (let i = 0; i < count; i++) {
		const entry = frames[i]
		if (entry === undefined || !entry.slow) {
			continue
		}
		any = true
		ctx.moveTo(entry.x + radius, entry.y)
		ctx.arc(entry.x, entry.y, radius, 0, Math.PI * 2)
	}
	ctx.fill()

	if (!any) {
		return
	}

	const orbit = SLOW_SPECK_ORBIT_TILES * tilePx
	ctx.fillStyle = STATUS_SLOW_SPECK
	ctx.beginPath()
	for (let i = 0; i < count; i++) {
		const entry = frames[i]
		if (entry === undefined || !entry.slow) {
			continue
		}
		// Offset by the enemy's own position, so a column of slowed ants does not turn in lockstep.
		const phase = ageFrames * SLOW_SPIN_PER_FRAME + entry.x + entry.y
		for (let speck = 0; speck < SLOW_SPECKS; speck++) {
			const angle = phase + (speck / SLOW_SPECKS) * Math.PI * 2
			const x = entry.x + Math.cos(angle) * orbit
			const y = entry.y + Math.sin(angle) * orbit * 0.7
			ctx.moveTo(x + SLOW_SPECK_RADIUS_PX, y)
			ctx.arc(x, y, SLOW_SPECK_RADIUS_PX, 0, Math.PI * 2)
		}
	}
	ctx.fill()
}

/** The flicker over the head. Size carries both the flicker and the stack count; alpha is per pass. */
function drawBurn(ctx: CanvasRenderingContext2D, count: number, tilePx: number): void {
	const head = (tilePx * ENEMY_SCALE) / 2 + BURN_GAP_TILES * tilePx

	ctx.fillStyle = STATUS_BURN_FLAME
	ctx.beginPath()
	for (let i = 0; i < count; i++) {
		const entry = frames[i]
		if (entry === undefined || entry.burn <= 0) {
			continue
		}
		const phase = ageFrames * BURN_FLICKER_PER_FRAME + entry.x + entry.y
		const pulse = 0.7 + 0.3 * Math.sin(phase)
		const radius = BURN_RADIUS_TILES * tilePx * pulse * (1 + BURN_STACK_GROWTH * (entry.burn - 1))
		const y = entry.y - head - radius
		ctx.moveTo(entry.x + radius, y)
		ctx.arc(entry.x, y, radius, 0, Math.PI * 2)
	}
	ctx.fill()
}

/** Bubbles leaving the glyph and rising, one stream per enemy however many stacks it carries. */
function drawPoison(ctx: CanvasRenderingContext2D, count: number, tilePx: number): void {
	const rise = POISON_RISE_TILES * tilePx
	const wobble = POISON_WOBBLE_TILES * tilePx
	const radius = POISON_BUBBLE_RADIUS_TILES * tilePx

	ctx.fillStyle = STATUS_POISON_BUBBLE
	ctx.beginPath()
	for (let i = 0; i < count; i++) {
		const entry = frames[i]
		if (entry === undefined || entry.poison <= 0) {
			continue
		}
		const phase = entry.x + entry.y
		for (let bubble = 0; bubble < POISON_BUBBLES; bubble++) {
			// Evenly spaced along one trip, so the three read as a stream rather than as a burst.
			const t = (ageFrames * POISON_RISE_PER_FRAME + phase + bubble / POISON_BUBBLES) % 1
			const x = entry.x + Math.sin(phase + t * 6) * wobble
			const y = entry.y - t * rise
			// Shrinking as it climbs is what makes it a bubble and not a rising dot.
			const size = radius * (1.1 - t * 0.6)
			ctx.moveTo(x + size, y)
			ctx.arc(x, y, size, 0, Math.PI * 2)
		}
	}
	ctx.fill()
}

/** The ring at the feet. Stroked rather than filled, so it never competes with the slow disc. */
function drawRooted(ctx: CanvasRenderingContext2D, count: number, tilePx: number): void {
	const radius = ROOTED_RADIUS_TILES * tilePx
	const foot = ROOTED_FOOT_OFFSET_TILES * tilePx

	ctx.strokeStyle = STATUS_ROOTED_SHIMMER
	ctx.lineWidth = ROOTED_LINE_WIDTH_PX
	ctx.beginPath()
	for (let i = 0; i < count; i++) {
		const entry = frames[i]
		if (entry === undefined || !entry.rooted) {
			continue
		}
		const phase = ageFrames * ROOTED_SHIMMER_PER_FRAME + entry.x + entry.y
		const size = radius * (0.88 + 0.12 * Math.sin(phase))
		const y = entry.y + foot
		ctx.moveTo(entry.x + size, y)
		ctx.arc(entry.x, y, size, 0, Math.PI * 2)
	}
	ctx.stroke()
}

export function drawEntities(ctx: CanvasRenderingContext2D, world: World | null, tilePx: number, dpr: number): void {
	if (world === null) {
		return
	}

	ageFrames++
	liveCount = 0

	for (const enemy of world.enemies) {
		const path = pathFor(world.map, enemy.pathId)
		if (path === null) {
			continue
		}
		const at = samplePath(path, enemy.distance)
		const entry = frameAt(liveCount)
		entry.x = (at.x + 0.5) * tilePx
		entry.y = (at.y + 0.5) * tilePx
		entry.glyph = glyphFor(enemy)
		entry.mirrored = Math.cos(at.angle) < 0
		entry.hp = enemy.hp
		entry.maxHp = enemy.maxHp
		readStatuses(entry, enemy)
		liveCount++
	}

	drawSlow(ctx, liveCount, tilePx)

	const size = tilePx * ENEMY_SCALE
	for (let i = 0; i < liveCount; i++) {
		const entry = frames[i]
		if (entry === undefined) {
			continue
		}
		blitGlyph(ctx, dpr, entry.glyph, size, entry.x, entry.y, entry.mirrored)
		drawHealthBar(ctx, entry, tilePx)
	}

	drawBurn(ctx, liveCount, tilePx)
	drawPoison(ctx, liveCount, tilePx)
	drawRooted(ctx, liveCount, tilePx)

	// Every pass above leaves the context as it found it. `globalAlpha` is never set here, and the one
	// line that would need restoring is the one this comment exists to stop being added silently:
	// leaving it set fades the projectiles, the theft animation and the whole overlay drawn after.
	ctx.globalAlpha = 1
}

/**
 * Rasterises the roster at the one size this layer blits it at.
 *
 * The cache key is `emoji|sizePx|dpr`, so preloading at any other size fills the cache with entries
 * nothing ever reads and still pays for the real ones on the first frame. `tilePx` is 0 until
 * `Renderer.setMap` has run -- call this after it, never before.
 */
export function preloadEnemyGlyphs(tilePx: number): void {
	preload(ENEMIES.map(def => ({ emoji: def.glyph, sizePx: tilePx * ENEMY_SCALE })))
}
