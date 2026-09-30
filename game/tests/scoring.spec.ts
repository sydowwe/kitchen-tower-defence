import { describe, expect, it } from 'vitest'
import { createCommandQueue } from '@/core/commands.ts'
import { tick } from '@/core/sim.ts'
import { GROCERY_LOSS_RATE, groceryMoneyFor } from '@/core/systems/scoring.ts'
import { createWorld } from '@/core/world.ts'
import type { DifficultyId, World } from '@/core/types.ts'

/**
 * Grocery Money, term by term (analytic-docs/CONTENT.md section 8).
 *
 * **Every world here is `createWorld` on a real night**, with the counters then set by hand: the
 * fixture world's `nightId` is `'test'`, which is no night, and `base` needs a night's index.
 *
 * **The totals are chosen off the half.** `Math.round` after a float multiply can land on the wrong
 * side of .5 -- cozy's `275 x 0.7` is `192.49999999999997` -- so nothing here asserts a cozy total.
 * Nightmare's `275 x 1.5` is `412.5` on the nose, but 1.5 and 412.5 are both exact in binary, so it
 * is a true half and `Math.round` takes it up to 413 on every machine.
 */

/**
 * The fixture night: night 5, 14 items left, 37 kills, 90 of 120 crumbs collected, no wake, 750
 * ticks skipped, won.
 */
function fixtureNight(difficulty: DifficultyId = 'normal'): World {
	const world = createWorld({ seed: 1234, mapId: 'counter', nightId: 'night05', difficulty })
	leaveOnShelf(world, 14)
	world.night.enemiesKilled = 37
	world.night.crumbsDropped = 120
	world.night.crumbsCollected = 90
	world.night.ticksSkippedTotal = 750
	world.night.phase = 'won'
	return world
}

/** Everything past the first `count` items eaten. */
function leaveOnShelf(world: World, count: number): void {
	expect(world.night.food.length).toBeGreaterThanOrEqual(count)
	world.night.food.forEach((item, index) => {
		item.lostTo = index < count ? null : 'eaten'
	})
}

describe('groceryMoneyFor', () => {
	it('pays the fixture night every term separately, and sums them', () => {
		const pay = groceryMoneyFor(fixtureNight())

		expect(pay).toEqual({
			// 25 + 5 x 5
			base: 50,
			// 8 x 14
			foodSaved: 112,
			// 0.25 x 37 = 9.25
			kills: 9,
			// 40 x 90 / 120
			cleanliness: 30,
			noWake: 50,
			// 2 x floor(750 / 60) = 2 x 12
			earlyCall: 24,
			subtotal: 275,
			difficultyMult: 1,
			lossMult: 1,
			total: 275,
			itemsRemaining: 14,
			enemiesKilled: 37,
			cleanlinessRatio: 0.75,
			secondsSkipped: 12,
			woke: false,
		})
	})

	it('multiplies the subtotal by nightmare’s 1.5, and nothing else by it', () => {
		const pay = groceryMoneyFor(fixtureNight('nightmare'))

		expect(pay.subtotal).toBe(275)
		expect(pay.difficultyMult).toBe(1.5)
		expect(pay.total).toBe(413)
	})

	it('pays exactly 40% of a lost night', () => {
		const world = fixtureNight()
		leaveOnShelf(world, 0)
		world.night.phase = 'lost'

		const pay = groceryMoneyFor(world)

		expect(GROCERY_LOSS_RATE).toBe(0.4)
		expect(pay.foodSaved).toBe(0)
		expect(pay.itemsRemaining).toBe(0)
		// 275 - 112
		expect(pay.subtotal).toBe(163)
		expect(pay.lossMult).toBe(0.4)
		// 163 x 0.4 = 65.2
		expect(pay.total).toBe(65)
	})

	it('scores a floor nothing was dropped on as clean, never NaN', () => {
		const world = fixtureNight()
		world.night.crumbsDropped = 0
		world.night.crumbsCollected = 0

		const pay = groceryMoneyFor(world)

		expect(pay.cleanlinessRatio).toBe(1)
		expect(pay.cleanliness).toBe(40)
		expect(pay.total).toBe(285)
	})

	it('clamps cleanliness at 40 when more was collected than dropped', () => {
		const world = fixtureNight()
		world.night.crumbsCollected = 150

		expect(groceryMoneyFor(world).cleanliness).toBe(40)
	})

	it('drops the no-wake bonus after a wake', () => {
		const world = fixtureNight()
		world.noise.wakeCount = 1

		const pay = groceryMoneyFor(world)

		expect(pay.woke).toBe(true)
		expect(pay.noWake).toBe(0)
		expect(pay.total).toBe(225)
	})

	it('pays whole seconds skipped only: 59 ticks is nothing', () => {
		const world = fixtureNight()
		world.night.ticksSkippedTotal = 59

		expect(groceryMoneyFor(world).earlyCall).toBe(0)
	})

	it('counts food on the floor as saved while it is still there', () => {
		const world = fixtureNight()
		const item = world.night.food[0]
		if (item === undefined) {
			throw new Error('expected food')
		}
		item.droppedAt = { x: 3, y: 3 }

		expect(groceryMoneyFor(world).itemsRemaining).toBe(14)
	})
})

describe('the pay a night stores', () => {
	/**
	 * Plays night 1 out to `nightEnded`, asserting `pay` is null on every tick before it. `killAll`
	 * zeroes every enemy each tick, which wins; left alone, the Ants eat the fridge, which loses.
	 */
	function playOut(killAll: boolean): World {
		const world = createWorld({ seed: 4242, mapId: 'counter', nightId: 'night01', difficulty: 'normal' })
		const queue = createCommandQueue()

		for (let index = 0; index < 20_000; index++) {
			if (killAll) {
				for (const enemy of world.enemies) {
					enemy.hp = 0
				}
			}
			tick(world, queue)
			if (world.events.some(event => event.kind === 'nightEnded')) {
				return world
			}
			expect(world.night.pay).toBeNull()
		}

		throw new Error('the night never ended')
	}

	it('is written on the tick a won night ends, and is groceryMoneyFor of that world', () => {
		const world = playOut(true)

		expect(world.night.phase).toBe('won')
		expect(world.night.pay).toEqual(groceryMoneyFor(world))
		expect(world.night.pay?.lossMult).toBe(1)
		expect(world.night.pay?.enemiesKilled).toBeGreaterThan(0)
	})

	it('is written on the tick a lost night ends, at the loss rate', () => {
		const world = playOut(false)

		expect(world.night.phase).toBe('lost')
		expect(world.night.pay).toEqual(groceryMoneyFor(world))
		expect(world.night.pay?.lossMult).toBe(GROCERY_LOSS_RATE)
		expect(world.night.pay?.foodSaved).toBe(0)
	})
})
