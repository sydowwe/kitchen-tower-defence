/**
 * The size bands a crumb pile is drawn in, and nothing else -- this module imports nothing.
 *
 * **They live here and nowhere else.** A crumb has no def and `core/` carries no glyph for one -- its
 * `value` is the only truth (step 7A, decision 8) -- so the band is a pure function of `value`, and
 * `layers/crumbs.ts` is the one place that function is written. A `size` field on `Crumb` would be a
 * second truth that has to survive the JSON round-trip and can disagree with the value it came from.
 *
 * A module of its own, apart from `layers/crumbs.ts`, because `render/sprites.ts` needs the bands
 * too -- `crumb/<id>_128.png` is the sprite for a band -- and `layers/crumbs.ts` imports the glyph
 * cache, which imports `sprites.ts`. Reading the table from there would be an import cycle that fails
 * at startup depending on which module loads first.
 */

export interface CrumbBand {
	/** The sprite file's name: `crumb/<id>_128.png`. */
	id: string
	/** The lowest `value` that draws as this band. */
	minValue: number
	/** The emoji, and the key its sprite is found under. */
	glyph: string
	/** Fraction of a tile the glyph is blitted at. An enemy is 0.7: litter is smaller than traffic. */
	scale: number
}

/**
 * A speck, a crumb, a pile worth walking over for. Three is enough -- a fourth band is one line
 * here, and nothing else in the codebase has to hear about it.
 *
 * The thresholds are read against what a night actually drops: an Ant is 3 and a Roach is 5, so a
 * single kill is a speck or a crumb and only a merged kill zone reaches the pile (DECISIONS.md
 * section 4, "one fat pile worth clicking, not forty specks").
 */
export const SPECK: CrumbBand = { id: 'small', minValue: 0, glyph: '🍘', scale: 0.28 }

/** Descending, so the first match is the largest band the value reaches. */
export const CRUMB_BANDS: readonly CrumbBand[] = [
	{ id: 'large', minValue: 15, glyph: '🍪', scale: 0.56 },
	{ id: 'medium', minValue: 5, glyph: '🍞', scale: 0.4 },
	SPECK,
]
