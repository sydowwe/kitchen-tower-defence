/**
 * The one health bar, over an enemy and over a damaged tower alike.
 *
 * It sits here rather than in `layers/` because it is not a layer: `layers/entities.ts` and
 * `layers/towers.ts` both call it, and the second copy is what turns one bar into two visual
 * languages (step 10C, decision 3). The enemy's is the tuned one; the tower's is the same bar with a
 * different offset, which is why the offset is a parameter and not a branch.
 *
 * **Only ever drawn on something that has been hurt.** Sixty ants each wearing a full bar is a board
 * nobody can read, and the same rule is what makes a tower's bar mean something: in v1 it appears on
 * exactly one tower, the box being eaten.
 */

import { HP_BAR_BACK, HP_BAR_FILL } from '@/render/palette.ts'

export const HP_BAR_HEIGHT_PX = 3
/** Gap between the top edge of the thing the bar belongs to and the bar, in logical pixels. */
export const HP_BAR_GAP_PX = 2

/**
 * `topY` is the top edge of whatever this labels -- the enemy's glyph box, the tower's pad -- and the
 * bar is drawn above it. Nothing is drawn at full health or for a `maxHp` of 0.
 */
export function drawHpBar(
	ctx: CanvasRenderingContext2D,
	centerX: number,
	topY: number,
	width: number,
	hp: number,
	maxHp: number,
): void {
	if (hp >= maxHp || maxHp <= 0) {
		return
	}

	const left = centerX - width / 2
	const top = topY - HP_BAR_GAP_PX - HP_BAR_HEIGHT_PX
	const fraction = Math.min(Math.max(hp / maxHp, 0), 1)

	ctx.fillStyle = HP_BAR_BACK
	ctx.fillRect(left, top, width, HP_BAR_HEIGHT_PX)
	ctx.fillStyle = HP_BAR_FILL
	ctx.fillRect(left, top, width * fraction, HP_BAR_HEIGHT_PX)
}
