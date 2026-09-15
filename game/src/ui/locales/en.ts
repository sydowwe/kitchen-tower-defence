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
		// Keyed by the `TargetingMode` literal, so the control renders the union directly.
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
		// The cycling control's tooltip: what the click does, then the whole order, so the six modes
		// are still written down somewhere now that they are no longer six chips (12C, decision 3).
		targetingCycle: 'Click to change, shift-click to go back',
		targetingOrder: 'First · Last · Strongest · Weakest · Closest · Random',
		sellFor: 'Sell for {n}',
		sellPenalty: 'Half price while a wave is running',
		// Tooltips, and the only place the two hotkeys that have no on-screen badge are written down.
		// `dev/nightHud.ts` carried a hint line for all of them until step 8C deleted it; the shop
		// prints its own numbers, and these two are what was left over.
		sellKey: 'Sell this tower  (x)',
		upgradeKey: 'Buy the next tier  (u)',
		callWaveKey: 'Call the next wave in early  (n)',

		// --- step 12C, the upgrade panel -------------------------------------------------------
		// A tier's own name is two or three words of kitchen and never "Damage +40%": the diff row
		// beside it already says that, and a name repeating it wastes the only line the tier has.
		// These are the words *around* the tiers.
		// `hud.tier` above is the readout in the header and is reused on a slot -- one string for one
		// idea, so a tier is spelled the same way in both places it appears.
		tierOwned: 'Bought',
		upgradeFor: 'Upgrade · {n}',
		// The one modal fact about the third tier, said once at the top of it rather than on each
		// slot: the first two are numbers and this one is a different tower.
		tierThreeLead: 'At tier 3',
		// The tower is finished. Shown where the button was, so the panel does not simply lose a row.
		tierMaxed: 'Nothing left to buy.',
		// Between the two halves of a diff row. A word rather than an arrow glyph would not survive
		// a narrow panel, and this is the one place in the HUD an arrow means something exact.
		diffArrow: '→',
		// A stat the tier adds outright, on the side of the row that has no number yet.
		diffNone: '—',
		// One line per stat on the hover card. A tower with no attack shows none of the first six
		// rather than showing them as zero -- see `TowerStatsView` in ui/viewModel.ts.
		stat: {
			damage: 'Damage',
			rate: 'Rate',
			// **Per target.** A tier-3 Salt Shaker splashes and a tier-3 Toaster throws a second
			// projectile, so an unqualified "damage per second" is a number that silently means
			// "against a crowd" -- and this one is checkable with a stopwatch against one ant, which
			// is exactly what step 12C's acceptance does to it (12C, decision 5).
			dps: 'Damage/sec',
			// One sentence under the card rather than an attempt to encode the matrix in the number.
			// CONTENT.md section 3 is a nine-row table and no row of a stat block is going to hold it.
			dpsNote: 'Per target, before the type matrix.',
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
			// The pass-through, for a row whose value carries no unit. It exists so `StatValueView`
			// in ui/viewModel.ts has one shape for a bare number and a word alike, and the upgrade
			// diff is one `t()` call with no branch in it.
			plain: '{n}',
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
		hint: '1-9 0 tower · shift-click keeps building · u upgrade · x sell · n next wave · space pause · , . speed',
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
	// core/content/towers.ts derives them. Drafted blind in 12A and 12B and **rewritten in 12C
	// against the panel**, which is the half of the author-twice this catalogue owes.
	//
	// A tier name is two or three words of kitchen, never "Damage +40%": the diff row beside it
	// already says what moved, and a name repeating it wastes the only line the tier has. Tiers 1 and
	// 2 are names only; their diff is their description. A tier-3 sentence says the thing no diff row
	// carries -- five of the six behaviours 12B added are invisible to `statsFor`, so this sentence
	// is the whole of what the player is saving 250% of a tower for.
	tower: {
		saltShaker: {
			name: 'Salt Shaker',
			description: 'Table salt, thrown a handful at a time. Ants will not cross it.',
			tier1: { name: 'Coarse Grind' },
			tier2: { name: 'Rock Salt' },
			tier3: {
				name: 'By The Handful',
				description:
					'It stops being aimed at anything in particular. Whatever is standing next to the target gets some as well.',
			},
		},
		toasterCrumbTray: {
			name: 'Toaster Crumb Tray',
			description: 'Pull it out and a week of breakfast comes with it. Somebody has to sweep up.',
			tier1: { name: 'Emptied Nightly' },
			tier2: { name: 'Deeper Tray' },
			tier3: {
				name: 'Straight In',
				description: 'No trip across the floor. A pile inside the radius is in the tray the moment it lands.',
			},
		},
		cookieJar: {
			name: 'Cookie Jar',
			description: 'The lid never sits straight. Crumbs collect around it faster than you can eat them.',
			tier1: { name: 'Lid Ajar' },
			tier2: { name: 'Lid Off' },
			tier3: {
				name: 'Screwed Down',
				description: 'Nothing spills when it goes. Breaking it open stops paying for the next thing through.',
			},
		},
		iceCubeTray: {
			name: 'Ice Cube Tray',
			description: 'Left out to thaw on the counter. Whatever walks through it slows right down.',
			tier1: { name: 'Fresh Cubes' },
			tier2: { name: 'Straight From Frozen' },
			tier3: {
				name: 'Deep Freeze',
				description:
					'Every fourth cube does not slow it down. It stops it where it stands, for a second and a half.',
			},
		},
		stickyTape: {
			name: 'Sticky Tape',
			description: 'Three strips off the roll. One thing gets stuck to each, and that is the roll gone.',
			tier1: { name: 'Wider Roll' },
			tier2: { name: 'Whole New Roll' },
			tier3: {
				name: 'Laid Across',
				description: 'One strip, down across the track. Three of them get stuck to it at once instead of one.',
			},
		},
		sprayBottle: {
			name: 'Spray Bottle',
			description: 'Kitchen cleaner, one pull at a time. Whatever the mist settles on keeps going over.',
			tier1: { name: 'Neat, Not Diluted' },
			tier2: { name: 'The Strong Stuff' },
			tier3: {
				name: 'Soaked Through',
				description: 'Two coats a pull. It reaches full strength in three sprays instead of five.',
			},
		},
		// Revised in step 10C against the card: the old line spent itself on "resetting takes a while",
		// which the `Resets in 6.6s` row now says exactly. What it says instead is the part no row
		// carries -- that it is a trap and it takes one thing.
		mousetrap: {
			name: 'Mousetrap',
			description: 'The old wooden kind, on a hair trigger. It takes one thing at a time, properly.',
			tier1: { name: 'Stronger Spring' },
			tier2: { name: 'Steel Bar' },
			tier3: {
				name: 'Set Straight Away',
				description: 'Reset in half the time. It is armed again before you have finished looking away.',
			},
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
			tier3: {
				name: 'Taped Shut',
				description: 'Packing tape, wound round twice. Chewing through it now costs them something.',
			},
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
			tier3: {
				name: 'Both Slots',
				description: 'Both elements on. It takes two of them a shot, rather than one of them twice.',
			},
		},
		// Revised in 11C. This card is nearly empty -- one radius and a noise row -- so the sentence
		// carries the whole tower: that it does not fight, and the two things it does instead.
		nightlight: {
			name: 'Nightlight',
			description:
				'Plugged in low by the skirting board. It hurts nothing at all — but nothing stays hidden near it, and moths cannot leave it alone.',
			tier1: { name: 'Brighter Bulb' },
			tier2: { name: 'Shade Off' },
			tier3: {
				name: 'Bare Filament',
				description: 'Running hot. Whatever it has pulled in close now burns for as long as it stays there.',
			},
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
