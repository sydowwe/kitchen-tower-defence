/**
 * Towers that take tile state off the board: every `cleanse` behaviour, pulsing on its own interval.
 *
 * **Not tied to firing.** `combatSystem` only shoots at something in range, and a scrubber that
 * waited for a target would stand idle beside a molded board whose mold is already dead -- the one
 * moment it was bought for. So the pulse is its own clock, and a tower with no enemy anywhere still
 * cleans.
 *
 * The clock is `world.tick % intervalTicks`, **not `Tower.cooldownTicks`**: that counter belongs to
 * the firing behaviour and `combatSystem` resets it every shot, so sharing it would stop the
 * scrubbing whenever the tower happened to be shooting. Every tower of one interval pulses on the
 * same tick. Nothing here draws from `world.rng`, so that lockstep costs nothing.
 *
 * Runs after `spread` and before `tiles`: a cell cleared this tick is gone before it is aged, so a
 * cleanse and an expiry can never both land on one cell.
 */

import { isCleanse } from '@/core/content/behaviours.ts'
import { effectiveDefOf } from '@/core/content/index.ts'
import { clearEffect, tileStateAt, tilesInRadius } from '@/core/tiles.ts'
import type { CleanseBehaviour } from '@/core/content/behaviours.ts'
import type { Tower, Vec2, World } from '@/core/types.ts'

function tileIndex(world: World, tile: Vec2): number {
	return tile.y * world.map.widthTiles + tile.x
}

/**
 * Every cell in radius carrying any kind this behaviour clears, **nearest the fridge first**.
 *
 * Euclidean to `map.fridge.tile` and not distance along a lane: a molded cell is routinely off the
 * track, and an arc distance would be measured against wherever `nearestOnPath` projected it. Ties go
 * to the lower row-major index, which is what keeps the order deterministic without `world.rng`.
 *
 * Radius is tile centre to tile centre, both integers -- `tilesInRadius` answers that, and it is the
 * same squared-euclidean test every other radius on the board uses.
 */
function candidates(world: World, tower: Tower, behaviour: CleanseBehaviour): Vec2[] {
	const fridge = world.map.fridge.tile
	const found: { tile: Vec2; distance: number; index: number }[] = []

	for (const tile of tilesInRadius(world.map, tower.tile, behaviour.radiusTiles)) {
		const state = tileStateAt(world, tile)
		if (state === null || !state.effects.some(effect => behaviour.clears.includes(effect.kind))) {
			continue
		}
		found.push({
			tile,
			distance: Math.hypot(tile.x - fridge.x, tile.y - fridge.y),
			index: tileIndex(world, tile),
		})
	}

	found.sort((a, b) => a.distance - b.distance || a.index - b.index)
	return found.map(entry => entry.tile)
}

function pulse(world: World, tower: Tower, behaviour: CleanseBehaviour): void {
	// The early-out that keeps an empty board free: most nights never write a tile at all.
	if (world.tiles.length === 0) {
		return
	}

	const cells = candidates(world, tower, behaviour)
	// 0 is "every cell in radius" -- the Baking Soda's whole circle at once.
	const take = behaviour.maxTilesPerPulse === 0 ? cells.length : Math.min(behaviour.maxTilesPerPulse, cells.length)

	for (let n = 0; n < take; n++) {
		const cell = cells[n]
		if (cell === undefined) {
			continue
		}
		// `clearEffect` releases the cell when its last effect goes, so nothing leaves an empty shell
		// behind for the renderer to walk every frame.
		for (const kind of behaviour.clears) {
			clearEffect(world, cell, kind)
		}
	}
}

export function cleanseSystem(world: World): void {
	// Terminal phases run nothing, or the board keeps changing behind the summary screen.
	if (world.night.phase === 'won' || world.night.phase === 'lost') {
		return
	}

	for (const tower of world.towers) {
		// The effective def, never the base: both scrubbers' tier 3 changes a cleanse number.
		for (const behaviour of effectiveDefOf(tower).behaviours) {
			if (isCleanse(behaviour) && world.tick % behaviour.intervalTicks === 0) {
				pulse(world, tower, behaviour)
			}
		}
	}
}
