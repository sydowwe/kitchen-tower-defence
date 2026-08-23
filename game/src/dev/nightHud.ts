/**
 * The night, as one line of canvas text. Scaffolding, and step 8 deletes it.
 *
 * It lives in `dev/` and not in `render/` for the reason `render/` has no `fillText` anywhere: the
 * real HUD is Vue over the canvas (step 8), and this is only here so a night can be watched play
 * itself out before that exists. Unlike the debug overlay it is **always on in dev** rather than
 * behind the backtick toggle -- this step's acceptance is leaving a night running unattended.
 *
 * Everything below is read off the world. The clock especially: `nightClock` is a pure function of
 * wave progress, and a second clock counting its own ticks would drift from the one the game means.
 */

import { nightClock } from '@/core/systems/wave.ts'
import type { World } from '@/core/types.ts'
import { LOGICAL_HEIGHT } from '@/render/index.ts'

const TEXT_COLOR = 'rgba(255, 255, 255, 0.92)'
const TEXT_BACKDROP = 'rgba(10, 12, 20, 0.75)'
const FONT = '13px ui-monospace, monospace'
const HINT_FONT = '11px ui-monospace, monospace'
const HINT_COLOR = 'rgba(255, 255, 255, 0.55)'

const MARGIN_PX = 10
const LINE_HEIGHT_PX = 17

function clockLabel(world: World): string {
	const { hour, minute } = nightClock(world.night.waveIndex, world.night.waveCount)
	return `${hour}:${String(minute).padStart(2, '0')}am`
}

/** `food.length` is the starting count and never moves -- 5B marks items lost and never splices. */
function foodLabel(world: World): string {
	const remaining = world.night.food.filter(item => !item.lost).length
	return `Food ${remaining}/${world.night.food.length}`
}

function statusLine(world: World): string {
	const night = world.night
	const parts = [
		`Wave ${night.waveIndex + 1}/${night.waveCount}`,
		clockLabel(world),
		foodLabel(world),
		`Crumbs ${Math.floor(world.crumbs)}`,
	]

	if (night.phase === 'won' || night.phase === 'lost') {
		parts.push(night.phase === 'won' ? 'WON' : 'LOST')
	} else if (night.phase === 'countdown') {
		parts.push(`next in ${Math.ceil(night.countdownTicks / 60)}s`)
	}

	return parts.join(' · ')
}

function drawLine(ctx: CanvasRenderingContext2D, text: string, font: string, color: string, y: number): void {
	ctx.font = font
	ctx.textAlign = 'left'
	ctx.textBaseline = 'top'
	const width = ctx.measureText(text).width
	ctx.fillStyle = TEXT_BACKDROP
	ctx.fillRect(MARGIN_PX - 4, y - 2, width + 8, LINE_HEIGHT_PX)
	ctx.fillStyle = color
	ctx.fillText(text, MARGIN_PX, y)
}

/** Drawn straight onto the live context, after `drawFrame`, from `GameView.vue`'s DEV branch. */
export function drawNightHud(ctx: CanvasRenderingContext2D, world: World): void {
	const top = LOGICAL_HEIGHT - MARGIN_PX - LINE_HEIGHT_PX * 2
	drawLine(ctx, statusLine(world), FONT, TEXT_COLOR, top)
	drawLine(ctx, 'n next wave · r restart', HINT_FONT, HINT_COLOR, top + LINE_HEIGHT_PX)
}
