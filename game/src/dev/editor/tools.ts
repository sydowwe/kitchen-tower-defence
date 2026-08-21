/**
 * The tool vocabulary and the decor palette: the two lists the panels and the pointer handlers both
 * have to agree on.
 *
 * Kept out of `EditorView.vue` so a panel can be typed against it without importing the view, and
 * out of `edits.ts` because nothing here describes a change to a map -- only what the pointer is
 * currently for.
 */

/** What a left-drag on the board does. */
export const EDITOR_TOOLS = ['brush', 'path', 'fridge', 'decor'] as const

export type EditorTool = (typeof EDITOR_TOOLS)[number]

export const TOOL_LABELS: Record<EditorTool, string> = {
	brush: 'Tiles',
	path: 'Paths',
	fridge: 'Fridge',
	decor: 'Decor',
}

export const TOOL_HINTS: Record<EditorTool, string> = {
	brush: 'drag to paint, right-drag to erase back to floor',
	path: 'click empty board to append, drag a handle to move, click a segment to insert, right-click to delete',
	fridge: 'click a tile to move the fridge',
	decor: 'click to place the selected glyph, right-click to remove one',
}

/**
 * A 2am kitchen worth of scenery. Glyphs only: a decor *glyph* is drawn on top of the floor and
 * changes nothing about placement, while the `~` brush is what makes a tile unbuildable (step 4B,
 * section 5).
 */
export const DECOR_PALETTE = [
	'🧽',
	'🍶',
	'🪴',
	'🧴',
	'🧂',
	'🍞',
	'🥫',
	'🫙',
	'🧄',
	'🧅',
	'🍋',
	'☕',
	'🍽️',
	'🥄',
	'🪣',
	'🧹',
	'🕯️',
	'🧻',
] as const

/** Candidate fridges, so the glyph is a click rather than a paste. */
export const FRIDGE_GLYPHS = ['🗄️', '🧊', '🚪'] as const
