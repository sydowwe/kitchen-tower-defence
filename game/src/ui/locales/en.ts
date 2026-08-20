/**
 * The English catalogue. EN is both the primary locale and the fallback.
 *
 * Adding a language later is one file plus one line in `index.ts` -- nothing else moves, because
 * no user-facing string is ever written as a literal. In particular `core/content/` stores *keys*
 * (`nameKey: 'tower.saltShaker.name'`), never names: core/ imports nothing, so it cannot translate,
 * and retrofitting forty towers and thirty enemies later is the expensive version of this decision.
 */

import type { EnemyMessages, TowerMessages } from '@/ui/locales/contentKeys.ts'

export const en = {
	general: {
		ok: 'OK',
		cancel: 'Cancel',
		back: 'Back',
		close: 'Close',
		confirm: 'Confirm',
		and: 'and',
	},
	hud: {
		pause: 'Pause',
		resume: 'Resume',
		speed: 'Speed {n}×',
		crumbs: 'Crumbs',
		food: 'Food',
		noise: 'Noise',
		wave: 'Wave {current} / {total}',
		callWave: 'Call next wave',
		sell: 'Sell',
		upgrade: 'Upgrade',
	},
	debug: {
		fps: 'FPS',
		ticks: 'Ticks',
		simTime: 'Sim',
		entities: 'Entities',
		speed: 'Speed',
		paused: 'Paused',
		hint: 'space pause · 1 2 3 speed',
	},
	settings: {
		title: 'Settings',
		volume: 'Volume',
		showFps: 'Show FPS',
	},

	// One entry per def in core/content/, keyed by its id. The `satisfies` is the enforcement: a
	// tower or enemy authored without an English name fails type-check here rather than rendering
	// its own key on screen. `night.*` is filled in with the night summary in step 8.
	tower: {
		saltShaker: {
			name: 'Salt Shaker',
			description: 'Table salt, thrown a handful at a time. Ants will not cross it.',
		},
	} satisfies TowerMessages,
	enemy: {
		ant: {
			name: 'Ant',
			description: 'Small, tireless, and never on its own. It only wants one thing from the fridge.',
		},
	} satisfies EnemyMessages,
	night: {},
}

export type Messages = typeof en
