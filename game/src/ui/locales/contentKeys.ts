/**
 * The bridge that makes an untranslated def a build error.
 *
 * `core/content/` carries keys and never English (CLAUDE.md, "Strings"), which leaves one gap: a
 * tower whose `nameKey` has no catalogue entry compiles fine and renders `tower.saltShaker.name`
 * on screen. The types below close it -- `en.ts` satisfies them, so an entry per tower id and per
 * enemy id is required, spelled exactly as the def's key derives it.
 *
 * The imports are type-only, so nothing from `core/` is pulled into the catalogue's bundle.
 */

import type { ENEMIES } from '@/core/content/enemies.ts'
import type { FOODS } from '@/core/content/food.ts'
import type { INSTALLATIONS } from '@/core/content/installations.ts'
import type { TOWERS } from '@/core/content/towers.ts'
import type { PlacementRejection } from '@/core/systems/placement.ts'
import type { EnemyTag } from '@/core/types.ts'

/** The two keys every def carries: `<kind>.<id>.name` and `<kind>.<id>.description`. */
interface Entry {
	name: string
	description: string
}

/**
 * The three upgrade tiers, nested under the tower's own entry, because that is where the key
 * `core/content/towers.ts` derives lands: `tower.saltShaker.tier1.name`.
 *
 * **Tiers 1 and 2 have no description.** The inspector's before -> after diff says "5 -> 7", and a
 * sentence under it reading "more damage" is noise. Tier 3 changes what the tower *does*, so it has
 * one -- and `TowerUpgrade.descriptionKey` is null for the other two to match.
 */
export interface TowerUpgradeMessages {
	tier1: { name: string }
	tier2: { name: string }
	tier3: Entry
}

export type TowerMessages = Record<(typeof TOWERS)[number]['id'], Entry & TowerUpgradeMessages>

export type EnemyMessages = Record<(typeof ENEMIES)[number]['id'], Entry>

/**
 * Deliberately **not** `Entry`. A food item has a name and nothing else to say: the night-end
 * summary lists what you lost by name, and nothing anywhere renders a description of cheese.
 * Reusing `Entry` here would mean inventing twelve lines of flavour text no screen shows.
 */
export type FoodMessages = Record<(typeof FOODS)[number]['id'], { name: string }>

/**
 * `Entry`, because an installation is bought off a card that has to say what it does -- "+25 to the
 * noise cap" is the whole reason to spend 100 Grocery Money on a door.
 *
 * `INSTALLATIONS` is three of analytic-docs/CONTENT.md section 8's fourteen today, so this type
 * grows by itself as step 20 authors the rest: each one lands as a build error here rather than as
 * `installation.buyABroom.name` on a panel.
 */
export type InstallationMessages = Record<(typeof INSTALLATIONS)[number]['id'], Entry>

/**
 * The same trick over a vocabulary rather than a collection: `PlacementRejection` is nine string
 * literals in `core/systems/placement.ts`, and `hud.reject` has to answer all of them. A tenth added
 * later fails the build here instead of a toast rendering `onTrack`.
 *
 * Step 14A's `fouled` is what that promise caught: adding the ninth member broke `type-check` here
 * until the English for it existed, which is the rule working rather than the rule in the way.
 *
 * Step 10B's Cardboard Box needed none: `canPlace` has answered `path_only` since step 3A, and
 * `hud.reject.offTrack` -- "This one goes on the track itself." -- has been the English for it since
 * step 8A.
 */
export type RejectionMessages = Record<PlacementRejection, string>

/**
 * `hud.tag`, over `EnemyTag`, by the same trick. The enemy tooltip prints every tag an enemy carries,
 * so a nineteenth tag fails the build here instead of rendering `hud.tag.newTag` over a bug.
 */
export type TagMessages = Record<EnemyTag, string>
