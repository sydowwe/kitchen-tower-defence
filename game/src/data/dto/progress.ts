/**
 * The progress record's wire shape. This zod ships to players: it runs on every read. It must not
 * import a `core/content/schema.ts` schema, which would drag the content schemas out of the dev-only
 * branch that lets them tree-shake -- ids are checked against the content arrays instead.
 */

import { z } from 'zod'
import { DIFFICULTIES } from '@/core/content/difficulty.ts'
import { INSTALLATIONS } from '@/core/content/installations.ts'
import { NIGHTS } from '@/core/content/nights.ts'
import type { Progress } from '@/core/campaign.ts'
import type { DifficultyId } from '@/core/types.ts'
import type { Codec } from '@/data/dto/codec.ts'

const count = z.number().int().nonnegative()

const nightRecordSchema = z.strictObject({
	attempts: count,
	wins: count,
	bestGroceryMoney: count,
})

export const progressSchemaV1 = z.strictObject({
	nightId: z.string().nullable(),
	groceryMoney: count,
	installations: z.array(z.string()),
	nightResults: z.record(z.string(), nightRecordSchema),
	difficulty: z.string(),
})

export type ProgressDtoV1 = z.infer<typeof progressSchemaV1>

export function toProgressDto(progress: Progress): ProgressDtoV1 {
	return {
		nightId: progress.nightId,
		groceryMoney: progress.groceryMoney,
		installations: [...progress.installations],
		nightResults: Object.fromEntries(
			Object.entries(progress.nightResults).map(([nightId, record]) => [nightId, { ...record }]),
		),
		difficulty: progress.difficulty,
	}
}

function isNightId(id: string): boolean {
	return NIGHTS.some(night => night.id === id)
}

function isDifficultyId(id: string): id is DifficultyId {
	return Object.hasOwn(DIFFICULTIES, id)
}

/**
 * Throws on an id the content doesn't have. A renamed id ships with a migration; an unknown
 * installation is never dropped, because dropping it takes back something the player paid for.
 */
export function fromProgressDto(dto: ProgressDtoV1): Progress {
	if (dto.nightId !== null && !isNightId(dto.nightId)) {
		throw new Error(`unknown night id '${dto.nightId}'`)
	}
	for (const nightId of Object.keys(dto.nightResults)) {
		if (!isNightId(nightId)) {
			throw new Error(`result for unknown night id '${nightId}'`)
		}
	}
	for (const id of dto.installations) {
		if (!INSTALLATIONS.some(installation => installation.id === id)) {
			throw new Error(`unknown installation id '${id}'`)
		}
	}
	if (new Set(dto.installations).size !== dto.installations.length) {
		throw new Error('an installation is owned twice')
	}
	if (!isDifficultyId(dto.difficulty)) {
		throw new Error(`unknown difficulty '${dto.difficulty}'`)
	}

	return {
		nightId: dto.nightId,
		groceryMoney: dto.groceryMoney,
		installations: [...dto.installations],
		nightResults: Object.fromEntries(
			Object.entries(dto.nightResults).map(([nightId, record]) => [nightId, { ...record }]),
		),
		difficulty: dto.difficulty,
	}
}

export const progressCodec: Codec<Progress, ProgressDtoV1> = {
	store: 'progress',
	version: 1,
	migrations: {},
	schema: progressSchemaV1,
	toDto: toProgressDto,
	fromDto: fromProgressDto,
}
