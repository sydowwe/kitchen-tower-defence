import type { Command, CommandQueue } from '@/core/commands.ts'
import type { World } from '@/core/types.ts'
import {
	auraSystem,
	barricadesSystem,
	burrowSystem,
	cleanseSystem,
	combatSystem,
	commandsSystem,
	crumbsSystem,
	economySystem,
	eventsSystem,
	lightSystem,
	movementSystem,
	noiseSystem,
	projectilesSystem,
	resolveSystem,
	spawnSystem,
	spreadSystem,
	statusSystem,
	targetingSystem,
	tilesSystem,
	waveSystem,
} from '@/core/systems/index.ts'

/**
 * The names of the systems, in the order they run. Exported as data because `tick` iterates it --
 * a test asserts this against a literal list, so reordering a system in a later step has to be a
 * deliberate edit in two places rather than a line moved by accident.
 */
export type SystemName =
	| 'commands'
	| 'spawn'
	| 'wave'
	| 'status'
	| 'movement'
	| 'burrow'
	| 'barricades'
	| 'light'
	| 'targeting'
	| 'combat'
	| 'aura'
	| 'projectiles'
	| 'spread'
	| 'cleanse'
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
	{ name: 'wave', run: waveSystem },
	{ name: 'status', run: statusSystem },
	{ name: 'movement', run: movementSystem },
	// After the move so a Weevil stepping into a Bay Leaf radius is targetable this tick, before the
	// clamp so a burrowed one is never held by a box.
	{ name: 'burrow', run: burrowSystem },
	{ name: 'barricades', run: barricadesSystem },
	// After the clamp so it reads this tick's `distance`, before targeting so a Nightlight placed this
	// tick reveals in the same tick it was placed.
	{ name: 'light', run: lightSystem },
	{ name: 'targeting', run: targetingSystem },
	{ name: 'combat', run: combatSystem },
	// The towers that do not fire, right after the ones that do. Not a branch inside `combat`: that
	// loop skips every tower with no firing behaviour, which is every aura tower.
	{ name: 'aura', run: auraSystem },
	{ name: 'projectiles', run: projectilesSystem },
	// Everything that writes or erases a cell, then the system that ages them, so the board is only ever
	// read in one direction within a tick.
	{ name: 'spread', run: spreadSystem },
	{ name: 'cleanse', run: cleanseSystem },
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
 * Order: commands -> spawn -> wave -> status -> movement -> burrow -> barricades -> light -> targeting ->
 * combat -> aura -> projectiles -> spread -> cleanse ->
 * tiles -> crumbs -> noise -> economy -> resolve (deaths, leaks, win/lose) -> events.
 *
 * The queue is drained here, once, before anything else runs -- so player input lands at a tick
 * boundary and never mid-tick (analytic-docs/ARCHITECTURE.md section 3).
 *
 * **`world.events` is cleared here, at the top**, and not by the system that runs last. See the
 * note on `GameEvent`: a consumer only gets to look between two ticks, so events have to survive
 * from the end of one until the start of the next.
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

	// Truncated rather than replaced, so a consumer holding the array is not left reading a
	// detached copy of last tick's events forever.
	world.events.length = 0

	for (const system of SYSTEMS) {
		system.run(world, commands)
	}

	world.tick++
}
