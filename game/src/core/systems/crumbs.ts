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
 * draw and `RANDOM` targeting do not depend on how many crumbs happen to be lying about.
 *
 * Rot is step 7B's: `ageTicks` is incremented here and read by nothing.
 */

import { isCollect } from '@/core/content/behaviours.ts'
import { getTowerDef } from '@/core/content/index.ts'
import { towerById } from '@/core/systems/placement.ts'
import type { Crumb, EntityId, Vec2, World } from '@/core/types.ts'

/** analytic-docs/DECISIONS.md section 4, "within ~0.7 tiles of each other". */
export const MERGE_RADIUS_TILES = 0.7

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
 * The one exit door: credit, event, remove, reindex. Both ways a crumb leaves the floor -- the
 * click and a tower's delivery -- come through here, which is what makes "once and only once" a
 * property of one function rather than of two call sites.
 *
 * `byTowerId` is null for a click. That is what distinguishes the two in the event.
 *
 * A pile that is already gone is a no-op: the id lookup, not the argument, decides whether there is
 * anything to pay for.
 */
export function collectCrumb(world: World, crumb: Crumb, byTowerId: EntityId | null): void {
	const position = world.index.crumbPiles[crumb.id]
	if (position === undefined || world.crumbPiles[position]?.id !== crumb.id) {
		return
	}

	world.crumbs += crumb.value
	world.night.crumbsCollected += crumb.value
	world.events.push({ kind: 'crumbCollected', crumbId: crumb.id, value: crumb.value, byTowerId })

	world.crumbPiles.splice(position, 1)
	reindexCrumbs(world)
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

export function crumbsSystem(world: World): void {
	// Terminal phases run nothing, or the night keeps simulating behind the summary screen.
	if (world.night.phase === 'won' || world.night.phase === 'lost') {
		return
	}

	// Ageing and nothing else. Both thresholds -- spawn pressure at 20s, the Fruit Fly at 35s -- are
	// step 7B's, and a half-built one here is one the next session has to unpick.
	for (const crumb of world.crumbPiles) {
		crumb.ageTicks++
	}

	claimCrumbs(world)
	deliverCrumbs(world)
}
