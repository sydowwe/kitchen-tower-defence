import type { z } from 'zod'

/** The stores that keep a versioned record. Also the last segment of a record's key. */
export type StoreName = 'profile' | 'progress' | 'settings'

/**
 * Everything one store needs to turn a stored record into its internal type and back.
 *
 * `migrations[n]` takes a version-`n` DTO to version `n + 1`. Every store is at v1 with the chain
 * empty; a v2 adds `migrations[1]` and bumps `version`, and a save from any older build walks the
 * chain up. `fromDto` throws on anything the schema can't see -- an id no longer in the content.
 */
export interface Codec<T, Dto> {
	store: StoreName
	version: number
	migrations: Readonly<Record<number, (data: unknown) => unknown>>
	schema: z.ZodType<Dto>
	toDto(value: T): Dto
	fromDto(dto: Dto): T
}
