/**
 * One file per system, one no-op export each. The order they run in is not here -- it is in
 * `core/sim.ts`, which is the only file allowed to know it.
 */

export { AURA_INTERVAL_TICKS, auraSystem } from '@/core/systems/aura.ts'
export { barricadeAhead, barricadeHolding, barricadesSystem, isBarricade } from '@/core/systems/barricades.ts'
export { cleanseSystem } from '@/core/systems/cleanse.ts'
export { combatSystem } from '@/core/systems/combat.ts'
export { commandsSystem } from '@/core/systems/commands.ts'
export { crumbsSystem, forfeitCrumbPiles } from '@/core/systems/crumbs.ts'
export { earnCrumbs, economySystem, forfeitUnbankedCrumbs, spendCrumbs } from '@/core/systems/economy.ts'
export { eventsSystem } from '@/core/systems/events.ts'
export {
	LIGHT_ATTRACTION_TILES,
	LIGHT_DRIFT_TILES_PER_TICK,
	LIGHT_MAX_OFFSET_TILES,
	lightSources,
	lightSystem,
} from '@/core/systems/light.ts'
export { FLEE_SPEED_MULT, movementSystem } from '@/core/systems/movement.ts'
export { noiseFraction, noiseSystem, projectedNoisePerSecond } from '@/core/systems/noise.ts'
export { projectilesSystem } from '@/core/systems/projectiles.ts'
export { resolveSystem } from '@/core/systems/resolve.ts'
export { spawnSystem, startWave } from '@/core/systems/spawn.ts'
export { spreadSystem } from '@/core/systems/spread.ts'
export { statusSystem } from '@/core/systems/status.ts'
export { targetingSystem } from '@/core/systems/targeting.ts'
export { tileSpeedMultiplier, tilesSystem, tileUnder } from '@/core/systems/tiles.ts'
export { hasFinishedSpawning, nightClock, waveSystem } from '@/core/systems/wave.ts'
