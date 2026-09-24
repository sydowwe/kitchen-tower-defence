/**
 * The Weevil going under the floor and coming back up.
 *
 * **Stateless and recomputed every tick**, the rule `core/systems/light.ts` and
 * `core/systems/barricades.ts` are built on: `flags.burrowed` is written unconditionally from the
 * window rolled at spawn and the Bay Leaves on the board right now. So a Weevil that leaves a Bay Leaf
 * radius while still inside its window burrows again, and selling the Bay Leaf needs no field cleared
 * anywhere.
 *
 * **Never writes `untargetable`.** That flag is the wake's (`core/systems/noise.ts`), and a system
 * rewriting it every tick would hand every fled enemy back to the towers on the next one.
 *
 * It runs after `movement`, so a Weevil stepping into a Bay Leaf radius is targetable in the same
 * tick, and before `barricades`, so a burrowed one is never clamped to a box.
 */

import { enemyPosition } from '@/core/systems/spatial.ts'
import { isSuppressedAt, suppressionZones } from '@/core/systems/suppress.ts'
import type { World } from '@/core/types.ts'

export function burrowSystem(world: World): void {
	// Terminal phases run nothing, or Weevils keep diving behind the summary screen.
	if (world.night.phase === 'won' || world.night.phase === 'lost') {
		return
	}

	// Built lazily: most nights have no Weevil, and this runs for every enemy every tick.
	let zones: ReturnType<typeof suppressionZones> | null = null

	for (const enemy of world.enemies) {
		const span = enemy.burrowWindow
		if (span === null) {
			continue
		}

		let burrowed = enemy.distance >= span.fromTiles && enemy.distance < span.toTiles
		const at = enemyPosition(world, enemy)
		if (burrowed && at !== null) {
			zones ??= suppressionZones(world, 'burrow')
			burrowed = !isSuppressedAt(zones, at)
		}

		if (burrowed !== enemy.flags.burrowed && at !== null) {
			world.events.push({
				kind: burrowed ? 'enemyBurrowed' : 'enemySurfaced',
				enemyId: enemy.id,
				at: { x: at.x, y: at.y },
			})
		}
		enemy.flags.burrowed = burrowed
	}
}
