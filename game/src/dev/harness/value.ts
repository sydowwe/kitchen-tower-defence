/**
 * What a tower is worth to a scripted player, read off the shop card and tonight's preview. Every
 * number here is one a person could see before tick 0: `statsFor` is the card, `buildPreview` is the
 * loadout screen. Nothing reads `night.waves`, so the gap between `optimal` and `blind` measures what
 * the preview gives a player and not what the file knows.
 */

import { getEnemyDef, getNightDef } from '@/core/content/index.ts'
import { resolveDamage } from '@/core/content/matrix.ts'
import { trackCoverage } from '@/core/coverage.ts'
import { canPlace } from '@/core/map.ts'
import { canPlaceTower } from '@/core/systems/placement.ts'
import { isFlyer } from '@/core/systems/targeting.ts'
import { buildPreview } from '@/ui/kitchenView.ts'
import { statsFor } from '@/ui/viewModel.ts'
import type { TowerDef } from '@/core/content/index.ts'
import type { DefId, DifficultyId, EnemyTag, MapDef, Vec2, World } from '@/core/types.ts'

/** One enemy of tonight's preview, weighted by how much of the night's HP it is. */
export interface WeightedEnemy {
	tags: readonly EnemyTag[]
	/** `count x hp`: what a tower has to chew through of this one. */
	weight: number
}

/** Tonight's composition as the loadout screen shows it: ids and counts, the defs for HP and tags. */
export function compositionOf(nightId: DefId, difficulty: DifficultyId): WeightedEnemy[] {
	return buildPreview(getNightDef(nightId), difficulty).enemies.map(entry => {
		const def = getEnemyDef(entry.id)
		return { tags: def.tags, weight: entry.count * def.hp }
	})
}

export function hasFlyer(composition: readonly WeightedEnemy[]): boolean {
	return composition.some(enemy => enemy.weight > 0 && isFlyer(enemy))
}

/** Whether the card says this tower can touch a flyer. */
export function hitsAir(def: TowerDef): boolean {
	const targets = statsFor(def).targets
	return targets === 'air' || targets === 'both'
}

export function crumbsPerSecondOf(def: TowerDef): number {
	return statsFor(def).crumbsPerSecond ?? 0
}

export function isEconomy(def: TowerDef): boolean {
	return statsFor(def).crumbsPerSecond !== null
}

/**
 * Whether this tower damages this enemy at all: card DPS above 0, and the card's `targets` against
 * `isFlyer`. Sticky Tape and the economy towers answer nothing.
 */
export function answers(def: TowerDef, enemy: WeightedEnemy): boolean {
	const stats = statsFor(def)
	if (stats.dps === null || stats.dps === 0 || stats.damageType === null) {
		return false
	}
	return stats.targets === 'both' || (stats.targets === 'air') === isFlyer(enemy)
}

/** Per entry, weight x matrix multiplier (0 where the tower doesn't `answer`), and the weight in all. */
function weightedOf(
	def: TowerDef,
	composition: readonly WeightedEnemy[],
): { dps: number; weighted: number[]; total: number } {
	const stats = statsFor(def)
	let total = 0
	const weighted = composition.map(enemy => {
		total += enemy.weight
		if (stats.dps === null || stats.damageType === null || !answers(def, enemy)) {
			return 0
		}
		return enemy.weight * resolveDamage(1, stats.damageType, { tags: enemy.tags, statuses: [] })
	})
	return { dps: stats.dps ?? 0, weighted, total }
}

/**
 * What `valueOf` sums, one term per composition entry: card DPS x that enemy's matrix multiplier x its
 * share of tonight's count x HP, and 0 for an enemy the tower doesn't `answer`.
 */
export function damageTermsOf(def: TowerDef, composition: readonly WeightedEnemy[]): number[] {
	const { dps, weighted, total } = weightedOf(def, composition)
	return weighted.map(term => (total === 0 ? 0 : dps * (term / total)))
}

/**
 * The card's DPS times the mean matrix multiplier over tonight's enemies, weighted by count x HP. An
 * enemy the card's `targets` cannot reach multiplies by 0. The card's number and not a second DPS
 * formula: it undervalues the Spray Bottle's poison exactly as a person reading the shop would.
 *
 * Summed before it is scaled, not as the sum of `damageTermsOf`: the Salt Shaker and the Mousetrap tie
 * exactly per crumb, and the last bit of a reordered sum would break that tie for `optimalLoadout`.
 */
export function valueOf(def: TowerDef, composition: readonly WeightedEnemy[]): number {
	const { dps, weighted, total } = weightedOf(def, composition)
	return total === 0 ? 0 : dps * (weighted.reduce((sum, term) => sum + term, 0) / total)
}

/**
 * Damage terms credited for the part of tonight the board doesn't already answer. An enemy `others`
 * standing answer is shared with them, term ÷ (1 + others), the way a new economy tower shares with the
 * economy standing. The enemies nothing standing answers are the gap, and the gap is credited as if it
 * were the whole night: their terms scaled by all of tonight's weight over theirs. On an empty board
 * that is every enemy, and the terms are `valueOf`'s.
 */
export function sharedValue(
	terms: readonly number[],
	others: readonly number[],
	composition: readonly WeightedEnemy[],
): number {
	let total = 0
	let gap = 0
	for (const [index, enemy] of composition.entries()) {
		total += enemy.weight
		if ((others[index] ?? 0) === 0) {
			gap += enemy.weight
		}
	}

	let value = 0
	for (const [index, term] of terms.entries()) {
		const answering = others[index] ?? 0
		value += answering === 0 ? term * (total / gap) : term / (1 + answering)
	}
	return value
}

/**
 * How far from its tile a tower does its job, for `trackCoverage`. An economy tower's is the radius it
 * collects (or lures) in, since piles drop where enemies die. A path-only tower stands on the track and
 * reaches the half tile it stands on plus its heat ring -- the card's `heatRadiusTiles: 0` would
 * otherwise score the Gas Stove Burner 0 and nobody would have chosen that.
 */
export function reachOf(def: TowerDef): number {
	const stats = statsFor(def)
	if (def.placement === 'path_only') {
		return 0.5 + (stats.heatRadiusTiles ?? 0)
	}
	return (
		stats.rangeTiles ??
		stats.collectRadiusTiles ??
		stats.lureRadiusTiles ??
		stats.revealRadiusTiles ??
		stats.suppressRadiusTiles ??
		stats.cleanseRadiusTiles ??
		0
	)
}

/**
 * Whether this tower could stand here if the wallet allowed: `canPlaceTower` with its last check,
 * the price, left out. Asked at decision time, every time -- a tile legal at `begin` may be fouled by
 * mold or occupied by now.
 */
export function placeableButForPrice(world: World, def: TowerDef, tile: Vec2): boolean {
	const result = canPlaceTower(world, def, tile)
	return result.ok || result.reason === 'tooExpensive'
}

/** Every tile a tower of this def may ever stand on with some track in reach, in row-major order. */
export function candidateTiles(map: MapDef, def: TowerDef, coverage: CoverageCache): Vec2[] {
	return coverage.reaching(reachOf(def)).filter(tile => canPlace(map, tile, def.placement))
}

/**
 * `trackCoverage` per reach per tile, filled the first time a reach is asked for. Map-only, so a
 * policy builds one in `begin` and keeps it on itself for the night.
 */
export interface CoverageCache {
	at(tile: Vec2, reach: number): number
	/** Every tile in row-major order with coverage above 0 at this reach. */
	reaching(reach: number): readonly Vec2[]
}

export function createCoverageCache(map: MapDef): CoverageCache {
	const grids = new Map<number, number[]>()
	const reachingTiles = new Map<number, Vec2[]>()

	function grid(reach: number): number[] {
		const cached = grids.get(reach)
		if (cached !== undefined) {
			return cached
		}
		const built: number[] = []
		for (let y = 0; y < map.heightTiles; y++) {
			for (let x = 0; x < map.widthTiles; x++) {
				built.push(trackCoverage(map, { x, y }, reach))
			}
		}
		grids.set(reach, built)
		return built
	}

	return {
		at(tile, reach) {
			return grid(reach)[tile.y * map.widthTiles + tile.x] ?? 0
		},
		reaching(reach) {
			const cached = reachingTiles.get(reach)
			if (cached !== undefined) {
				return cached
			}
			const values = grid(reach)
			const tiles: Vec2[] = []
			for (let y = 0; y < map.heightTiles; y++) {
				for (let x = 0; x < map.widthTiles; x++) {
					if ((values[y * map.widthTiles + x] ?? 0) > 0) {
						tiles.push({ x, y })
					}
				}
			}
			reachingTiles.set(reach, tiles)
			return tiles
		},
	}
}
