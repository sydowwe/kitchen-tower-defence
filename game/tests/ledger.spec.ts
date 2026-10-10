import { describe, expect, it } from 'vitest'
import { newProgress, worldOptionsFor } from '@/core/campaign.ts'
import { createCommandQueue } from '@/core/commands.ts'
import { getTowerDef } from '@/core/content/index.ts'
import { samplePath, totalLength } from '@/core/path.ts'
import { tick } from '@/core/sim.ts'
import { applyDamage } from '@/core/systems/combat.ts'
import { canPlaceTower, placeTower } from '@/core/systems/placement.ts'
import { createWorld } from '@/core/world.ts'
import { createTestWorld } from './fixtures/world.ts'
import { scripted } from './fixtures/scriptedPolicy.ts'
import type { DamageBook, DefId, Enemy, EntityId, Vec2, World } from '@/core/types.ts'

/**
 * The two ledgers the balance harness reads and no event carries: the crumbs a night earned and spent,
 * and the damage it booked by source. Both are silent when wrong -- a wallet write that skips the two
 * doors, a DoT nobody books, overkill counted as damage -- and both feed step 22D's tuning directly.
 */

const NIGHT_CAP = 30_000

function isOver(world: World): boolean {
	return world.night.phase === 'won' || world.night.phase === 'lost'
}

function bookTotal(book: DamageBook): number {
	let total = book.unattributed
	for (const amount of Object.values(book.byTower)) {
		total += amount
	}
	for (const amount of Object.values(book.byTileEffect)) {
		total += amount ?? 0
	}
	return total
}

describe('the wallet', () => {
	it('balances against the ledgers after every tick of a night that places, upgrades, sells, collects, calls early and wakes', () => {
		const progress = newProgress()
		const world = createWorld(worldOptionsFor(progress, 1234))
		const player = scripted({
			towers: ['toasterCrumbTray', 'saltShaker'],
			upgradeFrom: 900,
			sellFrom: 1800,
			callEarly: true,
		})({ seed: 1234 })
		player.begin(world, { progress, loadout: world.night.loadout ?? [] })
		const queue = createCommandQueue()

		const crumbsStart = world.crumbs
		let refunds = 0
		let forfeited = 0
		let forced = false
		let mismatch: { tick: number; crumbs: number; ledger: number } | null = null

		while (!isOver(world) && world.tick < NIGHT_CAP) {
			for (const command of player.decide(world)) {
				queue.enqueue(command)
			}
			// One wake, while there is income to lose. Over the cap rather than on it: the meter decays
			// before it tests, so a level parked on the cap is under it by the time it is asked.
			if (!forced && world.tick >= 1200 && world.unbankedCrumbs > 0) {
				world.noise.level = world.noise.cap + 1
				forced = true
			}
			tick(world, queue)

			for (const event of world.events) {
				if (event.kind === 'towerSold') {
					refunds += event.refund
				} else if (event.kind === 'humanWoke') {
					forfeited += event.crumbsForfeited
				}
			}
			const ledger = crumbsStart + world.night.crumbsEarned - world.night.crumbsSpent + refunds - forfeited
			if (mismatch === null && world.crumbs !== ledger) {
				mismatch = { tick: world.tick, crumbs: world.crumbs, ledger }
			}
		}

		expect(mismatch).toBeNull()
		// Every term is live, or the balance above proves less than it says.
		expect(world.noise.wakeCount).toBe(1)
		expect(forfeited).toBeGreaterThan(0)
		expect(refunds).toBeGreaterThan(0)
		expect(world.night.ticksSkippedTotal).toBeGreaterThan(0)
		expect(world.night.crumbsCollected).toBeGreaterThan(0)
		// More than the placements alone: the upgrades went through `spendCrumbs` too.
		expect(world.night.crumbsSpent).toBeGreaterThan(
			getTowerDef('toasterCrumbTray').cost + getTowerDef('saltShaker').cost,
		)
		expect(world.night.crumbsEarned).toBeGreaterThan(world.night.crumbsCollected)
	})
})

/** The off-path or on-path tile nearest `anchor` that `defId` may stand on, other than `taken`. */
function nearestTile(world: World, defId: DefId, anchor: Vec2, taken: readonly Vec2[]): Vec2 {
	const def = getTowerDef(defId)
	let best: Vec2 | null = null
	let bestDistance = Infinity
	for (let y = 0; y < world.map.heightTiles; y++) {
		for (let x = 0; x < world.map.widthTiles; x++) {
			if (!canPlaceTower(world, def, { x, y }).ok || taken.some(tile => tile.x === x && tile.y === y)) {
				continue
			}
			const distance = Math.hypot(x - anchor.x, y - anchor.y)
			if (distance < bestDistance) {
				best = { x, y }
				bestDistance = distance
			}
		}
	}
	if (best === null) {
		throw new Error(`nowhere on '${world.map.id}' for a '${defId}'`)
	}
	return best
}

describe('the damage book', () => {
	it('books every point of HP lost exactly once, over a night of poison, an aura, heat and reflect', () => {
		const world = createWorld({ seed: 1234, mapId: 'stove', nightId: 'night12', difficulty: 'normal' })
		// The test's own money: this spec is about damage, and the wallet has its own.
		world.crumbs = 100_000
		const queue = createCommandQueue()

		const lane = world.map.paths[0]
		if (lane === undefined) {
			throw new Error('the Stove has no lanes')
		}
		const box = nearestTile(world, 'cardboardBox', samplePath(lane, totalLength(lane) * 0.7), [])
		const burner = nearestTile(world, 'gasStoveBurner', samplePath(lane, totalLength(lane) * 0.55), [box])
		const candle = nearestTile(world, 'candle', box, [])
		const spray = nearestTile(world, 'sprayBottle', box, [candle])
		for (const [defId, tile] of [
			['cardboardBox', box],
			['gasStoveBurner', burner],
			['candle', candle],
			['sprayBottle', spray],
		] as const) {
			queue.enqueue({ kind: 'PlaceTower', defId, tile })
		}
		tick(world, queue)

		const idOf = new Map(world.towers.map(tower => [tower.defId, tower.id]))
		const boxId = idOf.get('cardboardBox')
		const burnerId = idOf.get('gasStoveBurner')
		const candleId = idOf.get('candle')
		const sprayId = idOf.get('sprayBottle')
		if (boxId === undefined || burnerId === undefined || candleId === undefined || sprayId === undefined) {
			throw new Error(`not every tower went down: ${[...idOf.keys()].join(', ')}`)
		}
		for (let tier = 0; tier < 3; tier++) {
			queue.enqueue({ kind: 'UpgradeTower', towerId: boxId })
		}

		// HP lost per enemy, written after every tick. `resolveSystem` replaces `world.enemies` rather
		// than splicing it, so the array a tick started with still holds what it removed -- at the HP
		// it was removed on.
		const lost = new Map<EntityId, number>()
		function record(enemies: readonly Enemy[]): void {
			for (const enemy of enemies) {
				lost.set(enemy.id, enemy.maxHp - Math.max(0, enemy.hp))
			}
		}
		let sprayHits = 0

		while (!isOver(world) && world.tick < NIGHT_CAP) {
			const before = world.enemies
			tick(world, queue)
			record(before)
			record(world.enemies)
			for (const event of world.events) {
				if (event.kind === 'enemyDamaged' && event.sourceTowerId === sprayId) {
					sprayHits += event.amount
				}
			}
		}

		const book = world.night.damage
		let hpLost = 0
		for (const amount of lost.values()) {
			hpLost += amount
		}

		expect(hpLost).toBeGreaterThan(1000)
		expect(Math.abs(bookTotal(book) - hpLost)).toBeLessThan(1e-6)

		// The poison is the Spray Bottle's, and no event carries it.
		expect(book.byTower[sprayId] ?? 0).toBeGreaterThan(sprayHits)
		expect(sprayHits).toBeGreaterThan(0)
		// The Burner writes the floor: its damage is the heat's, never the tower's.
		expect(book.byTileEffect.heat ?? 0).toBeGreaterThan(0)
		expect(book.byTower[burnerId]).toBeUndefined()
		expect(book.byTower[candleId] ?? 0).toBeGreaterThan(0)
		// Tier 3's reflect, booked to the box being chewed.
		expect(book.byTower[boxId] ?? 0).toBeGreaterThan(0)
		// A whole night. Passes alone, past vitest's 5s default with the suite running beside it.
	}, 30_000)

	it('books a Mousetrap killing a 10-HP Ant as 10, not 60', () => {
		const world = createTestWorld()
		world.night.phase = 'wave'
		const trap = placeTower(world, getTowerDef('mousetrap'), { x: 0, y: 0 })
		if (trap === null) {
			throw new Error('the trap would not go down')
		}
		const ant: Enemy = {
			id: world.nextEntityId++,
			defId: 'ant',
			pathId: 'a',
			distance: 0.2,
			lateralOffsetTiles: 0,
			hp: 10,
			maxHp: 10,
			statuses: [],
			tags: ['ground'],
			speed: 0.05,
			spawnedInWaveIndex: 0,
			nextTileWriteTick: 0,
			burrowWindow: null,
			feeding: null,
			fedAt: [],
			pushback: null,
			theft: null,
			stolenItems: [],
			flags: { hidden: false, untargetable: false, fleeing: false, revealed: false, burrowed: false },
		}
		world.enemies.push(ant)
		world.index.enemies[ant.id] = world.enemies.length - 1

		tick(world, createCommandQueue())

		const hit = world.events.find(event => event.kind === 'enemyDamaged')
		expect(hit?.kind === 'enemyDamaged' ? hit.amount : null).toBe(60)
		expect(world.night.damage.byTower[trap.id]).toBe(10)
		expect(world.night.enemiesKilled).toBe(1)

		// A second hit on a dead enemy removes nothing, so it books nothing.
		applyDamage(world, ant, 60, 'physical', trap.id)
		expect(world.night.damage.byTower[trap.id]).toBe(10)
	})
})
