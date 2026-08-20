/**
 * One file per system, one no-op export each. The order they run in is not here -- it is in
 * `core/sim.ts`, which is the only file allowed to know it.
 */

export { combatSystem } from '@/core/systems/combat.ts'
export { commandsSystem } from '@/core/systems/commands.ts'
export { crumbsSystem } from '@/core/systems/crumbs.ts'
export { economySystem } from '@/core/systems/economy.ts'
export { eventsSystem } from '@/core/systems/events.ts'
export { movementSystem } from '@/core/systems/movement.ts'
export { noiseSystem } from '@/core/systems/noise.ts'
export { projectilesSystem } from '@/core/systems/projectiles.ts'
export { resolveSystem } from '@/core/systems/resolve.ts'
export { spawnSystem } from '@/core/systems/spawn.ts'
export { statusSystem } from '@/core/systems/status.ts'
export { targetingSystem } from '@/core/systems/targeting.ts'
export { tilesSystem } from '@/core/systems/tiles.ts'
