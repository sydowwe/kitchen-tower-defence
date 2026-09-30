/**
 * Drawn sprites for the towers, enemies and crumb piles that have one. Everything without a file
 * stays an emoji.
 *
 * **A sprite is found by its file name, not by a table.** `assets/sprites/tower/salt_shaker_128.png`
 * is the tower whose id is `saltShaker`, and `crumb/large_128.png` is the `large` crumb band, so
 * adding a sprite is adding the file -- the layout and the naming rule are in
 * analytic-docs/SPRITES.md. A file that matches no id is reported in dev rather than dropped silently.
 *
 * Looked up by **glyph**, not by id, because the glyph is what every layer already hands the cache:
 * the tower on its tile, the placement ghost, a shoved enemy's afterimages and a thief's trail all
 * pick the sprite up with no change of their own. The one side effect is that a map's decor glyph
 * equal to a tower's draws as that tower's sprite, which is the same likeness it had as an emoji.
 *
 * `core/` stays untouched: its defs keep their `glyph`, and the emoji remains the fallback for a file
 * that has not loaded yet or failed to.
 */

import { ENEMIES } from '@/core/content/enemies.ts'
import { TOWERS } from '@/core/content/towers.ts'
import { CRUMB_BANDS } from '@/render/crumbBands.ts'

interface Sprited {
	id: string
	glyph: string
}

/** The folder under `assets/sprites/` -> what its file names are matched against. */
const ROSTERS: Record<string, readonly Sprited[]> = { tower: TOWERS, enemy: ENEMIES, crumb: CRUMB_BANDS }

/**
 * The states a tower can be drawn in besides its default, each carried by a file-name suffix:
 * `mousetrap_sprung_128.png` is the Mousetrap while it rearms. `layers/towers.ts` decides when a
 * state applies; a state with no file draws the default sprite.
 */
export type SpriteState = 'sprung' | 'damaged'

const STATES: readonly SpriteState[] = ['sprung', 'damaged']

/** `…/sprites/<roster>/<snake_id>[_<state>]_128.png`. The `_128` is the export size the brief asks for. */
const FILE_PATTERN = /\/sprites\/([a-z]+)\/([a-z0-9_]+)_128\.png$/

const FILES = import.meta.glob<string>('@/assets/sprites/*/*_128.png', { eager: true, import: 'default' })

/** Glyph (or a state's key) -> image, filled in as each one finishes decoding. */
const loaded = new Map<string, HTMLImageElement>()

/**
 * State -> glyph -> the key its loaded sprite is under. Built as files land so `stateGlyph`, which
 * runs per tower per frame, is two map reads and allocates nothing.
 */
const loadedStates = new Map<SpriteState, Map<string, string>>()

let loading: Promise<void> | null = null

interface SpriteFile {
	/** What the image is stored and cached under: the glyph, or for a state `glyph#state`. */
	key: string
	glyph: string
	state: SpriteState | null
}

function camelCase(snake: string): string {
	return snake.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase())
}

/**
 * What the file at `path` is, or null if its name matches no def. The whole name is tried as an id
 * first, so an id that happened to end in a state's name would still match itself.
 *
 * A state's key is never a real emoji, so it can only reach the glyph cache through `stateGlyph`,
 * which hands it out only once the file has loaded.
 */
function describe(path: string): SpriteFile | null {
	const match = FILE_PATTERN.exec(path)
	if (match === null) {
		return null
	}
	const roster = ROSTERS[match[1] ?? '']
	const name = match[2] ?? ''
	const whole = roster?.find(def => def.id === camelCase(name))
	if (whole !== undefined) {
		return { key: whole.glyph, glyph: whole.glyph, state: null }
	}
	for (const state of STATES) {
		if (name.endsWith(`_${state}`)) {
			const base = camelCase(name.slice(0, -(state.length + 1)))
			const def = roster?.find(candidate => candidate.id === base)
			if (def !== undefined) {
				return { key: `${def.glyph}#${state}`, glyph: def.glyph, state }
			}
		}
	}
	return null
}

async function load(file: SpriteFile, url: string): Promise<void> {
	const image = new Image()
	image.src = url
	try {
		await image.decode()
	} catch {
		console.error(`[render] sprite failed to load, keeping the emoji: ${url}`)
		return
	}
	loaded.set(file.key, image)
	if (file.state !== null) {
		let byGlyph = loadedStates.get(file.state)
		if (byGlyph === undefined) {
			byGlyph = new Map()
			loadedStates.set(file.state, byGlyph)
		}
		byGlyph.set(file.glyph, file.key)
	}
}

/**
 * Starts decoding every sprite, once; later calls return the same promise. Nothing has to await it:
 * `getSprite` answers `undefined` until a file is ready, the cache keeps drawing the emoji until
 * then, and the first frame after it lands draws the sprite (see `getGlyph`).
 */
export function loadSprites(): Promise<void> {
	if (loading === null) {
		const pending: Promise<void>[] = []
		for (const [path, url] of Object.entries(FILES)) {
			const file = describe(path)
			if (file === null) {
				if (import.meta.env.DEV) {
					console.warn(`[render] sprite matches no tower, enemy or crumb band, ignored: ${path}`)
				}
				continue
			}
			pending.push(load(file, url))
		}
		loading = Promise.all(pending).then(() => undefined)
	}
	return loading
}

/** The decoded sprite for `glyph`, or `undefined` while it has none -- not yet loaded, or no file. */
export function getSprite(glyph: string): HTMLImageElement | undefined {
	return loaded.get(glyph)
}

/**
 * What to hand the glyph cache to draw `glyph` in `state`: the state's sprite once it has loaded,
 * otherwise `glyph` itself -- the default sprite, or the emoji. A caller that draws its own version of
 * a state when there is no art for it compares the result with `glyph` to tell which it got.
 */
export function stateGlyph(glyph: string, state: SpriteState): string {
	return loadedStates.get(state)?.get(glyph) ?? glyph
}

/** Glyph -> bundled URL of its default sprite. Built on first ask; needs nothing to have loaded. */
let urls: Map<string, string> | null = null

/**
 * The bundled URL of `glyph`'s default sprite, or `undefined` if it has none. For the HUD, which
 * draws a sprite as an `<img>` and lets the browser load it -- see `ui/components/EntityGlyph.vue`.
 */
export function spriteUrl(glyph: string): string | undefined {
	if (urls === null) {
		urls = new Map()
		for (const [path, url] of Object.entries(FILES)) {
			const file = describe(path)
			if (file !== null && file.state === null) {
				urls.set(file.glyph, url)
			}
		}
	}
	return urls.get(glyph)
}
