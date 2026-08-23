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

/** What is left of an enemy's health, and the socket it sits in. Only drawn on a damaged enemy. */
export const HP_BAR_BACK = 'rgba(8, 10, 18, 0.8)'
export const HP_BAR_FILL = '#7ad67a'

/**
 * The pad a tower stands on. A glyph alone floats over the floor and reads as dropped rather than
 * installed; a plate under it is what makes a tower furniture and an ant traffic.
 */
export const TOWER_PAD = 'rgba(226, 232, 255, 0.09)'
export const TOWER_PAD_EDGE = 'rgba(226, 232, 255, 0.22)'

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

/** The panel the fridge's remaining items sit on, so a row of glyphs reads as a shelf and not as litter. */
export const SHELF_BACKDROP = 'rgba(12, 16, 28, 0.55)'
export const SHELF_EDGE = 'rgba(255, 255, 255, 0.12)'
