/**
 * The progress record's wire shape. This zod ships to players: it runs on every read. It must not
 * import a `core/content/schema.ts` schema, which would drag the content schemas out of the dev-only
 * branch that lets them tree-shake -- ids are checked against the content arrays instead.
 */

import { z } from 'zod'
import { DIFFICULTIES } from '@/core/content/difficulty.ts'
import { INSTALLATIONS } from '@/core/content/installations.ts'
import { NIGHTS } from '@/core/content/nights.ts'
import { TOWERS } from '@/core/content/towers.ts'
import type { Progress } from '@/core/campaign.ts'
import type { DefId, DifficultyId } from '@/core/types.ts'
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

/** v2 remembers the loadout chosen for each night, keyed by night id. */
export const progressSchemaV2 = z.strictObject({
	...progressSchemaV1.shape,
	loadouts: z.record(z.string(), z.array(z.string())),
})

export type ProgressDtoV2 = z.infer<typeof progressSchemaV2>

/** Every v1 save gets exactly one default: nothing chosen yet, for any night. */
function progressV1ToV2(data: unknown): ProgressDtoV2 {
	return { ...progressSchemaV1.parse(data), loadouts: {} }
}

export function toProgressDto(progress: Progress): ProgressDtoV2 {
	return {
		nightId: progress.nightId,
		groceryMoney: progress.groceryMoney,
		installations: [...progress.installations],
		nightResults: Object.fromEntries(
			Object.entries(progress.nightResults).map(([nightId, record]) => [nightId, { ...record }]),
		),
		difficulty: progress.difficulty,
		loadouts: Object.fromEntries(Object.entries(progress.loadouts).map(([nightId, ids]) => [nightId, [...ids]])),
	}
}

function isNightId(id: string): boolean {
	return NIGHTS.some(night => night.id === id)
}

function isTowerId(id: string): boolean {
	return TOWERS.some(tower => tower.id === id)
}

/**
 * The stored loadouts, less anything the content no longer has: a night key not in `NIGHTS` drops its
 * entry, a tower id not in `TOWERS` drops the id, and an entry left empty drops too. Dropped rather
 * than corrupt, unlike an installation: a remembered loadout is a preference, and `tonightsLoadout`
 * re-checks it on every read anyway.
 */
function knownLoadouts(loadouts: ProgressDtoV2['loadouts']): Record<DefId, DefId[]> {
	const known: Record<DefId, DefId[]> = {}
	for (const [nightId, ids] of Object.entries(loadouts)) {
		const towers = ids.filter(isTowerId)
		if (isNightId(nightId) && towers.length > 0) {
			known[nightId] = towers
		}
	}
	return known
}

function isDifficultyId(id: string): id is DifficultyId {
	return Object.hasOwn(DIFFICULTIES, id)
}

/**
 * Throws on an id the content doesn't have. A renamed id ships with a migration; an unknown
 * installation is never dropped, because dropping it takes back something the player paid for. The
 * one exception is a stored loadout -- see `knownLoadouts`.
 */
export function fromProgressDto(dto: ProgressDtoV2): Progress {
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
		loadouts: knownLoadouts(dto.loadouts),
	}
}

export const progressCodec: Codec<Progress, ProgressDtoV2> = {
	store: 'progress',
	version: 2,
	migrations: { 1: progressV1ToV2 },
	schema: progressSchemaV2,
	toDto: toProgressDto,
	fromDto: fromProgressDto,
}
