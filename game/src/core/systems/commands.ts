import type { Command } from '@/core/commands.ts'
import type { World } from '@/core/types.ts'

/**
 * Applies one drained batch of player intents. The only system that takes an argument beyond the
 * world, and the only place a command is ever executed.
 *
 * Stub: step 6 executes `PlaceTower`/`SellTower`/`SetTargetingMode`, step 7 `CollectCrumb`, step 5
 * `CallWaveEarly`, step 12 `UpgradeTower`.
 */
export function commandsSystem(_world: World, _commands: readonly Command[]): void {}
