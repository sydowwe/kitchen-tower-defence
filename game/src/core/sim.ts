import type { Command, CommandQueue } from '@/core/commands.ts'
import type { World } from '@/core/types.ts'
import {
	combatSystem,
	commandsSystem,
	crumbsSystem,
	economySystem,
	eventsSystem,
	movementSystem,
	noiseSystem,
	projectilesSystem,
	resolveSystem,
	spawnSystem,
	statusSystem,
	targetingSystem,
	tilesSystem,
} from '@/core/systems/index.ts'

/**
 * The names of the systems, in the order they run. Exported as data because `tick` iterates it --
 * a test asserts this against a literal list, so reordering a system in a later step has to be a
 * deliberate edit in two places rather than a line moved by accident.
 */
export type SystemName =
	| 'commands'
	| 'spawn'
	| 'status'
	| 'movement'
	| 'targeting'
	| 'combat'
	| 'projectiles'
	| 'tiles'
	| 'crumbs'
	| 'noise'
	| 'economy'
	| 'resolve'
	| 'events'

/**
 * Every system takes the world. Only the commands system reads the second argument; the rest are
 * declared `(world) => void` and are assignable here because a shorter signature always is.
 */
type SystemRun = (world: World, commands: readonly Command[]) => void

interface System {
	readonly name: SystemName
	readonly run: SystemRun
}

const SYSTEMS: readonly System[] = [
	{ name: 'commands', run: commandsSystem },
	{ name: 'spawn', run: spawnSystem },
	{ name: 'status', run: statusSystem },
	{ name: 'movement', run: movementSystem },
	{ name: 'targeting', run: targetingSystem },
	{ name: 'combat', run: combatSystem },
	{ name: 'projectiles', run: projectilesSystem },
	{ name: 'tiles', run: tilesSystem },
	{ name: 'crumbs', run: crumbsSystem },
	{ name: 'noise', run: noiseSystem },
	{ name: 'economy', run: economySystem },
	{ name: 'resolve', run: resolveSystem },
	{ name: 'events', run: eventsSystem },
]

/** The documented order, as data. Derived from `SYSTEMS`, so the two cannot disagree. */
export const SYSTEM_ORDER: readonly SystemName[] = SYSTEMS.map(system => system.name)

/**
 * One fixed step of the simulation.
 *
 * Order: commands -> spawn -> status -> movement -> targeting -> combat -> projectiles -> tiles ->
 * crumbs -> noise -> economy -> resolve (deaths, leaks, win/lose) -> events.
 *
 * The queue is drained here, once, before anything else runs -- so player input lands at a tick
 * boundary and never mid-tick (analytic-docs/ARCHITECTURE.md section 3).
 *
 * **`world.tick` increments at the end, after every system has run.** So a system executing during
 * the first tick reads `world.tick === 0`, and after N calls `world.tick === N`: the field counts
 * *completed* ticks. Spawning scheduled for tick T therefore happens while `world.tick` is T, not
 * T + 1.
 *
 * Speed multipliers call this function more times per frame. They never scale a `dt`, because there
 * is no `dt` -- a tick is a tick.
 */
export function tick(world: World, queue: CommandQueue): void {
	const commands = queue.drain()

	for (const system of SYSTEMS) {
		system.run(world, commands)
	}

	world.tick++
}
