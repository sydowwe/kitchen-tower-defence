import { describe, expect, it } from 'vitest'
import { newProgress } from '@/core/campaign.ts'
import { INSTALLATIONS } from '@/core/content/index.ts'
import { buildKitchenView } from '@/ui/kitchenView.ts'
import type { Progress } from '@/core/campaign.ts'

/**
 * The Kitchen's view model: the builder only. What drifts silently here is a card that pre-fills as
 * affordable one coin early, an effect kind that fell through to nothing, and a preview that
 * introduces the same enemy twice.
 */

function progressAt(nightId: string | null, overrides: Partial<Progress> = {}): Progress {
	return { ...newProgress(), nightId, ...overrides }
}

describe('buildKitchenView', () => {
	it('shows fresh progress as fourteen unowned cards, none affordable on an empty jar', () => {
		const view = buildKitchenView(newProgress())

		expect(view.groceryMoney).toBe(0)
		expect(view.cards).toHaveLength(14)
		expect(view.cards.map(card => card.state)).toEqual(Array(14).fill('unaffordable'))
		expect(view.owned).toEqual([])
	})

	it('makes a card affordable at exactly its cost and not one below', () => {
		// 90, 100, 110, 120 affordable at 120; the dustpan at 140 is not.
		const view = buildKitchenView(progressAt('night01', { groceryMoney: 120 }))
		const states = Object.fromEntries(view.cards.map(card => [card.id, card.state]))

		expect(states.oilTheHinges).toBe('affordable')
		expect(states.sealTheBaseboardCrack).toBe('affordable')
		expect(states.nightShiftDustpan).toBe('unaffordable')
		expect(view.cards.filter(card => card.state === 'affordable')).toHaveLength(4)

		const oneShort = buildKitchenView(progressAt('night01', { groceryMoney: 119 }))
		expect(oneShort.cards.find(card => card.id === 'sealTheBaseboardCrack')?.state).toBe('unaffordable')
	})

	it('shows an owned card as owned whatever the balance, and puts it in the room', () => {
		const view = buildKitchenView(progressAt('night01', { groceryMoney: 0, installations: ['buyABroom'] }))

		expect(view.cards.find(card => card.id === 'buyABroom')?.state).toBe('owned')
		expect(view.owned).toEqual([{ id: 'buyABroom', glyph: '🧹', nameKey: 'installation.buyABroom.name' }])
	})

	it('gives every installation an effect line of its own kind, with the def’s number in it', () => {
		const view = buildKitchenView(newProgress())
		const keys = view.cards.map(card => card.effect.textKey)

		expect(keys.every(key => key.length > 0)).toBe(true)
		// One key per effect kind: the two noise-cap installations share one and the three counter-space
		// ones another, so eleven keys for fourteen.
		const kinds = new Set(INSTALLATIONS.map(def => def.effect.kind))
		expect(new Set(keys).size).toBe(kinds.size)
		expect(kinds.size).toBe(11)
		for (const card of view.cards) {
			const def = INSTALLATIONS.find(entry => entry.id === card.id)
			expect(card.effect.textKey).toBe(`kitchen.effect.${def?.effect.kind}`)
		}

		const effects = Object.fromEntries(view.cards.map(card => [card.id, card.effect.params]))
		expect(effects.closeTheKitchenDoor).toEqual({ n: 25 })
		expect(effects.oilTheHinges).toEqual({ n: 0.5 })
		expect(effects.buyABroom).toEqual({ n: 1.5 })
		expect(effects.nightShiftDustpan).toEqual({ n: 0.7 })
		expect(effects.sealTheBaseboardCrack).toEqual({ n: 20 })
		expect(effects.pantryShelfLiner).toEqual({ n: 40 })
		expect(effects.emergencySnackStash).toEqual({ items: 3, at: 3 })
		expect(effects.secondShelf).toEqual({ n: 1 })
	})

	it('previews night 1: the Counter, six waves, the Salt Shaker and the Crumb Tray, and the Ant', () => {
		const preview = buildKitchenView(newProgress()).preview

		expect(preview).not.toBeNull()
		expect(preview?.night).toBe(1)
		expect(preview?.mapNameKey).toBe('map.counter.name')
		expect(preview?.waveCount).toBe(6)
		expect(preview?.unlocks.map(entry => entry.id)).toEqual(['saltShaker', 'toasterCrumbTray'])
		expect(preview?.introduces.map(entry => entry.id)).toEqual(['ant'])
	})

	it('introduces the Mouse on night 14 and not again on 17, where the Silverfish is new', () => {
		const fourteen = buildKitchenView(progressAt('night14')).preview
		expect(fourteen?.introduces.map(entry => entry.id)).toEqual(['mouse'])

		const seventeen = buildKitchenView(progressAt('night17')).preview
		const introduced = seventeen?.introduces.map(entry => entry.id)
		expect(introduced).toContain('silverfish')
		expect(introduced).not.toContain('mouse')
		expect(seventeen?.unlocks.map(entry => entry.id)).toEqual(['lemon'])
	})

	it('has no preview once the campaign is finished', () => {
		expect(buildKitchenView(progressAt(null)).preview).toBeNull()
	})
})
