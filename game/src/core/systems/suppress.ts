/**
 * Where an enemy ability is switched off: the interpreter for the `suppress` behaviour.
 *
 * **A query and not a system slot.** Suppression does nothing on its own; it is a question the system
 * that owns an ability asks before using it. `core/systems/burrow.ts` is the only caller today.
 *
 * It filters on `behaviour.suppresses` and never names an ability itself, so a second `SuppressKind`
 * is a config entry plus the one system that asks about it, and no line here.
 */

import { isSuppress } from '@/core/content/behaviours.ts'
import type { SuppressKind } from '@/core/content/behaviours.ts'
import { effectiveDefOf } from '@/core/content/index.ts'
import type { World } from '@/core/types.ts'

/** One suppressing radius, flattened. Built once per tick and shared across every enemy, like `lightsOf`. */
export interface SuppressionZone {
	x: number
	y: number
	radiusTiles: number
}

/** Every radius on the board that switches `ability` off, from each tower's **effective** def. */
export function suppressionZones(world: World, ability: SuppressKind): SuppressionZone[] {
	const zones: SuppressionZone[] = []

	for (const tower of world.towers) {
		for (const behaviour of effectiveDefOf(tower).behaviours) {
			if (isSuppress(behaviour) && behaviour.suppresses === ability) {
				zones.push({ x: tower.tile.x, y: tower.tile.y, radiusTiles: behaviour.radiusTiles })
			}
		}
	}

	return zones
}

/** Whether `at` is inside any of `zones`. Tile centre to position, `<=`, like every other radius. */
export function isSuppressedAt(zones: readonly SuppressionZone[], at: { x: number; y: number }): boolean {
	return zones.some(zone => {
		const dx = at.x - zone.x
		const dy = at.y - zone.y
		return dx * dx + dy * dy <= zone.radiusTiles * zone.radiusTiles
	})
}
