import { isCharge, isFiring } from '@/core/content/behaviours.ts'
import { effectiveDefOf, getNightDef, getTowerDef } from '@/core/content/index.ts'
import { MAX_TIER, upgradeCost } from '@/core/content/upgrades.ts'
import { chargeStateOf } from '@/core/systems/charges.ts'
import { collectCrumb, crumbById } from '@/core/systems/crumbs.ts'
import { placeTower, sellTower, towerById } from '@/core/systems/placement.ts'
import { startWave } from '@/core/systems/spawn.ts'
import type { Command } from '@/core/commands.ts'
import type { EntityId, TargetingMode, Tower, World } from '@/core/types.ts'

/**
 * Applies one drained batch of player intents. The only system that takes an argument beyond the
 * world, and the only place a command is ever executed.
 *
 * `SetSpeed` is deliberately not handled here: speed is more ticks per frame and lives in
 * `loop.ts`; it travels through the queue only so a replay records when it changed.
 *
 * The batch was drained into a fresh array before any system ran, so a `PlaceTower` and a
 * `SellTower` in the same batch execute in enqueue order. That is deterministic and correct --
 * nothing here dedupes or reorders a batch.
 */

/**
 * Crumbs per whole second of countdown skipped. `DECISIONS.md` section 5 says "proportional to the
 * seconds you skipped" and names no rate; step 22 is what re-prices this.
 */
const CRUMBS_PER_SECOND_SKIPPED = 2
const TICKS_PER_SECOND = 60

/**
 * What calling the wave right now would pay. 0 outside `'countdown'`, and partial seconds are
 * floored -- a 91-tick countdown is one second of bonus, not 1.51.
 *
 * Exported because the HUD previews it under the button, the same way it previews `refundFor` under
 * the sell button. A formula the UI repeats is a button that promises +14 while the wallet gains
 * +12, and nobody watches both at once.
 */
export function earlyCallBonus(world: World): number {
	const night = world.night
	if (night.phase !== 'countdown') {
		return 0
	}

	return Math.floor(night.countdownTicks / TICKS_PER_SECOND) * CRUMBS_PER_SECOND_SKIPPED
}

/**
 * Ignored outside `'countdown'`. The countdown only exists between a wave finishing its spawning
 * and the next one starting, so there is no moment where calling early could start a second wave
 * alongside a running one -- and a click during a wave has to be a no-op rather than a free wave.
 *
 * `crumbIncomeMult` deliberately does **not** apply: this is a tempo reward, not income, and the
 * difficulty tier already prices tempo through everything else.
 */
function callWaveEarly(world: World): void {
	const night = world.night
	if (night.phase !== 'countdown') {
		return
	}

	const skipped = night.countdownTicks
	world.crumbs += earlyCallBonus(world)
	night.ticksSkippedTotal += skipped
	night.countdownTicks = 0

	startWave(world, getNightDef(night.nightId), night.waveIndex + 1)
}

/**
 * Click to collect: instant and full value (analytic-docs/DECISIONS.md section 4).
 *
 * A crumb that has gone is a silent no-op, like `SellTower`: several frames pass between the click
 * and the tick, and the pile may have been claimed and delivered in between.
 *
 * `claimedByTowerId` is **deliberately not checked**. Clicking a pile already in flight cancels the
 * claim and pays instantly, which is the behaviour the mechanic wants and falls out of not asking.
 * `collectCrumb` removes it, so the tower's delivery finds nothing to deliver.
 */
function collect(world: World, crumbId: EntityId): void {
	const crumb = crumbById(world, crumbId)
	if (crumb !== null) {
		// `null` rather than a tower id is what tells a click from a delivery in the event.
		collectCrumb(world, crumb, null)
	}
}

/**
 * What the modes *do* is step 6B's; switching one is a single assignment. Silently ignored for a
 * tower that is no longer on the board, like every other command naming a gone entity.
 */
function setTargetingMode(world: World, towerId: EntityId, mode: TargetingMode): void {
	const tower = towerById(world, towerId)
	if (tower !== null) {
		tower.targetingMode = mode
	}
}

/**
 * What upgrading this tower costs right now, and 0 for one already at the top.
 *
 * Exported because the HUD previews the price under the button, the same way it previews `refundFor`
 * under the sell one. A formula the UI repeats is a button promising 30 while the wallet loses 31.
 *
 * Priced off the **base** def: no delta touches `cost`, and analytic-docs/CONTENT.md section 1's
 * 60% / 120% / 250% are percentages of what the tower cost to build.
 *
 * The world is unused today and taken anyway, so every price helper in `core/` reads the same at the
 * call site -- and a difficulty tier that prices upgrades costs no caller.
 */
export function upgradeCostFor(_world: World, tower: Tower): number {
	if (tower.tier >= MAX_TIER) {
		return 0
	}

	return upgradeCost(getTowerDef(tower.defId), tower.tier + 1)
}

/**
 * The three live counters a new tier invalidates. Every one of them is silent when it is wrong,
 * which is why they are reconciled in the same breath as the tier rather than by whichever system
 * notices next.
 */
function reconcileToTier(tower: Tower): void {
	const def = effectiveDefOf(tower)

	// Moved by the **delta**, never to full. A Cardboard Box upgraded to full HP mid-chew is a free
	// repair, and a box left at 200 with a `maxHp` of 280 reads as pre-damaged the moment it is built.
	const gained = def.maxHp - tower.maxHp
	tower.maxHp = def.maxHp
	tower.hp = Math.min(def.maxHp, tower.hp + gained)

	// A Mousetrap upgraded while rearming otherwise counts down from the *old* 396 once, and the
	// player concludes the upgrade did nothing.
	const state = chargeStateOf(tower)
	const charges = def.behaviours.find(isCharge)
	if (state !== null && charges !== undefined) {
		state.charges = Math.min(state.charges, charges.charges)
		state.rearmTicksRemaining = Math.min(state.rearmTicksRemaining, charges.rearmTicks)
	}

	// The same reason, for the cooldown: a shot already 300 ticks into a 396-tick gap must not gate a
	// tower that now fires every 198.
	const firing = def.behaviours.find(isFiring)
	if (firing !== undefined) {
		tower.cooldownTicks = Math.min(tower.cooldownTicks, firing.cooldownTicks)
	}
}

/**
 * Validates, then pays, then bumps the tier -- `placeTower`'s order, so a refusal leaves the wallet
 * exactly where it was.
 *
 * Silently a no-op on every refusal, like every other command naming a gone entity: no tower, one
 * already at `MAX_TIER`, not enough crumbs, or a night that is over.
 */
function upgradeTower(world: World, towerId: EntityId): void {
	const night = world.night
	if (night.phase === 'won' || night.phase === 'lost') {
		return
	}

	const tower = towerById(world, towerId)
	if (tower === null || tower.tier >= MAX_TIER) {
		return
	}

	const cost = upgradeCostFor(world, tower)
	if (world.crumbs < cost) {
		return
	}

	world.crumbs -= cost
	tower.tier++
	// The sell refund reads `totalInvested` and never the def, which is what makes an upgraded tower
	// refund what went into it.
	tower.totalInvested += cost

	reconcileToTier(tower)
}

export function commandsSystem(world: World, commands: readonly Command[]): void {
	for (const command of commands) {
		switch (command.kind) {
			case 'CallWaveEarly':
				callWaveEarly(world)
				break
			// **`getTowerDef` and not `effectiveDef`.** A new tower is tier 0, and tier 0 *is* the
			// base def. It throws on an unknown id: a `PlaceTower` naming a tower that does not
			// exist can only come from a corrupt replay, and every other lookup in `core/` throws.
			case 'PlaceTower':
				placeTower(world, getTowerDef(command.defId), command.tile)
				break
			case 'SellTower':
				sellTower(world, command.towerId)
				break
			case 'UpgradeTower':
				upgradeTower(world, command.towerId)
				break
			case 'CollectCrumb':
				collect(world, command.crumbId)
				break
			case 'SetTargetingMode':
				setTargetingMode(world, command.towerId, command.mode)
				break
			default:
				break
		}
	}
}
