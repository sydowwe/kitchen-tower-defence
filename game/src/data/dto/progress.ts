/**
 * The progress record's wire shape. This zod ships to players: it runs on every read. It must not
 * import a `core/content/schema.ts` schema, which would drag the content schemas out of the dev-only
 * branch that lets them tree-shake -- ids are checked against the content arrays instead.
 */

import { z } from 'zod'
import { DIFFICULTIES } from '@/core/content/difficulty.ts'
import { ENDLESS_NIGHTS, isEndlessNightId } from '@/core/content/endless.ts'
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

/**
 * v3 carries the lifetime record: the tiers cleared, and the endless bests per tier and map. Loadout
 * keys may now be endless night ids as well.
 */
export const progressSchemaV3 = z.strictObject({
	...progressSchemaV2.shape,
	cleared: z.array(z.string()),
	endlessBests: z.record(z.string(), z.record(z.string(), count)),
})

export type ProgressDtoV3 = z.infer<typeof progressSchemaV3>

/** Every v1 save gets exactly one default: nothing chosen yet, for any night. */
function progressV1ToV2(data: unknown): ProgressDtoV2 {
	return { ...progressSchemaV1.parse(data), loadouts: {} }
}

/** A v2 save that already finished the campaign keeps its clear, and with it endless and the next tier. */
function progressV2ToV3(data: unknown): ProgressDtoV3 {
	const v2 = progressSchemaV2.parse(data)
	return { ...v2, cleared: v2.nightId === null ? [v2.difficulty] : [], endlessBests: {} }
}

export function toProgressDto(progress: Progress): ProgressDtoV3 {
	return {
		nightId: progress.nightId,
		groceryMoney: progress.groceryMoney,
		installations: [...progress.installations],
		nightResults: Object.fromEntries(
			Object.entries(progress.nightResults).map(([nightId, record]) => [nightId, { ...record }]),
		),
		difficulty: progress.difficulty,
		loadouts: Object.fromEntries(Object.entries(progress.loadouts).map(([nightId, ids]) => [nightId, [...ids]])),
		cleared: [...progress.cleared],
		endlessBests: Object.fromEntries(
			Object.entries(progress.endlessBests).map(([tier, byMap]) => [tier, { ...byMap }]),
		),
	}
}

/** A campaign night. The next night to play and every result are keyed by one of these. */
function isNightId(id: string): boolean {
	return NIGHTS.some(night => night.id === id)
}

/** What a stored loadout may be keyed by: a campaign night or an endless run's. */
function isLoadoutKey(id: string): boolean {
	return isNightId(id) || isEndlessNightId(id)
}

function isEndlessMapId(id: string): boolean {
	return ENDLESS_NIGHTS.some(night => night.mapId === id)
}

function isTowerId(id: string): boolean {
	return TOWERS.some(tower => tower.id === id)
}

/**
 * The stored loadouts, less anything the content no longer has: a key that is neither a campaign nor
 * an endless night drops its entry, a tower id not in `TOWERS` drops the id, and an entry left empty
 * drops too. Dropped rather than corrupt, unlike an installation: a remembered loadout is a
 * preference, and `tonightsLoadout` and `endlessLoadout` re-check it on every read anyway.
 */
function knownLoadouts(loadouts: ProgressDtoV3['loadouts']): Record<DefId, DefId[]> {
	const known: Record<DefId, DefId[]> = {}
	for (const [nightId, ids] of Object.entries(loadouts)) {
		const towers = ids.filter(isTowerId)
		if (isLoadoutKey(nightId) && towers.length > 0) {
			known[nightId] = towers
		}
	}
	return known
}

function isDifficultyId(id: string): id is DifficultyId {
	return Object.hasOwn(DIFFICULTIES, id)
}

/** The tiers cleared, in order, a repeat dropped. Throws on one that is not a tier. */
function knownClears(cleared: ProgressDtoV3['cleared']): DifficultyId[] {
	const known: DifficultyId[] = []
	for (const id of cleared) {
		if (!isDifficultyId(id)) {
			throw new Error(`cleared an unknown difficulty '${id}'`)
		}
		if (!known.includes(id)) {
			known.push(id)
		}
	}
	return known
}

/**
 * The endless bests. One under an unknown tier throws; one for a map with no endless run drops, like a
 * loadout's unknown tower -- there is nothing left to show it against -- and a tier left empty drops too.
 */
function knownBests(bests: ProgressDtoV3['endlessBests']): Progress['endlessBests'] {
	const known: Progress['endlessBests'] = {}
	for (const [tier, byMap] of Object.entries(bests)) {
		if (!isDifficultyId(tier)) {
			throw new Error(`an endless best under unknown difficulty '${tier}'`)
		}
		const maps = Object.fromEntries(Object.entries(byMap).filter(([mapId]) => isEndlessMapId(mapId)))
		if (Object.keys(maps).length > 0) {
			known[tier] = maps
		}
	}
	return known
}

/**
 * Throws on an id the content doesn't have. A renamed id ships with a migration; an unknown
 * installation is never dropped, because dropping it takes back something the player paid for. The
 * exceptions are a stored loadout and an endless best -- see `knownLoadouts` and `knownBests`.
 */
export function fromProgressDto(dto: ProgressDtoV3): Progress {
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
		cleared: knownClears(dto.cleared),
		endlessBests: knownBests(dto.endlessBests),
	}
}

export const progressCodec: Codec<Progress, ProgressDtoV3> = {
	store: 'progress',
	version: 3,
	migrations: { 1: progressV1ToV2, 2: progressV2ToV3 },
	schema: progressSchemaV3,
	toDto: toProgressDto,
	fromDto: fromProgressDto,
}
