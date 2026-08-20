import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	plugins: [vue()],
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)),
		},
	},
	test: {
		// Vitest covers core/ only. See analytic-docs/ARCHITECTURE.md section 7:
		// renderer bugs are visible, so they are not worth testing.
		include: ['tests/**/*.spec.ts', 'src/core/**/*.spec.ts'],
		environment: 'node',
		// Remove once step 1 item 9 lands the loop test -- from then on an empty run is a mistake.
		passWithNoTests: true,
	},
})
