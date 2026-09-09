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

import { getEnemyDef, getTowerDef } from '@/core/content/index.ts'
import { applyLateralOffset, samplePath } from '@/core/path.ts'
import { ENEMIES } from '@/core/content/enemies.ts'
import { barricadeHolding, isBarricade } from '@/core/systems/barricades.ts'
import type { Enemy, MapDef, World } from '@/core/types.ts'
import { blitGlyph, preload } from '@/render/glyphCache.ts'
import { drawHpBar } from '@/render/hpBar.ts'
import {
	CHEW_DEBRIS,
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

/**
 * The chew, and the queue it happens in.
 *
 * An enemy is held at `boxDistance - 0.5`, so a whole queue comes to rest at **the same arc
 * distance** and every glyph in it lands on the same point -- correct simulation, and a picture in
 * which forty ants are one ant. The separation is therefore drawn and never simulated: an enemy's
 * position stays a pure function of `distance` in `core/`, and there is no separation anywhere in this
 * codebase (DECISIONS.md section 3).
 *
 * The lane and the row come from the order the frame met them, so the queue re-packs when one dies --
 * which is what a queue does. The lunge is aged in frames like every other treatment here.
 */
const CHEW_LANES = 3
const CHEW_LANE_GAP_TILES = 0.3
const CHEW_ROW_GAP_TILES = 0.32
const CHEW_LUNGE_TILES = 0.1
/** Radians per frame of the lunge. ~2.5 bites a second: a chew, not a vibration. */
const CHEW_LUNGE_PER_FRAME = 0.26

/** Cardboard coming off the box. Two per enemy, so a queue of forty is a haze and not a blizzard. */
const CHEW_SPECKS = 2
const CHEW_SPECK_RADIUS_PX = 1.5
const CHEW_SPECK_REACH_TILES = 0.34
const CHEW_SPECK_PER_FRAME = 0.03

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
	/**
	 * Held at a barricade and eating it. Read off `barricadeHolding` while this pool is filled, and
	 * deliberately not an event: an event per held enemy per tick is forty entries a tick in
	 * `world.events`, which the HUD also drains, and events are for what a consumer must not miss
	 * rather than for a state it can read (step 10C, decision 6).
	 */
	chewing: boolean
	/** The path's direction where this enemy stands. Only meaningful while `chewing`. */
	dirX: number
	dirY: number
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
		chewing: false,
		dirX: 1,
		dirY: 0,
	}
	frames.push(created)
	return created
}

/**
 * Whether asking `barricadeHolding` per enemy is worth it at all this frame.
 *
 * `barricadeAhead` builds its list of boxes per call, so a board with no barricade on it would pay an
 * array per enemy per frame for an answer that is always null -- exactly the allocation
 * ARCHITECTURE.md section 6 rules out on this layer. With a box down it is one short array per enemy,
 * bounded by the number of boxes and not by the crowd.
 */
function anyBarricade(world: World): boolean {
	return world.towers.some(tower => isBarricade(getTowerDef(tower.defId)))
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

/** How far into its bite this enemy is, 0 to 1. Frames, so it does not treble its rate at 3x speed. */
function lungePhase(entry: EnemyFrame): number {
	return 0.5 + 0.5 * Math.sin(ageFrames * CHEW_LUNGE_PER_FRAME + entry.x + entry.y)
}

/**
 * Cardboard coming off the box: two specks per chewing enemy, thrown forward and falling.
 *
 * Batched the way the four status passes are -- one `beginPath`, many `arc`s, one `fill` -- because
 * the whole point of this treatment is the frame where forty of them are eating at once.
 */
function drawChew(ctx: CanvasRenderingContext2D, count: number, tilePx: number): void {
	const reach = CHEW_SPECK_REACH_TILES * tilePx
	let any = false

	ctx.fillStyle = CHEW_DEBRIS
	ctx.beginPath()
	for (let i = 0; i < count; i++) {
		const entry = frames[i]
		if (entry === undefined || !entry.chewing) {
			continue
		}
		any = true
		const phase = entry.x + entry.y
		for (let speck = 0; speck < CHEW_SPECKS; speck++) {
			const t = (ageFrames * CHEW_SPECK_PER_FRAME + phase + speck / CHEW_SPECKS) % 1
			const x = entry.x + entry.dirX * reach * t
			// Falling as it goes, so it reads as a piece coming off rather than as a moving dot.
			const y = entry.y + entry.dirY * reach * t + reach * t * t * 0.6
			const size = CHEW_SPECK_RADIUS_PX * (1 - t * 0.5)
			ctx.moveTo(x + size, y)
			ctx.arc(x, y, size, 0, Math.PI * 2)
		}
	}

	if (any) {
		ctx.fill()
	}
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

	const barricades = anyBarricade(world)
	// How many enemies this frame has already placed in a queue. One box is the v1 case, and a second
	// one on the same lane simply continues the rows -- which is what a second queue looks like anyway.
	let chewIndex = 0

	for (const enemy of world.enemies) {
		const path = pathFor(world.map, enemy.pathId)
		if (path === null) {
			continue
		}
		const at = samplePath(path, enemy.distance)
		// Through the same helper `enemyPosition` uses, never a second copy of the trig: a moth drawn
		// on the track while every tower shoots it three tiles off it fails nothing and reads as a
		// targeting bug. The sample itself is kept -- the angle below is what mirrors the glyph.
		const displaced = applyLateralOffset(at, enemy.lateralOffsetTiles)
		const entry = frameAt(liveCount)
		entry.x = (displaced.x + 0.5) * tilePx
		entry.y = (displaced.y + 0.5) * tilePx
		entry.glyph = glyphFor(enemy)
		entry.mirrored = Math.cos(at.angle) < 0
		entry.hp = enemy.hp
		entry.maxHp = enemy.maxHp
		entry.dirX = Math.cos(at.angle)
		entry.dirY = Math.sin(at.angle)
		entry.chewing = barricades && barricadeHolding(world, enemy) !== null
		readStatuses(entry, enemy)

		if (entry.chewing) {
			// Rows of three behind the box, across the track and back down it, so a queue can be
			// counted. Drawn only -- `enemy.distance` is untouched.
			const lane = (chewIndex % CHEW_LANES) - (CHEW_LANES - 1) / 2
			const row = Math.floor(chewIndex / CHEW_LANES)
			chewIndex++
			const back = row * CHEW_ROW_GAP_TILES * tilePx
			const across = lane * CHEW_LANE_GAP_TILES * tilePx
			entry.x += -entry.dirX * back - entry.dirY * across
			entry.y += -entry.dirY * back + entry.dirX * across
		}

		liveCount++
	}

	drawSlow(ctx, liveCount, tilePx)

	const size = tilePx * ENEMY_SCALE
	const lunge = CHEW_LUNGE_TILES * tilePx
	for (let i = 0; i < liveCount; i++) {
		const entry = frames[i]
		if (entry === undefined) {
			continue
		}
		// The lunge moves the glyph and not the frame: the bar and the treatments stay where the enemy
		// is, so a queue reads as biting rather than as forty ants wobbling.
		const bite = entry.chewing ? lungePhase(entry) * lunge : 0
		blitGlyph(ctx, dpr, entry.glyph, size, entry.x + entry.dirX * bite, entry.y + entry.dirY * bite, entry.mirrored)
		drawHpBar(ctx, entry.x, entry.y - size / 2, tilePx * HP_BAR_WIDTH_SCALE, entry.hp, entry.maxHp)
	}

	drawChew(ctx, liveCount, tilePx)
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
