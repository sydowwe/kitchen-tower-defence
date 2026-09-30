/**
 * The one place entities are removed: deaths, leaks at the fridge, and the win/lose check. Runs
 * last so every earlier system this tick saw a consistent set of arrays.
 *
 * Both terminal transitions live here rather than in `waveSystem`, and for the same reason the
 * removals do: a night is won when the board empties and lost when the fridge does, and this is the
 * system that empties them. Checking nine systems earlier would report either one a tick late.
 *
 * Deaths, leaks and escapes share **one pass** over `world.enemies`, not two. A second filter would
 * run against an index the first one already invalidated.
 *
 * A walker that reaches the fridge eats there and is removed on the spot. A thief never leaks: it
 * grabs (`core/systems/theft.ts`), runs, and is removed here when it gets back to the start of its
 * lane with whatever it carried. What happens to the food is `core/systems/fridge.ts`'s.
 */

import { getEnemyDef } from '@/core/content/index.ts'
import { totalLength } from '@/core/path.ts'
import { dropCrumb } from '@/core/systems/crumbs.ts'
import { dropCarried, escapeWith, forfeitDroppedFood, isGone, takeFood } from '@/core/systems/fridge.ts'
import { groceryMoneyFor } from '@/core/systems/scoring.ts'
import { enemyPosition } from '@/core/systems/spatial.ts'
import { isThiefFleeing } from '@/core/systems/theft.ts'
import { hasFinishedSpawning } from '@/core/systems/wave.ts'
import type { DefId, Enemy, World } from '@/core/types.ts'

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

/** A thief leaves the map with what it carried, by either flight. */
function escape(world: World, enemy: Enemy): void {
	const items = escapeWith(world, enemy)
	world.events.push({ kind: 'thiefEscaped', enemyId: enemy.id, defId: enemy.defId, items })
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

		// **Before the death branch.** A fled enemy left on 1 HP by a shot that was already in the air
		// has to leave rather than die at the skirting board -- dying there would pay a crumb onto a
		// board whose crumbs were just forfeited and count a kill for something that got away.
		//
		// No `enemyKilled`, no `enemiesKilled`, no `dropCrumb`: it is gone. A woken thief takes what it
		// was carrying with it -- otherwise the items stay held by an enemy that no longer exists.
		if (enemy.flags.fleeing && enemy.distance <= 0) {
			if (enemy.theft !== null) {
				escape(world, enemy)
			}
			continue
		}

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
			// Under the crumb. A no-op for the many that carry nothing.
			dropCarried(world, enemy, at)
			continue
		}

		// **After** the death branch, so a kill on the tick it reaches the crack is a kill.
		if (isThiefFleeing(enemy) && enemy.distance <= 0) {
			escape(world, enemy)
			continue
		}

		// A thief never leaks, whatever its distance: it is at the fridge to grab, and `theft` runs
		// before this. Asked explicitly rather than trusted to the slot order, or moving `theft` after
		// `resolve` would have an arriving Mouse eaten as an ordinary leak on its arrival tick.
		if (enemy.theft !== null || path === undefined || enemy.distance < totalLength(path)) {
			survivors.push(enemy)
			continue
		}

		const eaten = takeFood(world, enemy)
		world.events.push({ kind: 'enemyLeaked', enemyId: enemy.id, defId: enemy.defId, stolenItems: eaten })
	}

	if (survivors.length !== world.enemies.length) {
		world.enemies = survivors
		reindexEnemies(world)
	}

	// "The fridge is empty" is every item gone, never a zero length -- see `NightState.food`. Food on
	// the floor is not gone, so it holds this off the way carried food does.
	if (night.food.every(isGone)) {
		night.phase = 'lost'
		// After the phase, which sets the loss rate, and before `nightEnded`, so a reader of the event
		// finds the pay already there.
		night.pay = groceryMoneyFor(world)
		world.events.push({ kind: 'nightEnded', won: false })
		return
	}

	const wave = night.wave
	const lastWaveIsOut = wave !== null && night.waveIndex === night.waveCount - 1 && hasFinishedSpawning(wave)

	if (lastWaveIsOut && world.enemies.length === 0) {
		night.phase = 'won'
		// Before `nightEnded`, so the summary built off this tick already counts it lost.
		forfeitDroppedFood(world)
		// After the forfeit, so food left on the floor is not paid for as saved.
		night.pay = groceryMoneyFor(world)
		world.events.push({ kind: 'nightEnded', won: true })
	}
}
