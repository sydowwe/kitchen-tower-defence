/**
 * Everything the notebook is allowed to know: `loadoutView.ts`'s rules for the screen a player goes to
 * for the counter system. Keys and numbers, never English, nothing that holds a reference into the
 * progress it was built from. Components under `ui/components/codex/` import from here and never from
 * `core/`.
 *
 * **What has been seen is derived, never saved** (step 23E, decision 2). An undiscovered entry is its
 * own type with no `nameKey` on it, so a silhouette cannot give away a name by accident.
 */

import { currentNight, endlessTowerIds, endlessUnlocked, unlockedTowerIds } from '@/core/campaign.ts'
import {
	DAMAGE_MATRIX,
	effectivenessOf,
	ENEMIES,
	NIGHTS,
	resolveDamage,
	resolveDifficulty,
	unlockNightOf,
} from '@/core/content/index.ts'
import { enemyIdsOf } from '@/ui/kitchenView.ts'
import { DAMAGE_TYPES, round2, shopOrder, statsFor, TICKS_PER_SECOND } from '@/ui/viewModel.ts'
import type { Progress } from '@/core/campaign.ts'
import type { EnemyDef, TowerDef, TowerRole } from '@/core/content/index.ts'
import type { DamageType, DefId } from '@/core/types.ts'
import type { PreviewEntryView } from '@/ui/kitchenView.ts'
import type { Effectiveness, EnemyDamageView, TowerStatsView } from '@/ui/viewModel.ts'

export type { DefId } from '@/core/types.ts'

export interface CodexTowerEntry {
	discovered: true
	id: DefId
	glyph: string
	nameKey: string
	descriptionKey: string
	role: TowerRole
	placement: TowerDef['placement']
	cost: number
	stats: TowerStatsView
	/** Always three, in tier order. */
	tierNameKeys: string[]
}

/** A shape, and the night it arrives. Null is a tower no night unlocks, which v1's roster does not have. */
export interface CodexTowerSilhouette {
	discovered: false
	id: DefId
	glyph: string
	arrivesNight: number | null
}

export type CodexTowerView = CodexTowerEntry | CodexTowerSilhouette

export interface CodexEnemyEntry {
	discovered: true
	id: DefId
	glyph: string
	nameKey: string
	descriptionKey: string
	/** At the campaign's tier, rounded up the way the enemy tooltip rounds, so the two never disagree. */
	hp: number
	speedTilesPerSecond: number
	reward: number
	steals: number
	/** Every tag, `hud.tag.<tag>`, in the def's order. */
	tagKeys: string[]
	/** All five, in `DAMAGE_TYPES` order: the product of every tag, with no status on it. */
	damage: EnemyDamageView[]
	firstNight: number
}

/** A shape and nothing else. An enemy does not announce when it is coming. */
export interface CodexEnemySilhouette {
	discovered: false
	id: DefId
	glyph: string
}

export type CodexEnemyView = CodexEnemyEntry | CodexEnemySilhouette

export interface CodexGridCell {
	damageType: DamageType
	multiplier: number
	band: Effectiveness
}

/** One row of the matrix, and the discovered enemies it applies to. */
export interface CodexGridRow {
	tag: string
	/** `hud.tag.<tag>`. */
	tagKey: string
	enemies: PreviewEntryView[]
	cells: CodexGridCell[]
}

export interface CodexGridView {
	columns: DamageType[]
	/** In `DAMAGE_MATRIX` order. Only the tags a discovered enemy carries that have a row. */
	rows: CodexGridRow[]
}

export interface CodexView {
	/** In `shopOrder`, seen or not. */
	towers: CodexTowerView[]
	/** By the night each first appears, seen or not, ties in `ENEMIES` order. */
	enemies: CodexEnemyView[]
	grid: CodexGridView
}

/**
 * **The named exception**, from analytic-docs/CONTENT.md section 2: the Fruit Fly is in no wave, and
 * hatches from crumbs left too long from night 1 onward. It is written here rather than derived from
 * the crumbs system, because that is a rule about a world and this has only a progress.
 */
const HATCHED_FROM_NIGHT_ONE: DefId = 'fruitFly'

/**
 * Past the end of the campaign, or back on night 1 of another with a tier cleared. `cleared` survives
 * `startCampaign`, and so does endless: its counter shows every tower, so a notebook that had gone
 * dark would be calling them unseen while the player chooses between them.
 */
function seenEverything(progress: Progress): boolean {
	return progress.nightId === null || endlessUnlocked(progress)
}

function discoveredTowerIds(progress: Progress): Set<DefId> {
	return new Set(seenEverything(progress) ? endlessTowerIds() : unlockedTowerIds(progress))
}

/** The last night whose waves have been seen. Tonight's count: its preview already shows them. */
function seenThroughNight(progress: Progress): number {
	return seenEverything(progress) ? Infinity : (currentNight(progress)?.index ?? Infinity)
}

/** Each enemy's first night, in one walk of the waves. An enemy no night sends and no rule hatches has none. */
function firstNights(): Map<DefId, number> {
	const first = new Map<DefId, number>([[HATCHED_FROM_NIGHT_ONE, 1]])
	for (const night of NIGHTS) {
		for (const id of enemyIdsOf(night)) {
			if (!first.has(id)) {
				first.set(id, night.index)
			}
		}
	}
	return first
}

function towerView(def: TowerDef, discovered: ReadonlySet<DefId>): CodexTowerView {
	if (!discovered.has(def.id)) {
		return { discovered: false, id: def.id, glyph: def.glyph, arrivesNight: unlockNightOf(def.id) }
	}
	return {
		discovered: true,
		id: def.id,
		glyph: def.glyph,
		nameKey: def.nameKey,
		descriptionKey: def.descriptionKey,
		role: def.role,
		placement: def.placement,
		cost: def.cost,
		stats: statsFor(def),
		tierNameKeys: def.upgrades.map(upgrade => upgrade.nameKey),
	}
}

/** The product of every tag, through the one function that deals damage. Never an average. */
function damageAgainst(def: EnemyDef): EnemyDamageView[] {
	return DAMAGE_TYPES.map(damageType => {
		const multiplier = resolveDamage(1, damageType, { tags: def.tags, statuses: [] })
		return { damageType, multiplier: round2(multiplier), band: effectivenessOf(multiplier) }
	})
}

function enemyEntry(def: EnemyDef, firstNight: number, hpMult: number): CodexEnemyEntry {
	return {
		discovered: true,
		id: def.id,
		glyph: def.glyph,
		nameKey: def.nameKey,
		descriptionKey: def.descriptionKey,
		hp: Math.ceil(def.hp * hpMult),
		speedTilesPerSecond: round2(def.speedTilesPerTick * TICKS_PER_SECOND),
		reward: def.reward,
		steals: def.steals,
		tagKeys: def.tags.map(tag => `hud.tag.${tag}`),
		damage: damageAgainst(def),
		firstNight,
	}
}

/** Only the rows a discovered enemy gives a reason to read. Object order is `DAMAGE_MATRIX`'s own. */
function buildGrid(discovered: readonly EnemyDef[]): CodexGridView {
	const rows = Object.entries(DAMAGE_MATRIX).flatMap(([tag, row]): CodexGridRow[] => {
		const carriers = discovered.filter(def => def.tags.some(carried => carried === tag))
		if (carriers.length === 0) {
			return []
		}
		return [
			{
				tag,
				tagKey: `hud.tag.${tag}`,
				enemies: carriers.map(def => ({ id: def.id, glyph: def.glyph, nameKey: def.nameKey })),
				cells: DAMAGE_TYPES.map(damageType => ({
					damageType,
					multiplier: row[damageType],
					band: effectivenessOf(row[damageType]),
				})),
			},
		]
	})

	return { columns: [...DAMAGE_TYPES], rows }
}

export function buildCodexView(progress: Progress): CodexView {
	const seenThrough = seenThroughNight(progress)
	const towersSeen = discoveredTowerIds(progress)
	const first = firstNights()
	const hpMult = resolveDifficulty(progress.difficulty).enemyHpMult

	function firstNightOf(id: DefId): number {
		return first.get(id) ?? Infinity
	}

	const roster: EnemyDef[] = [...ENEMIES]
	const byArrival = roster.sort((a, b) => firstNightOf(a.id) - firstNightOf(b.id))
	const enemiesSeen = byArrival.filter(def => firstNightOf(def.id) <= seenThrough)

	return {
		towers: shopOrder().map(def => towerView(def, towersSeen)),
		enemies: byArrival.map(def =>
			enemiesSeen.includes(def)
				? enemyEntry(def, firstNightOf(def.id), hpMult)
				: { discovered: false, id: def.id, glyph: def.glyph },
		),
		grid: buildGrid(enemiesSeen),
	}
}
