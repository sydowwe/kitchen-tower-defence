/**
 * The map roster: one JSON file per map, validated and loaded here.
 *
 * JSON rather than a TS module because step 4's editor exports maps -- and an editor that has to
 * emit source code is a code generator (step 3A, decision 1).
 *
 * The dev-time validation happens **here** rather than in `core/content/index.ts` with everything
 * else, because it has to run before `loadMap` does: zod's message names the field, `loadMap`'s
 * names only the map. `core/content/index.ts` therefore leaves `maps` out of its own boot check.
 */

import { loadMap } from '@/core/map.ts'
import { validateContentInDev } from '@/core/content/schema.ts'
import type { MapSource } from '@/core/content/schema.ts'
import type { MapDef } from '@/core/types.ts'
import counter from '@/core/content/maps/counter.json'

/** The authored maps, exactly as they sit on disk. Step 4's editor round-trips these. */
export const MAP_SOURCES = [counter] as MapSource[]

validateContentInDev({ maps: MAP_SOURCES })

/** What `World` holds: char grid resolved to flags, track rasterised out of the polyline. */
export const MAPS: MapDef[] = MAP_SOURCES.map(loadMap)
