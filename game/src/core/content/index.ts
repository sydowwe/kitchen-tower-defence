/**
 * Every authored collection in one place, and the boot-time check over all of them.
 *
 * `validateContentInDev` runs **at module load**, so a typo'd def is a startup crash in dev rather
 * than a tower that silently deals zero damage on night 11. Importing anything from `core/content/`
 * -- from the game, from a test, from the balance harness -- is enough to trigger it. In a
 * production build the branch is statically dead and the schemas and zod fall out of the bundle,
 * which is why this file exports no schema (re-exporting one would root it again).
 *
 * The lookups below throw on an unknown id. Every one of them is reachable from a save record or a
 * URL, and an `undefined` def surfaces three systems away from the id that was wrong.
 */

import { ENEMIES } from '@/core/content/enemies.ts'
import { MAPS } from '@/core/content/maps/index.ts'
import { NIGHTS } from '@/core/content/nights.ts'
import { validateContentInDev } from '@/core/content/schema.ts'
import { TOWERS } from '@/core/content/towers.ts'
import type { EnemyDef, NightDef, TowerDef } from '@/core/content/schema.ts'
import type { DefId, MapDef } from '@/core/types.ts'

export * from '@/core/content/behaviours.ts'
export * from '@/core/content/difficulty.ts'
export * from '@/core/content/enemies.ts'
export * from '@/core/content/matrix.ts'
export * from '@/core/content/nights.ts'
export * from '@/core/content/statuses.ts'
export * from '@/core/content/towers.ts'
export { MAP_SOURCES, MAPS } from '@/core/content/maps/index.ts'
export type { EnemyDef, InstallationDef, MapSource, NightDef, TowerDef, TowerRole } from '@/core/content/schema.ts'

/**
 * `statuses` and `installations` are absent on purpose. The status *defs* are runtime tables keyed
 * by `StatusKind` in `core/content/statuses.ts`, not an authored collection; installations are
 * step 20's. Both slots of `RawContent` are optional and stay empty until there is something in the
 * schema's shape to check.
 *
 * `maps` is absent for a different reason: `core/content/maps/index.ts` validates its own sources,
 * because that check has to run before `loadMap` derives a `MapDef` from them.
 */
validateContentInDev({ towers: TOWERS, enemies: ENEMIES, nights: NIGHTS })

function lookup<T extends { id: DefId }>(kind: string, entries: readonly T[], id: DefId): T {
	const found = entries.find(entry => entry.id === id)
	if (found === undefined) {
		throw new Error(`unknown ${kind} id '${id}'`)
	}
	return found
}

export function getTowerDef(id: DefId): TowerDef {
	return lookup('tower', TOWERS, id)
}

export function getEnemyDef(id: DefId): EnemyDef {
	return lookup('enemy', ENEMIES, id)
}

export function getMapDef(id: DefId): MapDef {
	return lookup('map', MAPS, id)
}

export function getNightDef(id: DefId): NightDef {
	return lookup('night', NIGHTS, id)
}
