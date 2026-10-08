import { getTowerDef } from '@/core/content/index.ts'
import { samplePath, totalLength } from '@/core/path.ts'
import { upgradeCostFor } from '@/core/systems/commands.ts'
import { canPlaceTower } from '@/core/systems/placement.ts'
import type { Command } from '@/core/commands.ts'
import type { DefId, Vec2, World } from '@/core/types.ts'
import type { Policy, PolicyFactory } from '@/dev/harness/types.ts'

/**
 * A player for the specs and never shipped: step 22B writes the real ones. It does every kind of thing
 * a policy can do to the wallet -- places, upgrades, sells, clicks piles, calls early -- on a fixed
 * script, so the ledger and replay specs have a night with all of it in.
 *
 * It reads the world and returns commands. It never writes the world and never touches `world.rng`;
 * the replay spec is what would catch it if it did.
 */
export interface Script {
	/** Built in this order, the last one repeated, one placement a tick whenever the wallet allows. */
	towers: DefId[]
	/** Click every pile on the board every tick. */
	collect: boolean
	/** From this tick, upgrade the first tower built whenever affordable. Null: never. */
	upgradeFrom: number | null
	/** At the first tick from this one with two towers standing, sell the newest. Null: never. */
	sellFrom: number | null
	/** Call every other wave early. */
	callEarly: boolean
	/** Where along the first lane, as a fraction of it, the towers crowd round. */
	along: number
}

const DEFAULTS: Script = {
	towers: ['saltShaker'],
	collect: true,
	upgradeFrom: null,
	sellFrom: null,
	callEarly: false,
	along: 0.6,
}

/** Every tile the first tower could stand on, nearest the point `along` the first lane first. */
function tilesNear(world: World, defId: DefId, along: number): Vec2[] {
	const lane = world.map.paths[0]
	if (lane === undefined) {
		throw new Error(`map '${world.map.id}' has no lanes`)
	}
	const anchor = samplePath(lane, totalLength(lane) * along)
	const def = getTowerDef(defId)

	const tiles: Vec2[] = []
	for (let y = 0; y < world.map.heightTiles; y++) {
		for (let x = 0; x < world.map.widthTiles; x++) {
			if (canPlaceTower(world, def, { x, y }).ok) {
				tiles.push({ x, y })
			}
		}
	}
	function distance(tile: Vec2): number {
		return Math.hypot(tile.x - anchor.x, tile.y - anchor.y)
	}
	return tiles.sort((a, b) => distance(a) - distance(b) || a.y - b.y || a.x - b.x)
}

export function scripted(overrides: Partial<Script> = {}): PolicyFactory {
	const script: Script = { ...DEFAULTS, ...overrides }

	return function scriptedPolicy(): Policy {
		let tiles: Vec2[] = []
		let built = 0
		let sold = false

		function next(): DefId {
			return script.towers[Math.min(built, script.towers.length - 1)] ?? 'saltShaker'
		}

		return {
			name: 'scripted',
			economy: script.towers.includes('toasterCrumbTray'),
			begin(world) {
				tiles = tilesNear(world, script.towers[0] ?? 'saltShaker', script.along)
			},
			decide(world) {
				const commands: Command[] = []
				const night = world.night

				if (script.collect) {
					for (const pile of world.crumbPiles) {
						commands.push({ kind: 'CollectCrumb', crumbId: pile.id })
					}
				}

				if (script.callEarly && night.phase === 'countdown' && night.waveIndex % 2 === 1) {
					commands.push({ kind: 'CallWaveEarly' })
				}

				const newest = world.towers[world.towers.length - 1]
				if (!sold && script.sellFrom !== null && world.tick >= script.sellFrom && world.towers.length >= 2) {
					if (newest !== undefined) {
						commands.push({ kind: 'SellTower', towerId: newest.id })
						sold = true
						return commands
					}
				}

				const def = getTowerDef(next())
				// Affordability first: asking every tile on the board every tick is the slow half.
				const tile =
					world.crumbs >= def.cost
						? tiles.find(candidate => canPlaceTower(world, def, candidate).ok)
						: undefined
				if (tile !== undefined) {
					commands.push({ kind: 'PlaceTower', defId: def.id, tile: { x: tile.x, y: tile.y } })
					built++
					return commands
				}

				const first = world.towers[0]
				if (
					script.upgradeFrom !== null &&
					world.tick >= script.upgradeFrom &&
					first !== undefined &&
					first.tier < 3 &&
					world.crumbs >= upgradeCostFor(world, first)
				) {
					commands.push({ kind: 'UpgradeTower', towerId: first.id })
				}

				return commands
			},
		}
	}
}
