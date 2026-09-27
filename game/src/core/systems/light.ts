/**
 * What the lamps on the board are doing to the enemies walking past them: revealing whatever is
 * `hidden` inside their radius, and pulling the one `light-drawn` enemy in v1 off its lane.
 *
 * **The Moth never leaves the polyline.** It walks the same `distance` at the same rate as anything
 * else; what a light changes is `Enemy.lateralOffsetTiles`, a signed sideways displacement applied by
 * `enemyPosition` alone. So `remainingToFridge`, `FIRST`/`LAST`, the barricade projection and the
 * leak check all keep working with no knowledge of any of this (analytic-docs/DECISIONS.md section 3).
 *
 * **This file writes that offset for flyers and nothing else.** `core/systems/bait.ts` owns it for
 * every enemy on or under the floor. The split is by `isFlyer`, so no enemy has two writers.
 *
 * **Both halves are stateless and recomputed every tick**, the rule `core/systems/barricades.ts` is
 * built on: `flags.revealed` is written unconditionally for every enemy, so selling the lamp re-hides
 * what it was lighting on the tick of the sale and there is no field to clear in four places. A
 * version that only ever sets the flag true is a version where the board stays permanently visible.
 *
 * It runs after `movement` and the barricade clamp, so it reads this tick's `distance`, and before
 * `targeting`, so a Nightlight placed this tick reveals in the same tick it was placed.
 */

import { isReveal } from '@/core/content/behaviours.ts'
import { effectiveDefOf } from '@/core/content/index.ts'
import { lateralOffsetOf, samplePath } from '@/core/path.ts'
import { enemyPosition } from '@/core/systems/spatial.ts'
import { isFlyer } from '@/core/systems/targeting.ts'
import type { Enemy, Tower, World } from '@/core/types.ts'

/**
 * How far a Moth can see a light from, in tiles -- analytic-docs/CONTENT.md section 2's "within 5
 * tiles".
 *
 * **Deliberately not the behaviour's `radiusTiles`**, which is 4 and is what the Nightlight
 * *reveals* within. Both numbers are right about different things, and `attractsLightDrawn` being a
 * boolean is the tell: the reach belongs to the moth's eyes rather than to the lamp, so step 17's
 * Candle (aura radius 2) pulls from the same five tiles without authoring a third number.
 */
export const LIGHT_ATTRACTION_TILES = 5

/** The furthest off its lane a light can pull anything. Clamped on the *target*, never the follower. */
export const LIGHT_MAX_OFFSET_TILES = 3

/**
 * How fast the offset chases its target, in tiles per tick. Linear and fixed, **not an exponential
 * ease**: an ease never actually reaches 0, which would need a snap epsilon -- a second constant that
 * can disagree with the first, and "back at exactly 0" would then quietly pass at a thousandth of a
 * tile of permanent drift.
 *
 * 3 tiles at 0.03 is 100 ticks, 1.67 seconds, inside the two seconds the step asks for -- 20 ticks of
 * headroom against `tests/light.spec.ts`, which is the floor and is what makes ~0.025 the slowest this
 * can go without moving an assertion. The curve still reads as a curve because the *target* is smooth,
 * not because the follower is.
 *
 * 11B authored 0.04 from arithmetic. Slowed to 0.03 on a look at a moth in 11C -- the drift is the one
 * thing on screen that is *supposed* to look indecisive, and the faster rate took the wander out of it.
 */
export const LIGHT_DRIFT_TILES_PER_TICK = 0.03

/** Every tower on the board that is a light. The Nightlight today; step 17's Candle joins it. */
export function lightSources(world: World): Tower[] {
	return world.towers.filter(tower => effectiveDefOf(tower).behaviours.some(isReveal))
}

/** One lamp, flattened. Built once per tick and shared across every enemy, like `barricadePositions`. */
interface LightSource {
	x: number
	y: number
	radiusTiles: number
	attractsLightDrawn: boolean
}

function lightsOf(world: World): LightSource[] {
	const lights: LightSource[] = []

	for (const tower of lightSources(world)) {
		for (const behaviour of effectiveDefOf(tower).behaviours) {
			if (isReveal(behaviour)) {
				lights.push({
					x: tower.tile.x,
					y: tower.tile.y,
					radiusTiles: behaviour.radiusTiles,
					attractsLightDrawn: behaviour.attractsLightDrawn,
				})
			}
		}
	}

	return lights
}

/** Whether this enemy is one a light can pull. The tag, and never `isFlyer`: a Fly is air and blind to lamps. */
function isLightDrawn(enemy: Enemy): boolean {
	return enemy.tags.includes('light-drawn')
}

/**
 * How far off its lane this enemy is being pulled right now, in tiles, signed the way
 * `applyLateralOffset` is.
 *
 * **Measured from the base path point, with no offset applied** -- otherwise the offset changes what
 * is in range, which changes the offset, and entering and leaving attraction stop happening at fixed
 * arc distances.
 *
 * **The nearest light wins and the pulls are never summed.** Two lamps either side of the lane
 * summing to a net zero is a moth flying dead straight between two nightlights, which is the opposite
 * of the picture. Ties go to the earlier entry of `world.towers`, so a replay resolves them the same
 * way.
 *
 * A lamp directly ahead on the track has a normal component of ~0 and pulls the moth nowhere. That is
 * correct: it is already going there.
 */
function targetOffsetFor(world: World, enemy: Enemy, lights: readonly LightSource[]): number {
	const path = world.map.paths.find(candidate => candidate.id === enemy.pathId)
	if (path === undefined) {
		return 0
	}

	const base = samplePath(path, enemy.distance)

	const reachSquared = LIGHT_ATTRACTION_TILES * LIGHT_ATTRACTION_TILES
	let nearestSquared = Number.POSITIVE_INFINITY
	let target = 0

	for (const light of lights) {
		if (!light.attractsLightDrawn) {
			continue
		}
		const dx = light.x - base.x
		const dy = light.y - base.y
		const distanceSquared = dx * dx + dy * dy
		// Out of the moth's reach, or no nearer than one already found -- the second is the tie-break,
		// and `>=` rather than `>` is what makes the earlier entry of `world.towers` win it.
		if (distanceSquared > reachSquared || distanceSquared >= nearestSquared) {
			continue
		}
		nearestSquared = distanceSquared
		target = lateralOffsetOf(base, light)
	}

	return Math.min(Math.max(target, -LIGHT_MAX_OFFSET_TILES), LIGHT_MAX_OFFSET_TILES)
}

/** One step of the follower toward `target`, never overshooting it. */
function driftToward(current: number, target: number): number {
	const delta = target - current
	if (Math.abs(delta) <= LIGHT_DRIFT_TILES_PER_TICK) {
		return target
	}
	return current + Math.sign(delta) * LIGHT_DRIFT_TILES_PER_TICK
}

export function lightSystem(world: World): void {
	// Terminal phases run nothing, matching every other system -- or moths keep drifting behind the
	// summary screen.
	if (world.night.phase === 'won' || world.night.phase === 'lost') {
		return
	}

	const lights = lightsOf(world)

	for (const enemy of world.enemies) {
		// Revelation is asked of where the thing actually *is*, offset included -- unlike attraction
		// above, which is asked of the lane. A board with no lamps on it skips the position entirely:
		// nothing is lit, and this runs for every enemy every tick.
		const at = lights.length === 0 ? null : enemyPosition(world, enemy)
		enemy.flags.revealed =
			at !== null &&
			lights.some(light => {
				const dx = at.x - light.x
				const dy = at.y - light.y
				return dx * dx + dy * dy <= light.radiusTiles * light.radiusTiles
			})

		// Flyers only: every floor enemy's offset is `core/systems/bait.ts`'s, and two writers on one
		// enemy would fight over it every tick.
		if (!isLightDrawn(enemy) || !isFlyer(enemy)) {
			continue
		}

		// No light in reach makes the target 0, which is what walks the moth back onto its lane rather
		// than leaving it parked three tiles out.
		enemy.lateralOffsetTiles = driftToward(enemy.lateralOffsetTiles, targetOffsetFor(world, enemy, lights))
	}
}
