/**
 * The fridge's item pool -- the twelve foods of analytic-docs/CONTENT.md section 7.
 *
 * A def here is a *kind* of food; `FoodItem` in core/types.ts is one of them on a shelf. A night
 * draws eighteen-odd items from twelve defs, so duplicates on the shelf are normal and every item
 * carries its own entity id.
 *
 * The glyph lives on the def and never on the item, so renaming a key or redrawing an emoji is one
 * edit here rather than eighteen copies per night.
 */

import type { FoodDef } from '@/core/content/schema.ts'

/**
 * The food counterpart of `TowerDefOf` -- see the note there on why the key is derived. It is what
 * makes `ui/locales/contentKeys.ts` able to demand an English name per food id.
 */
export interface FoodDefOf<Id extends string> extends FoodDef {
	id: Id
	nameKey: `food.${Id}.name`
}

/** Twelve near-identical defs, so the id is written once and the key derived from it. */
function food<Id extends string>(id: Id, glyph: string): FoodDefOf<Id> {
	return { id, nameKey: `food.${id}.name`, glyph }
}

export const FOODS = [
	food('pizzaSlice', '🍕'),
	food('cheese', '🧀'),
	food('apple', '🍎'),
	food('milk', '🥛'),
	food('cake', '🍰'),
	food('bread', '🥖'),
	food('grapes', '🍇'),
	food('eggs', '🥚'),
	food('chocolate', '🍫'),
	food('carrot', '🥕'),
	food('chicken', '🍗'),
	food('butter', '🧈'),
]

export type FoodId = (typeof FOODS)[number]['id']
