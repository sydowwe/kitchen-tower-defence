/**
 * The one applier (step 23D, decision 7): every knob in the settings record, pushed to where it takes
 * effect. `ui/App.vue` calls it from a single watch on the settings store, once on load and again on
 * every change. Not a store plugin and not per component -- with two appliers, a slider moves the sound
 * on one screen and not on another.
 */

import { setVolume, type Bus as AudioBus } from '@/audio/index.ts'
import { setDamageNumbers, setPaletteVariant, setScreenShake, type PaletteVariant } from '@/render/index.ts'
import { BUSES, type Bus, type Palette, type Settings } from '@/ui/composables/useSettings.ts'

/**
 * `data/settings.ts` restates `audio/`'s bus union and `render/`'s palette union, because `data/` may
 * import neither. This is where they meet. Each `satisfies` needs every member of **both** unions as a
 * key, so either side gaining one without the other is a type error here -- not a slider that silently
 * never saves, or a palette that silently never applies.
 */
const BUS_OF = {
	master: 'master',
	effects: 'effects',
	ambience: 'ambience',
} as const satisfies Record<Bus, AudioBus> & Record<AudioBus, Bus>

const VARIANT_OF = {
	standard: 'standard',
	colourblind: 'colourblind',
} as const satisfies Record<Palette, PaletteVariant> & Record<PaletteVariant, Palette>

export function applySettings(settings: Settings): void {
	// Held by the engine until there is a context to apply them to, so the title's sliders carry into
	// the night.
	for (const bus of BUSES) {
		setVolume(BUS_OF[bus], settings.volumes[bus])
	}
	setScreenShake(settings.screenShake)
	setDamageNumbers(settings.damageNumbers)
	setPaletteVariant(VARIANT_OF[settings.palette])
	// The CSS half of the palette: `ui/App.vue`'s `:root[data-palette='colourblind']`.
	document.documentElement.dataset.palette = settings.palette
}
