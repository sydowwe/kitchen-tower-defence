/**
 * Enemies that write onto the board: every enemy whose def carries a `tileWriter`, on its own clock.
 *
 * One mechanic with two candidate rules rather than one per enemy -- `trail` and `spread` share the
 * schedule, the write and the refresh, and differ only in which cell they pick. Nothing here names an
 * enemy or a tag; the def says what to write and how, and `core/tiles.ts` owns the write itself.
 *
 * **Killing the writer stops it, and nothing cleans up after it.** `resolveSystem` removes the enemy
 * and the cells it wrote stay as long as their own duration says -- forever, for mold.
 */

import { getEnemyDef } from '@/core/content/index.ts'
import type { EnemyDef } from '@/core/content/schema.ts'
import { flagsAt, TileFlags } from '@/core/map.ts'
import { bindRng } from '@/core/rng.ts'
import type { Rng } from '@/core/rng.ts'
import { hasEffect, neighbours, tileAt, writeEffect } from '@/core/tiles.ts'
import { enemyPosition } from '@/core/systems/spatial.ts'
import type { Enemy, TileEffectKind, Vec2, World } from '@/core/types.ts'

type TileWriter = NonNullable<EnemyDef['tileWriter']>

function tileIndex(world: World, tile: Vec2): number {
	return tile.y * world.map.widthTiles + tile.x
}

/**
 * Every cell a `spread` pulse may take: the on-board, non-`BLOCKED`, not-yet-`kind` orthogonal
 * neighbours of every cell that already has `kind` -- narrowed to the `TRACK` ones when there are
 * any, so a patch eats the road before it eats the build space around it.
 *
 * **The order is fixed by the board, never by `world.tiles`.** That array is in write order, and
 * clearing a cell and re-writing it moves it to the end -- which a candidate list built in that order
 * would carry straight into the draw, and a replay would diverge from the session it recorded. So the
 * source cells are sorted row-major first, `neighbours` answers in a fixed order, and a cell reachable
 * from two sources is kept where it was first met.
 *
 * Orthogonal only: a patch that grows on the diagonal reads as scattered noise at board scale, and
 * one that grows orthogonally reads as creeping.
 */
function spreadCandidates(world: World, kind: TileEffectKind): Vec2[] {
	const sources = world.tiles
		.filter(state => state.effects.some(effect => effect.kind === kind))
		.map(state => state.tile)
		.sort((a, b) => tileIndex(world, a) - tileIndex(world, b))

	const seen = new Set<number>()
	const candidates: Vec2[] = []

	for (const source of sources) {
		for (const tile of neighbours(world.map, source, false)) {
			const index = tileIndex(world, tile)
			if (seen.has(index)) {
				continue
			}
			seen.add(index)

			if ((flagsAt(world.map, tile) & TileFlags.BLOCKED) !== 0 || hasEffect(world, tile, kind)) {
				continue
			}
			candidates.push(tile)
		}
	}

	const onTrack = candidates.filter(tile => (flagsAt(world.map, tile) & TileFlags.TRACK) !== 0)
	return onTrack.length > 0 ? onTrack : candidates
}

/**
 * The cell this pulse writes, or null when there is nowhere left to write.
 *
 * For `spread`, **the writer's own tile wins while it is bare.** Without that rule a second Mold
 * takes root beside the *first* one's patch rather than where it landed, because every molded cell
 * on the board is a source.
 *
 * **Exactly one draw from `rng`, over a list that was filtered first.** Never "roll a neighbour and
 * re-roll if it is taken": the number of draws would then depend on the board, and every other
 * consumer of `world.rng` for the rest of the night would shift with it.
 */
function targetTile(world: World, enemy: Enemy, writer: TileWriter, rng: Rng): Vec2 | null {
	const at = enemyPosition(world, enemy)
	if (at === null) {
		return null
	}
	const own = tileAt(at)

	if (writer.mode === 'trail' || !hasEffect(world, own, writer.effect)) {
		return own
	}

	const candidates = spreadCandidates(world, writer.effect)
	return candidates.length === 0 ? null : rng.pick(candidates)
}

export function spreadSystem(world: World): void {
	// Terminal phases run nothing, or the patch keeps growing behind the summary screen.
	if (world.night.phase === 'won' || world.night.phase === 'lost') {
		return
	}

	const rng = bindRng(world.rng)

	for (const enemy of world.enemies) {
		const writer = getEnemyDef(enemy.defId).tileWriter
		if (writer === undefined || world.tick < enemy.nextTileWriteTick) {
			continue
		}

		const tile = targetTile(world, enemy, writer, rng)
		if (tile !== null) {
			// A repeat write refreshes rather than appends -- `onRewrite` on the kind's def decides, so
			// a slug re-crossing its own trail resets that cell's clock and a mold never re-stages one.
			writeEffect(world, tile, writer.effect, {
				magnitude: writer.magnitude,
				durationTicks: writer.durationTicks,
			})
		}

		// `+=`, never `world.tick + interval` -- see `Enemy.nextTileWriteTick`. A pulse with nowhere to
		// go still spends its turn, so a fully-grown patch does not re-scan the board every tick.
		enemy.nextTileWriteTick += writer.intervalTicks
	}
}
