/**
 * Authored map JSON in, runtime `MapDef` out.
 *
 * Two things are derived here rather than authored, and both are derived because the alternative is
 * two truths that can disagree:
 *
 * - **Track tiles come from the polyline**, never from a character in the grid
 *   (analytic-docs/DECISIONS.md section 3). A hand-painted track can drift from what the renderer
 *   draws and from what `path_only` placement allows; a derived one cannot.
 * - **`lengthTiles` is checked against the waypoints**, not trusted. It stays authored because
 *   sampling reads it every tick for every enemy, but a wrong value fails at load.
 *
 * Knows nothing about pixels. `loadMap` runs once per map at module load, so it is allowed to be
 * the slowest thing in `core/`.
 */

import type { MapSource } from '@/core/content/schema.ts'
import type { MapDef, Placement, Vec2 } from '@/core/types.ts'

/**
 * One tile's bits, row-major in `MapDef.flags`. A tile can carry several: the common case is a
 * buildable floor tile the track happens to cross, which is `BUILDABLE | TRACK` and takes a
 * barricade but not a salt shaker.
 *
 * Night modifiers flip these on the world's own copy -- "moving day" clears `BUILDABLE` from 30% of
 * the tiles, step 15's mold sets its own bit here.
 */
export const TileFlags = {
	/** The `.` character: a tower may stand here. */
	BUILDABLE: 1,
	/** The `#` character: counter edge, appliance, wall. Nothing goes here, ever. */
	BLOCKED: 2,
	/** The `~` character: floor that is drawn as scenery and cannot be built on. */
	DECOR: 4,
	/** Rasterised from the polyline by `loadMap`. Never authored. */
	TRACK: 8,
} as const

/** The characters `MapSource.tiles` may contain, and the flag each one sets. */
const CHAR_FLAGS: Record<string, number> = {
	'.': TileFlags.BUILDABLE,
	'#': TileFlags.BLOCKED,
	'~': TileFlags.DECOR,
}

/**
 * How finely a segment is walked when rasterising track. Stepping waypoint to waypoint misses every
 * tile in the middle of a long diagonal; a quarter-tile step cannot. It runs once per map at load.
 */
const RASTER_STEP_TILES = 0.25

/** `lengthTiles` may differ from the measured polyline by this much before `loadMap` throws. */
const LENGTH_TOLERANCE_TILES = 0.01

/** Authored maps default to a one-tile-wide track. Wide kitchen floors override it. */
const DEFAULT_TRACK_WIDTH_TILES = 1

function tileIndex(map: Pick<MapDef, 'widthTiles'>, x: number, y: number): number {
	return y * map.widthTiles + x
}

/** Bits at `tile`, or `0` for anything off the board -- which is what makes `canPlace` bounds-safe. */
export function flagsAt(map: MapDef, tile: Vec2): number {
	if (!Number.isInteger(tile.x) || !Number.isInteger(tile.y)) {
		return 0
	}
	if (tile.x < 0 || tile.x >= map.widthTiles || tile.y < 0 || tile.y >= map.heightTiles) {
		return 0
	}
	return map.flags[tileIndex(map, tile.x, tile.y)] ?? 0
}

/**
 * The one answer to "may this tower stand here". Step 4's editor and step 6's placement command
 * both call this rather than reading `flags` themselves -- two readers of a bitfield invent two
 * slightly different answers, and the editor's is the one that would let an unplaceable map ship.
 */
export function canPlace(map: MapDef, tile: Vec2, placement: Placement): boolean {
	const flags = flagsAt(map, tile)

	if ((flags & TileFlags.BLOCKED) !== 0) {
		return false
	}
	if (placement === 'path_only') {
		return (flags & TileFlags.TRACK) !== 0
	}
	return (flags & TileFlags.BUILDABLE) !== 0 && (flags & TileFlags.TRACK) === 0
}

/** Euclidean distance in tiles. Not "distance to the fridge" -- that one is along the track. */
function distanceBetween(a: Vec2, b: Vec2): number {
	return Math.hypot(b.x - a.x, b.y - a.y)
}

/** The measured length of a polyline, which is what `lengthTiles` is checked against. */
function measurePolyline(waypoints: readonly Vec2[]): number {
	let total = 0
	for (let i = 1; i < waypoints.length; i++) {
		const from = waypoints[i - 1]
		const to = waypoints[i]
		if (from === undefined || to === undefined) {
			continue
		}
		total += distanceBetween(from, to)
	}
	return total
}

/** The char grid, before any track is rasterised in. */
function flagsFromChars(source: MapSource): number[] {
	const flags: number[] = new Array<number>(source.widthTiles * source.heightTiles).fill(0)

	for (let y = 0; y < source.heightTiles; y++) {
		const row = source.tiles[y]
		if (row === undefined || row.length !== source.widthTiles) {
			throw new Error(`map '${source.id}': row ${y} is ${row?.length ?? 0} chars, expected ${source.widthTiles}`)
		}
		for (let x = 0; x < source.widthTiles; x++) {
			const char = row[x] ?? ''
			const bit = CHAR_FLAGS[char]
			if (bit === undefined) {
				throw new Error(`map '${source.id}': unknown tile char '${char}' at ${x},${y}; expected one of . # ~`)
			}
			flags[y * source.widthTiles + x] = bit
		}
	}

	return flags
}

/**
 * ORs `TRACK` into every tile a path passes over, walking each segment in steps of at most
 * `RASTER_STEP_TILES` and expanding each sample by half the track width.
 *
 * The expansion is a Chebyshev box rather than a circle: a half-width of 0.5 marks exactly the tile
 * under the sample, and marks both neighbours when the sample sits on the boundary between them,
 * which is the behaviour a diagonal needs.
 */
function rasteriseTrack(flags: number[], source: MapSource, halfWidth: number): void {
	function mark(x: number, y: number): void {
		if (x < 0 || x >= source.widthTiles || y < 0 || y >= source.heightTiles) {
			return
		}
		const index = y * source.widthTiles + x
		flags[index] = (flags[index] ?? 0) | TileFlags.TRACK
	}

	function markAround(sample: Vec2): void {
		for (let x = Math.ceil(sample.x - halfWidth); x <= Math.floor(sample.x + halfWidth); x++) {
			for (let y = Math.ceil(sample.y - halfWidth); y <= Math.floor(sample.y + halfWidth); y++) {
				mark(x, y)
			}
		}
	}

	for (const path of source.paths) {
		for (let i = 1; i < path.waypoints.length; i++) {
			const from = path.waypoints[i - 1]
			const to = path.waypoints[i]
			if (from === undefined || to === undefined) {
				continue
			}

			const steps = Math.max(1, Math.ceil(distanceBetween(from, to) / RASTER_STEP_TILES))
			for (let step = 0; step <= steps; step++) {
				const t = step / steps
				markAround({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t })
			}
		}
	}
}

/**
 * The authored JSON as the world will hold it. Throws with the map id -- and the path id where
 * there is one -- in the message, because in a production build zod is gone and this is the only
 * check left standing.
 */
export function loadMap(source: MapSource): MapDef {
	const flags = flagsFromChars(source)
	const trackWidthTiles = source.trackWidthTiles ?? DEFAULT_TRACK_WIDTH_TILES

	rasteriseTrack(flags, source, trackWidthTiles / 2)

	for (const path of source.paths) {
		const measured = measurePolyline(path.waypoints)
		if (Math.abs(measured - path.lengthTiles) > LENGTH_TOLERANCE_TILES) {
			throw new Error(
				`map '${source.id}': path '${path.id}' declares lengthTiles ${path.lengthTiles} ` +
					`but its waypoints measure ${measured.toFixed(4)}`,
			)
		}
	}

	return {
		id: source.id,
		widthTiles: source.widthTiles,
		heightTiles: source.heightTiles,
		paths: source.paths.map(path => ({
			id: path.id,
			waypoints: path.waypoints.map(waypoint => ({ x: waypoint.x, y: waypoint.y })),
			lengthTiles: path.lengthTiles,
		})),
		flags,
		fridge: { tile: { x: source.fridge.tile.x, y: source.fridge.tile.y }, glyph: source.fridge.glyph },
		decor: (source.decor ?? []).map(entry => ({ glyph: entry.glyph, tile: { x: entry.tile.x, y: entry.tile.y } })),
	}
}
