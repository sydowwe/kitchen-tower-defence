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
