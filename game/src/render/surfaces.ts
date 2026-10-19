/**
 * What the floor of a map is made of.
 *
 * Chosen by **map id**, here, and deliberately not a field on `MapSource`: that would be a schema
 * change, a `loadMap` and `cloneMapDef` change, a hand-built `MapDef` in four test files and a change
 * to `dev/editor/serialize.ts`'s hand-written `toJson`. `ui/locales/en.ts` already keys map names by
 * `MapDef.id`, and this is the same precedent. Step 21 adds a line per map in both places.
 *
 * The drawing is `render/layers/terrain.ts`'s.
 */

export type Surface = 'counter' | 'tile' | 'wood'

const SURFACES = new Map<string, Surface>([['counter', 'counter']])

/** An id this table does not know -- the editor's untitled map, a half-finished one -- gets the Counter's. */
export function surfaceOf(mapId: string): Surface {
	return SURFACES.get(mapId) ?? 'counter'
}
