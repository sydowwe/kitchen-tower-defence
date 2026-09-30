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
import { FOODS } from '@/core/content/food.ts'
import { INSTALLATIONS } from '@/core/content/installations.ts'
import { MAPS } from '@/core/content/maps/index.ts'
import { NIGHTS } from '@/core/content/nights.ts'
import { validateContentInDev } from '@/core/content/schema.ts'
import { POST_V1_TOWERS, TOWERS } from '@/core/content/towers.ts'
import { foldUpgrades } from '@/core/content/upgrades.ts'
import type { EnemyDef, FoodDef, InstallationDef, NightDef, TowerDef } from '@/core/content/schema.ts'
import type { DefId, MapDef, Tower } from '@/core/types.ts'

export * from '@/core/content/behaviours.ts'
export * from '@/core/content/difficulty.ts'
export * from '@/core/content/enemies.ts'
export * from '@/core/content/food.ts'
export * from '@/core/content/installations.ts'
export * from '@/core/content/matrix.ts'
export * from '@/core/content/nights.ts'
export * from '@/core/content/statuses.ts'
export * from '@/core/content/tileEffects.ts'
export * from '@/core/content/towers.ts'
export * from '@/core/content/upgrades.ts'
export { MAP_SOURCES, MAPS } from '@/core/content/maps/index.ts'
export type {
	EnemyDef,
	FoodDef,
	InstallationDef,
	MapSource,
	NightDef,
	TowerDef,
	TowerRole,
} from '@/core/content/schema.ts'

/**
 * `statuses` is absent on purpose: the status *defs* are runtime tables keyed by `StatusKind` in
 * `core/content/statuses.ts`, not an authored collection, and its slot on `RawContent` stays empty
 * until there is something in the schema's shape to check. `tileEffects` is absent for exactly that
 * reason -- `Record<TileEffectKind, TileEffectDef>` is already exhaustive at the type level.
 *
 * `installations` joined the list in step 13A and holds eleven of analytic-docs/CONTENT.md section
 * 8's fourteen since step 20A. The three loadout slots are step 20a's.
 *
 * `maps` is absent for a different reason: `core/content/maps/index.ts` validates its own sources,
 * because that check has to run before `loadMap` derives a `MapDef` from them.
 */
// `POST_V1_TOWERS` beside the roster: nobody can buy one, and a typo in it still fails at boot.
validateContentInDev({
	towers: [...TOWERS, ...POST_V1_TOWERS],
	enemies: ENEMIES,
	food: FOODS,
	nights: NIGHTS,
	installations: INSTALLATIONS,
})

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

export function getFoodDef(id: DefId): FoodDef {
	return lookup('food', FOODS, id)
}

export function getMapDef(id: DefId): MapDef {
	return lookup('map', MAPS, id)
}

export function getNightDef(id: DefId): NightDef {
	return lookup('night', NIGHTS, id)
}

export function getInstallationDef(id: DefId): InstallationDef {
	return lookup('installation', INSTALLATIONS, id)
}

/**
 * The index of the night that unlocks this tower, or null for one no night unlocks -- a post-v1
 * tower, or a synthetic one in a spec. Null rather than a throw: "never" is an answer here.
 */
export function unlockNightOf(towerId: DefId): number | null {
	return NIGHTS.find(night => night.unlocksTowerIds?.includes(towerId) === true)?.index ?? null
}

/**
 * Every folded def, keyed `` `${defId}|${tier}` ``. Forty entries at most, every one immutable, and
 * **nothing ever invalidates it**: a different tier is a different key, so "invalidated on upgrade"
 * is true by construction rather than by a call someone forgets.
 *
 * Module-level and never on `World`: the `Serialisable<World>` guard in `tests/types.spec.ts`
 * rejects a `Map` on the world, and `core/path.ts`'s arc-length cache is the precedent.
 */
const effectiveDefs = new Map<string, TowerDef>()

/**
 * The def a tower of this type at this tier actually has -- the numbers every system should read
 * about a *placed* tower, where `getTowerDef` is the base def a shop button and `PlaceTower` read.
 *
 * **Step 17's aura buffs are not folded in here.** The fold is content, a pure function of
 * `(defId, tier)`. A buff is world state and belongs at the damage site: folding one in would make
 * this key depend on the board, and the memo would have to die.
 */
export function effectiveDef(defId: DefId, tier: number): TowerDef {
	const key = `${defId}|${tier}`
	const cached = effectiveDefs.get(key)
	if (cached !== undefined) {
		return cached
	}

	const folded = foldUpgrades(getTowerDef(defId), tier)
	effectiveDefs.set(key, folded)

	return folded
}

/** The same, for a tower standing on the board. Every reader of a placed tower's def wants this. */
export function effectiveDefOf(tower: Tower): TowerDef {
	return effectiveDef(tower.defId, tower.tier)
}
