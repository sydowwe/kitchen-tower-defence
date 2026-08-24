import { getNightDef, getTowerDef } from '@/core/content/index.ts'
import { collectCrumb, crumbById } from '@/core/systems/crumbs.ts'
import { placeTower, sellTower, towerById } from '@/core/systems/placement.ts'
import { startWave } from '@/core/systems/spawn.ts'
import type { Command } from '@/core/commands.ts'
import type { EntityId, TargetingMode, World } from '@/core/types.ts'

/**
 * Applies one drained batch of player intents. The only system that takes an argument beyond the
 * world, and the only place a command is ever executed.
 *
 * Step 12 executes `UpgradeTower`. `SetSpeed` is deliberately not handled
 * here: speed is more ticks per frame and lives in `loop.ts`; it travels through the queue only so
 * a replay records when it changed.
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
	world.crumbs += Math.floor(skipped / TICKS_PER_SECOND) * CRUMBS_PER_SECOND_SKIPPED
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

export function commandsSystem(world: World, commands: readonly Command[]): void {
	for (const command of commands) {
		switch (command.kind) {
			case 'CallWaveEarly':
				callWaveEarly(world)
				break
			// `getTowerDef` throws on an unknown id: a `PlaceTower` naming a tower that does not
			// exist can only come from a corrupt replay, and every other lookup in `core/` throws.
			case 'PlaceTower':
				placeTower(world, getTowerDef(command.defId), command.tile)
				break
			case 'SellTower':
				sellTower(world, command.towerId)
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
