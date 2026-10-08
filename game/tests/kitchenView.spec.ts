import { describe, expect, it } from 'vitest'
import { newProgress } from '@/core/campaign.ts'
import {
	applyNightModifier,
	getEnemyDef,
	getMapDef,
	getNightDef,
	getNightModifierDef,
	INSTALLATIONS,
	MAPS,
	NIGHTS,
	NO_MODIFIERS,
	resolveDifficulty,
} from '@/core/content/index.ts'
import { TileFlags } from '@/core/map.ts'
import { waveEntryCount } from '@/core/systems/spawn.ts'
import { buildKitchenView, buildMapShape, buildPreview, buildTierPicker } from '@/ui/kitchenView.ts'
import type { Progress } from '@/core/campaign.ts'
import type { NightDef } from '@/core/content/index.ts'
import type { DifficultyId } from '@/core/types.ts'

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

describe("the night's composition", () => {
	const NORMAL = resolveDifficulty('normal')

	function authoredTotal(night: NightDef): number {
		return night.waves.flatMap(wave => wave.entries).reduce((sum, entry) => sum + entry.count, 0)
	}

	function previewTotal(night: NightDef, tier: DifficultyId): number {
		return buildPreview(night, tier).enemies.reduce((sum, enemy) => sum + enemy.count, 0)
	}

	it('lists every enemy of every night once, in order of first appearance, summing waveEntryCount at Normal', () => {
		for (const night of NIGHTS) {
			const enemies = buildPreview(night, 'normal').enemies
			const entries = night.waves.flatMap(wave => wave.entries)
			const modifiers =
				night.modifierId === undefined
					? NO_MODIFIERS
					: applyNightModifier(NO_MODIFIERS, getNightModifierDef(night.modifierId))

			expect(enemies.map(enemy => enemy.id)).toEqual([...new Set(entries.map(entry => entry.enemyDefId))])
			const total = entries.reduce((sum, entry) => sum + waveEntryCount(entry.count, NORMAL, modifiers), 0)
			expect(enemies.reduce((sum, enemy) => sum + enemy.count, 0)).toBe(total)
			for (const enemy of enemies) {
				expect(enemy.tagKeys).toEqual(getEnemyDef(enemy.id).tags.map(tag => `hud.tag.${tag}`))
			}
		}
	})

	it('comes out at the authored total on every night but 15 at Normal', () => {
		for (const night of NIGHTS) {
			if (night.index === 15) {
				continue
			}
			expect(previewTotal(night, 'normal'), night.id).toBe(authoredTotal(night))
		}
	})

	it("doubles night 15's dinner party, enemy by enemy", () => {
		const night = getNightDef('night15')
		const authored = new Map<string, number>()
		for (const entry of night.waves.flatMap(wave => wave.entries)) {
			authored.set(entry.enemyDefId, (authored.get(entry.enemyDefId) ?? 0) + entry.count)
		}

		const enemies = buildPreview(night, 'normal').enemies
		expect(enemies.length).toBeGreaterThan(0)
		for (const enemy of enemies) {
			expect(enemy.count, enemy.id).toBe(2 * (authored.get(enemy.id) ?? 0))
		}
		expect(previewTotal(night, 'normal')).toBe(2 * authoredTotal(night))
	})

	it('shows night 5 at Nightmare as each entry x1.25, rounded on its own, then summed', () => {
		const night = getNightDef('night05')
		const expected = night.waves
			.flatMap(wave => wave.entries)
			.reduce((sum, entry) => sum + Math.max(1, Math.round(entry.count * 1.25)), 0)

		expect(previewTotal(night, 'nightmare')).toBe(expected)
		expect(expected).toBeGreaterThan(authoredTotal(night))
	})

	it('lists night 14 in full, with the Mouse from wave 7 and two of it', () => {
		const enemies = buildKitchenView(progressAt('night14')).preview?.enemies ?? []

		expect(enemies.map(enemy => enemy.id)).toEqual(['ant', 'roach', 'beetle', 'fly', 'weevil', 'moth', 'mouse'])
		expect(enemies.map(enemy => enemy.firstWave)).toEqual([1, 1, 1, 1, 1, 2, 7])

		const mouse = enemies.find(enemy => enemy.id === 'mouse')
		expect(mouse?.count).toBe(2)
		expect(mouse?.tagKeys).toContain('hud.tag.thief')
		// Every wave but the sixth, which is all wings.
		expect(enemies.find(enemy => enemy.id === 'ant')?.count).toBe(
			19 + 20 + 21 + 22 + 23 + 16 + 24 + 25 + 26 + 27 + 29,
		)
	})

	it('names night 1 as the Ant alone, from the first wave', () => {
		const enemies = buildKitchenView(newProgress()).preview?.enemies ?? []

		expect(enemies.map(enemy => [enemy.id, enemy.firstWave])).toEqual([['ant', 1]])
	})
})

describe("the preview's modifier", () => {
	it('carries the modifier of nights 6, 11, 15, 16 and 18 by id, and null on every other night', () => {
		const modifiers = Object.fromEntries(
			NIGHTS.map(night => [night.index, buildPreview(night, 'normal').modifier?.id ?? null]),
		)

		expect(modifiers).toEqual({
			1: null,
			2: null,
			3: null,
			4: null,
			5: null,
			6: 'dishesLeftOut',
			7: null,
			8: null,
			9: null,
			10: null,
			11: 'dampNight',
			12: null,
			13: null,
			14: null,
			15: 'dinnerParty',
			16: 'movingDay',
			17: null,
			18: 'heatwave',
		})
	})

	it("names night 18's heatwave with its glyph and both keys, on the Kitchen's preview", () => {
		expect(buildKitchenView(progressAt('night18')).preview?.modifier).toEqual({
			id: 'heatwave',
			glyph: '🌡️',
			nameKey: 'modifier.heatwave.name',
			descriptionKey: 'modifier.heatwave.description',
		})
	})
})

describe("the title's tiers", () => {
	it('offers Cozy and Normal to a new campaign, marks Normal, and says Nightmare opens on Normal', () => {
		const picker = buildTierPicker(newProgress())

		expect(picker.tiers.map(tier => [tier.id, tier.current, tier.unlocked, tier.opensOnNameKey])).toEqual([
			['cozy', false, true, null],
			['normal', true, true, null],
			['nightmare', false, false, 'difficulty.normal.name'],
		])
		expect(picker.campaignStarted).toBe(false)
	})

	it('opens Nightmare after a Normal clear', () => {
		const picker = buildTierPicker(progressAt(null, { cleared: ['normal'] }))

		expect(picker.tiers.find(tier => tier.id === 'nightmare')?.unlocked).toBe(true)
	})

	it('counts a campaign as started once it has a result, money or an installation, and not before', () => {
		expect(buildTierPicker(progressAt('night01', { groceryMoney: 1 })).campaignStarted).toBe(true)
		expect(buildTierPicker(progressAt('night01', { installations: ['buyABroom'] })).campaignStarted).toBe(true)
		expect(
			buildTierPicker(
				progressAt('night02', { nightResults: { night01: { attempts: 1, wins: 1, bestGroceryMoney: 0 } } }),
			).campaignStarted,
		).toBe(true)
	})
})

describe("the map's shape", () => {
	it('draws the Counter as 336 cells with the 33 track tiles path.spec pins', () => {
		const shape = buildMapShape('counter')
		const map = getMapDef('counter')

		expect(shape.widthTiles * shape.heightTiles).toBe(336)
		expect(shape.cells).toHaveLength(336)
		expect(shape.cells.filter(cell => cell === 'track')).toHaveLength(33)
		expect(shape.lanes).toEqual([map.paths[0]?.waypoints])
	})

	it('keeps a track tile as track, though it is buildable too', () => {
		const shape = buildMapShape('counter')
		const map = getMapDef('counter')

		map.flags.forEach((flags, index) => {
			if ((flags & TileFlags.TRACK) !== 0) {
				expect(flags & TileFlags.BUILDABLE).toBe(TileFlags.BUILDABLE)
				expect(shape.cells[index]).toBe('track')
			}
		})
	})

	it('draws the Floor with three lanes', () => {
		const shape = buildMapShape('floor')

		expect(shape.lanes).toHaveLength(3)
		expect(shape.lanes).toEqual(getMapDef('floor').paths.map(path => path.waypoints))
	})

	it("puts every map's fridge on its fridge tile, and copies it", () => {
		for (const map of MAPS) {
			const shape = buildMapShape(map.id)
			expect(shape.fridge, map.id).toEqual(map.fridge.tile)
			expect(shape.fridge).not.toBe(map.fridge.tile)
		}
	})

	it('is on the preview, as the night’s map', () => {
		expect(buildKitchenView(progressAt('night16')).preview?.map).toEqual(buildMapShape('floor'))
	})
})
