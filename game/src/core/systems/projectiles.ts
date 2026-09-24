/**
 * Shots in flight: spawned by `combat.ts`, moved here, and resolved through `dealDamage` on arrival.
 *
 * **The pool is module-local and holds only dead projectiles.** `world.projectiles` is live ones
 * and nothing else, or its length stops meaning anything and every replay carries dead entries
 * (analytic-docs/ARCHITECTURE.md section 6 asks for pooled projectiles, not for a pool on the
 * world). Every field is overwritten on acquire, so a pooled object carries nothing from its last
 * life and determinism is untouched.
 *
 * A projectile is released **exactly once**. A double release puts one object in the free list
 * twice and the next two acquires hand out aliases of the same object -- the symptom is two
 * projectiles moving in perfect lockstep and one enemy taking both hits. Every projectile below
 * leaves the loop through exactly one of `survivors.push` or `release`.
 */

import type { AttackBehaviour, StatusApplication } from '@/core/content/behaviours.ts'
import { applyStatuses } from '@/core/content/statuses.ts'
import { dealDamage, dealSplashDamage } from '@/core/systems/combat.ts'
import { enemyById, enemyPosition } from '@/core/systems/spatial.ts'
import { isTargetable } from '@/core/systems/targeting.ts'
import type { Enemy, Projectile, Tower, World } from '@/core/types.ts'

const POOL: Projectile[] = []

function acquire(): Projectile {
	const pooled = POOL.pop()
	if (pooled !== undefined) {
		return pooled
	}
	return {
		id: 0,
		sourceTowerId: 0,
		targetEnemyId: null,
		position: { x: 0, y: 0 },
		target: { x: 0, y: 0 },
		speed: 0,
		damage: 0,
		damageType: 'physical',
		splashRadiusTiles: 0,
		// Overwritten on acquire like every other field; a pooled projectile carries nothing forward.
		targets: 'ground',
		pierce: 1,
		applies: [],
	}
}

function release(projectile: Projectile): void {
	POOL.push(projectile)
}

/** See the note on `EntityIndex`: an index built from stale positions reads out the wrong entity. */
function reindexProjectiles(world: World): void {
	world.index.projectiles = {}
	world.projectiles.forEach((projectile, position) => {
		world.index.projectiles[projectile.id] = position
	})
}

/**
 * One shot, leaving `tower` for where `target` is standing right now.
 *
 * `splashRadiusTiles` is carried off the behaviour, and the arrival below resolves it through
 * `dealSplashDamage`. Step 12's Tier 3 is still the first *content* with a non-zero radius; the
 * query is no longer its to build.
 *
 * `targets` is carried too, because the splash needs the filter and a projectile outlives the tower
 * that fired it -- without it a ground-only splash would quietly hit flyers.
 *
 * `applies` is passed in rather than read off `attack`, because which of the behaviour's
 * applications land is a property of *this shot*: `applicationsForShot` in `core/systems/combat.ts`
 * has already dropped the periodic ones this shot is not the Nth of.
 */
export function spawnProjectile(
	world: World,
	tower: Tower,
	attack: AttackBehaviour,
	target: Enemy,
	applies: readonly StatusApplication[],
): void {
	const at = enemyPosition(world, target) ?? { x: tower.tile.x, y: tower.tile.y }

	const projectile = acquire()
	projectile.id = world.nextEntityId++
	projectile.sourceTowerId = tower.id
	projectile.targetEnemyId = target.id
	projectile.position.x = tower.tile.x
	projectile.position.y = tower.tile.y
	projectile.target.x = at.x
	projectile.target.y = at.y
	projectile.speed = attack.projectileSpeed
	projectile.damage = attack.damage
	projectile.damageType = attack.damageType
	projectile.splashRadiusTiles = attack.splashRadiusTiles
	projectile.targets = attack.targets
	// The behaviour's own array, by reference and never copied -- `applicationsForShot` hands the
	// same one straight back unless this behaviour has a periodic application. A descriptor is
	// immutable content that outlives every world, and copying an array of objects per shot allocates
	// on the one path analytic-docs/ARCHITECTURE.md section 6 budgets. Nothing may write through it.
	projectile.applies = applies
	// No content sets pierce: it is step 12's upgrade field, and `AttackBehaviour` deliberately
	// does not carry it.
	projectile.pierce = 1

	world.index.projectiles[projectile.id] = world.projectiles.length
	world.projectiles.push(projectile)
}

export function projectilesSystem(world: World): void {
	// Terminal phases run nothing, or the night keeps simulating behind the summary screen.
	if (world.night.phase === 'won' || world.night.phase === 'lost') {
		return
	}
	if (world.projectiles.length === 0) {
		return
	}

	const survivors: Projectile[] = []

	for (const projectile of world.projectiles) {
		const found = projectile.targetEnemyId === null ? null : enemyById(world, projectile.targetEnemyId)
		// A target that can no longer be hit -- a Weevil that dived, an enemy fleeing a wake -- is
		// treated exactly like a dead one. Without this a grain fired the tick before a dive lands on the
		// mound. A splash shell whose target dives therefore despawns unexploded, as it does on a death.
		const target = found !== null && isTargetable(found, projectile.targets) ? found : null

		if (target === null) {
			// The target died or went out of reach. The projectile flies on to where it was aimed and
			// despawns there -- without this the array only ever grows.
			projectile.targetEnemyId = null
		} else {
			const at = enemyPosition(world, target)
			if (at !== null) {
				projectile.target.x = at.x
				projectile.target.y = at.y
			}
		}

		const dx = projectile.target.x - projectile.position.x
		const dy = projectile.target.y - projectile.position.y
		const distance = Math.hypot(dx, dy)

		// Arrival is "within one tick's travel", never equality: a projectile stepping 0.2 tiles per
		// tick never lands exactly on a float position, and the symptom of an equality check is
		// projectiles orbiting an enemy for the rest of the night.
		if (distance > projectile.speed) {
			projectile.position.x += (dx / distance) * projectile.speed
			projectile.position.y += (dy / distance) * projectile.speed
			survivors.push(projectile)
			continue
		}

		projectile.position.x = projectile.target.x
		projectile.position.y = projectile.target.y

		if (target !== null) {
			if (projectile.splashRadiusTiles > 0) {
				// The primary target is inside the circle and takes its damage there, exactly once.
				dealSplashDamage(
					world,
					projectile.position,
					projectile.splashRadiusTiles,
					projectile.damage,
					projectile.damageType,
					projectile.targets,
					projectile.sourceTowerId,
					projectile.applies,
				)
			} else {
				dealDamage(world, target, projectile.damage, projectile.damageType, projectile.sourceTowerId)
				// On arrival, not at the muzzle: a slow lands when the ice cube gets there.
				applyStatuses(target, projectile.applies, projectile.sourceTowerId, projectile.damageType)
			}
			projectile.pierce--

			if (projectile.pierce > 0) {
				// Clear the target: a homing projectile that pierces would otherwise re-hit the same
				// enemy every tick.
				projectile.targetEnemyId = null
				survivors.push(projectile)
				continue
			}
		}

		release(projectile)
	}

	// Removing one shifts every later index, so the map is rebuilt rather than patched.
	if (survivors.length !== world.projectiles.length) {
		world.projectiles = survivors
		reindexProjectiles(world)
	}
}
