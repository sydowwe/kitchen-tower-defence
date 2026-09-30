import { describe, expect, it } from 'vitest'
import { createCommandQueue } from '@/core/commands.ts'
import { mousetrap, saltShaker, toasterCrumbTray } from '@/core/content/towers.ts'
import { canPlace, TileFlags } from '@/core/map.ts'
import { tick } from '@/core/sim.ts'
import { commandsSystem } from '@/core/systems/commands.ts'
import { canPlaceTower, placeTower, refundFor, sellTower, towerAt } from '@/core/systems/placement.ts'
import { createWorld } from '@/core/world.ts'
import { createTestWorld } from './fixtures/world.ts'
import type { Command, CommandKind } from '@/core/commands.ts'
import type { TowerDef } from '@/core/content/index.ts'
import type { Tower, Vec2, World } from '@/core/types.ts'
import type { CreateWorldOptions } from '@/core/world.ts'

/**
 * Placement and the refund. What a tower *does* once it is standing is step 6B's, so nothing here
 * fires a shot -- these are assertions about the wallet, the board and the entity index.
 *
 * The fixture is a 40 x 1 lane whose tile 0 is buildable-only and whose tiles 1-39 are track. This
 * file paints a few more tiles onto the world's own map clone, which is exactly what a night
 * modifier does, so both branches of `canPlace` and every rejection reason have a tile here.
 */

/** Tile 4 is the second buildable-only tile; 5 and 6 give removal something to reindex. */
const BUILDABLE_TILES = [4, 5, 6]
const BLOCKED_TILE = 2
const DECOR_TILE = 3

function buildableWorld(): World {
	const world = createTestWorld()
	// The fixture opens on `'won'`, which is a rejection all by itself. A build window is
	// `'countdown'` (analytic-docs/DECISIONS.md section 5).
	world.night.phase = 'countdown'

	world.map.flags[BLOCKED_TILE] = TileFlags.BLOCKED
	world.map.flags[DECOR_TILE] = TileFlags.DECOR
	for (const x of BUILDABLE_TILES) {
		world.map.flags[x] = TileFlags.BUILDABLE
	}

	return world
}

function at(x: number) {
	return { x, y: 0 }
}

/** `placeTower` where a refusal is the test failing rather than a `null` to thread through. */
function place(world: World, def: TowerDef, x: number): Tower {
	const tower = placeTower(world, def, at(x))
	if (tower === null) {
		throw new Error(`expected '${def.id}' to be placeable at ${x},0`)
	}
	return tower
}

function reasonFor(world: World, def: TowerDef, x: number): string | undefined {
	const result = canPlaceTower(world, def, at(x))
	return result.ok ? undefined : result.reason
}

/** A barricade in every way that matters here: it wants the track, not the floor beside it. */
const pathOnlyDef: TowerDef = { ...saltShaker, placement: 'path_only' }

describe('canPlaceTower', () => {
	it('names every rejection by its own reason', () => {
		const world = buildableWorld()

		expect(canPlaceTower(world, saltShaker, { x: -1, y: 0 })).toEqual({ ok: false, reason: 'offBoard' })
		expect(canPlaceTower(world, saltShaker, { x: 40, y: 0 })).toEqual({ ok: false, reason: 'offBoard' })
		// A click that was not floored: `flagsAt` answers 0 for it, so the reason has to be caught
		// before it comes back as `'blocked'`.
		expect(canPlaceTower(world, saltShaker, { x: 0.5, y: 0 })).toEqual({ ok: false, reason: 'offBoard' })

		expect(reasonFor(world, saltShaker, BLOCKED_TILE)).toBe('blocked')
		expect(reasonFor(world, saltShaker, DECOR_TILE)).toBe('notBuildable')
		expect(reasonFor(world, saltShaker, 1)).toBe('onTrack')
		expect(reasonFor(world, pathOnlyDef, 0)).toBe('offTrack')
	})

	it('accepts a buildable off-track tile for an off_path tower and a track tile for a path_only one', () => {
		const world = buildableWorld()

		expect(canPlaceTower(world, saltShaker, at(0))).toEqual({ ok: true })
		expect(canPlaceTower(world, pathOnlyDef, at(1))).toEqual({ ok: true })
	})

	it('rejects an occupied tile', () => {
		const world = buildableWorld()
		place(world, saltShaker, 0)

		expect(reasonFor(world, saltShaker, 0)).toBe('occupied')
	})

	it('rejects a cost the wallet cannot cover', () => {
		const world = buildableWorld()
		world.crumbs = 49

		expect(reasonFor(world, saltShaker, 0)).toBe('tooExpensive')

		world.crumbs = 50
		expect(canPlaceTower(world, saltShaker, at(0))).toEqual({ ok: true })
	})

	it('rejects everything once the night is over, whatever the tile says', () => {
		for (const phase of ['won', 'lost'] as const) {
			const world = buildableWorld()
			world.night.phase = phase

			expect(reasonFor(world, saltShaker, 0)).toBe('nightOver')
		}
	})

	it('refuses a tower left out of the loadout, and places one brought', () => {
		const world = buildableWorld()
		world.night.loadout = ['saltShaker']

		expect(reasonFor(world, mousetrap, 0)).toBe('notInLoadout')
		expect(place(world, saltShaker, 0).defId).toBe('saltShaker')
	})

	it('places anything when the loadout is null', () => {
		const world = buildableWorld()
		expect(world.night.loadout).toBeNull()

		expect(place(world, mousetrap, 0).defId).toBe('mousetrap')
		expect(place(world, saltShaker, 4).defId).toBe('saltShaker')
	})

	it('names `notInLoadout` before any tile or price, and `nightOver` before `notInLoadout`', () => {
		const world = buildableWorld()
		world.night.loadout = ['saltShaker']
		world.crumbs = 0

		// A blocked tile and an empty wallet: neither is the reason a Mousetrap is not going there.
		expect(reasonFor(world, mousetrap, BLOCKED_TILE)).toBe('notInLoadout')

		world.night.phase = 'won'
		expect(reasonFor(world, mousetrap, BLOCKED_TILE)).toBe('nightOver')
	})
})

describe('the loadout a world is built with', () => {
	const OPTIONS: CreateWorldOptions = { seed: 1, mapId: 'counter', nightId: 'night01', difficulty: 'normal' }

	/** The first tile of the Counter an off-track tower may stand on. */
	function floorTile(world: World): Vec2 {
		for (let y = 0; y < world.map.heightTiles; y++) {
			for (let x = 0; x < world.map.widthTiles; x++) {
				if (canPlace(world.map, { x, y }, 'off_path')) {
					return { x, y }
				}
			}
		}
		throw new Error('the Counter has no floor')
	}

	it('is a copy of the list `createWorld` was passed, and null when none was', () => {
		const loadout = ['saltShaker', 'toasterCrumbTray']
		const world = createWorld({ ...OPTIONS, loadout })
		loadout.push('mousetrap')

		expect(world.night.loadout).toEqual(['saltShaker', 'toasterCrumbTray'])
		expect(createWorld(OPTIONS).night.loadout).toBeNull()
	})

	it('is refused by `createWorld` when empty, naming a tower twice, or naming no tower', () => {
		expect(() => createWorld({ ...OPTIONS, loadout: [] })).toThrow(/no towers/)
		expect(() => createWorld({ ...OPTIONS, loadout: ['saltShaker', 'saltShaker'] })).toThrow(/twice/)
		expect(() => createWorld({ ...OPTIONS, loadout: ['saltShaker', 'goldenToaster'] })).toThrow(/goldenToaster/)
	})

	it('is not checked against a slot count: eight towers build a world with no counter space owned', () => {
		const eight = [
			'saltShaker',
			'toasterCrumbTray',
			'stickyTape',
			'mousetrap',
			'cookieJar',
			'sprayBottle',
			'cardboardBox',
			'iceCubeTray',
		]
		const world = createWorld({ ...OPTIONS, loadout: eight })

		expect(world.modifiers.loadoutSlots).toBe(5)
		expect(world.night.loadout).toHaveLength(8)
	})

	it('turns away a PlaceTower for a tower left out, ticked: nothing placed, nothing spent', () => {
		const world = createWorld({ ...OPTIONS, loadout: ['saltShaker'] })
		const tile = floorTile(world)
		const wallet = world.crumbs
		const queue = createCommandQueue()

		queue.enqueue({ kind: 'PlaceTower', defId: 'mousetrap', tile })
		tick(world, queue)

		expect(world.towers).toEqual([])
		expect(world.crumbs).toBe(wallet)

		queue.enqueue({ kind: 'PlaceTower', defId: 'saltShaker', tile })
		tick(world, queue)
		expect(world.towers.map(tower => tower.defId)).toEqual(['saltShaker'])
	})

	it('is never written once the night starts, by any command', () => {
		const given = ['saltShaker', 'toasterCrumbTray']
		const world = createWorld({ ...OPTIONS, loadout: given })
		const tile = floorTile(world)
		const queue = createCommandQueue()
		queue.enqueue({ kind: 'PlaceTower', defId: 'saltShaker', tile })
		tick(world, queue)
		const towerId = world.towers[0]?.id ?? -1
		const foodId = world.night.food[0]?.id ?? -1

		Object.freeze(world.night.loadout)

		// A mapped type rather than a list, so a ninth command kind fails `type-check` here until it is covered.
		const every: { [Kind in CommandKind]: Extract<Command, { kind: Kind }> } = {
			PlaceTower: { kind: 'PlaceTower', defId: 'toasterCrumbTray', tile: { x: tile.x, y: tile.y } },
			SellTower: { kind: 'SellTower', towerId },
			UpgradeTower: { kind: 'UpgradeTower', towerId },
			SetTargetingMode: { kind: 'SetTargetingMode', towerId, mode: 'STRONGEST' },
			CollectCrumb: { kind: 'CollectCrumb', crumbId: 9999 },
			CollectFood: { kind: 'CollectFood', foodId },
			CallWaveEarly: { kind: 'CallWaveEarly' },
			SetSpeed: { kind: 'SetSpeed', speed: 3 },
		}
		for (const command of Object.values(every)) {
			queue.enqueue(command)
		}

		expect(() => tick(world, queue)).not.toThrow()
		expect(world.night.loadout).toEqual(given)
	})
})

describe('placeTower', () => {
	it('leaves the wallet and the board untouched when it refuses', () => {
		const world = buildableWorld()

		// The ordering trap: deduct-then-validate spends 50 crumbs on a tower that never appears.
		expect(placeTower(world, saltShaker, at(1))).toBeNull()
		expect(world.crumbs).toBe(200)
		expect(world.towers).toEqual([])
		expect(world.events).toEqual([])
	})

	it('deducts exactly the cost and builds the tower the def describes', () => {
		const world = buildableWorld()
		const tower = place(world, saltShaker, 0)

		expect(world.crumbs).toBe(150)
		expect(tower.defId).toBe('saltShaker')
		expect(tower.tile).toEqual({ x: 0, y: 0 })
		expect(tower.hp).toBe(100)
		expect(tower.maxHp).toBe(100)
		expect(tower.tier).toBe(0)
		expect(tower.state).toBeNull()
		expect(tower.targetingMode).toBe('FIRST')
		expect(tower.totalInvested).toBe(50)
		// Fires on the tick it lands, and 6B's targeting is what fills the target in.
		expect(tower.cooldownTicks).toBe(0)
		expect(tower.targetEnemyId).toBeNull()
	})

	it('indexes the tower at its own position and pushes exactly one towerPlaced', () => {
		const world = buildableWorld()
		const tower = place(world, toasterCrumbTray, 0)

		expect(world.towers).toHaveLength(1)
		expect(world.index.towers[tower.id]).toBe(0)
		expect(world.events).toEqual([
			{ kind: 'towerPlaced', towerId: tower.id, defId: 'toasterCrumbTray', tile: { x: 0, y: 0 } },
		])
	})

	it('finds the tower standing on a tile, and nothing on an empty one', () => {
		const world = buildableWorld()
		const tower = place(world, saltShaker, 0)

		expect(towerAt(world, at(0))).toBe(tower)
		expect(towerAt(world, at(4))).toBeNull()
	})
})

describe('the commands system', () => {
	it('places one tower for two PlaceTower commands on the same tile in one batch', () => {
		const world = buildableWorld()

		commandsSystem(world, [
			{ kind: 'PlaceTower', defId: 'saltShaker', tile: at(0) },
			{ kind: 'PlaceTower', defId: 'saltShaker', tile: at(0) },
		])

		expect(world.towers).toHaveLength(1)
		expect(world.crumbs).toBe(150)
		expect(world.events).toHaveLength(1)
	})

	it('throws on a PlaceTower naming a tower that does not exist', () => {
		const world = buildableWorld()

		expect(() => commandsSystem(world, [{ kind: 'PlaceTower', defId: 'ladle', tile: at(0) }])).toThrow(/ladle/)
	})

	it('executes SellTower and SetTargetingMode against the tower on the board', () => {
		const world = buildableWorld()
		const towerId = place(world, saltShaker, 0).id

		commandsSystem(world, [{ kind: 'SetTargetingMode', towerId, mode: 'STRONGEST' }])
		expect(world.towers[0]?.targetingMode).toBe('STRONGEST')

		commandsSystem(world, [{ kind: 'SellTower', towerId }])
		expect(world.towers).toEqual([])

		// A tower that has already gone is ignored rather than crashing the tick.
		expect(() => commandsSystem(world, [{ kind: 'SetTargetingMode', towerId, mode: 'LAST' }])).not.toThrow()
	})
})

describe('sellTower', () => {
	it('refunds 70% of total invested during the build window, floored', () => {
		const world = buildableWorld()
		const tower = place(world, toasterCrumbTray, 0)
		expect(world.crumbs).toBe(125)
		world.events.length = 0

		expect(refundFor(world, tower)).toBe(52)
		expect(sellTower(world, tower.id)).toBe(true)

		// 0.7 x 75 is 52.5: rounding up would turn place-then-sell into a crumb printer.
		expect(world.crumbs).toBe(177)
		expect(world.towers).toEqual([])
		expect(world.events).toEqual([{ kind: 'towerSold', towerId: tower.id, refund: 52 }])
	})

	it('refunds 50% once a wave is in progress, and 70% during the countdown between them', () => {
		const world = buildableWorld()
		world.night.phase = 'wave'
		const tower = place(world, toasterCrumbTray, 0)

		// 0.5 x 75 is 37.5, floored to 37.
		expect(refundFor(world, tower)).toBe(37)
		sellTower(world, tower.id)
		expect(world.crumbs).toBe(162)
	})

	it('rebuilds the tower index so the survivors still look up to their own positions', () => {
		const world = buildableWorld()
		const first = place(world, saltShaker, 0)
		const second = place(world, saltShaker, 4)
		const third = place(world, saltShaker, 5)

		expect(sellTower(world, first.id)).toBe(true)

		expect(world.towers.map(tower => tower.id)).toEqual([second.id, third.id])
		expect(world.index.towers).toEqual({ [second.id]: 0, [third.id]: 1 })
		for (const tower of world.towers) {
			expect(world.towers[world.index.towers[tower.id] ?? -1]).toBe(tower)
		}
	})

	it('is a no-op for an id that is not on the board', () => {
		const world = buildableWorld()
		place(world, saltShaker, 0)
		world.events.length = 0

		// A double-click sends two SellTower commands and the second one is normal.
		expect(sellTower(world, 9999)).toBe(false)
		expect(world.crumbs).toBe(150)
		expect(world.towers).toHaveLength(1)
		expect(world.events).toEqual([])
	})
})

describe('a world with towers on it', () => {
	it('survives a JSON round-trip deeply equal', () => {
		const world = buildableWorld()
		place(world, saltShaker, 0)
		place(world, toasterCrumbTray, 4)

		expect(JSON.parse(JSON.stringify(world))).toEqual(world)
	})
})
