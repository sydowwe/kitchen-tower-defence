import { effectiveDef, getTowerDef, MAX_TIER } from '@/core/content/index.ts'
import { upgradeCostFor } from '@/core/systems/commands.ts'
import { isDropped } from '@/core/systems/fridge.ts'
import {
	candidateTiles,
	compositionOf,
	createCoverageCache,
	crumbsPerSecondOf,
	isEconomy,
	placeableButForPrice,
	reachOf,
	valueOf,
} from '@/dev/harness/value.ts'
import type { Command } from '@/core/commands.ts'
import type { TowerDef } from '@/core/content/index.ts'
import type { DefId, Vec2, World } from '@/core/types.ts'
import type { CoverageCache, WeightedEnemy } from '@/dev/harness/value.ts'
import type { Policy, PolicyFactory } from '@/dev/harness/types.ts'

/**
 * What an economy tower's income per crumb spent is worth, as a multiple of the best tower purchase on
 * tonight's empty board, before it is shared with the economy already standing. Set by reading what
 * greedy builds on nights 1 and 8, never by its win rate: a constant tuned to make a target pass
 * measures itself. Why it is relative and shared: steps/22-balance-harness/B-policies.md, decision 4.
 */
export const ECONOMY_WEIGHT = 18

/** A purchase and what it is worth per crumb. */
interface Purchase {
	command: Command
	cost: number
	perCrumb: number
}

/** A def at a tier, as greedy reads its card. One per `defId|tier`, built the first time it is asked. */
interface Profile {
	economy: boolean
	/**
	 * For an economy tower, its income in the board's terms before it is shared: crumbs a second x
	 * `economyWeight` x `Plan.reference`. For the rest, card DPS x tonight's matrix.
	 */
	rate: number
	reach: number
}

/** What greedy keeps for the night. Built in `begin`; `decide` only reads it. */
interface Plan {
	composition: WeightedEnemy[]
	coverage: CoverageCache
	/** Tonight's loadout as base defs, in loadout order. */
	defs: TowerDef[]
	/** Per def, the tiles it may stand on with track in reach: best coverage first, ties row-major. */
	tiles: Map<DefId, Vec2[]>
	/** The best value per crumb any tower in the loadout has on tonight's empty board. */
	reference: number
	profiles: Map<string, Profile>
}

function tileKey(world: World, tile: Vec2): number {
	return tile.y * world.map.widthTiles + tile.x
}

/**
 * The upper bound on income, and with `economyWeight` at 0 the whole of `noEconomy`. Clicks every
 * pile and fetches every dropped item each tick, calls each wave the tick its countdown starts, and
 * buys the purchase with the best value per crumb, saving for it while the wallet is short.
 */
function greedyPolicy(name: string, economyWeight: number): PolicyFactory {
	return function createGreedy(): Policy {
		let plan: Plan = {
			composition: [],
			coverage: { at: () => 0, reaching: () => [] },
			defs: [],
			tiles: new Map(),
			reference: 0,
			profiles: new Map(),
		}

		function profileOf(defId: DefId, tier: number): Profile {
			const key = `${defId}|${tier}`
			const cached = plan.profiles.get(key)
			if (cached !== undefined) {
				return cached
			}
			const def = effectiveDef(defId, tier)
			const economy = isEconomy(def)
			const profile: Profile = {
				economy,
				rate: economy
					? crumbsPerSecondOf(def) * economyWeight * plan.reference
					: valueOf(def, plan.composition),
				reach: reachOf(def),
			}
			plan.profiles.set(key, profile)
			return profile
		}

		/**
		 * A tower of this def at this tier, on this tile: its damage over the track it reaches, or its
		 * income shared `economyShare` ways with the economy standing beside it.
		 */
		function worth(defId: DefId, tier: number, tile: Vec2, economyShare: number): number {
			const profile = profileOf(defId, tier)
			return profile.economy ? profile.rate / economyShare : profile.rate * plan.coverage.at(tile, profile.reach)
		}

		function economyStanding(world: World): number {
			return world.towers.filter(tower => profileOf(tower.defId, tower.tier).economy).length
		}

		/** The free tile with the most coverage. Legality is asked now, every time. */
		function bestTile(world: World, def: TowerDef, occupied: Set<number>): Vec2 | null {
			for (const tile of plan.tiles.get(def.id) ?? []) {
				if (!occupied.has(tileKey(world, tile)) && placeableButForPrice(world, def, tile)) {
					return tile
				}
			}
			return null
		}

		/**
		 * A path-only tower goes on the track tile inside the most standing towers' reach, ties
		 * row-major: where a burner or a wall is covered by what is already built.
		 */
		function bestTrackTile(world: World, def: TowerDef, occupied: Set<number>): Vec2 | null {
			let best: Vec2 | null = null
			let bestCount = -1
			for (const tile of plan.tiles.get(def.id) ?? []) {
				if (occupied.has(tileKey(world, tile)) || !placeableButForPrice(world, def, tile)) {
					continue
				}
				let count = 0
				for (const tower of world.towers) {
					const reach = profileOf(tower.defId, tower.tier).reach
					if (Math.hypot(tower.tile.x - tile.x, tower.tile.y - tile.y) <= reach) {
						count++
					}
				}
				if (count > bestCount) {
					best = tile
					bestCount = count
				}
			}
			return best
		}

		function placements(world: World, occupied: Set<number>, economy: number): Purchase[] {
			const found: Purchase[] = []
			for (const def of plan.defs) {
				// Worth nothing tonight wherever it stands: never bought, and no tile is searched for it.
				if (profileOf(def.id, 0).rate <= 0) {
					continue
				}
				const tile =
					def.placement === 'path_only' ? bestTrackTile(world, def, occupied) : bestTile(world, def, occupied)
				if (tile === null) {
					continue
				}
				// A new economy tower shares with every one standing, itself included.
				const perCrumb = worth(def.id, 0, tile, economy + 1) / def.cost
				if (perCrumb > 0) {
					found.push({
						command: { kind: 'PlaceTower', defId: def.id, tile: { x: tile.x, y: tile.y } },
						cost: def.cost,
						perCrumb,
					})
				}
			}
			return found
		}

		function upgrades(world: World, economy: number): Purchase[] {
			const found: Purchase[] = []
			for (const tower of world.towers) {
				if (tower.tier >= MAX_TIER) {
					continue
				}
				const cost = upgradeCostFor(world, tower)
				// An economy tower being upgraded is already one of the `economy` standing.
				const share = Math.max(1, economy)
				const gained =
					worth(tower.defId, tower.tier + 1, tower.tile, share) -
					worth(tower.defId, tower.tier, tower.tile, share)
				if (cost > 0 && gained > 0) {
					found.push({ command: { kind: 'UpgradeTower', towerId: tower.id }, cost, perCrumb: gained / cost })
				}
			}
			return found
		}

		/** The best purchase there is, affordable or not. The first one found keeps a tie. */
		function bestPurchase(world: World): Purchase | null {
			const occupied = new Set(world.towers.map(tower => tileKey(world, tower.tile)))
			const economy = economyStanding(world)
			let best: Purchase | null = null
			for (const purchase of [...placements(world, occupied, economy), ...upgrades(world, economy)]) {
				if (best === null || purchase.perCrumb > best.perCrumb) {
					best = purchase
				}
			}
			return best
		}

		return {
			name,
			economy: economyWeight > 0,
			begin(world, night) {
				const coverage = createCoverageCache(world.map)
				const defs = night.loadout.map(getTowerDef)
				const tiles = new Map<DefId, Vec2[]>()
				for (const def of defs) {
					const reach = reachOf(def)
					// `sort` is stable, so equal coverage keeps the row-major order the candidates come in.
					tiles.set(
						def.id,
						candidateTiles(world.map, def, coverage).sort(
							(a, b) => coverage.at(b, reach) - coverage.at(a, reach),
						),
					)
				}
				const composition = compositionOf(world.night.nightId, world.difficulty.id)
				let reference = 0
				for (const def of defs) {
					const best = tiles.get(def.id)?.[0]
					if (!isEconomy(def) && best !== undefined) {
						const perCrumb = (valueOf(def, composition) * coverage.at(best, reachOf(def))) / def.cost
						reference = Math.max(reference, perCrumb)
					}
				}
				plan = { composition, coverage, defs, tiles, reference, profiles: new Map() }
			},
			decide(world) {
				const commands: Command[] = []

				// The ids on the board this tick, never remembered ones: a pile merges into another.
				for (const pile of world.crumbPiles) {
					commands.push({ kind: 'CollectCrumb', crumbId: pile.id })
				}
				for (const item of world.night.food) {
					if (isDropped(item)) {
						commands.push({ kind: 'CollectFood', foodId: item.id })
					}
				}
				if (world.night.phase === 'countdown') {
					commands.push({ kind: 'CallWaveEarly' })
				}

				const best = bestPurchase(world)
				if (best !== null && best.cost <= world.crumbs) {
					commands.push(best.command)
				}
				return commands
			},
		}
	}
}

export const greedy: PolicyFactory = greedyPolicy('greedy', ECONOMY_WEIGHT)

/** `greedy` with economy worth nothing, and bringing none: one knob, so the comparison isolates it. */
export const noEconomy: PolicyFactory = greedyPolicy('noEconomy', 0)
