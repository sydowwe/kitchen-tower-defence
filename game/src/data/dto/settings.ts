import { z } from 'zod'
import { ACTIONS, BUSES, defaultBindings, defaultSettings, PALETTES, rebind } from '@/data/settings.ts'
import type { Codec } from '@/data/dto/codec.ts'
import type { Bindings, Settings } from '@/data/ports/index.ts'

/** No 0: a restored 0 is a night that opens frozen with no pause shown. */
export const settingsSchemaV1 = z.strictObject({
	speed: z.union([z.literal(1), z.literal(2), z.literal(3)]),
})

export type SettingsDtoV1 = z.infer<typeof settingsSchemaV1>

const volume = z.number().min(0).max(1)

/**
 * v2 is every knob step 23 has. `volumes` and `bindings` are records keyed by string rather than
 * strict objects, so a bus or an action this build doesn't know drops on read instead of sending the
 * whole record to `:corrupt:`. A lost preference is harmless; a lost record loses all of them.
 */
export const settingsSchemaV2 = z.strictObject({
	...settingsSchemaV1.shape,
	volumes: z.record(z.string(), volume),
	screenShake: z.boolean(),
	damageNumbers: z.boolean(),
	palette: z.enum(PALETTES),
	bindings: z.record(z.string(), z.string()),
	seenHints: z.array(z.string()),
})

export type SettingsDtoV2 = z.infer<typeof settingsSchemaV2>

export function toSettingsDto(settings: Settings): SettingsDtoV2 {
	return {
		speed: settings.speed,
		volumes: { ...settings.volumes },
		screenShake: settings.screenShake,
		damageNumbers: settings.damageNumbers,
		palette: settings.palette,
		bindings: { ...settings.bindings },
		seenHints: [...settings.seenHints],
	}
}

/** A v1 save keeps its speed and gets every other field from `defaultSettings()`, the new player's. */
function settingsV1ToV2(data: unknown): SettingsDtoV2 {
	return { ...toSettingsDto(defaultSettings()), ...settingsSchemaV1.parse(data) }
}

/**
 * The stored bindings over the defaults, one `rebind` at a time: an unknown action drops, a known one
 * missing keeps its default, and two actions stored on one key are swapped apart rather than both
 * answering it. Whatever was stored, the result is every action on a key of its own.
 */
function knownBindings(stored: SettingsDtoV2['bindings']): Bindings {
	let bindings = defaultBindings()
	for (const action of ACTIONS) {
		const code = stored[action]
		if (code !== undefined) {
			bindings = rebind(bindings, action, code)
		}
	}
	return bindings
}

export function fromSettingsDto(dto: SettingsDtoV2): Settings {
	const volumes = defaultSettings().volumes
	for (const bus of BUSES) {
		volumes[bus] = dto.volumes[bus] ?? volumes[bus]
	}
	return {
		speed: dto.speed,
		volumes,
		screenShake: dto.screenShake,
		damageNumbers: dto.damageNumbers,
		palette: dto.palette,
		bindings: knownBindings(dto.bindings),
		seenHints: [...dto.seenHints],
	}
}

export const settingsCodec: Codec<Settings, SettingsDtoV2> = {
	store: 'settings',
	version: 2,
	migrations: { 1: settingsV1ToV2 },
	schema: settingsSchemaV2,
	toDto: toSettingsDto,
	fromDto: fromSettingsDto,
}
