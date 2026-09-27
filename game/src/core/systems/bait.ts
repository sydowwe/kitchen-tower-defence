/**
 * The Honey Pot: a ground enemy walking past one stops, leans in and feeds for the behaviour's
 * `durationTicks`, chewing on the pot while it does. When the pot reaches 0 HP it is destroyed and
 * every feeder lets go on the same tick.
 *
 * **A pot holds where it projects onto the lane**, the way `core/systems/barricades.ts` projects a
 * box: for each lane, `nearestOnPath` from the pot's tile, kept if the pot stands within the bait
 * radius of it. That arc distance is a *hold*, rebuilt every tick and never stored. An enemy is caught
 * inside the short window just past it and freezes where it stands. It is never pulled back to the
 * hold. The window is what stops a pot placed behind an enemy from freezing it ten tiles further on.
 *
 * **The clamp happens after the move, never inside it** -- the barricade rule. `movementSystem` stays
 * the one place `distance` grows. This slot resets a feeder to the distance stored on
 * `Enemy.feeding`, which is exact. Recomputing last tick's step backwards is not, and the barricade
 * clamp has to warn itself about exactly that.
 *
 * **The pull is the lean.** A feeder's `lateralOffsetTiles` drifts toward the pot's side of its lane,
 * stopping short of the glyph. Every other enemy on or under the floor drifts back toward 0, so a
 * released one walks back onto its lane. **This file writes that offset for every non-flyer, and
 * `core/systems/light.ts` writes it for flyers.** The split is by `isFlyer`, so no enemy has two
 * writers.
 *
 * Nothing else about a feeder changes: its statuses tick, towers shoot it, and it drops crumbs where
 * it stands. Every pass below runs in `world.enemies` order, so a replay resolves ties the same way.
 */

import { isBait } from '@/core/content/behaviours.ts'
import { effectiveDefOf, getEnemyDef } from '@/core/content/index.ts'
import { lateralOffsetOf, nearestOnPath, samplePath } from '@/core/path.ts'
import { damageTower, destroyTower, towerById } from '@/core/systems/placement.ts'
import { isFlyer, isOnFloor } from '@/core/systems/targeting.ts'
import type { TargetClass } from '@/core/content/behaviours.ts'
import type { Enemy, EntityId, World } from '@/core/types.ts'

/**
 * How far past a hold an enemy can still be caught, in tiles. Comfortably wider than any one tick's
 * step (the fastest thing on the floor moves 0.03 tiles a tick), so nothing steps clean over a pot.
 */
export const BAIT_CATCH_WINDOW_TILES = 0.5

/** How far short of the pot a feeder's lean stops, so it stands at the pot's edge and not on its glyph. */
export const BAIT_LEAN_GAP_TILES = 0.5

/**
 * How fast the lean moves, in tiles per tick, both in and back out. Linear, for the reason
 * `LIGHT_DRIFT_TILES_PER_TICK` is: an ease never reaches 0. A 2.5-tile lean takes 50 ticks, well
 * inside a three-second feed.
 */
export const BAIT_LEAN_TILES_PER_TICK = 0.05

/** Where one pot catches one lane. Rebuilt every tick; never stored on the world. */
interface BaitHold {
	towerId: EntityId
	pathId: string
	distance: number
	/** The signed offset a feeder leans to, already shortened by `BAIT_LEAN_GAP_TILES`. */
	leanTiles: number
	targets: TargetClass
	durationTicks: number
}

/**
 * Every pot on the board, projected onto every lane within its bait radius, in `world.towers` order
 * so the first pot wins a tie.
 *
 * Like the barricade projection, a lane crossing the same tile twice is caught at the nearer crossing
 * only.
 */
function baitHolds(world: World): BaitHold[] {
	const holds: BaitHold[] = []

	for (const tower of world.towers) {
		for (const behaviour of effectiveDefOf(tower).behaviours) {
			if (!isBait(behaviour)) {
				continue
			}
			for (const path of world.map.paths) {
				const found = nearestOnPath(path, tower.tile)
				if (found.offsetTiles > behaviour.radiusTiles) {
					continue
				}
				const side = lateralOffsetOf(samplePath(path, found.distance), tower.tile)
				holds.push({
					towerId: tower.id,
					pathId: path.id,
					distance: found.distance,
					leanTiles: Math.sign(side) * Math.max(0, Math.abs(side) - BAIT_LEAN_GAP_TILES),
					targets: behaviour.targets,
					durationTicks: behaviour.durationTicks,
				})
			}
		}
	}

	return holds
}

/** The behaviour's target class, by tags alone. Not `isTargetable`: a hidden ant still smells honey. */
function inClass(enemy: Enemy, targets: TargetClass): boolean {
	if (targets === 'both') {
		return true
	}
	return targets === 'air' ? isFlyer(enemy) : !isFlyer(enemy)
}

/** One step of the lean toward `target`, never overshooting it. */
function leanToward(current: number, target: number): number {
	const delta = target - current
	if (Math.abs(delta) <= BAIT_LEAN_TILES_PER_TICK) {
		return target
	}
	return current + Math.sign(delta) * BAIT_LEAN_TILES_PER_TICK
}

/** Lets go of a feeder whose pot is gone, which fled or left the floor, or whose time is up. */
function release(world: World): void {
	for (const enemy of world.enemies) {
		const feed = enemy.feeding
		if (feed === null) {
			continue
		}
		// Before anything clamps it: `movement` has just walked a fleeing feeder backwards, and a clamp
		// would put it back every tick -- a wake after which the board never empties.
		if (
			towerById(world, feed.towerId) === null ||
			enemy.flags.fleeing ||
			!isOnFloor(enemy) ||
			world.tick >= feed.releaseTick
		) {
			enemy.feeding = null
		}
	}
}

/**
 * Every feeder takes its def's `meleeDamagePerTick` off its pot -- the number a Cardboard Box already
 * takes -- and then every pot at 0 is destroyed and **all** of its feeders let go, including the ones
 * after the killing bite in `world.enemies`.
 *
 * Pots are looked up by id every time: `destroyTower` splices `world.towers`.
 */
function chew(world: World): void {
	const emptied: EntityId[] = []

	for (const enemy of world.enemies) {
		if (enemy.feeding === null) {
			continue
		}
		const pot = towerById(world, enemy.feeding.towerId)
		if (pot === null) {
			continue
		}
		damageTower(world, pot, getEnemyDef(enemy.defId).meleeDamagePerTick)
		if (pot.hp <= 0 && !emptied.includes(pot.id)) {
			emptied.push(pot.id)
		}
	}

	for (const towerId of emptied) {
		destroyTower(world, towerId)
		for (const enemy of world.enemies) {
			if (enemy.feeding?.towerId === towerId) {
				enemy.feeding = null
			}
		}
	}
}

/**
 * Catches whatever is in a live hold's window and has not fed there before. A Mold (`speed` 0) is
 * never caught: dragged sideways, its drawn glyph and the cell its patch grows from would part.
 */
function catchFeeders(world: World, holds: readonly BaitHold[]): void {
	for (const enemy of world.enemies) {
		if (enemy.feeding !== null || !isOnFloor(enemy) || enemy.flags.fleeing || enemy.speed <= 0) {
			continue
		}

		for (const hold of holds) {
			if (
				hold.pathId !== enemy.pathId ||
				!inClass(enemy, hold.targets) ||
				enemy.distance < hold.distance ||
				enemy.distance >= hold.distance + BAIT_CATCH_WINDOW_TILES ||
				enemy.fedAt.includes(hold.towerId) ||
				towerById(world, hold.towerId) === null
			) {
				continue
			}

			enemy.feeding = {
				towerId: hold.towerId,
				distance: enemy.distance,
				releaseTick: world.tick + hold.durationTicks,
			}
			enemy.fedAt.push(hold.towerId)
			break
		}
	}
}

/** The lean target for a feeder, or 0 for anything not feeding. */
function leanTargetOf(enemy: Enemy, holds: readonly BaitHold[]): number {
	const feed = enemy.feeding
	if (feed === null) {
		return 0
	}
	const hold = holds.find(candidate => candidate.towerId === feed.towerId && candidate.pathId === enemy.pathId)
	return hold?.leanTiles ?? 0
}

export function baitSystem(world: World): void {
	// Terminal phases run nothing, matching `movementSystem`.
	if (world.night.phase === 'won' || world.night.phase === 'lost') {
		return
	}

	// This runs for every enemy every tick, and on most boards there is nothing to do: no pot, no
	// feeder left over from a pot just sold, and nobody on the floor still leaning.
	const holds = baitHolds(world)
	if (
		holds.length === 0 &&
		!world.enemies.some(enemy => enemy.feeding !== null || (!isFlyer(enemy) && enemy.lateralOffsetTiles !== 0))
	) {
		return
	}

	release(world)
	chew(world)
	catchFeeders(world, holds)

	for (const enemy of world.enemies) {
		if (enemy.feeding !== null) {
			enemy.distance = enemy.feeding.distance
		}
	}

	for (const enemy of world.enemies) {
		if (isFlyer(enemy)) {
			continue
		}
		enemy.lateralOffsetTiles = leanToward(enemy.lateralOffsetTiles, leanTargetOf(enemy, holds))
	}
}
