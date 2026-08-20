/**
 * The map being edited: an authored `MapSource`, the `MapDef` it derives to, its problem list and
 * twenty steps of undo. No canvas, no Vue, no DOM -- the tool that drives all of this is 4B.
 *
 * The document *is* a `MapSource` (step 4A, decision 1). Editing a `MapDef` would mean editing the
 * rasterised `TRACK` bits, which is hand-painted track by another name and is the thing
 * `DECISIONS.md` section 3 settled.
 *
 * Two rules the rest of the file exists to keep:
 *
 * - **`lengthTiles` is recomputed on every edit**, never carried. `loadMap` throws when the
 *   authored value disagrees with the waypoints, so a stale one makes the map unloadable through
 *   the entire middle of a drag.
 * - **The `MapDef` is rebuilt whole.** `core/path.ts` caches its arc-length table against the
 *   `Path` *object*, so a fresh object per edit gets a fresh table; mutating waypoints in place
 *   would leave every length readout one edit behind.
 */

import { loadMap } from '@/core/map.ts'
import { buildablePercent, validateEditorMap } from '@/dev/editor/validate.ts'
import type { Problem } from '@/dev/editor/validate.ts'
import type { MapSource } from '@/core/content/schema.ts'
import type { MapDef, Vec2 } from '@/core/types.ts'

/** One `edit()` is one undo entry, and this is how many are kept. */
const HISTORY_LIMIT = 20

/**
 * What 4B publishes into a `shallowRef`. Small and **plain** on purpose: `MapDef.flags` is 336
 * numbers rebuilt on every brush stroke, and putting `EditorDoc` itself into Vue's reactivity is
 * `ARCHITECTURE.md` section 5's trap one level down from the world.
 */
export interface EditorSnapshot {
	/** Bumped by every edit, undo and redo. The only thing a watcher needs to compare. */
	revision: number
	problems: Problem[]
	paths: { id: string; lengthTiles: number }[]
	buildablePercent: number
	canUndo: boolean
	canRedo: boolean
}

export interface EditorDoc {
	/** The authored map. Read-only to callers: everything goes through `edit`. */
	readonly source: MapSource
	/** Derived, rebuilt whole on every edit. */
	readonly map: MapDef
	readonly problems: readonly Problem[]
	edit(mutate: (draft: MapSource) => void): void
	undo(): void
	redo(): void
	snapshot(): EditorSnapshot
}

/** Euclidean distance in tiles. */
function distance(a: Vec2, b: Vec2): number {
	return Math.hypot(b.x - a.x, b.y - a.y)
}

/** What `loadMap` will measure the polyline as, which is what `lengthTiles` has to equal. */
export function measurePolyline(waypoints: readonly Vec2[]): number {
	let total = 0
	for (let i = 1; i < waypoints.length; i++) {
		const from = waypoints[i - 1]
		const to = waypoints[i]
		if (from !== undefined && to !== undefined) {
			total += distance(from, to)
		}
	}
	return total
}

/** Decision 2, in one place: the authored length always agrees with the waypoints it came from. */
export function recomputeLengths(source: MapSource): void {
	for (const path of source.paths) {
		path.lengthTiles = measurePolyline(path.waypoints)
	}
}

/**
 * The document, its history and the two derived things nobody may compute a second way.
 *
 * A half-finished map is the normal case, not an error case: one waypoint, no waypoints, no paths
 * at all. `loadMap` survives all three and this must too, so `validateContent` is never called on a
 * live document -- it is the hard gate at import and export only (decision 5). The symptom of
 * getting this wrong is an editor that throws when you delete the second-to-last waypoint, taking
 * the unsaved map with it.
 */
export function createDocument(initial: MapSource): EditorDoc {
	let source = structuredClone(initial)
	recomputeLengths(source)

	let map = loadMap(source)
	let problems = validateEditorMap(source, map)
	let revision = 0

	const undoStack: MapSource[] = []
	const redoStack: MapSource[] = []

	function adopt(next: MapSource): void {
		source = next
		map = loadMap(source)
		problems = validateEditorMap(source, map)
		revision++
	}

	const doc: EditorDoc = {
		get source() {
			return source
		},
		get map() {
			return map
		},
		get problems() {
			return problems
		},

		/**
		 * The draft is a `structuredClone` of the current source, so a mutator may do whatever it
		 * likes to it without the previous state noticing. Cloning per edit rather than diffing is
		 * the right trade at this size -- a `MapSource` is fourteen strings and a handful of
		 * waypoints, and the alternative is an undo system with its own bugs.
		 *
		 * Applied atomically: the new `MapDef` is built before anything is committed, so an edit
		 * that produces a map `loadMap` cannot read (an illegal tile char, a short row) throws and
		 * leaves the document exactly as it was.
		 */
		edit(mutate: (draft: MapSource) => void): void {
			const previous = source
			const draft = structuredClone(source)

			mutate(draft)
			recomputeLengths(draft)

			const nextMap = loadMap(draft)

			source = draft
			map = nextMap
			problems = validateEditorMap(source, map)
			revision++

			undoStack.push(previous)
			if (undoStack.length > HISTORY_LIMIT) {
				undoStack.shift()
			}
			redoStack.length = 0
		},

		undo(): void {
			const previous = undoStack.pop()
			if (previous === undefined) {
				return
			}
			redoStack.push(source)
			adopt(previous)
		},

		redo(): void {
			const next = redoStack.pop()
			if (next === undefined) {
				return
			}
			undoStack.push(source)
			adopt(next)
		},

		snapshot(): EditorSnapshot {
			return {
				revision,
				problems: problems.map(problem => ({ ...problem })),
				paths: map.paths.map(path => ({ id: path.id, lengthTiles: path.lengthTiles })),
				buildablePercent: buildablePercent(map),
				canUndo: undoStack.length > 0,
				canRedo: redoStack.length > 0,
			}
		},
	}

	return doc
}
