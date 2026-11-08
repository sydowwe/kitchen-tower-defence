import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { ant, fruitFly } from '@/core/content/enemies.ts'
import { getNightDef } from '@/core/content/index.ts'
import { tick } from '@/core/sim.ts'
import { createCommandQueue } from '@/core/commands.ts'
import { dropCrumb, HATCH_TICKS } from '@/core/systems/crumbs.ts'
import { spawnEnemyAt } from '@/core/systems/spawn.ts'
import { createWorld } from '@/core/world.ts'
import { useSettingsStore } from '@/ui/stores/settings.ts'
import { buildHintFacts, HINT_TICKS, stepHints, TUTORIAL } from '@/ui/hints.ts'
import type { HintFacts, HintId, ShowingHint } from '@/ui/hints.ts'
import type { World } from '@/core/types.ts'

/**
 * Step 23F's hint rules: what counts as past half, what never comes back, the tutorial's order and
 * where it runs, and one card at a time. Pure, so each case is a call and its answer.
 */

/** A quiet night: nothing has happened yet, and nothing is ready but the first prompt on night 1. */
function facts(patch: Partial<HintFacts> = {}): HintFacts {
	return {
		firstNight: false,
		tick: 0,
		towerStanding: false,
		collectorStanding: false,
		crumbOnBoard: false,
		crumbClicked: false,
		countdown: false,
		calledEarly: false,
		foodLost: false,
		rotting: false,
		flyer: false,
		noiseFraction: 0,
		mold: false,
		...patch,
	}
}

function worldFor(nightId: string): World {
	return createWorld({ seed: 1234, mapId: getNightDef(nightId).mapId, nightId, difficulty: 'normal' })
}

/** What a fresh queue would put up for this world, with nothing seen. */
function firstCard(world: World, seen: readonly string[] = []): HintId | null {
	return stepHints(null, buildHintFacts(world, false), seen).showing?.id ?? null
}

describe('the noise hint', () => {
	it('is past half of the cap, never past a level', () => {
		const world = worldFor('night02')

		world.noise.cap = 100
		world.noise.level = 60
		expect(firstCard(world)).toBe('hint.noise')

		// Close the Door and the White-noise Machine: 60 is 39% of 155.
		world.noise.cap = 155
		expect(firstCard(world)).toBeNull()

		world.noise.level = 78
		expect(firstCard(world)).toBe('hint.noise')
	})
})

describe('the seen list', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
	})

	it('keeps a seen hint down whatever the facts say, until resetHints', () => {
		const store = useSettingsStore()
		const loud = facts({ noiseFraction: 0.9, rotting: true, flyer: true, mold: true })

		let showing: ShowingHint | null = null
		const shown: HintId[] = []
		for (let t = 0; t < 10 * HINT_TICKS; t += 4) {
			const step = stepHints(showing, { ...loud, tick: t }, store.settings.seenHints)
			step.markSeen.forEach(store.markHintSeen)
			if (step.showing !== null && step.showing !== showing) {
				shown.push(step.showing.id)
			}
			showing = step.showing
		}
		// Each once, in the order they win a tie, and never again over ten lifetimes.
		expect(shown).toEqual(['hint.rot', 'hint.flyer', 'hint.noise', 'hint.mold'])
		expect(stepHints(null, loud, store.settings.seenHints).showing).toBeNull()

		store.resetHints()
		expect(stepHints(null, loud, store.settings.seenHints).showing?.id).toBe('hint.rot')
	})

	it('marks a card seen as it goes up, not when it comes down', () => {
		const step = stepHints(null, facts({ rotting: true }), [])
		expect(step.showing).toEqual({ id: 'hint.rot', sinceTick: 0 })
		expect(step.markSeen).toEqual(['hint.rot'])
	})
})

describe('the first night', () => {
	it('shows the prompts in order, each at its moment', () => {
		const seen: string[] = []
		const shown: HintId[] = []
		let showing: ShowingHint | null = null
		function step(patch: Partial<HintFacts>): void {
			const next = stepHints(showing, facts({ firstNight: true, ...patch }), seen)
			seen.push(...next.markSeen)
			if (next.showing !== null && next.showing !== showing) {
				shown.push(next.showing.id)
			}
			showing = next.showing
		}

		step({})
		expect(showing).toMatchObject({ id: 'tutorial.placeTower' })
		// The first prompt never times out: only a tower takes it down.
		step({ tick: 100 * HINT_TICKS })
		expect(showing).toMatchObject({ id: 'tutorial.placeTower' })

		step({ tick: 1, towerStanding: true })
		expect(showing).toBeNull()
		// A countdown before the first crumb: the collect prompt is next, and nothing jumps it.
		step({ tick: 2, towerStanding: true, countdown: true })
		expect(showing).toBeNull()

		step({ tick: 3, towerStanding: true, crumbOnBoard: true })
		step({ tick: 4, towerStanding: true, crumbOnBoard: true, crumbClicked: true })
		step({ tick: 5, towerStanding: true, crumbClicked: true, countdown: true })
		step({ tick: 6, towerStanding: true, crumbClicked: true, countdown: true, calledEarly: true })
		step({ tick: 7, towerStanding: true, crumbClicked: true, calledEarly: true, foodLost: true })

		expect(shown).toEqual([...TUTORIAL])
		expect(seen).toEqual([...TUTORIAL])
	})

	it('marks a prompt whose lesson came first done, without showing it', () => {
		// A crumb clicked before the first tower stands.
		const first = stepHints(null, facts({ firstNight: true, crumbClicked: true }), [])
		expect(first.showing?.id).toBe('tutorial.placeTower')
		expect(first.markSeen).toEqual(['tutorial.collectCrumb', 'tutorial.placeTower'])

		// A Crumb Tray placed early makes the click moot the same way, and the next prompt goes up instead.
		const seen = ['tutorial.placeTower']
		const tray = stepHints(
			null,
			facts({ firstNight: true, towerStanding: true, collectorStanding: true, countdown: true }),
			seen,
		)
		expect(tray.markSeen).toEqual(['tutorial.collectCrumb', 'tutorial.callWave'])
		expect(tray.showing?.id).toBe('tutorial.callWave')
	})

	it('takes the collect prompt down when a Tray makes it moot', () => {
		const up: ShowingHint = { id: 'tutorial.collectCrumb', sinceTick: 0 }
		const base = { firstNight: true, towerStanding: true, crumbOnBoard: true, tick: 1 }
		expect(stepHints(up, facts(base), []).showing).toBe(up)
		expect(stepHints(up, facts({ ...base, collectorStanding: true }), []).showing).toBeNull()
	})

	it('holds a ready hint back behind a ready prompt', () => {
		const step = stepHints(null, facts({ firstNight: true, rotting: true }), [])
		expect(step.showing?.id).toBe('tutorial.placeTower')
	})

	it('reads night 1 off the world, and its first card is the one that holds the clock', () => {
		expect(firstCard(worldFor('night01'))).toBe('tutorial.placeTower')
	})
})

describe('the first flyer', () => {
	it('counts a Fruit Fly hatched out of rot', () => {
		const world = worldFor('night02')
		const pile = dropCrumb(world, { x: 3, y: 3 }, 5)
		pile.ageTicks = HATCH_TICKS - 1

		expect(buildHintFacts(world, false).flyer).toBe(false)
		tick(world, createCommandQueue())

		expect(world.enemies.map(enemy => enemy.defId)).toContain(fruitFly.id)
		expect(buildHintFacts(world, false).flyer).toBe(true)
		expect(firstCard(world)).toBe('hint.flyer')
	})

	it('does not count an Ant', () => {
		const world = worldFor('night02')
		spawnEnemyAt(world, ant, 'crack', 1, 0)
		expect(buildHintFacts(world, false).flyer).toBe(false)
	})
})

describe('night 2', () => {
	it('never chooses a tutorial prompt, whatever has happened', () => {
		const world = worldFor('night02')
		expect(buildHintFacts(world, false).firstNight).toBe(false)

		const everything = facts({ crumbOnBoard: true, countdown: true, foodLost: true, tick: 5 })
		let showing: ShowingHint | null = null
		for (let t = 0; t < 4 * HINT_TICKS; t++) {
			const step = stepHints(showing, { ...everything, tick: t }, [])
			expect(step.markSeen.filter(id => id.startsWith('tutorial.'))).toEqual([])
			showing = step.showing
			expect(showing).toBeNull()
		}
	})
})

describe('one at a time', () => {
	it('returns one of a rotting pile and a flyer, and the other on a later call', () => {
		const both = facts({ rotting: true, flyer: true })
		const first = stepHints(null, both, [])
		expect(first.showing?.id).toBe('hint.rot')
		expect(first.markSeen).toEqual(['hint.rot'])

		// While it's up, the other waits.
		const waiting = stepHints(first.showing, { ...both, tick: HINT_TICKS - 1 }, first.markSeen)
		expect(waiting.showing).toBe(first.showing)
		expect(waiting.markSeen).toEqual([])

		// Its time runs out, and the next call puts up the flyer.
		const down = stepHints(first.showing, { ...both, tick: HINT_TICKS }, first.markSeen)
		expect(down.showing).toBeNull()
		const next = stepHints(null, { ...both, tick: HINT_TICKS }, first.markSeen)
		expect(next.showing?.id).toBe('hint.flyer')
	})
})
