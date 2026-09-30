/**
 * Getting a tower onto the board and off it again, for money.
 *
 * **Validity is one exported function.** `canPlaceTower` is what the command executor calls, what
 * step 6C's hover tint calls and what step 8's ghost preview calls -- two readers of a bitfield
 * invent two slightly different answers, and the one that drifts is the one the player sees.
 *
 * It takes a `TowerDef` rather than a `DefId`, the same way `startWave` takes a `NightDef`: the
 * lookup is the caller's, so a spec can ask about a synthetic def that is not in `TOWERS`.
 *
 * Nothing here knows about pixels or clicks. A tile is a tile coordinate with integers on tile
 * centres -- the same space `samplePath` returns -- and mapping a click to one is `render/`'s job.
 */

import { isCharge, isIncome } from '@/core/content/behaviours.ts'
import { effectiveDefOf } from '@/core/content/index.ts'
import { endsWithItsSource } from '@/core/content/statuses.ts'
import { flagsAt, canPlace, TileFlags } from '@/core/map.ts'
import { blocksPlacement } from '@/core/tiles.ts'
import { earnCrumbs, spendCrumbs } from '@/core/systems/economy.ts'
import { spawnDestroyPenalty } from '@/core/systems/spawn.ts'
import type { TowerDef } from '@/core/content/index.ts'
import type { EntityId, Tower, TowerState, Vec2, World } from '@/core/types.ts'

/**
 * Why a placement was refused. A plain vocabulary like `TargetingMode`, **not** an i18n key: `ui/`
 * resolves vocabularies and `core/` carries content keys (CLAUDE.md, "Strings").
 *
 * `fouled` is a tile effect refusing the cell -- mold today, and whatever else sets
 * `TileEffectDef.blocksPlacement` later. Deliberately not named after mold: the rest of this
 * vocabulary is generic, and a reason named after one content entry has to be renamed the moment a
 * second one arrives.
 */
export type PlacementRejection =
	| 'offBoard'
	| 'blocked'
	| 'notBuildable'
	| 'onTrack'
	| 'offTrack'
	| 'fouled'
	| 'occupied'
	| 'tooExpensive'
	| 'nightOver'
	| 'locked'

export type PlacementResult = { ok: true } | { ok: false; reason: PlacementRejection }

/** 70% of total invested, dropping to 50% once a wave is in progress (CONTENT.md section 1). */
const REFUND_RATE = 0.7
const REFUND_RATE_DURING_WAVE = 0.5

function rejected(reason: PlacementRejection): PlacementResult {
	return { ok: false, reason }
}

/**
 * The live counter a charge tower spends down, seeded from its own behaviour. Null for every tower
 * without one, which is most of them.
 *
 * `rearmTicksRemaining` starts at 0: a tower is placed armed and nothing is rearming yet. The
 * machine that spends and refills both numbers is `core/systems/charges.ts`. What matters here is
 * that the field gets filled in at all -- a Sticky Tape placed with `state: null` silently has
 * infinite charges.
 */
function initialState(def: TowerDef): TowerState | null {
	const behaviour = def.behaviours.find(isCharge)
	return behaviour === undefined ? null : { kind: 'charge', charges: behaviour.charges, rearmTicksRemaining: 0 }
}

/**
 * Which of the four tile reasons `canPlace` said no for. Called **only** after `canPlace` has
 * already returned false, so this names an answer rather than deciding one -- the decision stays in
 * the one function both the executor and the UI ask.
 */
function tileRejection(flags: number, placement: TowerDef['placement']): PlacementRejection {
	if ((flags & TileFlags.BLOCKED) !== 0) {
		return 'blocked'
	}
	if (placement === 'path_only') {
		return 'offTrack'
	}
	return (flags & TileFlags.TRACK) !== 0 ? 'onTrack' : 'notBuildable'
}

/** The tower standing on `tile`, or null. One tower per tile is the whole occupancy rule. */
export function towerAt(world: World, tile: Vec2): Tower | null {
	return world.towers.find(tower => tower.tile.x === tile.x && tower.tile.y === tile.y) ?? null
}

/** The tower with this id, or null. Selling an id that has already gone is normal, not an error. */
export function towerById(world: World, towerId: EntityId): Tower | null {
	const position = world.index.towers[towerId]
	return position === undefined ? null : (world.towers[position] ?? null)
}

/**
 * The one answer to "may this tower stand here", for every caller.
 *
 * **Always `world.map`, never `getMapDef`.** The world holds its own mutable clone and night
 * modifiers write to it (step 15's mold, "moving day"); reading the def would leave placement legal
 * on a tile the board draws as corrupted.
 *
 * `nightOver` is checked first: while the summary screen is up, a click that lands behind it must
 * not spend crumbs, whatever tile it hit. `locked` comes straight after it and before any tile or
 * price, because a tower tonight does not have is not a matter of where or how much. A non-integer
 * tile is `offBoard` rather than `blocked`, because `flagsAt` answers 0 for one and the reason has to
 * name the real problem.
 */
export function canPlaceTower(world: World, def: TowerDef, tile: Vec2): PlacementResult {
	const night = world.night
	if (night.phase === 'won' || night.phase === 'lost') {
		return rejected('nightOver')
	}
	if (night.availableTowerIds !== null && !night.availableTowerIds.includes(def.id)) {
		return rejected('locked')
	}

	const map = world.map
	if (!Number.isInteger(tile.x) || !Number.isInteger(tile.y)) {
		return rejected('offBoard')
	}
	if (tile.x < 0 || tile.x >= map.widthTiles || tile.y < 0 || tile.y >= map.heightTiles) {
		return rejected('offBoard')
	}

	if (!canPlace(map, tile, def.placement)) {
		return rejected(tileRejection(flagsAt(map, tile), def.placement))
	}

	// After the tile's own flags and before occupancy: what the board has grown over a legal tile.
	// **An existing tower on a tile that then becomes fouled is untouched** -- no destruction, no
	// penalty, no event. It is stranded, and it stays stranded: destroying it would make mold far too
	// punishing for something the player cannot move out of the way of. That is a decision, not an
	// omission, which is why it is written down rather than merely absent.
	if (blocksPlacement(world, tile)) {
		return rejected('fouled')
	}

	if (towerAt(world, tile) !== null) {
		return rejected('occupied')
	}
	if (world.crumbs < def.cost) {
		return rejected('tooExpensive')
	}

	return { ok: true }
}

/**
 * Validates, then pays, then builds -- in that order, so a refused placement leaves the wallet
 * exactly where it was. Returns null on a rejection: a rejected command emits no event and logs
 * nothing, because nothing consumes a rejection. Step 8 asks `canPlaceTower` *before* it lets the
 * click happen and shows the reason as a toast.
 */
export function placeTower(world: World, def: TowerDef, tile: Vec2): Tower | null {
	if (!canPlaceTower(world, def, tile).ok) {
		return null
	}

	const tower: Tower = {
		id: world.nextEntityId++,
		defId: def.id,
		tile: { x: tile.x, y: tile.y },
		hp: def.maxHp,
		maxHp: def.maxHp,
		tier: 0,
		targetingMode: def.defaultTargetingMode,
		// Fires on the tick it lands. A tower that waits a full second before its first shot reads
		// as broken at the moment the player is watching it hardest.
		cooldownTicks: 0,
		shotsFired: 0,
		state: initialState(def),
		// The sell refund reads this field and never the def, because step 12's upgrades add to it.
		totalInvested: def.cost,
		targetEnemyId: null,
	}

	spendCrumbs(world, def.cost)
	world.index.towers[tower.id] = world.towers.length
	world.towers.push(tower)
	world.events.push({ kind: 'towerPlaced', towerId: tower.id, defId: def.id, tile: { x: tile.x, y: tile.y } })

	return tower
}

/**
 * What selling this tower pays right now. `Math.floor`, because the wallet is whole crumbs and
 * rounding up would turn place-then-sell into a crumb printer.
 *
 * "A wave is in progress" is `phase === 'wave'` and nothing else: `'countdown'` is explicitly the
 * build window (analytic-docs/DECISIONS.md section 5).
 */
export function refundFor(world: World, tower: Tower): number {
	const rate = world.night.phase === 'wave' ? REFUND_RATE_DURING_WAVE : REFUND_RATE
	return Math.floor(tower.totalInvested * rate)
}

/** See the note on `EntityIndex`: an index built from stale positions reads out the wrong tower. */
function reindexTowers(world: World): void {
	world.index.towers = {}
	world.towers.forEach((tower, position) => {
		world.index.towers[tower.id] = position
	})
}

/**
 * Takes the tower off the board and nothing else -- no event, no money. False for an id that is not
 * there.
 *
 * This is what a *spent* tower leaves through: a Sticky Tape out of charges is gone with no refund,
 * and emitting `towerSold` with a refund of 0 would lie to a ledger the HUD reads. `sellTower` is
 * this plus the money, and `destroyTower` is this plus the penalty and the event.
 *
 * **Every hold this tower has on an enemy goes with it.** A root lasts until its source is spent and
 * has no timer, so a Sticky Tape sold mid-root would otherwise leave its ant rooted forever -- and a
 * rooted fly with nothing left that can reach the air is a wave that never clears. Here, because
 * sell, destroy and retire all come through here.
 */
export function removeTower(world: World, towerId: EntityId): boolean {
	const position = world.index.towers[towerId]
	if (position === undefined || world.towers[position] === undefined) {
		return false
	}

	world.towers.splice(position, 1)
	reindexTowers(world)
	releaseHoldsOf(world, towerId)

	return true
}

/**
 * Drops every status this tower applied that ends with its source. `endsWithItsSource` from the
 * statuses module and not `holdsSourceStatusFrom` from `charges.ts`: that file imports this one, and
 * the cycle surfaces as an `undefined` at module load.
 */
function releaseHoldsOf(world: World, towerId: EntityId): void {
	for (const enemy of world.enemies) {
		for (let index = enemy.statuses.length - 1; index >= 0; index--) {
			const status = enemy.statuses[index]
			if (status !== undefined && status.sourceId === towerId && endsWithItsSource(status)) {
				enemy.statuses.splice(index, 1)
			}
		}
	}
}

/**
 * Flat damage onto a tower's hp, clamped at 0. `amount` is already-final: **nothing between here and
 * `tower.hp` scales it**.
 *
 * It deliberately does not go through `resolveDamage`. That function is damage type against *enemy
 * tags*, and a tower has none -- routing a chew through it would silently multiply by whatever the
 * matrix does with an empty tag list.
 *
 * No event: nothing consumes a `towerDamaged`, the HP bar reads `tower.hp`, and a `GameEvent` member
 * is added by the step that reads it. **Whoever damages a tower calls `destroyTower` when its hp
 * reaches 0** -- 10B's chew system is the only caller in v1. The two stay separate because step 13
 * wants to destroy a tower without a damage number.
 *
 * The world is unused today and taken anyway, so every damage helper in `core/` reads the same at
 * the call site.
 */
export function damageTower(_world: World, tower: Tower, amount: number): void {
	tower.hp = Math.max(0, tower.hp - amount)
}

/**
 * *The* path off the board for a killed tower: the destroy penalty, then the event, then the
 * removal. False for an id that is not there -- the `sellTower` precedent, because two things
 * killing the same tower on one tick is normal and not a crash.
 *
 * A second removal path is how a Cookie Jar chewed down by an ant ends up paying nothing, so 10B's
 * chew and step 13's wake both come through here -- the wake to get the event and the removal, not
 * the penalty.
 *
 * **`payPenalty: false` is what a wake passes**, and it is the one caller that does. The penalty
 * buys enemies from the running wave's composition and appends live spawn cursors -- on the tick
 * every enemy on the board just fled. The symptom of leaving it on is a board that empties and then
 * refills from a wave the player was told was over (step 13A, decision 10).
 */
export function destroyTower(world: World, towerId: EntityId, options: { payPenalty?: boolean } = {}): boolean {
	const tower = towerById(world, towerId)
	if (tower === null) {
		return false
	}

	// The *effective* def, not the base one: the Cookie Jar's tier 3 is what takes the 200 to 0.
	const def = effectiveDefOf(tower)
	const tile = { x: tower.tile.x, y: tower.tile.y }

	// The penalty is a field on `income`, not a branch on this tower's id: the Cookie Jar owes 200
	// and every other tower owes the default 0.
	if (options.payPenalty ?? true) {
		spawnDestroyPenalty(world, def.behaviours.find(isIncome)?.enemyCrumbsOnDestroy ?? 0)
	}

	world.events.push({ kind: 'towerDestroyed', towerId, defId: def.id, tile })
	return removeTower(world, towerId)
}

/**
 * Removes the tower and pays the refund. False for an id that is not on the board -- a double-click
 * sends two `SellTower` commands and the second one is normal, not a crash.
 */
export function sellTower(world: World, towerId: EntityId): boolean {
	const position = world.index.towers[towerId]
	const tower = position === undefined ? undefined : world.towers[position]
	if (position === undefined || tower === undefined) {
		return false
	}

	// Priced before the removal, because `refundFor` reads the tower.
	const refund = refundFor(world, tower)
	removeTower(world, towerId)
	// **Banked.** A refund is returned capital rather than income, and one a wake could eat would make
	// selling before a wake a trap the player cannot see (step 13A, decision 6).
	earnCrumbs(world, refund, true)
	world.events.push({ kind: 'towerSold', towerId, refund })

	return true
}
