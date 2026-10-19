import { effectiveDef, getTowerDef, MAX_TIER } from '@/core/content/index.ts'
import { upgradeCostFor } from '@/core/systems/commands.ts'
import { isDropped } from '@/core/systems/fridge.ts'
import { samplePath } from '@/core/path.ts'
import { enemyPosition } from '@/core/systems/spatial.ts'
import {
	answers,
	candidateTiles,
	compositionOf,
	createCoverageCache,
	crumbsPerSecondOf,
	damageTermsOf,
	isEconomy,
	placeableButForPrice,
	reachOf,
	sharedValue,
	valueOf,
} from '@/dev/harness/value.ts'
import type { Command } from '@/core/commands.ts'
import type { TowerDef } from '@/core/content/index.ts'
import type { DefId, EntityId, MapDef, Vec2, World } from '@/core/types.ts'
import type { CoverageCache, WeightedEnemy } from '@/dev/harness/value.ts'
import type { Policy, PolicyFactory } from '@/dev/harness/types.ts'

/**
 * What an economy tower's income per crumb spent is worth, as a multiple of the best tower purchase on
 * tonight's empty board, before it is shared with the economy already standing. Set by reading what
 * greedy builds on nights 1 and 8, never by its win rate: a constant tuned to make a target pass
 * measures itself. Why it is relative and shared: steps/22-balance-harness/B-policies.md, decision 4;
 * why 4 and no longer 18: B2-greedy-answers-the-gap.md, decision 5; why 8 since D halved the Crumb
 * Tray's income: D-tuning-the-curve.md, decision 10.
 */
export const ECONOMY_WEIGHT = 8

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
	 * `economyWeight` x `Plan.reference`. For the rest, card DPS x tonight's matrix on an empty board.
	 */
	rate: number
	/** Per composition entry, the damage `rate` sums, before each is shared with the towers answering it. */
	terms: number[]
	/** Per composition entry, whether this tower is one of the towers answering it. */
	answers: boolean[]
	reach: number
}

/** What is standing, counted once per `decide` and passed down: `worth` runs once per candidate. */
interface Standing {
	economy: number
	/**
	 * Per composition entry, the towers standing that answer it, or 0 while one of its enemies is
	 * slipping: the gap. Why: steps/22-balance-harness/B3-greedy-watches-the-lane.md, decision 1.
	 */
	answering: number[]
	/** Per composition entry, where its stranded enemies stand: the gap at a tile that reaches one. */
	stranded: Vec2[][]
}

/** Whether any of `targets` is within `reach` of `tile`, squared, as `queryEnemiesInRange` measures. */
function reaches(tile: Vec2, reach: number, targets: readonly Vec2[]): boolean {
	for (const at of targets) {
		const dx = at.x - tile.x
		const dy = at.y - tile.y
		if (dx * dx + dy * dy <= reach * reach) {
			return true
		}
	}
	return false
}

/** How long an enemy stands at one distance before it counts as stopped: 2 s. */
export const STRANDED_TICKS = 120

/** What greedy remembers of the lane between ticks. Tonight's, on the policy's own object. */
export interface LaneWatch {
	/** Enemies that have stood in range of a standing tower that answers them. */
	reached: Set<EntityId>
	/** Per enemy, the distance it last stood at and the tick it got there. */
	still: Map<EntityId, { distance: number; since: number }>
}

export function createLaneWatch(): LaneWatch {
	return { reached: new Set(), still: new Map() }
}

/** A standing tower as the lane watch reads it: where it is, how far it reaches, what it answers. */
export interface Answerer {
	tile: Vec2
	reach: number
	/** Per composition entry. */
	answers: readonly boolean[]
	/** Per path id, `farthestReached`'s. */
	farthest: ReadonlyMap<string, number>
}

/** Per composition entry, what someone watching the board would see it isn't holding this tick. */
export interface LaneReading {
	/**
	 * A live enemy of the entry was in range of a tower answering it, and has walked out past the farthest
	 * point of its path any of them reaches: through the defence, not into a gap between two towers.
	 */
	slipping: boolean[]
	/**
	 * Where the entry's live enemies stand that haven't moved in `STRANDED_TICKS` with no tower answering
	 * them in reach. Never one feeding at a Honey Pot: that one is held on purpose.
	 */
	stranded: Vec2[][]
}

/** How finely `farthestReached` walks a path, in tiles. */
const PATH_STEP = 0.05

/**
 * Per path, the farthest distance along it within `reach` of `tile`, or -1 where it reaches none of
 * it. Depends only on the map, so greedy caches it per tile and reach.
 */
export function farthestReached(map: MapDef, tile: Vec2, reach: number): Map<string, number> {
	const farthest = new Map<string, number>()
	for (const path of map.paths) {
		let last = -1
		for (let step = 0; step * PATH_STEP <= path.lengthTiles; step++) {
			const at = samplePath(path, step * PATH_STEP)
			if (reaches(tile, reach, [at])) {
				last = step * PATH_STEP
			}
		}
		farthest.set(path.id, last)
	}
	return farthest
}

/**
 * Reads the board once and updates `watch`: enemies × answering towers, squared distances, the
 * measure `queryEnemiesInRange` uses. An enemy that hasn't reached any tower yet is neither slipping
 * nor stranded, so a fresh spawn is not the gap. Dead ids are pruned from `watch` here.
 */
export function watchLane(
	world: World,
	watch: LaneWatch,
	composition: readonly WeightedEnemy[],
	towers: readonly Answerer[],
): LaneReading {
	const slipping = composition.map(() => false)
	const stranded: Vec2[][] = composition.map(() => [])
	const live = new Set<EntityId>()

	// Per entry, per path, the farthest point any tower answering it reaches: towers x entries, once.
	const covered = composition.map(() => new Map<string, number>())
	for (const tower of towers) {
		for (const [index, answered] of tower.answers.entries()) {
			const entry = covered[index]
			if (!answered || entry === undefined) {
				continue
			}
			for (const [pathId, distance] of tower.farthest) {
				entry.set(pathId, Math.max(entry.get(pathId) ?? -1, distance))
			}
		}
	}

	for (const enemy of world.enemies) {
		live.add(enemy.id)
		const index = composition.findIndex(entry => entry.id === enemy.defId)
		const at = enemyPosition(world, enemy)
		if (index < 0 || at === null) {
			continue
		}

		let inRange = false
		for (const tower of towers) {
			if (tower.answers[index] !== true) {
				continue
			}
			const dx = at.x - tower.tile.x
			const dy = at.y - tower.tile.y
			if (dx * dx + dy * dy <= tower.reach * tower.reach) {
				inRange = true
				break
			}
		}
		const farthest = covered[index]?.get(enemy.pathId) ?? -1

		const last = watch.still.get(enemy.id)
		if (last === undefined || last.distance !== enemy.distance) {
			watch.still.set(enemy.id, { distance: enemy.distance, since: world.tick })
		}
		const since = watch.still.get(enemy.id)?.since ?? world.tick

		if (inRange) {
			watch.reached.add(enemy.id)
		} else if (watch.reached.has(enemy.id) && enemy.distance > farthest) {
			slipping[index] = true
		}
		if (!inRange && enemy.feeding === null && world.tick - since >= STRANDED_TICKS) {
			stranded[index]?.push(at)
		}
	}

	for (const id of watch.reached) {
		if (!live.has(id)) {
			watch.reached.delete(id)
		}
	}
	for (const id of watch.still.keys()) {
		if (!live.has(id)) {
			watch.still.delete(id)
		}
	}
	return { slipping, stranded }
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
	/** `farthestReached` per `x,y,reach`, filled the first time a tower stands there. */
	farthest: Map<string, ReadonlyMap<string, number>>
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
			farthest: new Map(),
		}
		let watch = createLaneWatch()

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
				terms: damageTermsOf(def, plan.composition),
				answers: plan.composition.map(enemy => answers(def, enemy)),
				reach: reachOf(def),
			}
			plan.profiles.set(key, profile)
			return profile
		}

		/**
		 * A tower of this def at this tier, on this tile: its damage over the track it reaches, each enemy
		 * shared with the `others` standing that answer it, or its income shared `economyShare` ways with
		 * the economy standing beside it. An entry with a stranded enemy in reach of this tile is in the
		 * gap here, and only here: where follows what (B3, decision 2).
		 */
		function worth(
			defId: DefId,
			tier: number,
			tile: Vec2,
			economyShare: number,
			others: readonly number[],
			stranded: readonly (readonly Vec2[])[],
		): number {
			const profile = profileOf(defId, tier)
			if (profile.economy) {
				return profile.rate / economyShare
			}
			const here = others.map((count, index) => (reaches(tile, profile.reach, stranded[index] ?? []) ? 0 : count))
			return sharedValue(profile.terms, here, plan.composition) * plan.coverage.at(tile, profile.reach)
		}

		function farthestOf(world: World, tile: Vec2, reach: number): ReadonlyMap<string, number> {
			const key = `${tile.x},${tile.y},${reach}`
			const cached = plan.farthest.get(key)
			if (cached !== undefined) {
				return cached
			}
			const farthest = farthestReached(world.map, tile, reach)
			plan.farthest.set(key, farthest)
			return farthest
		}

		function standingOf(world: World): Standing {
			const answering = plan.composition.map(() => 0)
			const towers: Answerer[] = []
			let economy = 0
			for (const tower of world.towers) {
				const profile = profileOf(tower.defId, tower.tier)
				if (profile.economy) {
					economy++
				}
				if (profile.answers.some(Boolean)) {
					towers.push({
						tile: tower.tile,
						reach: profile.reach,
						answers: profile.answers,
						farthest: farthestOf(world, tower.tile, profile.reach),
					})
				}
				for (const [index, answered] of profile.answers.entries()) {
					if (answered) {
						answering[index] = (answering[index] ?? 0) + 1
					}
				}
			}

			const lane = watchLane(world, watch, plan.composition, towers)
			for (const index of answering.keys()) {
				if (lane.slipping[index] === true) {
					answering[index] = 0
				}
			}
			return { economy, answering, stranded: lane.stranded }
		}

		/**
		 * The free tile with the most coverage, and while an entry this def answers has stranded enemies,
		 * also the best free tile with one of them in reach (B3, decision 2). Legality is asked now, every
		 * time.
		 */
		function bestTiles(world: World, def: TowerDef, occupied: Set<number>, standing: Standing): Vec2[] {
			const profile = profileOf(def.id, 0)
			const targets = standing.stranded.flatMap((at, index) => (profile.answers[index] === true ? at : []))
			let first: Vec2 | null = null
			for (const tile of plan.tiles.get(def.id) ?? []) {
				if (occupied.has(tileKey(world, tile)) || !placeableButForPrice(world, def, tile)) {
					continue
				}
				if (reaches(tile, profile.reach, targets)) {
					return first === null ? [tile] : [first, tile]
				}
				first ??= tile
				if (targets.length === 0) {
					break
				}
			}
			return first === null ? [] : [first]
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

		function placements(world: World, occupied: Set<number>, standing: Standing): Purchase[] {
			const found: Purchase[] = []
			for (const def of plan.defs) {
				// Worth nothing tonight wherever it stands: never bought, and no tile is searched for it.
				if (profileOf(def.id, 0).rate <= 0) {
					continue
				}
				const tiles =
					def.placement === 'path_only'
						? [bestTrackTile(world, def, occupied)].filter(tile => tile !== null)
						: bestTiles(world, def, occupied, standing)
				for (const tile of tiles) {
					// A new tower shares with every one standing, itself included: an economy tower with the
					// economy, a damaging one each enemy with the towers answering it.
					const perCrumb =
						worth(def.id, 0, tile, standing.economy + 1, standing.answering, standing.stranded) / def.cost
					if (perCrumb > 0) {
						found.push({
							command: { kind: 'PlaceTower', defId: def.id, tile: { x: tile.x, y: tile.y } },
							cost: def.cost,
							perCrumb,
						})
					}
				}
			}
			return found
		}

		function upgrades(world: World, standing: Standing): Purchase[] {
			const found: Purchase[] = []
			for (const tower of world.towers) {
				if (tower.tier >= MAX_TIER) {
					continue
				}
				const cost = upgradeCostFor(world, tower)
				// An upgrade adds no tower: an economy tower is already one of the economy standing, and a
				// damaging one already among those answering what it answers, so it shares with the rest.
				const share = Math.max(1, standing.economy)
				const own = profileOf(tower.defId, tower.tier).answers
				// An entry in the gap has 0 standing, this tower among them: it stays in the gap.
				const others = standing.answering.map((count, index) =>
					own[index] === true ? Math.max(0, count - 1) : count,
				)
				const gained =
					worth(tower.defId, tower.tier + 1, tower.tile, share, others, standing.stranded) -
					worth(tower.defId, tower.tier, tower.tile, share, others, standing.stranded)
				if (cost > 0 && gained > 0) {
					found.push({ command: { kind: 'UpgradeTower', towerId: tower.id }, cost, perCrumb: gained / cost })
				}
			}
			return found
		}

		/** The best purchase there is, affordable or not. The first one found keeps a tie. */
		function bestPurchase(world: World): Purchase | null {
			const occupied = new Set(world.towers.map(tower => tileKey(world, tower.tile)))
			const standing = standingOf(world)
			let best: Purchase | null = null
			for (const purchase of [...placements(world, occupied, standing), ...upgrades(world, standing)]) {
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
				plan = { composition, coverage, defs, tiles, reference, profiles: new Map(), farthest: new Map() }
				watch = createLaneWatch()
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
