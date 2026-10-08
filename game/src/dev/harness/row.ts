/**
 * A finished (or stalled) night as one `Row`. **Read, never recomputed**: Grocery Money is
 * `night.pay`, the noise is the meter's own high-water mark, the ledgers are `NightState`'s. The only
 * numbers built here are the ones no event or field carries -- counts of events, the damage book
 * folded from tower ids to defs, and the headline that divides three of the others.
 */

import { unlockedTowerIds } from '@/core/campaign.ts'
import { getNightDef, getTowerDef } from '@/core/content/index.ts'
import { isGone } from '@/core/systems/fridge.ts'
import type { Progress } from '@/core/campaign.ts'
import type { DamageBook, DefId, EntityId, GameEvent, World } from '@/core/types.ts'
import type { Job, Outcome, Row, Sweep } from '@/dev/harness/types.ts'

/** The source name for damage nothing could be attributed to. */
export const UNATTRIBUTED = 'unattributed'

/**
 * What the runner has to count off `world.events`, tick by tick, because no field holds it. The
 * events are gone at the top of the next tick, so this is fed after every one.
 */
export interface NightTally {
	/** Every tower placed tonight, by id, so damage booked to a sold tower still has a name. */
	towerDefs: Record<EntityId, DefId>
	towersBuilt: number
	towersSold: number
	towersDestroyed: number
	enemiesLeaked: number
	thievesEscaped: number
	crumbsForfeited: number
	wavesStarted: number
}

export function createTally(): NightTally {
	return {
		towerDefs: {},
		towersBuilt: 0,
		towersSold: 0,
		towersDestroyed: 0,
		enemiesLeaked: 0,
		thievesEscaped: 0,
		crumbsForfeited: 0,
		wavesStarted: 0,
	}
}

export function tallyEvents(tally: NightTally, events: readonly GameEvent[]): void {
	for (const event of events) {
		switch (event.kind) {
			case 'towerPlaced':
				tally.towerDefs[event.towerId] = event.defId
				tally.towersBuilt++
				break
			case 'towerSold':
				tally.towersSold++
				break
			case 'towerDestroyed':
				tally.towersDestroyed++
				break
			case 'enemyLeaked':
				tally.enemiesLeaked++
				break
			case 'thiefEscaped':
				tally.thievesEscaped++
				break
			case 'humanWoke':
				tally.crumbsForfeited += event.crumbsForfeited + event.crumbsOnBoardForfeited
				break
			case 'waveStarted':
				tally.wavesStarted++
				break
			default:
				break
		}
	}
}

/** Everything about the night that the world does not carry. */
export interface RowContext {
	mode: Job['kind']
	policy: string
	loadoutPolicy: string
	sweep: Sweep | null
	attempt: number
	/** The progress the night was built from, its loadout already stored. */
	progress: Progress
	/** `world.crumbs` before tick 0. */
	crumbsStart: number
	/** `night.food.length` before tick 0: the Emergency Snack Stash adds to it mid-night. */
	foodStart: number
}

/** The book by source name: tower ids folded into their defs, tile kinds as they are. */
function damageBySource(book: DamageBook, towerDefs: Record<EntityId, DefId>): Map<string, number> {
	const bySource = new Map<string, number>()
	for (const [id, amount] of Object.entries(book.byTower)) {
		const defId = towerDefs[Number(id)]
		if (defId === undefined) {
			throw new Error(`damage was booked to tower ${id}, which the runner never saw placed`)
		}
		bySource.set(defId, (bySource.get(defId) ?? 0) + amount)
	}
	for (const [kind, amount] of Object.entries(book.byTileEffect)) {
		bySource.set(kind, (bySource.get(kind) ?? 0) + amount)
	}
	if (book.unattributed > 0) {
		bySource.set(UNATTRIBUTED, book.unattributed)
	}
	return bySource
}

/** The biggest source, ties to the alphabetically first, so the same book always names the same one. */
function topSource(bySource: Map<string, number>): { name: string; amount: number } | null {
	let top: { name: string; amount: number } | null = null
	for (const [name, amount] of bySource) {
		if (top === null || amount > top.amount || (amount === top.amount && name < top.name)) {
			top = { name, amount }
		}
	}
	return top
}

function meanCost(towerIds: readonly DefId[]): number {
	if (towerIds.length === 0) {
		return 0
	}
	return towerIds.reduce((sum, id) => sum + getTowerDef(id).cost, 0) / towerIds.length
}

export function rowOf(world: World, tally: NightTally, context: RowContext, outcome: Outcome): Row {
	const night = world.night
	const pay = night.pay

	const bySource = damageBySource(night.damage, tally.towerDefs)
	let damageTotal = 0
	for (const amount of bySource.values()) {
		damageTotal += amount
	}
	const top = topSource(bySource)

	const rosterMeanCost = meanCost(unlockedTowerIds(context.progress))
	const towersAffordablePerWave =
		tally.wavesStarted === 0 || rosterMeanCost === 0
			? null
			: night.crumbsEarned / tally.wavesStarted / rosterMeanCost

	return {
		mode: context.mode,
		night: night.nightId,
		nightIndex: getNightDef(night.nightId).index,
		map: world.map.id,
		difficulty: world.difficulty.id,
		policy: context.policy,
		loadoutPolicy: context.loadoutPolicy,
		loadout: (night.loadout ?? []).join('|'),
		installations: context.progress.installations.join('|'),
		seed: world.seed,
		attempt: context.attempt,
		sweepKnob: context.sweep?.knob ?? null,
		sweepValue: context.sweep?.value ?? null,
		outcome,
		ticks: world.tick,
		wavesStarted: tally.wavesStarted,
		// The high-water mark is the home of this number; +1 because it starts at -1.
		wavesCleared: night.clearedThroughWaveIndex + 1,
		waveCount: night.waveCount,
		foodStart: context.foodStart,
		// The pay's own count when there is one. A stalled night has none, and asks `isGone` the way it would.
		foodRemaining: pay?.itemsRemaining ?? night.food.filter(item => !isGone(item)).length,
		crumbsStart: context.crumbsStart,
		crumbsEarned: night.crumbsEarned,
		crumbsSpent: night.crumbsSpent,
		crumbsWastedAtSunrise: world.crumbs,
		crumbsDropped: night.crumbsDropped,
		crumbsCollected: night.crumbsCollected,
		crumbsForfeited: tally.crumbsForfeited,
		towersBuilt: tally.towersBuilt,
		towersSold: tally.towersSold,
		towersDestroyed: tally.towersDestroyed,
		enemiesKilled: night.enemiesKilled,
		enemiesLeaked: tally.enemiesLeaked,
		thievesEscaped: tally.thievesEscaped,
		peakNoise: world.noise.peakLevel,
		wakeCount: world.noise.wakeCount,
		groceryMoney: pay?.total ?? null,
		rosterMeanCost,
		towersAffordablePerWave,
		damageTotal,
		topDamageSource: top?.name ?? null,
		topDamageShare: top === null || damageTotal === 0 ? null : top.amount / damageTotal,
	}
}
