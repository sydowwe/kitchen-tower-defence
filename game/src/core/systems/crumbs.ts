/**
 * Crumbs: the signature mechanic (analytic-docs/DECISIONS.md section 4). A crumb is a physical
 * object on the board with a value, an age and a life -- dropped where something died, merged with
 * its neighbours, and removed through exactly one door.
 *
 * Nothing here knows about pixels, clicks or glyphs. A crumb has no def and carries no glyph: its
 * `value` is the only truth, and the size bands the player sees are a pure function of it written
 * once in the renderer.
 *
 * **No randomness.** Merge target and claim order are both decided by array order, so the fridge
 * draw and `RANDOM` targeting do not depend on how many crumbs happen to be lying about. Rot is a
 * threshold on `ageTicks`, not a roll, so it does not touch `world.rng` either.
 *
 * A crumb leaves the floor through exactly one of two doors: `collectCrumb`, which pays, and rot,
 * which does not. Both splice through `removeCrumb` so the reindex cannot be forgotten on one of them.
 */

import { isCollect } from '@/core/content/behaviours.ts'
import { getEnemyDef, getTowerDef } from '@/core/content/index.ts'
import { nearestPath } from '@/core/path.ts'
import { towerById } from '@/core/systems/placement.ts'
import { spawnEnemyAt } from '@/core/systems/spawn.ts'
import type { Crumb, EntityId, Vec2, World } from '@/core/types.ts'

/** analytic-docs/DECISIONS.md section 4, "within ~0.7 tiles of each other". */
export const MERGE_RADIUS_TILES = 0.7

/**
 * 20s and 35s at 60 ticks per second (analytic-docs/DECISIONS.md section 4). Both are named
 * separately and neither is computed from the other: analytic-docs/OPEN-QUESTIONS.md flags the pair
 * as the first tuning target, so each has to be one edit.
 */
export const ROT_TICKS = 1200
export const HATCH_TICKS = 2100

/**
 * Derived, never stored. A boolean field on `Crumb` would be a second truth that can disagree with
 * the age it was computed from, and it would have to survive the JSON round-trip for nothing.
 */
export function isRotting(crumb: Crumb): boolean {
	return crumb.ageTicks >= ROT_TICKS
}

/** See the note on `EntityIndex`: an index built from stale positions reads out the wrong crumb. */
function reindexCrumbs(world: World): void {
	world.index.crumbPiles = {}
	world.crumbPiles.forEach((crumb, position) => {
		world.index.crumbPiles[crumb.id] = position
	})
}

/**
 * The pile with this id, or null. Null is the normal case rather than an error: several frames pass
 * between a click and the tick that executes it, and the pile may have been delivered in between.
 *
 * The id is re-checked against the entity found, so a stale index reads out as "gone" instead of as
 * a different pile being paid out.
 */
export function crumbById(world: World, crumbId: EntityId): Crumb | null {
	const position = world.index.crumbPiles[crumbId]
	const crumb = position === undefined ? undefined : world.crumbPiles[position]
	return crumb !== undefined && crumb.id === crumbId ? crumb : null
}

/**
 * The nearest pile within `MERGE_RADIUS_TILES` of `at` that is still on the floor, or null.
 *
 * **Claimed piles are skipped.** A pile halfway to a tower is not on the floor any more, and merging
 * into it would make the new value jump onto someone else's flight path.
 */
function nearestMergeTarget(world: World, at: Vec2): Crumb | null {
	let best: Crumb | null = null
	let bestDistanceSquared = MERGE_RADIUS_TILES * MERGE_RADIUS_TILES

	for (const crumb of world.crumbPiles) {
		if (crumb.claimedByTowerId !== null) {
			continue
		}

		const dx = crumb.position.x - at.x
		const dy = crumb.position.y - at.y
		const distanceSquared = dx * dx + dy * dy

		if (distanceSquared <= bestDistanceSquared) {
			best = crumb
			bestDistanceSquared = distanceSquared
		}
	}

	return best
}

/**
 * Drops `value` at `at`, merging into a neighbouring pile if there is one. Returns the pile the
 * value ended up in, new or merged into.
 *
 * Called from `resolveSystem`, not driven off the `enemyKilled` event: events are cleared at the top
 * of the next tick and `crumbs` runs three slots *before* `resolve`, so a system scanning for kills
 * would find an empty array forever. Same shape as `dealDamage` living in `combat.ts` and being
 * called from `projectiles.ts`.
 *
 * **`night.crumbsDropped` moves here**, in the one function, including for value merged into an
 * existing pile -- so a caller cannot drop a crumb without the ledger seeing it.
 *
 * **A merge keeps the existing pile's `ageTicks`** -- the older age, not the newer and not the
 * average. This looks like a bug and is the design: a kill zone's pile rots on the clock of the
 * first thing that died there, which is precisely the pressure the mechanic exists to apply.
 */
export function dropCrumb(world: World, at: Vec2, value: number): Crumb {
	world.night.crumbsDropped += value

	const target = nearestMergeTarget(world, at)
	if (target !== null) {
		target.value += value
		return target
	}

	const crumb: Crumb = {
		id: world.nextEntityId++,
		position: { x: at.x, y: at.y },
		value,
		ageTicks: 0,
		claimedByTowerId: null,
		travelTicksRemaining: 0,
	}

	world.index.crumbPiles[crumb.id] = world.crumbPiles.length
	world.crumbPiles.push(crumb)

	return crumb
}

/**
 * Takes a pile off the floor and nothing else. Returns false for a pile that has already gone: the
 * id lookup, not the argument, decides whether there is anything there.
 *
 * Both doors splice through here. Two splices would mean two reindexes, and the one that gets
 * forgotten reads out the wrong crumb silently.
 */
function removeCrumb(world: World, crumb: Crumb): boolean {
	const position = world.index.crumbPiles[crumb.id]
	if (position === undefined || world.crumbPiles[position]?.id !== crumb.id) {
		return false
	}

	world.crumbPiles.splice(position, 1)
	reindexCrumbs(world)
	return true
}

/**
 * The paying exit door: remove, credit, event. Both ways a crumb is *collected* -- the click and a
 * tower's delivery -- come through here, which is what makes "once and only once" a property of one
 * function rather than of two call sites. Rot is the other door and pays nothing.
 *
 * `byTowerId` is null for a click. That is what distinguishes the two in the event.
 *
 * A pile that is already gone is a no-op.
 */
export function collectCrumb(world: World, crumb: Crumb, byTowerId: EntityId | null): void {
	if (!removeCrumb(world, crumb)) {
		return
	}

	world.crumbs += crumb.value
	world.night.crumbsCollected += crumb.value
	world.events.push({ kind: 'crumbCollected', crumbId: crumb.id, value: crumb.value, byTowerId })
}

/**
 * Hands every unclaimed pile in radius to the first tower in `world.towers` order that can reach it.
 * Array order rather than nearest-tower, so two towers with overlapping radii resolve the same way
 * on a replay.
 */
function claimCrumbs(world: World): void {
	for (const tower of world.towers) {
		for (const behaviour of getTowerDef(tower.defId).behaviours) {
			if (!isCollect(behaviour)) {
				continue
			}

			const radiusSquared = behaviour.radiusTiles * behaviour.radiusTiles

			for (const crumb of world.crumbPiles) {
				if (crumb.claimedByTowerId !== null) {
					continue
				}

				const dx = crumb.position.x - tower.tile.x
				const dy = crumb.position.y - tower.tile.y
				if (dx * dx + dy * dy > radiusSquared) {
					continue
				}

				crumb.claimedByTowerId = tower.id
				crumb.travelTicksRemaining = behaviour.travelTicks
			}
		}
	}
}

/**
 * Flies claimed piles in and delivers the ones that arrive.
 *
 * **A claim whose tower has gone is released**, not flown on: the tower was sold mid-flight, and
 * without this the pile sits in `collecting` forever -- it never arrives, and (after 7B) it never
 * rots either. The symptom is one pile frozen on the board for the rest of the night.
 *
 * Iterates a snapshot, because delivering splices `world.crumbPiles`.
 */
function deliverCrumbs(world: World): void {
	for (const crumb of [...world.crumbPiles]) {
		const towerId = crumb.claimedByTowerId
		if (towerId === null) {
			continue
		}

		if (towerById(world, towerId) === null) {
			crumb.claimedByTowerId = null
			crumb.travelTicksRemaining = 0
			continue
		}

		crumb.travelTicksRemaining--
		if (crumb.travelTicksRemaining <= 0) {
			collectCrumb(world, crumb, towerId)
		}
	}
}

/**
 * The unpaying exit door. The pile is consumed and a Fruit Fly hatches on the spot, joining the
 * nearest lane **mid-board** -- past most of the defences, which is the whole sting
 * (analytic-docs/DECISIONS.md section 9, change 1).
 *
 * **Nothing is credited and `night.crumbsCollected` is not touched.** A rotted crumb was dropped and
 * not collected, which is exactly what makes the cleanliness ratio mean something.
 *
 * A map with no lanes -- half-edited, out of step 4's editor -- consumes the pile and hatches
 * nothing, the same way every other `core/` caller tolerates one rather than throwing.
 */
function hatchFruitFly(world: World, crumb: Crumb): void {
	const lane = nearestPath(world.map.paths, crumb.position)
	if (lane === null) {
		return
	}

	// -1: no wave spawned it, so it clears no wave. See `Enemy.spawnedInWaveIndex`.
	spawnEnemyAt(world, getEnemyDef('fruitFly'), lane.pathId, lane.distance, -1)
}

/**
 * Ages every pile, and takes the ones that are overdue.
 *
 * `ROT_TICKS` has nothing to do here -- `isRotting` is the read, and 7C's tint is the reader.
 *
 * **A claimed pile does not hatch.** It is in flight and its value is spoken for; hatching it would
 * strand the tower's timer and pay nothing. Which means a collect radius genuinely protects its
 * patch of floor, and that is what buying one is for.
 *
 * Iterates a snapshot, because hatching splices `world.crumbPiles`. Splicing inside a `for...of` over
 * the same array skips the element after each removal, and the symptom is every second overdue crumb
 * surviving a tick longer than the one before it.
 */
function ageCrumbs(world: World): void {
	for (const crumb of [...world.crumbPiles]) {
		crumb.ageTicks++

		if (crumb.claimedByTowerId === null && crumb.ageTicks >= HATCH_TICKS && removeCrumb(world, crumb)) {
			hatchFruitFly(world, crumb)
		}
	}
}

export function crumbsSystem(world: World): void {
	// Terminal phases run nothing, or the night keeps simulating behind the summary screen.
	if (world.night.phase === 'won' || world.night.phase === 'lost') {
		return
	}

	ageCrumbs(world)
	claimCrumbs(world)
	deliverCrumbs(world)
}
