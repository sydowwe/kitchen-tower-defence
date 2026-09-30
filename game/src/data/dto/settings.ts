import { z } from 'zod'
import type { Codec } from '@/data/dto/codec.ts'
import type { Settings } from '@/data/ports/index.ts'

/** No 0: a restored 0 is a night that opens frozen with no pause shown. */
export const settingsSchemaV1 = z.strictObject({
	speed: z.union([z.literal(1), z.literal(2), z.literal(3)]),
})

export type SettingsDtoV1 = z.infer<typeof settingsSchemaV1>

export function toSettingsDto(settings: Settings): SettingsDtoV1 {
	return { speed: settings.speed }
}

export function fromSettingsDto(dto: SettingsDtoV1): Settings {
	return { speed: dto.speed }
}

export const settingsCodec: Codec<Settings, SettingsDtoV1> = {
	store: 'settings',
	version: 1,
	migrations: {},
	schema: settingsSchemaV1,
	toDto: toSettingsDto,
	fromDto: fromSettingsDto,
}
