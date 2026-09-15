/**
 * The board's own state: which cells carry something, and every pure read and write over them.
 *
 * A sibling of `core/map.ts` and `core/path.ts` rather than a system, and split from
 * `core/systems/tiles.ts` on purpose: `core/systems/combat.ts` writes scorch through this file, and
 * the tick calls `applyDamage` back into combat. One file for both is an import cycle.
 *
 * **`world.tiles` is sparse** -- only the cells that have something, never a `cols x rows` array of
 * mostly nulls. Iterating it visits exactly the cells with live effects, so there is no separate
 * dirty set that can disagree with it, and a save carries five cells rather than 336 `null`s.
 *
 * Lookup is a linear scan with an early-out on an empty board. analytic-docs/ARCHITECTURE.md
 * section 6 budgets ~300 such cells against ~200 enemies and says to add a spatial structure "when
 * profiling says so, not before" -- the same standing ruling `queryEnemiesInRange` runs under. If a
 * later step measures this hot, the sanctioned fix is a `Record<number, TileState>` keyed row-major,
 * rebuilt at the top of the system each tick and **never stored on the world**.
 *
 * Knows nothing about pixels.
 */

import { TILE_EFFECT_DEFS } from '@/core/content/tileEffects.ts'
import type { MapDef, TileEffect, TileEffectKind, TileState, Vec2, World } from '@/core/types.ts'

/** What one write may say about itself beyond its kind. Both fall back to the def. */
export interface TileEffectOverrides {
	magnitude?: number
	/** Ticks, never milliseconds. Negative is permanent. */
	durationTicks?: number
}

/**
 * The tile an entity position falls in.
 *
 * **`Math.round`, not `Math.floor`, and this is the whole reason the conversion is written once.**
 * Entity positions in `core/` are the space waypoints are in -- integers land on tile *centres*
 * (`Path.waypoints` in `core/types.ts`) -- so tile `i` spans `[i - 0.5, i + 0.5)` and the containing
 * tile is the round. `render/tileCoords.ts`'s `toTile` floors because grid space puts integers on
 * tile *corners*; it is half a tile out here, and the symptom is not an obvious break. An enemy
 * would take damage from the tile behind it about half the time, which reads as flaky rather than as
 * an off-by-one.
 */
export function tileAt(position: Vec2): Vec2 {
	return { x: Math.round(position.x), y: Math.round(position.y) }
}

/** True while an integer tile index is on the board -- the bound `flagsAt` answers 0 outside. */
function isOnBoard(map: MapDef, tile: Vec2): boolean {
	if (!Number.isInteger(tile.x) || !Number.isInteger(tile.y)) {
		return false
	}
	return tile.x >= 0 && tile.x < map.widthTiles && tile.y >= 0 && tile.y < map.heightTiles
}

/**
 * The tiles touching `tile`, four or eight of them, **clamped to the board**: an off-board neighbour
 * is absent from the result rather than present and invalid. Same guarantee `flagsAt` gives by
 * answering 0.
 */
export function neighbours(map: MapDef, tile: Vec2, includeDiagonals: boolean): Vec2[] {
	const found: Vec2[] = []

	for (let dy = -1; dy <= 1; dy++) {
		for (let dx = -1; dx <= 1; dx++) {
			if (dx === 0 && dy === 0) {
				continue
			}
			if (!includeDiagonals && dx !== 0 && dy !== 0) {
				continue
			}
			const candidate = { x: tile.x + dx, y: tile.y + dy }
			if (isOnBoard(map, candidate)) {
				found.push(candidate)
			}
		}
	}

	return found
}

/**
 * Every on-board tile whose centre is within `radiusTiles` of `centre`, **including `centre`
 * itself**. A radius of 0 is exactly the one tile, which is what
 * `TileEffectBehaviour.radiusTiles === 0` means ("writes the tower's own tile only").
 *
 * Euclidean against a squared radius, the same shape `queryEnemiesInRange` uses, so a tile radius
 * and a tower range mean the same thing on the board.
 */
export function tilesInRadius(map: MapDef, centre: Vec2, radiusTiles: number): Vec2[] {
	const found: Vec2[] = []
	const radiusSquared = radiusTiles * radiusTiles
	const reach = Math.floor(radiusTiles)

	for (let dy = -reach; dy <= reach; dy++) {
		for (let dx = -reach; dx <= reach; dx++) {
			if (dx * dx + dy * dy > radiusSquared) {
				continue
			}
			const candidate = { x: centre.x + dx, y: centre.y + dy }
			if (isOnBoard(map, candidate)) {
				found.push(candidate)
			}
		}
	}

	return found
}

/**
 * The state of this cell, or null when it carries nothing. The early-out is what makes an empty
 * board free: most nights never write a tile at all until the Gas Stove Burner is unlocked.
 */
export function tileStateAt(world: World, tile: Vec2): TileState | null {
	if (world.tiles.length === 0) {
		return null
	}
	for (const state of world.tiles) {
		if (state.tile.x === tile.x && state.tile.y === tile.y) {
			return state
		}
	}
	return null
}

export function effectAt(world: World, tile: Vec2, kind: TileEffectKind): TileEffect | null {
	const state = tileStateAt(world, tile)
	if (state === null) {
		return null
	}
	return state.effects.find(effect => effect.kind === kind) ?? null
}

export function hasEffect(world: World, tile: Vec2, kind: TileEffectKind): boolean {
	return effectAt(world, tile, kind) !== null
}

/**
 * The duration a write actually lands with.
 *
 * `TileEffectBehaviour.durationTicks` is validated `min(-1)`, so **0 is a legal authored value** --
 * and an effect written with 0 would be dropped by the very next ageing pass, having existed for no
 * ticks at all. A non-negative duration below 1 becomes 1, or step 17 authors a Burner that does
 * nothing and the schema is perfectly happy with it.
 */
function durationFor(ticks: number): number {
	return ticks < 0 ? ticks : Math.max(1, ticks)
}

/** Permanent beats a timer: refreshing a permanent effect with a finite one must not end it. */
function longerOf(a: number, b: number): number {
	return a < 0 || b < 0 ? -1 : Math.max(a, b)
}

/**
 * Puts `kind` on `tile`, at the def's strength and duration unless told otherwise. Null off the
 * board -- a writer near the counter edge is normal, not an error.
 *
 * On a cell that already carries the kind, `TILE_EFFECT_DEFS[kind].onRewrite` decides: `'ignore'`
 * hands back the existing effect untouched, `'refresh'` takes the longer of the two remaining
 * durations and the newer magnitude.
 */
export function writeEffect(
	world: World,
	tile: Vec2,
	kind: TileEffectKind,
	overrides: TileEffectOverrides = {},
): TileEffect | null {
	if (!isOnBoard(world.map, tile)) {
		return null
	}

	const def = TILE_EFFECT_DEFS[kind]
	const magnitude = overrides.magnitude ?? def.magnitude
	const remainingTicks = durationFor(overrides.durationTicks ?? def.durationTicks)

	const state = tileStateAt(world, tile)
	if (state === null) {
		const effect: TileEffect = { kind, remainingTicks, magnitude }
		world.tiles.push({ tile: { x: tile.x, y: tile.y }, effects: [effect] })
		return effect
	}

	const existing = state.effects.find(effect => effect.kind === kind)
	if (existing === undefined) {
		const effect: TileEffect = { kind, remainingTicks, magnitude }
		state.effects.push(effect)
		return effect
	}

	if (def.onRewrite === 'ignore') {
		return existing
	}

	existing.remainingTicks = longerOf(existing.remainingTicks, remainingTicks)
	existing.magnitude = magnitude
	return existing
}

/**
 * Takes `kind` off `tile`. False when the cell never had it.
 *
 * **Releases the cell when its last effect goes**, rather than leaving an empty `effects: []` shell
 * behind. Neither reason is cosmetic: the shells accumulate for a whole night and turn the linear
 * scan above into the grid sweep this model exists to avoid, and every one of them lands in the save.
 */
export function clearEffect(world: World, tile: Vec2, kind: TileEffectKind): boolean {
	const index = world.tiles.findIndex(state => state.tile.x === tile.x && state.tile.y === tile.y)
	const state = index === -1 ? undefined : world.tiles[index]
	if (state === undefined) {
		return false
	}

	const at = state.effects.findIndex(effect => effect.kind === kind)
	if (at === -1) {
		return false
	}

	state.effects.splice(at, 1)
	if (state.effects.length === 0) {
		world.tiles.splice(index, 1)
	}

	return true
}

/** Every live effect of one kind, with the cell it is on. The renderer and the dev brush read this. */
export function forEachTileWithEffect(
	world: World,
	kind: TileEffectKind,
	fn: (state: TileState, effect: TileEffect) => void,
): void {
	for (const state of world.tiles) {
		for (const effect of state.effects) {
			if (effect.kind === kind) {
				fn(state, effect)
			}
		}
	}
}

/**
 * Whether anything on this cell refuses a tower.
 *
 * **Driven by `world.tiles` and the def, not by mold.** Mold is the only kind that says yes today;
 * asking the table rather than naming the kind is what makes step 15 a config entry.
 */
export function blocksPlacement(world: World, tile: Vec2): boolean {
	const state = tileStateAt(world, tile)
	if (state === null) {
		return false
	}
	return state.effects.some(effect => TILE_EFFECT_DEFS[effect.kind].blocksPlacement)
}
