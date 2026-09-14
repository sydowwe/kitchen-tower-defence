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
			// A lamp's one row, and it says what the tower *does* rather than what the behaviour is
			// called: "Reveal radius" is the vocabulary word, and nobody is buying a radius.
			lights: 'Lights up',
			cone: 'Cone',
			applies: 'Applies',
			// A wall's rows. `blocks` is a label and `blocksGround` its answer: the card is a two-column
			// list and a row with a label and no value reads as a missing number.
			hitPoints: 'Hit points',
			blocks: 'Blocks',
			blocksGround: 'Everything on the floor',
			// A charge tower's. `rearm` is null for a tape, which does not rearm -- see `TowerStatsView`.
			charges: 'Uses',
			rearm: 'Resets in',
			perSecond: '{n}/sec',
			seconds: '{n}s',
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
		hint: '1-9 0 tower · shift-click keeps building · x sell · n next wave · space pause · , . speed',
	},
	settings: {
		title: 'Settings',
		volume: 'Volume',
		showFps: 'Show FPS',
	},

	// One entry per def in core/content/, keyed by its id. The `satisfies` is the enforcement: a
	// tower or enemy authored without an English name fails type-check here rather than rendering
	// its own key on screen.
	//
	// The `tier1` / `tier2` / `tier3` blocks are the upgrade names, keyed the way
	// core/content/towers.ts derives them. **They were written blind in step 12A** -- nothing on
	// screen reads them until 12C builds the inspector, and 12C rewrites every one of them against
	// it. Tiers 1 and 2 are names only; the diff above them is the description.
	tower: {
		saltShaker: {
			name: 'Salt Shaker',
			description: 'Table salt, thrown a handful at a time. Ants will not cross it.',
			tier1: { name: 'Coarse Grind' },
			tier2: { name: 'Rock Salt' },
			tier3: {
				name: 'Scattered',
				description: 'A whole handful at once. Whatever is standing next to the target gets some too.',
			},
		},
		toasterCrumbTray: {
			name: 'Toaster Crumb Tray',
			description: 'Pull it out and a week of breakfast comes with it. Somebody has to sweep up.',
			tier1: { name: 'Emptied Nightly' },
			tier2: { name: 'Deeper Tray' },
			tier3: {
				name: 'Straight In',
				description: 'No trip. A pile that falls inside the radius is counted where it lands.',
			},
		},
		cookieJar: {
			name: 'Cookie Jar',
			description: 'The lid never sits straight. Crumbs collect around it faster than you can eat them.',
			tier1: { name: 'Lid Ajar' },
			tier2: { name: 'Lid Off' },
			tier3: {
				name: 'Sealed',
				description: 'Screwed down properly. Breaking it open gets them nothing to spend.',
			},
		},
		iceCubeTray: {
			name: 'Ice Cube Tray',
			description: 'Left out to thaw on the counter. Whatever walks through it slows right down.',
			tier1: { name: 'Fresh Cubes' },
			tier2: { name: 'Straight From The Freezer' },
			tier3: { name: 'Deep Freeze', description: 'Every fourth cube stops it where it stands.' },
		},
		stickyTape: {
			name: 'Sticky Tape',
			description: 'Three strips off the roll. One thing gets stuck to each, and that is the roll gone.',
			tier1: { name: 'Wider Roll' },
			tier2: { name: 'Double Sided' },
			tier3: { name: 'Laid Across', description: 'Three at a time, stuck to the same strip.' },
		},
		sprayBottle: {
			name: 'Spray Bottle',
			description: 'Kitchen cleaner, one pull at a time. Whatever the mist settles on keeps going over.',
			tier1: { name: 'Neat, Not Diluted' },
			tier2: { name: 'The Strong Stuff' },
			tier3: { name: 'Soaked Through', description: 'It goes on thick enough to keep working.' },
		},
		// Revised in step 10C against the card: the old line spent itself on "resetting takes a while",
		// which the `Resets in 6.6s` row now says exactly. What it says instead is the part no row
		// carries -- that it is a trap and it takes one thing.
		mousetrap: {
			name: 'Mousetrap',
			description: 'The old wooden kind, on a hair trigger. It takes one thing at a time, properly.',
			tier1: { name: 'Stronger Spring' },
			tier2: { name: 'Steel Bar' },
			tier3: { name: 'Set Again At Once', description: 'Reset in half the time, and armed twice as often.' },
		},
		// Revised in step 10C for the same reason. `Hit points 200` and `Blocks` are on the card now,
		// so the description is free to answer the only question a 25-crumb tower with no attack raises:
		// what it is *for*.
		cardboardBox: {
			name: 'Cardboard Box',
			description:
				'Set across the track so they stop and chew instead of walking past. It buys seconds, not the night.',
			tier1: { name: 'Double Walled' },
			tier2: { name: 'Packed Solid' },
			tier3: { name: 'Taped Shut', description: 'Chewing through it costs them something now.' },
		},
		// Revised in 11C against the card. The draft's "the only thing here that can reach a fly" was two
		// kinds of wrong once the card existed: `Targets Air` now sits at the top of it and says the same
		// thing, and it was not true -- the Spray Bottle has reached air since step 9. So the sentence is
		// spent on what the thing *is*, which is also what tells it apart from the 🧺 two rows along: that
		// one is a tray of crumbs, this one is the appliance, on.
		toaster: {
			name: 'Toaster',
			description: 'Jammed on with the lever down, breathing at the ceiling. Nobody is making toast.',
			tier1: { name: 'Setting 4' },
			tier2: { name: 'Setting 6' },
			tier3: { name: 'Both Slots', description: 'Two at once, at whatever is over it.' },
		},
		// Revised in 11C. This card is nearly empty -- one radius and a noise row -- so the sentence
		// carries the whole tower: that it does not fight, and the two things it does instead.
		nightlight: {
			name: 'Nightlight',
			description:
				'Plugged in low by the skirting board. It hurts nothing at all — but nothing stays hidden near it, and moths cannot leave it alone.',
			tier1: { name: 'Brighter Bulb' },
			tier2: { name: 'Two In The Socket' },
			tier3: { name: 'Bare Filament', description: 'Hot enough now that getting close to it costs something.' },
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
		// Read again in 11C against the card and kept: it says the one thing no row on it says, which is
		// that it ignores the board you built rather than beating it.
		fly: {
			name: 'Fly',
			description: 'Straight over everything you built, at a speed nothing else on the counter manages.',
		},
		// Read again in 11C and kept. Nothing on a card can say "it does not go where it is pointed", and
		// that is the whole of what makes a Moth different to read on the board.
		moth: {
			name: 'Moth',
			description:
				'The only thing out here with no plan. It wanders off toward any light and then remembers the fridge.',
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
