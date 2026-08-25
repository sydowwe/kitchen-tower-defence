/**
 * The three shapes a hit can have: a circle, a wedge and a capsule.
 *
 * **Every one of them is a filter over `queryEnemiesInRange`**, never a second traversal of
 * `world.enemies`. The seam in `core/systems/spatial.ts` exists so the uniform-grid hash
 * analytic-docs/ARCHITECTURE.md section 6 names can drop in behind one function; a shape that
 * measured its own distances would be the second place to make fast, and the one that got forgotten.
 *
 * Angles are **radians** and match `samplePath().angle` -- `atan2(dy, dx)`, the convention every
 * angle in the codebase follows. The half-angle argument is **degrees**, because `coneHalfAngleDeg`
 * is what content authors and what the schema bounds; the conversion happens once, below.
 */

import { enemyPosition, queryEnemiesInRange } from '@/core/systems/spatial.ts'
import type { Enemy, Vec2, World } from '@/core/types.ts'

const TAU = Math.PI * 2

/**
 * A difference of two angles, wrapped into `[-PI, PI]`.
 *
 * `atan2` returns `(-PI, PI]`, so a tower aiming left has a facing near +/-PI and a raw subtraction
 * against an enemy on the other side of the branch cut gives a difference near 2PI. The symptom is a
 * cone that works perfectly on three quarters of the board and hits nothing at all on the fourth,
 * which reads as a targeting bug rather than an arithmetic one.
 */
function wrapAngle(radians: number): number {
	const wrapped = (((radians + Math.PI) % TAU) + TAU) % TAU
	return wrapped - Math.PI
}

/** `queryEnemiesInRange` under the name that says what shape it is. */
export function circle(world: World, center: Vec2, radiusTiles: number, filter?: (enemy: Enemy) => boolean): Enemy[] {
	return queryEnemiesInRange(world, center, radiusTiles, filter)
}

/**
 * The wedge of `2 x halfAngleDeg` centred on `directionRad`, out to `radiusTiles`.
 *
 * An enemy standing exactly on the origin has no angle -- `atan2(0, 0)` is 0 -- and counts as
 * inside: it is inside every other shape here too, and a tower is not made to miss the thing on top
 * of it by the arithmetic of a facing.
 */
export function cone(
	world: World,
	origin: Vec2,
	directionRad: number,
	radiusTiles: number,
	halfAngleDeg: number,
	filter?: (enemy: Enemy) => boolean,
): Enemy[] {
	const halfAngleRad = (halfAngleDeg * Math.PI) / 180

	return circle(world, origin, radiusTiles, filter).filter(enemy => {
		// Never null here: the query already dropped every enemy whose path the map has lost.
		const at = enemyPosition(world, enemy)
		if (at === null) {
			return false
		}

		const dx = at.x - origin.x
		const dy = at.y - origin.y
		if (dx === 0 && dy === 0) {
			return true
		}

		return Math.abs(wrapAngle(Math.atan2(dy, dx) - directionRad)) <= halfAngleRad
	})
}

/**
 * Everything within `widthTiles / 2` of the **segment** `from -> to`.
 *
 * `t` is clamped to `[0, 1]` so the shape ends where the segment does, exactly as `nearestOnPath` in
 * `core/path.ts` clamps for the same reason: projected onto the infinite line, a beam three tiles
 * long would hit something thirty tiles behind the tower.
 *
 * Nothing in v1 calls this. It is here because it is four lines next to the two that are needed and
 * several Act III towers want it.
 */
export function line(
	world: World,
	from: Vec2,
	to: Vec2,
	widthTiles: number,
	filter?: (enemy: Enemy) => boolean,
): Enemy[] {
	const dx = to.x - from.x
	const dy = to.y - from.y
	const lengthSquared = dx * dx + dy * dy
	const halfWidth = widthTiles / 2

	// One traversal, like the other two: a circle around the midpoint that contains the whole capsule.
	const midpoint = { x: from.x + dx / 2, y: from.y + dy / 2 }
	const reach = Math.sqrt(lengthSquared) / 2 + halfWidth

	return circle(world, midpoint, reach, filter).filter(enemy => {
		const at = enemyPosition(world, enemy)
		if (at === null) {
			return false
		}

		// A zero-length segment is a point, and every `t` on it is 0.
		const t =
			lengthSquared === 0
				? 0
				: Math.min(1, Math.max(0, ((at.x - from.x) * dx + (at.y - from.y) * dy) / lengthSquared))
		const nearestX = from.x + dx * t
		const nearestY = from.y + dy * t
		const offX = at.x - nearestX
		const offY = at.y - nearestY

		return offX * offX + offY * offY <= halfWidth * halfWidth
	})
}
