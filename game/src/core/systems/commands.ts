import { getNightDef } from '@/core/content/index.ts'
import { startWave } from '@/core/systems/spawn.ts'
import type { Command } from '@/core/commands.ts'
import type { World } from '@/core/types.ts'

/**
 * Applies one drained batch of player intents. The only system that takes an argument beyond the
 * world, and the only place a command is ever executed.
 *
 * Step 6 executes `PlaceTower`/`SellTower`/`SetTargetingMode`, step 7 `CollectCrumb`, step 12
 * `UpgradeTower`. `SetSpeed` is deliberately not handled here: speed is more ticks per frame and
 * lives in `loop.ts`; it travels through the queue only so a replay records when it changed.
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

export function commandsSystem(world: World, commands: readonly Command[]): void {
	for (const command of commands) {
		if (command.kind === 'CallWaveEarly') {
			callWaveEarly(world)
		}
	}
}
