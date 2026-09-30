/**
 * The night modifiers of analytic-docs/CONTENT.md section 6: a named patch a night is built with, and
 * the content lever for every later update (analytic-docs/DECISIONS.md section 9).
 *
 * A modifier is a list of effects from a fixed vocabulary. Its numbers fold into `world.modifiers`
 * (`applyNightModifier`), and its things -- crumbs on the floor, boxes on the build tiles -- are built
 * onto the board by `createWorld`. No system reads a modifier id; each reads the field it owns.
 */

import { copyModifiers } from '@/core/content/installations.ts'
import type { NightModifierDef } from '@/core/content/schema.ts'
import type { DefId, WorldModifiers } from '@/core/types.ts'

/** One effect of a night modifier. */
export type NightModifierEffect = NightModifierDef['effects'][number]

/** The installation pattern: the id is written once, and `ui/locales/contentKeys.ts` demands its English. */
export interface NightModifierDefOf<Id extends string> extends NightModifierDef {
	id: Id
	nameKey: `modifier.${Id}.name`
	descriptionKey: `modifier.${Id}.description`
}

function modifier<Id extends string>(id: Id, glyph: string, effects: NightModifierEffect[]): NightModifierDefOf<Id> {
	return {
		id,
		nameKey: `modifier.${id}.name`,
		descriptionKey: `modifier.${id}.description`,
		glyph,
		effects,
	}
}

/**
 * Dishes left out's piles are 5: a Roach's reward, and the smallest value drawn as the 🍞 band. So each
 * one reads as a kill's worth left on the lane -- a crumb worth the click, not a speck -- and the fifteen
 * together are 75, over a third of a normal night's starting 200.
 */
const SCATTERED_PILE_VALUE = 5

/**
 * analytic-docs/CONTENT.md section 6's five, in night order.
 *
 * The box is 🧳, **not 📦**: sprites are found by glyph, and a 📦 on a build tile draws as the Cardboard
 * Box a player thinks they own. `validateContent` refuses a tower's or an enemy's glyph on any of these.
 */
export const NIGHT_MODIFIERS = [
	modifier('dishesLeftOut', '🥘', [{ kind: 'scatterCrumbs', piles: 15, value: SCATTERED_PILE_VALUE }]),
	// A rate, so the interval is divided: 720 becomes 480.
	modifier('dampNight', '💧', [{ kind: 'spreadRate', mult: 1.5 }]),
	modifier('dinnerParty', '🥂', [
		{ kind: 'enemyCount', mult: 2 },
		{ kind: 'crumbValue', mult: 2 },
	]),
	modifier('movingDay', '🚚', [{ kind: 'boxes', fraction: 0.3, glyph: '🧳' }]),
	modifier('heatwave', '🌡️', [
		{ kind: 'damageType', damageType: 'fire', mult: 1.3 },
		{ kind: 'damageType', damageType: 'cold', mult: 0.7 },
	]),
]

export type NightModifierId = (typeof NIGHT_MODIFIERS)[number]['id']

/**
 * The world fields each effect kind writes, as JSON paths from the world's root, and nothing else.
 * `tests/modifiers.spec.ts` builds each modifier's night beside a plain one and holds the diff to this.
 *
 * A `Record` over the kinds, so a new kind cannot ship without saying what it touches.
 */
export const NIGHT_MODIFIER_WRITES: Readonly<Record<NightModifierEffect['kind'], readonly string[]>> = {
	scatterCrumbs: ['crumbPiles', 'index.crumbPiles', 'nextEntityId', 'night.crumbsDropped'],
	spreadRate: ['modifiers.spreadRateMult'],
	enemyCount: ['modifiers.enemyCountMult'],
	crumbValue: ['modifiers.crumbValueMult'],
	boxes: ['map.flags', 'map.decor'],
	damageType: ['modifiers.damageTypeMult'],
}

/** Throws with the id: it arrives from a night def, and an unknown one is an authoring mistake. */
export function getNightModifierDef(id: DefId): NightModifierDef {
	const found = NIGHT_MODIFIERS.find(entry => entry.id === id)
	if (found === undefined) {
		throw new Error(`unknown night modifier id '${id}'`)
	}
	return found
}

/**
 * `modifiers` with this night modifier's numbers folded in, as a new object: `modifiers` itself and
 * every record in it are left alone. Multipliers multiply, so the Pantry Shelf Liner's 0.6 and a damp
 * night's 1.5 are 0.9 -- a product, never a max.
 *
 * The board's effects are `createWorld`'s and fold nothing here.
 */
export function applyNightModifier(modifiers: WorldModifiers, def: NightModifierDef): WorldModifiers {
	const folded = copyModifiers(modifiers)

	for (const effect of def.effects) {
		switch (effect.kind) {
			case 'spreadRate':
				folded.spreadRateMult *= effect.mult
				break
			case 'enemyCount':
				folded.enemyCountMult *= effect.mult
				break
			case 'crumbValue':
				folded.crumbValueMult *= effect.mult
				break
			case 'damageType':
				folded.damageTypeMult[effect.damageType] *= effect.mult
				break
			case 'scatterCrumbs':
			case 'boxes':
				break
			default: {
				// A new kind fails `type-check` here, which is the point of the union.
				const unfolded: never = effect
				throw new Error(`night modifier '${def.id}' has an effect the fold does not know: ${String(unfolded)}`)
			}
		}
	}

	return folded
}
