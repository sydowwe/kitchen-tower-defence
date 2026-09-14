/**
 * The first collision in a codebase that has deliberately never had any: a ground enemy stops at a
 * Cardboard Box standing on its lane and chews through it instead of walking past.
 *
 * **The clamp happens after the move, never inside it.** `movementSystem` advances everyone and this
 * system pulls back whoever overshot, so `distance` still grows in exactly one place and step 18's
 * pushback can subtract from the same field without either of them knowing about the other.
 *
 * **Blocking is stateless and recomputed every tick.** There is no `blockedByTowerId` on `Enemy` and
 * no flag anywhere: every edge case falls out of asking "is there a barricade ahead of me right
 * now". A box placed behind an enemy is never ahead of it, a box sold or destroyed stops being ahead
 * of anyone on the same tick, and no field has to be cleared in four places. A remembered id is a
 * second truth, and the one clear that gets missed leaves an enemy standing forever on a box that is
 * gone.
 *
 * Nothing else about a held enemy changes: its statuses tick, towers shoot it, it drops crumbs where
 * it stands, and a rooted or slowed one still chews at its full rate.
 */

import { effectiveDefOf, getEnemyDef } from '@/core/content/index.ts'
import { speedMultiplier } from '@/core/content/statuses.ts'
import { nearestOnPath } from '@/core/path.ts'
import { damageTower, destroyTower, towerById } from '@/core/systems/placement.ts'
import { isFlyer } from '@/core/systems/targeting.ts'
import type { TowerDef } from '@/core/content/index.ts'
import type { Enemy, EntityId, Tower, World } from '@/core/types.ts'

/**
 * How far before a box's own arc position the queue comes to rest, in tiles. The gap is what piles
 * the enemies at the box's edge rather than inside it.
 *
 * It is also comfortably wider than any one tick's step -- the fastest thing in v1 moves 0.037 tiles
 * per tick -- which is what lets everything below compare against the enemy's *current* distance
 * without an enemy ever stepping clean over a box in one tick.
 */
const HOLD_GAP_TILES = 0.5

/** Where one barricade sits on one lane. Rebuilt every tick; never stored on the world. */
interface BarricadePosition {
	towerId: EntityId
	pathId: string
	distance: number
}

/** Whether this def is a wall. A def-level question, unlike `isCharge`, because both readers have one. */
export function isBarricade(def: TowerDef): boolean {
	return def.behaviours.some(behaviour => behaviour.kind === 'barricade')
}

/**
 * Every barricade on the board, projected onto every lane it actually stands on.
 *
 * **The offset test is what makes it "actually".** `nearestOnPath` always returns a distance, so
 * without it a box dropped on lane A would silently stop lane B as well from night 10 on -- and on
 * the one-lane maps of nights 1-7 that looks perfect right up until it ships.
 *
 * A lane crossing the same tile twice is blocked at the nearer crossing only: `nearestOnPath`
 * returns one projection and that is accepted for v1, because no authored map self-crosses.
 */
function barricadePositions(world: World): BarricadePosition[] {
	const positions: BarricadePosition[] = []
	const halfWidth = world.map.trackWidthTiles / 2

	for (const tower of world.towers) {
		if (!isBarricade(effectiveDefOf(tower))) {
			continue
		}
		for (const path of world.map.paths) {
			const found = nearestOnPath(path, tower.tile)
			if (found.offsetTiles <= halfWidth) {
				positions.push({ towerId: tower.id, pathId: path.id, distance: found.distance })
			}
		}
	}

	return positions
}

/** The nearest position strictly ahead of the enemy on its own lane. Flyers are never blocked. */
function nearestAhead(positions: readonly BarricadePosition[], enemy: Enemy): BarricadePosition | null {
	if (isFlyer(enemy)) {
		return null
	}

	let best: BarricadePosition | null = null
	for (const position of positions) {
		if (position.pathId !== enemy.pathId || position.distance <= enemy.distance) {
			continue
		}
		if (best === null || position.distance < best.distance) {
			best = position
		}
	}

	return best
}

/**
 * The nearest barricade ahead of this enemy on its lane, with the arc distance of the box itself --
 * not of the point the enemy stops at, which is `HOLD_GAP_TILES` short of it.
 *
 * Bounded by the number of boxes on the board rather than by the enemy count, so it is cheap enough
 * for `barricadeHolding` to be asked once per enemy per frame. The system does not call it: that one
 * builds the positions once per tick and shares them across every enemy.
 */
export function barricadeAhead(world: World, enemy: Enemy): { tower: Tower; distance: number } | null {
	const found = nearestAhead(barricadePositions(world), enemy)
	if (found === null) {
		return null
	}

	const tower = towerById(world, found.towerId)
	return tower === null ? null : { tower, distance: found.distance }
}

/**
 * The box this enemy is chewing right now, or null. Built on `barricadeAhead` so 10C's chew
 * animation cannot disagree with the simulation about who is eating.
 *
 * "Chewing" is having reached the hold point, and deliberately not "having moved zero this tick": a
 * rooted enemy standing at a box still chews (decision 11), and a frozen one still has its mouth on
 * the cardboard.
 */
export function barricadeHolding(world: World, enemy: Enemy): Tower | null {
	const found = barricadeAhead(world, enemy)
	if (found === null) {
		return null
	}
	return enemy.distance >= found.distance - HOLD_GAP_TILES ? found.tower : null
}

export function barricadesSystem(world: World): void {
	// Terminal phases run nothing, matching `movementSystem` -- or the queue keeps eating the box
	// behind the summary screen.
	if (world.night.phase === 'won' || world.night.phase === 'lost') {
		return
	}

	const positions = barricadePositions(world)
	if (positions.length === 0) {
		return
	}

	for (const enemy of world.enemies) {
		const position = nearestAhead(positions, enemy)
		if (position === null) {
			continue
		}

		const holdAt = position.distance - HOLD_GAP_TILES
		if (enemy.distance < holdAt) {
			continue
		}

		// `movementSystem` has already run, so this tick's step has to be recomputed to know where the
		// enemy stood before it. Nothing between the two systems touches a status, so it is the same
		// number movement used.
		const previous = enemy.distance - enemy.speed * speedMultiplier(enemy)

		// **Never backwards.** An enemy standing at `boxDistance - 0.1` when the box goes down is
		// already inside the gap, and a plain `min(next, holdAt)` would shove it 0.4 tiles back up the
		// track -- an ant teleporting backwards the instant you place a box.
		enemy.distance = Math.min(enemy.distance, Math.max(previous, holdAt))

		// Looked up by id rather than cached, because `destroyTower` splices `world.towers` and
		// rebuilds the index: a box that dies partway through this loop leaves `positions` stale, and
		// a stale entry has to deal no damage rather than damage a tower that is gone. The clamp above
		// still ran, so the rest of the queue holds its ground for the remainder of this tick and walks
		// from the next one -- no enemy jumps forward on the tick the box died.
		const tower = towerById(world, position.towerId)
		if (tower === null) {
			continue
		}

		damageTower(world, tower, getEnemyDef(enemy.defId).meleeDamagePerTick)
		if (tower.hp <= 0) {
			destroyTower(world, tower.id)
		}
	}
}
