import { getTowerDef, TOWERS } from '@/core/content/index.ts'
import { createRng } from '@/core/rng.ts'
import { blocksPlacement } from '@/core/tiles.ts'
import { canPlaceTower } from '@/core/systems/placement.ts'
import type { Command } from '@/core/commands.ts'
import type { Rng } from '@/core/rng.ts'
import type { DefId, EntityId, GameEvent, TargetingMode, Vec2, World } from '@/core/types.ts'
import type { Policy } from '@/dev/harness/types.ts'

/** About once a game-second. */
const ACT_CHANCE = 1 / 60

/** One command in ten is deliberately stale or illegal. */
const STALE_CHANCE = 0.1

/** Mixed into the job seed, so this stream is not the world's own stream opened a second time. */
const SEED_SALT = 0x52414e44

const ACTIONS = ['place', 'sell', 'upgrade', 'retarget', 'collect', 'fetch', 'callEarly', 'speed'] as const
type Action = (typeof ACTIONS)[number]

const MODES: readonly TargetingMode[] = ['FIRST', 'LAST', 'STRONGEST', 'WEAKEST', 'CLOSEST', 'RANDOM']
const SPEEDS: readonly number[] = [1, 2, 3]

/**
 * What a stale or illegal command must not have done on the tick it ran: the event that would mean
 * the executor acted on it. Checked against the next `decide`'s `world.events`, which are that tick's.
 */
interface NoOp {
	command: Command
	broken(event: GameEvent): boolean
}

/**
 * The crash hunter. Its own generator, seeded from the job seed and **never** `world.rng`: one draw
 * from the world's generator shifts every later roll in the night and the replay diverges.
 *
 * About once a game-second it does one thing, chosen uniformly: place, sell, upgrade, retarget, click a
 * pile, fetch food, call early or set the speed. One time in ten the command is stale or illegal on
 * purpose -- a gone tower or pile, an off-board or fouled tile, a tower left out of the loadout, food
 * that is not on the floor -- and the executor promises each of those is a silent no-op. This checks
 * the promise and throws when it is broken. It never names an unknown def id: that throw is designed
 * for a corrupt replay, and it is not a crash.
 */
export function random(options: { seed: number }): Policy {
	const rng: Rng = createRng(options.seed ^ SEED_SALT)
	let loadout: DefId[] = []
	let towerIds = new Set<EntityId>()
	let pileIds = new Set<EntityId>()
	const goneTowers: EntityId[] = []
	const gonePiles: EntityId[] = []
	let pending: NoOp | null = null

	/** Ids seen on an earlier tick and not on the board now. */
	function remember(world: World): void {
		const towersNow = new Set(world.towers.map(tower => tower.id))
		const pilesNow = new Set(world.crumbPiles.map(pile => pile.id))
		for (const id of towerIds) {
			if (!towersNow.has(id)) {
				goneTowers.push(id)
			}
		}
		for (const id of pileIds) {
			if (!pilesNow.has(id)) {
				gonePiles.push(id)
			}
		}
		towerIds = towersNow
		pileIds = pilesNow
	}

	function check(world: World): void {
		if (pending === null) {
			return
		}
		const promise = pending
		pending = null
		const broken = world.events.find(event => promise.broken(event))
		if (broken !== undefined) {
			throw new Error(
				`the executor acted on a stale ${JSON.stringify(promise.command)}: ${JSON.stringify(broken)} on tick ${world.tick - 1}`,
			)
		}
	}

	/** A tower id that has been on the board and is not now, or one never handed out. */
	function goneTowerId(world: World): EntityId {
		return goneTowers.length > 0 ? rng.pick(goneTowers) : world.nextEntityId + 1_000_000
	}

	function stalePlacement(world: World): Command {
		const fouled = world.tiles.filter(state => blocksPlacement(world, state.tile)).map(state => state.tile)
		const absent = TOWERS.filter(def => !loadout.includes(def.id)).map(def => def.id)
		const own = loadout.length > 0 ? rng.pick(loadout) : (TOWERS[0]?.id ?? 'saltShaker')

		const choices: (() => Command)[] = [
			() => ({
				kind: 'PlaceTower',
				defId: own,
				tile: rng.chance(0.5)
					? { x: -1, y: rng.int(world.map.heightTiles) }
					: { x: world.map.widthTiles, y: 0 },
			}),
		]
		if (fouled.length > 0) {
			choices.push(() => {
				const tile = rng.pick(fouled)
				return { kind: 'PlaceTower', defId: own, tile: { x: tile.x, y: tile.y } }
			})
		}
		if (absent.length > 0) {
			choices.push(() => {
				const tile = { x: rng.int(world.map.widthTiles), y: rng.int(world.map.heightTiles) }
				return { kind: 'PlaceTower', defId: rng.pick(absent), tile }
			})
		}
		return rng.pick(choices)()
	}

	/** The deliberately wrong version of `action`, and what it must not have done. */
	function stale(world: World, action: Action): { command: Command; promise: NoOp | null } {
		switch (action) {
			case 'place': {
				const command = stalePlacement(world)
				return { command, promise: { command, broken: event => event.kind === 'towerPlaced' } }
			}
			case 'sell': {
				const towerId = goneTowerId(world)
				const command: Command = { kind: 'SellTower', towerId }
				return {
					command,
					promise: { command, broken: event => event.kind === 'towerSold' && event.towerId === towerId },
				}
			}
			case 'upgrade':
				return { command: { kind: 'UpgradeTower', towerId: goneTowerId(world) }, promise: null }
			case 'retarget':
				return {
					command: { kind: 'SetTargetingMode', towerId: goneTowerId(world), mode: rng.pick(MODES) },
					promise: null,
				}
			case 'collect': {
				const crumbId = gonePiles.length > 0 ? rng.pick(gonePiles) : world.nextEntityId + 1_000_000
				const command: Command = { kind: 'CollectCrumb', crumbId }
				return {
					command,
					promise: {
						command,
						broken: event => event.kind === 'crumbCollected' && event.crumbId === crumbId,
					},
				}
			}
			case 'fetch': {
				const notOnFloor = world.night.food.filter(item => item.droppedAt === null)
				const foodId = notOnFloor.length > 0 ? rng.pick(notOnFloor).id : world.nextEntityId + 1_000_000
				const command: Command = { kind: 'CollectFood', foodId }
				return {
					command,
					promise: {
						command,
						broken: event => event.kind === 'foodReturned' && event.items.includes(foodId),
					},
				}
			}
			case 'callEarly':
				return { command: { kind: 'CallWaveEarly' }, promise: null }
			case 'speed':
				return { command: { kind: 'SetSpeed', speed: rng.pick(SPEEDS) }, promise: null }
		}
	}

	function legalPlacement(world: World): Command | null {
		if (loadout.length === 0) {
			return null
		}
		const def = getTowerDef(rng.pick(loadout))
		const tiles: Vec2[] = []
		for (let y = 0; y < world.map.heightTiles; y++) {
			for (let x = 0; x < world.map.widthTiles; x++) {
				if (canPlaceTower(world, def, { x, y }).ok) {
					tiles.push({ x, y })
				}
			}
		}
		if (tiles.length === 0) {
			return null
		}
		const tile = rng.pick(tiles)
		return { kind: 'PlaceTower', defId: def.id, tile: { x: tile.x, y: tile.y } }
	}

	/** The meant-to-work version of `action`, or null when there is nothing on the board to aim it at. */
	function legal(world: World, action: Action): Command | null {
		const tower = world.towers.length > 0 ? rng.pick(world.towers) : null
		switch (action) {
			case 'place':
				return legalPlacement(world)
			case 'sell':
				return tower === null ? null : { kind: 'SellTower', towerId: tower.id }
			case 'upgrade':
				return tower === null ? null : { kind: 'UpgradeTower', towerId: tower.id }
			case 'retarget':
				return tower === null ? null : { kind: 'SetTargetingMode', towerId: tower.id, mode: rng.pick(MODES) }
			case 'collect':
				return world.crumbPiles.length > 0
					? { kind: 'CollectCrumb', crumbId: rng.pick(world.crumbPiles).id }
					: null
			case 'fetch': {
				const dropped = world.night.food.filter(item => item.droppedAt !== null)
				return dropped.length > 0 ? { kind: 'CollectFood', foodId: rng.pick(dropped).id } : null
			}
			case 'callEarly':
				return { kind: 'CallWaveEarly' }
			case 'speed':
				return { kind: 'SetSpeed', speed: rng.pick(SPEEDS) }
		}
	}

	return {
		name: 'random',
		economy: true,
		begin(world, night) {
			loadout = [...night.loadout]
			remember(world)
		},
		decide(world) {
			check(world)
			remember(world)

			if (!rng.chance(ACT_CHANCE)) {
				return []
			}
			const action = rng.pick(ACTIONS)
			const command = rng.chance(STALE_CHANCE) ? null : legal(world, action)
			if (command !== null) {
				return [command]
			}
			const wrong = stale(world, action)
			pending = wrong.promise
			return [wrong.command]
		},
	}
}
