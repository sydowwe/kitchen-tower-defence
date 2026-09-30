import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * The persistence fence, through ESLint itself: a component can't reach `data/` or browser storage,
 * and a composable can. Building an `ESLint` with the Vue and TypeScript configs takes seconds, so
 * this spec's timeouts are long on purpose.
 */

const GAME_ROOT = fileURLToPath(new URL('..', import.meta.url))
const SLOW = 60_000

const COMPONENT = 'src/ui/components/Leak.ts'
const COMPOSABLE = 'src/ui/composables/useLeak.ts'
const STORE = 'src/ui/stores/leak.ts'

let eslint: ESLint

beforeAll(() => {
	eslint = new ESLint({
		cwd: GAME_ROOT,
		// The config parses through the TypeScript project service, which refuses a file that isn't on
		// disk. Only the parse is widened; every rule is the real config's.
		overrideConfig: {
			languageOptions: {
				parserOptions: { projectService: { allowDefaultProject: [COMPONENT, COMPOSABLE, STORE] } },
			},
		},
	})
}, SLOW)

async function errorsIn(filePath: string, code: string): Promise<string[]> {
	const [result] = await eslint.lintText(code, { filePath })
	return (result?.messages ?? []).filter(message => message.severity === 2).map(message => message.ruleId ?? '')
}

const IMPORT_DATA = "import { dataLayer } from '@/data/index.ts'\n\nexport const layer = dataLayer()\n"

describe('ui/ and persistence', () => {
	it(
		'errors on a component importing @/data/index.ts',
		async () => {
			expect(await errorsIn(COMPONENT, IMPORT_DATA)).toEqual(['no-restricted-imports'])
		},
		SLOW,
	)

	it(
		'allows the same import in a composable',
		async () => {
			expect(await errorsIn(COMPOSABLE, IMPORT_DATA)).toEqual([])
		},
		SLOW,
	)

	it(
		'errors on localStorage.getItem in a component',
		async () => {
			const code = "export const saved = localStorage.getItem('kd:progress')\n"
			expect(await errorsIn(COMPONENT, code)).toEqual(['no-restricted-globals'])
		},
		SLOW,
	)

	it(
		'errors on window.localStorage.getItem in a component',
		async () => {
			const code = "export const saved = window.localStorage.getItem('kd:progress')\n"
			expect(await errorsIn(COMPONENT, code)).toEqual(['no-restricted-properties'])
		},
		SLOW,
	)

	it(
		'still errors on browser storage in a composable and a store',
		async () => {
			const code = "export const saved = window.sessionStorage.getItem('kd:progress')\n"
			expect(await errorsIn(COMPOSABLE, code)).toEqual(['no-restricted-properties'])
			expect(await errorsIn(STORE, code)).toEqual(['no-restricted-properties'])
		},
		SLOW,
	)
})
