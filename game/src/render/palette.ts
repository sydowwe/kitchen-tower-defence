/**
 * The 2am kitchen, as named constants.
 *
 * Named by **role**, never by colour: the art pass in step 23 retunes every value here, and a
 * `SLATE_BLUE` that has become brown is worse than no name at all.
 *
 * `render/` cannot read CSS variables, so `BACKGROUND` is duplicated in `ui/App.vue` as
 * `--kd-night`. Change one and change the other.
 */

/** The board behind everything. Matches `--kd-night` in ui/App.vue. */
export const BACKGROUND = '#10131f'

/** Floor a tower may stand on: the base, one step lighter. */
export const TILE_BUILDABLE = '#1a1f33'

/** Floor that is scenery only -- readable as floor, but not as somewhere to build. */
export const TILE_DECOR = '#151a2b'

/** Counter edge, appliance, wall. Darker than the background so it reads as mass, not as a hole. */
export const TILE_BLOCKED = '#0a0d16'

/** The lit edge around the outside of a run of blocked tiles, so the mass has a rim. */
export const TILE_BLOCKED_EDGE = '#232a45'

/**
 * The mottle wash: soft blobs a couple of tiles across, breaking up the flat fills so the floor
 * reads as a surface rather than as a fill.
 *
 * It deliberately does **not** align to the grid. The first version of this was a per-tile alpha
 * jitter, which is the same idea and turns out to be precisely the failure it was meant to prevent
 * -- varying brightness per tile draws the tile boundaries in, and the board reads as a
 * spreadsheet. Anything textural here has to be at a scale the grid does not share.
 */
export const TILE_MOTTLE = '#ffffff'
export const TILE_MOTTLE_ALPHA = 0.035

/** The darker pass under the track, drawn wider so it shows as an outline. */
export const TRACK_OUTLINE = '#221a17'

/** The track itself: warmer and lighter than the floor, the way a well-walked line goes shiny. */
export const TRACK_FILL = '#4c3f35'

/** The centre and the far edge of a pool of lamp light. Low contrast on purpose. */
export const LAMP_CORE = 'rgba(245, 198, 107, 0.2)'
export const LAMP_EDGE = 'rgba(245, 198, 107, 0)'

/**
 * What an enemy that is off the floor casts on it.
 *
 * Darker than the darkest floor and translucent, so it reads as a shadow over whatever it crosses --
 * the track, a crumb pile, a pool of lamp light -- rather than as a hole punched in it. It is the
 * *ground* half of "this thing is flying"; the bob is the other half, and neither works alone.
 */
export const FLYER_SHADOW = 'rgba(4, 6, 12, 0.38)'

/**
 * The pool a lamp *tower* throws, in the same two stops the terrain bake's lamps use.
 *
 * Deliberately the same hue as `LAMP_CORE`: this is the same kitchen light, and a Nightlight that
 * glowed a colour the board does not already have would read as a status effect on the floor rather
 * than as a lamp being on. A touch dimmer than the baked pools, which are half a board across and
 * this is four tiles.
 */
export const TOWER_LIGHT_CORE = 'rgba(245, 198, 107, 0.16)'
export const TOWER_LIGHT_EDGE = 'rgba(245, 198, 107, 0)'

/** What is left of an enemy's health, and the socket it sits in. Only drawn on a damaged enemy. */
export const HP_BAR_BACK = 'rgba(8, 10, 18, 0.8)'
export const HP_BAR_FILL = '#7ad67a'

/**
 * The pad a tower stands on. A glyph alone floats over the floor and reads as dropped rather than
 * installed; a plate under it is what makes a tower furniture and an ant traffic.
 */
export const TOWER_PAD = 'rgba(226, 232, 255, 0.09)'
export const TOWER_PAD_EDGE = 'rgba(226, 232, 255, 0.22)'

/**
 * A charge tower between shots: the ring the rearm fills, and the fill itself.
 *
 * The sweep is deliberately the brightest thing on a tower pad. Armed and rearming have to be
 * separable in peripheral vision at 3x speed (step 10C, build item 2), and the glyph cannot carry
 * that difference on its own -- `blitGlyph` hands out an opaque bitmap, so the only treatment
 * available over it is alpha.
 */
export const TOWER_REARM_TRACK = 'rgba(226, 232, 255, 0.14)'
export const TOWER_REARM_SWEEP = 'rgba(255, 196, 71, 0.95)'

/**
 * What an upgraded tower wears: a wash inside the pad at tier 1, a ring at its edge at tier 2, and a
 * badge in its corner at tier 3.
 *
 * Deliberately **not** the rearm sweep's colour. A rearm is a gauge that moves and a tier is a fact
 * that does not, and the one thing step 10C bought with that yellow was "this tower is not ready" --
 * a maxed tower wearing it would be reading as mid-rearm from across the room. This is the panel's
 * own `--kd-owned-dim` family, which is the colour the HUD already spends on "you own this".
 *
 * The wash is **0.28 and not the 0.1 it was authored at**. A tenth of an alpha over a pad that is
 * already dark is invisible at the size a tile actually renders -- checked on screen rather than
 * reasoned about: the ring was legible at a glance and the wash could not be found at all, so the
 * first two tiers were telling the player nothing and something.
 */
export const TOWER_TIER_GLOW = 'rgba(245, 198, 107, 0.28)'
export const TOWER_TIER_RING = 'rgba(245, 198, 107, 0.55)'
export const TOWER_TIER_BADGE = 'rgba(255, 214, 120, 0.95)'

/** Cracks drawn over a damaged barricade. Darker than anything under it, so it reads as a split. */
export const TOWER_CRACK = 'rgba(24, 14, 8, 0.75)'

/** The puff a destroyed tower leaves: a ring and the pieces of it going outward. */
export const TOWER_DEBRIS = 'rgba(214, 178, 128, 0.9)'

/** What a queue chews off a cardboard box. The same family as the debris, and much smaller. */
export const CHEW_DEBRIS = 'rgba(214, 178, 128, 0.8)'

/** A shot in flight. Salt, so: brighter than anything it crosses, and small. */
export const PROJECTILE_SHOT = '#f2f4ff'

/**
 * The range ring while a build is being aimed. Green and red carry the answer `canPlaceTower` gave
 * for the tile under the cursor; the neutral one is a placed tower showing its own reach and is
 * deliberately not either of them -- a selected tower is not a judgement.
 */
export const RANGE_VALID = 'rgba(122, 214, 122, 0.85)'
export const RANGE_VALID_FILL = 'rgba(122, 214, 122, 0.1)'
export const RANGE_INVALID = 'rgba(232, 106, 96, 0.85)'
export const RANGE_INVALID_FILL = 'rgba(232, 106, 96, 0.1)'
export const RANGE_NEUTRAL = 'rgba(226, 232, 255, 0.6)'
export const RANGE_NEUTRAL_FILL = 'rgba(226, 232, 255, 0.06)'

/**
 * The expanding ring on a hit, and the number that goes with it.
 *
 * A ring at the hit position rather than a tint on the enemy: `blitGlyph` blits a pre-rasterised
 * bitmap and cannot tint one, and the hit that *killed* the enemy has no glyph left to tint -- the
 * entities layer will not draw it next frame (step 6C, decision 7).
 */
export const HIT_FLASH = 'rgba(255, 244, 214, 0.9)'
export const DAMAGE_NUMBER = '#ffe9a8'

/**
 * The mould under a pile that has started to go over.
 *
 * Two stops of the same green rather than a gradient: one soft cast is the whole rot tell, and a
 * `createRadialGradient` per pile per frame allocates on the 60Hz path for a difference nobody can
 * see at 3x speed.
 */
export const CRUMB_ROT_HALO = 'rgba(126, 214, 96, 0.13)'
export const CRUMB_ROT_CORE = 'rgba(126, 214, 96, 0.3)'

/**
 * Taking a pile: the ring that goes off where it was, and the `+N` that rises off it.
 *
 * Warmer and more saturated than `DAMAGE_NUMBER` on purpose -- crumbs are money and hits are not,
 * and the two land on the same board within a frame of each other.
 */
export const CRUMB_POP = 'rgba(255, 214, 150, 0.9)'
export const CRUMB_VALUE = '#ffc247'

/**
 * The four status treatments, one colour family each.
 *
 * They are told apart by **colour and shape together**, never by colour alone: a slow is a disc under
 * the glyph, a burn is a flicker over its head, a poison is bubbles rising off it and a root is a ring
 * around its feet. At 3x speed on a board of forty, the shape is what carries at a glance and the hue
 * is what confirms it.
 *
 * The slow is a disc drawn **under** the glyph and not a tint of it: the cache hands out an opaque
 * bitmap and `blitGlyph` cannot recolour one (step 9C, decision 2).
 */
export const STATUS_SLOW_DISC = 'rgba(120, 176, 255, 0.42)'
export const STATUS_SLOW_SPECK = 'rgba(214, 234, 255, 0.85)'
export const STATUS_BURN_FLAME = 'rgba(255, 146, 52, 0.9)'
export const STATUS_POISON_BUBBLE = 'rgba(138, 226, 106, 0.85)'
export const STATUS_ROOTED_SHIMMER = 'rgba(236, 242, 255, 0.8)'

/**
 * Somebody flipped the kitchen light on.
 *
 * `WAKE_WASH` is a warm off-white rather than the full-chroma amber of `LAMP_CORE`, and that is
 * load-bearing rather than a shade preference. It is drawn **over** the desaturating pass, so its own
 * saturation lands on top of what that pass just drained: authored at the amber's own
 * `rgb(245, 198, 107)` it measured the board *more* saturated at the peak of the wash than at rest
 * (0.38 against a 0.27 baseline), which is the exact opposite of what the wake is supposed to look
 * like. A warm white adds the brightness and the temperature without putting the colour back.
 *
 * It is also the more honest picture: a ceiling light coming on at full does not tint the room
 * orange, it flattens it. Alpha is authored at the draw, because the wash rises and falls.
 *
 * `WAKE_DESATURATE` is drawn through `globalCompositeOperation = 'saturation'`, so what matters about
 * it is that it has none: the blend hands its saturation to everything already on the canvas, and a
 * grey drains the colour out of the board under the light.
 */
export const WAKE_WASH = 'rgb(255, 243, 222)'
export const WAKE_DESATURATE = 'rgb(128, 128, 128)'

/**
 * What the floor itself is carrying: the five tile effects, one colour family each.
 *
 * Told apart by **shape as well as colour**, for the reason the status treatments above are and one
 * more besides. Several kinds sit on one cell routinely -- slimed *and* on fire is the canonical
 * case -- and two coloured washes over one 48px square are one muddy square, so the shapes are a
 * blotch, a speckled patch, a glossy puddle, a pulsing ring and a flat wash.
 *
 * `TILE_HEAT_PULSE` is an ember red and emphatically **not** the `LAMP_CORE` / `TOWER_LIGHT_CORE`
 * amber. Those two are already on the board in quantity, and a heat glow in their family is a tile
 * that reads as *lit* rather than as lethal -- which is the one thing a heated tile has to say.
 *
 * `TILE_RESIDUE_MIST` is `STATUS_POISON_BUBBLE`'s green at a fraction of the alpha, because what
 * standing in residue does is apply poison, and the tell for that already means that.
 *
 * `TILE_SCORCH_STAIN` is the quiet one on purpose. It is permanent and it accumulates all night, so
 * any real contrast turns the board into soot by the end of a Toaster's shift.
 */
export const TILE_SCORCH_STAIN = 'rgba(14, 10, 8, 0.36)'
export const TILE_MOLD_PATCH = 'rgba(118, 146, 92, 0.34)'
export const TILE_MOLD_SPECK = 'rgba(186, 214, 148, 0.7)'
export const TILE_SLIME_SHEEN = 'rgba(86, 214, 190, 0.3)'
export const TILE_SLIME_GLOSS = 'rgba(214, 255, 246, 0.5)'
export const TILE_HEAT_PULSE = 'rgba(255, 96, 40, 0.85)'
export const TILE_HEAT_CORE = 'rgba(255, 152, 72, 0.45)'
export const TILE_RESIDUE_MIST = 'rgba(138, 226, 106, 0.17)'

/** What a loud tower's ghost says it will add to the meter, under the tile it would stand on. */
export const GHOST_NOISE = '#f5c66b'

/** The panel the fridge's remaining items sit on, so a row of glyphs reads as a shelf and not as litter. */
export const SHELF_BACKDROP = 'rgba(12, 16, 28, 0.55)'
export const SHELF_EDGE = 'rgba(255, 255, 255, 0.12)'
