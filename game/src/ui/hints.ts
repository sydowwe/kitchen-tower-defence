import { isCollect } from '@/core/content/behaviours.ts'
import { effectiveDefOf, NIGHTS } from '@/core/content/index.ts'
import { isRotting } from '@/core/systems/crumbs.ts'
import { isGone } from '@/core/systems/fridge.ts'
import { isFlyer } from '@/core/systems/targeting.ts'
import { forEachTileWithEffect } from '@/core/tiles.ts'
import type { World } from '@/core/types.ts'

/**
 * Night 1's four prompts and the first-time lines (step 23F). Pure: facts in, the seen list in, one
 * card out. Nothing here writes to the world, so nothing here reaches a replay (decision 1).
 *
 * The ids are what `settings.seenHints` stores, so renaming one shows it again to everyone who saw it.
 */

/** In the order they are shown. Only ever on night 1 (decision 2). */
export const TUTORIAL = ['tutorial.placeTower', 'tutorial.collectCrumb', 'tutorial.callWave', 'tutorial.leak'] as const

/** In the order they win a tie. Any night, night 1 included, behind a ready prompt (decision 7). */
export const HINTS = ['hint.rot', 'hint.flyer', 'hint.noise', 'hint.mold'] as const

export type TutorialId = (typeof TUTORIAL)[number]
export type HintId = TutorialId | (typeof HINTS)[number]

/** The one prompt that holds the clock (decision 3), and the one that never times out. */
export const HOLDING_PROMPT: TutorialId = 'tutorial.placeTower'

/** How long a card stays up unless its moment ends sooner, in ticks: paused time doesn't count. */
export const HINT_TICKS = 8 * 60
export const PROMPT_TICKS = 14 * 60

/** "Past half" is a fraction of the cap, never a level (decision 5). */
export const NOISE_HINT_FRACTION = 0.5

/**
 * What the chooser knows about the night. Booleans read off the world at publish, plus the one fact
 * the world doesn't keep: whether the player has clicked a pile tonight, which `GameView.vue` reads off
 * `crumbCollected` in `tick()` and holds for the night.
 */
export interface HintFacts {
	firstNight: boolean
	tick: number
	towerStanding: boolean
	/** A tower with a `collect` behaviour stands, which makes the collect prompt moot. */
	collectorStanding: boolean
	crumbOnBoard: boolean
	crumbClicked: boolean
	countdown: boolean
	calledEarly: boolean
	foodLost: boolean
	rotting: boolean
	/** Anything with `isFlyer` on the board: a night-8 Fly or a Fruit Fly hatched out of rot (decision 6). */
	flyer: boolean
	noiseFraction: number
	mold: boolean
}

export interface ShowingHint {
	id: HintId
	sinceTick: number
}

export interface HintStep {
	/** The card to show now, or null. */
	showing: ShowingHint | null
	/** Ids to add to the seen list: the card just put up, and any prompt made moot before its turn. */
	markSeen: HintId[]
}

/** The night the tutorial runs on. By id, so a dev-picked night 1 teaches too. */
export function isFirstNight(nightId: string): boolean {
	return nightId === NIGHTS[0]?.id
}

export function buildHintFacts(world: World, crumbClicked: boolean): HintFacts {
	let mold = false
	forEachTileWithEffect(world, 'mold', () => {
		mold = true
	})
	const cap = world.noise.cap
	return {
		firstNight: isFirstNight(world.night.nightId),
		tick: world.tick,
		towerStanding: world.towers.length > 0,
		collectorStanding: world.towers.some(tower => effectiveDefOf(tower).behaviours.some(isCollect)),
		crumbOnBoard: world.crumbPiles.length > 0,
		crumbClicked,
		countdown: world.night.phase === 'countdown',
		calledEarly: world.night.ticksSkippedTotal > 0,
		foodLost: world.night.food.some(isGone),
		rotting: world.crumbPiles.some(isRotting),
		flyer: world.enemies.some(isFlyer),
		noiseFraction: cap > 0 ? world.noise.level / cap : 0,
		mold,
	}
}

/** Whether a card's moment has come. */
function isReady(id: HintId, facts: HintFacts): boolean {
	switch (id) {
		case 'tutorial.placeTower':
			return true
		case 'tutorial.collectCrumb':
			return facts.crumbOnBoard
		case 'tutorial.callWave':
			return facts.countdown
		case 'tutorial.leak':
			return facts.foodLost
		case 'hint.rot':
			return facts.rotting
		case 'hint.flyer':
			return facts.flyer
		case 'hint.noise':
			return facts.noiseFraction > NOISE_HINT_FRACTION
		case 'hint.mold':
			return facts.mold
	}
}

/**
 * Whether a prompt's lesson has already happened, so it has nothing left to say. A prompt done before
 * its turn is marked seen and never shown; one done while it's up comes down.
 */
function isDone(id: HintId, facts: HintFacts): boolean {
	switch (id) {
		case 'tutorial.placeTower':
			return facts.towerStanding
		case 'tutorial.collectCrumb':
			return facts.crumbClicked || facts.collectorStanding
		case 'tutorial.callWave':
			return facts.calledEarly
		default:
			return false
	}
}

/** Whether the card up now comes down: its lesson happened, its moment passed, or its time ran out. */
function isOver(showing: ShowingHint, facts: HintFacts): boolean {
	if (isDone(showing.id, facts)) {
		return true
	}
	if (showing.id === HOLDING_PROMPT) {
		return false
	}
	// The countdown it was about is over, and the next one is a different moment.
	if (showing.id === 'tutorial.callWave' && !facts.countdown) {
		return true
	}
	const lifetime = showing.id.startsWith('tutorial.') ? PROMPT_TICKS : HINT_TICKS
	return facts.tick - showing.sinceTick >= lifetime
}

/**
 * One step of the queue, at publish. `showing` is the card up now (null once dismissed), and the
 * result replaces it. A tutorial prompt beats a hint, a hint waits while another card is up, and each is
 * marked seen **as it goes up** (decision 7).
 *
 * The prompts come in order: the next one waits for its moment, and nothing jumps it. Hints don't wait
 * on it, so a pile going off while night 1 waits for its first countdown is still said.
 */
export function stepHints(showing: ShowingHint | null, facts: HintFacts, seen: readonly string[]): HintStep {
	const markSeen: HintId[] = []
	function isSeen(id: HintId): boolean {
		return seen.includes(id) || markSeen.includes(id)
	}

	if (facts.firstNight) {
		for (const id of TUTORIAL) {
			if (id !== showing?.id && !isSeen(id) && isDone(id, facts)) {
				markSeen.push(id)
			}
		}
	}

	if (showing !== null) {
		return { showing: isOver(showing, facts) ? null : showing, markSeen }
	}

	const prompt = facts.firstNight ? TUTORIAL.find(id => !isSeen(id)) : undefined
	const next =
		prompt !== undefined && isReady(prompt, facts) ? prompt : HINTS.find(id => !isSeen(id) && isReady(id, facts))
	if (next === undefined) {
		return { showing: null, markSeen }
	}
	markSeen.push(next)
	return { showing: { id: next, sinceTick: facts.tick }, markSeen }
}
