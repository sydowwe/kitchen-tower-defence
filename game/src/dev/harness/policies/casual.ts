import { effectiveDef } from '@/core/content/index.ts'
import { shopOrder } from '@/ui/viewModel.ts'
import { candidateTiles, createCoverageCache, placeableButForPrice, reachOf } from '@/dev/harness/value.ts'
import type { Command } from '@/core/commands.ts'
import type { TowerDef } from '@/core/content/index.ts'
import type { DefId, Vec2, World } from '@/core/types.ts'
import type { Policy } from '@/dev/harness/types.ts'

/**
 * The lower bound on skill. Never calls early, clicks a pile or fetches a dropped item only where some
 * tower's reach puts it under its eyes, and never upgrades. Whenever it can afford the next tower in
 * its loadout -- newest unlock first, round robin -- it buys it, at the free legal tile nearest the
 * fridge with some track in reach.
 */
export function casual(): Policy {
	/** Tonight's loadout, newest unlock first. */
	let order: TowerDef[] = []
	/** Per def, its candidate tiles nearest the fridge first, ties row-major. */
	let tiles = new Map<DefId, Vec2[]>()
	/** `reachOf` per `defId|tier`, so a tick's pile checks do not rebuild a card per tower. */
	const reaches = new Map<string, number>()
	let next = 0

	function reachAt(defId: DefId, tier: number): number {
		const key = `${defId}|${tier}`
		let reach = reaches.get(key)
		if (reach === undefined) {
			reach = reachOf(effectiveDef(defId, tier))
			reaches.set(key, reach)
		}
		return reach
	}

	/** Whether `at` lies inside some tower's reach: where a casual player is looking. */
	function watched(world: World, at: Vec2): boolean {
		return world.towers.some(
			tower => Math.hypot(at.x - tower.tile.x, at.y - tower.tile.y) <= reachAt(tower.defId, tower.tier),
		)
	}

	function nearestFree(world: World, def: TowerDef): Vec2 | null {
		for (const tile of tiles.get(def.id) ?? []) {
			if (placeableButForPrice(world, def, tile)) {
				return tile
			}
		}
		return null
	}

	return {
		name: 'casual',
		economy: true,
		begin(world, night) {
			const coverage = createCoverageCache(world.map)
			const fridge = world.map.fridge.tile
			function toFridge(tile: Vec2): number {
				return Math.hypot(tile.x - fridge.x, tile.y - fridge.y)
			}

			order = shopOrder()
				.filter(def => night.loadout.includes(def.id))
				.reverse()
			// Stable, so equal distances keep the row-major order the candidates come in.
			tiles = new Map(
				order.map(def => [
					def.id,
					candidateTiles(world.map, def, coverage).sort((a, b) => toFridge(a) - toFridge(b)),
				]),
			)
			next = 0
		},
		decide(world) {
			const commands: Command[] = []

			for (const pile of world.crumbPiles) {
				if (watched(world, pile.position)) {
					commands.push({ kind: 'CollectCrumb', crumbId: pile.id })
				}
			}
			for (const item of world.night.food) {
				if (item.droppedAt !== null && watched(world, item.droppedAt)) {
					commands.push({ kind: 'CollectFood', foodId: item.id })
				}
			}

			// The next one round the loadout that has somewhere to stand. One with nowhere is passed over,
			// or a full lane-side would stop the rotation for the rest of the night.
			for (let tried = 0; tried < order.length; tried++) {
				const def = order[next % order.length]
				if (def === undefined) {
					break
				}
				const tile = nearestFree(world, def)
				if (tile === null) {
					next++
					continue
				}
				if (world.crumbs >= def.cost) {
					commands.push({ kind: 'PlaceTower', defId: def.id, tile: { x: tile.x, y: tile.y } })
					next++
				}
				break
			}

			return commands
		},
	}
}
