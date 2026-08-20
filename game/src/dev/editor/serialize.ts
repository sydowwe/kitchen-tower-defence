/**
 * The JSON on both sides of the editor: what a map looks like written out, and what comes back when
 * a human pastes one in.
 *
 * The editor never writes to disk (step 4A, decision 8). `toJson` produces the text 4B puts on the
 * clipboard or into a download; a human drops the file in `core/content/maps/` and adds one line to
 * `maps/index.ts`. A Vite plugin that wrote into the repo would be a build-time backdoor for a
 * five-second manual step.
 */

import { measurePolyline } from '@/dev/editor/document.ts'
import { ContentValidationError, validateContent } from '@/core/content/schema.ts'
import type { MapSource } from '@/core/content/schema.ts'
import type { Problem } from '@/dev/editor/validate.ts'
import type { Vec2 } from '@/core/types.ts'

/** Every map is 24 x 14 (step 4A, decision 6). The schema's 64-tile ceiling is not an invitation. */
const WIDTH_TILES = 24
const HEIGHT_TILES = 14

/** Coordinates are written to this many decimals. See `roundWaypoint`. */
const EXPORT_DECIMALS = 2

function round(value: number): number {
	const factor = 10 ** EXPORT_DECIMALS
	return Math.round(value * factor) / factor
}

/**
 * Rounding is applied **before** `lengthTiles` is recomputed, never after.
 *
 * Thirty waypoints each moving by up to 0.005 accumulate well past `loadMap`'s 0.01 tolerance, so
 * an export that rounds coordinates while keeping the pre-round length writes a file that throws at
 * boot. `lengthTiles` itself goes out at full precision -- the field is a tripwire, not something a
 * human reads (step 4A, decision 3).
 */
function roundWaypoint(waypoint: Vec2): Vec2 {
	return { x: round(waypoint.x), y: round(waypoint.y) }
}

function num(value: number): string {
	return JSON.stringify(value)
}

function str(value: string): string {
	return JSON.stringify(value)
}

function vec(tile: Vec2): string {
	return `{ "x": ${num(tile.x)}, "y": ${num(tile.y)} }`
}

/**
 * Tabs, one waypoint per line, and the key order `counter.json` already uses (`id`, `widthTiles`,
 * `heightTiles`, `trackWidthTiles`, `tiles`, `paths`, `fridge`, `decor`) so a re-exported map
 * produces a readable diff rather than a whole-file rewrite.
 *
 * `decor` and `trackWidthTiles` are optional in the schema, and their absence is preserved rather
 * than materialised as `"decor": []`.
 */
export function toJson(source: MapSource): string {
	const lines: string[] = ['{']

	lines.push(`\t"id": ${str(source.id)},`)
	lines.push(`\t"widthTiles": ${num(source.widthTiles)},`)
	lines.push(`\t"heightTiles": ${num(source.heightTiles)},`)
	if (source.trackWidthTiles !== undefined) {
		lines.push(`\t"trackWidthTiles": ${num(source.trackWidthTiles)},`)
	}

	lines.push('\t"tiles": [')
	source.tiles.forEach((row, index) => {
		lines.push(`\t\t${str(row)}${index === source.tiles.length - 1 ? '' : ','}`)
	})
	lines.push('\t],')

	lines.push('\t"paths": [')
	source.paths.forEach((path, index) => {
		const waypoints = path.waypoints.map(roundWaypoint)

		lines.push('\t\t{')
		lines.push(`\t\t\t"id": ${str(path.id)},`)
		lines.push('\t\t\t"waypoints": [')
		waypoints.forEach((waypoint, w) => {
			lines.push(`\t\t\t\t${vec(waypoint)}${w === waypoints.length - 1 ? '' : ','}`)
		})
		lines.push('\t\t\t],')
		lines.push(`\t\t\t"lengthTiles": ${num(measurePolyline(waypoints))}`)
		lines.push(`\t\t}${index === source.paths.length - 1 ? '' : ','}`)
	})
	lines.push('\t],')

	const decor = source.decor
	const fridgeSuffix = decor === undefined ? '' : ','
	lines.push(
		`\t"fridge": { "tile": ${vec(source.fridge.tile)}, "glyph": ${str(source.fridge.glyph)} }${fridgeSuffix}`,
	)

	if (decor !== undefined) {
		lines.push('\t"decor": [')
		decor.forEach((entry, index) => {
			lines.push(
				`\t\t{ "glyph": ${str(entry.glyph)}, "tile": ${vec(entry.tile)} }${index === decor.length - 1 ? '' : ','}`,
			)
		})
		lines.push('\t]')
	}

	lines.push('}')

	return `${lines.join('\n')}\n`
}

/**
 * A pasted or dropped map, gated by `core/content/schema.ts` rather than by a second schema here
 * (step 4A, decision 4). It already formats one line per problem with the field path, and a second
 * definition of a valid map is exactly the drift the schema file's header warns about.
 *
 * Importing it from `dev/` is safe: the editor route is behind `import.meta.env.DEV`, so this lives
 * in a chunk a production build never emits.
 */
export function fromJson(text: string): { source: MapSource } | { problems: Problem[] } {
	let parsed: unknown
	try {
		parsed = JSON.parse(text)
	} catch (cause) {
		return { problems: [{ severity: 'error', message: `not valid JSON: ${(cause as Error).message}` }] }
	}

	try {
		const content = validateContent({ maps: [parsed] })
		const source = content.maps[0]
		if (source === undefined) {
			return { problems: [{ severity: 'error', message: 'no map in the pasted JSON' }] }
		}
		return { source }
	} catch (cause) {
		if (cause instanceof ContentValidationError) {
			return { problems: cause.problems.map(message => ({ severity: 'error', message })) }
		}
		throw cause
	}
}

/**
 * What 4B's "new map" button starts from, and what the under-ten-minutes acceptance is measured
 * against: a bordered 24 x 14 floor, one straight lane to the fridge, no decor.
 *
 * It is deliberately not warning-free -- a single 21-tile segment is a straight corridor, which is
 * the validator telling the author what to do first.
 */
export function emptyMap(id: string): MapSource {
	const border = '#'.repeat(WIDTH_TILES)
	const floor = `#${'.'.repeat(WIDTH_TILES - 2)}#`
	const tiles = [border, ...Array.from({ length: HEIGHT_TILES - 2 }, () => floor), border]

	const waypoints: Vec2[] = [
		{ x: 1, y: 7 },
		{ x: WIDTH_TILES - 2, y: 7 },
	]

	return {
		id,
		widthTiles: WIDTH_TILES,
		heightTiles: HEIGHT_TILES,
		tiles,
		paths: [{ id: 'lane', waypoints, lengthTiles: measurePolyline(waypoints) }],
		fridge: { tile: { x: WIDTH_TILES - 2, y: 7 }, glyph: '🗄️' },
	}
}
