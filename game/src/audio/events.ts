/**
 * The night's events, heard. Fed from the same drain as the renderer's effects -- `frameEvents` in
 * `GameView`'s `draw()`, every tick of the frame -- and never from `world.events` once a frame, which at
 * 3x is one tick in three (step 5C, decision 2).
 */

import { playCue } from '@/audio/engine.ts'
import { isConeAttack, isFiring } from '@/core/content/behaviours.ts'
import { findNightDef, getEnemyDef, getTowerDef } from '@/core/content/index.ts'
import type { Cue } from '@/audio/cues.ts'
import type { DamageType, DefId, GameEvent, World } from '@/core/types.ts'

/**
 * The towers with a voice of their own. Every other tower is heard by the kind of shot it fires, so a
 * new one has a sound the day it is added; an entry here is for one that should be picked out by ear.
 */
const NAMED_SHOTS: Readonly<Partial<Record<DefId, Cue>>> = {
	mousetrap: 'snap',
	toaster: 'toast',
	gasStoveBurner: 'burner',
	fan: 'gust',
}

const SHOT_BY_DAMAGE: Readonly<Record<DamageType, Cue>> = {
	physical: 'shake',
	cold: 'clink',
	chemical: 'splat',
	fire: 'flick',
	electric: 'shake',
}

/**
 * A shot's gain, from its noise: a tower that fills the meter sounds like one. A silent tower plays
 * at `QUIET_SHOT`; each point of noise adds `PER_NOISE` over `LOUD_SHOT`, so the Mousetrap's 2 is 0.8
 * and the Toaster's 3 is full.
 */
const QUIET_SHOT = 0.3
const LOUD_SHOT = 0.4
const PER_NOISE = 0.2

const shotCues = new Map<DefId, Cue>()

function shotCueOf(defId: DefId): Cue {
	let cue = shotCues.get(defId)
	if (cue === undefined) {
		const def = getTowerDef(defId)
		const firing = def.behaviours.find(isFiring)
		cue =
			NAMED_SHOTS[defId] ??
			(firing !== undefined && isConeAttack(firing) ? 'spray' : SHOT_BY_DAMAGE[firing?.damageType ?? 'physical'])
		shotCues.set(defId, cue)
	}
	return cue
}

function shotGain(noise: number): number {
	return noise > 0 ? Math.min(1, LOUD_SHOT + PER_NOISE * noise) : QUIET_SHOT
}

/**
 * Whether wave `waveIndex` of this night brings a thief. The question `ui/viewModel.ts` asks for the
 * Mouse's banner, asked again here because `audio/` cannot import `ui/`.
 */
function bringsThief(world: World, waveIndex: number): boolean {
	const wave = findNightDef(world.night.nightId)?.waves[waveIndex]
	return wave?.entries.some(entry => getEnemyDef(entry.enemyDefId).thief !== undefined) ?? false
}

export function pushAudioEvents(events: readonly GameEvent[], world: World): void {
	for (const event of events) {
		switch (event.kind) {
			case 'towerFired':
				playCue(shotCueOf(event.defId), shotGain(event.noise))
				break
			case 'enemyKilled':
				playCue('kill')
				break
			case 'enemyLeaked':
			case 'thiefEscaped':
				playCue('leak')
				break
			case 'thiefGrabbed':
				playCue('grab')
				break
			case 'towerPlaced':
				playCue('place')
				break
			case 'towerUpgraded':
				playCue('upgrade')
				break
			case 'towerSold':
				playCue('sell')
				break
			case 'towerDestroyed':
				playCue('broke')
				break
			case 'crumbCollected':
				playCue('crumb')
				break
			case 'humanWoke':
				playCue('woke')
				break
			case 'waveStarted':
				if (bringsThief(world, event.waveIndex)) {
					playCue('mouse')
				}
				break
			case 'nightEnded':
				playCue(event.won ? 'won' : 'lost')
				break
		}
	}
}
