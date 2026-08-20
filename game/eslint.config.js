import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import vuePrettierConfig from '@vue/eslint-config-prettier'

/**
 * This file is the enforcement mechanism for the architecture, not a style tool.
 *
 * Two things it exists to guarantee, from ../analytic-docs/ARCHITECTURE.md sections 1 and 3:
 * core/ is pure and deterministic (no DOM, no Vue, no wall clock, no Math.random), and the
 * dependency direction is one-way (ui -> core, render -> core, core -> nothing). Everything else
 * here keeps one library confined to the one place it belongs. If these rules start collecting
 * eslint-disable comments, the design drifted -- fix the design, not the rule.
 *
 * The style block below is carried over from the AntiProcrastinationApp frontend so both repos
 * read the same way.
 */

const DETERMINISM = 'core/ is deterministic: time is world.tick and durations are tick counts.'
const PURITY = 'core/ is pure TypeScript. No DOM, no browser globals.'
const LAYERING = 'Dependency direction is one-way: core/ imports nothing from render/, ui/ or data/.'

/** Enforces the "@/ alias, never a relative path across directories" rule from CLAUDE.md. */
const noParentRelative = {
	group: ['../*', '../../*', '../../../*'],
	message: 'Import across directories by the @/ alias, never a relative path.',
}

/** Everything core/ and render/ are cut off from. They are plain TypeScript and canvas 2d. */
const appLibraries = [
	'vue',
	'vue/*',
	'vue-router',
	'vue-router/*',
	'@vue/*',
	'@vueuse/*',
	'pinia',
	'pinia/*',
	'vue-i18n',
	'vue-i18n/*',
	'axios',
	'@fortawesome/*',
]

const layersBelowCore = [
	'**/render',
	'**/render/**',
	'**/ui',
	'**/ui/**',
	'**/data',
	'**/data/**',
	'**/dev',
	'**/dev/**',
]

const axiosBan = {
	group: ['axios', 'axios/*'],
	message: 'axios belongs in data/adapters/http/ only. Everything else reaches it through a port (PERSISTENCE.md).',
}

const iconBan = {
	group: ['@fortawesome/free-*', '@fortawesome/fontawesome-svg-core'],
	message: 'Register icons in ui/icons.ts, one by one. Importing icon packs elsewhere defeats tree-shaking.',
}

const dataBan = {
	group: ['**/data', '**/data/**'],
	message: 'UI reaches persistence only through ui/composables/ (ARCHITECTURE.md section 8).',
}

const worldInStoreBan = {
	group: ['**/core/world.ts', '**/core/sim.ts'],
	message:
		'The world never goes in a Pinia store: deep reactivity over hundreds of entities at 60Hz destroys the frame budget, and the world must stay plain and serialisable.',
}

/**
 * Bans that hold everywhere, whatever else a scope adds. `no-restricted-imports` is replaced
 * wholesale by a later config object rather than merged, so every scope has to restate them --
 * which is what this helper is for.
 */
const sharedPaths = [
	{
		name: '@vueuse/core',
		importNames: ['useStorage', 'useLocalStorage', 'useSessionStorage', 'useRafFn'],
		message:
			'Saves go through data/ports, and loop.ts owns the single requestAnimationFrame. Both of these would quietly set up a second one.',
	},
]

function restrict(extraPatterns) {
	return ['error', { patterns: [noParentRelative, ...extraPatterns], paths: sharedPaths }]
}

export default defineConfigWithVueTs(
	{ ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'public/**', '*.min.js'] },

	vueTsConfigs.recommended,

	{
		rules: {
			'vue/multi-word-component-names': 'off',
			'vue/attribute-hyphenation': ['error', 'never'],
			'vue/v-on-event-hyphenation': ['error', 'never'],
			'vue/component-name-in-template-casing': ['error', 'PascalCase'],
			'vue/block-order': ['error', { order: ['template', 'script', 'style'] }],
			'vue/define-macros-order': [
				'error',
				{ order: ['defineProps', 'defineEmits', 'defineModel', 'defineSlots'] },
			],
			'vue/no-unused-refs': 'warn',
			'vue/prop-name-casing': ['error', 'camelCase'],
			'vue/define-emits-declaration': ['error', 'type-based'],
			'vue/define-props-declaration': ['error', 'type-based'],
			'vue/no-v-html': 'warn',
			'vue/no-useless-v-bind': 'error',
			'vue/prefer-true-attribute-shorthand': 'error',
			'vue/prefer-separate-static-class': 'error',
			'vue/eqeqeq': ['error', 'smart'],
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/no-unused-expressions': 'warn',
			'@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
			'no-console': ['off', { allow: ['error', 'warn'] }],
			'prefer-const': 'warn',
			eqeqeq: ['error', 'smart'],
			'func-style': ['error', 'declaration', { allowArrowFunctions: false }],
			'no-restricted-imports': restrict([axiosBan, iconBan]),
		},
	},

	// --- core/ purity and determinism ---------------------------------------------------------
	{
		files: ['src/core/**/*.ts'],
		rules: {
			'no-restricted-globals': [
				'error',
				{ name: 'Date', message: DETERMINISM },
				{ name: 'performance', message: DETERMINISM },
				{ name: 'window', message: PURITY },
				{ name: 'document', message: PURITY },
				{ name: 'navigator', message: PURITY },
				{ name: 'localStorage', message: PURITY },
				{ name: 'sessionStorage', message: PURITY },
				{ name: 'fetch', message: PURITY },
				{ name: 'requestAnimationFrame', message: PURITY },
			],
			'no-restricted-properties': [
				'error',
				{
					object: 'Math',
					property: 'random',
					message: 'All randomness goes through world.rng, so a seed reproduces a session.',
				},
				{ object: 'Date', property: 'now', message: DETERMINISM },
				{ object: 'performance', property: 'now', message: DETERMINISM },
			],
			'no-restricted-syntax': ['error', { selector: "NewExpression[callee.name='Date']", message: DETERMINISM }],
			'no-restricted-imports': restrict([
				{ group: appLibraries, message: LAYERING },
				{ group: layersBelowCore, message: LAYERING },
			]),
		},
	},

	// --- render/ reads core, knows nothing about the UI ---------------------------------------
	{
		files: ['src/render/**/*.ts'],
		rules: {
			'no-restricted-imports': restrict([
				{ group: appLibraries, message: 'render/ is plain canvas 2d. It imports core/ and nothing else.' },
				{ group: ['**/ui', '**/ui/**', '**/data', '**/data/**'], message: LAYERING },
			]),
		},
	},

	// --- ui/ reaches persistence only through composables -------------------------------------
	{
		files: ['src/ui/**/*.{ts,vue}'],
		rules: { 'no-restricted-imports': restrict([axiosBan, iconBan, dataBan]) },
	},
	{
		// The sanctioned exception: composables are the layer that talks to persistence. They go
		// through data/index.ts (the one adapter-selection switch) and may name a port for typing,
		// but never an adapter or a wire DTO.
		files: ['src/ui/composables/**/*.ts'],
		rules: {
			'no-restricted-imports': restrict([
				axiosBan,
				iconBan,
				{
					group: ['**/data/adapters/**', '**/data/dto/**'],
					message: 'Import @/data (adapter selection) or a port type. Never an adapter or a wire DTO.',
				},
			]),
		},
	},
	{
		// Stores hold metagame, session and settings state. Not the world, not the view model.
		files: ['src/ui/stores/**/*.ts'],
		rules: { 'no-restricted-imports': restrict([axiosBan, iconBan, dataBan, worldInStoreBan]) },
	},
	{
		// The one file allowed to touch an icon package.
		files: ['src/ui/icons.ts'],
		rules: { 'no-restricted-imports': restrict([axiosBan, dataBan]) },
	},

	// --- data/ owns the HTTP client ------------------------------------------------------------
	{
		files: ['src/data/adapters/**/*.ts'],
		rules: { 'no-restricted-imports': restrict([iconBan]) },
	},

	// dev/ is deliberately exempt from determinism: the map editor and the balance harness are
	// allowed to be impure, and they are not shipped in production builds.
	{
		files: ['src/dev/**/*.{ts,vue}', 'tests/**/*.ts', '*.config.ts'],
		rules: {
			'no-restricted-globals': 'off',
			'no-restricted-properties': 'off',
			'no-restricted-syntax': 'off',
		},
	},

	vuePrettierConfig,
)
