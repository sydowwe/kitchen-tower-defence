/**
 * The one place entities are removed: deaths, leaks at the fridge, and the win/lose check. Runs
 * last so every earlier system this tick saw a consistent set of arrays.
 *
 * Both terminal transitions live here rather than in `waveSystem`, and for the same reason the
 * removals do: a night is won when the board empties and lost when the fridge does, and this is the
 * system that empties them. Checking nine systems earlier would report either one a tick late.
 *
 * Deaths and leaks share **one pass** over `world.enemies`, not two. A second filter would run
 * against an index the first one already invalidated.
 *
 * Step 19 owns thieves that carry food off the map; today an enemy that reaches the fridge eats
 * there and is removed on the spot.
 */

import { getEnemyDef } from '@/core/content/index.ts'
import { totalLength } from '@/core/path.ts'
import { dropCrumb } from '@/core/systems/crumbs.ts'
import { enemyPosition } from '@/core/systems/spatial.ts'
import { hasFinishedSpawning } from '@/core/systems/wave.ts'
import type { DefId, Enemy, EntityId, World } from '@/core/types.ts'

/**
 * What a kill is worth, in whole crumbs.
 *
 * The difficulty multiplier is applied **at the drop** and not at the credit, so a pile's `value` is
 * the number the player is shown and merging sums numbers that are already final. `max(1)` stops
 * nightmare's 0.85 rounding a 1-crumb reward away to nothing.
 */
function crumbValueFor(world: World, defId: DefId): number {
	return Math.max(1, Math.round(getEnemyDef(defId).reward * world.difficulty.crumbIncomeMult))
}

/**
 * Marks the first `count` items still on the shelf as lost and returns their ids.
 *
 * The **first** unlost items rather than a random draw, so what leaves the fridge is decided by the
 * order the night stocked it in and stays the same on a replay. Nothing is spliced out: the
 * night-end summary lists what you lost by name, which a shortened array cannot answer.
 */
function takeFood(world: World, count: number): EntityId[] {
	const taken: EntityId[] = []

	for (const item of world.night.food) {
		if (taken.length >= count) {
			break
		}
		if (!item.lost) {
			item.lost = true
			taken.push(item.id)
		}
	}

	return taken
}

/** See the note on `EntityIndex`: an index built from stale positions reads out the wrong enemy. */
function reindexEnemies(world: World): void {
	world.index.enemies = {}
	world.enemies.forEach((enemy, position) => {
		world.index.enemies[enemy.id] = position
	})
}

export function resolveSystem(world: World): void {
	const night = world.night

	if (night.phase === 'won' || night.phase === 'lost') {
		return
	}

	const survivors: Enemy[] = []

	for (const enemy of world.enemies) {
		const path = world.map.paths.find(candidate => candidate.id === enemy.pathId)

		// **Before** the leak check. An enemy killed on the tick it reaches the fridge emits
		// `enemyKilled` and takes no food -- otherwise a tower that kills an Ant standing on the
		// fridge still costs you a slice of pizza.
		if (enemy.hp <= 0) {
			// `at` is both the event's position and where the crumb lands. No `reward` field: that is
			// `getEnemyDef(defId).reward`, and a second copy of a derived number is the one that
			// drifts.
			const at = enemyPosition(world, enemy) ?? { x: 0, y: 0 }
			world.events.push({ kind: 'enemyKilled', enemyId: enemy.id, defId: enemy.defId, at })
			night.enemiesKilled++
			dropCrumb(world, at, crumbValueFor(world, enemy.defId))
			continue
		}

		if (path === undefined || enemy.distance < totalLength(path)) {
			survivors.push(enemy)
			continue
		}

		const stolenItems = takeFood(world, getEnemyDef(enemy.defId).steals)
		world.events.push({ kind: 'enemyLeaked', enemyId: enemy.id, defId: enemy.defId, stolenItems })
	}

	if (survivors.length !== world.enemies.length) {
		world.enemies = survivors
		reindexEnemies(world)
	}

	// "The fridge is empty" is every item lost, never a zero length -- see `NightState.food`.
	if (night.food.every(item => item.lost)) {
		night.phase = 'lost'
		world.events.push({ kind: 'nightEnded', won: false })
		return
	}

	const wave = night.wave
	const lastWaveIsOut = wave !== null && night.waveIndex === night.waveCount - 1 && hasFinishedSpawning(wave)

	if (lastWaveIsOut && world.enemies.length === 0) {
		night.phase = 'won'
		world.events.push({ kind: 'nightEnded', won: true })
	}
}
