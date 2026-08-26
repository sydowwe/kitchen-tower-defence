/**
 * The English catalogue. EN is both the primary locale and the fallback.
 *
 * Adding a language later is one file plus one line in `index.ts` -- nothing else moves, because
 * no user-facing string is ever written as a literal. In particular `core/content/` stores *keys*
 * (`nameKey: 'tower.saltShaker.name'`), never names: core/ imports nothing, so it cannot translate,
 * and retrofitting forty towers and thirty enemies later is the expensive version of this decision.
 */

import type { EnemyMessages, FoodMessages, RejectionMessages, TowerMessages } from '@/ui/locales/contentKeys.ts'

export const en = {
	general: {
		ok: 'OK',
		cancel: 'Cancel',
		back: 'Back',
		close: 'Close',
		confirm: 'Confirm',
		and: 'and',
	},
	// Written in one pass in step 8A, before anything was on screen to read it against. **Step 8C
	// revises it after playing a night** -- length, tone and whether a label is needed at all are
	// judgements that need the HUD drawn. analytic-docs/DECISIONS.md section 1 sets the voice:
	// understated, dry, never jokey.
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

		// --- step 8B, the components -----------------------------------------------------------
		clock: '{hour}:{minute}am',
		foodCount: '{remaining} / {total}',
		// The top bar's half of analytic-docs/DECISIONS.md section 6: the sting is the *name*, said
		// once and left to fade. `night.foodLost` is the same sentence with the whole list in it.
		lastLost: 'Lost: {item}',
		groceryMoney: 'Grocery money',
		noiseLevel: '{level} of {cap}',
		speedShort: '{n}×',
		upgradeUnavailable: 'Upgrades come later.',
		// Keyed by the `TargetingMode` literal, so the selector renders the union directly.
		mode: {
			FIRST: 'First',
			LAST: 'Last',
			STRONGEST: 'Strongest',
			WEAKEST: 'Weakest',
			CLOSEST: 'Closest',
			RANDOM: 'Random',
		},
		damage: {
			physical: 'Physical',
			fire: 'Fire',
			cold: 'Cold',
			chemical: 'Chemical',
			electric: 'Electric',
		},
		targetClass: {
			ground: 'Ground',
			air: 'Air',
			both: 'Ground and air',
		},

		shop: 'On the counter',
		locked: 'Locked',
		cost: '{n} crumbs',
		onFloor: 'On the floor',
		floorPiles: '{piles} piles · {value} crumbs',
		floorRotting: '{n} going over',
		nextWaveIn: 'Next wave in {seconds}s',
		callWaveBonus: '+{n} crumbs',
		selected: 'Selected',
		tier: 'Tier {n}',
		targeting: 'Targeting',
		sellFor: 'Sell for {n}',
		sellPenalty: 'Half price while a wave is running',
		// Tooltips, and the only place the two hotkeys that have no on-screen badge are written down.
		// `dev/nightHud.ts` carried a hint line for all of them until step 8C deleted it; the shop
		// prints its own numbers, and these two are what was left over.
		sellKey: 'Sell this tower  (x)',
		callWaveKey: 'Call the next wave in early  (n)',
		// One line per stat on the hover card. A tower with no attack shows none of the first six
		// rather than showing them as zero -- see `TowerStatsView` in ui/viewModel.ts.
		stat: {
			damage: 'Damage',
			rate: 'Rate',
			dps: 'Damage per second',
			range: 'Range',
			damageType: 'Type',
			targets: 'Targets',
			noise: 'Noise',
			income: 'Income',
			collect: 'Collects within',
			cone: 'Cone',
			applies: 'Applies',
			perSecond: '{n}/sec',
			tiles: '{n} tiles',
			// Half the opening, the way the behaviour authors it: a 30 here is a 60-degree spray.
			degrees: '±{n}°',
			silent: 'Silent',
		},
		// Keyed by the `StatusKind` literal, so the card renders the union directly the way
		// `hud.mode` and `hud.damage` already do.
		status: {
			slow: 'Slow',
			freeze: 'Freeze',
			burn: 'Burn',
			poison: 'Poison',
			armorStrip: 'Armour strip',
			marked: 'Marked',
			rooted: 'Rooted',
		},
		// One per PlacementRejection, as the player's problem rather than the validator's.
		reject: {
			offBoard: 'That is off the counter.',
			// Distinct from `occupied` on purpose: this one is the kitchen's own clutter, that one is
			// a tower you put there yourself, and a player who cannot tell them apart moves the wrong
			// thing.
			blocked: 'There is something on the counter there.',
			notBuildable: 'Nothing will stand on that.',
			onTrack: 'Not on the track — they walk through there.',
			offTrack: 'This one goes on the track itself.',
			occupied: 'You have already put something there.',
			tooExpensive: 'Not enough crumbs yet.',
			nightOver: 'The night is over.',
		} satisfies RejectionMessages,
	},
	debug: {
		fps: 'FPS',
		ticks: 'Ticks',
		simTime: 'Sim',
		entities: 'Entities',
		speed: 'Speed',
		paused: 'Paused',
		// Every key the game route answers to. `dev/nightHud.ts` carried the other half of this list
		// until step 8C deleted it, so this line is now the whole of it -- edit it in the same breath
		// as the bindings in `ui/interaction.ts`, or the on-screen help lies.
		hint: '1-6 tower · shift-click keeps building · x sell · n next wave · space pause · , . speed',
	},
	settings: {
		title: 'Settings',
		volume: 'Volume',
		showFps: 'Show FPS',
	},

	// One entry per def in core/content/, keyed by its id. The `satisfies` is the enforcement: a
	// tower or enemy authored without an English name fails type-check here rather than rendering
	// its own key on screen.
	tower: {
		saltShaker: {
			name: 'Salt Shaker',
			description: 'Table salt, thrown a handful at a time. Ants will not cross it.',
		},
		toasterCrumbTray: {
			name: 'Toaster Crumb Tray',
			description: 'Pull it out and a week of breakfast comes with it. Somebody has to sweep up.',
		},
		cookieJar: {
			name: 'Cookie Jar',
			description: 'The lid never sits straight. Crumbs collect around it faster than you can eat them.',
		},
		iceCubeTray: {
			name: 'Ice Cube Tray',
			description: 'Left out to thaw on the counter. Whatever walks through it slows right down.',
		},
		stickyTape: {
			name: 'Sticky Tape',
			description: 'Three strips off the roll. One thing gets stuck to each, and that is the roll gone.',
		},
		sprayBottle: {
			name: 'Spray Bottle',
			description: 'Kitchen cleaner, one pull at a time. Whatever the mist settles on keeps going over.',
		},
	} satisfies TowerMessages,
	enemy: {
		ant: {
			name: 'Ant',
			description: 'Small, tireless, and never on its own. It only wants one thing from the fridge.',
		},
		roach: {
			name: 'Roach',
			description: 'Fast, flat and unbothered by the light. It is across the counter before you decide.',
		},
		beetle: {
			name: 'Beetle',
			description: 'Armoured, unhurried, and in no doubt about where it is going. It takes two things.',
		},
		fruitFly: {
			name: 'Fruit Fly',
			description: 'Hatched out of something you left too long. It starts halfway across the kitchen.',
		},
	} satisfies EnemyMessages,
	// No descriptions: what a food item is for is being taken by name. See `FoodMessages`.
	food: {
		pizzaSlice: { name: 'Slice of Pizza' },
		cheese: { name: 'Cheese' },
		apple: { name: 'Apple' },
		milk: { name: 'Milk' },
		cake: { name: 'Cake' },
		bread: { name: 'Bread' },
		grapes: { name: 'Grapes' },
		eggs: { name: 'Eggs' },
		chocolate: { name: 'Chocolate' },
		carrot: { name: 'Carrot' },
		chicken: { name: 'Chicken' },
		butter: { name: 'Butter' },
	} satisfies FoodMessages,
	// The night-end summary. `foodLost` is the line analytic-docs/DECISIONS.md section 6 calls the
	// emotional payload -- the specificity is the whole joke, so it lists items by name and never
	// collapses them into a count. The UI joins them with `listSeparator` and `general.and` for the
	// last one; there is deliberately no second word for "and" here.
	night: {
		wonTitle: 'It got to 6:00am',
		lostTitle: 'The fridge is empty',
		wonSubtitle: 'The kitchen is more or less as you left it.',
		lostSubtitle: 'There is nothing left on the shelves to defend.',
		wavesSurvived: 'Survived {survived} of {total} waves',
		foodLost: 'Lost: {items}',
		foodNothingLost: 'Nothing was taken.',
		foodRemaining: 'Still in the fridge: {n}',
		enemiesKilled: 'Dealt with: {n}',
		crumbsCollected: 'Swept up {collected} crumbs of {dropped} dropped',
		// A stub until step 20 pays the night out and writes the breakdown behind it.
		groceryMoney: 'Grocery money earned: {n}',
		listSeparator: ', ',
		retry: 'Try the night again',
		continue: 'Continue',
		// Night 7 is the last one authored. Step 20 is what turns this into a campaign.
		continueUnavailable: 'That is as far as the kitchen goes for now.',
	},
}

export type Messages = typeof en
