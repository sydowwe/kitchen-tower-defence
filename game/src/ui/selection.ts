/**
 * What the player currently has picked up, and what is under the pointer.
 *
 * It lives here rather than inside a component because three sessions -- the HUD, the pointer
 * handlers and the key bindings -- all meet the same "where does the selected tower id live"
 * question, and three answers is three sources of truth. `viewModel.ts`'s no-`vue` rule is about
 * that file alone; this one is UI state and reactive on purpose.
 *
 * **The hover fields are deliberately not refs.** A pointermove fires 60+ times a second, and a
 * `ref` there re-renders the whole HUD on every one of them. The ghost is drawn on the canvas, which
 * reads plain state at draw time and needs no reactivity at all. Symptom if they become refs: step
 * 8's frame-time acceptance fails and it gets blamed on "Vue costs something" rather than on one
 * field.
 */

import { ref } from 'vue'
import type { Ref } from 'vue'
import type { DefId, EntityId, Vec2 } from '@/core/types.ts'
import type { PlacementRejection } from '@/core/systems/placement.ts'
import type { PlacementTone } from '@/render/index.ts'

export interface Selection {
	/** The tower being placed, from a shop click or a number key. Reactive: the shop shows it armed. */
	selectedDefId: Ref<DefId | null>
	/** The tower on the board being inspected. Reactive: it drives the inspector panel. */
	selectedTowerId: Ref<EntityId | null>
	/** Plain. The tile the ghost stands on, mutated on every pointermove. */
	hoverTile: Vec2 | null
	/** Plain. Fractional, in the same tile space `samplePath` returns. */
	hoverPoint: Vec2 | null
	/** Plain. One `canPlaceTower` answer per move, so the ghost and the click cannot disagree. */
	tone: PlacementTone | null
	/** Plain. What the toast says on a refused click. */
	reason: PlacementRejection | null
	/**
	 * Plain. The enemy the tooltip describes, **latched**: picked on pointermove only and held until
	 * the pointer moves off it, leaves the canvas, or it is gone. Re-picking at publish rate against a
	 * still cursor drops a walking Ant within a second, and the tooltip flickers.
	 */
	hoveredEnemyId: EntityId | null
	/** Drops both selections and the hover. Escape and a night restart both call it. */
	clear(): void
}

export function createSelection(): Selection {
	const selectedDefId = ref<DefId | null>(null)
	const selectedTowerId = ref<EntityId | null>(null)

	const selection: Selection = {
		selectedDefId,
		selectedTowerId,
		hoverTile: null,
		hoverPoint: null,
		tone: null,
		reason: null,
		hoveredEnemyId: null,
		clear() {
			selectedDefId.value = null
			selectedTowerId.value = null
			selection.hoverTile = null
			selection.hoverPoint = null
			selection.tone = null
			selection.reason = null
			// Ids restart per world, so a stale one after a retry may name a live enemy in the new night.
			selection.hoveredEnemyId = null
		},
	}

	return selection
}
