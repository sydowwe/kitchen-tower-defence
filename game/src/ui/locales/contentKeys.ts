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
import type { TOWERS } from '@/core/content/towers.ts'

/** The two keys every def carries: `<kind>.<id>.name` and `<kind>.<id>.description`. */
interface Entry {
	name: string
	description: string
}

export type TowerMessages = Record<(typeof TOWERS)[number]['id'], Entry>

export type EnemyMessages = Record<(typeof ENEMIES)[number]['id'], Entry>
