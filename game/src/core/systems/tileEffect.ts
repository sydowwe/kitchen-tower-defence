/**
 * Towers that write the board: every `tileEffect` behaviour, rewriting its cells on its own interval.
 * The Gas Stove Burner is the only one in v1.
 *
 * **Stateless.** It writes every `refreshIntervalTicks` on the world clock and keeps no field on the
 * tower, so a sold Burner simply stops writing and `tilesSystem` ages its last cells out. The Burner
 * authors a 2-tick heat rewritten every tick, which is what makes a sale clear its tile by the end of
 * that same tick (steps/17-auras-and-zones/A-candle-burner-fly-paper.md, decision 2).
 *
 * Runs after `cleanse` and before `tiles`: a Burner placed this tick burns this tick, and a cell is
 * written, then aged, in one direction within a tick.
 *
 * **Noise is per second of burning something, not per second of existing** (decision 3). On the
 * world clock, a writer with an on-floor enemy on one of the cells it wrote this tick pushes one
 * `towerFired` -- the same event a shot is, so the meter and everything else counting shots needs no
 * new member.
 */

import { isTileEffect } from '@/core/content/behaviours.ts'
import { effectiveDefOf } from '@/core/content/index.ts'
import { tileAt, tilesInRadius, writeEffect } from '@/core/tiles.ts'
import { enemyPosition } from '@/core/systems/spatial.ts'
import { isOnFloor } from '@/core/systems/targeting.ts'
import type { Vec2, World } from '@/core/types.ts'

/** `core/` has no clock; the noise rule is "per second", and a second is this many ticks. */
const TICKS_PER_SECOND = 60

/**
 * Whether anything standing on the floor is on one of `cells`. Through `isOnFloor`, the one floor
 * predicate `tileUnder` also asks, so a flyer or a burrowed Weevil over a lit ring makes no noise for
 * the same reason it takes no heat.
 */
function burnsAnything(world: World, cells: readonly Vec2[]): boolean {
	for (const enemy of world.enemies) {
		if (!isOnFloor(enemy)) {
			continue
		}
		const at = enemyPosition(world, enemy)
		if (at === null) {
			continue
		}
		const tile = tileAt(at)
		if (cells.some(cell => cell.x === tile.x && cell.y === tile.y)) {
			return true
		}
	}
	return false
}

export function tileEffectSystem(world: World): void {
	// Terminal phases run nothing, or the ring keeps burning behind the summary screen.
	if (world.night.phase === 'won' || world.night.phase === 'lost') {
		return
	}

	const noiseTick = world.tick % TICKS_PER_SECOND === 0

	for (const tower of world.towers) {
		// The effective def, never the base: the Burner's tiers raise the magnitude and the radius.
		const def = effectiveDefOf(tower)
		for (const behaviour of def.behaviours) {
			if (!isTileEffect(behaviour) || world.tick % behaviour.refreshIntervalTicks !== 0) {
				continue
			}

			const cells = tilesInRadius(world.map, tower.tile, behaviour.radiusTiles)
			for (const cell of cells) {
				writeEffect(world, cell, behaviour.effect, {
					magnitude: behaviour.magnitude,
					durationTicks: behaviour.durationTicks,
				})
			}

			if (noiseTick && def.noise > 0 && burnsAnything(world, cells)) {
				world.events.push({ kind: 'towerFired', towerId: tower.id, defId: def.id, noise: def.noise })
			}
		}
	}
}
