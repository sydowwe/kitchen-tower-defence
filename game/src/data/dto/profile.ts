import { z } from 'zod'
import type { Codec } from '@/data/dto/codec.ts'
import type { Profile } from '@/data/ports/index.ts'

export const profileSchemaV1 = z.strictObject({
	displayName: z.string().nullable(),
})

export type ProfileDtoV1 = z.infer<typeof profileSchemaV1>

export function toProfileDto(profile: Profile): ProfileDtoV1 {
	return { displayName: profile.displayName }
}

export function fromProfileDto(dto: ProfileDtoV1): Profile {
	return { displayName: dto.displayName }
}

export const profileCodec: Codec<Profile, ProfileDtoV1> = {
	store: 'profile',
	version: 1,
	migrations: {},
	schema: profileSchemaV1,
	toDto: toProfileDto,
	fromDto: fromProfileDto,
}
