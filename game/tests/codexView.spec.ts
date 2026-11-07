import { describe, expect, it } from 'vitest'
import { newProgress } from '@/core/campaign.ts'
import { ENEMIES, TOWERS } from '@/core/content/index.ts'
import { buildCodexView } from '@/ui/codexView.ts'
import type { Progress } from '@/core/campaign.ts'
import type { CodexEnemyEntry, CodexView } from '@/ui/codexView.ts'

/**
 * The notebook's view model. What drifts silently here is the discovery rule, an enemy's multiplier
 * that is one row and not the product, and a grid row nobody can have met.
 */

function progressAt(nightId: string | null, overrides: Partial<Progress> = {}): Progress {
	return { ...newProgress(), nightId, ...overrides }
}

function seenTowers(view: CodexView): string[] {
	return view.towers.filter(entry => entry.discovered).map(entry => entry.id)
}

function seenEnemies(view: CodexView): string[] {
	return view.enemies.filter(entry => entry.discovered).map(entry => entry.id)
}

function enemyIn(view: CodexView, id: string): CodexEnemyEntry {
	const entry = view.enemies.find(candidate => candidate.id === id)
	if (entry === undefined || !entry.discovered) {
		throw new Error(`'${id}' is not discovered`)
	}
	return entry
}

function multiplierOf(entry: CodexEnemyEntry, damageType: string) {
	return entry.damage.find(row => row.damageType === damageType)
}

describe('what has been seen', () => {
	it('fresh on night 1: the Salt Shaker, the Crumb Tray, the Ant and the Fruit Fly, and nothing else', () => {
		const view = buildCodexView(newProgress())

		expect(seenTowers(view)).toEqual(['saltShaker', 'toasterCrumbTray'])
		expect(seenEnemies(view)).toEqual(['ant', 'fruitFly'])
	})

	it('the Roach on night 3, which introduces it, and not on night 2', () => {
		expect(seenEnemies(buildCodexView(progressAt('night02')))).not.toContain('roach')
		expect(seenEnemies(buildCodexView(progressAt('night03')))).toContain('roach')
	})

	it('a finished campaign has seen everything', () => {
		const view = buildCodexView(progressAt(null))

		expect(view.towers).toHaveLength(19)
		expect(view.enemies).toHaveLength(11)
		expect(seenTowers(view)).toHaveLength(TOWERS.length)
		expect(seenEnemies(view)).toHaveLength(ENEMIES.length)
	})

	it('does not go dark on night 1 of another campaign, while endless still offers every tower', () => {
		const view = buildCodexView(progressAt('night01', { cleared: ['normal'], difficulty: 'nightmare' }))

		expect(seenTowers(view)).toHaveLength(TOWERS.length)
		expect(seenEnemies(view)).toHaveLength(ENEMIES.length)
	})
})

describe('a silhouette', () => {
	it('a tower is its shape and the night it arrives, with no name on it', () => {
		const lemon = buildCodexView(newProgress()).towers.find(entry => entry.id === 'lemon')

		expect(lemon).toEqual({ discovered: false, id: 'lemon', glyph: '🍋', arrivesNight: 17 })
	})

	it('an enemy is its shape and says nothing', () => {
		const slug = buildCodexView(newProgress()).enemies.find(entry => entry.id === 'slug')

		expect(slug).toEqual({ discovered: false, id: 'slug', glyph: '🐌' })
	})
})

describe('an enemy, in full', () => {
	it('takes the product of its tags: a Slug is 1.5 x 2.0 = 3.0 from chemical', () => {
		const slug = enemyIn(buildCodexView(progressAt('night15')), 'slug')

		expect(multiplierOf(slug, 'chemical')).toEqual({ damageType: 'chemical', multiplier: 3, band: 'strong' })
		expect(multiplierOf(slug, 'fire')?.multiplier).toBe(1.95)
		expect(multiplierOf(slug, 'cold')).toEqual({ damageType: 'cold', multiplier: 0.5, band: 'weak' })
	})

	it('a Silverfish is 0.4 from physical, with all five listed', () => {
		const silverfish = enemyIn(buildCodexView(progressAt('night17')), 'silverfish')

		expect(multiplierOf(silverfish, 'physical')).toEqual({ damageType: 'physical', multiplier: 0.4, band: 'weak' })
		expect(silverfish.damage.map(row => row.damageType)).toEqual([
			'physical',
			'fire',
			'cold',
			'chemical',
			'electric',
		])
	})

	it('a Roach, with no tag that has a row, takes everything at 1 and reads neutral', () => {
		const roach = enemyIn(buildCodexView(progressAt('night03')), 'roach')

		expect(roach.damage.every(row => row.multiplier === 1 && row.band === 'neutral')).toBe(true)
	})

	it('shows the HP the night will: the tier scales it, rounded up as the tooltip does', () => {
		function hpOn(difficulty: Progress['difficulty']): number {
			return enemyIn(buildCodexView(progressAt(null, { difficulty })), 'silverfish').hp
		}

		expect(hpOn('cozy')).toBe(88)
		expect(hpOn('normal')).toBe(110)
		expect(hpOn('nightmare')).toBe(149)
	})

	it('reads the doc: speed per second, what it pays, what it takes, and its first night', () => {
		const silverfish = enemyIn(buildCodexView(progressAt('night17')), 'silverfish')

		expect(silverfish.speedTilesPerSecond).toBe(0.6)
		expect(silverfish.reward).toBe(6)
		expect(silverfish.steals).toBe(2)
		expect(silverfish.firstNight).toBe(17)
		expect(enemyIn(buildCodexView(newProgress()), 'fruitFly').firstNight).toBe(1)
	})
})

describe('a tower, in full', () => {
	it('has its role, its place, its three tier names and the shop card', () => {
		const lemon = buildCodexView(progressAt('night17')).towers.find(entry => entry.id === 'lemon')
		if (lemon === undefined || !lemon.discovered) {
			throw new Error('the Lemon is not discovered on the night it unlocks')
		}

		expect(lemon.role).toBe('DOT')
		expect(lemon.placement).toBe('off_path')
		expect(lemon.tierNameKeys).toEqual([
			'tower.lemon.tier1.name',
			'tower.lemon.tier2.name',
			'tower.lemon.tier3.name',
		])
		expect(lemon.stats.applies.map(applied => applied.kind)).toContain('armorStrip')
	})
})

describe('the grid', () => {
	it('on night 1: swarm and air, the two tags the Ant and the Fruit Fly bring', () => {
		const { rows } = buildCodexView(newProgress()).grid

		expect(rows.map(row => row.tag)).toEqual(['swarm', 'air'])
		expect(rows[0]?.enemies.map(enemy => enemy.id)).toEqual(['ant', 'fruitFly'])
		expect(rows[1]?.enemies.map(enemy => enemy.id)).toEqual(['fruitFly'])
	})

	it('on night 17: every discovered tag with a row, in matrix order, and no v1-empty row', () => {
		const { rows } = buildCodexView(progressAt('night17')).grid
		const tags = rows.map(row => row.tag)

		expect(tags).toEqual(['soft', 'armored', 'swarm', 'air', 'fungal', 'mammal', 'slime'])
		expect(tags).not.toContain('boss')
		expect(tags).not.toContain('douses-fire')
		expect(tags).not.toContain('physical-immune')
	})

	it('a cell is the matrix row, not a product, in the band its colour comes from', () => {
		const { rows } = buildCodexView(progressAt('night17')).grid
		const armored = rows.find(row => row.tag === 'armored')

		expect(armored?.tagKey).toBe('hud.tag.armored')
		expect(armored?.cells).toEqual([
			{ damageType: 'physical', multiplier: 0.4, band: 'weak' },
			{ damageType: 'fire', multiplier: 1, band: 'neutral' },
			{ damageType: 'cold', multiplier: 1.2, band: 'strong' },
			{ damageType: 'chemical', multiplier: 1, band: 'neutral' },
			{ damageType: 'electric', multiplier: 1, band: 'neutral' },
		])
	})

	it('lets nothing undiscovered in: the Slug is not beside the Ant on night 1', () => {
		const ids = buildCodexView(newProgress()).grid.rows.flatMap(row => row.enemies.map(enemy => enemy.id))

		expect(new Set(ids)).toEqual(new Set(['ant', 'fruitFly']))
	})
})
